import { describe, expect, it, beforeAll } from "vitest";
import { DatabaseSync } from "node:sqlite";
import type { D1Database } from "@cloudflare/workers-types";
import { SqliteD1 } from "../test/sqlite-d1";
import { listTransactions } from "./transactions.service";

const ORG = "org-1";
const USER = "user-1";
const NOW = 1_750_000_000_000;

function createSchema(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE accounts (
      id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, code TEXT NOT NULL,
      name TEXT NOT NULL, account_class TEXT NOT NULL, account_subtype TEXT
    );
    CREATE TABLE transactions (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL,
      transaction_number TEXT NOT NULL,
      transaction_type TEXT NOT NULL,
      transaction_date TEXT NOT NULL,
      description TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'posted',
      amount_idr INTEGER NOT NULL,
      cash_account_id TEXT,
      counter_account_id TEXT,
      created_by TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      voided_at INTEGER,
      void_reason TEXT
    );
  `);
}

function insertTransaction(db: SqliteD1, row: Record<string, unknown>): Promise<void> {
  const columns = [
    "id", "organization_id", "transaction_number", "transaction_type", "transaction_date",
    "description", "status", "amount_idr", "cash_account_id", "counter_account_id",
    "created_by", "created_at", "updated_at", "voided_at", "void_reason",
  ];
  const values = columns.map((c) => row[c] ?? null) as (string | number | null)[];
  return db
    .prepare(
      `INSERT INTO transactions (${columns.join(", ")})
       VALUES (${columns.map(() => "?").join(", ")})`,
    )
    .bind(...values)
    .run()
    .then(() => undefined);
}

describe("listTransactions (real SQLite)", () => {
  let sqlite: DatabaseSync;
  let db: SqliteD1;

  beforeAll(() => {
    sqlite = new DatabaseSync(":memory:");
    createSchema(sqlite);
    db = new SqliteD1(sqlite);

    db.exec(`INSERT INTO accounts (id, organization_id, code, name, account_class, account_subtype)
             VALUES ('acct-cash', '${ORG}', '1110', 'Kas', 'asset', 'cash')`);
    db.exec(`INSERT INTO accounts (id, organization_id, code, name, account_class, account_subtype)
             VALUES ('acct-rev', '${ORG}', '4110', 'Pendapatan Usaha', 'income', NULL)`);

    return Promise.all([
      // Posted cash_in - must be visible.
      insertTransaction(db, {
        id: "txn-cashin", organization_id: ORG, transaction_number: "TRX-20260815-AB12",
        transaction_date: "2026-08-15", transaction_type: "cash_in", amount_idr: 81000,
        description: "Penjualan tunai", status: "posted",
        cash_account_id: "acct-cash", counter_account_id: "acct-rev",
        created_by: USER, created_at: NOW, updated_at: NOW,
      }),
      // Voided transaction - must be visible too (audit trail), with void reason.
      insertTransaction(db, {
        id: "txn-voided", organization_id: ORG, transaction_number: "TRX-20260816-CD34",
        transaction_date: "2026-08-16", transaction_type: "cash_out", amount_idr: 20000,
        description: "Beban dibatalkan", status: "voided",
        cash_account_id: "acct-cash", counter_account_id: "acct-rev",
        created_by: USER, created_at: NOW, updated_at: NOW,
        voided_at: NOW, void_reason: "Salah input",
      }),
      // Posted cash_out - newest first in the list.
      insertTransaction(db, {
        id: "txn-cashout", organization_id: ORG, transaction_number: "TRX-20260817-EF56",
        transaction_date: "2026-08-17", transaction_type: "cash_out", amount_idr: 50000,
        description: "Bayar listrik", status: "posted",
        cash_account_id: "acct-cash", counter_account_id: "acct-rev",
        created_by: USER, created_at: NOW, updated_at: NOW,
      }),
    ]);
  });

  it("lists every transaction in order - newest date first", async () => {
    const rows = await listTransactions(db as unknown as D1Database, ORG, {});
    expect(rows.map((r) => r.transaction_number)).toEqual([
      "TRX-20260817-EF56",
      "TRX-20260816-CD34",
      "TRX-20260815-AB12",
    ]);
    expect(rows[1].status).toBe("voided");
    expect(rows[1].void_reason).toBe("Salah input");
  });

  it("joins account names", async () => {
    const rows = await listTransactions(db as unknown as D1Database, ORG, {});
    const cashIn = rows.find((r) => r.id === "txn-cashin")!;
    expect(cashIn.cash_bank_account).toBe("Kas");
    expect(cashIn.counter_account).toBe("Pendapatan Usaha");
  });

  it("filters by status and search", async () => {
    const voided = await listTransactions(db as unknown as D1Database, ORG, { status: "voided" });
    expect(voided).toHaveLength(1);

    const search = await listTransactions(db as unknown as D1Database, ORG, {
      search: "listrik",
    });
    expect(search).toHaveLength(1);
    expect(search[0].transaction_number).toBe("TRX-20260817-EF56");
  });

  it("isolates by organization", async () => {
    const rows = await listTransactions(db as unknown as D1Database, "other-org", {});
    expect(rows).toHaveLength(0);
  });
});