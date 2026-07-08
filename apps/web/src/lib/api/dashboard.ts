import { apiRequest } from "./client";

export interface DashboardSummary {
  cash_balance: number;
  revenue_current_period: number;
  expense_current_period: number;
  net_profit_current_period: number;
  accounts_receivable: number;
  accounts_payable: number;
  period_from: string;
  period_to: string;
}

interface DashboardSummaryResponse {
  summary: DashboardSummary;
}

export function getDashboardSummary(): Promise<DashboardSummary> {
  return apiRequest<DashboardSummaryResponse>("/api/dashboard/summary").then(
    (data) => data.summary,
  );
}
