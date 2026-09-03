import { apiRequest } from "./client";
import type { Transaction } from "./transactions";

export interface DashboardSummary {
  cashBankBalance: number;
  cashBankAccounts: { id: string; code: string; name: string; balance: number }[];
  month: { from: string; to: string };
  moneyIn: number;
  moneyOut: number;
  netIncome: number;
  recentTransactions: Transaction[];
}

interface DashboardSummaryResponse {
  summary: DashboardSummary;
}

export interface DashboardAlerts {
  negativeBalanceAccounts: { id: string; name: string; balance: number }[];
}

export function getDashboardSummary(): Promise<DashboardSummary> {
  return apiRequest<DashboardSummaryResponse>("/api/dashboard/summary").then(
    (data) => data.summary,
  );
}

export function getDashboardAlerts(): Promise<DashboardAlerts> {
  return apiRequest<DashboardAlerts>("/api/dashboard/alerts");
}