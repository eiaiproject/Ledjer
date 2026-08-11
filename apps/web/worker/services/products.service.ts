import { generateId } from "../auth/tokens";
import { execute, executeBatch, queryAll, queryFirst, statement } from "../db/client";
import { writeAuditStatement } from "../http/audit";
import { badRequest, conflict, notFound } from "../http/errors";
import { nextSequentialNumber } from "./document-utils";

export type StockMovementType = "opening" | "purchase" | "sale" | "adjustment" | "void" | "stock_count" | "sale_return" | "purchase_return";

export interface PublicProduct {
  id: string;
  code: string;
  name: string;
  description: string | null;
  unit: string;
  purchase_price: number;
  selling_price: number;
  current_stock: string;
  min_stock: string;
  is_active: boolean;
}

export interface CreateProductInput {
  code: string;
  name: string;
  description?: string | null;
  unit: string;
  purchasePrice: number;
  sellingPrice: number;
  currentStock: number;
  minStock: number;
  idempotencyKey?: string;
}

export interface PatchProductInput {
  code?: string;
  name?: string;
  description?: string | null;
  unit?: string;
  sellingPrice?: number;
  minStock?: number;
  isActive?: boolean;
}

export interface StockMovementInput {
  productId: string;
  movementType: StockMovementType;
  movementDate: string;
  quantity: number;
  unitCost?: number | null;
  transactionId?: string | null;
  notes?: string | null;
}

export interface StockAdjustmentInput {
  productId: string;
  quantity: number;
  reason: string;
  movementDate?: string;
}

export interface StockAdjustmentResult extends PublicStockMovement {
  /** Whether the paired journal entry was posted (false when accounts are missing). */
  journal_posted: boolean;
  journal_skip_reason?: string;
}

export interface StockCountInput {
  productId: string;
  physicalStock: number;
  notes?: string;
}

export interface PublicStockMovement {
  id: string;
  product_id: string;
  movement_date: string;
  movement_type: StockMovementType;
  quantity: string;
  unit_cost: number | null;
  transaction_id: string | null;
  stock_after: string;
  notes: string | null;
  created_by: string | null;
  created_at: number;
}

interface ProductRow {
  id: string;
  code: string;
  name: string;
  description: string | null;
  unit: string;
  purchase_price_minor: number;
  selling_price_minor: number;
  average_cost_minor: number;
  current_stock_milli: number;
  min_stock_milli: number;
  inventory_account_id: string | null;
  cogs_account_id: string | null;
  revenue_account_id: string | null;
  is_active: 0 | 1;
  onboarding_status?: string;
}

interface StockMovementRow {
  id: string;
  organization_id: string;
  product_id: string;
  movement_date: string;
  movement_type: StockMovementType;
  quantity_milli: number;
  unit_cost_minor: number | null;
  transaction_id: string | null;
  stock_after_milli: number;
  notes: string | null;
  created_by: string | null;
  created_at: number;
}

export async function listProducts(
  db: D1Database,
  organizationId: string,
  activeOnly = true,
): Promise<PublicProduct[]> {
  const rows = await queryAll<ProductRow>(
    db,
    `${productSelectSql()}
     WHERE organization_id = ?
       ${activeOnly ? "AND is_active = 1" : ""}
     ORDER BY code`,
    [organizationId],
  );

  return rows.map(toPublicProduct);
}

export async function getProduct(
  db: D1Database,
  organizationId: string,
  productId: string,
): Promise<PublicProduct> {
  const row = await getProductRow(db, organizationId, productId);
  if (!row) throw notFound("product_not_found", "Product not found");
  return toPublicProduct(row);
}

