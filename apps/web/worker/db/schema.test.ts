import { describe, expect, it } from "vitest";
import {
  ACCOUNT_CLASS_VALUES,
  CORE_INDEXES,
  CORE_TABLES,
  ROLE_VALUES,
  TENANT_SCOPED_TABLES,
  TRANSACTION_STATUS_VALUES,
  TRANSACTION_TYPE_VALUES,
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
    expect(TENANT_SCOPED_TABLES).not.toContain("organizations");
  });

  it("uses the MVP role and accounting enum values", () => {
    expect(ROLE_VALUES).toEqual(["owner"]);
    expect(ACCOUNT_CLASS_VALUES).toEqual([
      "asset",
      "liability",
      "equity",
      "income",
      "expense",
    ]);
    expect(TRANSACTION_TYPE_VALUES).toEqual([
      "cash_in",
      "cash_out",
      "transfer",
      "owner_deposit",
      "owner_withdrawal",
    ]);
    expect(TRANSACTION_STATUS_VALUES).toEqual(["posted", "voided"]);
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