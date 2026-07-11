import { generateId } from "../auth/tokens";
import { execute, queryAll, queryFirst } from "../db/client";
import { badRequest, conflict, notFound } from "../http/errors";

export type StockMovementType = "opening" | "purchase" | "sale" | "adjustment" | "void";

export interface PublicProduct {
  id: string;
  code: string;
  name: string;
  description: string | null;
  unit: string;
  purchase_price: number;
  selling_price: number;
  current_stock: number;
  min_stock: number;
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

export interface PublicStockMovement {
  id: string;
  product_id: string;
  movement_date: string;
  movement_type: StockMovementType;
  quantity: number;
  unit_cost: number | null;
  transaction_id: string | null;
  stock_after: number;
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

interface AccountIdRow {
  id: string;
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
       is_active, created_by, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, 1, ?, ?, ?)`,
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
      current,
      current,
    ],
  );

  if (initialStockMilli > 0) {
    await recordStockMovement(db, organizationId, userId, {
      productId,
      movementType: "opening",
      movementDate: new Date(current).toISOString().slice(0, 10),
      quantity: input.currentStock,
      unitCost: input.purchasePrice,
      notes: "Stok awal produk",
    });
  }

  const product = await getProduct(db, organizationId, productId);
  await writeProductAudit(db, {
    organizationId,
    actorUserId: userId,
    productId,
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
  await writeProductAudit(db, {
    organizationId,
    actorUserId: userId,
    productId,
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

export async function recordStockMovement(
  db: D1Database,
  organizationId: string,
  userId: string,
  input: StockMovementInput,
): Promise<PublicStockMovement> {
  const product = await getProductRow(db, organizationId, input.productId);
  if (!product) throw notFound("product_not_found", "Product not found");

  const quantityMilli = toSignedQuantityMilli(input.quantity);
  if (quantityMilli === 0) {
    throw badRequest("stock_quantity_required", "Stock movement quantity must be non-zero");
  }

  const currentStockMilli = product.current_stock_milli;
  const nextStockMilli = currentStockMilli + quantityMilli;
  if (nextStockMilli < 0) {
    throw conflict("insufficient_stock", "Insufficient stock");
  }

  const unitCostMinor = input.unitCost === null || input.unitCost === undefined
    ? null
    : toMoneyMinor(input.unitCost);
  const nextAverageCost = nextAverageCostMinor(
    product,
    quantityMilli,
    unitCostMinor,
    input.movementType,
  );
  const current = Date.now();
  const movementId = generateId();

  await execute(
    db,
    `UPDATE products
     SET current_stock_milli = ?,
         average_cost_minor = ?,
         purchase_price_minor = ?,
         updated_at = ?
     WHERE id = ? AND organization_id = ?`,
    [
      nextStockMilli,
      nextAverageCost,
      nextAverageCost,
      current,
      input.productId,
      organizationId,
    ],
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
      unitCostMinor,
      input.transactionId ?? null,
      nextStockMilli,
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
  if (!Number.isInteger(value)) {
    throw badRequest("money_not_integer", "Money value must be a whole number of rupiah");
  }
  return Math.round(value);
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

function fromQuantityMilli(value: number): number {
  return value / 1000;
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
  return Math.round((currentValue + addedValue) / nextStockMilli);
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
  const inventory = await accountByCode(db, organizationId, "1300");
  const cogs = await accountByCode(db, organizationId, "5100");
  const revenue = await accountByCode(db, organizationId, "4100")
    ?? await accountByCode(db, organizationId, "4200");
  return {
    inventoryAccountId: inventory?.id ?? null,
    cogsAccountId: cogs?.id ?? null,
    revenueAccountId: revenue?.id ?? null,
  };
}

async function accountByCode(
  db: D1Database,
  organizationId: string,
  code: string,
): Promise<AccountIdRow | null> {
  return queryFirst<AccountIdRow>(
    db,
    "SELECT id FROM accounts WHERE organization_id = ? AND code = ?",
    [organizationId, code],
  );
}

async function writeProductAudit(
  db: D1Database,
  input: {
    organizationId: string;
    actorUserId: string;
    productId: string;
    action: string;
    before?: unknown;
    after?: unknown;
    requestId?: string;
    current: number;
  },
): Promise<void> {
  await execute(
    db,
    `INSERT INTO audit_logs (
       id, organization_id, actor_user_id, entity_type, entity_id, action,
       before_json, after_json, request_id, created_at
     ) VALUES (?, ?, ?, 'product', ?, ?, ?, ?, ?, ?)`,
    [
      generateId(),
      input.organizationId,
      input.actorUserId,
      input.productId,
      input.action,
      input.before ? JSON.stringify(input.before) : null,
      input.after ? JSON.stringify(input.after) : null,
      input.requestId,
      input.current,
    ],
  );
}
