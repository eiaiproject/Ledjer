import type { QueryClient } from "@tanstack/react-query";

export const queryKeys = {
  dashboard: (userId: string | undefined) => ["dashboard", userId] as const,
  allDashboard: () => ["dashboard"] as const,
  dashboardSummary: (userId: string | undefined) => ["dashboard", userId, "summary"] as const,
  dashboardAlerts: (userId: string | undefined) => ["dashboard", userId, "alerts"] as const,

  reports: {
    profitLoss: (userId: string | undefined, fromDate: string, toDate: string) =>
      ["profit-loss", userId, fromDate, toDate] as const,
    balanceSheet: (userId: string | undefined, asOfDate: string) =>
      ["balance-sheet", userId, asOfDate] as const,
    generalLedger: (userId: string | undefined, fromDate: string, toDate: string, accountId?: string) =>
      ["general-ledger", userId, fromDate, toDate, accountId ?? ""] as const,
    allProfitLoss: () => ["profit-loss"] as const,
    allBalanceSheet: () => ["balance-sheet"] as const,
    allGeneralLedger: () => ["general-ledger"] as const,
  },

  accounts: {
    fullList: (userId: string) => ["accounts", userId, "list"] as const,
    all: (userId: string) => ["accounts", userId] as const,
  },

  products: {
    all: (userId: string | undefined) => ["products", userId] as const,
    page: (userId: string | undefined, params: Record<string, string | number>) =>
      ["products", userId, "page", params.search ?? "", params.status ?? "", params.stock ?? "", params.sort ?? "", params.limit ?? 0, params.offset ?? 0] as const,
    movements: (userId: string | undefined, productId: string) =>
      ["products", userId, productId, "movements"] as const,
    allProducts: () => ["products"] as const,
  },

  transactions: {
    all: () => ["transactions"] as const,
    list: (userId: string | undefined, ...filters: unknown[]) =>
      ["transactions", userId, ...filters] as const,
    detail: (id: string) => ["transaction", id] as const,
    allDetails: () => ["transaction"] as const,
  },
} as const;

/** Invalidate every cache key touched by a financial mutation. */
export function invalidateTransactionFinancialCaches(qc: QueryClient, userId = "") {
  const keys = [
    queryKeys.transactions.all(),
    queryKeys.allDashboard(),
    queryKeys.accounts.all(userId),
    queryKeys.products.allProducts(),
    queryKeys.reports.allProfitLoss(),
    queryKeys.reports.allBalanceSheet(),
    queryKeys.reports.allGeneralLedger(),
  ];
  keys.forEach((k) => qc.invalidateQueries({ queryKey: k, refetchType: "all" }));
  // Append-only kronologis: max-date ikut segar setiap tulis/void.
  qc.invalidateQueries({ queryKey: ["max-transaction-date"], refetchType: "all" });
}