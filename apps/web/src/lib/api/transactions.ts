import { apiRequest } from "./client";

export type TransactionType = "cash_in" | "cash_out" | "transfer" | "owner_deposit" | "owner_withdrawal";
export type TransactionStatus = "posted" | "voided";
export type TransactionDirection = "in" | "out" | "neutral";

export interface Transaction {
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
  transactionType: TransactionType;
  transactionDate: string;
  cashAccountId: string;
  counterAccountId: string;
  amountIdr: number;
  description: string;
  idempotencyKey: string;
}

export interface PostTransactionResult {
  transaction_id: string;
  transaction_number: string;
  journal_entry_id: string;
  status: "posted";
  replayed?: boolean;
}

interface TransactionsResponse {
  transactions: Transaction[];
  total: number;
}

interface TransactionResponse {
  transaction: Transaction;
}

export function listTransactions(filters: TransactionListFilters): Promise<TransactionsResponse> {
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
  return apiRequest<TransactionsResponse>(path);
}

export function getTransaction(transactionId: string): Promise<Transaction> {
  return apiRequest<TransactionResponse>(`/api/transactions/${transactionId}`).then(
    (data) => data.transaction,
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
  reason: string | null,
): Promise<{ transaction: Transaction }> {
  return apiRequest<{ transaction: Transaction }>(`/api/transactions/${transactionId}/void`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}