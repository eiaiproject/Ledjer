// Shared types for recurring transactions — used by both the frontend API
// client (apps/web/src/lib/api/recurring-transactions.ts) and the backend
// service (apps/web/worker/services/recurring-transactions.service.ts).
// Keeping them in one place prevents SonarCloud duplication warnings.

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

export interface UpdateRecurringInput {
  name?: string;
  amountMinor?: number;
  partyId?: string;
  cashAccountId?: string;
  debitAccountId?: string;
  description?: string;
  notes?: string;
  endDate?: string;
  postAsDraft?: boolean;
}

export interface RecurringOutput {
  id: string;
  organizationId: string;
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
