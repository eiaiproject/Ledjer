import { describe, expect, it, beforeAll } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { D1Database } from "@cloudflare/workers-types";
import { SqliteD1 } from "../test/sqlite-d1";
import { postTransaction } from "./transactions.service";
import { listProducts } from "./products.service";

/**
 * postTransaction builds one INSERT per table inside a D1 batch. The fake-D1
 * shim records statements without parsing them, so a column/value arity
 * mismatch (e.g. a column list that no longer matches its VALUES tuple after
 * migration 0009 collapsed organization_id + created_by into user_id) passes
 * every unit test and only shows up as a 500 in production.
 *
 * Running the real calls against the real migration schema catches that class
 * of bug: SQLite rejects the statement instead of recording it.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));

const USER = "user-sql-1";
const NOW = Date.now();
const CASH = "acct-cash";
const REVENUE = "acct-revenue";
const EQUITY = "acct-equity";
const INVENTORY = "acct-inventory";
const COGS = "acct-cogs";
const PRODUCT = "prod-1";

function applyMigrations(db: DatabaseSync): void {
  const migDir = resolve(__dirname, "../db/migrations");
  for (const file of readdirSync(migDir).filter((f) => f.endsWith(".sql")).sort()) {
    const sql = readFileSync(resolve(migDir, file), "utf-8");
    for (const stmt of sql.split(";").map((s) => s.trim()).filter(Boolean)) {
      try {
        db.exec(stmt + ";");
      } catch {
        // Replaying 0001-0008 on top of each other re-creates tables that
        // later migrations already rebuilt; the statements that fail here are
        // the ones the rebuild intends to replace.
      }
    }
  }
}

describe("postTransaction writes against real SQLite", () => {
  let sqlite: DatabaseSync;
  let db: SqliteD1;

  beforeAll(() => {
    sqlite = new DatabaseSync(":memory:");
    applyMigrations(sqlite);

    const account = (id: string, code: string, name: string, cls: string, subtype: string | null, kind: string | null) =>
      sqlite.exec(`INSERT INTO accounts (id, user_id, code, name, account_class, account_subtype, account_kind, is_system, is_active, created_at, updated_at)
                   VALUES ('${id}', '${USER}', '${code}', '${name}', '${cls}', ${subtype ? `'${subtype}'` : "NULL"}, ${kind ? `'${kind}'` : "NULL"}, 1, 1, ${NOW}, ${NOW})`);

    sqlite.exec(`INSERT INTO users (id, email, password_hash, full_name, business_name, status, created_at, updated_at)
                 VALUES ('${USER}', 'sql@test.co', '', 'SQL Test', 'Buku SQL', 'active', ${NOW}, ${NOW})`);
    account(CASH, "1110", "Kas", "asset", "cash", null);
    account(REVENUE, "4110", "Pendapatan Usaha", "income", null, null);
    account(EQUITY, "3110", "Modal Pemilik", "equity", null, null);
    account(INVENTORY, "1130", "Persediaan", "asset", null, "inventory");
    account(COGS, "6190", "Harga Pokok Penjualan", "expense", null, "cogs");
    sqlite.exec(`INSERT INTO products (id, user_id, code, name, unit, selling_price_idr, current_stock_milli, average_cost_minor, is_active, created_at, updated_at)
                 VALUES ('${PRODUCT}', '${USER}', 'PRD-0001', 'Kopi', 'bungkus', 50000, 0, 0, 1, ${NOW}, ${NOW})`);

    db = new SqliteD1(sqlite);
  });

  const d1 = () => db as unknown as D1Database;

  function row(id: string): Record<string, unknown> {
    return sqlite.prepare("SELECT * FROM transactions WHERE id = ?").get(id) as Record<string, unknown>;
  }

  it("writes a plain transaction that matches the migrated schema", async () => {
    const created = await postTransaction(d1(), USER, {
      transactionType: "owner_deposit",
      transactionDate: "2026-09-01",
      cashAccountId: CASH,
      counterAccountId: EQUITY,
      amountIdr: 1_000_000,
      description: "Setor modal",
      idempotencyKey: "sql-owner-deposit-1",
    });

    const stored = row(created.transaction_id);
    expect(stored.user_id).toBe(USER);
    expect(stored.status).toBe("posted");
    expect(stored.amount_idr).toBe(1_000_000);
    expect(stored.idempotency_payload_hash).toBeTruthy();
    // 0009 renamed/dropped these: only user_id scopes a book now.
    expect(stored.organization_id).toBeUndefined();
    expect(stored.created_by).toBeUndefined();
  });

  it("writes a purchase: transaction, journal, and stock movement", async () => {
    const created = await postTransaction(d1(), USER, {
      transactionType: "purchase",
      transactionDate: "2026-09-02",
      cashAccountId: CASH,
      description: "Beli kopi",
      idempotencyKey: "sql-purchase-1",
      items: [{ productId: PRODUCT, quantity: 10, unitCostIdr: 20_000 }],
    });

    expect(row(created.transaction_id)).toBeDefined();
    const movements = sqlite
      .prepare("SELECT * FROM stock_movements WHERE transaction_id = ?")
      .all(created.transaction_id) as Record<string, unknown>[];
    expect(movements).toHaveLength(1);
    expect(movements[0].user_id).toBe(USER);
  });

  it("writes a goods sale: COGS journal and stock decrement", async () => {
    const created = await postTransaction(d1(), USER, {
      transactionType: "cash_in",
      transactionDate: "2026-09-03",
      cashAccountId: CASH,
      counterAccountId: REVENUE,
      amountIdr: 200_000,
      description: "Jual kopi",
      idempotencyKey: "sql-goods-sale-1",
      items: [{ productId: PRODUCT, quantity: 4, unitPriceIdr: 50_000 }],
    });

    expect(row(created.transaction_id)).toBeDefined();
    // Stock and WAC are read back through the public product shape so the
    // assertion is in IDR/units rather than the stored milli scale.
    const products = await listProducts(d1(), USER);
    const product = products.find((p) => p.id === PRODUCT)!;
    expect(product.current_stock).toBe(6);
    expect(product.average_cost_idr).toBe(20_000);
  });

  it("leaves every committed journal entry balanced", () => {
    const unbalanced = sqlite
      .prepare(
        `SELECT je.id, SUM(jl.debit_idr) AS debit, SUM(jl.credit_idr) AS credit
         FROM journal_entries je JOIN journal_lines jl ON jl.journal_entry_id = je.id
         GROUP BY je.id HAVING debit != credit`,
      )
      .all();
    expect(unbalanced).toEqual([]);
  });
});
