import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { CORE_TABLES, USER_SCOPED_TABLES } from "./schema";

/**
 * Verifies migration 0009 (Fase 1: de-multi-tenant) against real SQLite by
 * upgrading a database that holds legacy multi-tenant rows: every legacy
 * organization_id must become the owning user's user_id, and the organization
 * tables must be gone.
 */
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const MIGRATIONS_DIR = resolve(__dirname, "migrations");

const LEGACY_MIGRATIONS = [
  "0001_mvp_foundation.sql",
  "0002_mvp_accounting.sql",
  "0003_oauth_accounts.sql",
  "0004_idempotency_payload_hash.sql",
  "0005_session_token_grace.sql",
  "0006_inventory_hpp.sql",
  "0007_purchase_transaction_type.sql",
  "0008_scoped_transaction_number.sql",
];

/**
 * Applies a migration file statement by statement, failing loudly on error.
 * Full-line `--` comments are stripped first: some legacy migrations contain a
 * semicolon inside a comment (0006 line 16), which a naive split on ";" would
 * turn into a syntax error.
 */
function applyMigration(db: DatabaseSync, file: string): void {
  const sql = readFileSync(resolve(MIGRATIONS_DIR, file), "utf-8")
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");
  for (const raw of sql.split(";")) {
    const stmt = raw.trim();
    if (stmt.length === 0) continue;
    db.exec(stmt + ";");
  }
}

function allMigrationFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
}

const NOW = 1750000000000;

function seedLegacyRows(db: DatabaseSync): void {
  db.exec(`
    INSERT INTO users (id, email, password_hash, full_name, status, created_at, updated_at)
    VALUES
      ('user-ohmega-owner-0001', 'ohmega@example.test', 'hash', 'Pemilik Ohmega', 'active', ${NOW}, ${NOW}),
      ('user-kedua-owner-0001', 'kedua@example.test', 'hash', 'Pemilik Kedua', 'active', ${NOW}, ${NOW});

    INSERT INTO organizations (id, name, base_currency, status, created_at, updated_at)
    VALUES
      ('org-ohmega-0001', 'Toko Telur Ohmega', 'IDR', 'active', ${NOW}, ${NOW}),
      ('org-kedua-0001', 'CV Kedua', 'IDR', 'active', ${NOW}, ${NOW});

    INSERT INTO memberships (id, user_id, organization_id, role, created_at)
    VALUES
      ('mem-ohmega-0001', 'user-ohmega-owner-0001', 'org-ohmega-0001', 'owner', ${NOW}),
      ('mem-kedua-0001', 'user-kedua-owner-0001', 'org-kedua-0001', 'owner', ${NOW});

    INSERT INTO sessions (id, user_id, token_hash, current_organization_id, expires_at, last_used_at, created_at)
    VALUES
      ('session-ohmega-0001', 'user-ohmega-owner-0001', 'hash-1', 'org-ohmega-0001', ${NOW + 1000}, ${NOW}, ${NOW}),
      ('session-kedua-0001', 'user-kedua-owner-0001', 'hash-2', 'org-kedua-0001', ${NOW + 1000}, ${NOW}, ${NOW});

    INSERT INTO accounts (id, organization_id, code, name, account_class, account_subtype, account_kind, is_system, is_active, created_at, updated_at)
    VALUES
      ('acct-ohmega-kas-0001', 'org-ohmega-0001', '1110', 'Kas', 'asset', 'cash', NULL, 1, 1, ${NOW}, ${NOW}),
      ('acct-ohmega-rev-0001', 'org-ohmega-0001', '4110', 'Pendapatan Usaha', 'income', NULL, NULL, 1, 1, ${NOW}, ${NOW}),
      ('acct-kedua-kas-0001', 'org-kedua-0001', '1110', 'Kas', 'asset', 'cash', NULL, 1, 1, ${NOW}, ${NOW});

    INSERT INTO products (id, organization_id, code, name, unit, selling_price_idr, current_stock_milli, average_cost_minor, is_active, created_at, updated_at)
    VALUES ('prod-ohmega-telur-0001', 'org-ohmega-0001', 'PRD-0001', 'Telur', 'butir', 2900, 251000, 1972, 1, ${NOW}, ${NOW});

    INSERT INTO transactions (id, organization_id, transaction_number, transaction_type, transaction_date, description, status, amount_idr, cash_account_id, counter_account_id, idempotency_key, created_by, created_at, updated_at)
    VALUES
      ('txn-ohmega-0001', 'org-ohmega-0001', 'TRX-20260801-AA01', 'cash_in', '2026-08-01', 'Jual telur', 'posted', 81000, 'acct-ohmega-kas-0001', 'acct-ohmega-rev-0001', 'idem-ohmega-1', 'user-ohmega-owner-0001', ${NOW}, ${NOW}),
      ('txn-kedua-0001', 'org-kedua-0001', 'TRX-20260802-BB02', 'cash_in', '2026-08-02', 'Jual barang', 'posted', 50000, 'acct-kedua-kas-0001', 'acct-kedua-kas-0001', 'idem-kedua-1', 'user-kedua-owner-0001', ${NOW}, ${NOW});

    INSERT INTO journal_entries (id, organization_id, transaction_id, entry_date, description, created_at)
    VALUES
      ('je-ohmega-0001', 'org-ohmega-0001', 'txn-ohmega-0001', '2026-08-01', 'Jual telur', ${NOW}),
      ('je-kedua-0001', 'org-kedua-0001', 'txn-kedua-0001', '2026-08-02', 'Jual barang', ${NOW});

    INSERT INTO journal_lines (id, organization_id, journal_entry_id, account_id, debit_idr, credit_idr, created_at)
    VALUES
      ('jl-ohmega-d-0001', 'org-ohmega-0001', 'je-ohmega-0001', 'acct-ohmega-kas-0001', 81000, 0, ${NOW}),
      ('jl-ohmega-c-0001', 'org-ohmega-0001', 'je-ohmega-0001', 'acct-ohmega-rev-0001', 0, 81000, ${NOW}),
      ('jl-kedua-d-0001', 'org-kedua-0001', 'je-kedua-0001', 'acct-kedua-kas-0001', 50000, 0, ${NOW}),
      ('jl-kedua-c-0001', 'org-kedua-0001', 'je-kedua-0001', 'acct-kedua-kas-0001', 0, 50000, ${NOW});

    INSERT INTO stock_movements (id, organization_id, transaction_id, product_id, quantity_milli, unit_cost_minor, cost_total_idr, created_at)
    VALUES ('sm-ohmega-0001', 'org-ohmega-0001', 'txn-ohmega-0001', 'prod-ohmega-telur-0001', 251000, 1972, 495000, ${NOW});

    INSERT INTO audit_logs (id, organization_id, actor_user_id, entity_type, entity_id, action, created_at)
    VALUES ('al-ohmega-0001', 'org-ohmega-0001', 'user-ohmega-owner-0001', 'transaction', 'txn-ohmega-0001', 'transaction_created', ${NOW});
  `);
}

