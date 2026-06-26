import { test, expect } from "@playwright/test";
import { E2E_OWNER } from "./fixtures/users";

/**
 * Accounts (Chart of Accounts) E2E tests.
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

test.describe("Accounts page", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsOwner(page);
    await expect(page).toHaveURL(/\/dashboard|\/onboarding/);
    await page.goto("/accounts");
    await expect(page).toHaveURL(/\/accounts/);
  });

  test("accounts page loads", async ({ page }) => {
    await expect(page.locator("text=/akun|chart/i").first()).toBeVisible({ timeout: 10_000 });
  });

  test("default chart of accounts is visible after onboarding", async ({ page }) => {
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2_000);

    const hasTable = await page.locator("table").first().isVisible({ timeout: 5_000 }).catch(() => false);
    const hasAccounts = await page.locator("text=/kas|modal|piutang|utang/i").first().isVisible({ timeout: 5_000 }).catch(() => false);
    expect(hasTable || hasAccounts).toBeTruthy();
  });

  test("add account button is visible", async ({ page }) => {
    const addBtn = page.getByRole("button", { name: /tambah|add|buat/i });
    await expect(addBtn).toBeVisible({ timeout: 5_000 });
  });

  test("account form has required fields", async ({ page }) => {
    const addBtn = page.getByRole("button", { name: /tambah|add|buat/i }).first();
    await expect(addBtn).toBeVisible({ timeout: 5_000 });

    await addBtn.click();
    await expect(page.locator("text=/kode|nama|jenis/i").first()).toBeVisible({ timeout: 5_000 });
  });
});
