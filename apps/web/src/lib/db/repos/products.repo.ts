/**
 * Products repository — read/write products from local SQLite.
 */

import type { Database } from "@sqlite.org/sqlite-wasm";
import type { Product } from "@/lib/accounting/types";
import { appendOutbox } from "./outbox.repo";

/** Map a raw row array to a Product object. */
function rowToProduct(row: unknown[]): Product {
  return {
    id: String(row[0]),
    user_id: String(row[1]),
    code: String(row[2]),
    name: String(row[3]),
    unit: String(row[4]),
    selling_price_idr: Number(row[5]),
    current_stock_milli: Number(row[6]),
    average_cost_minor: Number(row[7]),
    is_active: Number(row[8]),
  };
}

function queryProducts(db: Database, sql: string, bind?: unknown[]): Product[] {
  const stmt = db.prepare(sql);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (bind) stmt.bind(bind as any);
  const results: Product[] = [];
  while (stmt.step()) {
    results.push(rowToProduct(stmt.get([])));
  }
  stmt.finalize();
  return results;
}

// ── Read ─────────────────────────────────────────────────────────

/** Fetch all products for a user. */
export function getAllProducts(db: Database, userId: string): Product[] {
  return queryProducts(
    db,
    `SELECT id, user_id, code, name, unit, selling_price_idr,
            current_stock_milli, average_cost_minor, is_active
     FROM products WHERE user_id = ? ORDER BY code`,
    [userId],
  );
}

/** Find a single product by ID. */
export function getProductById(db: Database, productId: string): Product | null {
  const stmt = db.prepare(
    `SELECT id, user_id, code, name, unit, selling_price_idr,
            current_stock_milli, average_cost_minor, is_active
     FROM products WHERE id = ?`,
  );
  stmt.bind([productId]);
  let result: Product | null = null;
  if (stmt.step()) {
    result = rowToProduct(stmt.get([]));
  }
  stmt.finalize();
  return result;
}

// ── Write ─────────────────────────────────────────────────────────

/** Create a new product in local DB + outbox. */
export function createProductLocal(
  db: Database,
  userId: string,
  input: {
    code: string;
    name: string;
    unit?: string;
    sellingPriceIdr?: number;
  },
): Product {
  const id = crypto.randomUUID();
  const now = Date.now();

  db.exec({
    sql: `INSERT INTO products (id, user_id, code, name, unit, selling_price_idr, current_stock_milli, average_cost_minor, is_active, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, 0, 0, 1, ?, ?)`,
    bind: [
      id, userId, input.code, input.name,
      input.unit ?? "pcs", input.sellingPriceIdr ?? 0,
      now, now,
    ],
  });

  appendOutbox(db, userId, "product", id, "create", {
    code: input.code,
    name: input.name,
    unit: input.unit ?? "pcs",
    sellingPriceIdr: input.sellingPriceIdr ?? 0,
  });

  return getProductById(db, id)!;
}

/** Patch a product in local DB + outbox. */
export function patchProductLocal(
  db: Database,
  productId: string,
  input: { name?: string; sellingPriceIdr?: number; isActive?: boolean },
): Product {
  const now = Date.now();
  const sets: string[] = ["updated_at = ?"];
  const binds: unknown[] = [now];

  if (input.name !== undefined) {
    sets.push("name = ?");
    binds.push(input.name);
  }
  if (input.sellingPriceIdr !== undefined) {
    sets.push("selling_price_idr = ?");
    binds.push(input.sellingPriceIdr);
  }
  if (input.isActive !== undefined) {
    sets.push("is_active = ?");
    binds.push(input.isActive ? 1 : 0);
  }

  binds.push(productId);
  db.exec({
    sql: `UPDATE products SET ${sets.join(", ")} WHERE id = ?`,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    bind: binds as any,
  });

  const product = getProductById(db, productId);
  if (product) {
    appendOutbox(db, product.user_id, "product", productId, "update", input);
  }

  return product!;
}
