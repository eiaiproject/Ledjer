import { describe, expect, it } from "vitest";
import { FakeD1Database } from "../test/fake-d1";
import { currentMonthPeriod, getDashboardSummary } from "./dashboard.service";

describe("dashboard summary", () => {
  it("uses the current local month as the dashboard period", () => {
    // Use noon UTC to avoid date boundary issues across timezones
    expect(currentMonthPeriod(new Date("2026-07-17T12:00:00.000Z"))).toEqual({
      periodFrom: "2026-07-01",
      periodTo: "2026-07-17",
    });
  });

  it("maps aggregate rows and derives net profit", async () => {
    let sql = "";
    let values: unknown[] = [];
    const row = {
      cash_balance: 1_250_000,
      revenue_current_period: 2_000_000,
      expense_current_period: 750_000,
      accounts_receivable: 300_000,
      accounts_payable: 125_000,
    };
    const fake = new FakeD1Database({
      first: (query, boundValues) => {
        sql = query;
        values = boundValues;
        return row;
      },
    });

    const summary = await getDashboardSummary(
      fake as unknown as D1Database,
      "org-1",
      new Date("2026-07-17T10:00:00.000Z"),
    );

    expect(summary).toEqual({
      cash_balance: 1_250_000,
      revenue_current_period: 2_000_000,
      expense_current_period: 750_000,
      net_profit_current_period: 1_250_000,
      accounts_receivable: 300_000,
      accounts_payable: 125_000,
      period_from: "2026-07-01",
      period_to: "2026-07-17",
    });
    expect(values).toEqual([
      "org-1",
      "2026-07-17",
      "org-1",
      "2026-07-01",
      "2026-07-17",
      "org-1",
    ]);
    expect(sql).toContain("posted_balances AS");
    expect(sql).toContain("period_balances AS");
    expect(sql).toContain("je.entry_type != 'opening_balance'");
  });
});
