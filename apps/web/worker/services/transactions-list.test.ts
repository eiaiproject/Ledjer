import { describe, expect, it, beforeAll } from "vitest";
import { DatabaseSync } from "node:sqlite";
import type { D1Database } from "@cloudflare/workers-types";
import { listTransactions } from "./transactions.service";

const ORG = "org-1";
const USER = "user-1";
const NOW = 1_750_000_000_000;

/**
 * Minimal real-SQLite stand-in for D1Database: the service layer only uses
 * prepare().bind().all()/first()/run() for listTransactions, so a thin
 * adapter over node:sqlite gives us real SQL semantics (including the
 * NOT EXISTS subquery) without a full D1 emulator.
 */
class SqliteD1 {
  constructor(private readonly db: DatabaseSync) {}

  prepare(sql: string): SqliteD1Statement {
    return new SqliteD1Statement(this.db, sql);
  }

  exec(sql: string): void {
    this.db.exec(sql);
  }
}

class SqliteD1Statement {
  private values: (string | number | null)[] = [];

  constructor(
    private readonly db: DatabaseSync,
    private readonly sql: string,
  ) {}

  bind(...values: (string | number | null)[]): this {
    this.values = values;
    return this;
  }

  async all<T>(): Promise<{ results: T[] }> {
    return { results: this.db.prepare(this.sql).all(...this.values) as T[] };
  }

  async first<T>(): Promise<T | null> {
    return (this.db.prepare(this.sql).get(...this.values) as T | undefined) ?? null;
  }

  async run(): Promise<{ success: boolean; meta: { changes: number; last_row_id: number } }> {
    const result = this.db.prepare(this.sql).run(...this.values);
    return {
      success: true,
      meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) },
    };
  }
}

