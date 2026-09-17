/**
 * useAccountsLocal — React Query hooks that read from local SQLite.
 *
 * Drop-in replacement for useAccounts/useAllAccounts that reads from
 * the local DB instead of fetching from the server API.
 *
 * Write operations still call the API (for server-side validation + backup)
 * but the local DB is the source of truth for reads.
 */

import { useQuery } from "@tanstack/react-query";
import { useBook } from "@/hooks/useBook";
import { useLocalDb } from "@/lib/db/provider";
import { getAllAccounts, getActiveAccounts, getAccountsBySubtype } from "@/lib/db/repos";

/** Seluruh akun buku ini (termasuk nonaktif) — dipakai chart + dropdown. */
export function useAllAccountsLocal() {
  const { userId, ready: bookReady } = useBook();
  const db = useLocalDb();
  const ready = bookReady && db !== null;

  return useQuery({
    queryKey: ["accounts-local", userId, "fullList"],
    queryFn: () => {
      if (!db || !userId) throw new Error("Local DB not ready");
      return getAllAccounts(db, userId);
    },
    enabled: ready,
    staleTime: Infinity, // Local DB is always fresh
  });
}

/** Aktif saja — dipakai dropdown transaksi. */
export function useActiveAccountsLocal() {
  const { userId, ready: bookReady } = useBook();
  const db = useLocalDb();
  const ready = bookReady && db !== null;

  return useQuery({
    queryKey: ["accounts-local", userId, "activeList"],
    queryFn: () => {
      if (!db || !userId) throw new Error("Local DB not ready");
      return getActiveAccounts(db, userId);
    },
    enabled: ready,
    staleTime: Infinity,
  });
}

/** Cash + bank accounts — dipakai dropdown transaksi. */
export function useCashBankAccountsLocal() {
  const { userId, ready: bookReady } = useBook();
  const db = useLocalDb();
  const ready = bookReady && db !== null;

  return useQuery({
    queryKey: ["accounts-local", userId, "cashBank"],
    queryFn: () => {
      if (!db || !userId) throw new Error("Local DB not ready");
      const cash = getAccountsBySubtype(db, userId, "cash");
      const bank = getAccountsBySubtype(db, userId, "bank");
      return [...cash, ...bank];
    },
    enabled: ready,
    staleTime: Infinity,
  });
}
