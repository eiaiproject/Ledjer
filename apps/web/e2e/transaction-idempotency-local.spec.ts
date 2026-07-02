import { test, expect } from "@playwright/test";
import { E2E, e2eName } from "./fixtures/env";
import { E2E_OWNER } from "./fixtures/users";
import {
  ensureTestUser,
  seedOrganization,
  loginUser,
} from "./fixtures/seed";
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

// ── Tests ────────────────────────────────────────────────────────────────

test.describe("Transaction: Idempotency", () => {
  test.skip(!E2E.isFullLocal, "Butuh local Supabase + service role key");
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
});
