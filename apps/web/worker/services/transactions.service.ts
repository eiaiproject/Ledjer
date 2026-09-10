import { executeBatch, queryAll, queryFirst, statement, type D1Input } from "../db/client";
import { badRequest, conflict, notFound } from "../http/errors";
import { writeAuditStatement } from "../http/audit";
import { normalizeDate } from "../http/date";
import type { TransactionType, TransactionStatus } from "../db/schema";
import type { D1Database, D1PreparedStatement, D1Result } from "@cloudflare/workers-types";
import { sha256Hex } from "../auth/tokens";
import { getAccount, isCashBankAccount, type AccountRow } from "./accounts.service";
import {
  cogsFromMilliWac,
  computeNewWac,
  costTotalFromMilli,
  getProduct,
  idrToMinor,
  milliToQuantity,
  minorToIdr,
  movementsForProduct,
  quantityToMilli,
  recalculateProductCosts,
  resolveCogsAccount,
  resolveInventoryAccount,
  summarizeMovements,
} from "./products.service";

export type TransactionDirection = "in" | "out" | "neutral";

/** Satu baris produk dalam transaksi persediaan (beli/jual barang). */
export interface TransactionItemInput {
  productId: string;
  /** Jumlah dalam satuan produk (desimal, maks 3 angka di belakang koma). */
  quantity: number;
  /** Harga beli per satuan (wajib untuk `purchase`). */
  unitCostIdr?: number;
  /** Harga jual per satuan (wajib untuk penjualan barang via `cash_in`). */
  unitPriceIdr?: number;
}

export interface PostTransactionInput {
  transactionType: TransactionType;
  transactionDate: string;
  cashAccountId: string;
  counterAccountId?: string;
  amountIdr?: number;
  description: string;
  idempotencyKey: string;
  items?: TransactionItemInput[];
}

export interface VoidTransactionInput {
  reason?: string | null;
}

export interface TransactionFilters {
  search?: string;
  transactionType?: string;
  status?: string;
  fromDate?: string;
  toDate?: string;
  limit?: number;
  offset?: number;
}

export interface TransactionItemInfo {
  product_id: string;
  product_code: string;
  product_name: string;
  /** Jumlah dalam satuan produk (desimal). */
  quantity: number;
  quantity_milli: number;
  /** Biaya pokok per satuan (harga beli / HPP). */
  unit_cost_idr: number;
  cost_total_idr: number;
}

export interface PublicTransaction {
  id: string;
  transaction_number: string;
  transaction_type: TransactionType;
  transaction_date: string;
  description: string;
  status: TransactionStatus;
  amount_idr: number;
  cash_account_id: string;
  counter_account_id: string;
  cash_bank_account: string | null;
  counter_account: string | null;
  direction: TransactionDirection;
  created_by: string;
  created_at: number;
  voided_at: number | null;
  void_reason: string | null;
  /** Item produk untuk transaksi persediaan; null untuk transaksi biasa. */
  items: TransactionItemInfo[] | null;
}

export interface PostTransactionResult {
  transaction_id: string;
  transaction_number: string;
  journal_entry_id: string;
  status: "posted";
  replayed?: boolean;
}

interface TransactionRow {
  id: string;
  organization_id: string;
  transaction_number: string;
  transaction_type: TransactionType;
  transaction_date: string;
  description: string;
  status: TransactionStatus;
  amount_idr: number;
  cash_account_id: string;
  counter_account_id: string;
  created_by: string;
  created_at: number;
  voided_at: number | null;
  void_reason: string | null;
  cash_bank_account: string | null;
  counter_account: string | null;
}

interface JournalLineInput {
  accountId: string;
  debitIdr: number;
  creditIdr: number;
}

const TRANSACTION_TYPES = new Set<TransactionType>([
  "cash_in",
  "cash_out",
  "transfer",
  "owner_deposit",
  "owner_withdrawal",
  "purchase",
]);

export const TRANSACTION_LABELS: Record<TransactionType, string> = {
  cash_in: "Uang Masuk",
  cash_out: "Uang Keluar",
  transfer: "Transfer",
  owner_deposit: "Modal Masuk",
  owner_withdrawal: "Pengambilan Pemilik",
  purchase: "Pembelian Barang",
};

export function transactionTypeLabel(type: TransactionType): string {
  return TRANSACTION_LABELS[type] ?? type;
}

export function transactionDirection(type: TransactionType): TransactionDirection {
  switch (type) {
    case "cash_in":
    case "owner_deposit":
      return "in";
    case "cash_out":
    case "owner_withdrawal":
    case "purchase":
      return "out";
    case "transfer":
      return "neutral";
  }
}

export function assertJournalBalanced(lines: readonly JournalLineInput[]): void {
  const debit = lines.reduce((s, l) => s + l.debitIdr, 0);
  const credit = lines.reduce((s, l) => s + l.creditIdr, 0);
  if (debit !== credit) {
    throw badRequest("journal_unbalanced", "Jurnal tidak balance: total debit harus sama dengan total kredit.");
  }
  for (const line of lines) {
    if (line.debitIdr > 0 && line.creditIdr > 0) {
      throw badRequest("journal_line_invalid", "Satu baris jurnal hanya boleh memiliki debit atau kredit.");
    }
  }
}

/** Resolve debit/credit accounts for a transaction type per PRD §12.2. */
function resolveJournalAccounts(
  type: TransactionType,
  cashAccount: AccountRow,
  counterAccount: AccountRow,
): { debitAccount: AccountRow; creditAccount: AccountRow } {
  switch (type) {
    case "cash_in":
    case "owner_deposit":
      return { debitAccount: cashAccount, creditAccount: counterAccount };
    case "cash_out":
    case "transfer":
    case "owner_withdrawal":
    case "purchase":
      return { debitAccount: counterAccount, creditAccount: cashAccount };
  }
}

