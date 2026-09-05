import { describe, expect, it } from "vitest";
import { createSeedFixtures, FIXTURE_IDS } from "../test/fixtures";
import type { D1Database } from "@cloudflare/workers-types";
import { getBalanceSheet, getGeneralLedger, getProfitLoss } from "./reports.service";
import { HttpError } from "../http/errors";

const ORG_A = FIXTURE_IDS.orgs.a;

function freshDb(): D1Database {
  return createSeedFixtures().db as unknown as D1Database;
}

describe("getProfitLoss", () => {
  it("computes income, expense, and net income for June 2026", async () => {
    const report = await getProfitLoss(freshDb(), ORG_A, "2026-06-01", "2026-06-30");

    // Org A June: cash_in 2.000.000 (income); cash_out 1.200.000 (expense).
    expect(report.income.total).toBe(2000000);
    expect(report.expense.total).toBe(1200000);
    expect(report.netIncome).toBe(800000);
    expect(report.income.accounts).toHaveLength(1);
    expect(report.expense.accounts).toHaveLength(1);
    expect(report.income.accounts[0].code).toBe("4110");
  });

  it("excludes voided transactions from the report", async () => {
    const report = await getProfitLoss(freshDb(), ORG_A, "2026-07-01", "2026-07-31");
    // July: cash_in 800.000; the voided 100.000 cash_out must be excluded.
    expect(report.income.total).toBe(800000);
    expect(report.expense.total).toBe(0);
    expect(report.netIncome).toBe(800000);
  });

  it("isolates organizations: org B only sees its own transactions", async () => {
    const report = await getProfitLoss(freshDb(), FIXTURE_IDS.orgs.b, "2026-06-01", "2026-06-30");
    // Org B June: cash_in 1.000.000 only (deposit is equity, not income).
    expect(report.income.total).toBe(1000000);
    expect(report.expense.total).toBe(0);
    expect(report.netIncome).toBe(1000000);
  });

  it("rejects an invalid date range", async () => {
    await expect(
      getProfitLoss(freshDb(), ORG_A, "2026-06-30", "2026-06-01"),
    ).rejects.toThrowError(HttpError);
  });
});

describe("getBalanceSheet", () => {
  it("balances: total assets = liabilities + equity (incl. laba berjalan)", async () => {
    const report = await getBalanceSheet(freshDb(), ORG_A, "2026-06-30");

    // Assets: Kas 5jt + 2jt - 1.2jt - 0.5jt = 5.3jt; Bank 500rb.
    expect(report.totalAssets).toBe(5800000);
    // Equity: Modal 5jt + laba berjalan 800rb.
    expect(report.totalEquity).toBe(5800000);
    expect(report.totalLiabilities).toBe(0);
    expect(report.balanced).toBe(true);

    const labaBerjalan = report.equity.find((line) => line.code === "NET");
    expect(labaBerjalan).toBeDefined();
    expect(labaBerjalan!.amount).toBe(800000);
  });

  it("reflects only posted transactions up to the as-of date", async () => {
    const report = await getBalanceSheet(freshDb(), ORG_A, "2026-06-10");
    // Up to 10 June: deposit 5jt + cash_in 2jt → Kas 7jt.
    expect(report.totalAssets).toBe(7000000);
    expect(report.balanced).toBe(true);
  });

  it("isolates organizations on the balance sheet", async () => {
    const report = await getBalanceSheet(freshDb(), FIXTURE_IDS.orgs.b, "2026-06-30");
    // Org B: Kas = 3jt + 1jt = 4jt; equity = modal 3jt + laba berjalan 1jt.
    expect(report.totalAssets).toBe(4000000);
    expect(report.totalEquity).toBe(4000000);
    expect(report.balanced).toBe(true);
  });
});

describe("getGeneralLedger", () => {
  it("lists every journal line of posted transactions per account with a running balance", async () => {
    const report = await getGeneralLedger(freshDb(), ORG_A, {
      fromDate: "2026-06-01",
      toDate: "2026-06-30",
    });

    // June: 4 posted transactions x 2 lines = 8 journal lines.
    expect(report.entries).toHaveLength(8);

    // Ordered by account code: 1110 Kas first, carrying the running balance.
    const first = report.entries[0];
    expect(first.account_code).toBe("1110");
    expect(first.account_name).toBe("Kas");
    expect(first.entry_date).toBe("2026-06-05");
    expect(first.debit_idr).toBe(5000000);
    expect(first.credit_idr).toBe(0);
    expect(first.running_balance_idr).toBe(5000000);

    // Kas: +5jt (deposit), +2jt (in), -1.2jt (out), -500rb (transfer).
    const kas = report.entries.filter((e) => e.account_code === "1110");
    expect(kas).toHaveLength(4);
    expect(kas.at(-1)!.running_balance_idr).toBe(5300000);

    // Bank receives the transferred 500rb.
    const bank = report.entries.find((e) => e.account_code === "1120");
    expect(bank?.debit_idr).toBe(500000);
    expect(bank?.running_balance_idr).toBe(500000);

    // Expense (debit-normal) grows its running balance on the debit side.
    const rent = report.entries.find((e) => e.account_code === "6120");
    expect(rent?.debit_idr).toBe(1200000);
    expect(rent?.running_balance_idr).toBe(1200000);
  });

  it("excludes voided transactions", async () => {
    const report = await getGeneralLedger(freshDb(), ORG_A, {
      fromDate: "2026-07-01",
      toDate: "2026-07-31",
    });
    // July: only cash_in 800rb (voided 100rb cash_out must not appear).
    expect(report.entries).toHaveLength(2);
    for (const entry of report.entries) {
      expect(entry.transaction_number).not.toBe("TRX-20260705-LM12");
    }
  });

  it("filters by account and carries the opening balance into the range", async () => {
    const report = await getGeneralLedger(freshDb(), ORG_A, {
      accountId: FIXTURE_IDS.accounts.cashA,
      fromDate: "2026-06-10",
      toDate: "2026-06-30",
    });

    // Only Kas lines from 10 June: in 2jt, out 1.2jt, transfer 500rb.
    expect(report.entries).toHaveLength(3);
    for (const entry of report.entries) {
      expect(entry.account_id).toBe(FIXTURE_IDS.accounts.cashA);
    }
    // First visible row already includes the 5jt deposit from 5 June.
    expect(report.entries[0].entry_date).toBe("2026-06-10");
    expect(report.entries[0].debit_idr).toBe(2000000);
    expect(report.entries[0].running_balance_idr).toBe(7000000);
    expect(report.entries.at(-1)!.running_balance_idr).toBe(5300000);
  });

  it("isolates organizations on the ledger", async () => {
    const report = await getGeneralLedger(freshDb(), FIXTURE_IDS.orgs.b, {
      fromDate: "2026-06-01",
      toDate: "2026-06-30",
    });
    // Org B June: deposit 3jt + cash_in 1jt = 4 lines.
    expect(report.entries).toHaveLength(4);
    for (const entry of report.entries) {
      expect(entry.account_id).not.toBe(FIXTURE_IDS.accounts.cashA);
    }
  });

  it("rejects an invalid date range", async () => {
    await expect(
      getGeneralLedger(freshDb(), ORG_A, {
        fromDate: "2026-06-30",
        toDate: "2026-06-01",
      }),
    ).rejects.toThrowError(HttpError);
  });
});