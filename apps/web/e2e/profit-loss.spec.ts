import { test } from "./helpers/auth";
import { expect } from "@playwright/test";

/**
 * Profit & Loss (Laba Rugi) E2E for the MVP report page.
 *
 * Verifies the report renders income/expense sections and that a posted
 * cash_in transaction shows up as income for the period.
 */

const TS = Date.now();
// Isolated period: no other spec writes June transactions, so the income
// total is deterministic even when specs run in parallel on shared staging.
const REPORT_FROM = "2026-06-01";
const REPORT_TO = "2026-06-30";

test.describe("Profit & Loss report", () => {
  test("renders income, expense, and net income sections", async ({ authPage }) => {
    await authPage.goto("/reports/profit-loss", { waitUntil: "load", timeout: 15000 });
    await expect(authPage.getByRole("heading", { name: /Laba Rugi/ })).toBeVisible({ timeout: 15000 });

    await authPage.getByLabel("Dari").fill(REPORT_FROM);
    await authPage.getByLabel("Sampai").fill(REPORT_TO);
    await authPage.getByRole("button", { name: "Tampilkan" }).click();

    await expect(authPage.getByText("Pendapatan")).toBeVisible({ timeout: 15000 });
    await expect(authPage.getByText("Beban")).toBeVisible({ timeout: 15000 });
    await expect(authPage.getByText("Laba Bersih")).toBeVisible({ timeout: 15000 });
  });

  test("a posted cash_in appears as income for the period", async ({ authPage }) => {
    const desc = `[E2E] Laba Rugi ${TS}`;

    // Resolve seeded account IDs (Kas + Pendapatan Usaha), then create a
    // cash_in dated within the report period via the API.
    const accountIds = await authPage.evaluate(async () => {
      const res = await fetch("/api/accounts");
      const body = await res.json() as { accounts: { code: string; id: string }[] };
      const cash = body.accounts.find((a) => a.code === "1110");
      const income = body.accounts.find((a) => a.code === "4110");
      return { cash: cash?.id ?? "", income: income?.id ?? "" };
    });

    const created = await authPage.evaluate(
      async ({ description, cashId, incomeId }: { description: string; cashId: string; incomeId: string }) => {
        const res = await fetch("/api/transactions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            transactionType: "cash_in",
            transactionDate: "2026-06-15",
            cashAccountId: cashId,
            counterAccountId: incomeId,
            description,
            amountIdr: 250000,
            idempotencyKey: `e2e-pl-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          }),
        });
        return res.ok;
      },
      { description: desc, cashId: accountIds.cash, incomeId: accountIds.income },
    );
    expect(created).toBe(true);

    await authPage.goto("/reports/profit-loss", { waitUntil: "load", timeout: 15000 });
    await authPage.getByLabel("Dari").fill(REPORT_FROM);
    await authPage.getByLabel("Sampai").fill(REPORT_TO);
    await authPage.getByRole("button", { name: "Tampilkan" }).click();

    // The account row renders the accumulated income for the period. It must be
    // nonzero because this test just posted Rp 250.000 into it; exact-amount
    // assertions are avoided since repeated runs on shared staging accumulate.
    const incomeRow = authPage.locator("li", { hasText: "4110 · Pendapatan Usaha" });
    await expect(incomeRow).toBeVisible({ timeout: 15000 });
    // \\s+ covers the NBSP that Intl inserts between "Rp" and the digits.
    await expect(incomeRow.getByText(/^Rp\s+[1-9]/)).toBeVisible({ timeout: 15000 });
  });
});