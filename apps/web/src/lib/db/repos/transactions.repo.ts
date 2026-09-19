/**
 * Transactions repository — read/write transactions from local SQLite.
 *
 * Write path:
 *   1. Validate (amount > 0)
 *   2. BEGIN
 *   3. INSERT transaction
 *   4. Compute stock movements (if product involved)
 *   5. UPDATE product stock + WAC
 *   6. COMMIT
 *   7. Append to sync_outbox
 */

import type { Database } from "@sqlite.org/sqlite-wasm";
import type { StockMovement, Transaction, TransactionType, TransactionStatus } from "@/lib/accounting/types";
import { computeNewWac, computeStockAfter, computeMovementValue } from "@/lib/accounting/wac";
import { appendOutbox } from "./outbox.repo";

/** Map a raw row array to a Transaction object. */
function rowToTransaction(row: unknown[]): Transaction {
  return {
    id: String(row[0]),
    user_id: String(row[1]),
    op_id: String(row[2]),
    transaction_type: String(row[3]) as TransactionType,
    transaction_date: String(row[4]),
    description: String(row[5]),
    party_id: row[6] as string | null,
    product_id: row[7] as string | null,
    cash_account_id: String(row[8]),
    counter_account_id: row[9] as string | null,
    amount_idr: Number(row[10]),
    status: String(row[11]) as TransactionStatus,
    void_of_id: row[12] as string | null,
    rule_version: Number(row[13]),
    created_at: Number(row[14]),
    updated_at: Number(row[15]),
  };
}

// ── Read ─────────────────────────────────────────────────────────

/** Fetch transactions with filters. */
export function getTransactions(
  db: Database,
  userId: string,
  opts: {
    fromDate?: string;
    toDate?: string;
    type?: TransactionType;
    status?: TransactionStatus;
    limit?: number;
    offset?: number;
  } = {},
): Transaction[] {
  let sql = `SELECT id, user_id, op_id, transaction_type, transaction_date, description,
                    party_id, product_id, cash_account_id, counter_account_id,
                    amount_idr, status, void_of_id, rule_version, created_at, updated_at
             FROM transactions WHERE user_id = ?`;
  const bind: unknown[] = [userId];

  if (opts.fromDate) {
    sql += ` AND transaction_date >= ?`;
    bind.push(opts.fromDate);
  }
  if (opts.toDate) {
    sql += ` AND transaction_date <= ?`;
    bind.push(opts.toDate);
  }
  if (opts.type) {
    sql += ` AND transaction_type = ?`;
    bind.push(opts.type);
  }
  if (opts.status) {
    sql += ` AND status = ?`;
    bind.push(opts.status);
  }

  sql += ` ORDER BY transaction_date DESC, created_at DESC`;

  if (opts.limit) {
    sql += ` LIMIT ?`;
    bind.push(opts.limit);
  }
  if (opts.offset) {
    sql += ` OFFSET ?`;
    bind.push(opts.offset);
  }

  const stmt = db.prepare(sql);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  stmt.bind(bind as any);
  const results: Transaction[] = [];
  while (stmt.step()) {
    results.push(rowToTransaction(stmt.get([])));
  }
  stmt.finalize();
  return results;
}

/** Fetch a single transaction by ID. */
export function getTransactionById(db: Database, transactionId: string): Transaction | null {
  const stmt = db.prepare(
    `SELECT id, user_id, op_id, transaction_type, transaction_date, description,
            party_id, product_id, cash_account_id, counter_account_id,
            amount_idr, status, void_of_id, rule_version, created_at, updated_at
     FROM transactions WHERE id = ?`,
  );
  stmt.bind([transactionId]);
  let result: Transaction | null = null;
  if (stmt.step()) {
    result = rowToTransaction(stmt.get([]));
  }
  stmt.finalize();
  return result;
}

/** Fetch stock movements for given transactions (for COGS derivation in reports). */
export function getStockMovementsForTransactions(
  db: Database,
  transactionIds: string[],
): StockMovement[] {
  if (transactionIds.length === 0) return [];
  const placeholders = transactionIds.map(() => "?").join(",");
  const stmt = db.prepare(
    `SELECT id, user_id, transaction_id, product_id, movement_type,
            quantity_milli, unit_cost_minor, total_value_minor,
            stock_after_milli, created_at
     FROM stock_movements WHERE transaction_id IN (${placeholders})`,
  );
  stmt.bind(transactionIds);
  const results: StockMovement[] = [];
  while (stmt.step()) {
    const row = stmt.get([]);
    results.push({
      id: String(row[0]),
      user_id: String(row[1]),
      transaction_id: String(row[2]),
      product_id: String(row[3]),
      movement_type: String(row[4]) as "in" | "out" | "loss",
      quantity_milli: Number(row[5]),
      unit_cost_minor: Number(row[6]),
      total_value_minor: Number(row[7]),
      stock_after_milli: Number(row[8]),
      created_at: Number(row[9]),
    });
  }
  stmt.finalize();
  return results;
}

