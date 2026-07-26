import { generateId } from "../auth/tokens";
import {
  execute,
  executeBatch,
  queryAll,
  queryFirst,
  statement,
  type D1Input,
} from "../db/client";
import { writeAuditStatement } from "../http/audit";
import { normalizeDate } from "../http/date";
import type { AccountType, NormalBalance } from "../db/schema";
import { badRequest, conflict, HttpError, notFound } from "../http/errors";
import { requireApprovalOrContinue, type ActionType } from "./approvals.service";

export type TransactionType =
  | "cash_sale"
  | "credit_sale"
  | "receive_receivable"
  | "cash_purchase"
  | "credit_purchase"
  | "pay_payable"
  | "expense_payment"
  | "owner_capital"
  | "owner_draw"
  | "cash_transfer"
  | "sale_return"
  | "purchase_return";

export type PaymentStatus = "paid" | "unpaid" | "partial";

export interface PostTransactionInput {
  transactionDate: string;
  transactionType: TransactionType;
  amount: number;
  partyId?: string | null;
  partyName?: string | null;
  categoryName?: string | null;
  cashAccountId?: string | null;
  destinationCashAccountId?: string | null;
  paymentStatus?: PaymentStatus;
  partialAmount?: number | null;
  dueDate?: string | null;
  description: string;
  notes?: string | null;
  productId?: string | null;
  quantity?: number | null;
  unitPrice?: number | null;
  debitAccountId?: string | null;
  /** Original transaction this replaces (after void). */
  originalTransactionId?: string | null;
  idempotencyKey: string;
}