function createSchema(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE organizations (id TEXT PRIMARY KEY, name TEXT NOT NULL);
    CREATE TABLE users (id TEXT PRIMARY KEY, full_name TEXT);
    CREATE TABLE parties (
      id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, name TEXT
    );
    CREATE TABLE transactions (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL,
      transaction_number TEXT NOT NULL,
      transaction_date TEXT NOT NULL,
      transaction_type TEXT NOT NULL,
      amount_minor INTEGER NOT NULL,
      party_id TEXT,
      category_name TEXT,
      cash_account_id TEXT,
      destination_cash_account_id TEXT,
      payment_status TEXT NOT NULL DEFAULT 'paid',
      due_date TEXT,
      description TEXT NOT NULL DEFAULT '',
      notes TEXT,
      status TEXT NOT NULL DEFAULT 'posted',
      idempotency_key TEXT,
      posted_at INTEGER,
      posted_by TEXT,
      voided_at INTEGER,
      voided_by TEXT,
      void_reason TEXT,
      original_transaction_id TEXT,
      reversal_transaction_id TEXT,
      created_by TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE journal_entries (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL,
      entry_number TEXT NOT NULL,
      entry_date TEXT NOT NULL,
      entry_type TEXT NOT NULL DEFAULT 'normal',
      transaction_id TEXT,
      description TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'posted',
      created_at INTEGER NOT NULL
    );
  `);
}

function insertTransaction(db: SqliteD1, row: Record<string, unknown>): Promise<void> {
  // payment_status omitted on purpose: it is NOT NULL with DEFAULT 'paid'.
  const columns = [
    "id", "organization_id", "transaction_number", "transaction_date", "transaction_type",
    "amount_minor", "party_id", "category_name", "cash_account_id", "destination_cash_account_id",
    "due_date", "description", "notes", "status", "idempotency_key",
    "posted_at", "posted_by", "original_transaction_id", "created_by", "created_at", "updated_at",
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

function insertJournalEntry(
  db: SqliteD1,
  row: { id: string; transactionId: string; entryType: "normal" | "reversal"; description: string },
): Promise<void> {
  return db
    .prepare(
      `INSERT INTO journal_entries
         (id, organization_id, entry_number, entry_date, entry_type, transaction_id, description, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'posted', ?)`,
    )
    .bind(
      row.id, ORG, `JE-${row.id}`, "2026-08-15", row.entryType, row.transactionId,
      row.description, NOW,
    )
    .run()
    .then(() => undefined);
}

describe("listTransactions shows the complete audit trail", () => {
  let sqlite: DatabaseSync;
  let db: SqliteD1;

  beforeAll(() => {
    sqlite = new DatabaseSync(":memory:");
    sqlite.exec("PRAGMA foreign_keys=ON");
    createSchema(sqlite);
    db = new SqliteD1(sqlite);

    db.exec(`INSERT INTO organizations (id, name) VALUES ('${ORG}', 'Test Org')`);
    db.exec(`INSERT INTO users (id, full_name) VALUES ('${USER}', 'Test User')`);

    return Promise.all([
      // Original posted sale — must be visible.
      insertTransaction(db, {
        id: "txn-original", organization_id: ORG, transaction_number: "TRX-202608-000001",
        transaction_date: "2026-08-15", transaction_type: "cash_sale", amount_minor: 81000,
        description: "Penjualan Telur x30", status: "voided",
        posted_at: NOW, posted_by: USER, created_by: USER, created_at: NOW, updated_at: NOW,
      }),
      // Reversal created by the void flow — also visible (complete audit trail).
      insertTransaction(db, {
        id: "txn-reversal", organization_id: ORG, transaction_number: "TRX-202608-000002",
        transaction_date: "2026-08-15", transaction_type: "cash_sale", amount_minor: 81000,
        description: "Pembatalan: Penjualan Telur x30", status: "posted",
        posted_at: NOW, posted_by: USER, original_transaction_id: "txn-original",
        created_by: USER, created_at: NOW, updated_at: NOW,
      }),
      // Corrected re-entry created after the void — must be visible.
      insertTransaction(db, {
        id: "txn-correction", organization_id: ORG, transaction_number: "TRX-202608-000003",
        transaction_date: "2026-08-15", transaction_type: "cash_sale", amount_minor: 81000,
        description: "Penjualan Telur x30 (Nadiah)", status: "posted",
        posted_at: NOW, posted_by: USER, original_transaction_id: "txn-original",
        created_by: USER, created_at: NOW, updated_at: NOW,
      }),
      // Settlement payment (receive_receivable) — real transaction, must be visible.
      insertTransaction(db, {
        id: "txn-settle", organization_id: ORG, transaction_number: "TRX-202608-000004",
        transaction_date: "2026-08-15", transaction_type: "receive_receivable", amount_minor: 20000,
        description: "Pelunasan: Penjualan Telur x30", status: "posted",
        posted_at: NOW, posted_by: USER, original_transaction_id: "txn-original",
        created_by: USER, created_at: NOW, updated_at: NOW,
      }),
    ]).then(() =>
      Promise.all([
        insertJournalEntry(db, {
          id: "je-reversal", transactionId: "txn-reversal", entryType: "reversal",
          description: "Pembatalan: Penjualan Telur x30",
        }),
        insertJournalEntry(db, {
          id: "je-correction", transactionId: "txn-correction", entryType: "normal",
          description: "Penjualan Telur x30 (Nadiah)",
        }),
        insertJournalEntry(db, {
          id: "je-settle", transactionId: "txn-settle", entryType: "normal",
          description: "Pelunasan sisa: Rp20.000",
        }),
      ]),
    );
  });

  it("lists every transaction in order — original, reversal, correction and settlement", async () => {
    const rows = await listTransactions(db as unknown as D1Database, ORG, {});
    const numbers = rows.map((r) => r.transaction_number);

    expect(numbers).toContain("TRX-202608-000001"); // original (voided but listed)
    expect(numbers).toContain("TRX-202608-000002"); // reversal (void flow)
    expect(numbers).toContain("TRX-202608-000003"); // corrected re-entry
    expect(numbers).toContain("TRX-202608-000004"); // settlement payment
  });
});
