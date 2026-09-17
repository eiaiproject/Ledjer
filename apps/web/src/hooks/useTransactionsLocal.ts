/**
 * useTransactionsLocal — local-first transactions & stock movements.
 * Wraps repos/transactions.repo.ts with React Query.
 */

import { useQuery } from "@tanstack/react-query";
import { useBook } from "@/hooks/useBook";
import { useLocalDb } from "@/lib/db/provider";
import { getTransactions, getStockMovementsForTransactions } from "@/lib/db/repos";
import type { Transaction, StockMovement, TransactionType, TransactionStatus } from "@/lib/accounting/types";

export interface LocalTransactionFilters {
  fromDate?: string;
  toDate?: string;
  type?: TransactionType;
  status?: TransactionStatus;
  limit?: number;
  offset?: number;
}

export function useTransactionsLocal(filters: LocalTransactionFilters = {}) {
  const { userId, ready: bookReady } = useBook();
  const db = useLocalDb();
  const ready = bookReady && db !== null;

  return useQuery<Transaction[]>({
    queryKey: ["transactions-local", userId, filters],
    queryFn: () => {
      if (!db || !userId) throw new Error("Local DB not ready");
      return getTransactions(db, userId, filters);
    },
    enabled: ready,
    staleTime: Infinity,
  });
}

/**
 * Fetch stock movements for a list of transaction ids.
 * Dipakai untuk derive HPP di laporan.
 */
export function useStockMovementsLocal(transactionIds: string[]) {
  const { ready: bookReady } = useBook();
  const db = useLocalDb();
  const ready = bookReady && db !== null && transactionIds.length > 0;

  return useQuery<StockMovement[]>({
    queryKey: ["stock-movements-local", transactionIds.join(",")],
    queryFn: () => {
      if (!db) throw new Error("Local DB not ready");
      return getStockMovementsForTransactions(db, transactionIds);
    },
    enabled: ready,
    staleTime: Infinity,
  });
}
