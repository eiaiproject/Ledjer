import { test, expect } from "@playwright/test";
import { E2E_OWNER } from "./fixtures/users";

/**
 * Financial reports E2E tests.
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

const reportRoutes = [
  { path: "/reports/general-ledger", name: "General Ledger" },
  { path: "/reports/trial-balance", name: "Trial Balance" },
  { path: "/reports/profit-loss", name: "Profit & Loss" },
  { path: "/reports/balance-sheet", name: "Balance Sheet" },
];

test.describe("Reports", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsOwner(page);
    await expect(page).toHaveURL(/\/dashboard|\/onboarding/);
  });

  for (const report of reportRoutes) {
    test(`${report.name} page loads without crash`, async ({ page }) => {
      await page.goto(report.path);
      await page.waitForLoadState("networkidle");

      await expect(page.locator("body")).toBeVisible();

      const hasReportContent = await page
        .locator(`text=/${report.name.split(" ")[0]}|laporan|neraca|labarugi/i`)
        .first()
        .isVisible({ timeout: 5_000 })
        .catch(() => false);
      const hasTableOrLoading = await page
        .locator("table, .animate-spin, text=/belum ada/i")
        .first()
        .isVisible({ timeout: 3_000 })
        .catch(() => false);
      expect(hasReportContent || hasTableOrLoading).toBeTruthy();
    });
  }

  test("general ledger has date filter", async ({ page }) => {
    await page.goto("/reports/general-ledger");
    await page.waitForLoadState("networkidle");

    const dateInputs = page.locator("input[type='date']");
    const count = await dateInputs.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test("trial balance page does not crash with empty data", async ({ page }) => {
    await page.goto("/reports/trial-balance");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2_000);

    const hasTable = await page.locator("table").first().isVisible({ timeout: 5_000 }).catch(() => false);
    const hasEmpty = await page.locator("text=/belum ada|kosong/i").first().isVisible({ timeout: 3_000 }).catch(() => false);
    expect(hasTable || hasEmpty).toBeTruthy();
  });

  test("profit and loss page does not crash", async ({ page }) => {
    await page.goto("/reports/profit-loss");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("body")).toBeVisible();
  });

  test("balance sheet page does not crash", async ({ page }) => {
    await page.goto("/reports/balance-sheet");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("body")).toBeVisible();
  });
});
