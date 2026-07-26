import { describe, it, expect } from "vitest";
import { getCashFlowStatement } from "./cash-flow.service";

class FakeD1 {
  private results: Record<string, unknown[]>;

  constructor(results: Record<string, unknown[]>) {
    this.results = results;
  }

  prepare(sql: string): D1PreparedStatement {
    const stmt = {
      bind: (...values: unknown[]) => { void values; return stmt; },
      first: async <T>() => null as T | null,
      all: async <T>() => {
        // Match SQL patterns to return appropriate mock data
        const s = sql.replace(/\s+/g, " ");
        if (s.includes("entry_date < ?")) {
          return { results: (this.results["opening"] ?? []) as T[] };
        }
        if (s.includes("entry_date <= ?")) {
          return { results: (this.results["closing"] ?? []) as T[] };
        }
        if (s.includes("BETWEEN")) {
          return { results: (this.results["movements"] ?? []) as T[] };
        }
        return { results: [] as T[] };
      },
      run: async () => ({ success: true, meta: { changes: 0 } } as D1Result),
    };
    return stmt as unknown as D1PreparedStatement;
  }

  async batch() { return []; }
}

describe("Cash Flow Statement", () => {
  it("returns report with opening and closing cash", async () => {
    const db = new FakeD1({
      opening: [{ balance: 100000 }],
      closing: [{ balance: 250000 }],
      movements: [
        { transaction_type: "cash_sale", debit_minor: 500000, credit_minor: 0 },
        { transaction_type: "cash_purchase", debit_minor: 0, credit_minor: 300000 },
        { transaction_type: "operating_expense", debit_minor: 0, credit_minor: 50000 },
      ],
    });

    const report = await getCashFlowStatement(
      db as unknown as D1Database,
      "org-1",
      "2026-01-01",
      "2026-01-31",
    );

    expect(report.totals.openingCash).toBe(100000);
    expect(report.totals.closingCash).toBe(250000);
    expect(report.totals.netCashFlow).toBe(150000);
    expect(report.rows).toHaveLength(3);
    expect(report.rows[0].section).toBe("operating");
  });

  it("categorizes owner capital as financing", async () => {
    const db = new FakeD1({
      opening: [{ balance: 0 }],
      closing: [{ balance: 10000000 }],
      movements: [
        { transaction_type: "owner_capital", debit_minor: 10000000, credit_minor: 0 },
      ],
    });

    const report = await getCashFlowStatement(
      db as unknown as D1Database,
      "org-1",
      "2026-01-01",
      "2026-01-31",
    );

    expect(report.rows[0].section).toBe("financing");
    expect(report.totals.financing).toBe(10000000);
  });

  it("handles empty period", async () => {
    const db = new FakeD1({
      opening: [{ balance: 500000 }],
      closing: [{ balance: 500000 }],
      movements: [],
    });

    const report = await getCashFlowStatement(
      db as unknown as D1Database,
      "org-1",
      "2026-01-01",
      "2026-01-31",
    );

    expect(report.rows).toHaveLength(0);
    expect(report.totals.netCashFlow).toBe(0);
    expect(report.totals.openingCash).toBe(500000);
    expect(report.totals.closingCash).toBe(500000);
  });

  it("validates period in response", async () => {
    const db = new FakeD1({
      opening: [{ balance: 0 }],
      closing: [{ balance: 0 }],
      movements: [],
    });

    const report = await getCashFlowStatement(
      db as unknown as D1Database,
      "org-1",
      "2026-03-01",
      "2026-03-31",
    );

    expect(report.period.fromDate).toBe("2026-03-01");
    expect(report.period.toDate).toBe("2026-03-31");
  });
});
