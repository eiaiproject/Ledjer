/**
 * Central React Query key factory.
 * Prevents cache key collisions by giving distinct data shapes distinct keys.
 *
 * Usage:
 *   import { queryKeys } from "@/lib/query-keys";
 *   useQuery({ queryKey: queryKeys.accounts.fullList(orgId), ... })
 */

export const queryKeys = {
  invoices: {
    all: () => ["invoices"] as const,
    list: (offset: number, limit: number) => ["invoices", "list", offset, limit] as const,
    detail: (id: string) => ["invoices", id] as const,
  },

  organization: (userId: string | undefined) => ["organization", userId] as const,
  allOrganization: () => ["organization"] as const,

  dashboard: (orgId: string | undefined) => ["dashboard", orgId] as const,
  allDashboard: () => ["dashboard"] as const,

  profile: (userId: string | undefined) => ["profile", userId] as const,

  orgMembers: {
    list: (orgId: string | undefined) => ["org-members", orgId] as const,
    all: () => ["org-members"] as const,
  },

  invitations: {
    list: (orgId: string | undefined) => ["invitations", orgId] as const,
    all: () => ["invitations"] as const,
  },

  reports: {
    balanceSheet: (orgId: string | undefined, asOfDate: string) => ["balance-sheet", orgId, asOfDate] as const,
    generalLedger: (orgId: string | undefined, accountId: string | undefined, fromDate: string, toDate: string) =>
      ["general-ledger", orgId, accountId, fromDate, toDate] as const,
    profitLoss: (orgId: string | undefined, fromDate: string, toDate: string) => ["profit-loss", orgId, fromDate, toDate] as const,
    trialBalance: (orgId: string | undefined, toDate: string) => ["trial-balance", orgId, toDate] as const,
    allBalanceSheet: () => ["balance-sheet"] as const,
    allProfitLoss: () => ["profit-loss"] as const,
    allTrialBalance: () => ["trial-balance"] as const,
    allGeneralLedger: () => ["general-ledger"] as const,
    cashFlow: (fromDate: string, toDate: string) => ["cash-flow", fromDate, toDate] as const,
    allCashFlow: () => ["cash-flow"] as const,
  },

  accounts: {
    /** Full account list (accounts page, CoA). */
    fullList: (orgId: string) => ["accounts", orgId, "list"] as const,
    /** Cash/bank accounts filtered for transaction form. */
    activeTransactionOptions: (orgId: string) => ["accounts", orgId, "txn-options"] as const,
    /** Expense + COGS accounts for CoA dropdown. */
    expenseCogsOptions: (orgId: string) => ["accounts", orgId, "expense-cogs"] as const,
    /** Accounts in ledger reports. */
    ledgerOptions: (orgId: string) => ["accounts", orgId, "ledger"] as const,
    /** Wildcard prefix for invalidating all account queries. */
    all: (orgId: string) => ["accounts", orgId] as const,
  },

  products: {
    /** Full product list (products page). */
    fullList: (orgId: string) => ["products", orgId, "list"] as const,
    /** Products filtered for transaction form. */
    transactionOptions: (orgId: string) => ["products", orgId, "txn-options"] as const,
    /** Wildcard prefix for invalidating all product queries. */
    all: (orgId: string) => ["products", orgId] as const,
  },

  parties: {
    /** Full list for invoices / new transaction. */
    fullList: (orgId: string) => ["parties", orgId, "list"] as const,
    /** Parties for transaction form. */
    transactionOptions: (orgId: string) => ["parties", orgId, "txn-options"] as const,
    /** Wildcard prefix for invalidating all party queries. */
    all: (orgId: string) => ["parties", orgId] as const,
  },

  transactions: {
    all: () => ["transactions"] as const,
    list: (orgId: string | undefined, ...filters: unknown[]) =>
      ["transactions", orgId, ...filters] as const,
    detail: (id: string) => ["transaction", id] as const,
    allDetails: () => ["transaction"] as const,
  },

  journalEntries: {
    detail: (id: string) => ["journal-entries", id] as const,
    all: () => ["journal-entries"] as const,
  },

  onboarding: {
    status: (orgId: string | undefined) => ["onboarding", orgId, "status"] as const,
    all: () => ["onboarding"] as const,
  },

  notifications: {
    all: () => ["notifications"] as const,
    list: (unreadOnly?: boolean) => ["notifications", "list", unreadOnly ?? false] as const,
    unreadCount: () => ["notifications", "unread-count"] as const,
  },

  recurringTransactions: {
    all: () => ["recurring-transactions"] as const,
    list: (status?: string) => ["recurring-transactions", "list", status ?? "all"] as const,
    detail: (id: string) => ["recurring-transactions", id] as const,
    logs: (id: string) => ["recurring-transactions", id, "logs"] as const,
  },

  documents: {
    all: () => ["documents"] as const,
    list: (type?: string) => ["documents", "list", type ?? "all"] as const,
    detail: (id: string) => ["documents", id] as const,
  },

  periodLocks: {
    list: (orgId: string | undefined) => ["period-locks", orgId] as const,
    all: () => ["period-locks"] as const,
  },

  approvals: {
    all: () => ["approvals"] as const,
    list: (status?: string, actionType?: string) => ["approvals", "list", status ?? "", actionType ?? ""] as const,
    configs: () => ["approvals", "configs"] as const,
    pendingCount: () => ["approvals", "pending-count"] as const,
  },

  journals: {
    all: () => ["journal-templates"] as const,
    templates: (entryType?: string) => ["journal-templates", entryType ?? "all"] as const,
  },

} as const;

/**
 * Invalidates every cache key touched by posting, editing, or voiding a
 * transaction (dashboard, accounts, products, parties, reports).
 * Use after any successful financial mutation so dependent screens do not show
 * stale balances. Does NOT touch transaction detail caches — callers should
 * also invalidate `queryKeys.transactions.detail(id)` and
 * `queryKeys.journalEntries.detail(id)` for the specific record being mutated.
 */
import type { QueryClient } from "@tanstack/react-query";

export function invalidateTransactionFinancialCaches(
  qc: QueryClient,
  orgId = "",
) {
  const keys = [
    queryKeys.transactions.all(),
    queryKeys.allDashboard(),
    queryKeys.accounts.all(orgId),
    queryKeys.products.all(orgId),
    queryKeys.parties.all(orgId),
    queryKeys.reports.allTrialBalance(),
    queryKeys.reports.allProfitLoss(),
    queryKeys.reports.allBalanceSheet(),
    queryKeys.reports.allGeneralLedger(),
    queryKeys.reports.allCashFlow(),
  ];
  keys.forEach((k) => qc.invalidateQueries({ queryKey: k }));
}