export interface VoidTransactionInput {
  reason: string;
  voidDate?: string | null;
  idempotencyKey: string;
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

export interface PublicTransaction {
  id: string;
  transaction_number: string;
  transaction_date: string;
  transaction_type: string;
  amount: number;
  party_id: string | null;
  category_name: string | null;
  cash_account_id: string | null;
  destination_cash_account_id: string | null;
  payment_status: PaymentStatus;
  due_date: string | null;
  description: string;
  notes: string | null;
  status: string;
  posted_at: string | null;
  voided_at: string | null;
  void_reason: string | null;
  created_by: string;
  parties?: { name: string } | null;
  created_by_profile?: { full_name: string } | null;
}

export interface PublicJournalLine {
  id: string;
  account_id: string;
  debit: number;
  credit: number;
  description: string;
  accounts?: { code: number; name: string };
}

export interface PublicJournalEntry {
  id: string;
  entry_number: string;
  entry_date: string;
  entry_type: string;
  description: string;
  status: string;
  journal_lines: PublicJournalLine[];
}

export interface TransactionImpact {
  debit_account_id: string;
  debit_account: string;
  debit_change: "increase" | "decrease";
  credit_account_id: string;
  credit_account: string;
  credit_change: "increase" | "decrease";
  amount: number;
}

export interface PostTransactionResult {
  transaction_id: string;
  transaction_number: string;
  journal_entry_id: string;
  entry_number: string;
  impact: TransactionImpact;
  replayed?: boolean;
}

export interface VoidTransactionResult {
  original_transaction_id: string;
  reversal_transaction_id: string;
  reversal_journal_entry_ids: string[];
  status: "voided";
}

export interface SettleTransactionResult {
  settle_transaction_id: string;
  settle_transaction_number: string;
  journal_entry_id: string;
  status: "settled";
}

interface OrganizationRow {
  books_start_date: string;
}

interface AccountRow {
  id: string;
  code: string;
  name: string;
  account_type: AccountType;
  normal_balance: NormalBalance;
  is_active: 0 | 1;
  is_cash_account: 0 | 1;
}

interface ProductRow {
  id: string;
  code: string;
  name: string;
  purchase_price_minor: number;
  selling_price_minor: number;
  average_cost_minor: number;
  current_stock_milli: number;
  inventory_account_id: string | null;
  cogs_account_id: string | null;
  revenue_account_id: string | null;
  is_active: 0 | 1;
}

interface PartyRow {
  id: string;
  name: string;
}

interface TransactionRow {
  id: string;
  organization_id: string;
  transaction_number: string;
  transaction_date: string;
  transaction_type: string;
  amount_minor: number;
  party_id: string | null;
  party_name: string | null;
  category_name: string | null;
  cash_account_id: string | null;
  destination_cash_account_id: string | null;
  payment_status: PaymentStatus;
  due_date: string | null;
  description: string;
  notes: string | null;
  status: string;
  idempotency_key: string | null;
  posted_at: number | null;
  voided_at: number | null;
  void_reason: string | null;
  original_transaction_id: string | null;
  reversal_transaction_id: string | null;
  created_by: string;
  created_by_name: string | null;
  created_at: number;
}

interface JournalRow {
  journal_entry_id: string;
  entry_number: string;
  entry_date: string;
  entry_type: string;
  entry_description: string;
  entry_status: string;
  line_id: string | null;
  account_id: string | null;
  account_code: string | null;
  account_name: string | null;
  debit_minor: number | null;
  credit_minor: number | null;
  line_description: string | null;
}

interface JournalLineRow {
  id: string;
  account_id: string;
  debit_minor: number;
  credit_minor: number;
  description: string;
  line_order: number;
}

interface TransactionLineRow {
  product_id: string | null;
  quantity_milli: number | null;
  unit_price_minor: number | null;
}

interface StockMovementRow {
  unit_cost_minor: number | null;
}

interface JournalLineInput {
  accountId: string;
  partyId?: string | null;
  debitMinor: number;
  creditMinor: number;
  description: string;
}

const TRANSACTION_TYPES = new Set<TransactionType>([
  "cash_sale",
  "credit_sale",
  "receive_receivable",
  "cash_purchase",
  "credit_purchase",
  "pay_payable",
  "expense_payment",
  "owner_capital",
  "owner_draw",
  "cash_transfer",
  "sale_return",
  "purchase_return",
]);

/**
 * Format an integer (minor-unit) amount as an IDR string, e.g. 15000 -> "Rp 15.000".
 */
/** Indonesian label for each transaction type. */
const TRANSACTION_LABELS: Record<TransactionType, string> = {
  cash_sale: "Penjualan Tunai",
  credit_sale: "Penjualan Kredit",
  receive_receivable: "Penerimaan Piutang",
  cash_purchase: "Pembelian Tunai",
  credit_purchase: "Pembelian Kredit",
  pay_payable: "Pembayaran Utang",
  expense_payment: "Pembayaran Beban",
  owner_capital: "Setoran Modal",
  owner_draw: "Prive Pemilik",
  cash_transfer: "Transfer Kas",
  sale_return: "Retur Penjualan",
  purchase_return: "Retur Pembelian",
};

export function transactionTypeLabel(type: TransactionType): string {
  return TRANSACTION_LABELS[type] ?? type;
}

/** Indonesian explanation of what changes when posting a transaction. */
export function describeTransactionImpact(
  type: TransactionType,
  amountMinor: number,
  opts?: { productName?: string; quantity?: number; partyName?: string; isVoid?: boolean },
): string {
  const label = TRANSACTION_LABELS[type] ?? type;
  const amount = formatIDRMinor(amountMinor);

  if (opts?.isVoid) {
    return `Membatalkan ${label.toLowerCase()} sebesar ${amount}. Semua jurnal dan mutasi stok dikembalikan seperti sebelum transaksi.`;
  }

  const parts: string[] = [
    `Mencatat ${label.toLowerCase()} sebesar ${amount}.`,
  ];

  if (opts?.quantity && opts?.productName) {
    parts.push(`Stok ${opts.productName} berubah ${opts.quantity > 0 ? "bertambah" : "berkurang"} ${Math.abs(opts.quantity)} unit.`);
  }

  if (opts?.partyName) {
    parts.push(`Melibatkan ${opts.partyName}.`);
  }

  parts.push("Laporan Laba Rugi dan Neraca akan berubah setelah transaksi diposting.");

  return parts.join(" ");
}

function formatIDRMinor(amount: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(amount);
}

export async function listTransactions(
  db: D1Database,
  organizationId: string,
  filters: TransactionFilters = {},
): Promise<PublicTransaction[]> {
  const conditions = [
    "t.organization_id = ?",
    "t.original_transaction_id IS NULL",
  ];
  const values: D1Input[] = [organizationId];

  if (filters.fromDate) {
    conditions.push("t.transaction_date >= ?");
    values.push(filters.fromDate);
  }
  if (filters.toDate) {
    conditions.push("t.transaction_date <= ?");
    values.push(filters.toDate);
  }
  if (filters.transactionType) {
    conditions.push("t.transaction_type = ?");
    values.push(filters.transactionType);
  }
  if (filters.status) {
    conditions.push("t.status = ?");
    values.push(filters.status);
  }
  if (filters.search) {
    const search = `%${filters.search.toLowerCase()}%`;
    conditions.push("(lower(t.description) LIKE ? OR lower(t.transaction_number) LIKE ?)");
    values.push(search, search);
  }

  const limit = Math.min(Math.max(filters.limit ?? 20, 1), 100);
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

  return rows.map(toPublicTransaction);
}

export async function getTransaction(
  db: D1Database,
  organizationId: string,
  transactionId: string,
): Promise<PublicTransaction> {
  const row = await getTransactionRow(db, organizationId, transactionId);
  if (!row) throw notFound("transaction_not_found", "Transaction not found");
  return toPublicTransaction(row);
}

export async function listJournalEntriesForTransaction(
  db: D1Database,
  organizationId: string,
  transactionId: string,
): Promise<PublicJournalEntry[]> {
  await getTransaction(db, organizationId, transactionId);

  const rows = await queryAll<JournalRow>(
    db,
    `SELECT
       je.id AS journal_entry_id,
       je.entry_number,
       je.entry_date,
       je.entry_type,
       je.description AS entry_description,
       je.status AS entry_status,
       jl.id AS line_id,
       jl.account_id,
       a.code AS account_code,
       a.name AS account_name,
       jl.debit_minor,
       jl.credit_minor,
       jl.description AS line_description
     FROM journal_entries je
     LEFT JOIN journal_lines jl
       ON jl.journal_entry_id = je.id
      AND jl.organization_id = je.organization_id
     LEFT JOIN accounts a
       ON a.id = jl.account_id
      AND a.organization_id = je.organization_id
     WHERE je.organization_id = ?
       AND je.transaction_id = ?
     ORDER BY je.created_at ASC, jl.line_order ASC`,
    [organizationId, transactionId],
  );

  return nestJournalRows(rows);
}

function isStockTransactionType(type: string): boolean {
  return type === "cash_purchase" || type === "credit_purchase"
    || type === "cash_sale" || type === "credit_sale"
    || type === "sale_return" || type === "purchase_return";
}

// ponytail: Common journal entry insert to reduce duplication.
function insertJournalEntryStatement(
  db: D1Database,
  ctx: {
    journalEntryId: string; organizationId: string; entryNumber: string;
    entryDate: string; entryType: string; transactionId: string;
    description: string; current: number; userId: string;
    reversedEntryId?: string | null; reversalReason?: string | null;
  },
): D1PreparedStatement {
  const { journalEntryId, organizationId, entryNumber, entryDate, entryType, transactionId, description, current, userId, reversedEntryId, reversalReason } = ctx;
  const hasReversal = entryType === 'reversal';
  return statement(
    db,
    hasReversal
      ? `INSERT INTO journal_entries (id, organization_id, entry_number, entry_date, entry_type, transaction_id, description, status, reversed_entry_id, reversal_reason, posted_at, posted_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'posted', ?, ?, ?, ?, ?)`
      : `INSERT INTO journal_entries (id, organization_id, entry_number, entry_date, entry_type, transaction_id, description, status, posted_at, posted_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'posted', ?, ?, ?)`,
    hasReversal
      ? [journalEntryId, organizationId, entryNumber, entryDate, entryType, transactionId, description, reversedEntryId ?? null, reversalReason ?? null, current, userId, current]
      : [journalEntryId, organizationId, entryNumber, entryDate, entryType, transactionId, description, current, userId, current],
  );
}

// ponytail: Extracted stock reservation to reduce postTransaction complexity.
async function reserveStockForTransaction(
  transactionType: string,
  product: ProductRow,
  quantityMilli: number,
  unitPriceMinor: number,
): Promise<{ nextStock: number; unitCost: number; nextAverage: number }> {
  const isPurchase = transactionType === "cash_purchase" || transactionType === "credit_purchase";
  const isSaleReturn = transactionType === "sale_return";
  // sale_return adds stock back (+), purchase removes stock (-)
  // purchase_return removes stock (-), sale removes stock (-)
  // For purchase_return, stock decreases (goods go back to supplier)
  const quantityDelta = isPurchase || isSaleReturn ? quantityMilli : -quantityMilli;
  const nextStock = product.current_stock_milli + quantityDelta;
  if (nextStock < 0) throw conflict("insufficient_stock", "Insufficient stock");
  const unitCost = isPurchase ? unitPriceMinor : productCostMinor(product);
  if (!isPurchase && !isSaleReturn && unitCost <= 0) throw badRequest("product_zero_cost", "Product cost must be set before sale");
  const nextAverage = (isPurchase || isSaleReturn) ? nextAverageCostMinor(product, quantityMilli, unitPriceMinor) : product.average_cost_minor;
  return { nextStock, unitCost, nextAverage };
}

type StockStatementCtx = {
  db: D1Database;
  statements: D1PreparedStatement[];
  reservedStock: { nextStock: number; unitCost: number; nextAverage: number };
  product: { id: string; current_stock_milli: number; purchase_price_minor: number };
  organizationId: string;
  transactionId: string;
  transactionDate: string;
  transactionType: string;
  quantityMilli: number;
  description: string;
  userId: string;
  current: number;
};

// ponytail: Options object to satisfy S107 max-params.
function stockMovementType(type: string): "purchase" | "sale" | "void" {
  if (type === "sale_return") return "sale";
  if (type === "purchase_return") return "purchase";
  if (type === "cash_purchase" || type === "credit_purchase") return "purchase";
  return "sale";
}

function insertStockStatements(ctx: StockStatementCtx): void {
  const { db, statements, reservedStock, product, organizationId, transactionId, transactionDate, transactionType, quantityMilli, description, userId, current } = ctx;
  const isPurchase = transactionType === "cash_purchase" || transactionType === "credit_purchase";
  const isSaleReturn = transactionType === "sale_return";
  // sale_return adds stock back (+), purchase_return removes stock (-)
  // S3358 — extract nested ternary into if/else
  let quantityDelta: number;
  if (isPurchase) {
    quantityDelta = quantityMilli;
  } else if (isSaleReturn) {
    quantityDelta = quantityMilli;
  } else {
    quantityDelta = -quantityMilli;
  }
  statements.push(
    statement(
      db,
      `UPDATE products SET current_stock_milli = ?, average_cost_minor = ?, purchase_price_minor = ?, updated_at = ?
       WHERE id = ? AND organization_id = ? AND current_stock_milli = ?`,
      [reservedStock.nextStock, reservedStock.nextAverage, isPurchase ? reservedStock.unitCost : product.purchase_price_minor, current, product.id, organizationId, product.current_stock_milli],
    ),
    insertStockMovementStatement(db, {
      organizationId, productId: product.id, transactionId,
      movementDate: transactionDate, movementType: stockMovementType(transactionType),
      quantityMilli: quantityDelta, unitCostMinor: reservedStock.unitCost,
      stockAfterMilli: reservedStock.nextStock, notes: description, userId, current,
    }),
  );
}

type RetryCtx = {
  db: D1Database;
  organizationId: string;
  transactionId: string;
  idempotencyKey: string;
  transactionType: TransactionType;
  product: ProductRow | null;
  quantityMilli: number | null;
  unitPriceMinor: number | null;
  statements: D1PreparedStatement[];
  reservedStock: { nextStock: number; unitCost: number; nextAverage: number } | null;
  transactionDate: string;
  description: string;
  userId: string;
  current: number;
};

function rebuildStockStatements(
  ctx: RetryCtx,
  freshProduct: ProductRow,
  reservedStock: { nextStock: number; unitCost: number; nextAverage: number },
  stockUpdateIndex: number,
): void {
  const isPurchase = ctx.transactionType === "cash_purchase" || ctx.transactionType === "credit_purchase";
  const isSaleReturn = ctx.transactionType === "sale_return";
  const quantityDelta = isPurchase || isSaleReturn ? ctx.quantityMilli! : -ctx.quantityMilli!;
  ctx.statements[stockUpdateIndex] = statement(
    ctx.db,
    `UPDATE products SET current_stock_milli = ?, average_cost_minor = ?, purchase_price_minor = ?, updated_at = ?
     WHERE id = ? AND organization_id = ? AND current_stock_milli = ?`,
    [reservedStock.nextStock, reservedStock.nextAverage, isPurchase ? reservedStock.unitCost : ctx.product!.purchase_price_minor, ctx.current, ctx.product!.id, ctx.organizationId, freshProduct.current_stock_milli],
  );
  ctx.statements[stockUpdateIndex + 1] = insertStockMovementStatement(ctx.db, {
    organizationId: ctx.organizationId, productId: ctx.product!.id, transactionId: ctx.transactionId,
    movementDate: ctx.transactionDate, movementType: stockMovementType(ctx.transactionType),
    quantityMilli: quantityDelta, unitCostMinor: reservedStock.unitCost,
    stockAfterMilli: reservedStock.nextStock, notes: ctx.description, userId: ctx.userId, current: ctx.current,
  });
}

// ponytail: Extract retry logic to reduce postTransactionWithRetry complexity.
async function retryBatchOnStockConflict(
  ctx: RetryCtx,
  attempt: number,
  stockUpdateIndex: number,
): Promise<PostTransactionResult | "retry"> {
  const { db, organizationId, transactionId, transactionType, product, quantityMilli, unitPriceMinor, transactionDate } = ctx;

  await assertPeriodOpen(db, organizationId, transactionDate);
  const results = await executeBatch(db, ctx.statements);

  if (stockUpdateIndex >= 0 && results[stockUpdateIndex]) {
    const changes = results[stockUpdateIndex].meta.changes;
    if (changes === 0) {
      if (attempt >= 3) {
        throw conflict("stock_concurrent_modify", "Stock was modified by another request, please retry");
      }
      const freshProduct = await queryFirst<ProductRow>(
        db,
        `SELECT * FROM products WHERE id = ? AND organization_id = ?`,
        [product!.id, organizationId],
      );
      if (freshProduct && quantityMilli !== null && unitPriceMinor !== null) {
        ctx.reservedStock = await reserveStockForTransaction(transactionType, freshProduct, quantityMilli, unitPriceMinor);
        rebuildStockStatements(ctx, freshProduct, ctx.reservedStock, stockUpdateIndex);
      }
      return "retry";
    }
  }
  return buildPostResult(db, organizationId, transactionId);
}

// ponytail: Extract error handling to reduce postTransactionWithRetry complexity.
async function handleRetryError(
  e: unknown,
  db: D1Database,
  organizationId: string,
  idempotencyKey: string,
  attempt: number,
): Promise<PostTransactionResult | "retry" | "throw"> {
  if (e instanceof HttpError && e.code === "stock_concurrent_modify") return "throw";
  const retry = await getTransactionByIdempotencyKey(db, organizationId, idempotencyKey);
  if (retry) return buildPostResult(db, organizationId, retry.id);
  if (attempt >= 3) return "throw";
  return "retry";
}

async function postTransactionWithRetry(ctx: RetryCtx): Promise<PostTransactionResult> {
  const { db, organizationId, idempotencyKey } = ctx;
  const stockUpdateIndex = ctx.reservedStock ? ctx.statements.length - 3 : -1;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const result = await retryBatchOnStockConflict(ctx, attempt, stockUpdateIndex);
      if (result === "retry") {
        await new Promise((r) => setTimeout(r, [5, 15, 50][attempt - 1] ?? 50));
        continue;
      }
      return result;
    } catch (e) {
      const errorResult = await handleRetryError(e, db, organizationId, idempotencyKey, attempt);
      if (errorResult === "throw") throw e;
      if (errorResult === "retry") {
        await new Promise((r) => setTimeout(r, [5, 15, 50][attempt - 1] ?? 50));
        continue;
      }
      return errorResult;
    }
  }
  throw conflict("stock_concurrent_modify", "Stock was modified by another request, please retry");
}

interface PreparedTransactionData {
  idempotencyKey: string;
  transactionType: TransactionType;
  transactionDate: string;
  amountMinor: number;
  partialAmountMinor: number | null;
  paymentStatus: PaymentStatus;
  description: string;
  notes: string | null;
  current: number;
}

