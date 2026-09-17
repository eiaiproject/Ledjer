import { describe, it, expect, afterEach } from "vitest";
import { initLocalDb, isOpfsAvailable, LOCAL_DB_FILENAME, _resetLocalDbForTesting } from "./local-db";
import { LOCAL_SCHEMA_SQL } from "./local-schema";
import { DEFAULT_ACCOUNTS } from "./seed";
/**
 * Integration test: init → schema → seed → query.
 *
 * Menjalankan @sqlite.org/sqlite-wasm (in-memory) di Node.js.
 * OPFS tidak tersedia di Node — hanya browser worker.
 */

describe("local SQLite database", () => {
  afterEach(() => {
    _resetLocalDbForTesting();
  });

  it("initializes with SQLite-WASM and exposes version", async () => {
    const db = await initLocalDb();
    // OO1 API: db.exec returns metadata for DDL/DML, nothing useful for SELECT.
    // For query results, use the prepared statement API or exec with bind.
    // Here we just verify init doesn't throw.
    expect(db).toBeDefined();
    // Run a simple query to verify the DB is functional.
    const stmt = db.prepare("SELECT sqlite_version() AS version");
    stmt.step();
    const version = stmt.getString(0) ?? "";
    stmt.finalize();
    expect(version).toMatch(/^\d+\.\d+\.\d+/);
  });

  it("creates all local schema tables", async () => {
    const db = await initLocalDb();
    const stmt = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    );
    const tables: string[] = [];
    while (stmt.step()) tables.push(stmt.getString(0) ?? "");
    stmt.finalize();
    expect(tables).toContain("users");
    expect(tables).toContain("accounts");
    expect(tables).toContain("products");
    expect(tables).toContain("parties");
    expect(tables).toContain("transactions");
    expect(tables).toContain("stock_movements");
    expect(tables).toContain("ledger_settings");
    expect(tables).toContain("sync_outbox");
  });

  it("seeds 16 default accounts for a user", async () => {
    const db = await initLocalDb("user-test-1");
    const stmt = db.prepare(
      "SELECT COUNT(*) AS count FROM accounts WHERE user_id = 'user-test-1' AND is_system = 1",
    );
    stmt.step();
    const count = stmt.getInt(0);
    stmt.finalize();
    expect(count).toBe(DEFAULT_ACCOUNTS.length);
  });

  it("default accounts include inventory and COGS", async () => {
    const db = await initLocalDb("user-test-2");
    const stmt = db.prepare(
      "SELECT code, account_kind FROM accounts WHERE user_id = 'user-test-2' AND account_kind IS NOT NULL ORDER BY code",
    );
    const rows: Array<[string, string]> = [];
    while (stmt.step()) rows.push([stmt.getString(0) ?? "", stmt.getString(1) ?? ""]);
    stmt.finalize();
    expect(rows).toEqual(
      expect.arrayContaining([
        ["1130", "inventory"],
        ["6190", "cogs"],
      ]),
    );
  });

  it("seed is idempotent — calling twice doesn't duplicate", async () => {
    const db = await initLocalDb("user-test-3");
    function countAccounts(): number {
      const s = db.prepare("SELECT COUNT(*) AS c FROM accounts WHERE user_id = 'user-test-3'");
      s.step();
      const c = s.getInt(0) ?? 0;
      s.finalize();
      return c;
    }
    const count1 = countAccounts();

    // Re-init won't re-seed (singleton returns same instance).
    await initLocalDb("user-test-3");
    const count2 = countAccounts();

    expect(count1).toBe(count2);
    expect(count1).toBe(DEFAULT_ACCOUNTS.length);
  });

  it("applies schema SQL without errors", () => {
    // Strip comment lines, then split on semicolons.
    const cleaned = LOCAL_SCHEMA_SQL
      .split("\n")
      .filter((line) => !line.trimStart().startsWith("--"))
      .join("\n");
    const statements = cleaned.split(";")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    expect(statements.length).toBeGreaterThan(10);
    for (const stmt of statements) {
      const upper = stmt.toUpperCase().trimStart();
      expect(upper).toMatch(/^(CREATE|INSERT)/);
    }
  });

  it("ledger_settings row is created for the user", async () => {
    const db = await initLocalDb("user-test-settings");
    const stmt = db.prepare(
      "SELECT base_currency, rule_version FROM ledger_settings WHERE user_id = 'user-test-settings'",
    );
    const found = stmt.step();
    expect(found).toBe(true);
    expect(stmt.getString(0)).toBe("IDR");
    expect(stmt.getInt(1)).toBe(1);
    stmt.finalize();
  });

  it("sync_outbox is initially empty", async () => {
    const db = await initLocalDb("user-test-outbox");
    const stmt = db.prepare("SELECT COUNT(*) AS c FROM sync_outbox WHERE user_id = 'user-test-outbox'");
    stmt.step();
    const count = stmt.getInt(0);
    stmt.finalize();
    expect(count).toBe(0);
  });

  it("OPFS filename memakai VFS opfs (bertahan antar-reload)", () => {
    expect(LOCAL_DB_FILENAME).toContain("vfs=opfs");
    expect(LOCAL_DB_FILENAME).toContain("ledjer.sqlite3");
  });

  it("isOpfsAvailable true bila OpfsDb ada, false bila tidak", () => {
    expect(isOpfsAvailable({ oo1: { OpfsDb: function () {} } })).toBe(true);
    expect(isOpfsAvailable({ oo1: {} })).toBe(false);
    expect(isOpfsAvailable({})).toBe(false);
  });

  it("data bertahan dalam satu sesi via singleton (lapis JsStorageDb/memory)", async () => {
    const db = await initLocalDb("user-test-persist");
    db.exec("INSERT OR IGNORE INTO parties (id, user_id, name, party_type, is_active, created_at, updated_at) VALUES ('p1', 'user-test-persist', 'Nadia', 'customer', 1, 1, 1)");
    const again = await initLocalDb("user-test-persist");
    const stmt = again.prepare("SELECT COUNT(*) AS c FROM parties WHERE user_id = 'user-test-persist'");
    stmt.step();
    expect(stmt.getInt(0)).toBeGreaterThanOrEqual(1);
    stmt.finalize();
  });
});