export async function createProduct(
  db: D1Database,
  organizationId: string,
  userId: string,
  input: CreateProductInput,
  requestId?: string,
): Promise<PublicProduct> {
  const current = Date.now();
  const productId = generateId();
  const code = normalizeCode(input.code);
  const name = normalizeName(input.name);
  const unit = normalizeUnit(input.unit);
  const purchasePriceMinor = toMoneyMinor(input.purchasePrice);
  const sellingPriceMinor = toMoneyMinor(input.sellingPrice);
  const initialStockMilli = toQuantityMilli(input.currentStock);
  const minStockMilli = toQuantityMilli(input.minStock);
  const onboardingStatus = await getOrganizationOnboardingStatus(db, organizationId);

  if (initialStockMilli > 0 && onboardingStatus === "completed") {
    throw badRequest(
      "initial_stock_not_supported",
      "Initial stock is not allowed after onboarding is completed",
    );
  }

  await ensureUniqueProductCode(db, organizationId, code);
  const accounts = await productAccountIds(db, organizationId);

  await execute(
    db,
    `INSERT INTO products (
       id, organization_id, code, name, description, unit,
       purchase_price_minor, selling_price_minor, average_cost_minor,
       current_stock_milli, min_stock_milli,
       inventory_account_id, cogs_account_id, revenue_account_id,
       is_active, created_by, idempotency_key, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, 1, ?, ?, ?, ?)`,
    [
      productId,
      organizationId,
      code,
      name,
      nullableText(input.description),
      unit,
      purchasePriceMinor,
      sellingPriceMinor,
      initialStockMilli > 0 ? purchasePriceMinor : 0,
      minStockMilli,
      accounts.inventoryAccountId,
      accounts.cogsAccountId,
      accounts.revenueAccountId,
      userId,
      input.idempotencyKey ?? null,
      current,
      current,
    ],
  );

  if (initialStockMilli > 0) {
    const movementDate = new Date(current).toISOString().slice(0, 10);
    await recordStockMovement(db, organizationId, userId, {
      productId,
      movementType: "opening",
      movementDate,
      quantity: input.currentStock,
      unitCost: input.purchasePrice,
      notes: "Stok awal produk",
    });
    await postOpeningStockJournal(db, organizationId, userId, {
      productName: name,
      quantity: input.currentStock,
      unitCostMinor: purchasePriceMinor,
      inventoryAccountId: accounts.inventoryAccountId,
      movementDate,
      requestId,
    });
  }

  const product = await getProduct(db, organizationId, productId);
  writeAuditStatement(db, {
    organizationId,
    actorUserId: userId,
    entityType: "product",
    entityId: productId,
    action: "create",
    after: product,
    requestId,
    current,
  });

  return product;
}

export async function patchProduct(
  db: D1Database,
  organizationId: string,
  userId: string,
  productId: string,
  input: PatchProductInput,
  requestId?: string,
): Promise<PublicProduct> {
  const existing = await getProductRow(db, organizationId, productId);
  if (!existing) throw notFound("product_not_found", "Product not found");

  const updates: string[] = [];
  const values: (string | number | boolean | null)[] = [];
  const before = toPublicProduct(existing);

  if (input.code !== undefined) {
    const code = normalizeCode(input.code);
    await ensureUniqueProductCode(db, organizationId, code, productId);
    updates.push("code = ?");
    values.push(code);
  }
  if (input.name !== undefined) {
    updates.push("name = ?");
    values.push(normalizeName(input.name));
  }
  if (input.description !== undefined) {
    updates.push("description = ?");
    values.push(nullableText(input.description));
  }
  if (input.unit !== undefined) {
    updates.push("unit = ?");
    values.push(normalizeUnit(input.unit));
  }
  if (input.sellingPrice !== undefined) {
    updates.push("selling_price_minor = ?");
    values.push(toMoneyMinor(input.sellingPrice));
  }
  if (input.minStock !== undefined) {
    updates.push("min_stock_milli = ?");
    values.push(toQuantityMilli(input.minStock));
  }
  if (input.isActive !== undefined) {
    updates.push("is_active = ?");
    values.push(input.isActive);
  }

  if (!updates.length) return before;

  const current = Date.now();
  updates.push("updated_at = ?");
  values.push(current, productId, organizationId);
  await execute(
    db,
    `UPDATE products
     SET ${updates.join(", ")}
     WHERE id = ? AND organization_id = ?`,
    values,
  );

  const after = await getProduct(db, organizationId, productId);
  writeAuditStatement(db, {
    organizationId,
    actorUserId: userId,
    entityType: "product",
    entityId: productId,
    action: "update",
    before,
    after,
    requestId,
    current,
  });

  return after;
}

