import { apiRequest } from "./client";

export interface Organization {
  id: string;
  name: string;
  base_currency: string;
  status: "active" | "disabled";
  created_at: number;
}

export interface OrgMember {
  id: string;
  organization_id: string;
  user_id: string;
  role: "owner";
  status: string;
  can_create_transaction: boolean;
  can_view_reports: boolean;
  can_manage_accounts: boolean;
  can_void_transaction: boolean;
}

export interface OrganizationState {
  organization: Organization | null;
  member: OrgMember | null;
  needsOnboarding: boolean;
  error: null;
}

export function getCurrentOrganization(): Promise<OrganizationState> {
  return apiRequest<OrganizationState>("/api/organizations/current");
}

export function updateOrganization(name: string): Promise<OrganizationState> {
  return apiRequest<OrganizationState>("/api/organizations/current", {
    method: "PATCH",
    body: JSON.stringify({ name }),
  });
}