import { execute, queryAll, queryFirst } from "../db/client";
import { badRequest, conflict, notFound } from "../http/errors";
import { writeAuditStatement } from "../http/audit";
import { getAccountByKind } from "./accounts.service";
import type { AccountRow } from "./accounts.service";
import type {
  GetStockMovementReportInput,
  StockMovementReportLine,
} from "./report-types";

// ── Types ───────────────────────────────────────────────────────

export interface ProductRow {
  id: string;
  organization_id: string;
  code: string;
  name: string;
  unit: string;
  selling_price_idr: number;
  current_stock_milli: number;
  average_cost_minor: number;
  is_active: number;
  created_at: number;
  updated_at: number;
}

export interface PublicProduct {
  id: string;
  code: string;
  name: string;
  unit: string;
  selling_price_idr: number;
  /** Stok dalam satuan produk (desimal, maks 3 angka di belakang koma). */
  current_stock: number;
  /** Harga pokok rata-rata per satuan (desimal, maks 4 angka di belakang koma). */
  average_cost_idr: number;
  /** Nilai persediaan = stok × harga pokok rata-rata (pembulatan ke rupiah). */
  stock_value_idr: number;
  is_active: number;
  created_at: number;
  updated_at: number;
}

export interface StockMovementRow {
  id: string;
  organization_id: string;
  transaction_id: string;
  product_id: string;
  quantity_milli: number;
  unit_cost_minor: number;
  cost_total_idr: number;
  created_at: number;
}

const productColumns = "id, organization_id, code, name, unit, selling_price_idr, current_stock_milli, average_cost_minor, is_active, created_at, updated_at";

export const MAX_PRODUCT_QUANTITY_MILLI = 1_000_000_000; // 1 juta satuan per item

// ── Unit conversions (quantity: ×1000 milli, cost: ×10000 minor) ──

/** Konversi jumlah dalam satuan produk ke milli (3 desimal). */
export function quantityToMilli(quantity: number): number {
  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw badRequest("invalid_quantity", "Jumlah harus lebih dari 0.");
  }
  const milli = Math.round(quantity * 1000);
  if (milli <= 0 || milli > MAX_PRODUCT_QUANTITY_MILLI) {
    throw badRequest("invalid_quantity", "Jumlah tidak valid.");
  }
  return milli;
}

export function milliToQuantity(milli: number): number {
  return milli / 1000;
}

/** Harga satuan IDR → minor (×10.000). */
export function idrToMinor(idr: number): number {
  return idr * 10_000;
}

/** Biaya per satuan minor → IDR. */
export function minorToIdr(minor: number): number {
  return minor / 10_000;
}

/** Total biaya IDR dari jumlah (milli) × harga satuan IDR, dibulatkan. */
export function costTotalFromMilli(qtyMilli: number, unitCostIdr: number): number {
  return Math.round((qtyMilli * unitCostIdr) / 1000);
}

/**
 * HPP (COGS) IDR dari jumlah (milli) × harga pokok rata-rata (minor):
 * qty/1000 satuan × wac/10.000 IDR = qtyMilli × wacMinor / 10⁷.
 * BigInt dipakai agar tidak meluap untuk stok/harga besar.
 */
export function cogsFromMilliWac(qtyMilli: number, wacMinor: number): number {
  return Number((BigInt(qtyMilli) * BigInt(wacMinor) + 5_000_000n) / 10_000_000n);
}

/** WAC baru setelah pembelian: (stok×wac + qty×harga) / stok baru.
 *  BigInt dengan half-up rounding agar sisa pecahan tidak bias ke bawah
 *  dan terakumulasi (truncation drift) di ribuan pembelian. */
export function computeNewWac(
  stockMilli: number,
  wacMinor: number,
  qtyMilli: number,
  unitCostMinor: number,
): number {
  const newStock = BigInt(stockMilli) + BigInt(qtyMilli);
  if (newStock <= 0n) return 0;
  return Number(
    (BigInt(stockMilli) * BigInt(wacMinor) + BigInt(qtyMilli) * BigInt(unitCostMinor) + newStock / 2n) / newStock,
  );
}