export async function deactivateProduct(
  db: D1Database,
  organizationId: string,
  userId: string,
  productId: string,
  requestId?: string,
): Promise<PublicProduct> {
  return patchProduct(
    db,
    organizationId,
    userId,
    productId,
    { isActive: false },
    requestId,
  );
}

/**
 * Record a manual stock adjustment with a required reason.
 * Creates an adjustment stock movement and, if quantity changes, updates
 * the product's current stock and average cost.
 *
 * Also posts a balanced journal entry so the inventory control account
 * stays in sync with the stock subledger:
 *   stock increase → Dr Persediaan / Cr Pendapatan Lain-lain
 *   stock decrease → Dr Beban Lain-lain / Cr Persediaan
 * The journal is skipped when the adjustment has no monetary value or the
 * required accounts are not configured (the movement is still recorded).
 *
 * The stock movement and its paired journal are written in a SINGLE atomic
 * batch, so a failure can never leave a movement without its journal — the
 * previous sequential write allowed ghost inventory in the balance sheet.
 * The optimistic stock UPDATE is a separate conflict-safe write that happens
 * before the batch; the only residual window is a failure between those two
 * steps (stock changed without movement/journal), which the dashboard
 * inventory-mismatch alert detects.
 */
export async function recordStockAdjustment(
  db: D1Database,
  organizationId: string,
  userId: string,
  input: StockAdjustmentInput,
  requestId?: string,
): Promise<StockAdjustmentResult> {
  if (!input.reason.trim()) {
    throw badRequest("reason_required", "Alasan penyesuaian stok wajib diisi.");
  }
  if (input.reason.trim().length > 500) {
    throw badRequest("reason_too_long", "Alasan penyesuaian maksimal 500 karakter.");
  }

  const product = await getProductRow(db, organizationId, input.productId);
  if (!product) throw notFound("product_not_found", "Produk tidak ditemukan");

  const movementDate = input.movementDate ?? new Date().toISOString().slice(0, 10);
  await assertPeriodOpen(db, organizationId, movementDate);

  // M-04: Validate movement date is not in the future (same guard as recordStockMovement).
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date());
  if (movementDate > today) {
    throw badRequest('future_movement_date', 'Movement date cannot be in the future');
  }

  const quantityMilli = toSignedQuantityMilli(input.quantity);
  if (quantityMilli === 0) {
    throw badRequest("stock_quantity_required", "Stock movement quantity must be non-zero");
  }

  const reason = input.reason.trim();
  const current = Date.now();
  const movementId = generateId();

  // Resolve the journal plan first — its amount and accounts depend only on
  // the product's average cost, which stock adjustments never change.
  // Note: this consumes the AJ counter before the writes below; on a failed
  // write the number is skipped (harmless — entry numbers may have gaps).
  const journal = await planStockAdjustmentJournal(db, organizationId, userId, {
    product,
    quantity: input.quantity,
    reason,
    movementDate,
    current,
    requestId,
  });

  // 1) Optimistic stock UPDATE (conflict-safe, retried on concurrent writes).
  const { stockAfterMilli } = await updateProductStockWithRetry(
    db, organizationId, input.productId,
    quantityMilli, null, "adjustment", current,
  );

  // 2) Movement + journal in ONE atomic batch — no window where a movement
  //    exists without its paired journal (or vice versa).
  const statements: D1PreparedStatement[] = [
    statement(
      db,
      `INSERT INTO stock_movements (
         id, organization_id, product_id, movement_date, movement_type,
         quantity_milli, unit_cost_minor, transaction_id, stock_after_milli,
         notes, created_by, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [movementId, organizationId, product.id, movementDate, "adjustment",
       quantityMilli, null, null, stockAfterMilli, `[ADJ] ${reason}`, userId, current],
    ),
    ...journal.statements,
  ];
  await executeBatch(db, statements);

  return {
    id: movementId,
    product_id: product.id,
    movement_date: movementDate,
    movement_type: "adjustment",
    quantity: fromQuantityMilli(quantityMilli),
    unit_cost: null,
    transaction_id: null,
    stock_after: fromQuantityMilli(stockAfterMilli),
    notes: `[ADJ] ${reason}`,
    created_by: userId,
    created_at: current,
    journal_posted: journal.posted,
    journal_skip_reason: journal.skipReason,
  };
}

/**
 * Record a physical stock count for a product.
 * Compares physical stock with system stock and returns the difference.
 * Does NOT automatically adjust — the user must confirm via a separate
 * stock adjustment call.
 */
export async function recordStockCount(
  db: D1Database,
  organizationId: string,
  userId: string,
  input: StockCountInput,
): Promise<{
  productId: string;
  productName: string;
  systemStock: string;
  physicalStock: string;
  difference: string;
  movement: PublicStockMovement | null;
}> {
  // M-05: Validate physical stock is not negative
  if (input.physicalStock < 0) {
    throw badRequest('negative_physical_stock', 'Physical stock cannot be negative');
  }

  const product = await getProductRow(db, organizationId, input.productId);
  if (!product) throw notFound("product_not_found", "Produk tidak ditemukan");

  const systemStockMilli = product.current_stock_milli;
  const physicalStockMilli = Math.round(input.physicalStock * 1000);
  const diffMilli = physicalStockMilli - systemStockMilli;

  // Record a stock_count movement for audit trail
  const movement = await recordStockMovement(db, organizationId, userId, {
    productId: input.productId,
    movementType: "stock_count",
    movementDate: new Date().toISOString().slice(0, 10),
    quantity: 0, // Zero quantity — just logs the count
    notes: input.notes ? `[COUNT] Fisik: ${fromQuantityMilli(physicalStockMilli)}, Sistem: ${fromQuantityMilli(systemStockMilli)}, Selisih: ${fromQuantityMilli(diffMilli)} — ${input.notes}` : `[COUNT] Fisik: ${fromQuantityMilli(physicalStockMilli)}, Sistem: ${fromQuantityMilli(systemStockMilli)}, Selisih: ${fromQuantityMilli(diffMilli)}`,
  });

  const productName = product.name;

  return {
    productId: input.productId,
    productName,
    systemStock: fromQuantityMilli(systemStockMilli),
    physicalStock: fromQuantityMilli(physicalStockMilli),
    difference: fromQuantityMilli(diffMilli),
    movement,
  };
}

/**
 * Attempt an optimistic-lock UPDATE on the product stock row, retrying
 * on concurrent modification. Returns the final stock/cost values on success.
 */
async function updateProductStockWithRetry(
  db: D1Database,
  organizationId: string,
  productId: string,
  quantityMilli: number,
  unitCostMinor: number | null,
  movementType: StockMovementType,
  current: number,
): Promise<{ stockAfterMilli: number; avgCostMinor: number }> {
  const MAX_RETRIES = 3;
  const RETRY_DELAYS = [5, 15, 50];

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      await new Promise((r) => setTimeout(r, RETRY_DELAYS[attempt - 1] ?? 50));
    }

    const product = await getProductRow(db, organizationId, productId);
    if (!product) throw notFound("product_not_found", "Product not found");

    const curStock = product.current_stock_milli;
    const nextStock = curStock + quantityMilli;
    if (nextStock < 0) {
      throw conflict("insufficient_stock", "Insufficient stock");
    }

    const avgCost = nextAverageCostMinor(product, quantityMilli, unitCostMinor, movementType);

    const result = await execute(
      db,
      `UPDATE products
       SET current_stock_milli = ?,
           average_cost_minor = ?,
           purchase_price_minor = ?,
           updated_at = ?
       WHERE id = ? AND organization_id = ? AND current_stock_milli = ?`,
      [nextStock, avgCost, avgCost, current, productId, organizationId, curStock],
    );

    if (result.meta.changes > 0) {
      return { stockAfterMilli: nextStock, avgCostMinor: avgCost };
    }
  }

  throw conflict("stock_concurrent_modify", "Stock was modified by another request, please retry");
}

export async function recordStockMovement(
  db: D1Database,
  organizationId: string,
  userId: string,
  input: StockMovementInput,
): Promise<PublicStockMovement> {
  const product = await getProductRow(db, organizationId, input.productId);
  if (!product) throw notFound("product_not_found", "Product not found");

  // M-04: Validate movement date is not in the future
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date());
  if (input.movementDate > today) {
    throw badRequest('future_movement_date', 'Movement date cannot be in the future');
  }

  const quantityMilli = toSignedQuantityMilli(input.quantity);
  if (quantityMilli === 0) {
    throw badRequest("stock_quantity_required", "Stock movement quantity must be non-zero");
  }

  const currentStockMilli = product.current_stock_milli;
  const nextStockMilli = currentStockMilli + quantityMilli;
  if (nextStockMilli < 0) {
    throw conflict("insufficient_stock", "Insufficient stock");
  }

  const unitCostMinor = input.unitCost ?? null;
  const unitCostMinorVal = unitCostMinor === null ? null : toMoneyMinor(unitCostMinor);
  const current = Date.now();
  const movementId = generateId();

  const { stockAfterMilli: nextStockMilliVar } =
    await updateProductStockWithRetry(
      db, organizationId, input.productId,
      quantityMilli, unitCostMinorVal, input.movementType, current,
    );

  await execute(
    db,
    `INSERT INTO stock_movements (
       id, organization_id, product_id, movement_date, movement_type,
       quantity_milli, unit_cost_minor, transaction_id, stock_after_milli,
       notes, created_by, created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      movementId,
      organizationId,
      input.productId,
      input.movementDate,
      input.movementType,
      quantityMilli,
      unitCostMinorVal,
      input.transactionId ?? null,
      nextStockMilliVar,
      nullableText(input.notes),
      userId,
      current,
    ],
  );

  const movement = await queryFirst<StockMovementRow>(
    db,
    `${stockMovementSelectSql()}
     WHERE id = ? AND organization_id = ?`,
    [movementId, organizationId],
  );
  if (!movement) throw badRequest("stock_movement_failed", "Stock movement was not created");
  return toPublicStockMovement(movement);
}

