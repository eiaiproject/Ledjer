// @vitest-environment node
// Regresi untuk bug produksi: SELECT final buku besar mem-buang kolom
// entry_status/void_reason dari CTE, sehingga baris void tampil tanpa
// tanda void di D1 nyata (FakeD1 tidak menangkapnya karena mencerminkan
// bentuk yang diharapkan service).
import { describe, expect, it, beforeAll } from "vitest";
import { DatabaseSync } from "node:sqlite";
import type { D1Database } from "@cloudflare/workers-types";
import { SqliteD1 } from "../test/sqlite-d1";
import { getGeneralLedger } from "./reports.service";

const USER = "user-gl";
const NOW = 1_750_000_000_000;

function createSchema(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE accounts (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, code TEXT NOT NULL,
      name TEXT NOT NULL, account_class TEXT NOT NULL, account_subtype TEXT
    );
    CREATE TABLE transactions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      transaction_number TEXT NOT NULL,
      transaction_type TEXT NOT NULL,
      transaction_date TEXT NOT NULL,
      description TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'posted',
      amount_idr INTEGER NOT NULL,
      cash_account_id TEXT,
      counter_account_id TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      voided_at INTEGER,
      void_reason TEXT
    );
    CREATE TABLE journal_entries (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, transaction_id TEXT NOT NULL,
      entry_date TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL
    );
    CREATE TABLE journal_lines (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, journal_entry_id TEXT NOT NULL,
      account_id TEXT NOT NULL, debit_idr INTEGER NOT NULL DEFAULT 0,
      credit_idr INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL
    );
  `);
}

describe("getGeneralLedger (real SQLite)", () => {
  let db: SqliteD1;

  beforeAll(() => {
    const sqlite = new DatabaseSync(":memory:");
    createSchema(sqlite);
    db = new SqliteD1(sqlite);

    db.exec(`INSERT INTO accounts (id, user_id, code, name, account_class) VALUES
             ('acct-cash', '${USER}', '1110', 'Kas', 'asset')`);

    const insertTx = (id: string, number_: string, date: string, status: string, reason: string | null, createdAt: number) => {
      db.prepare(
        `INSERT INTO transactions (id, user_id, transaction_number, transaction_type, transaction_date,
                                   description, status, amount_idr, cash_account_id, created_at, updated_at,
                                   voided_at, void_reason)
         VALUES (?, ?, ?, 'cash_out', ?, 'Beban sewa', ?, 100000, 'acct-cash', ?, ?, ?, ?)`,
      ).bind(id, USER, number_, date, status, NOW + createdAt, NOW + createdAt, status === "voided" ? NOW + createdAt : null, reason).run();
      db.prepare(
        `INSERT INTO journal_entries (id, user_id, transaction_id, entry_date, description, created_at)
         VALUES (?, ?, ?, ?, 'Beban sewa', ?)`,
      ).bind(`je-${id}`, USER, id, date, NOW + createdAt).run();
      db.prepare(
        `INSERT INTO journal_lines (id, user_id, journal_entry_id, account_id, debit_idr, credit_idr, created_at)
         VALUES (?, ?, ?, 'acct-cash', 100000, 0, ?)`,
      ).bind(`jl-${id}`, USER, `je-${id}`, NOW + createdAt).run();
    };

    // Posted 100rb lalu void 50rb: saldo berjalan tidak boleh bergerak oleh void.
    insertTx("txn-posted", "TRX-20260801-AA11", "2026-08-01", "posted", null, 1);
    insertTx("txn-voided", "TRX-20260802-BB22", "2026-08-02", "voided", "Salah input", 2);
  });

  it("carries entry_status and void_reason from the CTE into the result rows", async () => {
    const report = await getGeneralLedger(db as unknown as D1Database, USER, {
      fromDate: "2026-08-01",
      toDate: "2026-08-31",
    });

    expect(report.entries).toHaveLength(2);
    const voided = report.entries.find((e) => e.transaction_id === "txn-voided");
    expect(voided).toBeDefined();
    expect(voided!.status).toBe("voided");
    expect(voided!.void_reason).toBe("Salah input");

    const posted = report.entries.find((e) => e.transaction_id === "txn-posted");
    expect(posted!.status).toBe("posted");
    expect(posted!.void_reason).toBeNull();
  });

  it("keeps the running balance unaffected by voided lines", async () => {
    const report = await getGeneralLedger(db as unknown as D1Database, USER, {
      fromDate: "2026-08-01",
      toDate: "2026-08-31",
    });

    const last = report.entries.at(-1)!;
    expect(last.running_balance_idr).toBe(100000);
  });
});
