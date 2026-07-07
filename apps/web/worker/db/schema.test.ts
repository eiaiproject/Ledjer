import { describe, expect, it } from "vitest";
import {
  ACCOUNT_TYPE_VALUES,
  CORE_INDEXES,
  CORE_TABLES,
  NORMAL_BALANCE_VALUES,
  ROLE_VALUES,
  TENANT_SCOPED_TABLES,
} from "./schema";
import { normalizeD1Value, normalizeD1Values, nowMs } from "./client";

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

  it("creates millisecond timestamps", () => {
    expect(nowMs(new Date("2026-07-07T00:00:00.123Z"))).toBe(1783382400123);
  });
});