export async function listStockMovements(
  db: D1Database,
  organizationId: string,
  productId?: string,
): Promise<PublicStockMovement[]> {
  const rows = await queryAll<StockMovementRow>(
    db,
    `${stockMovementSelectSql()}
     WHERE organization_id = ?
       ${productId ? "AND product_id = ?" : ""}
     ORDER BY movement_date DESC, created_at DESC`,
    productId ? [organizationId, productId] : [organizationId],
  );
  return rows.map(toPublicStockMovement);
}

export function reconcileStock(
  currentStock: number,
  movementQuantities: readonly number[],
): boolean {
  const sum = movementQuantities.reduce((total, quantity) => total + quantity, 0);
  return sum === currentStock;
}

function productSelectSql(): string {
  return `SELECT
       id,
       code,
       name,
       description,
       unit,
       purchase_price_minor,
       selling_price_minor,
       average_cost_minor,
       current_stock_milli,
       min_stock_milli,
       inventory_account_id,
       cogs_account_id,
       revenue_account_id,
       is_active
     FROM products`;
}

async function getProductRow(
  db: D1Database,
  organizationId: string,
  productId: string,
): Promise<ProductRow | null> {
  return queryFirst<ProductRow>(
    db,
    `${productSelectSql()}
     WHERE id = ? AND organization_id = ?`,
    [productId, organizationId],
  );
}

