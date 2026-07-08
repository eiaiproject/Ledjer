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
  const isOwner = member?.role === "owner";
  const isAdmin = member?.role === "admin";

  return {
    isOwner,
    canCreateTransaction: !!member && (isOwner || member.can_create_transaction),
    canViewReports: !!member && (isOwner || member.can_view_reports),
    canManageAccounts: !!member && (isOwner || member.can_manage_accounts),
    canVoidTransaction: !!member && (isOwner || member.can_void_transaction),
    canViewAuditLog: !!member && (isOwner || member.can_view_audit_log),
    canManageProducts: !!member && (isOwner || member.can_manage_products),
    canReadTeam: !!member && (isOwner || isAdmin),
    canManageTeam: !!member && (isOwner || isAdmin),
    canCreateExports: !!member && (isOwner || isAdmin),
  };
}
