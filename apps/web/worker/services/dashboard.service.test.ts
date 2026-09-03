import { describe, expect, it } from "vitest";
import { createSeedFixtures, FIXTURE_IDS } from "../test/fixtures";
import type { D1Database } from "@cloudflare/workers-types";
import { currentMonthPeriod, getDashboardAlerts, getDashboardSummary } from "./dashboard.service";
import { postTransaction } from "./transactions.service";

const ORG_A = FIXTURE_IDS.orgs.a;
const OWNER_A = FIXTURE_IDS.users.ownerA;

function freshDb(): D1Database {
  return createSeedFixtures().db as unknown as D1Database;
}

describe("currentMonthPeriod", () => {
  it("returns the first and last day of the current month", () => {
    const { from, to } = currentMonthPeriod(new Date(2026, 5, 15)); // June 2026 local
    expect(from).toMatch(/^\d{4}-\d{2}-01$/);
    expect(to).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(from <= to).toBe(true);
  });
});

describe("getDashboardSummary", () => {
  it("computes the total cash & bank balance from posted journals", async () => {
    const summary = await getDashboardSummary(freshDb(), ORG_A);

    // Kas = 5jt + 2jt - 1.2jt - 0.5jt + 0.8jt (Juli) = 6.1jt; Bank = 500rb.
    expect(summary.cashBankBalance).toBe(6600000);
    expect(summary.cashBankAccounts).toHaveLength(2);
    const cash = summary.cashBankAccounts.find((a) => a.code === "1110");
    expect(cash?.balance).toBe(6100000);
    const bank = summary.cashBankAccounts.find((a) => a.code === "1120");
    expect(bank?.balance).toBe(500000);
  });

  it("includes recent transactions in the summary", async () => {
    const summary = await getDashboardSummary(freshDb(), ORG_A);
    expect(summary.recentTransactions.length).toBeGreaterThan(0);
    expect(summary.recentTransactions[0].transaction_number).toMatch(/^TRX-/);
  });

  it("reflects a newly posted cash_in in the balance and month totals", async () => {
    const db = freshDb();
    const before = await getDashboardSummary(db, ORG_A);

    // Post on the 1st of the current month (never in the future, always in
    // the current month) so moneyIn/netIncome deltas are deterministic.
    const { from } = currentMonthPeriod();
    await postTransaction(db, ORG_A, OWNER_A, {
      transactionType: "cash_in",
      transactionDate: from,
      cashAccountId: FIXTURE_IDS.accounts.cashA,
      counterAccountId: FIXTURE_IDS.accounts.revenueA,
      amountIdr: 1000000,
      description: "Penjualan tambahan",
      idempotencyKey: "idem-dash-cashin-0001",
    });

    const after = await getDashboardSummary(db, ORG_A);
    expect(after.cashBankBalance).toBe(before.cashBankBalance + 1000000);
    expect(after.moneyIn).toBe(before.moneyIn + 1000000);
    expect(after.netIncome).toBe(before.netIncome + 1000000);
  });
});

describe("getDashboardAlerts", () => {
  it("reports no negative balances for a healthy org", async () => {
    const alerts = await getDashboardAlerts(freshDb(), ORG_A);
    expect(alerts.negativeBalanceAccounts).toEqual([]);
  });

  it("flags a cash/bank account with a negative balance", async () => {
    const db = freshDb();
    // Drain Kas with a large cash_out (debit expense, credit cash).
    await postTransaction(db, ORG_A, OWNER_A, {
      transactionType: "cash_out",
      transactionDate: "2026-06-15",
      cashAccountId: FIXTURE_IDS.accounts.cashA,
      counterAccountId: FIXTURE_IDS.accounts.expenseRentA,
      amountIdr: 9000000,
      description: "Beban besar",
      idempotencyKey: "idem-dash-negative-0001",
    });

    const alerts = await getDashboardAlerts(db, ORG_A);
    expect(alerts.negativeBalanceAccounts).toHaveLength(1);
    expect(alerts.negativeBalanceAccounts[0].name).toBe("Kas");
    expect(alerts.negativeBalanceAccounts[0].balance).toBeLessThan(0);
  });
});