function stockMovementSelectSql(): string {
  return `SELECT
       id,
       organization_id,
       product_id,
       movement_date,
       movement_type,
       quantity_milli,
       unit_cost_minor,
       transaction_id,
       stock_after_milli,
       notes,
       created_by,
       created_at
     FROM stock_movements`;
}

function toPublicProduct(row: ProductRow): PublicProduct {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description,
    unit: row.unit,
    purchase_price: row.average_cost_minor || row.purchase_price_minor,
    selling_price: row.selling_price_minor,
    current_stock: fromQuantityMilli(row.current_stock_milli),
    min_stock: fromQuantityMilli(row.min_stock_milli),
    is_active: row.is_active === 1,
  };
}

function toPublicStockMovement(row: StockMovementRow): PublicStockMovement {
  return {
    id: row.id,
    product_id: row.product_id,
    movement_date: row.movement_date,
    movement_type: row.movement_type,
    quantity: fromQuantityMilli(row.quantity_milli),
    unit_cost: row.unit_cost_minor,
    transaction_id: row.transaction_id,
    stock_after: fromQuantityMilli(row.stock_after_milli),
    notes: row.notes,
    created_by: row.created_by,
    created_at: row.created_at,
  };
}

function normalizeCode(input: string): string {
  const value = input.trim();
  if (!value) throw badRequest("product_code_required", "Product code is required");
  if (value.length > 40) throw badRequest("product_code_too_long", "Product code is too long");
  return value;
}