// ponytail: Extract normalization + validation to reduce postTransaction complexity.
async function prepareTransactionData(
  db: D1Database,
  organizationId: string,
  input: PostTransactionInput,
): Promise<{ data: PreparedTransactionData } | { existing: PostTransactionResult }> {
  const idempotencyKey = normalizeIdempotencyKey(input.idempotencyKey);
  const existing = await getTransactionByIdempotencyKey(db, organizationId, idempotencyKey);
  if (existing) return { existing: await buildPostResult(db, organizationId, existing.id, true) };

  const transactionType = normalizeTransactionType(input.transactionType);
  const transactionDate = normalizeDate(input.transactionDate, "transaction_date_invalid");
  const amountMinor = toMoneyMinor(input.amount);
  const partialAmountMinor = input.partialAmount === null || input.partialAmount === undefined
    ? null
    : toMoneyMinor(input.partialAmount);
  const paymentStatus = input.paymentStatus ?? "paid";
  const description = normalizeRequiredText(input.description, "transaction_description_required");
  const notes = nullableText(input.notes);
  const current = Date.now();

  await assertBooksOpen(db, organizationId, transactionDate);
  await assertPeriodOpen(db, organizationId, transactionDate);

  return {
    data: { idempotencyKey, transactionType, transactionDate, amountMinor, partialAmountMinor, paymentStatus, description, notes, current },
  };
}

interface ResolvedTransactionEntities {
  partyId: string | null;
  cashAccount: AccountRow | null;
  destinationCashAccount: AccountRow | null;
  product: ProductRow | null;
  quantityMilli: number | null;
  unitPriceMinor: number | null;
  reservedStock: { nextStock: number; unitCost: number; nextAverage: number } | null;
  resolved: PostingAccountsResult;
  journalLines: JournalLineInput[];
}

// ponytail: Extract entity resolution (party, accounts, products, stock) to reduce complexity.
async function resolveTransactionEntities(
  db: D1Database,
  organizationId: string,
  transactionType: TransactionType,
  amountMinor: number,
  paymentStatus: PaymentStatus,
  input: PostTransactionInput,
  current: number,
): Promise<ResolvedTransactionEntities> {
  const partyId = await resolveParty(db, organizationId, transactionType, {
    partyId: input.partyId,
    partyName: input.partyName,
    current,
  });

  const cashAccount = await resolveOptionalAccount(db, organizationId, input.cashAccountId);
  const destinationCashAccount = await resolveOptionalAccount(db, organizationId, input.destinationCashAccountId);

  const { product: initialProduct, quantityMilli, unitPriceMinor } = await resolveProductFields(db, organizationId, input);
  const product = initialProduct;
  if (product && quantityMilli !== null && unitPriceMinor !== null) {
    validateProductIntent(transactionType, product, quantityMilli, unitPriceMinor, amountMinor);
  }

  let reservedStock: { nextStock: number; unitCost: number; nextAverage: number } | null = null;
  if (product && quantityMilli !== null && unitPriceMinor !== null && isStockTransactionType(transactionType)) {
    reservedStock = await reserveStockForTransaction(transactionType, product, quantityMilli, unitPriceMinor);
  }

  const resolved = await resolvePostingAccounts(db, organizationId, transactionType, {
    cashAccount,
    destinationCashAccount,
    debitAccountId: input.debitAccountId,
    product,
    paymentStatus,
  });

  const journalLines = buildJournalLines(transactionType, {
    amountMinor,
    partialAmountMinor: input.partialAmount === null || input.partialAmount === undefined
      ? null
      : toMoneyMinor(input.partialAmount),
    paymentStatus,
    debitAccount: resolved.debitAccount,
    creditAccount: resolved.creditAccount,
    cashAccount,
    partyId,
    description: normalizeRequiredText(input.description, "transaction_description_required"),
    product,
    quantityMilli,
  });
  assertJournalBalanced(journalLines);

  return {
    partyId,
    cashAccount,
    destinationCashAccount,
    product,
    quantityMilli,
    unitPriceMinor,
    reservedStock,
    resolved,
    journalLines,
  };
}

interface PostTransactionBuildCtx {
  db: D1Database;
  organizationId: string;
  userId: string;
  data: PreparedTransactionData;
  entities: ResolvedTransactionEntities;
  input: PostTransactionInput;
  requestId?: string;
  transactionId: string;
  journalEntryId: string;
  transactionNumber: string;
  entryNumber: string;
}

// ponytail: Extract statements building for postTransaction to reduce complexity.
function buildPostTransactionStatements(
  ctx: PostTransactionBuildCtx,
): D1PreparedStatement[] {
  const { db, organizationId, userId, data, entities, input, requestId, transactionId, journalEntryId, transactionNumber, entryNumber } = ctx;
  const { idempotencyKey, transactionType, transactionDate, amountMinor, paymentStatus, description, notes, current } = data;
  const { partyId, cashAccount, destinationCashAccount, product, quantityMilli, unitPriceMinor, reservedStock, resolved, journalLines } = entities;
  const categoryName = resolved.categoryName ?? nullableText(input.categoryName);

  const statements: D1PreparedStatement[] = [
    statement(
      db,
      `INSERT INTO transactions (
         id, organization_id, transaction_number, transaction_date,
         transaction_type, amount_minor, party_id, category_name,
         cash_account_id, destination_cash_account_id, payment_status, due_date,
         description, notes, status, idempotency_key, posted_at, posted_by,
         original_transaction_id,
         created_by, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'posted', ?, ?, ?, ?, ?, ?, ?)`,
      [
        transactionId,
        organizationId,
        transactionNumber,
        transactionDate,
        transactionType,
        amountMinor,
        partyId,
        categoryName,
        cashAccount?.id ?? null,
        destinationCashAccount?.id ?? null,
        paymentStatus,
        input.dueDate ? normalizeDate(input.dueDate, "due_date_invalid") : null,
        description,
        notesWithPartial(notes, data.partialAmountMinor, paymentStatus),
        idempotencyKey,
        current,
        userId,
        userId,
        input.originalTransactionId ?? null,
        userId,
        current,
        current,
      ],
    ),
    insertJournalEntryStatement(db, {
      journalEntryId, organizationId, entryNumber, entryDate: transactionDate,
      entryType: 'normal', transactionId, description, current, userId,
    }),
    ...journalLines.map((line, index) => insertJournalLineStatement(
      db,
      organizationId,
      journalEntryId,
      line,
      index + 1,
      current,
    )),
    insertTransactionLineStatement(db, {
      organizationId,
      transactionId,
      productId: product?.id ?? null,
      accountId: product ? null : resolved.debitAccount.id,
      description,
      quantityMilli,
      unitPriceMinor,
      amountMinor,
      lineOrder: 1,
      current,
    }),
  ];

  if (reservedStock && product && quantityMilli !== null) {
    insertStockStatements({ db, statements, reservedStock, product, organizationId, transactionId, transactionDate, transactionType, quantityMilli, description, userId, current });
  }

  statements.push(
    writeAuditStatement(db, {
      organizationId,
      actorUserId: userId,
      entityType: "transaction",
      entityId: transactionId,
      action: "post",
      after: {
        transaction_type: transactionType,
        amount: amountMinor,
        journal_entry_id: journalEntryId,
        product_id: product?.id ?? null,
      },
      requestId,
      current,
    }),
  );

  return statements;
}

export interface PreviewTransactionResult {
  transactionType: TransactionType;
  typeLabel: string;
  impact?: string;
  amountMinor: number;
  paymentStatus: PaymentStatus;
  description: string;
  debitAccount: AccountRow;
  creditAccount: AccountRow;
  categoryName: string | null;
  journalLines: JournalLineInput[];
  balanced: boolean;
}

/**
 * Preview a transaction without posting.
 * Resolves accounts, products, stock and returns journal lines.
 */
export async function previewTransaction(
  db: D1Database,
  organizationId: string,
  input: PostTransactionInput,
): Promise<PreviewTransactionResult> {
  const dataResult = await prepareTransactionData(db, organizationId, input);
  if ("existing" in dataResult) {
    throw conflict("transaction_exists", "Transaction already posted with this idempotency key");
  }
  const { data } = dataResult;

  const current = Date.now();
  const entities = await resolveTransactionEntities(db, organizationId, data.transactionType, data.amountMinor, data.paymentStatus, input, current);

  return {
    transactionType: data.transactionType,
    typeLabel: transactionTypeLabel(data.transactionType),
    impact: describeTransactionImpact(data.transactionType, data.amountMinor, {
      productName: entities.product?.name,
      quantity: input.quantity ?? undefined,
      partyName: input.partyName ?? undefined,
    }),
    amountMinor: data.amountMinor,
    paymentStatus: data.paymentStatus,
    description: data.description,
    debitAccount: entities.resolved.debitAccount,
    creditAccount: entities.resolved.creditAccount,
    categoryName: entities.resolved.categoryName,
    journalLines: entities.journalLines,
    balanced: entities.journalLines.reduce((s, l) => s + l.debitMinor, 0) === entities.journalLines.reduce((s, l) => s + l.creditMinor, 0),
  };
}

/** Map transaction type to approval action type, or null if no approval needed. */
function getApprovalActionType(type: TransactionType): ActionType | null {
  if (type === "expense_payment" || type === "cash_purchase" || type === "credit_purchase" || type === "pay_payable") {
    return "transaction_create";
  }
  if (type === "cash_sale" || type === "credit_sale" || type === "receive_receivable" || type === "owner_capital" || type === "owner_draw" || type === "cash_transfer") {
    return "transaction_create";
  }
  if (type === "sale_return" || type === "purchase_return") {
    return "transaction_create";
  }
  return null;
}

export async function postTransaction(
  db: D1Database,
  organizationId: string,
  userId: string,
  input: PostTransactionInput,
  requestId?: string,
): Promise<PostTransactionResult> {
  const prepared = await prepareTransactionData(db, organizationId, input);
  if ("existing" in prepared) return prepared.existing;

  const { data } = prepared;

  // Check if approval is needed for high-value transactions
  const approvalActionType = getApprovalActionType(data.transactionType);
  if (approvalActionType) {
    const approval = await requireApprovalOrContinue(
      db, organizationId, userId, approvalActionType, "transaction", "pending", data.amountMinor,
      { entitySummary: `${transactionTypeLabel(data.transactionType)} - ${formatIDRMinor(data.amountMinor)}` },
    );
    if (approval) {
      throw badRequest("approval_required",
        `This transaction requires approval. Request ID: ${approval.id}. Please wait for an admin to approve it.`,
      );
    }
  }

  const { idempotencyKey, transactionType, transactionDate, description, current } = data;

  const entities = await resolveTransactionEntities(
    db, organizationId, transactionType,
    data.amountMinor, data.paymentStatus, input, current,
  );

  const transactionId = generateId();
  const journalEntryId = generateId();
  const transactionNumber = await generateTransactionNumber(db, organizationId, transactionDate);
  const entryNumber = await generateEntryNumber(db, organizationId);

  const statements = buildPostTransactionStatements({
    db, organizationId, userId, data, entities, input, requestId,
    transactionId, journalEntryId, transactionNumber, entryNumber,
  });

  return postTransactionWithRetry({
    db, organizationId, transactionId, idempotencyKey,
    transactionType, product: entities.product,
    quantityMilli: entities.quantityMilli,
    unitPriceMinor: entities.unitPriceMinor,
    statements, reservedStock: entities.reservedStock,
    transactionDate, description, userId, current,
  });
}

