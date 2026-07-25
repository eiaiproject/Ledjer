import { describe, it, expect } from "vitest";
import {
  importStatement,
  getSuggestions,
  confirmMatch,
  getReconciliationReport,
} from "./reconciliation.service";

class FakeD1 {
  private data: Record<string, unknown[]> = {};

  setData(table: string, rows: unknown[]) {
    this.data[table] = rows;
  }

  prepare(sql: string): D1PreparedStatement {
    const s = sql.replace(/\s+/g, " ");
    const stmt = {
      bind: (...values: unknown[]) => { void values; return stmt; },
      first: async <T>() => {
        if (s.includes("FROM bank_statements WHERE") && this.data["bank_statements"]?.length) {
          return this.data["bank_statements"][0] as T;
        }
        if (s.includes("FROM bank_statement_lines bsl JOIN")) {
          return this.data["bank_statement_lines"]?.[0] as T;
        }
        if (s.includes("FROM reconciliation_matches WHERE statement_line")) {
          // Return null means not yet matched
          return null;
        }
        if (s.includes("COUNT(*) as cnt FROM")) {
          if (s.includes("reconciliation_matches")) {
            return { cnt: (this.data["reconciliation_matches"] ?? []).length } as T;
          }
          if (s.includes("bank_statement_lines")) {
            return { cnt: (this.data["bank_statement_lines"] ?? []).length } as T;
          }
        }
        return null as T;
      },
      all: async <T>() => {
        if (s.includes("FROM bank_statement_lines bsl LEFT JOIN")) {
          return { results: (this.data["unmatched_lines"] ?? []) as T[] };
        }
        if (s.includes("FROM transactions t WHERE")) {
          return { results: (this.data["transactions"] ?? []) as T[] };
        }
        return { results: [] as T[] };
      },
      run: async () => ({ success: true, meta: { changes: 1 } } as D1Result),
    };
    return stmt as unknown as D1PreparedStatement;
  }

  async batch() { return []; }
}

describe("Reconciliation Service", () => {
  describe("importStatement", () => {
    it("imports statement with lines", async () => {
      const db = new FakeD1();
      const result = await importStatement(
        db as unknown as D1Database, "org-1", "user-1",
        {
          accountId: "acc-1110",
          statementDate: "2026-01-31",
          openingBalance: 100000,
          closingBalance: 250000,
          fileName: "statement.csv",
          lines: [
            { date: "2026-01-05", description: "Setoran", amount: 500000 },
            { date: "2026-01-10", description: "Tarik tunai", amount: -350000 },
          ],
        },
      );
      expect(result.statementId).toBeTruthy();
      expect(result.importedLines).toBe(2);
    });

    it("rejects empty statement", async () => {
      const db = new FakeD1();
      await expect(
        importStatement(db as unknown as D1Database, "org-1", "user-1", {
          accountId: "acc-1110",
          statementDate: "2026-01-31",
          openingBalance: 0,
          closingBalance: 0,
          fileName: "",
          lines: [],
        }),
      ).rejects.toMatchObject({ code: "empty_statement" });
    });
  });

  describe("getSuggestions", () => {
    it("returns match suggestions", async () => {
      const db = new FakeD1();
      db.setData("bank_statements", [{ account_id: "acc-1110" }]);
      db.setData("unmatched_lines", [
        { id: "bsl-1", line_date: "2026-01-10", description: "Setoran tunai", amount_minor: 500000 },
      ]);
      db.setData("transactions", [
        { id: "txn-1", transaction_date: "2026-01-10", transaction_type: "cash_sale", amount_minor: 500000, description: "Penjualan" },
      ]);

      const suggestions = await getSuggestions(
        db as unknown as D1Database, "org-1", "stmt-1",
      );

      expect(suggestions.length).toBeGreaterThanOrEqual(1);
      if (suggestions[0].transactionId) {
        expect(suggestions[0].score).toBeGreaterThan(0);
      }
    });
  });

  describe("confirmMatch", () => {
    it("confirms manual match", async () => {
      const db = new FakeD1();
      db.setData("bank_statement_lines", [{ id: "bsl-1" }]);
      const result = await confirmMatch(
        db as unknown as D1Database, "org-1", "user-1", "stmt-1",
        [{ statementLineId: "bsl-1", transactionId: "txn-1" }],
      );
      expect(result.matched).toBe(1);
    });
  });

  describe("getReconciliationReport", () => {
    it("returns report summary", async () => {
      const db = new FakeD1();
      db.setData("bank_statements", [{
        id: "stmt-1", closing_balance: 500000, status: "open",
      }]);
      db.setData("bank_statement_lines", [{ id: "bsl-1" }, { id: "bsl-2" }]);
      db.setData("reconciliation_matches", [{ id: "rm-1" }]);

      const report = await getReconciliationReport(
        db as unknown as D1Database, "org-1", "stmt-1",
      );

      expect(report.bankLinesTotal).toBe(2);
      expect(report.matchedLines).toBe(1);
      expect(report.unmatchedLines).toBe(1);
      expect(report.statementBalance).toBe(500000);
    });
  });
});
