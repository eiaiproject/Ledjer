import { describe, expect, it } from "vitest";
import {
  ACCOUNT_TYPE_VALUES,
  CORE_INDEXES,
  CORE_TABLES,
  NORMAL_BALANCE_VALUES,
  ROLE_VALUES,
  TENANT_SCOPED_TABLES,
} from "./schema";
import { normalizeD1Value, normalizeD1Values } from "./client";

function expectUnique(values: readonly string[]): void {
  expect(new Set(values).size).toBe(values.length);
}

describe("D1 schema contract", () => {
  it("lists core tables and indexes without duplicates", () => {
    expectUnique(CORE_TABLES);
    expectUnique(TENANT_SCOPED_TABLES);
    expectUnique(CORE_INDEXES);

    expect(CORE_TABLES).toContain("journal_entries");
    expect(CORE_TABLES).toContain("journal_lines");
    expect(CORE_TABLES).toContain("audit_logs");
    expect(CORE_INDEXES).toContain("idx_journal_lines_org_account");
  });

  it("keeps every tenant table scoped by organization", () => {
    for (const table of TENANT_SCOPED_TABLES) {
      expect(CORE_TABLES).toContain(table);
    }

    expect(TENANT_SCOPED_TABLES).not.toContain("users");
    expect(TENANT_SCOPED_TABLES).not.toContain("sessions");
  });

  it("CORE_TABLES excludes system/global tables from tenant scope", () => {
    // These tables are NOT in TENANT_SCOPED_TABLES because they store
    // global data (users) or session/auth data (sessions, tokens).
    // They don't have organization_id columns or the column is not the
    // primary scoping mechanism.
    expect(TENANT_SCOPED_TABLES).not.toContain("email_verifications");
    expect(TENANT_SCOPED_TABLES).not.toContain("password_reset_tokens");
    expect(TENANT_SCOPED_TABLES).not.toContain("login_attempts");
    expect(TENANT_SCOPED_TABLES).not.toContain("oauth_accounts");
  });

  it("audit_logs and period_locks are tenant-scoped", () => {
    expect(TENANT_SCOPED_TABLES).toContain("audit_logs");
    expect(TENANT_SCOPED_TABLES).toContain("period_locks");
    expect(TENANT_SCOPED_TABLES).toContain("organization_members");
  });

  it("uses target role and accounting enum values", () => {
    expect(ROLE_VALUES).toEqual(["owner", "admin", "member", "viewer"]);
    expect(ACCOUNT_TYPE_VALUES).toContain("cogs");
    expect(NORMAL_BALANCE_VALUES).toEqual(["debit", "credit"]);
  });
});

describe("D1 client helpers", () => {
  it("normalizes values for SQLite bindings", () => {
    expect(normalizeD1Value(true)).toBe(1);
    expect(normalizeD1Value(false)).toBe(0);
    expect(normalizeD1Value(undefined)).toBeNull();
    expect(normalizeD1Values(["x", 1, false, undefined])).toEqual([
      "x",
      1,
      0,
      null,
    ]);
  });


});
