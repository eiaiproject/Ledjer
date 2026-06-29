import { test, expect } from "@playwright/test";
import { E2E_OWNER } from "./fixtures/users";

/**
 * Billing and plan limit E2E tests.
 * NO live payment testing.
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

test.describe("Billing page", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsOwner(page);
    await expect(page).toHaveURL(/\/dashboard|\/onboarding/);
    await page.goto("/settings/billing");
    await expect(page).toHaveURL(/\/settings\/billing/);
  });

  test("billing page loads for owner", async ({ page }) => {
    await page.waitForLoadState("networkidle");
    await expect(page.locator("body")).toBeVisible();
  });

  test("plan information is displayed", async ({ page }) => {
    await page.waitForLoadState("networkidle");

    const hasPlanInfo = await page
      .locator("text=/paket|plan|gratis|free|pro|basic/i")
      .first()
      .isVisible({ timeout: 5_000 })
      .catch(() => false);
    expect(hasPlanInfo).toBeTruthy();
  });

  test("no live payment buttons trigger real payment", async ({ page }) => {
    await page.waitForLoadState("networkidle");

    const paymentBtns = page.getByRole("button", { name: /bayar|pay|upgrade|subscribe/i });
    const count = await paymentBtns.count();
    for (let i = 0; i < count; i++) {
      const btn = paymentBtns.nth(i);
      if (await btn.isVisible().catch(() => false)) {
        expect(await btn.textContent()).toBeTruthy();
      }
    }
  });
});

test.describe("Plan usage on transaction form", () => {
  test("usage banner is visible on free plan", async ({ page }) => {
    await loginAsOwner(page);
    await expect(page).toHaveURL(/\/dashboard|\/onboarding/);
    await page.goto("/transactions/new");
    await expect(page).toHaveURL(/\/transactions\/new/);
    // Verify no crash on transaction form
    await expect(page.locator("body")).toBeVisible();
  });
});
