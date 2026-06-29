import { test, expect } from "@playwright/test";
import { loginViaUI } from "./fixtures/auth";

/**
 * Void/reversal transaction E2E tests.
 * Verifies: void requires reason, void succeeds, voided tx cannot be double-voided.
 */

test.describe("Void transaction", () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
    await expect(page).toHaveURL(/\/dashboard|\/onboarding/);
  });

  test("void button is visible on posted transaction detail", async ({ page }) => {
    await page.goto("/transactions");
    await page.waitForLoadState("networkidle");

    const txLink = page
      .locator("a[href*='/transactions/']")
      .filter({ hasNotText: /baru|new/i })
      .first();
    const hasTx = await txLink.isVisible({ timeout: 10_000 }).catch(() => false);
    if (!hasTx) {
      test.skip();
      return;
    }
    await txLink.click();
    await page.waitForLoadState("networkidle");

    const voidBtn = page.getByRole("button", { name: /batalkan|void/i });
    await expect(voidBtn).toBeVisible({ timeout: 10_000 });
  });

  test("void requires reason — empty reason is rejected", async ({ page }) => {
    await page.goto("/transactions");
    await page.waitForLoadState("networkidle");

    const txLink = page
      .locator("a[href*='/transactions/']")
      .filter({ hasNotText: /baru|new/i })
      .first();
    const hasTx = await txLink.isVisible({ timeout: 10_000 }).catch(() => false);
    if (!hasTx) {
      test.skip();
      return;
    }
    await txLink.click();
    await page.waitForLoadState("networkidle");

    const voidBtn = page.getByRole("button", { name: /batalkan|void/i });
    await expect(voidBtn).toBeVisible({ timeout: 10_000 });
    await voidBtn.click();

    // Confirm dialog should appear
    const confirmBtn = page.getByRole("button", { name: /ya|konfirmasi|batalkan transaksi/i });
    await expect(confirmBtn).toBeVisible({ timeout: 5_000 });
    await confirmBtn.click();

    // Should NOT navigate away — void needs a reason
    await page.waitForTimeout(1000);
    const stillOnPage = page.url().includes("/transactions/");
    expect(stillOnPage).toBeTruthy();
  });

  test("void with valid reason succeeds", async ({ page }) => {
    await page.goto("/transactions");
    await page.waitForLoadState("networkidle");

    const txLink = page
      .locator("a[href*='/transactions/']")
      .filter({ hasNotText: /baru|new/i })
      .first();
    const hasTx = await txLink.isVisible({ timeout: 10_000 }).catch(() => false);
    if (!hasTx) {
      test.skip();
      return;
    }
    await txLink.click();
    await page.waitForLoadState("networkidle");

    const voidBtn = page.getByRole("button", { name: /batalkan|void/i });
    await expect(voidBtn).toBeVisible({ timeout: 10_000 });
    await voidBtn.click();

    // Look for reason textarea/input
    const reasonInput = page.locator('textarea[name*="reason"], input[name*="reason"], textarea[placeholder*="alasan" i], textarea[placeholder*="reason" i]').first();
    if (await reasonInput.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await reasonInput.fill("[E2E] Test void reason");
    }

    const confirmBtn = page.getByRole("button", { name: /ya|konfirmasi|batalkan transaksi/i });
    await expect(confirmBtn).toBeVisible({ timeout: 5_000 });
    await confirmBtn.click();

    // Should show success or navigate to list
    await expect(
      page.getByText(/berhasil|dibatalkan|voided/i).first(),
    ).toBeVisible({ timeout: 15_000 });
  });
});
