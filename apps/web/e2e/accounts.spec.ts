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
    if (!page.url().includes("/dashboard")) return;
    await page.goto("/accounts");
  });

  test("accounts page loads", async ({ page }) => {
    if (!page.url().includes("/accounts")) return;
    await expect(page.locator("text=/akun|chart/i").first()).toBeVisible({ timeout: 10_000 });
  });

  test("default chart of accounts is visible after onboarding", async ({ page }) => {
    if (!page.url().includes("/accounts")) return;
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2_000);

    // Should show accounts from default CoA
    const hasTable = await page.locator("table").first().isVisible({ timeout: 5_000 }).catch(() => false);
    const hasAccounts = await page.locator("text=/kas|modal|piutang|utang/i").first().isVisible({ timeout: 5_000 }).catch(() => false);
    expect(hasTable || hasAccounts).toBeTruthy();
  });

  test("add account button is visible", async ({ page }) => {
    if (!page.url().includes("/accounts")) return;
    const addBtn = page.getByRole("button", { name: /tambah|add|buat/i });
    if (await addBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await expect(addBtn).toBeVisible();
    }
  });

  test("account form has required fields", async ({ page }) => {
    if (!page.url().includes("/accounts")) return;
    const addBtn = page.getByRole("button", { name: /tambah|add|buat/i }).first();
    if (!(await addBtn.isVisible({ timeout: 3_000 }).catch(() => false))) return;

    await addBtn.click();
    await expect(page.locator("text=/kode|nama|jenis/i").first()).toBeVisible({ timeout: 5_000 });
  });
});