function normalizeName(input: string): string {
  const value = input.trim();
  if (!value) throw badRequest("product_name_required", "Product name is required");
  if (value.length > 120) throw badRequest("product_name_too_long", "Product name is too long");
  return value;
}

function normalizeUnit(input: string): string {
  const value = input.trim();
  if (!value) throw badRequest("product_unit_required", "Product unit is required");
  if (value.length > 32) throw badRequest("product_unit_too_long", "Product unit is too long");
  return value;
}

function nullableText(input: string | null | undefined): string | null {
  const value = input?.trim();
  return value || null;
}

function toMoneyMinor(value: number): number {
  if (!Number.isFinite(value) || value < 0) {
    throw badRequest("money_invalid", "Money value must be non-negative");
  }
  // Prices may be fractional (e.g. 495000 ÷ 251 butir = 1,971.31 per unit).
  return value;
}

function toQuantityMilli(value: number): number {
  if (!Number.isFinite(value) || value < 0) {
    throw badRequest("quantity_invalid", "Quantity must be non-negative");
  }
  return Math.round(value * 1000);
}

function toSignedQuantityMilli(value: number): number {
  if (!Number.isFinite(value)) {
    throw badRequest("quantity_invalid", "Quantity is invalid");
  }
  return Math.round(value * 1000);
}

export function fromQuantityMilli(value: number): string {
  // value is an integer count of milli-units, so value / 1000 always has at
  // most 3 decimals. String() renders whole values as plain integers ("250",
  // not "250.000") and already trims trailing zeros from true fractions
  // ("250.5", not "250.500") — no regex needed.
  return String(value / 1000);
}

function nextAverageCostMinor(
  product: ProductRow,
  quantityMilli: number,
  unitCostMinor: number | null,
  movementType: StockMovementType,
): number {
  if (
    quantityMilli <= 0 ||
    unitCostMinor === null ||
    !["opening", "purchase"].includes(movementType)
  ) {
    return product.average_cost_minor;
  }

  const currentStockMilli = product.current_stock_milli;
  const nextStockMilli = currentStockMilli + quantityMilli;
  if (nextStockMilli <= 0) return unitCostMinor;

  const currentValue = currentStockMilli * product.average_cost_minor;
  const addedValue = quantityMilli * unitCostMinor;
  // Fractional cost stays exact (economy: REAL column); round only to 4dp.
  return Math.round(((currentValue + addedValue) / nextStockMilli) * 1e4) / 1e4;
}

async function ensureUniqueProductCode(
  db: D1Database,
  organizationId: string,
  code: string,
  exceptProductId?: string,
): Promise<void> {
  const existing = await queryFirst<{ id: string }>(
    db,
    `SELECT id
     FROM products
     WHERE organization_id = ?
       AND lower(code) = lower(?)
       ${exceptProductId ? "AND id != ?" : ""}
     LIMIT 1`,
    exceptProductId ? [organizationId, code, exceptProductId] : [organizationId, code],
  );
  if (existing) throw conflict("product_code_duplicate", "Product code is already used");
}