/** Nilai persediaan (IDR) dari stok (milli) × WAC (minor). */
export function stockValueFromMilliWac(stockMilli: number, wacMinor: number): number {
  return Number((BigInt(stockMilli) * BigInt(wacMinor)) / 10_000_000n);
}

// ── CRUD ────────────────────────────────────────────────────────

export async function listProducts(
  db: D1Database,
  organizationId: string,
  options: { includeInactive?: boolean } = {},
): Promise<PublicProduct[]> {
  const conditions = ["organization_id = ?"];
  const values: (string | number)[] = [organizationId];
  if (!options.includeInactive) {
    conditions.push("is_active = 1");
  }
  const rows = await queryAll<ProductRow>(
    db,
    `SELECT ${productColumns} FROM products WHERE ${conditions.join(" AND ")} ORDER BY code ASC`,
    values,
  );
  return rows.map(toPublicProduct);
}

export async function getProduct(
  db: D1Database,
  organizationId: string,
  productId: string,
): Promise<ProductRow | null> {
  return queryFirst<ProductRow>(
    db,
    `SELECT ${productColumns} FROM products WHERE id = ? AND organization_id = ?`,
    [productId, organizationId],
  );
}

export interface CreateProductInput {
  code?: string;
  name: string;
  unit: string;
  sellingPriceIdr?: number;
}

export async function createProduct(
  db: D1Database,
  organizationId: string,
  userId: string,
  input: CreateProductInput,
  requestId?: string,
): Promise<PublicProduct> {
  const name = await assertValidProductName(db, organizationId, input.name);
  const unit = normalizeUnit(input.unit);
  const sellingPriceIdr = normalizePrice(input.sellingPriceIdr ?? 0);
  const current = Date.now();

  const productId = crypto.randomUUID();
  const code = input.code?.trim() ? input.code.trim() : await nextProductCode(db, organizationId);

  // Dua create paralel dapat menghitung kode yang sama; retry dengan kode baru.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const attemptCode = attempt === 0 ? code : await nextProductCode(db, organizationId);
    const attemptId = attempt === 0 ? productId : crypto.randomUUID();
    try {
      await execute(
        db,
        `INSERT INTO products (
           id, organization_id, code, name, unit, selling_price_idr,
           current_stock_milli, average_cost_minor, is_active, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, 0, 0, 1, ?, ?)`,
        [attemptId, organizationId, attemptCode, name, unit, sellingPriceIdr, current, current],
      );
      await writeAuditStatement(db, {
        organizationId,
        actorUserId: userId,
        entityType: "product",
        entityId: attemptId,
        action: "product_created",
        after: { code: attemptCode, name, unit, selling_price_idr: sellingPriceIdr },
        requestId,
        current,
      });
      const product = await getProduct(db, organizationId, attemptId);
      if (!product) throw badRequest("product_create_failed", "Gagal membuat produk.");
      return toPublicProduct(product);
    } catch (err) {
      if (attempt < 2 && err instanceof Error && /unique|constraint/i.test(err.message)) continue;
      throw err;
    }
  }
  throw badRequest("product_create_failed", "Gagal membuat produk.");
}

export interface PatchProductInput {
  name?: string;
  unit?: string;
  sellingPriceIdr?: number;
  isActive?: boolean;
}

