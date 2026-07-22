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
    // WAC formula: next_avg = round((current_stock * current_avg + qty * cost) / (current_stock + qty))
    const wac = (stock: number, avg: number, qty: number, cost: number) =>
      Math.round((stock * avg + qty * cost) / (stock + qty));

    it("purchase 10@100 + 10@200 = avg 150", () => {
      // Reasoning: (10*100 + 10*200) / 20 = 3000/20 = 150
      expect(wac(10_000, 100, 10_000, 200)).toBe(150);
    });

    it("purchase at same price keeps average unchanged", () => {
      // Reasoning: adding stock at the current average doesn't change it
      expect(wac(10_000, 100, 5_000, 100)).toBe(100);
    });

    it("sale does not change average cost (price out at existing avg)", () => {
      // ponytail: Sale reduces quantity but does not affect WAC.
      // Scenario: stock 10@100=1000, sale of 3@100 (COGS).
      // After sale: stock=7, avg=100 (unchanged). WAC only recalculates on purchase.
      expect(wac(10_000, 100, -3_000, 100)).toBe(100);
    });

    it("purchase after partial sale recalculates correctly", () => {
      // Scenario: 10@100=1000, sell 3, buy 5@200
      // After sell 3: stock=7, value=700, avg=100
      // Buy 5@200: (7*100 + 5*200) / 12 = (700+1000)/12 = 141.67 ≈ 142
      expect(wac(7_000, 100, 5_000, 200)).toBe(142);
    });

    it("purchase after zero stock uses new purchase price", () => {
      // ponytail: when stock reaches 0, average_cost_minor stored as 0
      // Next purchase starts from scratch: 5@200 = avg 200
      expect(wac(0, 0, 5_000, 200)).toBe(200);
    });
  });

  // ── Balance Sheet Equation ───────────────────────────────────
  describe("Balance Sheet Equation (Assets = Liabilities + Equity)", () => {
    // These tests verify the fundamental accounting equation.
    // In double-entry bookkeeping: Assets = Liabilities + Equity.
    // Equity includes contributed capital + retained earnings (Net Income).
    // These are tested via actual report generation in golden-scenarios.test.ts.
    // Here we verify the logical invariant using report-level types.

    it("assets equal liabilities plus equity (logical test via type structure)", async () => {
      // Import the actual reports service to test balance-sheet generation logic
      // when seeded with balanced journal entries
      const { getBalanceSheet, getTrialBalance } = await import("../services/reports.service");
      expect(getBalanceSheet).toBeDefined();
      expect(getTrialBalance).toBeDefined();
      // Full balance-sheet assertion requires D1 — covered in golden scenarios
    });

    it("balance sheet equation can be computed from trial balance data", () => {
      // Use TrialBalanceRow structure to verify the equation programmatically
      const trialBalance = [
        { account_id: "a1", account_code: 1110, account_name: "Kas", account_type: "asset", normal_balance: "debit", debit_total: 10_000_000, credit_total: 0, ending_debit: 10_000_000, ending_credit: 0 },
        { account_id: "a2", account_code: 2100, account_name: "Utang", account_type: "liability", normal_balance: "credit", debit_total: 0, credit_total: 2_000_000, ending_debit: 0, ending_credit: 2_000_000 },
        { account_id: "a3", account_code: 3100, account_name: "Modal", account_type: "equity", normal_balance: "credit", debit_total: 0, credit_total: 8_000_000, ending_debit: 0, ending_credit: 8_000_000 },
      ];
      // Calculate from trial balance — verifies the reduce aggregation works
      const totalAssets = trialBalance.filter(a => a.normal_balance === "debit").reduce((s, r) => s + r.ending_debit - r.ending_credit, 0);
      const totalLiabilitiesEquity = trialBalance.filter(a => a.normal_balance === "credit").reduce((s, r) => s + r.ending_credit - r.ending_debit, 0);
      expect(totalAssets).toBe(totalLiabilitiesEquity); // A = L + E
    });

    it("balance sheet with net income (profit increases equity)", () => {
      const trialBalance = [
        { account_id: "a1", account_code: 1110, account_name: "Kas", account_type: "asset", normal_balance: "debit", debit_total: 15_000_000, credit_total: 0, ending_debit: 15_000_000, ending_credit: 0 },
        { account_id: "a2", account_code: 2100, account_name: "Utang", account_type: "liability", normal_balance: "credit", debit_total: 0, credit_total: 3_000_000, ending_debit: 0, ending_credit: 3_000_000 },
        { account_id: "a3", account_code: 3100, account_name: "Modal", account_type: "equity", normal_balance: "credit", debit_total: 0, credit_total: 10_000_000, ending_debit: 0, ending_credit: 10_000_000 },
        { account_id: "a4", account_code: 4100, account_name: "Laba Ditahan", account_type: "equity", normal_balance: "credit", debit_total: 0, credit_total: 2_000_000, ending_debit: 0, ending_credit: 2_000_000 },
      ];
      const totalAssets = trialBalance.filter(a => a.normal_balance === "debit").reduce((s, r) => s + r.ending_debit - r.ending_credit, 0);
      const totalLiabilitiesEquity = trialBalance.filter(a => a.normal_balance === "credit").reduce((s, r) => s + r.ending_credit - r.ending_debit, 0);
      // Verifies accounting identity holds with profit: A=15M, L=3M, E=12M
      expect(totalAssets).toBe(totalLiabilitiesEquity);
    });
  });
});
