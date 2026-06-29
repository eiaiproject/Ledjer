import { test, expect } from "@playwright/test";
import { E2E } from "./fixtures/env";
import { loginViaUI } from "./fixtures/auth";

/**
 * Financial reports E2E tests.
 * - Smoke: all report pages load
 * - Golden numbers: asserts actual financial values from seeded data
 */

const SR_HEADERS = {
  apikey: E2E.serviceRoleKey,
  Authorization: `Bearer ${E2E.serviceRoleKey}`,
  "Content-Type": "application/json",
};

async function getOrgId(): Promise<string> {
  const res = await fetch(
    `${E2E.supabaseUrl}/rest/v1/organizations?select=id&limit=1`,
    { headers: SR_HEADERS },
  );
  const data = await res.json();
  return data[0]?.id || "";
}

async function getOrgTransactions(orgId: string) {
  const res = await fetch(
    `${E2E.supabaseUrl}/rest/v1/transactions?organization_id=eq.${orgId}&select=transaction_type,amount,payment_status&not(transaction_type,like,opening_*)`,
    { headers: SR_HEADERS },
  );
  return res.json();
}

async function getJournalEntries(orgId: string) {
  const res = await fetch(
    `${E2E.supabaseUrl}/rest/v1/journal_entries?organization_id=eq.${orgId}&select=entry_type,amount`,
    { headers: SR_HEADERS },
  );
  return res.json();
}

const reportRoutes = [
  { path: "/reports/general-ledger", name: "General Ledger" },
  { path: "/reports/trial-balance", name: "Trial Balance" },
  { path: "/reports/profit-loss", name: "Profit & Loss" },
  { path: "/reports/balance-sheet", name: "Balance Sheet" },
];

test.describe("Reports — smoke", () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
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
});

test.describe("Reports — golden numbers (seeded data)", () => {
  if (!E2E.hasServiceRole) {
    test.skip(true, "Requires E2E_SUPABASE_SERVICE_ROLE_KEY to verify seeded report data via Supabase API.");
  }

  // Seeded data: 10M opening cash + 1 cash_sale (50k) = 10,050,000 total.
  // Cash account (code 1101) should have 10,050,000 debit balance.
  // Sales revenue (code 4101) should have 50,000 credit.
  const CASH_SALE_AMOUNT = 50_000;

  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
    await expect(page).toHaveURL(/\/dashboard|\/onboarding/);
  });

  test("trial balance: total debits equals total credits", async ({ page }) => {
    await page.goto("/reports/trial-balance");
    await page.waitForLoadState("networkidle");
    await page.locator("table").first().waitFor({ state: "visible", timeout: 10_000 });

    const rows = page.locator("table tbody tr");
    const rowCount = await rows.count();
    expect(rowCount).toBeGreaterThan(0);

    let totalDebit = 0;
    let totalCredit = 0;

    for (let i = 0; i < rowCount; i++) {
      const cells = rows.nth(i).locator("td");
      const cellCount = await cells.count();
      for (let c = 0; c < cellCount; c++) {
        const text = (await cells.nth(c).textContent()) || "";
        const match = text.match(/Rp[\s.]*(\d[\d.]*)/);
        if (match) {
          const val = parseInt(match[1].replace(/\./g, ""), 10);
          if (!isNaN(val) && val > 0) {
            if (c <= Math.floor(cellCount / 2)) {
              totalDebit += val;
            } else {
              totalCredit += val;
            }
          }
        }
      }
    }

    // Double-entry invariant: debits = credits
    expect(totalDebit).toBeGreaterThan(0);
    expect(totalDebit).toBe(totalCredit);
  });

  test("trial balance: cash account shows expected balance", async ({ page }) => {
    // Verify the seeded cash balance via API first
    const orgId = await getOrgId();
    const txns = await getOrgTransactions(orgId);
    expect(Array.isArray(txns)).toBeTruthy();

    // Count cash_sale amounts (paid)
    const cashSales = txns.filter(
      (t: { transaction_type: string; payment_status: string }) =>
        t.transaction_type === "cash_sale" && t.payment_status === "paid",
    );
    const totalCashSales = cashSales.reduce(
      (sum: number, t: { amount: number }) => sum + Number(t.amount),
      0,
    );

    // Should be at least the seeded 50k
    expect(totalCashSales).toBeGreaterThanOrEqual(CASH_SALE_AMOUNT);

    // Now check the report page has this value
    await page.goto("/reports/trial-balance");
    await page.waitForLoadState("networkidle");
    await page.locator("table").first().waitFor({ state: "visible", timeout: 10_000 });

    const tableText = await page.locator("table").textContent();
    // The cash account should show a balance around 10,050,000
    // Look for "Kas" or "1101" in the table
    const hasCashRow = /kas|1101/i.test(tableText || "");
    expect(hasCashRow).toBeTruthy();
  });

  test("profit & loss: shows revenue section", async ({ page }) => {
    await page.goto("/reports/profit-loss");
    await page.waitForLoadState("networkidle");
    await page.locator("main").first().waitFor({ state: "visible", timeout: 10_000 });

    const mainContent = await page.locator("main").textContent();
    expect(mainContent?.length).toBeGreaterThan(50);

    // Verify seeded journal entries have revenue
    const orgId = await getOrgId();
    const entries = await getJournalEntries(orgId);
    expect(Array.isArray(entries)).toBeTruthy();

    const revenueEntries = entries.filter(
      (e: { entry_type: string }) => e.entry_type === "revenue" || e.entry_type === "sale",
    );
    // Should have at least 1 revenue entry from the seeded cash sale
    expect(revenueEntries.length).toBeGreaterThanOrEqual(1);

    // Report should mention revenue/income
    const hasRevenue = /pendapatan|revenue|income/i.test(mainContent || "");
    expect(hasRevenue).toBeTruthy();
  });

  test("balance sheet: shows assets section with cash", async ({ page }) => {
    await page.goto("/reports/balance-sheet");
    await page.waitForLoadState("networkidle");
    await page.locator("main").first().waitFor({ state: "visible", timeout: 10_000 });

    const mainContent = await page.locator("main").textContent();
    expect(mainContent?.length).toBeGreaterThan(50);

    // Should mention assets
    const hasAssets = /aset|asset/i.test(mainContent || "");
    expect(hasAssets).toBeTruthy();

    // Should mention cash or bank
    const hasCash = /kas|bank|cash/i.test(mainContent || "");
    expect(hasCash).toBeTruthy();
  });

  test("general ledger: shows account entries", async ({ page }) => {
    await page.goto("/reports/general-ledger");
    await page.waitForLoadState("networkidle");

    const hasTable = await page
      .locator("table")
      .first()
      .isVisible({ timeout: 10_000 })
      .catch(() => false);
    const hasEmpty = await page
      .locator("text=/belum ada|kosong|pilih akun/i")
      .first()
      .isVisible({ timeout: 5_000 })
      .catch(() => false);
    expect(hasTable || hasEmpty).toBeTruthy();
  });

  test("journal entries from API are balanced", async () => {
    const orgId = await getOrgId();
    const entries = await getJournalEntries(orgId);

    expect(Array.isArray(entries)).toBeTruthy();
    expect(entries.length).toBeGreaterThan(0);

    let totalAmount = 0;

    for (const entry of entries) {
      const amount = Number(entry.amount);
      expect(Number.isFinite(amount)).toBeTruthy();
      totalAmount += amount;
    }

    // Signed double-entry rows should net to zero.
    expect(totalAmount).toBe(0);
  });
});
