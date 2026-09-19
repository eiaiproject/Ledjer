import { useQuery } from "@tanstack/react-query";
import { useBook } from "@/hooks/useBook";
import { listAccounts } from "@/lib/api/accounts";
import { queryKeys } from "@/lib/query-keys";

/** Seluruh akun buku ini (termasuk nonaktif) — dipakai chart + dropdown. */
export function useAllAccounts() {
  const { userId } = useBook();
  return useQuery({
    queryKey: queryKeys.accounts.fullList(userId ?? ""),
    queryFn: async () => {
      if (!userId) throw new Error("Not authenticated");
      return listAccounts({ includeInactive: true });
    },
    enabled: !!userId,
  });
}