/**
 * Guard against posting stock adjustments inside a locked period.
 * Local copy of the same guard used by manual-journals/transactions to
 * avoid a circular import between the products and transactions services.
 */
async function assertPeriodOpen(db: D1Database, organizationId: string, date: string): Promise<void> {
  const lock = await queryFirst<{ id: string }>(
    db,
    `SELECT id FROM period_locks
     WHERE organization_id = ? AND locked_through_date >= ?
     ORDER BY locked_through_date DESC LIMIT 1`,
    [organizationId, date],
  );
  if (lock) throw conflict("period_locked", "The selected date is inside a locked period");
}

interface StockAdjustmentJournalInput {
  product: ProductRow;
  quantity: number;
  reason: string;
  movementDate: string;
  current: number;
  requestId?: string;
}

interface StockAdjustmentJournalPlan {
  posted: boolean;
  skipReason?: string;
  statements: D1PreparedStatement[];
}

/**
 * Build the balanced journal statements for a manual stock adjustment.
 * Amount = |quantity| × weighted-average cost. Returns no statements when
 * the adjustment has no monetary value or the needed accounts are missing
 * (the caller still records the movement). The caller executes the returned
 * statements in the same atomic batch as the stock movement.
 */
async function planStockAdjustmentJournal(
  db: D1Database,
  organizationId: string,
  userId: string,
  input: StockAdjustmentJournalInput,
): Promise<StockAdjustmentJournalPlan> {
  const value = Math.round(Math.abs(input.quantity) * input.product.average_cost_minor);
  if (value <= 0) {
    return { posted: false, skipReason: "no_value", statements: [] };
  }

  const inventoryAccountId = input.product.inventory_account_id
    ?? await findActiveAccountId(db, organizationId, "1300");
  if (!inventoryAccountId) {
    return { posted: false, skipReason: "inventory_account_missing", statements: [] };
  }

  const isDecrease = input.quantity < 0;
  const counterpartCode = isDecrease ? "8100" : "7100";
  const counterpartAccountId = await findActiveAccountId(db, organizationId, counterpartCode);
  if (!counterpartAccountId) {
    return { posted: false, skipReason: "counterpart_account_missing", statements: [] };
  }

  const current = input.current;
  const journalEntryId = generateId();
  const entryNumber = await nextSequentialNumber(db, organizationId, "stock_adjustment", "AJ");
  const description = `Penyesuaian stok ${input.product.name} — ${input.reason}`;
  const debitAccountId = isDecrease ? counterpartAccountId : inventoryAccountId;
  const creditAccountId = isDecrease ? inventoryAccountId : counterpartAccountId;

  const statements: D1PreparedStatement[] = [
    statement(
      db,
      `INSERT INTO journal_entries (
         id, organization_id, entry_number, entry_date, entry_type,
         description, status, posted_at, posted_by, created_at
       ) VALUES (?, ?, ?, ?, 'adjustment', ?, 'posted', ?, ?, ?)`,
      [journalEntryId, organizationId, entryNumber, input.movementDate, description, current, userId, current],
    ),
    statement(
      db,
      `INSERT INTO journal_lines (
         id, organization_id, journal_entry_id, account_id,
         debit_minor, credit_minor, description, line_order, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`,
      [generateId(), organizationId, journalEntryId, debitAccountId, value, 0, description, current],
    ),
    statement(
      db,
      `INSERT INTO journal_lines (
         id, organization_id, journal_entry_id, account_id,
         debit_minor, credit_minor, description, line_order, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, 2, ?)`,
      [generateId(), organizationId, journalEntryId, creditAccountId, 0, value, description, current],
    ),
    writeAuditStatement(db, {
      organizationId,
      actorUserId: userId,
      entityType: "journal_entry",
      entityId: journalEntryId,
      action: "post",
      after: {
        entry_type: "adjustment",
        entry_number: entryNumber,
        entry_date: input.movementDate,
        total_debit: value,
        total_credit: value,
        stock_adjustment: true,
      },
      requestId: input.requestId,
      current,
    }),
  ];

  return { posted: true, statements };
}