/**
 * Settle a partially-paid credit transaction by posting a second transaction
 * (receive_receivable or pay_payable) for the remaining amount, then void the
 * original transaction. The original must have payment_status = 'partial' and
 * be of type credit_sale or credit_purchase.
 */
async function validateSettlementTarget(
  db: D1Database,
  organizationId: string,
  transactionId: string,
  cashAccountId: string,
) {
  const original = await getTransactionRow(db, organizationId, transactionId);
  if (!original) throw notFound("transaction_not_found", "Transaction not found");
  if (original.status !== "posted") {
    throw conflict("transaction_not_posted", "Only posted transactions can be settled");
  }
  if (original.payment_status !== "partial") {
    throw conflict("transaction_not_partial", "Only partially paid credit transactions can be settled");
  }
  if (original.transaction_type !== "credit_sale" && original.transaction_type !== "credit_purchase") {
    throw conflict("transaction_not_credit", "Only credit transactions can be settled");
  }
  await assertBooksOpen(db, organizationId, original.transaction_date);
  await assertPeriodOpen(db, organizationId, original.transaction_date);
  const cashAccount = await getAccountById(db, organizationId, cashAccountId);
  assertCashAccount(cashAccount, "cash_account_invalid");
  return original;
}

export async function calculateSettlementRemaining(
  db: D1Database,
  organizationId: string,
  transactionId: string,
  cashAccountId: string,
  originalAmountMinor: number,
  isSale: boolean,
  originalCashAccountId?: string,
) {
  // ponytail: Query settlement transactions (receive_receivable/pay_payable) linked
  // by original_transaction_id, not the original transaction's journal lines.
  // The original journal lines only reflect point-of-sale partial payments (e.g.,
  // 30% down, 70% credit), not subsequent partial settlements which create separate
  // transactions. Using original journal lines would miss partial settlements,
  // causing over-settlement.
  const paidViaSettlements = await queryFirst<{ total: number | null }>(
    db,
    `SELECT SUM(amount_minor) as total
     FROM transactions
     WHERE original_transaction_id = ?
       AND organization_id = ?
       AND status = 'posted'
       AND transaction_type IN ('receive_receivable', 'pay_payable')`,
    [transactionId, organizationId],
  );
  const settledAmount = paidViaSettlements?.total ?? 0;

  // Also check original transaction's journal lines for point-of-sale partial payments
  // (e.g., credit_sale with Dr Cash partial + Dr AR for remaining)
  const originalLines = await journalLinesForTransaction(db, organizationId, transactionId);
  const cashAccounts = [cashAccountId];
  if (originalCashAccountId && !cashAccounts.includes(originalCashAccountId)) {
    cashAccounts.push(originalCashAccountId);
  }
  const pointOfSaleCash = originalLines
    .filter((l) => cashAccounts.includes(l.account_id) && (
      (isSale && l.debit_minor > 0) ||
      (!isSale && l.credit_minor > 0)
    ))
    .reduce((sum, l) => sum + (isSale ? l.debit_minor : l.credit_minor), 0);

  const totalPaid = settledAmount + pointOfSaleCash;
  const remainingMinor = originalAmountMinor - totalPaid;
  if (remainingMinor < 0) {
    throw conflict("over_settlement", "Settlement exceeds remaining amount");
  }
  if (remainingMinor === 0) {
    throw conflict("already_fully_paid", "This transaction is already fully paid");
  }
  return remainingMinor;
}

/**
 * Settle a partial credit_sale or credit_purchase transaction by posting
 * a receive_receivable or pay_payable for the remaining amount.
 *
 * Despite the original name, this function does NOT void — it only settles.
 * Voiding partially paid transactions is blocked by validateVoidableTransaction.
 */
export async function settlePartialTransaction(
  db: D1Database,
  organizationId: string,
  userId: string,
  transactionId: string,
  cashAccountId: string,
  idempotencyKey: string,
  requestId?: string,
): Promise<SettleTransactionResult> {
  const normalizedKey = normalizeIdempotencyKey(idempotencyKey);
  const existing = await getTransactionByIdempotencyKey(db, organizationId, normalizedKey);
  if (existing) {
    if (existing.original_transaction_id === transactionId) {
      return {
        settle_transaction_id: existing.id,
        settle_transaction_number: existing.transaction_number,
        journal_entry_id: existing.id,
        status: "settled",
      };
    }
    throw conflict("idempotency_key_conflict", "Idempotency key is already used");
  }

  const original = await validateSettlementTarget(db, organizationId, transactionId, cashAccountId);
  const isSale = original.transaction_type === "credit_sale";
  const remainingMinor = await calculateSettlementRemaining(db, organizationId, transactionId, cashAccountId, original.amount_minor, isSale, original.cash_account_id ?? undefined);
  const current = Date.now();
  const settleTransactionId = generateId();
  const journalEntryId = generateId();
  const settleTransactionNumber = await generateTransactionNumber(db, organizationId, original.transaction_date);
  const settleEntryNumber = await generateEntryNumber(db, organizationId);
  const settleType = isSale ? "receive_receivable" : "pay_payable";
  const arApAccountCode = isSale ? "1200" : "2100";
  const arApAccount = await accountByCode(db, organizationId, arApAccountCode);

  const statements: D1PreparedStatement[] = [
    statement(
      db,
      `INSERT INTO transactions (
         id, organization_id, transaction_number, transaction_date,
         transaction_type, amount_minor, party_id, category_name,
         cash_account_id, description, notes, status, idempotency_key,
         posted_at, posted_by, original_transaction_id,
         created_by, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'posted', ?, ?, ?, ?, ?, ?, ?)`,
      [
        settleTransactionId,
        organizationId,
        settleTransactionNumber,
        original.transaction_date,
        settleType,
        remainingMinor,
        original.party_id,
        original.category_name,
        cashAccountId,
        `Pelunasan: ${original.description}`,
        `Settle remaining ${formatIDRMinor(remainingMinor)} for ${original.transaction_number}`,
        normalizedKey,
        current,
        userId,
        transactionId,
        userId,
        current,
        current,
      ],
    ),
    insertJournalEntryStatement(db, {
      journalEntryId, organizationId, entryNumber: settleEntryNumber,
      entryDate: original.transaction_date, entryType: 'normal',
      transactionId: settleTransactionId,
      description: `Pelunasan sisa: ${formatIDRMinor(remainingMinor)}`, current, userId,
    }),
    // Debit cash account, credit AR/AP for remaining amount
    insertJournalLineStatement(
      db,
      organizationId,
      journalEntryId,
      {
        accountId: cashAccountId,
        debitMinor: isSale ? remainingMinor : 0,
        creditMinor: isSale ? 0 : remainingMinor,
        description: `Pelunasan: ${original.transaction_number}`,
      },
      1,
      current,
    ),
    insertJournalLineStatement(
      db,
      organizationId,
      journalEntryId,
      {
        accountId: arApAccount.id,
        debitMinor: isSale ? 0 : remainingMinor,
        creditMinor: isSale ? remainingMinor : 0,
        description: `Pelunasan: ${original.transaction_number}`,
      },
      2,
      current,
    ),
    writeAuditStatement(db, {
      organizationId,
      actorUserId: userId,
      entityType: "transaction",
      entityId: settleTransactionId,
      action: "settle",
      before: { original_transaction_id: transactionId, remaining_minor: remainingMinor },
      after: { settle_transaction_type: settleType },
      requestId,
      current,
    }),
  ];

  // Update original transaction's payment_status to 'paid' so it can be voided
  statements.push(
    statement(
      db,
      `UPDATE transactions
       SET payment_status = 'paid',
           updated_at = ?
       WHERE id = ? AND organization_id = ?`,
      [current, transactionId, organizationId],
    ),
  );

  try {
    // ponytail: Re-assert period open just before batch to minimize race window.
    await assertPeriodOpen(db, organizationId, original.transaction_date);
    await executeBatch(db, statements);
  } catch (e) {
    const retry = await getTransactionByIdempotencyKey(db, organizationId, normalizedKey);
    if (retry) {
      return {
        settle_transaction_id: retry.id,
        settle_transaction_number: retry.transaction_number,
        journal_entry_id: retry.id,
        status: "settled",
      };
    }
    throw e;
  }

  return {
    settle_transaction_id: settleTransactionId,
    settle_transaction_number: settleTransactionNumber,
    journal_entry_id: journalEntryId,
    status: "settled",
  };
}

type VoidStockCtx = {
  db: D1Database;
  statements: D1PreparedStatement[];
  original: { transaction_type: string };
  product: ProductRow;
  productLine: { quantity_milli: number; unit_price_minor: number };
  stockMovement: { unit_cost_minor: number } | null;
  organizationId: string;
  reversalTransactionId: string;
  voidDate: string;
  reason: string;
  userId: string;
  current: number;
};

// ponytail: Options object to satisfy S107 max-params.
function restoreStockForVoid(ctx: VoidStockCtx): void {
  const { db, statements, original, product, productLine, stockMovement, organizationId, reversalTransactionId, voidDate, reason, userId, current } = ctx;
  const isSale = original.transaction_type === "cash_sale" || original.transaction_type === "credit_sale";
  const isPurchase = original.transaction_type === "cash_purchase" || original.transaction_type === "credit_purchase";
  const isSaleReturn = original.transaction_type === "sale_return";
  const isPurchaseReturn = original.transaction_type === "purchase_return";
  if (!isSale && !isPurchase && !isSaleReturn && !isPurchaseReturn) return;

  // Void reverses the stock direction of the original transaction
  // sale + sale_return: both increase stock on void (reversal)
  // purchase + purchase_return: both decrease stock on void (reversal)
  // sale_return originally added stock, so void removes stock (-)
  // purchase_return originally removed stock, so void adds stock (+)
  let quantityDelta: number;
  if (isSaleReturn) quantityDelta = -productLine.quantity_milli;
  else if (isPurchaseReturn || isSale) quantityDelta = productLine.quantity_milli;
  else quantityDelta = -productLine.quantity_milli;
  const nextStock = product.current_stock_milli + quantityDelta;
  if (nextStock < 0) throw conflict("insufficient_stock", "Insufficient stock");
  const nextAverage = nextStock === 0 ? 0 : product.average_cost_minor;
  const unitCostMinor = stockMovement?.unit_cost_minor ?? productLine.unit_price_minor ?? product.average_cost_minor;

  statements.push(
    statement(
      db,
      `UPDATE products SET current_stock_milli = ?, average_cost_minor = ?, purchase_price_minor = ?, updated_at = ?
       WHERE id = ? AND organization_id = ? AND current_stock_milli = ?`,
      [nextStock, nextAverage, product.purchase_price_minor, current, product.id, organizationId, product.current_stock_milli],
    ),
    insertStockMovementStatement(db, {
      organizationId, productId: product.id, transactionId: reversalTransactionId,
      movementDate: voidDate, movementType: "void",
      quantityMilli: quantityDelta, unitCostMinor, stockAfterMilli: nextStock,
      notes: reason, userId, current,
    }),
  );
}

