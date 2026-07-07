import { describe, expect, it } from "vitest";
import {
  deleteAccount,
  nextCashBankCode,
  patchAccount,
} from "./accounts.service";

interface FakeAccountRow {
  id: string;
  code: number;
  name: string;
  account_type: string;
  normal_balance: string;
  parent_account_id: string | null;
  is_system: 0 | 1;
  is_locked: 0 | 1;
  is_active: 0 | 1;
  is_cash_account: 0 | 1;
  cash_account_type: string | null;
  report_group: string | null;
}

class FakeD1Statement {
  private values: unknown[] = [];

  constructor(
    private readonly db: FakeD1Database,
    private readonly sql: string,
  ) {}

  bind(...values: unknown[]): FakeD1Statement {
    this.values = values;
    return this;
  }

  async first<T>(): Promise<T | null> {
    return this.db.first<T>(this.sql, this.values);
  }

  async all<T>(): Promise<{ results: T[] }> {
    return { results: [] };
  }

  async run(): Promise<D1Result> {
    this.db.run(this.sql);
    return { success: true } as D1Result;
  }
}

class FakeD1Database {
  public deleteCalls = 0;
  public updateCalls = 0;

  constructor(private readonly account: FakeAccountRow | null) {}

  prepare(sql: string): FakeD1Statement {
    return new FakeD1Statement(this, sql);
  }

  async first<T>(sql: string, values: unknown[]): Promise<T | null> {
    if (sql.includes("FROM accounts") && values[0] === this.account?.id) {
      return this.account as T;
    }
    return null;
  }

  run(sql: string): void {
    if (sql.startsWith("DELETE FROM accounts")) this.deleteCalls += 1;
    if (sql.startsWith("UPDATE accounts")) this.updateCalls += 1;
  }
}

function account(overrides: Partial<FakeAccountRow> = {}): FakeAccountRow {
  return {
    id: "account-1",
    code: 1110,
    name: "Kas",
    account_type: "asset",
    normal_balance: "debit",
    parent_account_id: null,
    is_system: 1,
    is_locked: 1,
    is_active: 1,
    is_cash_account: 1,
    cash_account_type: "cash",
    report_group: "Kas",
    ...overrides,
  };
}

describe("account code generation", () => {
  it("skips reserved default cash and bank codes", () => {
    expect(nextCashBankCode([1110], "cash")).toBe(1111);
    expect(nextCashBankCode([1120], "bank")).toBe(1121);
  });

  it("uses the first available gap in deterministic order", () => {
    expect(nextCashBankCode([1111, 1112, 1114], "cash")).toBe(1113);
    expect(nextCashBankCode([1121, 1123], "bank")).toBe(1122);
  });

  it("returns null when the range is exhausted", () => {
    expect(
      nextCashBankCode([1111, 1112, 1113, 1114, 1115, 1116, 1117, 1118, 1119], "cash"),
    ).toBeNull();
  });
});

describe("account safety rules", () => {
  it("blocks deleting system accounts", async () => {
    const db = new FakeD1Database(account()) as unknown as D1Database;

    await expect(
      deleteAccount(db, "org-1", "user-1", "account-1"),
    ).rejects.toMatchObject({
      code: "account_protected",
      status: 403,
    });
  });

  it("blocks renaming locked accounts", async () => {
    const db = new FakeD1Database(account()) as unknown as D1Database;

    await expect(
      patchAccount(db, "org-1", "user-1", "account-1", { name: "Kas Baru" }),
    ).rejects.toMatchObject({
      code: "account_locked",
      status: 403,
    });
  });
});