export async function patchProduct(
  db: D1Database,
  organizationId: string,
  userId: string,
  productId: string,
  input: PatchProductInput,
  requestId?: string,
): Promise<PublicProduct> {
  const product = await getProduct(db, organizationId, productId);
  if (!product) throw notFound("product_not_found", "Produk tidak ditemukan.");

  const current = Date.now();
  const updates: string[] = [];
  const values: (string | number)[] = [];

  if (input.name !== undefined) {
    const name = await assertValidProductName(db, organizationId, input.name, productId);
    updates.push("name = ?");
    values.push(name);
  }
  if (input.unit !== undefined) {
    updates.push("unit = ?");
    values.push(normalizeUnit(input.unit));
  }
  if (input.sellingPriceIdr !== undefined) {
    updates.push("selling_price_idr = ?");
    values.push(normalizePrice(input.sellingPriceIdr));
  }
  if (input.isActive !== undefined) {
    if (!input.isActive && (await productIsUsed(db, organizationId, productId))) {
      throw conflict("product_in_use", "Produk sudah dipakai transaksi dan tidak dapat dinonaktifkan.");
    }
    updates.push("is_active = ?");
    values.push(input.isActive ? 1 : 0);
  }

  if (updates.length === 0) return toPublicProduct(product);

  values.push(current, productId, organizationId);
  await execute(
    db,
    `UPDATE products SET ${updates.join(", ")}, updated_at = ? WHERE id = ? AND organization_id = ?`,
    values,
  );
  await writeAuditStatement(db, {
    organizationId,
    actorUserId: userId,
    entityType: "product",
    entityId: productId,
    action: "product_updated",
    after: { ...input },
    requestId,
    current,
  });

  const updated = await getProduct(db, organizationId, productId);
  if (!updated) throw notFound("product_not_found", "Produk tidak ditemukan.");
  return toPublicProduct(updated);
}

export async function productIsUsed(
  db: D1Database,
  organizationId: string,
  productId: string,
): Promise<boolean> {
  const row = await queryFirst<{ c: number }>(
    db,
    `SELECT COUNT(*) AS c
     FROM stock_movements sm
     JOIN transactions t ON t.id = sm.transaction_id
     WHERE sm.organization_id = ? AND sm.product_id = ? AND t.status = 'posted'`,
    [organizationId, productId],
  );
  return (row?.c ?? 0) > 0;
}

// ── Akun Persediaan & HPP ───────────────────────────────────────

/** Akun Persediaan (account_kind = 'inventory') yang aktif milik organisasi. */
export async function resolveInventoryAccount(
  db: D1Database,
  organizationId: string,
): Promise<AccountRow | null> {
  return getAccountByKind(db, organizationId, "inventory");
}

/** Akun HPP (account_kind = 'cogs') yang aktif milik organisasi. */
export async function resolveCogsAccount(
  db: D1Database,
  organizationId: string,
): Promise<AccountRow | null> {
  return getAccountByKind(db, organizationId, "cogs");
}

// ── Stok & WAC ──────────────────────────────────────────────────

/** Semua pergerakan stok produk dari transaksi posted, urut kronologis. */
export async function movementsForProduct(
  db: D1Database,
  organizationId: string,
  productId: string,
): Promise<StockMovementRow[]> {
  return queryAll<StockMovementRow>(
    db,
    `SELECT sm.id, sm.organization_id, sm.transaction_id, sm.product_id,
            sm.quantity_milli, sm.unit_cost_minor, sm.cost_total_idr, sm.created_at
     FROM stock_movements sm
     JOIN transactions t ON t.id = sm.transaction_id
     WHERE sm.organization_id = ? AND sm.product_id = ? AND t.status = 'posted'
     ORDER BY sm.created_at ASC, sm.rowid ASC`,
    [organizationId, productId],
  );
}

export type { GetStockMovementReportInput, StockMovementReportLine };

/**
 * Laporan mutasi stok per produk: hanya transaksi posted (void dikecualikan),
 * urut produk lalu kronologis. Sisa berjalan dihitung dari seluruh riwayat
 * s.d. toDate (pola yang sama dengan running balance Buku Besar) sehingga
 * filter tanggal tidak mematahkan angka.
 */
