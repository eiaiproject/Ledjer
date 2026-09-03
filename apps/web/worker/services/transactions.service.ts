import { execute, executeBatch, queryAll, queryFirst, statement, type D1Input } from "../db/client";
import { badRequest, conflict, notFound } from "../http/errors";
import { writeAuditStatement } from "../http/audit";
import { normalizeDate } from "../http/date";
import type { TransactionType, TransactionStatus } from "../db/schema";
import { getAccount, isCashBankAccount, type AccountRow } from "./accounts.service";

export type TransactionDirection = "in" | "out" | "neutral";

export interface PostTransactionInput {
  transactionType: TransactionType;
  transactionDate: string;
  cashAccountId: string;
  counterAccountId: string;
  amountIdr: number;
  description: string;
  idempotencyKey: string;
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
]);

export const TRANSACTION_LABELS: Record<TransactionType, string> = {
  cash_in: "Uang Masuk",
  cash_out: "Uang Keluar",
  transfer: "Transfer",
  owner_deposit: "Modal Masuk",
  owner_withdrawal: "Pengambilan Pemilik",
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
  const existing = await getTransactionByIdempotencyKey(db, organizationId, normalizedKey);
  if (existing) {
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

  const type = normalizeTransactionType(input.transactionType);
  const transactionDate = normalizeDate(input.transactionDate, "transaction_date_invalid");
  await assertDateNotFuture(transactionDate);
  const amountIdr = toIdr(input.amountIdr);
  const description = normalizeRequiredText(input.description, 200, "transaction_description_required");
  const current = Date.now();

  const cashAccount = await getAccount(db, organizationId, input.cashAccountId);
  const counterAccount = await getAccount(db, organizationId, input.counterAccountId);
  await validateTransaction(type, cashAccount, counterAccount);

  const { debitAccount, creditAccount } = resolveJournalAccounts(type, cashAccount!, counterAccount!);

  const lines: JournalLineInput[] = [
    { accountId: debitAccount.id, debitIdr: amountIdr, creditIdr: 0 },
    { accountId: creditAccount.id, debitIdr: 0, creditIdr: amountIdr },
  ];
  assertJournalBalanced(lines);

  const transactionId = crypto.randomUUID();
  const journalEntryId = crypto.randomUUID();
  const transactionNumber = await generateTransactionNumber(db, transactionDate);

  const statements: D1PreparedStatement[] = [
    statement(
      db,
      `INSERT INTO transactions (
         id, organization_id, transaction_number, transaction_type, transaction_date,
         description, status, amount_idr, cash_account_id, counter_account_id,
         idempotency_key, created_by, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, 'posted', ?, ?, ?, ?, ?, ?, ?)`,
      [
        transactionId, organizationId, transactionNumber, type, transactionDate,
        description, amountIdr, cashAccount!.id, counterAccount!.id,
        normalizedKey, userId, current, current,
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

  await executeBatch(db, statements);

  return { transaction_id: transactionId, transaction_number: transactionNumber, journal_entry_id: journalEntryId, status: "posted" };
}

export async function listTransactions(
  db: D1Database,
  organizationId: string,
  filters: TransactionFilters = {},
): Promise<PublicTransaction[]> {
  const conditions = ["t.organization_id = ?"];
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

  return rows.map(toPublicTransaction);
}

export async function countTransactions(
  db: D1Database,
  organizationId: string,
  filters: Omit<TransactionFilters, "limit" | "offset"> = {},
): Promise<number> {
  const conditions = ["organization_id = ?"];
  const values: D1Input[] = [organizationId];

  if (filters.fromDate) {
    conditions.push("transaction_date >= ?");
    values.push(filters.fromDate);
  }
  if (filters.toDate) {
    conditions.push("transaction_date <= ?");
    values.push(filters.toDate);
  }
  if (filters.transactionType) {
    conditions.push("transaction_type = ?");
    values.push(filters.transactionType);
  }
  if (filters.status) {
    conditions.push("status = ?");
    values.push(filters.status);
  }
  if (filters.search) {
    const search = `%${filters.search.toLowerCase()}%`;
    conditions.push("(lower(description) LIKE ? OR lower(transaction_number) LIKE ?)");
    values.push(search, search);
  }

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
  return toPublicTransaction(row);
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

  await execute(
    db,
    `UPDATE transactions SET status = 'voided', voided_at = ?, void_reason = ?, updated_at = ?
     WHERE id = ? AND organization_id = ? AND status = 'posted'`,
    [current, reason, current, transactionId, organizationId],
  );

  await writeAuditStatement(db, {
    organizationId,
    actorUserId: userId,
    entityType: "transaction",
    entityId: transactionId,
    action: "transaction_voided",
    after: { transaction_number: existing.transaction_number, void_reason: reason },
    reason: reason ?? undefined,
    requestId,
    current,
  });

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
  if (!counterAccount || counterAccount.is_active !== 1) {
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
  if (!Number.isFinite(amount) || amount <= 0) {
    throw badRequest("invalid_amount", "Nominal harus lebih dari 0.");
  }
  const rounded = Math.round(amount);
  if (rounded > 999_999_999_999) {
    throw badRequest("invalid_amount", "Nominal terlalu besar.");
  }
  return rounded;
}

function normalizeRequiredText(value: string, maxLength: number, code: string): string {
  const text = value.trim();
  if (!text) throw badRequest(code, "Keterangan harus diisi.");
  if (text.length > maxLength) throw badRequest(code, `Keterangan maksimal ${maxLength} karakter.`);
  return text;
}

/** TRX-YYYYMMDD-XXXX — unique human-readable, not strictly sequential (PRD TRX-08). */
export async function generateTransactionNumber(db: D1Database, date: string): Promise<string> {
  const base = `TRX-${date.replace(/-/g, "")}-`;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const suffix = randomSuffix(4);
    const number = `${base}${suffix}`;
    const existing = await queryFirst<{ id: string }>(
      db,
      "SELECT id FROM transactions WHERE transaction_number = ?",
      [number],
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

async function getTransactionByIdempotencyKey(
  db: D1Database,
  organizationId: string,
  idempotencyKey: string,
): Promise<{ id: string; transaction_number: string } | null> {
  return queryFirst<{ id: string; transaction_number: string }>(
    db,
    "SELECT id, transaction_number FROM transactions WHERE organization_id = ? AND idempotency_key = ?",
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

function toPublicTransaction(row: TransactionRow): PublicTransaction {
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
  };
}