type VoidValidation = {
  original: NonNullable<Awaited<ReturnType<typeof getTransactionRow>>>;
  voidDate: string;
  reason: string;
};

async function validateVoidableTransaction(
  db: D1Database,
  organizationId: string,
  transactionId: string,
  input: VoidTransactionInput,
): Promise<VoidValidation> {
  const original = await getTransactionRow(db, organizationId, transactionId);
  if (!original) throw notFound("transaction_not_found", "Transaction not found");
  if (original.status !== "posted") {
    throw conflict("transaction_not_posted", "Only posted transactions can be voided");
  }
  if (original.original_transaction_id) {
    throw conflict("reversal_not_voidable", "Reversal transactions cannot be voided");
  }
  if (
    (original.transaction_type === "credit_sale" || original.transaction_type === "credit_purchase")
    && original.payment_status === "partial"
  ) {
    throw conflict(
      "partial_void_not_supported",
      "Partially paid credit transactions cannot be voided directly",
    );
  }
  const reason = normalizeRequiredText(input.reason, "void_reason_required");
  const voidDate = input.voidDate
    ? normalizeDate(input.voidDate, "void_date_invalid")
    // ponytail: Use Intl.DateTimeFormat with WIB timezone for correct date.
    : new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date())
  await assertPeriodOpen(db, organizationId, original.transaction_date);
  await assertPeriodOpen(db, organizationId, voidDate);
  return { original, voidDate, reason };
}

function buildReversalStatements(
  ctx: {
    db: D1Database; organizationId: string; reversalTransactionId: string;
    reversalJournalEntryId: string; reversalTransactionNumber: string;
    reversalEntryNumber: string; voidDate: string; original: VoidValidation['original'];
    originalJournalLines: { journal_entry_id: string | null; account_id: string; debit_minor: number; credit_minor: number; description: string }[];
    reason: string; idempotencyKey: string; current: number; userId: string; transactionId: string;
  },
): D1PreparedStatement[] {
  const { db, organizationId, reversalTransactionId, reversalJournalEntryId, reversalTransactionNumber, reversalEntryNumber, voidDate, original, originalJournalLines, reason, idempotencyKey, current, userId, transactionId } = ctx;
  return [
    statement(
      db,
      `INSERT INTO transactions (
         id, organization_id, transaction_number, transaction_date,
         transaction_type, amount_minor, party_id, category_name,
         cash_account_id, destination_cash_account_id, payment_status, due_date,
         description, notes, status, idempotency_key, posted_at, posted_by,
         original_transaction_id, created_by, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'posted', ?, ?, ?, ?, ?, ?, ?)`,
      [
        reversalTransactionId, organizationId, reversalTransactionNumber, voidDate,
        original.transaction_type, original.amount_minor, original.party_id, original.category_name,
        original.cash_account_id, original.destination_cash_account_id, original.payment_status, original.due_date,
        `Pembatalan: ${original.description}`, reason, idempotencyKey, current, userId,
        transactionId, userId, current, current,
      ],
    ),
    insertJournalEntryStatement(db, {
      journalEntryId: reversalJournalEntryId, organizationId, entryNumber: reversalEntryNumber,
      entryDate: voidDate, entryType: 'reversal', transactionId: reversalTransactionId,
      description: `Pembatalan: ${original.description}`, current, userId,
      reversedEntryId: originalJournalLines[0]?.journal_entry_id ?? null, reversalReason: reason,
    }),
    ...originalJournalLines.map((line, index) => insertJournalLineStatement(
      db, organizationId, reversalJournalEntryId,
      { accountId: line.account_id, debitMinor: line.credit_minor, creditMinor: line.debit_minor, description: `Reversal: ${line.description}` },
      index + 1, current,
    )),
  ];
}

export async function voidTransaction(
  db: D1Database,
  organizationId: string,
  userId: string,
  transactionId: string,
  input: VoidTransactionInput,
  requestId?: string,
): Promise<VoidTransactionResult> {
  const idempotencyKey = normalizeIdempotencyKey(input.idempotencyKey);
  const existing = await getTransactionByIdempotencyKey(db, organizationId, idempotencyKey);
  if (existing?.original_transaction_id === transactionId) {
    return {
      original_transaction_id: transactionId,
      reversal_transaction_id: existing.id,
      reversal_journal_entry_ids: (await listJournalEntriesForTransaction(db, organizationId, existing.id)).map((entry) => entry.id),
      status: "voided",
    };
  }
  if (existing) {
    throw conflict("idempotency_key_conflict", "Idempotency key is already used");
  }

  const { original, voidDate, reason } = await validateVoidableTransaction(db, organizationId, transactionId, input);

  // Check if approval is needed for voids
  const voidApproval = await requireApprovalOrContinue(
    db, organizationId, userId, "transaction_void", "transaction", transactionId, original.amount_minor,
    { entitySummary: `Pembatalan ${transactionTypeLabel(original.transaction_type as TransactionType)} - ${formatIDRMinor(original.amount_minor)}` },
  );
  if (voidApproval) {
    throw badRequest("approval_required",
      `This void requires approval. Request ID: ${voidApproval.id}. Please wait for an admin to approve it.`,
    );
  }

  const originalJournalLines = await journalLinesForTransaction(db, organizationId, transactionId);
  if (!originalJournalLines.length) {
    throw conflict("journal_not_found", "Posted journal was not found for this transaction");
  }

  const productLine = await productLineForTransaction(db, organizationId, transactionId);
  const product = productLine?.product_id
    ? await getProductRow(db, organizationId, productLine.product_id)
    : null;
  const stockMovement = productLine?.product_id
    ? await stockMovementForTransaction(db, organizationId, transactionId, productLine.product_id)
    : null;

  const current = Date.now();
  const reversalTransactionId = generateId();
  const reversalJournalEntryId = generateId();
  const reversalTransactionNumber = await generateTransactionNumber(db, organizationId, voidDate);
  const reversalEntryNumber = await generateEntryNumber(db, organizationId);

  const statements: D1PreparedStatement[] = buildReversalStatements({
    db, organizationId, reversalTransactionId, reversalJournalEntryId, reversalTransactionNumber,
    reversalEntryNumber, voidDate, original, originalJournalLines, reason, idempotencyKey, current, userId, transactionId,
  });

  if (product && productLine?.quantity_milli != null) {
    restoreStockForVoid({ db, statements, original, product, productLine: { quantity_milli: productLine.quantity_milli, unit_price_minor: productLine.unit_price_minor ?? product.average_cost_minor }, stockMovement: stockMovement ? { unit_cost_minor: stockMovement.unit_cost_minor ?? product.average_cost_minor } : null, organizationId, reversalTransactionId, voidDate, reason, userId, current });
  }

  statements.push(
    statement(
      db,
      `UPDATE transactions
       SET status = 'voided',
           voided_at = ?,
           voided_by = ?,
           void_reason = ?,
           reversal_transaction_id = ?,
           updated_at = ?
       WHERE id = ? AND organization_id = ?`,
      [
        current,
        userId,
        reason,
        reversalTransactionId,
        current,
        transactionId,
        organizationId,
      ],
    ),
    statement(
      db,
      `UPDATE journal_entries
       SET status = 'voided', updated_at = ?
       WHERE transaction_id = ? AND organization_id = ? AND status = 'posted'`,
      [current, transactionId, organizationId],
    ),
    writeAuditStatement(db, {
      organizationId,
      actorUserId: userId,
      entityType: "transaction",
      entityId: transactionId,
      action: "void",
      before: {
        transaction_number: original.transaction_number,
        amount: original.amount_minor,
        transaction_type: original.transaction_type,
      },
      after: { reversal_transaction_id: reversalTransactionId },
      reason,
      requestId,
      current,
    }),
  );

  try {
    // ponytail: Re-assert period open just before batch to minimize race window.
    await assertPeriodOpen(db, organizationId, voidDate);
    await assertPeriodOpen(db, organizationId, original.transaction_date);
    await executeBatch(db, statements);
  } catch (e) {
    const retry = await getTransactionByIdempotencyKey(db, organizationId, idempotencyKey);
    if (retry?.original_transaction_id === transactionId) {
      return {
        original_transaction_id: transactionId,
        reversal_transaction_id: retry.id,
        reversal_journal_entry_ids: (await listJournalEntriesForTransaction(db, organizationId, retry.id)).map((entry) => entry.id),
        status: "voided" as const,
      };
    }
    throw e;
  }

  // Recalculate WAC for products affected by this void
  if (product && productLine?.quantity_milli != null) {
    await recalculateProductAverageCost(db, organizationId, product.id);
  }

  return {
    original_transaction_id: transactionId,
    reversal_transaction_id: reversalTransactionId,
    reversal_journal_entry_ids: [reversalJournalEntryId],
    status: "voided",
  };
}

export function assertJournalBalanced(lines: readonly JournalLineInput[]): void {
  const debit = lines.reduce((total, line) => total + line.debitMinor, 0);
  const credit = lines.reduce((total, line) => total + line.creditMinor, 0);
  if (debit <= 0 || credit <= 0 || debit !== credit) {
    throw badRequest("journal_unbalanced", "Journal is not balanced");
  }
}

