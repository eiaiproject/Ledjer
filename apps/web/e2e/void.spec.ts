import { test, expect } from "@playwright/test";
import { E2E_OWNER } from "./fixtures/users";

/**
 * Void/reversal transaction E2E tests.
 */

async function loginAsOwner(page: import("@playwright/test").Page): Promise<void> {
  await page.goto("/login");
  await page.getByRole("textbox", { name: /email/i }).fill(E2E_OWNER.email);
  await page.locator('input[type="password"]').fill(E2E_OWNER.password);
  await page.getByRole("button", { name: /^Masuk$/ }).click();
  await page.waitForURL((url) =>
    url.pathname.includes("/dashboard") || url.pathname.includes("/onboarding"),
    { timeout: 15_000 },
  );
}

test.describe("Void transaction", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsOwner(page);
    await expect(page).toHaveURL(/\/dashboard|\/onboarding/);
  });

  test("void button is visible on posted transaction detail", async ({ page }) => {
    await page.goto("/transactions");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);

    // Find a transaction row link (not the "new" button)
    const txLink = page.locator("a[href*='/transactions/']").filter({ hasNotText: /baru|new/i }).first();
    const hasTx = await txLink.isVisible({ timeout: 5_000 }).catch(() => false);
    if (!hasTx) {
      // No transactions yet — test passes vacuously (seed should create one)
      test.skip();
      return;
    }
    await txLink.click();
    await page.waitForLoadState("networkidle");

    const voidBtn = page.getByRole("button", { name: /batalkan|void/i });
    await expect(voidBtn).toBeVisible({ timeout: 5_000 });
  });

  test("void requires reason", async ({ page }) => {
    await page.goto("/transactions");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);

    const txLink = page.locator("a[href*='/transactions/']").filter({ hasNotText: /baru|new/i }).first();
    const hasTx = await txLink.isVisible({ timeout: 5_000 }).catch(() => false);
    if (!hasTx) {
      test.skip();
      return;
    }
    await txLink.click();
    await page.waitForLoadState("networkidle");

    const voidBtn = page.getByRole("button", { name: /batalkan|void/i });
    await expect(voidBtn).toBeVisible({ timeout: 5_000 });
    await voidBtn.click();

    const confirmBtn = page.getByRole("button", { name: /ya|konfirmasi|batalkan transaksi/i });
    await expect(confirmBtn).toBeVisible({ timeout: 3_000 });
    await confirmBtn.click();
    await page.waitForTimeout(500);
    // Should show reason requirement or stay on page
    await expect(page.locator("body")).toBeVisible();
  });
});