export async function postTransaction(
  db: D1Database,
  organizationId: string,
  userId: string,
  input: PostTransactionInput,
  requestId?: string,
): Promise<PostTransactionResult> {
  const normalizedKey = normalizeIdempotencyKey(input.idempotencyKey);
  const type = normalizeTransactionType(input.transactionType);
  const transactionDate = normalizeDate(input.transactionDate, "transaction_date_invalid");
  const description = normalizeRequiredText(input.description, 200, "transaction_description_required");
  const items = normalizeOptionalItems(input.items);

  // Pembelian barang: jurnal Persediaan DR / Kas CR + pergerakan stok (+ WAC).
  if (type === "purchase") {
    return postPurchase(db, organizationId, userId, {
      transactionDate, description, idempotencyKey: normalizedKey,
      cashAccountId: input.cashAccountId, items,
    }, requestId);
  }

  // Penjualan barang: cash_in dengan items → Kas DR / Pendapatan CR + HPP DR / Persediaan CR.
  if (items && items.length > 0) {
    if (type !== "cash_in") {
      throw badRequest("items_not_allowed", "Item produk hanya untuk pembelian atau penjualan barang.");
    }
    return postGoodsSale(db, organizationId, userId, {
      transactionDate, description, idempotencyKey: normalizedKey,
      cashAccountId: input.cashAccountId, counterAccountId: input.counterAccountId,
      amountIdr: input.amountIdr, items,
    }, requestId);
  }

  // Transaksi biasa (tanpa persediaan) - perilaku MVP asli.
  if (input.amountIdr === undefined) {
    throw badRequest("amount_required", "Nominal wajib diisi.");
  }
  const amountIdr = toIdr(input.amountIdr);
  const counterAccountId = input.counterAccountId;
  if (!counterAccountId) {
    throw badRequest("counter_account_required", "Akun lawan harus diisi.");
  }
  const payloadHash = await idempotencyPayloadHash({
    transactionType: type,
    transactionDate,
    cashAccountId: input.cashAccountId,
    counterAccountId,
    amountIdr,
    description,
  });
  const replay = await replayIfKeyAlreadyUsed(db, organizationId, normalizedKey, payloadHash);
  if (replay) return replay;

  await assertDateNotFuture(transactionDate);
  const current = Date.now();

  const cashAccount = await getAccount(db, organizationId, input.cashAccountId);
  const counterAccount = await getAccount(db, organizationId, counterAccountId);
  await validateTransaction(type, cashAccount, counterAccount);

  const { debitAccount, creditAccount } = resolveJournalAccounts(type, cashAccount!, counterAccount!);

  const lines: JournalLineInput[] = [
    { accountId: debitAccount.id, debitIdr: amountIdr, creditIdr: 0 },
    { accountId: creditAccount.id, debitIdr: 0, creditIdr: amountIdr },
  ];
  assertJournalBalanced(lines);

  const transactionId = crypto.randomUUID();
  const journalEntryId = crypto.randomUUID();
  const transactionNumber = await generateTransactionNumber(db, organizationId, transactionDate);

  const statements: D1PreparedStatement[] = [
    statement(
      db,
      `INSERT INTO transactions (
         id, organization_id, transaction_number, transaction_type, transaction_date,
         description, status, amount_idr, cash_account_id, counter_account_id,
         idempotency_key, created_by, created_at, updated_at, idempotency_payload_hash
       ) VALUES (?, ?, ?, ?, ?, ?, 'posted', ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        transactionId, organizationId, transactionNumber, type, transactionDate,
        description, amountIdr, cashAccount!.id, counterAccount!.id,
        normalizedKey, userId, current, current, payloadHash,
      ],
    ),
    statement(
      db,
      `INSERT INTO journal_entries (
         id, organization_id, transaction_id, entry_date, description, created_at
       ) VALUES (?, ?, ?, ?, ?, ?)`,
      [journalEntryId, organizationId, transactionId, transactionDate, description, current],
    ),
    ...lines.map((line) => statement(
      db,
      `INSERT INTO journal_lines (
         id, organization_id, journal_entry_id, account_id, debit_idr, credit_idr, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [crypto.randomUUID(), organizationId, journalEntryId, line.accountId, line.debitIdr, line.creditIdr, current],
    )),
    writeAuditStatement(db, {
      organizationId,
      actorUserId: userId,
      entityType: "transaction",
      entityId: transactionId,
      action: "transaction_created",
      after: { transaction_type: type, amount_idr: amountIdr, transaction_number: transactionNumber },
      requestId,
      current,
    }),
  ];

  try {
    await executeBatch(db, statements);
  } catch (err) {
    // Two parallel requests can both miss the idempotency lookup above and
    // race into the batch; the loser hits the UNIQUE(org, idempotency_key)
    // index. D1 batches are atomic, so nothing was partially written - treat
    // the constraint as a replay of the winner instead of a 500.
    if (err instanceof Error && /unique|constraint/i.test(err.message)) {
      const raced = await replayIfKeyAlreadyUsed(db, organizationId, normalizedKey, payloadHash);
      if (raced) return raced;
    }
    throw err;
  }

  return { transaction_id: transactionId, transaction_number: transactionNumber, journal_entry_id: journalEntryId, status: "posted" };
}

// ── Persediaan: pembelian & penjualan barang ───────────────────

interface NormalizedPurchaseItem {
  productId: string;
  quantityMilli: number;
  unitCostIdr: number;
  unitCostMinor: number;
  costTotalIdr: number;
}

interface NormalizedSaleItem {
  productId: string;
  quantityMilli: number;
  unitPriceIdr: number;
  revenueIdr: number;
  cogsIdr: number;
  wacMinor: number;
}

