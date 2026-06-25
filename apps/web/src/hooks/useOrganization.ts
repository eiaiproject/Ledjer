import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/auth-context";
import { supabase } from "@/lib/supabase";
import { queryKeys } from "@/lib/query-keys";

export interface Organization {
  id: string;
  name: string;
  business_type: string;
  base_currency: string;
  books_start_date: string;
  onboarding_status: string;
  current_plan: string;
  created_by: string;
}

export interface OrgMember {
  id: string;
  organization_id: string;
  user_id: string;
  role: string;
  status: string;
  can_create_transaction: boolean;
  can_view_reports: boolean;
  can_manage_accounts: boolean;
  can_void_transaction: boolean;
  can_view_audit_log: boolean;
  can_manage_products: boolean;
}

export function useOrganization() {
  const { user, loading } = useAuth();

  return useQuery({
    queryKey: queryKeys.organization(user?.id),
    queryFn: async () => {
      if (!user) throw new Error("Not authenticated");

      // Step 1: fetch active membership (no join to avoid RLS 406).
      // MVP supports one active organization in the UI; choose the oldest
      // membership if legacy data has more than one.
      const { data: member, error: memberError } = await supabase
        .from("organization_members")
        .select("id, organization_id, user_id, role, status, can_create_transaction, can_view_reports, can_manage_accounts, can_void_transaction, can_view_audit_log, can_manage_products")
        .eq("user_id", user.id)
        .eq("status", "active")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      // Distinguish between network/RLS errors and "no membership" (onboarding needed)
      if (memberError) {
        // Real error: throw so React Query surfaces it as an error state
        throw memberError;
      }

      if (!member) {
        // No active membership → user needs onboarding
        return { organization: null, member: null, needsOnboarding: true, error: null };
      }

      // Step 2: fetch the organization separately
      const { data: org, error: orgError } = await supabase
        .from("organizations")
        .select("id, name, business_type, base_currency, books_start_date, onboarding_status, current_plan, created_by")
        .eq("id", member.organization_id)
        .single();

      if (orgError) {
        // Real error: throw so React Query surfaces it as an error state
        throw orgError;
      }

      if (!org) {
        // Org was deleted or RLS blocked access → treat as no membership
        return { organization: null, member: null, needsOnboarding: true, error: null };
      }

      return {
        organization: org as unknown as Organization,
        member: member as unknown as OrgMember,
        needsOnboarding: org.onboarding_status !== "completed",
        error: null,
      };
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

  return {
    isOwner,
    canCreateTransaction: !!member && (isOwner || member.can_create_transaction),
    canViewReports: !!member && (isOwner || member.can_view_reports),
    canManageAccounts: !!member && (isOwner || member.can_manage_accounts),
    canVoidTransaction: !!member && (isOwner || member.can_void_transaction),
    canViewAuditLog: !!member && (isOwner || member.can_view_audit_log),
    canManageProducts: !!member && (isOwner || member.can_manage_products),
  };
}