function transactionSelectSql(): string {
  return `SELECT
       t.id,
       t.organization_id,
       t.transaction_number,
       t.transaction_date,
       t.transaction_type,
       t.amount_minor,
       t.party_id,
       p.name AS party_name,
       t.category_name,
       t.cash_account_id,
       t.destination_cash_account_id,
       t.payment_status,
       t.due_date,
       t.description,
       t.notes,
       t.status,
       t.idempotency_key,
       t.posted_at,
       t.voided_at,
       t.void_reason,
       t.original_transaction_id,
       t.reversal_transaction_id,
       t.created_by,
       u.full_name AS created_by_name,
       t.created_at
     FROM transactions t
     LEFT JOIN parties p
       ON p.id = t.party_id
      AND p.organization_id = t.organization_id
     LEFT JOIN users u
       ON u.id = t.created_by`;
}

async function getTransactionRow(
  db: D1Database,
  organizationId: string,
  transactionId: string,
): Promise<TransactionRow | null> {
  return queryFirst<TransactionRow>(
    db,
    `${transactionSelectSql()}
     WHERE t.id = ?
       AND t.organization_id = ?
     LIMIT 1`,
    [transactionId, organizationId],
  );
}

async function getTransactionByIdempotencyKey(
  db: D1Database,
  organizationId: string,
  idempotencyKey: string,
): Promise<TransactionRow | null> {
  return queryFirst<TransactionRow>(
    db,
    `${transactionSelectSql()}
     WHERE t.organization_id = ?
       AND t.idempotency_key = ?
     LIMIT 1`,
    [organizationId, idempotencyKey],
  );
}

async function buildPostResult(
  db: D1Database,
  organizationId: string,
  transactionId: string,
  replayed?: boolean,
): Promise<PostTransactionResult> {
  const transaction = await getTransactionRow(db, organizationId, transactionId);
  if (!transaction) throw notFound("transaction_not_found", "Transaction not found");

  const entries = await listJournalEntriesForTransaction(db, organizationId, transactionId);
  const entry = entries[0];
  if (!entry) throw conflict("journal_not_found", "Posted journal was not found");
  const debit = entry.journal_lines.find((line) => line.debit > 0);
  const credit = entry.journal_lines.find((line) => line.credit > 0);
  if (!debit || !credit) throw conflict("journal_not_found", "Posted journal lines were not found");

  return {
    replayed,
    transaction_id: transaction.id,
    transaction_number: transaction.transaction_number,
    journal_entry_id: entry.id,
    entry_number: entry.entry_number,
    impact: {
      debit_account_id: debit.account_id,
      debit_account: debit.accounts?.name ?? "Debit",
      debit_change: await accountChangeDirection(db, organizationId, debit.account_id, "debit"),
      credit_account_id: credit.account_id,
      credit_account: credit.accounts?.name ?? "Credit",
      credit_change: await accountChangeDirection(db, organizationId, credit.account_id, "credit"),
      amount: transaction.amount_minor,
    },
  };
}

function toPublicTransaction(row: TransactionRow): PublicTransaction {
  return {
    id: row.id,
    transaction_number: row.transaction_number,
    transaction_date: row.transaction_date,
    transaction_type: row.transaction_type,
    amount: row.amount_minor,
    party_id: row.party_id,
    category_name: row.category_name,
    cash_account_id: row.cash_account_id,
    destination_cash_account_id: row.destination_cash_account_id,
    payment_status: row.payment_status,
    due_date: row.due_date,
    description: row.description,
    notes: row.notes,
    status: row.status,
    posted_at: msToIso(row.posted_at),
    voided_at: msToIso(row.voided_at),
    void_reason: row.void_reason,
    created_by: row.created_by,
    parties: row.party_name ? { name: row.party_name } : null,
    created_by_profile: row.created_by_name ? { full_name: row.created_by_name } : null,
  };
}

function nestJournalRows(rows: JournalRow[]): PublicJournalEntry[] {
  const entries = new Map<string, PublicJournalEntry>();
  for (const row of rows) {
    let entry = entries.get(row.journal_entry_id);
    if (!entry) {
      entry = {
        id: row.journal_entry_id,
        entry_number: row.entry_number,
        entry_date: row.entry_date,
        entry_type: row.entry_type,
        description: row.entry_description,
        status: row.entry_status,
        journal_lines: [],
      };
      entries.set(row.journal_entry_id, entry);
    }

    if (row.line_id && row.account_id) {
      entry.journal_lines.push({
        id: row.line_id,
        account_id: row.account_id,
        debit: row.debit_minor ?? 0,
        credit: row.credit_minor ?? 0,
        description: row.line_description ?? "",
        accounts: {
          code: Number(row.account_code ?? 0),
          name: row.account_name ?? "",
        },
      });
    }
  }
  return [...entries.values()];
}

async function assertBooksOpen(
  db: D1Database,
  organizationId: string,
  transactionDate: string,
): Promise<void> {
  const row = await queryFirst<OrganizationRow>(
    db,
    "SELECT books_start_date FROM organizations WHERE id = ?",
    [organizationId],
  );
  if (!row) throw notFound("organization_not_found", "Organization not found");
  if (transactionDate < row.books_start_date) {
    throw badRequest(
      "transaction_before_books_start",
      "Transaction date is before the books start date",
    );
  }
}

export async function assertPeriodOpen(
  db: D1Database,
  organizationId: string,
  date: string,
): Promise<void> {
  const lock = await queryFirst<{ id: string; locked_through_date: string }>(
    db,
    `SELECT id, locked_through_date
     FROM period_locks
     WHERE organization_id = ?
       AND locked_through_date >= ?
     ORDER BY locked_through_date DESC
     LIMIT 1`,
    [organizationId, date],
  );
  if (lock) {
    throw conflict("period_locked", "The selected date is inside a locked period");
  }
}

async function resolveParty(
  db: D1Database,
  organizationId: string,
  transactionType: TransactionType,
  input: { partyId?: string | null; partyName?: string | null; current: number },
): Promise<string | null> {
  const partyName = nullableText(input.partyName);
  if (input.partyId) {
    const existing = await queryFirst<PartyRow>(
      db,
      `SELECT id, name
       FROM parties
       WHERE id = ?
         AND organization_id = ?
         AND is_active = 1`,
      [input.partyId, organizationId],
    );
    if (!existing) throw notFound("party_not_found", "Party not found");
    return existing.id;
  }

  if (!partyName) {
    if (requiresParty(transactionType)) {
      throw badRequest("party_required", "Party is required for this transaction type");
    }
    return null;
  }

  const existing = await queryFirst<PartyRow>(
    db,
    `SELECT id, name
     FROM parties
     WHERE organization_id = ?
       AND is_active = 1
       AND lower(trim(name)) = lower(trim(?))
     LIMIT 1`,
    [organizationId, partyName],
  );
  if (existing) return existing.id;

  const partyId = generateId();
  await executeBatch(db, [
    statement(
      db,
      `INSERT INTO parties (
         id, organization_id, name, party_type, is_active, created_at, updated_at
       ) VALUES (?, ?, ?, ?, 1, ?, ?)`,
      [
        partyId,
        organizationId,
        partyName,
        partyTypeForTransaction(transactionType),
        input.current,
        input.current,
      ],
    ),
  ]);
  return partyId;
}

interface PostingAccountInput {
    cashAccount: AccountRow | null;
    destinationCashAccount: AccountRow | null;
    debitAccountId?: string | null;
    product: ProductRow | null;
    paymentStatus: PaymentStatus;
}

interface PostingAccountsResult {
  debitAccount: AccountRow;
  creditAccount: AccountRow;
  categoryName: string | null;
}

function productAccountId(product: ProductRow | null, key: "inventory_account_id" | "revenue_account_id"): string | null {
  return product?.[key] ?? null;
}

async function revenueAccount(
  db: D1Database,
  organizationId: string,
  product: ProductRow | null,
): Promise<AccountRow> {
  const accountId = productAccountId(product, "revenue_account_id");
  return accountByCode(db, organizationId, accountId ? null : "4100", accountId);
}

async function inventoryOrDebitAccount(
  db: D1Database,
  organizationId: string,
  input: PostingAccountInput,
): Promise<AccountRow> {
  const accountId = productAccountId(input.product, "inventory_account_id");
  if (input.product) {
    return accountByCode(db, organizationId, accountId ? null : "1300", accountId);
  }
  return requireDebitAccount(db, organizationId, input.debitAccountId, ["expense", "cogs"]);
}

async function resolveSaleAccounts(
  db: D1Database,
  organizationId: string,
  transactionType: TransactionType,
  input: PostingAccountInput,
): Promise<PostingAccountsResult> {
  const creditAccount = await revenueAccount(db, organizationId, input.product);
  if (transactionType === "cash_sale" || input.paymentStatus === "paid") {
    assertCashAccount(input.cashAccount, "cash_account_invalid");
    return { debitAccount: input.cashAccount, creditAccount, categoryName: null };
  }
  return {
    debitAccount: await accountByCode(db, organizationId, "1200"),
    creditAccount,
    categoryName: null,
  };
}

async function resolvePurchaseAccounts(
  db: D1Database,
  organizationId: string,
  transactionType: TransactionType,
  input: PostingAccountInput,
): Promise<PostingAccountsResult> {
  const debitAccount = await inventoryOrDebitAccount(db, organizationId, input);
  if (transactionType === "cash_purchase" || input.paymentStatus === "paid") {
    assertCashAccount(input.cashAccount, "cash_account_invalid");
    return { debitAccount, creditAccount: input.cashAccount, categoryName: null };
  }
  return {
    debitAccount,
    creditAccount: await accountByCode(db, organizationId, "2100"),
    categoryName: null,
  };
}