// ── Write ─────────────────────────────────────────────────────────

export interface CreateTransactionInput {
  transactionType: TransactionType;
  transactionDate: string;
  description?: string;
  partyId?: string | null;
  productId?: string | null;
  cashAccountId: string;
  counterAccountId?: string | null;
  amountIdr: number;
  /** Stock movement details (for purchase/stock-out). */
  quantityMilli?: number;
  unitCostMinor?: number;
  /** Susut non-kas: movement "loss" tanpa arus kas (pecah/konsumsi/hilang). */
  stockLoss?: boolean;
}

/**
 * Post a new transaction — local DB first.
 *
 * Flow:
 * 1. Validate input
 * 2. BEGIN
 * 3. INSERT transaction
 * 4. If product: compute WAC, INSERT stock_movement, UPDATE product
 * 5. COMMIT
 * 6. Append outbox entries
 */
export function postTransactionLocal(
  db: Database,
  userId: string,
  input: CreateTransactionInput,
): Transaction {
  const id = crypto.randomUUID();
  const opId = crypto.randomUUID();
  const now = Date.now();
  const ruleVersion = 1;

  // Validate: amount must be positive.
  if (input.amountIdr <= 0) {
    throw new Error("Amount must be positive");
  }

  // BEGIN
  db.exec("BEGIN");

  try {
    // 1. INSERT transaction
    db.exec({
      sql: `INSERT INTO transactions (id, user_id, op_id, transaction_type, transaction_date, description,
                                      party_id, product_id, cash_account_id, counter_account_id,
                                      amount_idr, status, void_of_id, rule_version, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'posted', NULL, ?, ?, ?)`,
      bind: [
        id, userId, opId, input.transactionType, input.transactionDate,
        input.description ?? "", input.partyId ?? null, input.productId ?? null,
        input.cashAccountId, input.counterAccountId ?? null,
        input.amountIdr, ruleVersion, now, now,
      ],
    });

    // 2. Stock movement (if product involved)
    if (input.productId && input.quantityMilli && input.unitCostMinor) {
      const stmt = db.prepare(
        `SELECT current_stock_milli, average_cost_minor FROM products WHERE id = ?`,
      );
      stmt.bind([input.productId]);
      let currentStock = 0;
      let currentWac = 0;
      if (stmt.step()) {
        const row = stmt.get([]);
        currentStock = Number(row[0]);
        currentWac = Number(row[1]);
      }
      stmt.finalize();

      const isLoss = input.stockLoss === true;
      const isOut = isLoss || input.transactionType !== "purchase";
      let movementType: "in" | "out" | "loss" = "in";
      if (isLoss) {
        movementType = "loss";
      } else if (isOut) {
        movementType = "out";
      }
      const newStock = computeStockAfter(currentStock, movementType, input.quantityMilli);
      // Susut memakai WAC berjalan (dibekukan) tanpa mengubah WAC produk.
      const newWac = isOut ? currentWac
        : computeNewWac(currentStock, currentWac, input.quantityMilli, input.unitCostMinor);
      const totalValue = computeMovementValue(input.quantityMilli, input.unitCostMinor);

      const smId = crypto.randomUUID();
      db.exec({
        sql: `INSERT INTO stock_movements (id, user_id, transaction_id, product_id, movement_type,
                                           quantity_milli, unit_cost_minor, total_value_minor,
                                           stock_after_milli, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        bind: [smId, userId, id, input.productId, movementType, input.quantityMilli, input.unitCostMinor, totalValue, newStock, now],
      });

      // UPDATE product stock + WAC
      db.exec({
        sql: `UPDATE products SET current_stock_milli = ?, average_cost_minor = ?, updated_at = ? WHERE id = ?`,
        bind: [newStock, newWac, now, input.productId],
      });
    }

    // COMMIT
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }

  // 3. Append outbox (AFTER commit)
  appendOutbox(db, userId, "transaction", id, "create", {
    opId,
    transactionType: input.transactionType,
    transactionDate: input.transactionDate,
    description: input.description ?? "",
    cashAccountId: input.cashAccountId,
    counterAccountId: input.counterAccountId ?? null,
    amountIdr: input.amountIdr,
  });

  return getTransactionById(db, id)!;
}

/**
 * Void a transaction — local DB first.
 * Sets status = 'voided' and appends outbox.
 */
export function voidTransactionLocal(db: Database, transactionId: string): Transaction {
  const tx = getTransactionById(db, transactionId);
  if (!tx) throw new Error("Transaction not found");
  if (tx.status === "voided") throw new Error("Transaction already voided");

  const now = Date.now();
  db.exec({
    sql: `UPDATE transactions SET status = 'voided', updated_at = ? WHERE id = ?`,
    bind: [now, transactionId],
  });

  appendOutbox(db, tx.user_id, "transaction", transactionId, "update", {
    status: "voided",
  });

  return getTransactionById(db, transactionId)!;
}