export async function getStockMovementReport(
  db: D1Database,
  organizationId: string,
  input: GetStockMovementReportInput,
): Promise<StockMovementReportLine[]> {
  const values: (string)[] = [organizationId, input.toDate];
  let productFilter = "";
  if (input.productId) {
    productFilter = " AND sm.product_id = ?";
    values.push(input.productId);
  }
  const rows = await queryAll<{
    product_id: string;
    product_name: string;
    unit: string;
    entry_date: string;
    transaction_id: string;
    transaction_number: string;
    transaction_type: string;
    description: string;
    quantity_milli: number;
    unit_cost_minor: number;
    created_at: number;
  }>(
    db,
    `-- report:stock-movements
     SELECT p.id AS product_id, p.name AS product_name, p.unit,
            t.transaction_date AS entry_date, t.id AS transaction_id,
            t.transaction_number, t.transaction_type, t.description,
            sm.quantity_milli, sm.unit_cost_minor, sm.created_at
     FROM stock_movements sm
     JOIN transactions t ON t.id = sm.transaction_id
     JOIN products p ON p.id = sm.product_id
     WHERE sm.organization_id = ? AND t.status = 'posted'
       AND t.transaction_date <= ?${productFilter}
     ORDER BY p.name ASC, p.id ASC, t.transaction_date ASC, sm.created_at ASC, sm.rowid ASC`,
    values,
  );

  const running = new Map<string, number>();
  const lines: StockMovementReportLine[] = [];
  for (const row of rows) {
    const next = (running.get(row.product_id) ?? 0) + row.quantity_milli;
    running.set(row.product_id, next);
    if (row.entry_date < input.fromDate) continue;
    lines.push({
      product_id: row.product_id,
      product_name: row.product_name,
      unit: row.unit,
      entry_date: row.entry_date,
      transaction_id: row.transaction_id,
      transaction_number: row.transaction_number,
      transaction_type: row.transaction_type,
      description: row.description,
      quantity_in_milli: row.quantity_milli > 0 ? row.quantity_milli : 0,
      quantity_out_milli: row.quantity_milli < 0 ? -row.quantity_milli : 0,
      unit_cost_minor: row.unit_cost_minor,
      running_stock_milli: next,
    });
  }
  return lines;
}

/**
 * Hitung stok & WAC dari riwayat pergerakan (murni, tanpa I/O): pembelian
 * menambah stok dengan moving-average, penjualan hanya mengurangi stok.
 */
export function summarizeMovements(
  movements: Pick<StockMovementRow, "quantity_milli" | "unit_cost_minor">[],
): { current_stock_milli: number; average_cost_minor: number } {
  let stock = 0n;
  let wac = 0n;
  for (const m of movements) {
    const qty = BigInt(m.quantity_milli);
    if (qty > 0n) {
      const newStock = stock + qty;
      // Half-up seperti computeNewWac: live path dan recalculate/void path
      // harus identik agar tak ada skew cache-vs-riwayat.
      wac = (stock * wac + qty * BigInt(m.unit_cost_minor) + newStock / 2n) / newStock;
      stock = newStock;
    } else {
      stock += qty; // penjualan: stok berkurang, WAC tidak berubah
    }
  }
  return { current_stock_milli: Number(stock), average_cost_minor: Number(wac) };
}

/**
 * Hitung ulang stok & WAC produk dari riwayat pergerakan (transaksi posted),
 * lalu tulis ke kolom cache. Dipakai saat void (pergerakan yang dibatalkan
 * otomatis terhapus dari hitungan) dan sebagai alat perbaikan.
 */
export async function recalculateProductCosts(
  db: D1Database,
  organizationId: string,
  productId: string,
): Promise<{ current_stock_milli: number; average_cost_minor: number }> {
  const movements = await movementsForProduct(db, organizationId, productId);
  const { current_stock_milli, average_cost_minor } = summarizeMovements(movements);
  await execute(
    db,
    `UPDATE products SET current_stock_milli = ?, average_cost_minor = ?, updated_at = ?
     WHERE id = ? AND organization_id = ?`,
    [current_stock_milli, average_cost_minor, Date.now(), productId, organizationId],
  );
  return { current_stock_milli, average_cost_minor };
}

