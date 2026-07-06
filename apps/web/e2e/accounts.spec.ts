import { test, expect } from "@playwright/test";
import { loginViaUI } from "./fixtures/auth";

/**
 * Accounts (Chart of Accounts) E2E tests.
 */

test.describe("Accounts page", () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
    await expect(page).toHaveURL(/\/dashboard|\/onboarding/);
    await page.goto("/accounts");
    await expect(page).toHaveURL(/\/accounts/);
  });

  test("accounts page loads", async ({ page }) => {
    await expect(page.locator("text=/akun|chart/i").first()).toBeVisible({ timeout: 10_000 });
  });

  test("default chart of accounts is visible after onboarding", async ({ page }) => {
    await page.waitForLoadState("networkidle");

    await expect(
      page.locator("table").or(page.getByText(/kas|modal|piutang|utang/i)).first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("add account button is visible", async ({ page }) => {
    await page.waitForLoadState("networkidle");
    const addBtn = page.getByRole("button", { name: /^tambah kas\/bank$/i });
    await expect(addBtn).toBeVisible({ timeout: 10_000 });
  });

  test("account form has required fields", async ({ page }) => {
    const addBtn = page.getByRole("button", { name: /^tambah kas\/bank$/i });
    await expect(addBtn).toBeVisible({ timeout: 5_000 });

    await addBtn.click();
    await expect(page.locator("text=/kode|nama|jenis/i").first()).toBeVisible({ timeout: 5_000 });
  });
});
