import { apiRequest } from "./client";
import type {
  CreateRecurringInput,
  RecurringOutput,
  ExecutionLogOutput,
  RecurringStatus,
} from "../../../worker/shared/recurring-transactions.types";

export type {
  TransactionType,
  Frequency,
  RecurringStatus,
  ExecStatus,
  CreateRecurringInput,
  RecurringOutput,
  ExecutionLogOutput,
} from "../../../worker/shared/recurring-transactions.types";

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