async function resolvePostingAccounts(
  db: D1Database,
  organizationId: string,
  transactionType: TransactionType,
  input: PostingAccountInput,
): Promise<PostingAccountsResult> {
  if (requiresCashAccount(transactionType, input.paymentStatus)) {
    assertCashAccount(input.cashAccount, "cash_account_invalid");
  }

  if (transactionType === "cash_transfer") {
    assertCashAccount(input.destinationCashAccount, "destination_cash_account_invalid");
    if (input.cashAccount?.id === input.destinationCashAccount?.id) {
      throw badRequest("cash_transfer_same_account", "Source and destination accounts must be different");
    }
  }

  switch (transactionType) {
    case "cash_sale":
      return resolveSaleAccounts(db, organizationId, transactionType, input);
    case "credit_sale":
      return resolveSaleAccounts(db, organizationId, transactionType, input);
    case "receive_receivable":
      return {
        debitAccount: input.cashAccount!,
        creditAccount: await accountByCode(db, organizationId, "1200"),
        categoryName: null,
      };
    case "cash_purchase":
      return resolvePurchaseAccounts(db, organizationId, transactionType, input);
    case "credit_purchase":
      return resolvePurchaseAccounts(db, organizationId, transactionType, input);
    case "pay_payable":
      return {
        debitAccount: await accountByCode(db, organizationId, "2100"),
        creditAccount: input.cashAccount!,
        categoryName: null,
      };
    case "expense_payment": {
      const debitAccount = input.debitAccountId
        ? await requireDebitAccount(db, organizationId, input.debitAccountId, ["expense"])
        : await accountByCode(db, organizationId, "6190");
      return {
        debitAccount,
        creditAccount: input.cashAccount!,
        categoryName: debitAccount.name,
      };
    }
    case "owner_capital":
      return {
        debitAccount: input.cashAccount!,
        creditAccount: await accountByCode(db, organizationId, "3100"),
        categoryName: null,
      };
    case "owner_draw":
      return {
        debitAccount: await accountByCode(db, organizationId, "3300"),
        creditAccount: input.cashAccount!,
        categoryName: null,
      };
    case "cash_transfer":
      return {
        debitAccount: input.destinationCashAccount!,
        creditAccount: input.cashAccount!,
        categoryName: null,
      };
    case "sale_return":
      // Sale return: Dr Revenue (contra-revenue), Cr Cash or AR
      return {
        debitAccount: await revenueAccount(db, organizationId, input.product),
        creditAccount: input.paymentStatus === "paid" ? input.cashAccount! : await accountByCode(db, organizationId, "1200"),
        categoryName: null,
      };
    case "purchase_return":
      // Purchase return: Dr Cash or AP, Cr Inventory
      if (input.paymentStatus === "paid") {
        assertCashAccount(input.cashAccount, "cash_account_invalid");
        return {
          debitAccount: input.cashAccount,
          creditAccount: await inventoryOrDebitAccount(db, organizationId, input),
          categoryName: null,
        };
      }
      return {
        debitAccount: await accountByCode(db, organizationId, "2100"),
        creditAccount: await inventoryOrDebitAccount(db, organizationId, input),
        categoryName: null,
      };
  }
}

function buildJournalLines(
  transactionType: TransactionType,
  input: {
    amountMinor: number;
    partialAmountMinor: number | null;
    paymentStatus: PaymentStatus;
    debitAccount: AccountRow;
    creditAccount: AccountRow;
    cashAccount: AccountRow | null;
    partyId: string | null;
    description: string;
    product: ProductRow | null;
    quantityMilli: number | null;
  },
): JournalLineInput[] {
  if (
    (transactionType === "credit_sale" || transactionType === "credit_purchase")
    && input.paymentStatus === "partial"
  ) {
    if (!input.cashAccount) throw badRequest("cash_account_required", "Cash account is required");
    if (
      input.partialAmountMinor === null
      || input.partialAmountMinor <= 0
      || input.partialAmountMinor >= input.amountMinor
    ) {
      throw badRequest("partial_amount_invalid", "Partial payment amount is invalid");
    }
    const remaining = input.amountMinor - input.partialAmountMinor;
    if (transactionType === "credit_sale") {
      return [
        debit(input.cashAccount, input.partialAmountMinor, input.description),
        debit(input.debitAccount, remaining, input.description, input.partyId),
        credit(input.creditAccount, input.amountMinor, input.description),
        ...saleCogsLines(transactionType, input),
      ];
    }
    return [
      debit(input.debitAccount, input.amountMinor, input.description),
      credit(input.cashAccount, input.partialAmountMinor, input.description),
      credit(input.creditAccount, remaining, input.description, input.partyId),
    ];
  }

  return [
    debit(input.debitAccount, input.amountMinor, input.description, input.partyId),
    credit(input.creditAccount, input.amountMinor, input.description, input.partyId),
    ...saleCogsLines(transactionType, input),
  ];
}

function saleCogsLines(
  transactionType: TransactionType,
  input: {
  product: ProductRow | null;
  quantityMilli: number | null;
  description: string;
},
): JournalLineInput[] {
  if (transactionType !== "cash_sale" && transactionType !== "credit_sale") return [];
  if (!input.product || input.quantityMilli === null) return [];
  // ponytail: MVP only supports whole-unit quantities. Fractional qty leads to
  // COGS rounding drift (Math.round on (cost×qty)/1000). Lift when needed.
  if (input.quantityMilli % 1000 !== 0) {
    throw badRequest("fractional_quantity_unsupported", "Fractional product quantities are not supported yet");
  }
  const costMinor = productCostMinor(input.product);
  const cogsAmount = Math.round((costMinor * input.quantityMilli) / 1000);
  if (cogsAmount <= 0) return [];
  if (!input.product.cogs_account_id || !input.product.inventory_account_id) {
    throw badRequest("product_accounts_missing", "Product inventory accounts are not configured");
  }
  return [
    {
      accountId: input.product.cogs_account_id,
      debitMinor: cogsAmount,
      creditMinor: 0,
      description: `HPP: ${input.description}`,
    },
    {
      accountId: input.product.inventory_account_id,
      debitMinor: 0,
      creditMinor: cogsAmount,
      description: `HPP: ${input.description}`,
    },
  ];
}

async function journalLinesForTransaction(
  db: D1Database,
  organizationId: string,
  transactionId: string,
): Promise<Array<JournalLineRow & { journal_entry_id: string }>> {
  return queryAll<JournalLineRow & { journal_entry_id: string }>(
    db,
    `SELECT jl.id, jl.journal_entry_id, jl.account_id, jl.debit_minor, jl.credit_minor,
            jl.description, jl.line_order
     FROM journal_lines jl
     JOIN journal_entries je
       ON je.id = jl.journal_entry_id
      AND je.organization_id = jl.organization_id
     WHERE jl.organization_id = ?
       AND je.transaction_id = ?
       AND je.status = 'posted'
     ORDER BY je.created_at ASC, jl.line_order ASC`,
    [organizationId, transactionId],
  );
}

async function productLineForTransaction(
  db: D1Database,
  organizationId: string,
  transactionId: string,
): Promise<TransactionLineRow | null> {
  return queryFirst<TransactionLineRow>(
    db,
    `SELECT product_id, quantity_milli, unit_price_minor
     FROM transaction_lines
     WHERE organization_id = ?
       AND transaction_id = ?
       AND product_id IS NOT NULL
     ORDER BY line_order ASC
     LIMIT 1`,
    [organizationId, transactionId],
  );
}

/**
 * Recalculate a product's average cost (WAC) by replaying all stock movements
 * in chronological order.
 *
 * WAC formula:
 *   - opening/purchase: newAvg = round((stock × avg + qty × unit_cost) / new_stock)
 *   - sale/void/adjustment: avg unchanged (quantity-only)
 */
interface StockMovementForWac {
  movement_type: string;
  quantity_milli: number;
  unit_cost_minor: number | null;
}

export async function recalculateProductAverageCost(
  db: D1Database,
  organizationId: string,
  productId: string,
): Promise<{ average_cost_minor: number; current_stock_milli: number }> {
  const movements = await queryAll<StockMovementForWac>(
    db,
    `SELECT movement_type, quantity_milli, unit_cost_minor
     FROM stock_movements
     WHERE organization_id = ? AND product_id = ?
     ORDER BY movement_date ASC, created_at ASC`,
    [organizationId, productId],
  );

  let stock = 0;
  let avg = 0;

  for (const m of movements) {
    if (m.movement_type === "opening" || m.movement_type === "purchase") {
      const qty = m.quantity_milli;
      const cost = m.unit_cost_minor ?? 0;
      const newStock = stock + qty;
      if (newStock > 0) {
        avg = Math.round((stock * avg + qty * cost) / newStock);
      }
      stock = newStock;
    } else {
      // sale, void, adjustment: avg unchanged
      stock += m.quantity_milli;
      if (stock < 0) stock = 0; // safety clamp, should not happen
    }
  }

  await execute(
    db,
    `UPDATE products SET average_cost_minor = ?, current_stock_milli = ?, updated_at = ?
     WHERE id = ? AND organization_id = ?`,
    [avg, stock, Date.now(), productId, organizationId],
  );

  return { average_cost_minor: avg, current_stock_milli: stock };
}

async function stockMovementForTransaction(
  db: D1Database,
  organizationId: string,
  transactionId: string,
  productId: string,
): Promise<StockMovementRow | null> {
  return queryFirst<StockMovementRow>(
    db,
    `SELECT unit_cost_minor
     FROM stock_movements
     WHERE organization_id = ?
       AND transaction_id = ?
       AND product_id = ?
     ORDER BY created_at DESC
     LIMIT 1`,
    [organizationId, transactionId, productId],
  );
}

async function getAccountById(
  db: D1Database,
  organizationId: string,
  accountId: string,
): Promise<AccountRow> {
  const row = await queryFirst<AccountRow>(
    db,
    `SELECT id, code, name, account_type, normal_balance, is_active, is_cash_account
     FROM accounts
     WHERE id = ?
       AND organization_id = ?
       AND is_active = 1`,
    [accountId, organizationId],
  );
  if (!row) throw notFound("account_not_found", "Account not found");
  return row;
}

async function resolveOptionalAccount(
  db: D1Database,
  organizationId: string,
  accountId: string | null | undefined,
): Promise<AccountRow | null> {
  if (!accountId) return null;
  return getAccountById(db, organizationId, accountId);
}

async function resolveProductFields(
  db: D1Database,
  organizationId: string,
  input: PostTransactionInput,
): Promise<{ product: ProductRow | null; quantityMilli: number | null; unitPriceMinor: number | null }> {
  if (!input.productId) return { product: null, quantityMilli: null, unitPriceMinor: null };
  const product = await getProductRow(db, organizationId, input.productId);
  return {
    product,
    quantityMilli: toQuantityMilli(input.quantity),
    unitPriceMinor: toMoneyMinor(input.unitPrice ?? 0),
  };
}

async function accountByCode(
  db: D1Database,
  organizationId: string,
  code: string | null,
  accountId?: string | null,
): Promise<AccountRow> {
  const idCondition = accountId ? "id = ?" : "code = ?";
  const row = await queryFirst<AccountRow>(
    db,
    `SELECT id, code, name, account_type, normal_balance, is_active, is_cash_account
     FROM accounts
     WHERE organization_id = ?
       AND ${idCondition}
       AND is_active = 1
     LIMIT 1`,
    [organizationId, accountId ?? code],
  );
  if (!row) throw notFound("account_not_found", "Required account not found");
  return row;
}

