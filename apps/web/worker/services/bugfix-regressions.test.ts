import { describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import type { D1Database } from "@cloudflare/workers-types";
import { FakeD1Database } from "../test/fake-d1";
import { SqliteD1 } from "../test/sqlite-d1";
import { FakeR2Bucket } from "../test/fake-r2";
import { createSeedFixtures, FIXTURE_IDS } from "../test/fixtures";
import { HttpError } from "../http/errors";
import { normalizeDate } from "../http/date";

const ORG_A = FIXTURE_IDS.orgs.a;
const OWNER_A = FIXTURE_IDS.users.ownerA;

function emptyD1(): D1Database {
  return new FakeD1Database({ all: async () => [] }) as unknown as D1Database;
}

describe("M1: normalizeDate rejects impossible calendar dates", () => {
  it("rejects month 13", () => {
    expect(() => normalizeDate("2026-13-01", "transaction_date_invalid")).toThrowError(HttpError);
  });
  it("rejects Feb 30", () => {
    expect(() => normalizeDate("2026-02-30", "transaction_date_invalid")).toThrowError(HttpError);
  });
  it("rejects Feb 29 on non-leap years", () => {
    expect(() => normalizeDate("2023-02-29", "transaction_date_invalid")).toThrowError(HttpError);
  });
  it("accepts leap-day and month-end dates", () => {
    expect(normalizeDate("2024-02-29", "transaction_date_invalid")).toBe("2024-02-29");
    expect(normalizeDate("2026-01-31", "transaction_date_invalid")).toBe("2026-01-31");
  });
});

describe("M2: updateOrganization validates the name", () => {
  it("rejects a blank name without writing", async () => {
    const { getOrganizationContextForUser } = await import("./organization.service");
    const { updateOrganization } = await import("./organization.service");
    const { db } = createSeedFixtures();
    const d1 = db as unknown as D1Database;
    await expect(updateOrganization(d1, ORG_A, OWNER_A, "   ")).rejects.toThrowError(HttpError);
    const ctx = await getOrganizationContextForUser(d1, OWNER_A, ORG_A);
    expect(ctx?.organization.name).not.toBe("");
  });
  it("rejects names over 120 chars", async () => {
    const { updateOrganization } = await import("./organization.service");
    const { db } = createSeedFixtures();
    await expect(updateOrganization(db as unknown as D1Database, ORG_A, OWNER_A, "x".repeat(121))).rejects.toThrowError(
      HttpError,
    );
  });
  it("persists a valid rename", async () => {
    const { getOrganizationContextForUser, updateOrganization } = await import("./organization.service");
    const { db } = createSeedFixtures();
    const d1 = db as unknown as D1Database;
    await updateOrganization(d1, ORG_A, OWNER_A, "Warung Baru");
    const ctx = await getOrganizationContextForUser(d1, OWNER_A, ORG_A);
    expect(ctx?.organization.name).toBe("Warung Baru");
  });
});

describe("H1: transaction CSV export counts before materializing rows", () => {
  it("rejects over-limit exports without fetching rows", async () => {
    const { exportTransactionsCsv } = await import("./exports.service");
    const db = new FakeD1Database({
      first: async (sql: string) => {
        if (String(sql).includes("COUNT(*)")) return { c: 60000 };
        return null;
      },
      all: async () => {
        throw new Error("must not fetch rows when over limit");
      },
    }) as unknown as D1Database;
    const err = await exportTransactionsCsv(db, "org-1", {}).then(
      () => null,
      (e: unknown) => e as HttpError,
    );
    expect(err).toBeInstanceOf(HttpError);
    expect(err?.code).toBe("export_too_large");
  });
});

describe("L5c: transaction search escapes LIKE wildcards", () => {
  function seedDb(): SqliteD1 {
    const sqlite = new DatabaseSync(":memory:");
    const db = new SqliteD1(sqlite);
    db.exec(`CREATE TABLE accounts (
      id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, code TEXT NOT NULL,
      name TEXT NOT NULL, account_class TEXT NOT NULL, account_subtype TEXT
    );`);
    db.exec(`CREATE TABLE transactions (
      id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, transaction_number TEXT NOT NULL,
      transaction_type TEXT NOT NULL, transaction_date TEXT NOT NULL, description TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'posted', amount_idr INTEGER NOT NULL,
      cash_account_id TEXT, counter_account_id TEXT, created_by TEXT NOT NULL,
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
      voided_at INTEGER, void_reason TEXT
    );`);
    db.exec(`INSERT INTO accounts (id, organization_id, code, name, account_class, account_subtype)
             VALUES ('acct-cash', 'org-1', '1110', 'Kas', 'asset', 'cash'),
                    ('acct-rev', 'org-1', '4110', 'Pendapatan', 'income', NULL)`);
    const cols = `id, organization_id, transaction_number, transaction_type, transaction_date,
      description, status, amount_idr, cash_account_id, counter_account_id, created_by, created_at, updated_at`;
    for (const [id, num, desc] of [
      ["t1", "TRX-000001", "Diskon 100% khusus"],
      ["t2", "TRX-000002", "gaji_bulanan"],
      ["t3", "TRX-000003", "gaji bulanan"],
    ] as const) {
      sqlite
        .prepare(`INSERT INTO transactions (${cols}) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(id, "org-1", num, "cash_in", "2026-06-01", desc, "posted", 1000, "acct-cash", "acct-rev", "u1", 1, 1);
    }
    return db;
  }
  it("treats _ as a literal character", async () => {
    const { listTransactions } = await import("./transactions.service");
    const rows = await listTransactions(seedDb() as unknown as D1Database, "org-1", { search: "_" });
    expect(rows.map((r) => r.id)).toEqual(["t2"]);
  });
  it("treats % as a literal character", async () => {
    const { listTransactions } = await import("./transactions.service");
    const rows = await listTransactions(seedDb() as unknown as D1Database, "org-1", { search: "100%" });
    expect(rows.map((r) => r.id)).toEqual(["t1"]);
  });
});

describe("M4: idempotency keys are bound to their payload", () => {
  const base = {
    transactionType: "cash_in" as const,
    transactionDate: "2026-06-15",
    cashAccountId: FIXTURE_IDS.accounts.cashA,
    counterAccountId: FIXTURE_IDS.accounts.revenueA,
    amountIdr: 100000,
    description: "Jasa layanan",
    idempotencyKey: "idem-repro-mismatch-01",
  };
  it("rejects a reused key with a different payload", async () => {
    const { postTransaction } = await import("./transactions.service");
    const { db } = createSeedFixtures();
    const d1 = db as unknown as D1Database;
    await postTransaction(d1, ORG_A, OWNER_A, base);
    const err = await postTransaction(d1, ORG_A, OWNER_A, { ...base, amountIdr: 999999 }).then(
      () => null,
      (e: unknown) => e as HttpError,
    );
    expect(err).toBeInstanceOf(HttpError);
    expect(err?.code).toBe("idempotency_key_reused");
  });
  it("still replays the identical payload", async () => {
    const { postTransaction } = await import("./transactions.service");
    const { db } = createSeedFixtures();
    const d1 = db as unknown as D1Database;
    const first = await postTransaction(d1, ORG_A, OWNER_A, { ...base, idempotencyKey: "idem-repro-same-01" });
    const replay = await postTransaction(d1, ORG_A, OWNER_A, { ...base, idempotencyKey: "idem-repro-same-01" });
    expect(replay.transaction_id).toBe(first.transaction_id);
    expect(replay.replayed).toBe(true);
  });
});

describe("L1: backup manifest hash verifies correctly", () => {
  it("created backups carry no integrity warning", async () => {
    const { createBackup } = await import("./backup.service");
    const bucket = new FakeR2Bucket();
    const manifest = await createBackup(emptyD1(), bucket as unknown as R2Bucket, Date.parse("2026-08-01T00:00:00Z"));
    expect("integrity_warning" in manifest).toBe(false);
    const stored = JSON.parse(await (await bucket.get("backups/2026-08-01/manifest.json"))!.text());
    expect(stored.sha256).toBe(manifest.sha256);
  });
});

describe("L2: backup retention deletes anything older than 30 days", () => {
  it("removes a 60-day-old backup while keeping a recent one", async () => {
    const { createBackup } = await import("./backup.service");
    const bucket = new FakeR2Bucket();
    await bucket.put("backups/2026-01-01/manifest.json", "{}");
    await bucket.put("backups/2026-07-27/manifest.json", "{}");
    await createBackup(emptyD1(), bucket as unknown as R2Bucket, Date.parse("2026-08-01T00:00:00Z"));
    expect(bucket.keys().some((k) => k.startsWith("backups/2026-01-01/"))).toBe(false);
    expect(bucket.keys().some((k) => k.startsWith("backups/2026-07-27/"))).toBe(true);
  });
});

describe("M5: restore writes in bounded batches", () => {
  it("chunks large restores to at most 200 statements per batch", async () => {
    const { restoreBackup } = await import("./backup.service");
    const bucket = new FakeR2Bucket();
    const dateStr = "2026-06-15";
    const orgs = Array.from({ length: 250 }, (_, i) => ({ id: `org-${i}` }));
    await bucket.put(`backups/${dateStr}/organizations.json`, JSON.stringify(orgs));
    await bucket.put(`backups/${dateStr}/users.json`, JSON.stringify([]));
    await bucket.put(
      `backups/${dateStr}/manifest.json`,
      JSON.stringify({ startedAt: 1, completedAt: 2, version: 1, tables: { organizations: { rowCount: 250 }, users: { rowCount: 0 } }, sha256: "" }),
    );
    const batchSizes: number[] = [];
    const db = new FakeD1Database({
      first: async () => ({ count: 0 }),
      batch: async (statements: { sql: string; values: unknown[] }[]) => {
        batchSizes.push(statements.length);
        return statements.map(() => ({ success: true, meta: { changes: 1 } }) as D1Result);
      },
    }) as unknown as D1Database;
    const result = await restoreBackup(db, bucket as unknown as R2Bucket, dateStr);
    expect(result.success).toBe(true);
    expect(result.tables.organizations.restored).toBe(250);
    expect(Math.max(...batchSizes)).toBeLessThanOrEqual(200);
  });
});

describe("L5a: account usage ignores voided transactions", () => {
  it("returns false when only voided transactions reference the account", async () => {
    const { accountIsUsed } = await import("./accounts.service");
    const sqlite = new DatabaseSync(":memory:");
    const db = new SqliteD1(sqlite);
    db.exec(`CREATE TABLE transactions (
      organization_id TEXT NOT NULL, cash_account_id TEXT, counter_account_id TEXT, status TEXT NOT NULL
    );`);
    sqlite.prepare(`INSERT INTO transactions VALUES (?,?,?,?)`).run("org-1", "acct-x", "acct-y", "voided");
    expect(await accountIsUsed(db as unknown as D1Database, "org-1", "acct-x")).toBe(false);
    sqlite.prepare(`INSERT INTO transactions VALUES (?,?,?,?)`).run("org-1", "acct-x", "acct-y", "posted");
    expect(await accountIsUsed(db as unknown as D1Database, "org-1", "acct-x")).toBe(true);
  });
});

describe("L3: session reads throttle last_used_at writes", () => {
  function rowWith(overrides: Record<string, unknown>) {
    const now = Date.now();
    return {
      session_id: "session-1", user_id: "user-1", expires_at: now + 86_400_000,
      current_organization_id: null, email: "t@t.co", full_name: "T",
      last_used_at: now, created_at: now, ...overrides,
    };
  }
  it("skips the write when last_used_at is fresh", async () => {
    const { getSessionByToken } = await import("./session.service");
    const db = new FakeD1Database({ first: async () => rowWith({}) });
    await getSessionByToken(db as unknown as D1Database, "tok");
    expect(db.statements).toHaveLength(0);
  });
  it("writes when last_used_at is an hour old", async () => {
    const { getSessionByToken } = await import("./session.service");
    const now = Date.now();
    const db = new FakeD1Database({
      first: async () => rowWith({ last_used_at: now - 3_600_000, created_at: now - 3_600_000 }),
    });
    await getSessionByToken(db as unknown as D1Database, "tok");
    expect(db.statements.length).toBeGreaterThan(0);
  });
});

describe("L5b: cash/bank creation retries on code collision", () => {
  it("retries once after a UNIQUE violation", async () => {
    const { createCashBankAccount } = await import("./accounts.service");
    let inserts = 0;
    const db = new FakeD1Database({
      first: async (sql: string) => {
        if (String(sql).includes("MAX(")) return { max_code: 1120 };
        if (String(sql).includes("FROM accounts WHERE id")) {
          return { id: "a1", organization_id: "org-1", code: "1130", name: "Kas Baru", account_class: "asset", account_subtype: "bank", is_system: 0, is_active: 1, created_at: 1, updated_at: 1 };
        }
        return null;
      },
      run: async (sql: string) => {
        if (String(sql).includes("INSERT INTO accounts")) {
          inserts += 1;
          if (inserts === 1) throw new Error("UNIQUE constraint failed: accounts.organization_id, accounts.code");
        }
        return { success: true, meta: { changes: 1 } } as D1Result;
      },
    }) as unknown as D1Database;
    const account = await createCashBankAccount(db, "org-1", "user-1", { subtype: "bank", name: "Kas Baru" });
    expect(account.code).toBe("1130");
    expect(inserts).toBe(2);
  });
});
