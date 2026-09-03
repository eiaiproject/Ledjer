import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/auth-context";
import { queryKeys } from "@/lib/query-keys";
import { getCurrentOrganization } from "@/lib/api/organizations";
export type { Organization, OrgMember } from "@/lib/api/organizations";

export function useOrganization() {
  const { user, loading } = useAuth();

  return useQuery({
    queryKey: queryKeys.organization(user?.id),
    queryFn: async () => {
      if (!user) throw new Error("Not authenticated");
      return getCurrentOrganization();
    },
    enabled: !loading && !!user,
    staleTime: 60_000,
  });
}

export function useIsOwner() {
  const { data } = useOrganization();
  return data?.member?.role === "owner";
}

export function useOrgPermissions() {
  const { data } = useOrganization();
  const member = data?.member;

  return {
    isOwner: member?.role === "owner",
    canCreateTransaction: !!member?.can_create_transaction,
    canViewReports: !!member?.can_view_reports,
    canManageAccounts: !!member?.can_manage_accounts,
    canVoidTransaction: !!member?.can_void_transaction,
    canCreateExports: !!member,
  };
}