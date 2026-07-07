import { apiRequest, jsonBody } from "./client";

export interface Organization {
  id: string;
  name: string;
  business_type: "service" | "simple_trading";
  base_currency: string;
  books_start_date: string;
  onboarding_status: string;
  created_by: string;
}

export interface OrgMember {
  id: string;
  organization_id: string;
  user_id: string;
  role: "owner" | "admin" | "member" | "viewer";
  status: string;
  can_create_transaction: boolean;
  can_view_reports: boolean;
  can_manage_accounts: boolean;
  can_void_transaction: boolean;
  can_view_audit_log: boolean;
  can_manage_products: boolean;
}

export interface OrganizationState {
  organization: Organization | null;
  member: OrgMember | null;
  needsOnboarding: boolean;
  error: null;
}

export interface ExtraOpeningBalance {
  accountCode?: string;
  openingBalance: number;
  description: string;
  createBank?: boolean;
  bankNumber?: number;
  accountName?: string;
}

export interface CreateOrganizationInput {
  organizationName: string;
  businessType: "service" | "simple_trading";
  booksStartDate: string;
  defaultCashAccountName?: string;
  openingCashBalance?: number;
  extraOpeningBalances?: ExtraOpeningBalance[];
}

export function getCurrentOrganization(): Promise<OrganizationState> {
  return apiRequest<OrganizationState>("/api/organizations/current");
}

export function createOrganization(
  input: CreateOrganizationInput,
): Promise<OrganizationState> {
  return apiRequest<OrganizationState>("/api/organizations", {
    method: "POST",
    body: jsonBody(input),
  });
}

export function selectCurrentOrganization(
  organizationId: string,
): Promise<OrganizationState> {
  return apiRequest<OrganizationState>("/api/organizations/current", {
    method: "POST",
    body: jsonBody({ organizationId }),
  });
}
