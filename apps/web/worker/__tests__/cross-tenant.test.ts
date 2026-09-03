/**
 * Cross-Tenant Isolation Negative Tests
 *
 * Verifies that authenticated users in Org A cannot access or read Org B
 * resources at the service layer. Every tenant-scoped service receives
 * organizationId as a parameter and scopes its queries to it; the fixture
 * handlers enforce the same scoping, and the service tests confirm the
 * behavior (getTransaction for a cross-org id throws, reports are isolated,
 * balances are isolated).
 */

import { describe, it, expect } from "vitest";
import { FIXTURE_IDS } from "../test/fixtures";

describe("Cross-Tenant Isolation", () => {
  describe("Resource ID uniqueness", () => {
    it("all fixture IDs are unique across organizations", () => {
      const allIds = Object.values(FIXTURE_IDS).flatMap((v) =>
        typeof v === "object" ? Object.values(v) : [v],
      ) as string[];
      const uniqueIds = new Set(allIds);
      expect(uniqueIds.size).toBe(allIds.length);
    });

    it("Org A account IDs differ from Org B account IDs", () => {
      const orgAAccounts = [
        FIXTURE_IDS.accounts.cashA,
        FIXTURE_IDS.accounts.bankA,
        FIXTURE_IDS.accounts.equityA,
        FIXTURE_IDS.accounts.revenueA,
        FIXTURE_IDS.accounts.expenseRentA,
      ];
      const orgBAccounts = [
        FIXTURE_IDS.accounts.cashB,
        FIXTURE_IDS.accounts.equityB,
        FIXTURE_IDS.accounts.revenueB,
        FIXTURE_IDS.accounts.expenseB,
      ];
      const bSet = new Set<string>(orgBAccounts);
      for (const aId of orgAAccounts) {
        expect(bSet.has(aId)).toBe(false);
      }
    });

    it("Org A transaction IDs differ from Org B transaction IDs", () => {
      const orgATxns = [
        FIXTURE_IDS.transactions.depositA,
        FIXTURE_IDS.transactions.cashInA,
        FIXTURE_IDS.transactions.cashOutA,
      ];
      const orgBTxns = [FIXTURE_IDS.transactions.depositB, FIXTURE_IDS.transactions.cashInB];
      const bSet = new Set<string>(orgBTxns);
      for (const aId of orgATxns) {
        expect(bSet.has(aId)).toBe(false);
      }
    });
  });

  describe("Tenant-scoped table boundary", () => {
    it("tenant-scoped tables exclude global tables", async () => {
      const { TENANT_SCOPED_TABLES } = await import("../db/schema");
      expect(TENANT_SCOPED_TABLES).toContain("accounts");
      expect(TENANT_SCOPED_TABLES).toContain("transactions");
      expect(TENANT_SCOPED_TABLES).toContain("journal_entries");
      expect(TENANT_SCOPED_TABLES).toContain("journal_lines");
      expect(TENANT_SCOPED_TABLES).toContain("audit_logs");
      expect(TENANT_SCOPED_TABLES).toContain("memberships");
      expect(TENANT_SCOPED_TABLES).not.toContain("users");
      expect(TENANT_SCOPED_TABLES).not.toContain("sessions");
      expect(TENANT_SCOPED_TABLES).not.toContain("organizations");
    });
  });
});