import { test, expect } from "@playwright/test";
import { E2E } from "./fixtures/env";
import { loginViaUI } from "./fixtures/auth";
import { seedTransaction } from "./fixtures/seed";

/**
 * Void/reversal transaction E2E tests.
 * Verifies: void controls are visible, void requires reason, and void succeeds.
 */

const SR_HEADERS = {
  apikey: E2E.serviceRoleKey,
  Authorization: `Bearer ${E2E.serviceRoleKey}`,
  "Content-Type": "application/json",
};

async function getOrgId(): Promise<string> {
  const seedOrgName = encodeURIComponent("[E2E] Toko Otomatis");
  const res = await fetch(
    `${E2E.supabaseUrl}/rest/v1/organizations?name=eq.${seedOrgName}&select=id&limit=1`,
    { headers: SR_HEADERS },
  );
  if (!res.ok) throw new Error(`Failed to fetch seeded organization: ${res.status}`);
  const data = await res.json();
  return data[0]?.id || "";
}

async function createPostedTransaction(description: string): Promise<string> {
  const orgId = await getOrgId();
  if (!orgId) throw new Error("Seeded organization not found for void E2E test.");
  return seedTransaction(orgId, { description });
}

test.describe("Void transaction", () => {
  test.beforeEach(async ({ page }) => {
    if (!E2E.hasServiceRole) {
      test.skip(true, "Requires E2E_SUPABASE_SERVICE_ROLE_KEY to create isolated posted transactions.");
    }
    await loginViaUI(page);
    await expect(page).toHaveURL(/\/dashboard|\/onboarding/);
  });

  test("void button is visible on posted transaction detail", async ({ page }) => {
    const transactionId = await createPostedTransaction("[E2E] Void button visibility");

    await page.goto(`/transactions/${transactionId}`);
    await page.waitForLoadState("networkidle");

    const voidBtn = page.getByRole("button", { name: /batalkan|void/i });
    await expect(voidBtn).toBeVisible({ timeout: 10_000 });
  });

  test("void requires reason — empty reason is rejected", async ({ page }) => {
    const transactionId = await createPostedTransaction("[E2E] Void reason validation");

    await page.goto(`/transactions/${transactionId}`);
    await page.waitForLoadState("networkidle");

    const voidBtn = page.getByRole("button", { name: /batalkan|void/i });
    await expect(voidBtn).toBeVisible({ timeout: 10_000 });
    await voidBtn.click();

    const reasonInput = page.getByLabel(/alasan pembatalan/i);
    await expect(reasonInput).toBeVisible({ timeout: 5_000 });

    const confirmBtn = page.getByRole("button", { name: /^Batalkan$/i });
    await expect(confirmBtn).toBeVisible({ timeout: 5_000 });
    await expect(confirmBtn).toBeDisabled();

    await expect(page).toHaveURL(new RegExp(`/transactions/${transactionId}`));
  });

  test("void with valid reason succeeds", async ({ page }) => {
    const transactionId = await createPostedTransaction("[E2E] Void success");

    await page.goto(`/transactions/${transactionId}`);
    await page.waitForLoadState("networkidle");

    const voidBtn = page.getByRole("button", { name: /batalkan|void/i });
    await expect(voidBtn).toBeVisible({ timeout: 10_000 });
    await voidBtn.click();

    const reasonInput = page.getByLabel(/alasan pembatalan/i);
    await expect(reasonInput).toBeVisible({ timeout: 5_000 });
    await reasonInput.fill("[E2E] Test void reason");

    const confirmBtn = page.getByRole("button", { name: /^Batalkan$/i });
    await expect(confirmBtn).toBeVisible({ timeout: 5_000 });
    await expect(confirmBtn).toBeEnabled();
    await confirmBtn.click();

    await expect(
      page.getByText(/dibatalkan|voided/i).first(),
    ).toBeVisible({ timeout: 15_000 });
  });
});