function normalizeOptionalItems(items: TransactionItemInput[] | undefined): TransactionItemInput[] | undefined {
  if (!items || items.length === 0) return undefined;
  return items;
}

function assertUniqueItems(items: TransactionItemInput[]): void {
  const seen = new Set<string>();
  for (const item of items) {
    if (!item.productId) throw badRequest("product_required", "Pilih produk.");
    if (seen.has(item.productId)) {
      throw badRequest("duplicate_product", "Produk yang sama tidak boleh diisi dua kali.");
    }
    seen.add(item.productId);
  }
}

async function normalizePurchaseItems(
  db: D1Database,
  organizationId: string,
  items: TransactionItemInput[] | undefined,
): Promise<NormalizedPurchaseItem[]> {
  if (!items || items.length === 0) {
    throw badRequest("items_required", "Minimal satu produk harus diisi.");
  }
  assertUniqueItems(items);
  const result: NormalizedPurchaseItem[] = [];
  for (const item of items) {
    const unitCostIdr = item.unitCostIdr;
    if (unitCostIdr === undefined || !Number.isInteger(unitCostIdr) || unitCostIdr < 0 || unitCostIdr > 999_999_999_999) {
      throw badRequest("invalid_unit_cost", "Harga beli harus bilangan bulat rupiah tidak negatif.");
    }
    const quantityMilli = quantityToMilli(item.quantity);
    const product = await getProduct(db, organizationId, item.productId);
    if (product?.is_active !== 1) {
      throw badRequest("product_inactive", "Produk tidak aktif. Pilih produk lain.");
    }
    result.push({
      productId: item.productId,
      quantityMilli,
      unitCostIdr,
      unitCostMinor: idrToMinor(unitCostIdr),
      costTotalIdr: costTotalFromMilli(quantityMilli, unitCostIdr),
    });
  }
  return result;
}

async function normalizeSaleItems(
  db: D1Database,
  organizationId: string,
  items: TransactionItemInput[] | undefined,
): Promise<NormalizedSaleItem[]> {
  if (!items || items.length === 0) {
    throw badRequest("items_required", "Minimal satu produk harus diisi.");
  }
  assertUniqueItems(items);
  const result: NormalizedSaleItem[] = [];
  for (const item of items) {
    const unitPriceIdr = item.unitPriceIdr;
    if (unitPriceIdr === undefined || !Number.isInteger(unitPriceIdr) || unitPriceIdr < 0 || unitPriceIdr > 999_999_999_999) {
      throw badRequest("invalid_unit_price", "Harga jual harus bilangan bulat rupiah tidak negatif.");
    }
    const quantityMilli = quantityToMilli(item.quantity);
    const product = await getProduct(db, organizationId, item.productId);
    if (product?.is_active !== 1) {
      throw badRequest("product_inactive", "Produk tidak aktif. Pilih produk lain.");
    }
    if (product.current_stock_milli < quantityMilli) {
      throw badRequest("insufficient_stock", `Stok ${product.name} tidak mencukupi.`);
    }
    result.push({
      productId: item.productId,
      quantityMilli,
      unitPriceIdr,
      revenueIdr: costTotalFromMilli(quantityMilli, unitPriceIdr),
      cogsIdr: cogsFromMilliWac(quantityMilli, product.average_cost_minor),
      wacMinor: product.average_cost_minor,
    });
  }
  return result;
}

type StockWac = { stockMilli: number; wacMinor: number };

/**
 * Commit atomik transaksi inventory (beli/jual barang): jurnal, movements,
 * dan cache stok/WAC produk ditulis dalam SATU batch. Menangani
 * idempotency-race dan guard-miss (retry baca-ulang bounded).
 *
 * Mengembalikan hasil replay saat request ini duplikat, atau null bila
 * commit berjalan dan pemanggil harus mengembalikan respons posted.
 */
interface PlannedCacheUpdate {
  guarded: D1PreparedStatement[];
}

/** Baca cache kini + hitung nilai berikut + susun guarded UPDATE per item. */
async function readPlannedUpdates<T extends { productId: string; quantityMilli: number }>(
  db: D1Database,
  organizationId: string,
  items: T[],
  applyStock: (item: T) => (current: StockWac) => StockWac,
): Promise<PlannedCacheUpdate> {
  const guarded: D1PreparedStatement[] = [];
  for (const item of items) {
    const product = await getProduct(db, organizationId, item.productId);
    if (product?.is_active !== 1) {
      throw badRequest("product_inactive", "Produk tidak aktif. Pilih produk lain.");
    }
    const next = applyStock(item)({
      stockMilli: product.current_stock_milli,
      wacMinor: product.average_cost_minor,
    });
    if (next.stockMilli < 0) {
      throw badRequest("insufficient_stock", "Stok produk tidak mencukupi.");
    }
    guarded.push(
      statement(
        db,
        `UPDATE products
         SET current_stock_milli = ?, average_cost_minor = ?, updated_at = ?
         WHERE id = ? AND organization_id = ?
           AND current_stock_milli = ? AND average_cost_minor = ?`,
        [
          next.stockMilli, next.wacMinor, Date.now(),
          item.productId, organizationId,
          product.current_stock_milli, product.average_cost_minor,
        ],
      ),
    );
  }
  return { guarded };
}

/** True bila semua guarded UPDATE (offset ke-n) mengubah tepat 1 baris. */
function allCacheCommitted(results: D1Result[], offset: number): boolean {
  return results.slice(offset).every((r) => (r.meta.changes ?? 0) > 0);
}

