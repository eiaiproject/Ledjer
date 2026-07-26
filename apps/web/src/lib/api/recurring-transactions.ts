import { apiRequest } from "./client";

export type TransactionType =
  | "cash_sale" | "credit_sale" | "receive_receivable"
  | "cash_purchase" | "credit_purchase" | "pay_payable"
  | "expense_payment" | "owner_capital" | "owner_draw" | "cash_transfer";

export type Frequency = "daily" | "weekly" | "monthly" | "yearly" | "custom_days";
export type RecurringStatus = "active" | "paused" | "completed" | "cancelled";
export type ExecStatus = "success" | "failed" | "skipped";

export interface CreateRecurringInput {
  name: string;
  transactionType: TransactionType;
  frequency: Frequency;
  intervalValue?: number;
  dayOfMonth?: number;
  dayOfWeek?: number;
  monthOfYear?: number;
  amountMinor: number;
  partyId?: string;
  cashAccountId?: string;
  debitAccountId?: string;
  description?: string;
  notes?: string;
  startDate: string;
  endDate?: string;
  postAsDraft?: boolean;
}

export interface RecurringOutput {
  id: string;
  name: string;
  transactionType: TransactionType;
  frequency: Frequency;
  intervalValue: number;
  dayOfMonth: number | null;
  dayOfWeek: number | null;
  monthOfYear: number | null;
  amountMinor: number;
  partyId: string | null;
  cashAccountId: string | null;
  debitAccountId: string | null;
  description: string;
  notes: string | null;
  startDate: string;
  endDate: string | null;
  nextExecutionDate: string | null;
  status: RecurringStatus;
  postAsDraft: boolean;
  executionCount: number;
  lastExecutedAt: number | null;
  skipNext: boolean;
  createdAt: number;
}

export interface ExecutionLogOutput {
  id: string;
  recurringTransactionId: string;
  scheduledDate: string;
  executedAt: number;
  transactionId: string | null;
  status: ExecStatus;
  errorMessage: string | null;
}

export function createRecurringTransaction(input: CreateRecurringInput): Promise<RecurringOutput> {
  return apiRequest<RecurringOutput>("/api/recurring-transactions", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function listRecurringTransactions(status?: RecurringStatus): Promise<RecurringOutput[]> {
  const params = status ? `?status=${status}` : "";
  return apiRequest<RecurringOutput[]>(`/api/recurring-transactions${params}`);
}

export function getRecurringTransaction(id: string): Promise<RecurringOutput> {
  return apiRequest<RecurringOutput>(`/api/recurring-transactions/${id}`);
}

export function updateRecurringTransaction(
  id: string,
  input: {
    name?: string; amountMinor?: number; partyId?: string;
    cashAccountId?: string; debitAccountId?: string;
    description?: string; notes?: string; endDate?: string; postAsDraft?: boolean;
  },
): Promise<RecurringOutput> {
  return apiRequest<RecurringOutput>(`/api/recurring-transactions/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function updateRecurringStatus(id: string, status: RecurringStatus): Promise<RecurringOutput> {
  return apiRequest<RecurringOutput>(`/api/recurring-transactions/${id}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}

export function skipNextOccurrence(id: string): Promise<RecurringOutput> {
  return apiRequest<RecurringOutput>(`/api/recurring-transactions/${id}/skip`, {
    method: "POST",
  });
}

export function executeRecurringTransaction(id: string): Promise<ExecutionLogOutput> {
  return apiRequest<ExecutionLogOutput>(`/api/recurring-transactions/${id}/execute`, {
    method: "POST",
  });
}

export function getExecutionLog(id: string, limit = 20): Promise<ExecutionLogOutput[]> {
  return apiRequest<ExecutionLogOutput[]>(`/api/recurring-transactions/${id}/logs?limit=${limit}`);
}
