/**
 * Central React Query key factory.
 * Prevents cache key collisions by giving distinct data shapes distinct keys.
 *
 * Usage:
 *   import { queryKeys } from "@/lib/query-keys";
 *   useQuery({ queryKey: queryKeys.accounts.fullList(orgId), ... })
 */

export const queryKeys = {
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

  monthlyUsage: (orgId: string) => ["monthly-usage", orgId] as const,
  allMonthlyUsage: () => ["monthly-usage"] as const,
} as const;