async function commitInventoryTransaction<T extends { productId: string; quantityMilli: number }>(
  db: D1Database,
  organizationId: string,
  idempotencyKey: string,
  payloadHash: string,
  statements: D1PreparedStatement[],
  items: T[],
  applyStock: (item: T) => (current: StockWac) => StockWac,
): Promise<PostTransactionResult | null> {
  // Cache produk ditulis dalam SATU batch atomik bersama jurnal & movements.
  // Tanpa ini, crash di antara commit jurnal dan update cache menyisakan
  // movement tanpa cache — dan guarded UPDATE berikutnya meloloskan nilai
  // stale menjadi permanen. Guard dibaca ulang tiap percobaan agar retry
  // selalu memakai nilai kini.
  //
  // Jika batch lolos tapi sebagian guard meleset, jurnal & movements SUDAH
  // ter-commit (update 0-baris bukan error) — maka JANGAN ulangi batch
  // (UUID ganda), melainkan kejar cache saja via guarded catch-up.
  const MAX_COMMIT_ATTEMPTS = 6;
  // Percobaan pertama: batch penuh (jurnal + movements + cache).
  let pending = await readPlannedUpdates(db, organizationId, items, applyStock);
  try {
    const results = await executeBatch(db, [...statements, ...pending.guarded]);
    if (allCacheCommitted(results, statements.length)) return null;
  } catch (err) {
    if (err instanceof Error && /unique|constraint/i.test(err.message)) {
      const raced = await replayIfKeyAlreadyUsed(db, organizationId, idempotencyKey, payloadHash);
      if (raced) return raced;
    }
    throw err;
  }

  // Batch lolos tetapi cache belum lengkap: kejar hanya cache (guarded).
  // Setiap tulis cache ber-guard sehingga concurrent writer ter-serialisasi
  // via guard-miss, bukan via timpa-menimpa buta.
  for (let attempt = 1; attempt < MAX_COMMIT_ATTEMPTS; attempt += 1) {
    pending = await readPlannedUpdates(db, organizationId, items, applyStock);
    const results = await executeBatch(db, pending.guarded);
    if (allCacheCommitted(results, 0)) return null;
  }

  // Guard terus meleset: pulihkan dari riwayat agar tak ada stale parsial,
  // lalu minta klien mencoba lagi (semantik retry lama).
  for (const item of items) {
    await recalculateProductCosts(db, organizationId, item.productId);
  }
  throw conflict("stock_update_conflict", "Stok produk berubah saat diproses. Coba lagi.");
}

