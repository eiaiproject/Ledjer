import { generateId } from "../auth/tokens";
import {
  executeBatch,
  queryAll,
  queryFirst,
  statement,
  type D1Input,
} from "../db/client";
import type { AccountType, NormalBalance } from "../db/schema";
import { badRequest, conflict, notFound } from "../http/errors";

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
  | "cash_transfer";

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
}

export interface VoidTransactionResult {
  original_transaction_id: string;
  reversal_transaction_id: string;
  reversal_journal_entry_ids: string[];
  status: "voided";
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
]);

export async function listTransactions(
  db: D1Database,
  organizationId: string,
  filters: TransactionFilters = {},
): Promise<PublicTransaction[]> {
  const conditions = [
    "t.organization_id = ?",
    "t.original_transaction_id IS NULL",
    "t.transaction_type NOT LIKE 'opening_%'",
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

export async function postTransaction(
  db: D1Database,
  organizationId: string,
  userId: string,
  input: PostTransactionInput,
  requestId?: string,
): Promise<PostTransactionResult> {
  const idempotencyKey = normalizeIdempotencyKey(input.idempotencyKey);
  const existing = await getTransactionByIdempotencyKey(db, organizationId, idempotencyKey);
  if (existing) return buildPostResult(db, organizationId, existing.id);

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

  const partyId = await resolveParty(db, organizationId, transactionType, {
    partyId: input.partyId,
    partyName: input.partyName,
    current,
  });

  const cashAccount = await resolveOptionalAccount(db, organizationId, input.cashAccountId);
  const destinationCashAccount = await resolveOptionalAccount(db, organizationId, input.destinationCashAccountId);

  const { product, quantityMilli, unitPriceMinor } = await resolveProductFields(db, organizationId, input);
  if (product && quantityMilli !== null && unitPriceMinor !== null) {
    validateProductIntent(transactionType, product, quantityMilli, unitPriceMinor, amountMinor);
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
    partialAmountMinor,
    paymentStatus,
    debitAccount: resolved.debitAccount,
    creditAccount: resolved.creditAccount,
    cashAccount,
    partyId,
    description,
    product,
    quantityMilli,
  });
  assertJournalBalanced(journalLines);

  const transactionId = generateId();
  const journalEntryId = generateId();
  const transactionNumber = await generateTransactionNumber(db, organizationId, transactionDate);
  const entryNumber = await generateEntryNumber(db, organizationId);
  const categoryName = resolved.categoryName ?? nullableText(input.categoryName);
  const statements: D1PreparedStatement[] = [
    statement(
      db,
      `INSERT INTO transactions (
         id, organization_id, transaction_number, transaction_date,
         transaction_type, amount_minor, party_id, category_name,
         cash_account_id, destination_cash_account_id, payment_status, due_date,
         description, notes, status, idempotency_key, posted_at, posted_by,
         created_by, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'posted', ?, ?, ?, ?, ?, ?)`,
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
        notesWithPartial(notes, partialAmountMinor, paymentStatus),
        idempotencyKey,
        current,
        userId,
        userId,
        current,
        current,
      ],
    ),
    statement(
      db,
      `INSERT INTO journal_entries (
         id, organization_id, entry_number, entry_date, entry_type,
         transaction_id, description, status, posted_at, posted_by, created_at
       ) VALUES (?, ?, ?, ?, 'normal', ?, ?, 'posted', ?, ?, ?)`,
      [
        journalEntryId,
        organizationId,
        entryNumber,
        transactionDate,
        transactionId,
        description,
        current,
        userId,
        current,
      ],
    ),
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

  appendPostStockStatements(db, statements, product, quantityMilli, unitPriceMinor, {
    organizationId, transactionId, transactionType, movementDate: transactionDate, userId, notes: description, current,
  });

  statements.push(
    insertAuditStatement(db, {
      organizationId,
      actorUserId: userId,
      entityId: transactionId,
      action: "post",
      after: {
        transaction_type: transactionType,
        amount: amountMinor,
        journal_entry_id: journalEntryId,
        product_id: product?.id ?? null,
      },
      reason: null,
      requestId,
      current,
    }),
  );

  await executeBatch(db, statements);
  return buildPostResult(db, organizationId, transactionId);
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
    : new Date().toISOString().slice(0, 10);
  await assertPeriodOpen(db, organizationId, original.transaction_date);
  await assertPeriodOpen(db, organizationId, voidDate);

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
  const statements: D1PreparedStatement[] = [
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
        reversalTransactionId,
        organizationId,
        reversalTransactionNumber,
        voidDate,
        original.transaction_type,
        original.amount_minor,
        original.party_id,
        original.category_name,
        original.cash_account_id,
        original.destination_cash_account_id,
        original.payment_status,
        original.due_date,
        `Pembatalan: ${original.description}`,
        reason,
        idempotencyKey,
        current,
        userId,
        transactionId,
        userId,
        current,
        current,
      ],
    ),
    statement(
      db,
      `INSERT INTO journal_entries (
         id, organization_id, entry_number, entry_date, entry_type,
         transaction_id, description, status, reversed_entry_id, reversal_reason,
         posted_at, posted_by, created_at
       ) VALUES (?, ?, ?, ?, 'reversal', ?, ?, 'posted', ?, ?, ?, ?, ?)`,
      [
        reversalJournalEntryId,
        organizationId,
        reversalEntryNumber,
        voidDate,
        reversalTransactionId,
        `Pembatalan: ${original.description}`,
        originalJournalLines[0]?.journal_entry_id ?? null,
        reason,
        current,
        userId,
        current,
      ],
    ),
    ...originalJournalLines.map((line, index) => insertJournalLineStatement(
      db,
      organizationId,
      reversalJournalEntryId,
      {
        accountId: line.account_id,
        debitMinor: line.credit_minor,
        creditMinor: line.debit_minor,
        description: `Reversal: ${line.description}`,
      },
      index + 1,
      current,
    )),
  ];

  if (product && productLine?.quantity_milli) {
    appendVoidStockStatements(db, statements, {
      organizationId,
      transactionId: reversalTransactionId,
      originalType: original.transaction_type,
      product,
      quantityMilli: productLine.quantity_milli,
      unitCostMinor: stockMovement?.unit_cost_minor ?? productLine.unit_price_minor ?? product.average_cost_minor,
      movementDate: voidDate,
      userId,
      notes: reason,
      current,
    });
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
    insertAuditStatement(db, {
      organizationId,
      actorUserId: userId,
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

  await executeBatch(db, statements);

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

function appendStockStatements(
  db: D1Database,
  statements: D1PreparedStatement[],
  input: {
    organizationId: string;
    transactionId: string;
    product: ProductRow;
    transactionType: TransactionType;
    quantityMilli: number;
    unitPriceMinor: number;
    movementDate: string;
    userId: string;
    notes: string;
    current: number;
  },
): void {
  if (input.transactionType !== "cash_purchase"
    && input.transactionType !== "credit_purchase"
    && input.transactionType !== "cash_sale"
    && input.transactionType !== "credit_sale") {
    return;
  }

  const isPurchase = input.transactionType === "cash_purchase"
    || input.transactionType === "credit_purchase";
  const quantityDelta = isPurchase ? input.quantityMilli : -input.quantityMilli;
  const nextStock = input.product.current_stock_milli + quantityDelta;
  if (nextStock < 0) throw conflict("insufficient_stock", "Insufficient stock");

  const unitCost = isPurchase ? input.unitPriceMinor : productCostMinor(input.product);
  if (!isPurchase && unitCost <= 0) {
    throw badRequest("product_zero_cost", "Product cost must be set before sale");
  }
  const nextAverage = isPurchase
    ? nextAverageCostMinor(input.product, input.quantityMilli, input.unitPriceMinor)
    : input.product.average_cost_minor;

  statements.push(
    statement(
      db,
      `UPDATE products
       SET current_stock_milli = ?,
           average_cost_minor = ?,
           purchase_price_minor = ?,
           updated_at = ?
       WHERE id = ? AND organization_id = ?`,
      [
        nextStock,
        nextAverage,
        nextAverage,
        input.current,
        input.product.id,
        input.organizationId,
      ],
    ),
    insertStockMovementStatement(db, {
      organizationId: input.organizationId,
      productId: input.product.id,
      transactionId: input.transactionId,
      movementDate: input.movementDate,
      movementType: isPurchase ? "purchase" : "sale",
      quantityMilli: quantityDelta,
      unitCostMinor: unitCost,
      stockAfterMilli: nextStock,
      notes: input.notes,
      userId: input.userId,
      current: input.current,
    }),
  );
}

function appendVoidStockStatements(
  db: D1Database,
  statements: D1PreparedStatement[],
  input: {
    organizationId: string;
    transactionId: string;
    originalType: string;
    product: ProductRow;
    quantityMilli: number;
    unitCostMinor: number;
    movementDate: string;
    userId: string;
    notes: string;
    current: number;
  },
): void {
  const isSale = input.originalType === "cash_sale" || input.originalType === "credit_sale";
  const isPurchase = input.originalType === "cash_purchase" || input.originalType === "credit_purchase";
  if (!isSale && !isPurchase) return;

  const quantityDelta = isSale ? input.quantityMilli : -input.quantityMilli;
  const nextStock = input.product.current_stock_milli + quantityDelta;
  if (nextStock < 0) throw conflict("insufficient_stock", "Insufficient stock");
  const nextAverage = nextStock === 0 ? 0 : input.product.average_cost_minor;

  statements.push(
    statement(
      db,
      `UPDATE products
       SET current_stock_milli = ?,
           average_cost_minor = ?,
           purchase_price_minor = ?,
           updated_at = ?
       WHERE id = ? AND organization_id = ?`,
      [
        nextStock,
        nextAverage,
        nextAverage,
        input.current,
        input.product.id,
        input.organizationId,
      ],
    ),
    insertStockMovementStatement(db, {
      organizationId: input.organizationId,
      productId: input.product.id,
      transactionId: input.transactionId,
      movementDate: input.movementDate,
      movementType: "void",
      quantityMilli: quantityDelta,
      unitCostMinor: input.unitCostMinor,
      stockAfterMilli: nextStock,
      notes: input.notes,
      userId: input.userId,
      current: input.current,
    }),
  );
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

function appendPostStockStatements(
  db: D1Database,
  statements: D1PreparedStatement[],
  product: ProductRow | null,
  quantityMilli: number | null,
  unitPriceMinor: number | null,
  input: {
    organizationId: string;
    transactionId: string;
    transactionType: TransactionType;
    movementDate: string;
    userId: string;
    notes: string;
    current: number;
  },
): void {
  if (!product || quantityMilli === null || unitPriceMinor === null) return;
  appendStockStatements(db, statements, { ...input, product, quantityMilli, unitPriceMinor });
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
  if (!["cash_purchase", "credit_purchase", "cash_sale", "credit_sale"].includes(transactionType)) {
    throw badRequest("product_transaction_invalid", "Products can only be used for sales or purchases");
  }
  if (quantityMilli <= 0) throw badRequest("quantity_invalid", "Product quantity must be greater than zero");
  if (unitPriceMinor < 0) throw badRequest("money_invalid", "Unit price is invalid");
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

function insertAuditStatement(
  db: D1Database,
  input: {
    organizationId: string;
    actorUserId: string;
    entityId: string;
    action: string;
    before?: unknown;
    after?: unknown;
    reason: string | null;
    requestId?: string;
    current: number;
  },
): D1PreparedStatement {
  return statement(
    db,
    `INSERT INTO audit_logs (
       id, organization_id, actor_user_id, entity_type, entity_id, action,
       before_json, after_json, reason, request_id, created_at
     ) VALUES (?, ?, ?, 'transaction', ?, ?, ?, ?, ?, ?, ?)`,
    [
      generateId(),
      input.organizationId,
      input.actorUserId,
      input.entityId,
      input.action,
      input.before ? JSON.stringify(input.before) : null,
      input.after ? JSON.stringify(input.after) : null,
      input.reason,
      input.requestId,
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
    (type === "credit_sale" || type === "credit_purchase")
    && paymentStatus !== "unpaid"
  );
}

function requiresParty(type: TransactionType): boolean {
  return ["credit_sale", "receive_receivable", "credit_purchase", "pay_payable"].includes(type);
}

function partyTypeForTransaction(type: TransactionType): "customer" | "supplier" | "other" {
  if (type === "credit_sale" || type === "receive_receivable") return "customer";
  if (type === "credit_purchase" || type === "pay_payable") return "supplier";
  return "other";
}

function normalizeTransactionType(type: string): TransactionType {
  if (!TRANSACTION_TYPES.has(type as TransactionType)) {
    throw badRequest("transaction_type_unsupported", "Transaction type is not supported");
  }
  return type as TransactionType;
}

function normalizeDate(input: string, code: string): string {
  const value = input.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw badRequest(code, "Date must use YYYY-MM-DD format");
  }
  return value;
}

function normalizeIdempotencyKey(input: string): string {
  const value = input.trim();
  if (value.length < 8 || value.length > 160) {
    throw badRequest("idempotency_key_required", "Idempotency key is required");
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
  const suffix = `Dibayar sebagian: ${partialAmountMinor}`;
  return notes ? `${notes}\n${suffix}` : suffix;
}

function msToIso(value: number | null): string | null {
  return value ? new Date(value).toISOString() : null;
}
