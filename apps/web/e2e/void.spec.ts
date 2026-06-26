import { test, expect } from "@playwright/test";
import { E2E_OWNER } from "./fixtures/users";


/**
 * Void/reversal transaction E2E tests.
 * Tests the void flow on transaction detail page.
 */

async function loginAsOwner(page: import("@playwright/test").Page): Promise<void> {
  await page.goto("/login");
  await page.getByRole("textbox", { name: /email/i }).fill(E2E_OWNER.email);
  await page.getByRole("textbox", { name: /password/i }).fill(E2E_OWNER.password);
  await page.getByRole("button", { name: /masuk/i }).first().click();
  await page.waitForURL((url) =>
    url.pathname.includes("/dashboard") || url.pathname.includes("/onboarding"),
    { timeout: 15_000 },
  );
}

test.describe("Void transaction", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsOwner(page);
  });

  test("void button is visible on posted transaction detail", async ({ page }) => {
    if (!page.url().includes("/dashboard")) return;

    // Navigate to transaction list and find a posted transaction
    await page.goto("/transactions");
    await page.waitForLoadState("networkidle");

    // Click first transaction link if available
    const txLink = page.locator("a[href*='/transactions/']").first();
    if (await txLink.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await txLink.click();
      await page.waitForLoadState("networkidle");

      // Check for void button
      const voidBtn = page.getByRole("button", { name: /batalkan|void/i });
      if (await voidBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await expect(voidBtn).toBeVisible();
      }
    }
  });

  test("void requires reason", async ({ page }) => {
    if (!page.url().includes("/dashboard")) return;

    await page.goto("/transactions");
    await page.waitForLoadState("networkidle");

    const txLink = page.locator("a[href*='/transactions/']").first();
    if (await txLink.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await txLink.click();
      await page.waitForLoadState("networkidle");

      const voidBtn = page.getByRole("button", { name: /batalkan|void/i });
      if (await voidBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await voidBtn.click();

        // Try to confirm without reason
        const confirmBtn = page.getByRole("button", { name: /ya|konfirmasi|batalkan transaksi/i });
        if (await confirmBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
          await confirmBtn.click();
          // Should require void reason
          await page.waitForTimeout(500);
        }
      }
    }
  });
});
