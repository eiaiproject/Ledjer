/**
 * useReportsLocal — hitung laporan langsung dari SQLite lokal via accounting engine.
 * Offline-first: tidak perlu fetch /api/reports.
 */

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useBook } from "@/hooks/useBook";
import { useLocalDb } from "@/lib/db/provider";
import { getAllAccounts, getTransactions, getStockMovementsForTransactions } from "@/lib/db/repos";
import { computeProfitLoss, computeBalanceSheet, computeGeneralLedger } from "@/lib/accounting";

export function useProfitLossLocal(fromDate: string, toDate: string) {
  const { userId, ready: bookReady } = useBook();
  const db = useLocalDb();
  const ready = bookReady && db !== null;

  return useQuery({
    queryKey: ["report-local", "profit-loss", userId, fromDate, toDate],
    queryFn: () => {
      if (!db || !userId) throw new Error("Local DB not ready");
      const accounts = getAllAccounts(db, userId);
      const txs = getTransactions(db, userId, { fromDate, toDate });
      // Ambil stock movements untuk periode yang sama (jual/loss → HPP)
      const txIds = txs.map((t) => t.id);
      const movements = getStockMovementsForTransactions(db, txIds);
      return computeProfitLoss(txs, accounts, fromDate, toDate, movements);
    },
    enabled: ready && !!fromDate && !!toDate,
    staleTime: Infinity,
  });
}

export function useBalanceSheetLocal(asOfDate: string) {
  const { userId, ready: bookReady } = useBook();
  const db = useLocalDb();
  const ready = bookReady && db !== null;

  return useQuery({
    queryKey: ["report-local", "balance-sheet", userId, asOfDate],
    queryFn: () => {
      if (!db || !userId) throw new Error("Local DB not ready");
      const accounts = getAllAccounts(db, userId);
      const txs = getTransactions(db, userId, { toDate: asOfDate });
      const movements = getStockMovementsForTransactions(
        db,
        txs.map((t) => t.id),
      );
      return computeBalanceSheet(txs, accounts, asOfDate, movements);
    },
    enabled: ready && !!asOfDate,
    staleTime: Infinity,
  });
}

export function useGeneralLedgerLocal(accountId: string, fromDate: string, toDate: string) {
  const { userId, ready: bookReady } = useBook();
  const db = useLocalDb();
  const ready = bookReady && db !== null && !!accountId;

  return useQuery({
    queryKey: ["report-local", "general-ledger", userId, accountId, fromDate, toDate],
    queryFn: () => {
      if (!db || !userId || !accountId) throw new Error("Local DB not ready");
      const accounts = getAllAccounts(db, userId);
      const txs = getTransactions(db, userId, { fromDate, toDate });
      const movements = getStockMovementsForTransactions(
        db,
        txs.map((t) => t.id),
      );
      return computeGeneralLedger(txs, accounts, fromDate, toDate, accountId, movements);
    },
    enabled: ready,
    staleTime: Infinity,
  });
}

/**
 * Helper: cek balance Aset = Liabilitas + Ekuitas.
 * Dipakai untuk badge "Neraca Seimbang".
 */
export function useBalanceSheetBalanced(report: ReturnType<typeof useBalanceSheetLocal>["data"]) {
  return useMemo(() => {
    if (!report) return null;
    const left = report.assets.total;
    const right = report.liabilities.total + report.equity.total;
    return left === right;
  }, [report]);
}