interface OpeningStockJournalInput {
  productName: string;
  quantity: number;
  unitCostMinor: number;
  inventoryAccountId: string | null;
  movementDate: string;
  requestId?: string;
}

/**
 * Post the opening-stock journal so the Persediaan control account matches
 * the stock subledger from day one (otherwise selling the opening stock would
 * drive the inventory account negative). Dr Persediaan / Cr Saldo Awal (3200).
 * Skipped when the value is zero or the accounts are not configured.
 */
async function postOpeningStockJournal(
  db: D1Database,
  organizationId: string,
  userId: string,
  input: OpeningStockJournalInput,
): Promise<void> {
  const value = Math.round(input.quantity * input.unitCostMinor);
  if (value <= 0) return;

  const inventoryAccountId = input.inventoryAccountId
    ?? await findActiveAccountId(db, organizationId, "1300");
  if (!inventoryAccountId) return;
  const openingBalanceAccountId = await findActiveAccountId(db, organizationId, "3200");
  if (!openingBalanceAccountId) return;

  const current = Date.now();
  const journalEntryId = generateId();
  const entryNumber = await nextSequentialNumber(db, organizationId, "opening_stock", "OP");
  const description = `Stok awal produk ${input.productName}`;

  const statements: D1PreparedStatement[] = [
    statement(
      db,
      `INSERT INTO journal_entries (
         id, organization_id, entry_number, entry_date, entry_type,
         description, status, posted_at, posted_by, created_at
       ) VALUES (?, ?, ?, ?, 'opening_balance', ?, 'posted', ?, ?, ?)`,
      [journalEntryId, organizationId, entryNumber, input.movementDate, description, current, userId, current],
    ),
    statement(
      db,
      `INSERT INTO journal_lines (
         id, organization_id, journal_entry_id, account_id,
         debit_minor, credit_minor, description, line_order, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`,
      [generateId(), organizationId, journalEntryId, inventoryAccountId, value, 0, description, current],
    ),
    statement(
      db,
      `INSERT INTO journal_lines (
         id, organization_id, journal_entry_id, account_id,
         debit_minor, credit_minor, description, line_order, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, 2, ?)`,
      [generateId(), organizationId, journalEntryId, openingBalanceAccountId, 0, value, description, current],
    ),
  ];

  statements.push(
    writeAuditStatement(db, {
      organizationId,
      actorUserId: userId,
      entityType: "journal_entry",
      entityId: journalEntryId,
      action: "post",
      after: {
        entry_type: "opening_balance",
        entry_number: entryNumber,
        entry_date: input.movementDate,
        total_debit: value,
        total_credit: value,
        opening_stock: true,
      },
      requestId: input.requestId,
      current,
    }),
  );

  await executeBatch(db, statements);
}

async function findActiveAccountId(db: D1Database, organizationId: string, code: string): Promise<string | null> {
  const row = await queryFirst<{ id: string }>(
    db,
    "SELECT id FROM accounts WHERE organization_id = ? AND code = ? AND is_active = 1",
    [organizationId, code],
  );
  return row?.id ?? null;
}

async function getOrganizationOnboardingStatus(
  db: D1Database,
  organizationId: string,
): Promise<string> {
  const row = await queryFirst<{ onboarding_status: string }>(
    db,
    "SELECT onboarding_status FROM organizations WHERE id = ?",
    [organizationId],
  );
  return row?.onboarding_status ?? "completed";
}

async function productAccountIds(
  db: D1Database,
  organizationId: string,
): Promise<{
  inventoryAccountId: string | null;
  cogsAccountId: string | null;
  revenueAccountId: string | null;
}> {
  const findId = async (code: string) => {
    const row = await queryFirst<{ id: string }>(
      db,
      "SELECT id FROM accounts WHERE organization_id = ? AND code = ?",
      [organizationId, code],
    );
    return row?.id ?? null;
  };
  const inventoryAccountId = await findId("1300");
  const cogsAccountId = await findId("5100");
  const revenueAccountId = await findId("4100") ?? await findId("4200");
  return { inventoryAccountId, cogsAccountId, revenueAccountId };
}

