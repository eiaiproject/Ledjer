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

  describe("transactions", () => {
    it("all() prefix matches list and detail query keys", () => {
      const allPrefix = queryKeys.transactions.all();
      const listKey = queryKeys.transactions.list(ORG_ID, "search");
      const detailKey = queryKeys.transactions.detail("id-123");

      expect(listKey[0]).toBe(allPrefix[0]);
      expect(detailKey[0]).toBe("transaction"); // Detail doesn't use prefix, it uses "transaction" key directly
    });
  });

  describe("journalEntries", () => {
    it("all() prefix matches detail query keys", () => {
      const allPrefix = queryKeys.journalEntries.all();
      const detailKey = queryKeys.journalEntries.detail("id-123");

      expect(detailKey[0]).toBe(allPrefix[0]);
    });
  });

  describe("newly consolidated keys", () => {
    it("allDashboard, profile, and allOrganization return correct static/dynamic keys", () => {
      expect(queryKeys.allDashboard()).toEqual(["dashboard"]);
      expect(queryKeys.profile("user-123")).toEqual(["profile", "user-123"]);
      expect(queryKeys.allOrganization()).toEqual(["organization"]);
    });

    it("monthlyUsage and allMonthlyUsage return correct keys", () => {
      expect(queryKeys.monthlyUsage(ORG_ID)).toEqual(["monthly-usage", ORG_ID]);
      expect(queryKeys.allMonthlyUsage()).toEqual(["monthly-usage"]);
    });
  });
});
