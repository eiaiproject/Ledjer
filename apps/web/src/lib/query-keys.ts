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
    list: (orgId: string, filters: Record<string, unknown>) =>
      ["transactions", orgId, filters] as const,
  },

  monthlyUsage: (orgId: string) => ["monthly-usage", orgId] as const,
} as const;
