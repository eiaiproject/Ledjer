import { describe, expect, it } from "vitest";
import { currentMonthPeriod, getDashboardSummary } from "./dashboard.service";

class FakeD1Statement {
  private values: unknown[] = [];

  constructor(
    private readonly db: FakeD1Database,
    private readonly sql: string,
  ) {}

  bind(...values: unknown[]): FakeD1Statement {
    this.values = values;
    return this;
  }

  async first<T>(): Promise<T | null> {
    return this.db.first<T>(this.sql, this.values);
  }
}

class FakeD1Database {
  public sql = "";
  public values: unknown[] = [];

  constructor(private readonly row: Record<string, unknown> | null) {}

  prepare(sql: string): FakeD1Statement {
    this.sql = sql;
    return new FakeD1Statement(this, sql);
  }

  first<T>(_sql: string, values: unknown[]): T | null {
    this.values = values;
    return this.row as T | null;
  }
}

describe("dashboard summary", () => {
  it("uses the current UTC month as the dashboard period", () => {
    expect(currentMonthPeriod(new Date("2026-07-17T23:59:59.000Z"))).toEqual({
      periodFrom: "2026-07-01",
      periodTo: "2026-07-17",
    });
  });

  it("maps aggregate rows and derives net profit", async () => {
    const fake = new FakeD1Database({
      cash_balance: 1_250_000,
      revenue_current_period: 2_000_000,
      expense_current_period: 750_000,
      accounts_receivable: 300_000,
      accounts_payable: 125_000,
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
    expect(fake.values).toEqual([
      "org-1",
      "2026-07-17",
      "org-1",
      "2026-07-01",
      "2026-07-17",
      "org-1",
    ]);
    expect(fake.sql).toContain("posted_balances AS");
    expect(fake.sql).toContain("period_balances AS");
    expect(fake.sql).toContain("je.entry_type != 'opening_balance'");
  });
});