async function postPurchase(
  db: D1Database,
  organizationId: string,
  userId: string,
  input: {
    transactionDate: string;
    description: string;
    idempotencyKey: string;
    cashAccountId: string;
    items: TransactionItemInput[] | undefined;
  },
  requestId?: string,
): Promise<PostTransactionResult> {
  const items = await normalizePurchaseItems(db, organizationId, input.items);
  const totalCost = items.reduce((s, i) => s + i.costTotalIdr, 0);
  const payloadHash = await idempotencyPayloadHash({
    transactionType: "purchase",
    transactionDate: input.transactionDate,
    cashAccountId: input.cashAccountId,
    amountIdr: totalCost,
    description: input.description,
    items: items.map((i) => ({ productId: i.productId, quantityMilli: i.quantityMilli, unitCostIdr: i.unitCostIdr })),
  });
  const replay = await replayIfKeyAlreadyUsed(db, organizationId, input.idempotencyKey, payloadHash);
  if (replay) return replay;

  await assertDateNotFuture(input.transactionDate);
  const current = Date.now();

  const cashAccount = await getAccount(db, organizationId, input.cashAccountId);
  if (!isCashBankAccount(cashAccount)) {
    throw badRequest("account_inactive", "Akun ini tidak aktif. Pilih akun lain.");
  }
  const inventoryAccount = await resolveInventoryAccount(db, organizationId);
  if (!inventoryAccount) {
    throw badRequest("inventory_account_missing", "Akun Persediaan belum tersedia. Hubungi dukungan.");
  }

  const transactionId = crypto.randomUUID();
  const journalEntryId = crypto.randomUUID();
  const transactionNumber = await generateTransactionNumber(db, organizationId, input.transactionDate);

  const statements: D1PreparedStatement[] = [
    statement(
      db,
      `INSERT INTO transactions (
         id, organization_id, transaction_number, transaction_type, transaction_date,
         description, status, amount_idr, cash_account_id, counter_account_id,
         idempotency_key, created_by, created_at, updated_at, idempotency_payload_hash
       ) VALUES (?, ?, ?, ?, ?, ?, 'posted', ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        transactionId, organizationId, transactionNumber, "purchase", input.transactionDate,
        input.description, totalCost, cashAccount!.id, inventoryAccount.id,
        input.idempotencyKey, userId, current, current, payloadHash,
      ],
    ),
    statement(
      db,
      `INSERT INTO journal_entries (
         id, organization_id, transaction_id, entry_date, description, created_at
       ) VALUES (?, ?, ?, ?, ?, ?)`,
      [journalEntryId, organizationId, transactionId, input.transactionDate, input.description, current],
    ),
    statement(
      db,
      `INSERT INTO journal_lines (
         id, organization_id, journal_entry_id, account_id, debit_idr, credit_idr, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [crypto.randomUUID(), organizationId, journalEntryId, inventoryAccount.id, totalCost, 0, current],
    ),
    statement(
      db,
      `INSERT INTO journal_lines (
         id, organization_id, journal_entry_id, account_id, debit_idr, credit_idr, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [crypto.randomUUID(), organizationId, journalEntryId, cashAccount!.id, 0, totalCost, current],
    ),
    ...items.map((item) => statement(
      db,
      `INSERT INTO stock_movements (
         id, organization_id, transaction_id, product_id, quantity_milli,
         unit_cost_minor, cost_total_idr, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [crypto.randomUUID(), organizationId, transactionId, item.productId, item.quantityMilli, item.unitCostMinor, item.costTotalIdr, current],
    )),
    writeAuditStatement(db, {
      organizationId,
      actorUserId: userId,
      entityType: "transaction",
      entityId: transactionId,
      action: "transaction_created",
      after: { transaction_type: "purchase", amount_idr: totalCost, transaction_number: transactionNumber, items: items.length },
      requestId,
      current,
    }),
  ];

  const committedPurchase = await commitInventoryTransaction(
    db,
    organizationId,
    input.idempotencyKey,
    payloadHash,
    statements,
    items,
    (item) => ({ stockMilli, wacMinor }) => ({
      stockMilli: stockMilli + item.quantityMilli,
      wacMinor: computeNewWac(stockMilli, wacMinor, item.quantityMilli, item.unitCostMinor),
    }),
  );
  if (committedPurchase) return committedPurchase;

  return { transaction_id: transactionId, transaction_number: transactionNumber, journal_entry_id: journalEntryId, status: "posted" };
}

/** Validasi + resolve 4 akun yang dipakai penjualan barang (kas, pendapatan, HPP, persediaan). */
async function resolveSaleAccounts(
  db: D1Database,
  organizationId: string,
  cashAccountId: string,
  counterAccountId: string,
): Promise<{ cashAccount: AccountRow; incomeAccount: AccountRow; hppAccount: AccountRow; inventoryAccount: AccountRow }> {
  const cashAccount = await getAccount(db, organizationId, cashAccountId);
  if (!isCashBankAccount(cashAccount)) {
    throw badRequest("account_inactive", "Akun ini tidak aktif. Pilih akun lain.");
  }
  const incomeAccount = await getAccount(db, organizationId, counterAccountId);
  if (incomeAccount?.account_class !== "income" || incomeAccount?.is_active !== 1) {
    throw badRequest("counter_account_invalid", "Akun lawan harus akun pendapatan.");
  }
  const hppAccount = await resolveCogsAccount(db, organizationId);
  if (!hppAccount) {
    throw badRequest("cogs_account_missing", "Akun HPP belum tersedia. Hubungi dukungan.");
  }
  const inventoryAccount = await resolveInventoryAccount(db, organizationId);
  if (!inventoryAccount) {
    throw badRequest("inventory_account_missing", "Akun Persediaan belum tersedia. Hubungi dukungan.");
  }
  return { cashAccount: cashAccount!, incomeAccount, hppAccount, inventoryAccount };
}

async function postGoodsSale(
  db: D1Database,
  organizationId: string,
  userId: string,
  input: {
    transactionDate: string;
    description: string;
    idempotencyKey: string;
    cashAccountId: string;
    counterAccountId: string | undefined;
    amountIdr: number | undefined;
    items: TransactionItemInput[] | undefined;
  },
  requestId?: string,
): Promise<PostTransactionResult> {
  const items = await normalizeSaleItems(db, organizationId, input.items);
  // Total pendapatan selalu dihitung dari item (qty × harga jual), bukan
  // dari amountIdr yang dikirim klien — menghindari selisih pembulatan.
  const revenue = items.reduce((s, i) => s + i.revenueIdr, 0);
  const cogsTotal = items.reduce((s, i) => s + i.cogsIdr, 0);
  if (revenue <= 0) throw badRequest("invalid_amount", "Total penjualan harus lebih dari 0.");
  const counterAccountId = input.counterAccountId;
  if (!counterAccountId) {
    throw badRequest("counter_account_required", "Kategori pendapatan harus diisi.");
  }

  const payloadHash = await idempotencyPayloadHash({
    transactionType: "cash_in",
    transactionDate: input.transactionDate,
    cashAccountId: input.cashAccountId,
    counterAccountId,
    amountIdr: revenue,
    description: input.description,
    items: items.map((i) => ({ productId: i.productId, quantityMilli: i.quantityMilli, unitPriceIdr: i.unitPriceIdr })),
  });
  const replay = await replayIfKeyAlreadyUsed(db, organizationId, input.idempotencyKey, payloadHash);
  if (replay) return replay;

  await assertDateNotFuture(input.transactionDate);
  const current = Date.now();

  const { cashAccount, incomeAccount, hppAccount, inventoryAccount } = await resolveSaleAccounts(
    db,
    organizationId,
    input.cashAccountId,
    counterAccountId,
  );
  const transactionId = crypto.randomUUID();
  const journalEntryId = crypto.randomUUID();
  const transactionNumber = await generateTransactionNumber(db, organizationId, input.transactionDate);

  const statements: D1PreparedStatement[] = [
    statement(
      db,
      `INSERT INTO transactions (
         id, organization_id, transaction_number, transaction_type, transaction_date,
         description, status, amount_idr, cash_account_id, counter_account_id,
         idempotency_key, created_by, created_at, updated_at, idempotency_payload_hash
       ) VALUES (?, ?, ?, ?, ?, ?, 'posted', ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        transactionId, organizationId, transactionNumber, "cash_in", input.transactionDate,
        input.description, revenue, cashAccount!.id, incomeAccount.id,
        input.idempotencyKey, userId, current, current, payloadHash,
      ],
    ),
    statement(
      db,
      `INSERT INTO journal_entries (
         id, organization_id, transaction_id, entry_date, description, created_at
       ) VALUES (?, ?, ?, ?, ?, ?)`,
      [journalEntryId, organizationId, transactionId, input.transactionDate, input.description, current],
    ),
    // Kas DR (pendapatan) / Pendapatan CR
    statement(
      db,
      `INSERT INTO journal_lines (
         id, organization_id, journal_entry_id, account_id, debit_idr, credit_idr, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [crypto.randomUUID(), organizationId, journalEntryId, cashAccount!.id, revenue, 0, current],
    ),
    statement(
      db,
      `INSERT INTO journal_lines (
         id, organization_id, journal_entry_id, account_id, debit_idr, credit_idr, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [crypto.randomUUID(), organizationId, journalEntryId, incomeAccount.id, 0, revenue, current],
    ),
    // HPP DR / Persediaan CR
    statement(
      db,
      `INSERT INTO journal_lines (
         id, organization_id, journal_entry_id, account_id, debit_idr, credit_idr, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [crypto.randomUUID(), organizationId, journalEntryId, hppAccount.id, cogsTotal, 0, current],
    ),
    statement(
      db,
      `INSERT INTO journal_lines (
         id, organization_id, journal_entry_id, account_id, debit_idr, credit_idr, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [crypto.randomUUID(), organizationId, journalEntryId, inventoryAccount.id, 0, cogsTotal, current],
    ),
    ...items.map((item) => statement(
      db,
      `INSERT INTO stock_movements (
         id, organization_id, transaction_id, product_id, quantity_milli,
         unit_cost_minor, cost_total_idr, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [crypto.randomUUID(), organizationId, transactionId, item.productId, -item.quantityMilli, item.wacMinor, item.cogsIdr, current],
    )),
    writeAuditStatement(db, {
      organizationId,
      actorUserId: userId,
      entityType: "transaction",
      entityId: transactionId,
      action: "transaction_created",
      after: { transaction_type: "cash_in", amount_idr: revenue, transaction_number: transactionNumber, items: items.length, cogs_idr: cogsTotal },
      requestId,
      current,
    }),
  ];

  const committedSale = await commitInventoryTransaction(
    db,
    organizationId,
    input.idempotencyKey,
    payloadHash,
    statements,
    items,
    (item) => ({ stockMilli, wacMinor }) => ({
      stockMilli: stockMilli - item.quantityMilli,
      wacMinor,
    }),
  );
  if (committedSale) return committedSale;

  return { transaction_id: transactionId, transaction_number: transactionNumber, journal_entry_id: journalEntryId, status: "posted" };
}

interface ExistingTransactionRow {
  id: string;
  transaction_number: string;
  idempotency_payload_hash: string | null;
}

/**
 * If the idempotency key already maps to a transaction, return the replay
 * result for it. A reused key with a different payload is a client bug, not a
 * replay - fail loudly instead of returning the wrong transaction. Rows
 * written before the payload-hash column existed carry NULL and stay
 * replayable. Returns null when the key is free.
 */
async function replayIfKeyAlreadyUsed(
  db: D1Database,
  organizationId: string,
  idempotencyKey: string,
  payloadHash: string,
): Promise<PostTransactionResult | null> {
  const existing = await getTransactionByIdempotencyKey(db, organizationId, idempotencyKey);
  if (!existing) return null;
  if (
    existing.idempotency_payload_hash !== null &&
    existing.idempotency_payload_hash !== payloadHash
  ) {
    throw conflict(
      "idempotency_key_reused",
      "Idempotency key sudah dipakai untuk transaksi lain. Muat ulang halaman dan coba lagi.",
    );
  }
  return buildReplayResult(db, organizationId, existing);
}

async function buildReplayResult(
  db: D1Database,
  organizationId: string,
  existing: ExistingTransactionRow,
): Promise<PostTransactionResult> {
  const entry = await queryFirst<{ id: string }>(
    db,
    "SELECT id FROM journal_entries WHERE transaction_id = ? AND organization_id = ?",
    [existing.id, organizationId],
  );
  return {
    transaction_id: existing.id,
    transaction_number: existing.transaction_number,
    journal_entry_id: entry?.id ?? "",
    status: "posted",
    replayed: true,
  };
}

/** Shared WHERE-clause builder for transaction queries (list + count). */
function buildTransactionFilter(
  organizationId: string,
  filters: Omit<TransactionFilters, "limit" | "offset">,
  prefix: string,
): { conditions: string[]; values: D1Input[] } {
  const conditions = [`${prefix}organization_id = ?`];
  const values: D1Input[] = [organizationId];

  if (filters.fromDate) {
    conditions.push(`${prefix}transaction_date >= ?`);
    values.push(filters.fromDate);
  }
  if (filters.toDate) {
    conditions.push(`${prefix}transaction_date <= ?`);
    values.push(filters.toDate);
  }
  if (filters.transactionType) {
    conditions.push(`${prefix}transaction_type = ?`);
    values.push(filters.transactionType);
  }
  if (filters.status) {
    conditions.push(`${prefix}status = ?`);
    values.push(filters.status);
  }
  if (filters.search) {
    const search = `%${escapeLikePattern(filters.search.trim().toLowerCase())}%`;
    conditions.push(`(lower(${prefix}description) LIKE ? ESCAPE '${LIKE_ESCAPE_CHAR}' OR lower(${prefix}transaction_number) LIKE ? ESCAPE '${LIKE_ESCAPE_CHAR}')`);
    values.push(search, search);
  }

  return { conditions, values };
}

export async function listTransactions(
  db: D1Database,
  organizationId: string,
  filters: TransactionFilters = {},
): Promise<PublicTransaction[]> {
  const { conditions, values } = buildTransactionFilter(organizationId, filters, "t.");

  const limit = Math.min(Math.max(filters.limit ?? 50, 1), 100);
  const offset = Math.max(filters.offset ?? 0, 0);
  values.push(limit, offset);

  const rows = await queryAll<TransactionRow>(
    db,
    `${transactionSelectSql()}
     WHERE ${conditions.join(" AND ")}
     ORDER BY t.transaction_date DESC, t.created_at DESC
     LIMIT ? OFFSET ?`,
    values,
  );

  return rows.map((row) => toPublicTransaction(row, null));
}

export async function countTransactions(
  db: D1Database,
  organizationId: string,
  filters: Omit<TransactionFilters, "limit" | "offset"> = {},
): Promise<number> {
  const { conditions, values } = buildTransactionFilter(organizationId, filters, "");

  const row = await queryFirst<{ c: number }>(
    db,
    `SELECT COUNT(*) AS c FROM transactions WHERE ${conditions.join(" AND ")}`,
    values,
  );
  return row?.c ?? 0;
}

export async function getTransaction(
  db: D1Database,
  organizationId: string,
  transactionId: string,
): Promise<PublicTransaction> {
  const row = await queryFirst<TransactionRow>(
    db,
    `${transactionSelectSql()} WHERE t.id = ? AND t.organization_id = ?`,
    [transactionId, organizationId],
  );
  if (!row) throw notFound("transaction_not_found", "Transaksi tidak ditemukan.");
  const items = await transactionItems(db, organizationId, transactionId);
  return toPublicTransaction(row, items);
}

export async function voidTransaction(
  db: D1Database,
  organizationId: string,
  userId: string,
  transactionId: string,
  input: VoidTransactionInput,
  requestId?: string,
): Promise<PublicTransaction> {
  const current = Date.now();
  const reason = input.reason ? input.reason.trim().slice(0, 500) : null;

  const existing = await queryFirst<TransactionRow>(
    db,
    "SELECT id, status, transaction_number FROM transactions WHERE id = ? AND organization_id = ?",
    [transactionId, organizationId],
  );
  if (!existing) throw notFound("transaction_not_found", "Transaksi tidak ditemukan.");
  if (existing.status !== "posted") {
    throw conflict("transaction_not_posted", "Hanya transaksi berstatus posted yang dapat dibatalkan.");
  }

  // Transaksi persediaan: pulihkan stok & WAC produk dari riwayat.
  // Nilai dihitung dengan movement transaksi ini DIKECUALIKAN (setara baca
  // setelah status voided), lalu status + restore + audit ditulis dalam SATU
  // batch atomik agar crash tak menyisakan status voided dengan cache basi.
  const movements = await queryAll<{ product_id: string }>(
    db,
    "SELECT product_id FROM stock_movements WHERE organization_id = ? AND transaction_id = ?",
    [organizationId, transactionId],
  );
  const productIds = [...new Set(movements.map((m) => m.product_id))];
  const restoreStatements: D1PreparedStatement[] = [];
  for (const productId of productIds) {
    const history = await movementsForProduct(db, organizationId, productId);
    const { current_stock_milli, average_cost_minor } = summarizeMovements(
      history.filter((m) => m.transaction_id !== transactionId),
    );
    restoreStatements.push(
      statement(
        db,
        `UPDATE products SET current_stock_milli = ?, average_cost_minor = ?, updated_at = ?
         WHERE id = ? AND organization_id = ?`,
        [current_stock_milli, average_cost_minor, current, productId, organizationId],
      ),
    );
  }

  await executeBatch(db, [
    statement(
      db,
      `UPDATE transactions SET status = 'voided', voided_at = ?, void_reason = ?, updated_at = ?
       WHERE id = ? AND organization_id = ? AND status = 'posted'`,
      [current, reason, current, transactionId, organizationId],
    ),
    ...restoreStatements,
    writeAuditStatement(db, {
      organizationId,
      actorUserId: userId,
      entityType: "transaction",
      entityId: transactionId,
      action: "transaction_voided",
      after: { transaction_number: existing.transaction_number, void_reason: reason },
      reason: reason ?? undefined,
      requestId,
      current,
    }),
  ]);

  return getTransaction(db, organizationId, transactionId);
}

async function validateTransaction(
  type: TransactionType,
  cashAccount: AccountRow | null,
  counterAccount: AccountRow | null,
): Promise<void> {
  if (!isCashBankAccount(cashAccount)) {
    throw badRequest("account_inactive", "Akun ini tidak aktif. Pilih akun lain.");
  }
  if (counterAccount?.is_active !== 1) {
    throw badRequest("account_inactive", "Akun ini tidak aktif. Pilih akun lain.");
  }

  switch (type) {
    case "cash_in":
      if (counterAccount.account_class !== "income") {
        throw badRequest("counter_account_invalid", "Akun lawan harus akun pendapatan.");
      }
      break;
    case "cash_out":
      if (counterAccount.account_class !== "expense") {
        throw badRequest("counter_account_invalid", "Akun lawan harus akun beban.");
      }
      break;
    case "transfer":
      if (!isCashBankAccount(counterAccount)) {
        throw badRequest("counter_account_invalid", "Akun tujuan harus akun kas/bank.");
      }
      if (counterAccount.id === cashAccount!.id) {
        throw badRequest("same_transfer_account", "Akun sumber dan tujuan tidak boleh sama.");
      }
      break;
    case "owner_deposit":
    case "owner_withdrawal":
      if (counterAccount.account_class !== "equity") {
        throw badRequest("counter_account_invalid", "Akun lawan harus akun ekuitas.");
      }
      break;
  }
}

async function assertDateNotFuture(transactionDate: string): Promise<void> {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());
  if (transactionDate > today) {
    throw badRequest("future_date_not_allowed", "Tanggal transaksi tidak boleh lebih dari hari ini.");
  }
}

function normalizeIdempotencyKey(key: string): string {
  const normalized = key.trim();
  if (normalized.length < 8 || normalized.length > 160) {
    throw badRequest("idempotency_key_invalid", "Idempotency key tidak valid.");
  }
  return normalized;
}

function normalizeTransactionType(type: string): TransactionType {
  if (!TRANSACTION_TYPES.has(type as TransactionType)) {
    throw badRequest("transaction_type_invalid", "Jenis transaksi tidak valid.");
  }
  return type as TransactionType;
}

function toIdr(amount: number): number {
  // Rupiah is whole currency (no decimals) - reject fractions instead of
  // silently rounding them, which would record a different amount than the
  // client sent (e.g. 1.5 -> 2).
  if (!Number.isFinite(amount) || amount <= 0 || !Number.isInteger(amount)) {
    throw badRequest("invalid_amount", "Nominal harus berupa bilangan bulat rupiah lebih dari 0.");
  }
  if (amount > 999_999_999_999) {
    throw badRequest("invalid_amount", "Nominal terlalu besar.");
  }
  return amount;
}

function normalizeRequiredText(value: string, maxLength: number, code: string): string {
  const text = value.trim();
  if (!text) throw badRequest(code, "Keterangan harus diisi.");
  if (text.length > maxLength) throw badRequest(code, `Keterangan maksimal ${maxLength} karakter.`);
  return text;
}

/** TRX-YYYYMMDD-XXXX — unik per organisasi (bukan global), human-readable (PRD TRX-08). */
export async function generateTransactionNumber(
  db: D1Database,
  organizationId: string,
  date: string,
): Promise<string> {
  const base = `TRX-${date.replaceAll("-", "")}-`;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const suffix = randomSuffix(4);
    const number = `${base}${suffix}`;
    const existing = await queryFirst<{ id: string }>(
      db,
      "SELECT id FROM transactions WHERE organization_id = ? AND transaction_number = ?",
      [organizationId, number],
    );
    if (!existing) return number;
  }
  throw conflict("transaction_number_collision", "Gagal membuat nomor transaksi unik. Silakan coba lagi.");
}

const SUFFIX_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no ambiguous chars
function randomSuffix(length: number): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += SUFFIX_ALPHABET[bytes[i] % SUFFIX_ALPHABET.length];
  }
  return out;
}

