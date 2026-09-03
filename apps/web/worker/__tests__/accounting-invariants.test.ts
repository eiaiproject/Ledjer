import { describe, it, expect } from "vitest";
import { assertJournalBalanced } from "../services/transactions.service";
import { HttpError } from "../http/errors";

/**
 * Accounting Invariant Tests
 *
 * Pure double-entry rules enforced by assertJournalBalanced: total debit must
 * equal total credit, and a single line may carry only one side.
 */
describe("Accounting Invariants", () => {
  describe("Journal Balance (Σdebit = Σcredit)", () => {
    it("accepts a balanced cash_in journal", () => {
      expect(() =>
        assertJournalBalanced([
          { accountId: "cash", debitIdr: 100000, creditIdr: 0 },
          { accountId: "revenue", debitIdr: 0, creditIdr: 100000 },
        ]),
      ).not.toThrow();
    });

    it("accepts a balanced cash_out journal", () => {
      expect(() =>
        assertJournalBalanced([
          { accountId: "expense", debitIdr: 50000, creditIdr: 0 },
          { accountId: "cash", debitIdr: 0, creditIdr: 50000 },
        ]),
      ).not.toThrow();
    });

    it("rejects debit != credit", () => {
      expect(() =>
        assertJournalBalanced([
          { accountId: "cash", debitIdr: 100000, creditIdr: 0 },
          { accountId: "revenue", debitIdr: 0, creditIdr: 90000 },
        ]),
      ).toThrowError(HttpError);
    });

    it("rejects a line carrying both debit and credit", () => {
      expect(() =>
        assertJournalBalanced([
          { accountId: "cash", debitIdr: 100000, creditIdr: 40000 },
          { accountId: "revenue", debitIdr: 0, creditIdr: 60000 },
        ]),
      ).toThrowError(HttpError);
    });

    // Negative/zero amounts are rejected at input validation (toIdr), not by
    // assertJournalBalanced, which only enforces balance and one-side lines.
  });
});