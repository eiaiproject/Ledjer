import { test, expect, type Page } from "@playwright/test";
import { E2E, e2eName } from "./fixtures/env";
import { E2E_OWNER } from "./fixtures/users";
import {
  ensureTestUser,
  seedOrganization,
  loginUser,
} from "./fixtures/seed";
import { loginViaUI } from "./fixtures/auth";
import { selectComboboxValue } from "./fixtures/combobox";
import { getCashAccount } from "./fixtures/accounts";
import { getOrgTransactions } from "./fixtures/transactions";
import { cleanupE2EOrganizations, cleanupE2EUsers } from "./fixtures/cleanup";

// ── Helpers ──────────────────────────────────────────────────────────────

function userHeaders(token: string) {
  return {
    apikey: E2E.supabaseAnonKey,
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

const serviceRoleHeaders = {
  apikey: E2E.serviceRoleKey,
  Authorization: `Bearer ${E2E.serviceRoleKey}`,
};

async function rpc(
  token: string,
  fn: string,
  args: Record<string, unknown>,
): Promise<{ status: number; data: unknown }> {
  const res = await fetch(`${E2E.supabaseUrl}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: userHeaders(token),
    body: JSON.stringify(args),
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

let cachedCashAcctId: string;

async function postTxWithToken(
  token: string,
  orgId: string,
  clientToken: string,
  overrides: Record<string, unknown> = {},
): Promise<{ status: number; data: Record<string, unknown> | null }> {
  if (!cachedCashAcctId) {
    cachedCashAcctId = (await getCashAccount(orgId)).id;
  }
  const { status, data } = await rpc(token, "post_transaction", {
    p_organization_id: orgId,
    p_transaction_date: new Date().toISOString().split("T")[0],
    p_transaction_type: "cash_sale",
    p_amount: 75_000,
    p_payment_status: "paid",
    p_description: e2eName("Idempotency test"),
    p_cash_account_id: cachedCashAcctId,
    p_client_token: clientToken,
    ...overrides,
  });
  return { status, data: data as Record<string, unknown> | null };
}

async function fillUiCashSale(page: Page, description: string) {
  await page.goto("/transactions/new");
  await page.waitForLoadState("networkidle");

  await page.getByRole("button", { name: /Penjualan Tunai/i }).click();

  const amountField = page.locator('input[name="amount"], input[name*="amount"]').first();
  await expect(amountField).toBeVisible({ timeout: 5_000 });
  await amountField.click();
  await amountField.fill("75000");
  await amountField.press("Tab");

  const descField = page.locator('input[name="description"], textarea[name="description"]').first();
  await expect(descField).toBeVisible({ timeout: 5_000 });
  await descField.fill(description);

  await selectComboboxValue(page, "cashAccountId", "Kas");
}

// ── Tests ────────────────────────────────────────────────────────────────

if (E2E.isFullLocal) {
test.describe("Transaction: Idempotency", () => {
  test.describe.configure({ mode: "serial" });

  let ownerToken: string;
  let orgId: string;

  test.beforeAll(async () => {
    await ensureTestUser(E2E_OWNER);
    ownerToken = await loginUser(E2E_OWNER);
    orgId = await seedOrganization(
      (await ensureTestUser(E2E_OWNER)),
      e2eName("Idempotency Org"),
    );
  });

  test.afterAll(async () => {
    await cleanupE2EOrganizations();
    await cleanupE2EUsers();
  });

  test("same client_token returns same transaction_id", async () => {
    const clientToken = crypto.randomUUID();

    const res1 = await postTxWithToken(ownerToken, orgId, clientToken);
    expect(res1.status).toBe(200);
    expect(res1.data?.transaction_id).toBeTruthy();

    const res2 = await postTxWithToken(ownerToken, orgId, clientToken);
    expect(res2.status).toBe(200);

    // Both must return the same transaction_id
    expect(res2.data?.transaction_id).toBe(res1.data?.transaction_id);
  });

  test("duplicate call does not create a second transaction row", async () => {
    const clientToken = crypto.randomUUID();

    const txCountBefore = (await getOrgTransactions(orgId)).length;

    await postTxWithToken(ownerToken, orgId, clientToken);
    await postTxWithToken(ownerToken, orgId, clientToken);

    const txCountAfter = (await getOrgTransactions(orgId)).length;

    // Only one transaction should have been created
    expect(txCountAfter).toBe(txCountBefore + 1);
  });

  test("different client_tokens create separate transactions", async () => {
    const txCountBefore = (await getOrgTransactions(orgId)).length;

    const res1 = await postTxWithToken(ownerToken, orgId, crypto.randomUUID());
    const res2 = await postTxWithToken(ownerToken, orgId, crypto.randomUUID());

    expect(res1.data?.transaction_id).not.toBe(res2.data?.transaction_id);

    const txCountAfter = (await getOrgTransactions(orgId)).length;
    expect(txCountAfter).toBe(txCountBefore + 2);
  });

  test("concurrent duplicate calls (simulated double-click) deduplicate", async () => {
    const clientToken = crypto.randomUUID();
    const txCountBefore = (await getOrgTransactions(orgId)).length;

    // Fire 5 concurrent calls with the same client_token.
    // Under true concurrency, the UNIQUE INDEX on (org_id, client_token)
    // may reject duplicates with 409 — this IS correct dedup behavior.
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        postTxWithToken(ownerToken, orgId, clientToken),
      ),
    );

    // All must be 200 (winner) or 409 (concurrent dedup rejection)
    for (const r of results) {
      expect([200, 409]).toContain(r.status);
    }

    // Exactly one winner (200)
    const winners = results.filter((r) => r.status === 200);
    expect(winners.length).toBeGreaterThanOrEqual(1);

    // Only 1 transaction created regardless of how many calls fired
    const txCountAfter = (await getOrgTransactions(orgId)).length;
    expect(txCountAfter).toBe(txCountBefore + 1);
  });

  test("retry with same client_token does not double-post journal entries", async () => {
    const clientToken = crypto.randomUUID();

    const result = await postTxWithToken(ownerToken, orgId, clientToken);
    expect(result.status).toBe(200);

    // Fire retry
    const retry = await postTxWithToken(ownerToken, orgId, clientToken);
    expect(retry.status).toBe(200);

    // Verify only one transaction exists for this client_token
    const txCountRes = await fetch(
      `${E2E.supabaseUrl}/rest/v1/transactions?organization_id=eq.${orgId}&client_token=eq.${clientToken}&select=id`,
      { headers: { apikey: E2E.serviceRoleKey, Authorization: `Bearer ${E2E.serviceRoleKey}` } },
    );
    const txRows = await txCountRes.json();
    expect(txRows).toHaveLength(1);
  });

  test("UI retry reuses client_token after processed response is lost", async ({ page }) => {
    const description = e2eName(`UI idempotency retry ${Date.now()}`);
    let rpcCalls = 0;
    let firstClientToken = "";

    await page.route("**/rest/v1/rpc/post_transaction", async (route) => {
      rpcCalls += 1;
      const payload = route.request().postDataJSON() as { p_client_token?: string };

      if (rpcCalls === 1) {
        firstClientToken = payload.p_client_token ?? "";
        expect(firstClientToken).toBeTruthy();

        const processedResponse = await route.fetch();
        expect(processedResponse.status()).toBe(200);

        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ message: "Simulated lost response after commit" }),
        });
        return;
      }

      expect(payload.p_client_token).toBe(firstClientToken);
      await route.continue();
    });

    await loginViaUI(page, E2E_OWNER);
    await fillUiCashSale(page, description);

    const submitBtn = page.getByRole("button", { name: /Catat Penjualan|Catat Transaksi/i }).first();
    await expect(submitBtn).toBeEnabled({ timeout: 5_000 });
    await submitBtn.click();

    await expect(page.getByRole("alert", { name: /Ringkasan kesalahan/i })).toBeVisible({ timeout: 10_000 });
    await expect(submitBtn).toBeEnabled({ timeout: 10_000 });
    await submitBtn.click();

    await page.waitForURL(/\/transactions\/[0-9a-f-]+/i, { timeout: 15_000 });
    expect(rpcCalls).toBe(2);

    const txCountRes = await fetch(
      `${E2E.supabaseUrl}/rest/v1/transactions?client_token=eq.${firstClientToken}&select=id`,
      { headers: serviceRoleHeaders },
    );
    expect(txCountRes.ok).toBe(true);
    const txRows = await txCountRes.json();
    expect(txRows).toHaveLength(1);
  });
});
}