function tableExists(db: DatabaseSync, name: string): boolean {
  const row = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = ?")
    .get(name) as { name: string } | undefined;
  return row !== undefined;
}

function columnNames(db: DatabaseSync, table: string): Set<string> {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  return new Set(rows.map((r) => r.name));
}

function get<T>(db: DatabaseSync, sql: string): T | undefined {
  return db.prepare(sql).get() as T | undefined;
}

describe("Migration 0009 (single-user de-multi-tenant)", () => {
  let db: DatabaseSync;

  beforeAll(() => {
    db = new DatabaseSync(":memory:");
    db.exec("PRAGMA foreign_keys=ON");
    for (const file of LEGACY_MIGRATIONS) {
      applyMigration(db, file);
    }
    seedLegacyRows(db);
  });

  it("upgrades legacy multi-tenant data without error", () => {
    expect(() => applyMigration(db, "0009_single_user.sql")).not.toThrow();
  });

  it("drops organizations and memberships", () => {
    expect(tableExists(db, "organizations")).toBe(false);
    expect(tableExists(db, "memberships")).toBe(false);
  });

  it("leaves no organization_id column in any core table", () => {
    for (const table of CORE_TABLES) {
      expect(tableExists(db, table), `${table} should exist`).toBe(true);
      expect(
        columnNames(db, table).has("organization_id"),
        `${table} still has organization_id`,
      ).toBe(false);
    }
  });

  it("adds user_id to every user-scoped table", () => {
    for (const table of USER_SCOPED_TABLES) {
      expect(
        columnNames(db, table).has("user_id"),
        `${table} is missing user_id`,
      ).toBe(true);
    }
  });

  it("backfills business_name from the legacy organization name", () => {
    const row = get<{ business_name: string }>(
      db,
      "SELECT business_name FROM users WHERE id = 'user-ohmega-owner-0001'",
    );
    expect(row?.business_name).toBe("Toko Telur Ohmega");
  });

  it("re-scopes accounts, transactions and journals to the owning user", () => {
    const account = get<{ user_id: string }>(
      db,
      "SELECT user_id FROM accounts WHERE id = 'acct-ohmega-kas-0001'",
    );
    expect(account?.user_id).toBe("user-ohmega-owner-0001");

    const txn = get<{ user_id: string; transaction_number: string }>(
      db,
      "SELECT user_id, transaction_number FROM transactions WHERE id = 'txn-ohmega-0001'",
    );
    expect(txn?.user_id).toBe("user-ohmega-owner-0001");
    expect(txn?.transaction_number).toBe("TRX-20260801-AA01");

    const line = get<{ user_id: string }>(
      db,
      "SELECT user_id FROM journal_lines WHERE id = 'jl-ohmega-d-0001'",
    );
    expect(line?.user_id).toBe("user-ohmega-owner-0001");

    const entry = get<{ user_id: string }>(
      db,
      "SELECT user_id FROM journal_entries WHERE id = 'je-ohmega-0001'",
    );
    expect(entry?.user_id).toBe("user-ohmega-owner-0001");

    const product = get<{ user_id: string }>(
      db,
      "SELECT user_id FROM products WHERE id = 'prod-ohmega-telur-0001'",
    );
    expect(product?.user_id).toBe("user-ohmega-owner-0001");

    const movement = get<{ user_id: string }>(
      db,
      "SELECT user_id FROM stock_movements WHERE id = 'sm-ohmega-0001'",
    );
    expect(movement?.user_id).toBe("user-ohmega-owner-0001");

    const audit = get<{ user_id: string }>(
      db,
      "SELECT user_id FROM audit_logs WHERE id = 'al-ohmega-0001'",
    );
    expect(audit?.user_id).toBe("user-ohmega-owner-0001");
  });

  it("keeps each user's rows separated after the backfill", () => {
    const counts = get<{ rows: number }>(
      db,
      "SELECT COUNT(*) AS rows FROM accounts WHERE user_id = 'user-ohmega-owner-0001'",
    );
    expect(counts?.rows).toBe(2);

    const txnCounts = get<{ rows: number }>(
      db,
      "SELECT COUNT(*) AS rows FROM transactions WHERE user_id = 'user-kedua-owner-0001'",
    );
    expect(txnCounts?.rows).toBe(1);
  });

  it("preserves sessions and drops current_organization_id", () => {
    const sessions = db.prepare("SELECT id, user_id, token_hash FROM sessions").all() as {
      id: string;
      user_id: string;
      token_hash: string;
    }[];
    expect(sessions).toHaveLength(2);
    expect(sessions.map((s) => s.token_hash).sort()).toEqual(["hash-1", "hash-2"]);
    expect(columnNames(db, "sessions").has("current_organization_id")).toBe(false);
  });

  it("enforces per-user uniqueness instead of per-organization", () => {
    // Two different users may reuse the same account code (both seeded 1110).
    const duplicates = get<{ rows: number }>(
      db,
      "SELECT COUNT(*) AS rows FROM accounts WHERE code = '1110'",
    );
    expect(duplicates?.rows).toBe(2);

    // The same user cannot reuse a code.
    expect(() => {
      db.exec(
        "INSERT INTO accounts (id, user_id, code, name, account_class, created_at, updated_at) " +
        "VALUES ('acct-dup-0001', 'user-ohmega-owner-0001', '1110', 'Kas Duplikat', 'asset', 1, 1)",
      );
    }).toThrow();
  });

  it("reports no foreign key violations", () => {
    const violations = db.prepare("PRAGMA foreign_key_check").all();
    expect(violations).toEqual([]);
  });

  it("applies cleanly on an empty database together with all other migrations", () => {
    const fresh = new DatabaseSync(":memory:");
    fresh.exec("PRAGMA foreign_keys=ON");
    for (const file of allMigrationFiles()) {
      expect(() => applyMigration(fresh, file), `${file} failed`).not.toThrow();
    }
    expect(tableExists(fresh, "organizations")).toBe(false);
    expect(tableExists(fresh, "users")).toBe(true);
    fresh.close();
  });
});
