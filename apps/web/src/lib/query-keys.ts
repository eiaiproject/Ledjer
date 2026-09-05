import type { QueryClient } from "@tanstack/react-query";

export const queryKeys = {
  organization: (userId: string | undefined) => ["organization", userId] as const,
  allOrganization: () => ["organization"] as const,

  dashboard: (orgId: string | undefined) => ["dashboard", orgId] as const,
  allDashboard: () => ["dashboard"] as const,
  dashboardSummary: (orgId: string | undefined) => ["dashboard", orgId, "summary"] as const,
  dashboardAlerts: (orgId: string | undefined) => ["dashboard", orgId, "alerts"] as const,

  reports: {
    profitLoss: (orgId: string | undefined, fromDate: string, toDate: string) =>
      ["profit-loss", orgId, fromDate, toDate] as const,
    balanceSheet: (orgId: string | undefined, asOfDate: string) =>
      ["balance-sheet", orgId, asOfDate] as const,
    generalLedger: (orgId: string | undefined, fromDate: string, toDate: string, accountId?: string) =>
      ["general-ledger", orgId, fromDate, toDate, accountId ?? ""] as const,
    allProfitLoss: () => ["profit-loss"] as const,
    allBalanceSheet: () => ["balance-sheet"] as const,
    allGeneralLedger: () => ["general-ledger"] as const,
  },

  accounts: {
    fullList: (orgId: string) => ["accounts", orgId, "list"] as const,
    all: (orgId: string) => ["accounts", orgId] as const,
  },

  transactions: {
    all: () => ["transactions"] as const,
    list: (orgId: string | undefined, ...filters: unknown[]) =>
      ["transactions", orgId, ...filters] as const,
    detail: (id: string) => ["transaction", id] as const,
    allDetails: () => ["transaction"] as const,
  },
} as const;

/** Invalidate every cache key touched by a financial mutation. */
export function invalidateTransactionFinancialCaches(qc: QueryClient, orgId = "") {
  const keys = [
    queryKeys.transactions.all(),
    queryKeys.allDashboard(),
    queryKeys.accounts.all(orgId),
    queryKeys.reports.allProfitLoss(),
    queryKeys.reports.allBalanceSheet(),
    queryKeys.reports.allGeneralLedger(),
  ];
  keys.forEach((k) => qc.invalidateQueries({ queryKey: k, refetchType: "all" }));
}