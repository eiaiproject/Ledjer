/**
 * useMaxTransactionDate — tanggal posted paling baru milik buku ini.
 *
 * Dipakai menegakkan append-only kronologis (aturan: tanggal baru tak boleh
 * lebih tua dari catatan terakhir) di chat cepat dan form transaksi.
 * Return null bila belum ada transaksi / masih loading / offline-gagal —
 * null berarti "tak diketahui" sehingga tidak memblokir (fail-open offline,
 * server tetap menegakkan saat online).
 */

import { useQuery } from "@tanstack/react-query";
import { useBook } from "@/hooks/useBook";
import { listTransactions } from "@/lib/api/transactions";

export function useMaxTransactionDate(): string | null {
  const { userId, ready: bookReady } = useBook();

  const query = useQuery({
    queryKey: ["max-transaction-date", userId],
    queryFn: async () => {
      if (!userId) throw new Error("Not authenticated");
      const { transactions } = await listTransactions({ status: "posted", limit: 1 });
      return transactions[0]?.transaction_date ?? null;
    },
    enabled: bookReady,
    staleTime: 30_000,
    retry: 1,
  });

  return query.data ?? null;
}
