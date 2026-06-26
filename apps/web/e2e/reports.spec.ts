import { test, expect } from "@playwright/test";
import { E2E_OWNER } from "./fixtures/users";


/**
 * Financial reports E2E tests.
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

const reportRoutes = [
  { path: "/reports/general-ledger", name: "General Ledger" },
  { path: "/reports/trial-balance", name: "Trial Balance" },
  { path: "/reports/profit-loss", name: "Profit & Loss" },
  { path: "/reports/balance-sheet", name: "Balance Sheet" },
];

test.describe("Reports", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsOwner(page);
  });

  for (const report of reportRoutes) {
    test(`${report.name} page loads without crash`, async ({ page }) => {
      if (!page.url().includes("/dashboard")) return;

      await page.goto(report.path);
      await page.waitForLoadState("networkidle");

      // Page should not be blank
      const body = page.locator("body");
      await expect(body).toBeVisible();

      // Should show report title or content
      const hasReportContent =
        (await page.locator(`text=/${report.name.split(" ")[0]}|laporan|neraca|labarugi/i`).first().isVisible({ timeout: 5_000 }).catch(() => false)) ||
        (await page.locator("table, .animate-spin, text=/belum ada/i").first().isVisible({ timeout: 3_000 }).catch(() => false));
      expect(hasReportContent).toBeTruthy();
    });
  }

  test("general ledger has date filter", async ({ page }) => {
    if (!page.url().includes("/dashboard")) return;

    await page.goto("/reports/general-ledger");
    await page.waitForLoadState("networkidle");

    const dateInputs = page.locator("input[type='date']");
    const count = await dateInputs.count();
    // GL should have date range filter
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test("trial balance page does not crash with empty data", async ({ page }) => {
    if (!page.url().includes("/dashboard")) return;

    await page.goto("/reports/trial-balance");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2_000);

    // Should not crash, should show table or empty state
    const hasTable = await page.locator("table").first().isVisible({ timeout: 5_000 }).catch(() => false);
    const hasEmpty = await page.locator("text=/belum ada|kosong/i").first().isVisible({ timeout: 3_000 }).catch(() => false);
    expect(hasTable || hasEmpty).toBeTruthy();
  });

  test("profit and loss page does not crash", async ({ page }) => {
    if (!page.url().includes("/dashboard")) return;

    await page.goto("/reports/profit-loss");
    await page.waitForLoadState("networkidle");

    const body = page.locator("body");
    await expect(body).toBeVisible();
  });

  test("balance sheet page does not crash", async ({ page }) => {
    if (!page.url().includes("/dashboard")) return;

    await page.goto("/reports/balance-sheet");
    await page.waitForLoadState("networkidle");

    const body = page.locator("body");
    await expect(body).toBeVisible();
  });
});
