import { useQuery } from "@tanstack/react-query";
import { useOrganization } from "@/hooks/useOrganization";
import { listAccounts } from "@/lib/api/accounts";
import { queryKeys } from "@/lib/query-keys";

/** Seluruh akun organisasi (termasuk nonaktif) — dipakai chart + dropdown. */
export function useAllAccounts() {
  const { data: orgData } = useOrganization();
  const orgId = orgData?.organization?.id;
  return useQuery({
    queryKey: queryKeys.accounts.fullList(orgId ?? ""),
    queryFn: async () => {
      if (!orgId) throw new Error("No organization");
      return listAccounts({ includeInactive: true });
    },
    enabled: !!orgId,
  });
}