/**
 * Terapkan perubahan stok/WAC dengan guarded UPDATE (WHERE stok & WAC lama),
 * retry bila nilai berubah di antara baca-tulis (race paralel). `apply` boleh
 * melempar badRequest untuk menolak stok negatif — dicek ulang per retry.
 */
export async function updateProductStockWac(
  db: D1Database,
  organizationId: string,
  productId: string,
  apply: (current: { stockMilli: number; wacMinor: number }) => { stockMilli: number; wacMinor: number },
): Promise<void> {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const product = await getProduct(db, organizationId, productId);
    if (!product) throw badRequest("product_not_found", "Produk tidak ditemukan.");
    const next = apply({
      stockMilli: product.current_stock_milli,
      wacMinor: product.average_cost_minor,
    });
    if (next.stockMilli < 0) {
      throw badRequest("insufficient_stock", "Stok produk tidak mencukupi.");
    }
    const result = await execute(
      db,
      `UPDATE products
       SET current_stock_milli = ?, average_cost_minor = ?, updated_at = ?
       WHERE id = ? AND organization_id = ?
         AND current_stock_milli = ? AND average_cost_minor = ?`,
      [
        next.stockMilli, next.wacMinor, Date.now(),
        productId, organizationId,
        product.current_stock_milli, product.average_cost_minor,
      ],
    );
    if (result.meta.changes > 0) return;
  }
  throw conflict("stock_update_conflict", "Stok produk berubah saat diproses. Coba lagi.");
}

// ── Helpers ─────────────────────────────────────────────────────

function toPublicProduct(row: ProductRow): PublicProduct {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    unit: row.unit,
    selling_price_idr: row.selling_price_idr,
    current_stock: milliToQuantity(row.current_stock_milli),
    average_cost_idr: minorToIdr(row.average_cost_minor),
    stock_value_idr: stockValueFromMilliWac(row.current_stock_milli, row.average_cost_minor),
    is_active: row.is_active,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function assertValidProductName(
  db: D1Database,
  organizationId: string,
  rawName: string,
  excludeProductId?: string,
): Promise<string> {
  const name = rawName.trim();
  if (!name) throw badRequest("product_name_required", "Nama produk harus diisi.");
  if (name.length > 80) throw badRequest("product_name_too_long", "Nama produk maksimal 80 karakter.");

  const existing = await queryFirst<{ id: string }>(
    db,
    excludeProductId
      ? "SELECT id FROM products WHERE organization_id = ? AND name = ? AND id != ?"
      : "SELECT id FROM products WHERE organization_id = ? AND name = ?",
    excludeProductId ? [organizationId, name, excludeProductId] : [organizationId, name],
  );
  if (existing) throw badRequest("product_name_taken", "Nama produk sudah dipakai dalam organisasi ini.");
  return name;
}

function normalizeUnit(raw: string): string {
  const unit = raw.trim().slice(0, 20);
  if (!unit) throw badRequest("product_unit_required", "Satuan harus diisi.");
  return unit;
}

function normalizePrice(value: number): number {
  if (!Number.isInteger(value) || value < 0 || value > 999_999_999_999) {
    throw badRequest("invalid_price", "Harga harus bilangan bulat rupiah tidak negatif.");
  }
  return value;
}

/** Kode produk otomatis: PRD-XXXX (X = nomor urut). */
async function nextProductCode(db: D1Database, organizationId: string): Promise<string> {
  const row = await queryFirst<{ max_seq: number | null }>(
    db,
    `SELECT MAX(CAST(SUBSTR(code, 5) AS INTEGER)) AS max_seq
     FROM products WHERE organization_id = ? AND code LIKE 'PRD-%'`,
    [organizationId],
  );
  let seq = (row?.max_seq ?? 0) + 1;
  for (;;) {
    const code = `PRD-${String(seq).padStart(4, "0")}`;
    const existing = await queryFirst<{ id: string }>(
      db,
      "SELECT id FROM products WHERE organization_id = ? AND code = ?",
      [organizationId, code],
    );
    if (!existing) return code;
    seq += 1;
  }
}