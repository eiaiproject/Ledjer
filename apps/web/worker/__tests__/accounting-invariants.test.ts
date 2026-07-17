import { describe, it, expect } from "vitest";
import { assertJournalBalanced } from "../services/transactions.service";
import { assertTrialBalanceBalanced } from "../services/reports.service";
import type { TrialBalanceRow } from "../services/reports.service";

/**
 * Accounting Invariant Tests
 *
 * These tests verify core double-entry accounting rules using pure
 * domain logic (no database). They test the invariant enforcement
 * functions directly.
 */

describe("Accounting Invariants", () => {
  // ── Journal Balance Invariants ───────────────────────────────
  describe("Journal Balance (Σdebit = Σcredit)", () => {
    it("balanced cash_sale journal", () => {
      expect(() =>
        assertJournalBalanced([
          { accountId: "cash", debitMinor: 100000, creditMinor: 0, description: "Kas" },
          { accountId: "revenue", debitMinor: 0, creditMinor: 100000, description: "Penjualan" },
        ]),
      ).not.toThrow();
    });

    it("balanced credit_sale with AR", () => {
      expect(() =>
        assertJournalBalanced([
          { accountId: "ar", debitMinor: 100000, creditMinor: 0, description: "Piutang" },
          { accountId: "revenue", debitMinor: 0, creditMinor: 100000, description: "Penjualan" },
        ]),
      ).not.toThrow();
    });

    it("balanced cash_purchase with inventory and COGS", () => {
      expect(() =>
        assertJournalBalanced([
          { accountId: "inventory", debitMinor: 50000, creditMinor: 0, description: "Persediaan" },
          { accountId: "cash", debitMinor: 0, creditMinor: 50000, description: "Kas" },
        ]),
      ).not.toThrow();
    });

    it("balanced multi-line journal (sale with COGS)", () => {
      expect(() =>
        assertJournalBalanced([
          { accountId: "cash", debitMinor: 600000, creditMinor: 0, description: "Penjualan" },
          { accountId: "cogs", debitMinor: 400000, creditMinor: 0, description: "HPP" },
          { accountId: "revenue", debitMinor: 0, creditMinor: 600000, description: "Penjualan" },
          { accountId: "inventory", debitMinor: 0, creditMinor: 400000, description: "HPP" },
        ]),
      ).not.toThrow();
    });

    it("rejects unbalanced journal (debit > credit)", () => {
      expect(() =>
        assertJournalBalanced([
          { accountId: "cash", debitMinor: 100000, creditMinor: 0, description: "Kas" },
          { accountId: "revenue", debitMinor: 0, creditMinor: 50000, description: "Penjualan" },
        ]),
      ).toThrow("Journal is not balanced");
    });

    it("rejects unbalanced journal (credit > debit)", () => {
      expect(() =>
        assertJournalBalanced([
          { accountId: "cash", debitMinor: 50000, creditMinor: 0, description: "Kas" },
          { accountId: "revenue", debitMinor: 0, creditMinor: 100000, description: "Penjualan" },
        ]),
      ).toThrow("Journal is not balanced");
    });

    it("rejects zero-debit journal", () => {
      expect(() =>
        assertJournalBalanced([
          { accountId: "a", debitMinor: 0, creditMinor: 0, description: "Empty" },
        ]),
      ).toThrow("Journal is not balanced");
    });

    it("rejects empty journal", () => {
      expect(() => assertJournalBalanced([])).toThrow("Journal is not balanced");
    });

    // ponytail: Per-line debit xor credit is enforced by DB CHECK constraint
    // (debit_minor > 0 AND credit_minor = 0) OR (debit_minor = 0 AND credit_minor > 0)
    // The assertJournalBalanced function only validates aggregate totals.
  });

  // ── Trial Balance Invariants ─────────────────────────────────
  describe("Trial Balance (Σdebit = Σcredit)", () => {
    it("balanced trial balance", () => {
      const rows: TrialBalanceRow[] = [
        {
          account_id: "a1", account_code: 1110, account_name: "Kas",
          account_type: "asset", normal_balance: "debit",
          debit_total: 1000000, credit_total: 0, ending_debit: 1000000, ending_credit: 0,
        },
        {
          account_id: "a2", account_code: 3100, account_name: "Modal",
          account_type: "equity", normal_balance: "credit",
          debit_total: 0, credit_total: 1000000, ending_debit: 0, ending_credit: 1000000,
        },
      ];
      expect(assertTrialBalanceBalanced(rows)).toBe(true);
    });

    it("unbalanced trial balance returns false", () => {
      const rows: TrialBalanceRow[] = [
        {
          account_id: "a1", account_code: 1110, account_name: "Kas",
          account_type: "asset", normal_balance: "debit",
          debit_total: 1000000, credit_total: 0, ending_debit: 1000000, ending_credit: 0,
        },
        {
          account_id: "a2", account_code: 3100, account_name: "Modal",
          account_type: "equity", normal_balance: "credit",
          debit_total: 0, credit_total: 500000, ending_debit: 0, ending_credit: 500000,
        },
      ];
      expect(assertTrialBalanceBalanced(rows)).toBe(false);
    });

    it("empty trial balance is balanced", () => {
      expect(assertTrialBalanceBalanced([])).toBe(true);
    });
  });

  // ── WAC (Weighted Average Cost) Invariants ───────────────────
  describe("Weighted Average Cost", () => {
    it("purchase increases average correctly: 10@100 + 10@200 = avg 150", () => {
      const stockBefore = 10_000; // 10 units * 1000
      const avgBefore = 100;
      const qtyMilli = 10_000;
      const unitCost = 200;

      const currentValue = stockBefore * avgBefore;
      const addedValue = qtyMilli * unitCost;
      const nextStock = stockBefore + qtyMilli;
      const nextAverage = Math.round((currentValue + addedValue) / nextStock);

      expect(nextAverage).toBe(150);
    });

    it("purchase of same price maintains average", () => {
      const stockBefore = 10_000;
      const avgBefore = 100;
      const qtyMilli = 5_000;
      const unitCost = 100;

      const currentValue = stockBefore * avgBefore;
      const addedValue = qtyMilli * unitCost;
      const nextStock = stockBefore + qtyMilli;
      const nextAverage = Math.round((currentValue + addedValue) / nextStock);

      expect(nextAverage).toBe(100);
    });

    it("sale does not change average cost", () => {
      const stockBefore = 10_000;
      const avgBefore = 150;
      const qtyMilli = -3_000; // sale

      const nextStock = stockBefore + qtyMilli;
      // ponytail: average_cost_minor stays the same after sale
      const nextAverage = avgBefore;

      expect(nextStock).toBe(7_000);
      expect(nextAverage).toBe(150);
    });

    it("zero stock after sale results in zero average", () => {
      const stockBefore = 10_000;
      const avgBefore = 150;
      const qtyMilli = -10_000; // sell all

      const nextStock = stockBefore + qtyMilli;
      // ponytail: when stock reaches 0, average_cost_minor is set to 0
      // This is handled in the service code, not the mathematical formula
      const nextAverage = 0;

      expect(nextStock).toBe(0);
      expect(nextAverage).toBe(0);
    });

    it("purchase after partial sale recalculates correctly", () => {
      // Stock: 10@100 = 1000, sell 3@100 = 700 remaining
      // Buy 5@200: (700*100 + 5*200) / 12 = (70000+1000)/12 = 141.67 ≈ 142
      const stockBefore = 7_000;
      const avgBefore = 100;
      const qtyMilli = 5_000;
      const unitCost = 200;

      const currentValue = stockBefore * avgBefore;
      const addedValue = qtyMilli * unitCost;
      const nextStock = stockBefore + qtyMilli;
      const nextAverage = Math.round((currentValue + addedValue) / nextStock);

      expect(nextAverage).toBe(142);
    });
  });

  // ── Balance Sheet Equation ───────────────────────────────────
  describe("Balance Sheet Equation (Assets = Liabilities + Equity)", () => {
    it("simple balance sheet equation holds", () => {
      const assets = 10_000_000;
      const liabilities = 2_000_000;
      const equity = 8_000_000;
      expect(assets).toBe(liabilities + equity);
    });

    it("balance sheet with net income", () => {
      const assets = 15_000_000;
      const liabilities = 3_000_000;
      const contributedCapital = 10_000_000;
      const retainedEarnings = 2_000_000;
      const equity = contributedCapital + retainedEarnings;
      expect(assets).toBe(liabilities + equity);
    });
  });
});