/** Backslash (char 92) used as the LIKE ESCAPE character. */
const LIKE_ESCAPE_CHAR = String.fromCodePoint(92);

/** Escape LIKE wildcards so user search text matches literally. */
export function escapeLikePattern(value: string): string {
  return value
    .replaceAll(LIKE_ESCAPE_CHAR, String.raw`\\`)
    .replaceAll("%", String.raw`\%`)
    .replaceAll("_", String.raw`\_`);
}

/** SHA-256 hex over the canonical transaction payload for idempotency binding. */
export async function idempotencyPayloadHash(payload: {
  transactionType: string;
  transactionDate: string;
  cashAccountId: string;
  counterAccountId?: string;
  amountIdr: number;
  description: string;
  items?: { productId: string; quantityMilli: number; unitCostIdr?: number; unitPriceIdr?: number }[];
}): Promise<string> {
  const canonical = JSON.stringify({
    amountIdr: payload.amountIdr,
    cashAccountId: payload.cashAccountId,
    counterAccountId: payload.counterAccountId ?? null,
    description: payload.description,
    items: payload.items ?? null,
    transactionDate: payload.transactionDate,
    transactionType: payload.transactionType,
  });
  return sha256Hex(canonical);
}

async function getTransactionByIdempotencyKey(
  db: D1Database,
  organizationId: string,
  idempotencyKey: string,
): Promise<{ id: string; transaction_number: string; idempotency_payload_hash: string | null } | null> {
  return queryFirst<{ id: string; transaction_number: string; idempotency_payload_hash: string | null }>(
    db,
    "SELECT id, transaction_number, idempotency_payload_hash FROM transactions WHERE organization_id = ? AND idempotency_key = ?",
    [organizationId, idempotencyKey],
  );
}

