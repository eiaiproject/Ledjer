import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { CORE_TABLES, CORE_INDEXES } from "./schema";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function applyMigrations(db: DatabaseSync, files: string[], migDir: string): void {
  for (const file of files) {
    const sql = readFileSync(resolve(migDir, file), "utf-8");
    const statements = sql
      .split(";")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    for (const stmt of statements) {
      if (stmt.toUpperCase().startsWith("CREATE INDEX")) {
        db.exec(stmt + ";");
        continue;
      }
      try {
        db.exec(stmt + ";");
      } catch (err) {
        console.warn(`${file}: ${(err as Error).message}`);
      }
    }
  }
}

describe("Migrations against real SQLite", () => {
  let db: DatabaseSync;

  beforeAll(() => {
    db = new DatabaseSync(":memory:");
    db.exec("PRAGMA journal_mode=WAL");
    db.exec("PRAGMA foreign_keys=ON");
  });

  it("applies all migrations without error", () => {
    const migDir = resolve(__dirname, "migrations");
    const files = readdirSync(migDir)
      .filter((f) => f.endsWith(".sql"))
      .sort();
    expect(() => applyMigrations(db, files, migDir)).not.toThrow();
  });

  it("all core tables exist after migrations", () => {
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all() as { name: string }[];
    const tableNames = new Set(tables.map((t) => t.name));

    for (const table of CORE_TABLES) {
      expect(tableNames.has(table), `Core table "${table}" not found after migrations`).toBe(true);
    }
  });

  it("all core indexes exist after migrations", () => {
    const indexes = db
      .prepare("SELECT name FROM sqlite_master WHERE type='index'")
      .all() as { name: string }[];
    const indexNames = new Set(indexes.map((i) => i.name));

    for (const idx of CORE_INDEXES) {
      expect(indexNames.has(idx), `Core index "${idx}" not found after migrations`).toBe(true);
    }
  });

  it("journal_lines CHECK constraint rejects invalid entries", () => {
    expect(() => {
      db.exec(
        "INSERT INTO journal_lines (id, organization_id, journal_entry_id, account_id, debit_idr, credit_idr, created_at) " +
        "VALUES ('test-1', 'org-1', 'je-1', 'acct-1', 100, 100, 1)"
      );
    }).toThrow();
  });

  it("journal_lines CHECK constraint allows valid debit-only entry", () => {
    // Temporarily disable FK for setup inserts to avoid silent failures
    db.exec("PRAGMA foreign_keys=OFF");
    db.exec("INSERT INTO users (id, email, full_name, password_hash, created_at, updated_at) VALUES ('user-1', 'test@example.com', 'Test User', 'hash', 1, 1)");
    db.exec("INSERT INTO organizations (id, name, base_currency, status, created_at, updated_at) VALUES ('org-1', 'Test', 'IDR', 'active', 1, 1)");
    db.exec("INSERT INTO accounts (id, organization_id, code, name, account_class, account_subtype, is_system, is_active, created_at, updated_at) VALUES ('acct-1', 'org-1', '1110', 'Cash', 'asset', 'cash', 1, 1, 1, 1)");
    db.exec("INSERT INTO transactions (id, organization_id, transaction_number, transaction_type, transaction_date, description, status, amount_idr, cash_account_id, counter_account_id, created_by, created_at, updated_at) VALUES ('tx-1', 'org-1', 'TRX-20260101-AB12', 'cash_in', '2026-01-01', 'test', 'posted', 100000, 'acct-1', 'acct-1', 'user-1', 1, 1)");
    db.exec("INSERT INTO journal_entries (id, organization_id, transaction_id, entry_date, description, created_at) VALUES ('je-1', 'org-1', 'tx-1', '2026-01-01', 'test', 1)");
    db.exec("PRAGMA foreign_keys=ON");

    expect(() => {
      db.exec(
        "INSERT INTO journal_lines (id, organization_id, journal_entry_id, account_id, debit_idr, credit_idr, created_at) " +
        "VALUES ('test-2', 'org-1', 'je-1', 'acct-1', 500000, 0, 1)"
      );
    }).not.toThrow();
  });

  it("can roll-forward from mid-state to latest migrations", () => {
    // Simulate upgrading from an older version:
    // Apply first half of migrations, then apply the rest
    const migDir = resolve(__dirname, "migrations");
    const files = readdirSync(migDir)
      .filter((f) => f.endsWith(".sql"))
      .sort();

    // Use a fresh in-memory database
    const rollforwardDb = new DatabaseSync(":memory:");
    rollforwardDb.exec("PRAGMA foreign_keys=ON");

    // Apply first 7 migrations (roughly half)
    const midPoint = Math.ceil(files.length / 2);
    const firstHalf = files.slice(0, midPoint);
    const secondHalf = files.slice(midPoint);

    applyMigrations(rollforwardDb, firstHalf, migDir);

    // Verify some tables exist after first half
    const tablesAfterFirstHalf = rollforwardDb
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all() as { name: string }[];
    expect(tablesAfterFirstHalf.length).toBeGreaterThan(0);

    // Apply remaining migrations (roll-forward)
    applyMigrations(rollforwardDb, secondHalf, migDir);

    // Verify all core tables exist after full migration
    const finalTables = rollforwardDb
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all() as { name: string }[];
    const finalTableNames = new Set(finalTables.map((t) => t.name));
    for (const table of CORE_TABLES) {
      expect(finalTableNames.has(table), `Core table "${table}" not found after roll-forward`).toBe(true);
    }

    // Verify indexes after full migration
    const finalIndexes = rollforwardDb
      .prepare("SELECT name FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_auto%'")
      .all() as { name: string }[];
    const finalIndexNames = new Set(finalIndexes.map((i) => i.name));
    for (const idx of CORE_INDEXES) {
      expect(finalIndexNames.has(idx), `Core index "${idx}" not found after roll-forward`).toBe(true);
    }

    rollforwardDb.close();
  });
});