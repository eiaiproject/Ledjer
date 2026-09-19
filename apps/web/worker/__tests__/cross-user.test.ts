/**
 * Cross-User Isolation Negative Tests
 *
 * Ledjer is single-user (1 user = 1 buku), so isolation is between users, not
 * organizations. Every user-scoped service receives userId as a parameter and
 * scopes its queries to it; the fixture handlers enforce the same scoping, and
 * the service tests confirm the behavior (getTransaction for another user's id
 * throws, reports are isolated, balances are isolated).
 */

import { describe, it, expect } from "vitest";
import { FIXTURE_IDS } from "../test/fixtures";

describe("Cross-User Isolation", () => {
  describe("Resource ID uniqueness", () => {
    it("all fixture IDs are unique across books", () => {
      const allIds = Object.values(FIXTURE_IDS).flatMap((v) =>
        typeof v === "object" ? Object.values(v) : [v],
      ) as string[];
      const uniqueIds = new Set(allIds);
      expect(uniqueIds.size).toBe(allIds.length);
    });

    it("Book A account IDs differ from Book B account IDs", () => {
      const bookAAccounts = [
        FIXTURE_IDS.accounts.cashA,
        FIXTURE_IDS.accounts.bankA,
        FIXTURE_IDS.accounts.equityA,
        FIXTURE_IDS.accounts.revenueA,
        FIXTURE_IDS.accounts.expenseRentA,
      ];
      const bookBAccounts = [
        FIXTURE_IDS.accounts.cashB,
        FIXTURE_IDS.accounts.equityB,
        FIXTURE_IDS.accounts.revenueB,
        FIXTURE_IDS.accounts.expenseB,
      ];
      const bSet = new Set<string>(bookBAccounts);
      for (const aId of bookAAccounts) {
        expect(bSet.has(aId)).toBe(false);
      }
    });

    it("Book A transaction IDs differ from Book B transaction IDs", () => {
      const bookATxns = [
        FIXTURE_IDS.transactions.depositA,
        FIXTURE_IDS.transactions.cashInA,
        FIXTURE_IDS.transactions.cashOutA,
      ];
      const bookBTxns = [FIXTURE_IDS.transactions.depositB, FIXTURE_IDS.transactions.cashInB];
      const bSet = new Set<string>(bookBTxns);
      for (const aId of bookATxns) {
        expect(bSet.has(aId)).toBe(false);
      }
    });
  });

  describe("User-scoped table boundary", () => {
    it("user-scoped tables exclude global tables", async () => {
      const { USER_SCOPED_TABLES } = await import("../db/schema");
      expect(USER_SCOPED_TABLES).toContain("accounts");
      expect(USER_SCOPED_TABLES).toContain("transactions");
      expect(USER_SCOPED_TABLES).toContain("journal_entries");
      expect(USER_SCOPED_TABLES).toContain("journal_lines");
      expect(USER_SCOPED_TABLES).toContain("audit_logs");
      expect(USER_SCOPED_TABLES).not.toContain("users");
      expect(USER_SCOPED_TABLES).not.toContain("sessions");
    });
  });
});