function transactionSelectSql(): string {
  return `SELECT
    t.id, t.organization_id, t.transaction_number, t.transaction_type, t.transaction_date,
    t.description, t.status, t.amount_idr, t.cash_account_id, t.counter_account_id,
    t.created_by, t.created_at, t.voided_at, t.void_reason,
    cash.name AS cash_bank_account,
    counter.name AS counter_account
    FROM transactions t
    LEFT JOIN accounts cash ON cash.id = t.cash_account_id
    LEFT JOIN accounts counter ON counter.id = t.counter_account_id`;
}

function toPublicTransaction(
  row: TransactionRow,
  items: TransactionItemInfo[] | null,
): PublicTransaction {
  return {
    id: row.id,
    transaction_number: row.transaction_number,
    transaction_type: row.transaction_type,
    transaction_date: row.transaction_date,
    description: row.description,
    status: row.status,
    amount_idr: row.amount_idr,
    cash_account_id: row.cash_account_id,
    counter_account_id: row.counter_account_id,
    cash_bank_account: row.cash_bank_account,
    counter_account: row.counter_account,
    direction: transactionDirection(row.transaction_type),
    created_by: row.created_by,
    created_at: row.created_at,
    voided_at: row.voided_at,
    void_reason: row.void_reason,
    items,
  };
}

/** Item produk dari stock_movements transaksi; null bila bukan transaksi persediaan. */
async function transactionItems(
  db: D1Database,
  organizationId: string,
  transactionId: string,
): Promise<TransactionItemInfo[] | null> {
  const rows = await queryAll<{
    product_id: string;
    product_code: string;
    product_name: string;
    quantity_milli: number;
    unit_cost_minor: number;
    cost_total_idr: number;
  }>(
    db,
    `SELECT sm.product_id, p.code AS product_code, p.name AS product_name,
            sm.quantity_milli, sm.unit_cost_minor, sm.cost_total_idr
     FROM stock_movements sm
     JOIN products p ON p.id = sm.product_id
     WHERE sm.organization_id = ? AND sm.transaction_id = ?
     ORDER BY sm.created_at ASC, sm.rowid ASC`,
    [organizationId, transactionId],
  );
  if (rows.length === 0) return null;
  return rows.map((row) => ({
    product_id: row.product_id,
    product_code: row.product_code,
    product_name: row.product_name,
    quantity: milliToQuantity(row.quantity_milli),
    quantity_milli: row.quantity_milli,
    unit_cost_idr: minorToIdr(row.unit_cost_minor),
    cost_total_idr: row.cost_total_idr,
  }));
}