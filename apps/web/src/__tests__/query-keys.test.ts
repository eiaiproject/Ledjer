/**
 * Query key uniqueness test.
 * Ensures distinct account/product query keys are never equal,
 * preventing React Query cache collisions for incompatible data shapes.
 */
import { describe, it, expect } from "vitest";
import { queryKeys } from "@/lib/query-keys";

const ORG_ID = "test-org-123";

describe("queryKeys", () => {
  describe("accounts", () => {
    it("fullList and activeTransactionOptions have different keys", () => {
      const fullList = queryKeys.accounts.fullList(ORG_ID);
      const txnOptions = queryKeys.accounts.activeTransactionOptions(ORG_ID);
      expect(fullList).not.toEqual(txnOptions);
    });

    it("fullList and expenseCogsOptions have different keys", () => {
      const fullList = queryKeys.accounts.fullList(ORG_ID);
      const expenseCogs = queryKeys.accounts.expenseCogsOptions(ORG_ID);
      expect(fullList).not.toEqual(expenseCogs);
    });

    it("fullList and ledgerOptions have different keys", () => {
      const fullList = queryKeys.accounts.fullList(ORG_ID);
      const ledger = queryKeys.accounts.ledgerOptions(ORG_ID);
      expect(fullList).not.toEqual(ledger);
    });

    it("activeTransactionOptions and expenseCogsOptions have different keys", () => {
      const txnOptions = queryKeys.accounts.activeTransactionOptions(ORG_ID);
      const expenseCogs = queryKeys.accounts.expenseCogsOptions(ORG_ID);
      expect(txnOptions).not.toEqual(expenseCogs);
    });

    it("all() prefix matches all account query keys", () => {
      const allPrefix = queryKeys.accounts.all(ORG_ID);
      const fullList = queryKeys.accounts.fullList(ORG_ID);
      const txnOptions = queryKeys.accounts.activeTransactionOptions(ORG_ID);
      const expenseCogs = queryKeys.accounts.expenseCogsOptions(ORG_ID);
      const ledger = queryKeys.accounts.ledgerOptions(ORG_ID);

      // all() should be a prefix of all other account keys
      expect(fullList[0]).toBe(allPrefix[0]);
      expect(fullList[1]).toBe(allPrefix[1]);
      expect(txnOptions[0]).toBe(allPrefix[0]);
      expect(txnOptions[1]).toBe(allPrefix[1]);
      expect(expenseCogs[0]).toBe(allPrefix[0]);
      expect(expenseCogs[1]).toBe(allPrefix[1]);
      expect(ledger[0]).toBe(allPrefix[0]);
      expect(ledger[1]).toBe(allPrefix[1]);
    });
  });

  describe("products", () => {
    it("fullList and transactionOptions have different keys", () => {
      const fullList = queryKeys.products.fullList(ORG_ID);
      const txnOptions = queryKeys.products.transactionOptions(ORG_ID);
      expect(fullList).not.toEqual(txnOptions);
    });

    it("all() prefix matches all product query keys", () => {
      const allPrefix = queryKeys.products.all(ORG_ID);
      const fullList = queryKeys.products.fullList(ORG_ID);
      const txnOptions = queryKeys.products.transactionOptions(ORG_ID);

      expect(fullList[0]).toBe(allPrefix[0]);
      expect(fullList[1]).toBe(allPrefix[1]);
      expect(txnOptions[0]).toBe(allPrefix[0]);
      expect(txnOptions[1]).toBe(allPrefix[1]);
    });
  });

  describe("parties", () => {
    it("all() prefix matches party query keys", () => {
      const allPrefix = queryKeys.parties.all(ORG_ID);
      const txnOptions = queryKeys.parties.transactionOptions(ORG_ID);

      expect(txnOptions[0]).toBe(allPrefix[0]);
      expect(txnOptions[1]).toBe(allPrefix[1]);
    });
  });

  describe("org-scoped isolation", () => {
    it("different org IDs produce different keys", () => {
      const org1 = "org-1";
      const org2 = "org-2";

      expect(queryKeys.accounts.fullList(org1)).not.toEqual(queryKeys.accounts.fullList(org2));
      expect(queryKeys.products.fullList(org1)).not.toEqual(queryKeys.products.fullList(org2));
    });
  });
});
