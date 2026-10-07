// @vitest-environment node
// Regresi race void: saat guarded restore cache produk meleset (writer
// konkuren), status voided SUDAH ter-commit — dulu service melempar
// stock_update_conflict dan cache jadi stale permanen tanpa jalan pulih.
// Kini pemulihan menghitung ulang dari riwayat. Guard-miss disimulasikan
// dengan merusak dua bind guard pada statement restore.
import { describe, expect, it, beforeAll } from "vitest";
import { DatabaseSync } from "node:sqlite";
import type { D1Database } from "@cloudflare/workers-types";
import { SqliteD1 } from "../test/sqlite-d1";
import { voidTransaction } from "./transactions.service";

const USER = "user-void";
const NOW = 1_750_000_000_000;

class GuardMissD1 extends SqliteD1 {
  async batch(statements: Parameters<SqliteD1["batch"]>[0]): Promise<D1Result[]> {
    for (const s of statements) {
      // Statement restore produk diakhiri dua bind guard (stok & WAC lama);
      // nilainya dirusak agar UPDATE berdampak 0 baris seperti race nyata.
      if (s.sql.includes("UPDATE products") && s.sql.includes("current_stock_milli = ?")) {
        s.values[s.values.length - 2] = -999_999_999;
        s.values[s.values.length - 1] = -999_999_999;
      }
    }
    return super.batch(statements);
  }
}

function createSchema(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE accounts (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, code TEXT NOT NULL,
      name TEXT NOT NULL, account_class TEXT NOT NULL, account_subtype TEXT,
      account_kind TEXT, is_system INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    );
    CREATE TABLE products (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, code TEXT NOT NULL, name TEXT NOT NULL,
      unit TEXT NOT NULL DEFAULT 'pcs', selling_price_idr INTEGER NOT NULL DEFAULT 0,
      current_stock_milli INTEGER NOT NULL DEFAULT 0, average_cost_minor INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    );
    CREATE TABLE transactions (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, transaction_number TEXT NOT NULL,
      transaction_type TEXT NOT NULL, transaction_date TEXT NOT NULL, description TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'posted', amount_idr INTEGER NOT NULL,
      cash_account_id TEXT, counter_account_id TEXT, idempotency_key TEXT,
      idempotency_payload_hash TEXT, voided_at INTEGER, void_reason TEXT,
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
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
    CREATE TABLE stock_movements (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, transaction_id TEXT NOT NULL,
      product_id TEXT NOT NULL, quantity_milli INTEGER NOT NULL,
      unit_cost_minor INTEGER NOT NULL, cost_total_idr INTEGER NOT NULL, created_at INTEGER NOT NULL
    );
    CREATE TABLE audit_logs (
      id TEXT PRIMARY KEY, user_id TEXT, actor_user_id TEXT, entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL, action TEXT NOT NULL, before_json TEXT, after_json TEXT,
      reason TEXT, request_id TEXT, created_at INTEGER NOT NULL
    );
  `);
}

describe("voidTransaction guard-miss recovery (real SQLite)", () => {
  let sqlite: DatabaseSync;
  let db: GuardMissD1;

  beforeAll(() => {
    sqlite = new DatabaseSync(":memory:");
    createSchema(sqlite);
    db = new GuardMissD1(sqlite);

    db.exec(`INSERT INTO accounts (id, user_id, code, name, account_class, account_subtype, is_active, created_at, updated_at)
             VALUES ('acct-kas', '${USER}', '1110', 'Kas', 'asset', 'cash', 1, ${NOW}, ${NOW})`);
    db.exec(`INSERT INTO products (id, user_id, code, name, is_active, created_at, updated_at)
             VALUES ('prod-telur', '${USER}', 'PRD-0001', 'Telur', 1, ${NOW}, ${NOW})`);

    // Pembelian 100 unit @ Rp 1 (unit_cost_minor 10.000), lalu penjualan 30 unit.
    // Void penjualan harus mengembalikan stok 100 unit tanpa mengubah WAC.
    db.prepare(
      `INSERT INTO transactions (id, user_id, transaction_number, transaction_type, transaction_date,
                                 description, status, amount_idr, cash_account_id, created_at, updated_at)
       VALUES ('tx-beli', ?, 'TRX-20260801-AA11', 'purchase', '2026-08-01', 'Beli telur', 'posted', 100000, 'acct-kas', ?, ?)`,
    ).bind(USER, NOW, NOW).run();
    db.prepare(
      `INSERT INTO stock_movements (id, user_id, transaction_id, product_id, quantity_milli, unit_cost_minor, cost_total_idr, created_at)
       VALUES ('sm-beli', ?, 'tx-beli', 'prod-telur', 100000, 10000, 100000, ?)`,
    ).bind(USER, NOW).run();

    db.prepare(
      `INSERT INTO transactions (id, user_id, transaction_number, transaction_type, transaction_date,
                                 description, status, amount_idr, cash_account_id, created_at, updated_at)
       VALUES ('tx-jual', ?, 'TRX-20260802-BB22', 'cash_in', '2026-08-02', 'Jual telur', 'posted', 30000, 'acct-kas', ?, ?)`,
    ).bind(USER, NOW + 1, NOW + 1).run();
    db.prepare(
      `INSERT INTO stock_movements (id, user_id, transaction_id, product_id, quantity_milli, unit_cost_minor, cost_total_idr, created_at)
       VALUES ('sm-jual', ?, 'tx-jual', 'prod-telur', -30000, 10000, 30000, ?)`,
    ).bind(USER, NOW + 1).run();

    // Cache mengikuti riwayat sebelum void: stok 70.000 milli, WAC 10.000 minor.
    db.prepare(`UPDATE products SET current_stock_milli = 70000, average_cost_minor = 10000 WHERE id = 'prod-telur'`).run();
  });

  it("recovers product stock/WAC from history when the guarded restore misses", async () => {
    const result = await voidTransaction(db as unknown as D1Database, USER, "tx-jual", { reason: "uji race" });

    expect(result.status).toBe("voided");

    const row = sqlite.prepare(`SELECT current_stock_milli, average_cost_minor FROM products WHERE id = 'prod-telur'`).get() as {
      current_stock_milli: number;
      average_cost_minor: number;
    };
    // Riwayat posted tersisa pembelian: stok kembali 100 unit, WAC tetap Rp 1.
    expect(row.current_stock_milli).toBe(100000);
    expect(row.average_cost_minor).toBe(10000);
  });
});