async function requireDebitAccount(
  db: D1Database,
  organizationId: string,
  accountId: string | null | undefined,
  allowedTypes: AccountType[],
): Promise<AccountRow> {
  if (!accountId) throw badRequest("debit_account_required", "Debit account is required");
  const account = await getAccountById(db, organizationId, accountId);
  if (!allowedTypes.includes(account.account_type)) {
    throw badRequest("debit_account_invalid", "Debit account is invalid for this transaction type");
  }
  return account;
}

async function getProductRow(
  db: D1Database,
  organizationId: string,
  productId: string,
): Promise<ProductRow> {
  const row = await queryFirst<ProductRow>(
    db,
    `SELECT id, code, name, purchase_price_minor, selling_price_minor,
            average_cost_minor, current_stock_milli,
            inventory_account_id, cogs_account_id, revenue_account_id,
            is_active
     FROM products
     WHERE id = ?
       AND organization_id = ?
       AND is_active = 1`,
    [productId, organizationId],
  );
  if (!row) throw notFound("product_not_found", "Product not found");
  return row;
}

function validateProductIntent(
  transactionType: TransactionType,
  product: ProductRow,
  quantityMilli: number,
  unitPriceMinor: number,
  amountMinor: number,
): void {
  if (!["cash_purchase", "credit_purchase", "cash_sale", "credit_sale", "sale_return", "purchase_return"].includes(transactionType)) {
    throw badRequest("product_transaction_invalid", "Products can only be used for sales, purchases, or returns");
  }
  if (quantityMilli <= 0) throw badRequest("quantity_invalid", "Product quantity must be greater than zero");
  if (unitPriceMinor < 0) throw badRequest("money_invalid", "Unit price is invalid");
  if (quantityMilli > Number.MAX_SAFE_INTEGER / unitPriceMinor) {
    throw badRequest("overflow", "Quantity × unit price would overflow");
  }
  const expectedAmount = Math.round((quantityMilli * unitPriceMinor) / 1000);
  if (expectedAmount !== amountMinor) {
    throw badRequest("product_amount_mismatch", "Transaction amount must equal quantity times unit price");
  }
  if ((transactionType === "cash_sale" || transactionType === "credit_sale") && productCostMinor(product) <= 0) {
    throw badRequest("product_zero_cost", "Product cost must be set before sale");
  }
}

function insertJournalLineStatement(
  db: D1Database,
  organizationId: string,
  journalEntryId: string,
  line: JournalLineInput,
  lineOrder: number,
  current: number,
): D1PreparedStatement {
  return statement(
    db,
    `INSERT INTO journal_lines (
       id, organization_id, journal_entry_id, account_id, party_id,
       debit_minor, credit_minor, description, line_order, created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      generateId(),
      organizationId,
      journalEntryId,
      line.accountId,
      line.partyId ?? null,
      line.debitMinor,
      line.creditMinor,
      line.description,
      lineOrder,
      current,
    ],
  );
}

function insertTransactionLineStatement(
  db: D1Database,
  input: {
    organizationId: string;
    transactionId: string;
    productId: string | null;
    accountId: string | null;
    description: string;
    quantityMilli: number | null;
    unitPriceMinor: number | null;
    amountMinor: number;
    lineOrder: number;
    current: number;
  },
): D1PreparedStatement {
  return statement(
    db,
    `INSERT INTO transaction_lines (
       id, organization_id, transaction_id, line_type, product_id, account_id,
       description, quantity_milli, unit_price_minor, amount_minor, line_order, created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      generateId(),
      input.organizationId,
      input.transactionId,
      input.productId ? "item" : "account",
      input.productId,
      input.accountId,
      input.description,
      input.quantityMilli,
      input.unitPriceMinor,
      input.amountMinor,
      input.lineOrder,
      input.current,
    ],
  );
}

function insertStockMovementStatement(
  db: D1Database,
  input: {
    organizationId: string;
    productId: string;
    transactionId: string;
    movementDate: string;
    movementType: "purchase" | "sale" | "void";
    quantityMilli: number;
    unitCostMinor: number | null;
    stockAfterMilli: number;
    notes: string | null;
    userId: string;
    current: number;
  },
): D1PreparedStatement {
  return statement(
    db,
    `INSERT INTO stock_movements (
       id, organization_id, product_id, movement_date, movement_type,
       quantity_milli, unit_cost_minor, transaction_id, stock_after_milli,
       notes, created_by, created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      generateId(),
      input.organizationId,
      input.productId,
      input.movementDate,
      input.movementType,
      input.quantityMilli,
      input.unitCostMinor,
      input.transactionId,
      input.stockAfterMilli,
      input.notes,
      input.userId,
      input.current,
    ],
  );
}

async function generateTransactionNumber(
  db: D1Database,
  organizationId: string,
  transactionDate: string,
): Promise<string> {
  const period = transactionDate.slice(0, 7).replace("-", "");
  const next = await nextCounter(db, organizationId, `transaction_number:${period}`);
  return `TRX-${period}-${String(next).padStart(6, "0")}`;
}

async function generateEntryNumber(
  db: D1Database,
  organizationId: string,
): Promise<string> {
  const next = await nextCounter(db, organizationId, "entry_number");
  return `JE-${String(next).padStart(6, "0")}`;
}

// ponytail: Counters run before executeBatch. If the batch fails, the counter
// has already advanced — gap in numbering. This is acceptable: gaps are not
// accounting errors. Move counter UPSERT into the batch when D1's RETURNING
// from executeBatch is needed for upstream systems that require gapless sequences.
async function nextCounter(
  db: D1Database,
  organizationId: string,
  counterName: string,
): Promise<number> {
  const current = Date.now();
  const row = await queryFirst<{ current_value: number }>(
    db,
    `INSERT INTO organization_document_counters (
       organization_id, counter_name, current_value, updated_at
     ) VALUES (?, ?, 1, ?)
     ON CONFLICT(organization_id, counter_name)
     DO UPDATE SET
       current_value = current_value + 1,
       updated_at = excluded.updated_at
     RETURNING current_value`,
    [organizationId, counterName, current],
  );
  if (!row) throw badRequest("counter_failed", "Document counter failed");
  return row.current_value;
}

async function accountChangeDirection(
  db: D1Database,
  organizationId: string,
  accountId: string,
  side: "debit" | "credit",
): Promise<"increase" | "decrease"> {
  const account = await getAccountById(db, organizationId, accountId);
  if (side === "debit") return account.normal_balance === "debit" ? "increase" : "decrease";
  return account.normal_balance === "credit" ? "increase" : "decrease";
}

function debit(
  account: AccountRow,
  amount: number,
  description: string,
  partyId?: string | null,
): JournalLineInput {
  return { accountId: account.id, debitMinor: amount, creditMinor: 0, description, partyId };
}

function credit(
  account: AccountRow,
  amount: number,
  description: string,
  partyId?: string | null,
): JournalLineInput {
  return { accountId: account.id, debitMinor: 0, creditMinor: amount, description, partyId };
}

function assertCashAccount(account: AccountRow | null, code: string): asserts account is AccountRow {
  if (!account) throw badRequest("cash_account_required", "Cash account is required");
  if (account.account_type !== "asset" || account.is_cash_account !== 1) {
    throw badRequest(code, "Cash account is invalid");
  }
}

function requiresCashAccount(type: TransactionType, paymentStatus: PaymentStatus): boolean {
  return [
    "cash_sale",
    "receive_receivable",
    "cash_purchase",
    "pay_payable",
    "expense_payment",
    "owner_capital",
    "owner_draw",
    "cash_transfer",
  ].includes(type) || (
    (type === "credit_sale" || type === "credit_purchase" || type === "sale_return" || type === "purchase_return")
    && paymentStatus !== "unpaid"
  );
}

function requiresParty(type: TransactionType): boolean {
  return ["credit_sale", "receive_receivable", "credit_purchase", "pay_payable", "sale_return", "purchase_return"].includes(type);
}

function partyTypeForTransaction(type: TransactionType): "customer" | "supplier" | "other" {
  if (type === "credit_sale" || type === "receive_receivable" || type === "sale_return") return "customer";
  if (type === "credit_purchase" || type === "pay_payable" || type === "purchase_return") return "supplier";
  return "other";
}

function normalizeTransactionType(type: string): TransactionType {
  if (!TRANSACTION_TYPES.has(type as TransactionType)) {
    throw badRequest("transaction_type_unsupported", "Transaction type is not supported");
  }
  return type as TransactionType;
}

function normalizeIdempotencyKey(input: string): string {
  const value = input.trim();
  if (value.length < 8 || value.length > 160) {
    throw badRequest("idempotency_key_required", "Idempotency key is required");
  }
  // Only allow URL-safe characters
  if (!/^[a-zA-Z0-9_-]{8,160}$/.test(value)) {
    throw badRequest("idempotency_key_invalid", "Idempotency key contains invalid characters");
  }
  return value;
}

function normalizeRequiredText(input: string, code: string): string {
  const value = input.trim();
  if (!value) throw badRequest(code, "Text is required");
  return value;
}

function nullableText(input: string | null | undefined): string | null {
  const value = input?.trim();
  return value || null;
}

function toMoneyMinor(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw badRequest("money_invalid", "Money value must be greater than zero");
  }
  if (!Number.isInteger(value)) {
    throw badRequest("money_not_integer", "Money value must be a whole number of rupiah");
  }
  return Math.round(value);
}

function toQuantityMilli(value: number | null | undefined): number {
  if (!Number.isFinite(value) || value === null || value === undefined || value <= 0) {
    throw badRequest("quantity_invalid", "Quantity must be greater than zero");
  }
  return Math.round(value * 1000);
}

function productCostMinor(product: ProductRow): number {
  return product.average_cost_minor || product.purchase_price_minor;
}

function nextAverageCostMinor(
  product: ProductRow,
  quantityMilli: number,
  unitCostMinor: number,
): number {
  const nextStockMilli = product.current_stock_milli + quantityMilli;
  if (nextStockMilli <= 0) return unitCostMinor;
  const currentValue = product.current_stock_milli * product.average_cost_minor;
  const addedValue = quantityMilli * unitCostMinor;
  return Math.round((currentValue + addedValue) / nextStockMilli);
}

function notesWithPartial(
  notes: string | null,
  partialAmountMinor: number | null,
  paymentStatus: PaymentStatus,
): string | null {
  if (paymentStatus !== "partial" || partialAmountMinor === null) return notes;
  const suffix = `Dibayar sebagian: ${formatIDRMinor(partialAmountMinor)}`;
  return notes ? `${notes}\n${suffix}` : suffix;
}

function msToIso(value: number | null): string | null {
  return value ? new Date(value).toISOString() : null;
}
