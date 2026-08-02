import { apiRequest } from "./client";

export type TransactionStatus = "draft" | "posted" | "voided" | "reversed";
export type PaymentStatus = "paid" | "unpaid" | "partial";

export interface Transaction {
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
  status: TransactionStatus;
  posted_at: string | null;
  voided_at: string | null;
  void_reason: string | null;
  created_by: string;
  parties?: { name: string } | null;
  created_by_profile?: { full_name: string } | null;
}

export interface JournalLine {
  id: string;
  account_id: string;
  debit: number;
  credit: number;
  description: string;
  accounts?: { code: number; name: string };
}

export interface JournalEntry {
  id: string;
  entry_number: string;
  entry_date: string;
  entry_type: string;
  description: string;
  status: string;
  journal_lines: JournalLine[];
}

export interface TransactionListFilters {
  search?: string;
  transactionType?: string;
  status?: string;
  fromDate?: string;
  toDate?: string;
  limit?: number;
  offset?: number;
}

export interface PostTransactionInput {
  transactionDate: string;
  transactionType: string;
  amount: number;
  partyName?: string;
  categoryName?: string;
  cashAccountId?: string;
  destinationCashAccountId?: string;
  paymentStatus: PaymentStatus;
  partialAmount?: number;
  dueDate?: string;
  description: string;
  notes?: string;
  productId?: string;
  productName?: string;
  quantity?: number;
  unitPrice?: number;
  debitAccountId?: string;
  originalTransactionId?: string | null;
  idempotencyKey: string;
}

export interface PostTransactionResult {
  transaction_id: string;
  transaction_number: string;
  journal_entry_id: string;
  entry_number: string;
  impact: {
    debit_account_id: string;
    debit_account: string;
    debit_change: "increase" | "decrease";
    credit_account_id: string;
    credit_account: string;
    credit_change: "increase" | "decrease";
    amount: number;
  };
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

interface TransactionsResponse {
  transactions: Transaction[];
}

interface TransactionResponse {
  transaction: Transaction;
}

interface JournalEntriesResponse {
  journalEntries: JournalEntry[];
}

export function listTransactions(filters: TransactionListFilters): Promise<Transaction[]> {
  const params = new URLSearchParams();
  if (filters.search) params.set("search", filters.search);
  if (filters.transactionType) params.set("transactionType", filters.transactionType);
  if (filters.status) params.set("status", filters.status);
  if (filters.fromDate) params.set("fromDate", filters.fromDate);
  if (filters.toDate) params.set("toDate", filters.toDate);
  if (filters.limit !== undefined) params.set("limit", String(filters.limit));
  if (filters.offset !== undefined) params.set("offset", String(filters.offset));
  const query = params.toString();
  const path = query ? `/api/transactions?${query}` : "/api/transactions";
  return apiRequest<TransactionsResponse>(path).then(
    (data) => data.transactions,
  );
}

export function getTransaction(transactionId: string): Promise<Transaction> {
  return apiRequest<TransactionResponse>(`/api/transactions/${transactionId}`).then(
    (data) => data.transaction,
  );
}

export function listTransactionJournal(transactionId: string): Promise<JournalEntry[]> {
  return apiRequest<JournalEntriesResponse>(`/api/transactions/${transactionId}/journal`).then(
    (data) => data.journalEntries,
  );
}

export function postTransaction(input: PostTransactionInput): Promise<PostTransactionResult> {
  return apiRequest<PostTransactionResult>("/api/transactions", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function voidTransaction(
  transactionId: string,
  reason: string,
  idempotencyKey: string,
): Promise<VoidTransactionResult> {
  return apiRequest<VoidTransactionResult>(`/api/transactions/${transactionId}/void`, {
    method: "POST",
    body: JSON.stringify({ reason, idempotencyKey }),
  });
}

export function settleTransaction(
  transactionId: string,
  cashAccountId: string,
  idempotencyKey: string,
): Promise<SettleTransactionResult> {
  return apiRequest<SettleTransactionResult>(`/api/transactions/${transactionId}/settle`, {
    method: "POST",
    body: JSON.stringify({ cashAccountId, idempotencyKey }),
  });
}
