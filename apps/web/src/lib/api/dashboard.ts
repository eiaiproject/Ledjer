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

export interface DashboardAlert {
  id: string;
  type: "overdue_receivable" | "upcoming_payable" | "low_stock" | "draft_transaction" | "unreconciled_statement" | "unclosed_period";
  severity: "high" | "medium" | "low";
  title: string;
  description: string;
  count: number;
  actionLabel: string;
  actionPath: string;
}

export interface DashboardAlerts {
  alerts: DashboardAlert[];
}

export function getDashboardSummary(): Promise<DashboardSummary> {
  return apiRequest<DashboardSummaryResponse>("/api/dashboard/summary").then(
    (data) => data.summary,
  );
}

export function getDashboardAlerts(): Promise<DashboardAlerts> {
  return apiRequest<DashboardAlerts>("/api/dashboard/alerts");
}
