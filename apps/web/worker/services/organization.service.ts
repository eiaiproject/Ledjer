import { execute, queryAll, queryFirst } from "../db/client";
import type { AccountClass } from "../db/schema";
import { badRequest } from "../http/errors";
import { logAuthEvent } from "./auth-audit.service";
import { setSessionCurrentOrganization, type CurrentSessionRow } from "./session.service";

export type Permission =
  | "organization:read"
  | "organization:update"
  | "accounts:read"
  | "accounts:write"
  | "transactions:read"
  | "transactions:create"
  | "transactions:void"
  | "reports:read"
  | "exports:create";

export interface PublicOrganization {
  id: string;
  name: string;
  base_currency: string;
  status: "active" | "disabled";
  created_at: number;
}

export interface PublicOrganizationMember {
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

export interface OrganizationContext {
  organization: PublicOrganization;
  member: PublicOrganizationMember;
}

interface OrganizationMemberRow {
  organization_id: string;
  organization_name: string;
  base_currency: string;
  organization_status: "active" | "disabled";
  created_at: number;
  member_id: string;
  user_id: string;
  role: "owner";
}

const ROLE_PERMISSIONS: Record<"owner", ReadonlySet<Permission>> = {
  owner: new Set([
    "organization:read", "organization:update", "accounts:read", "accounts:write",
    "transactions:read", "transactions:create", "transactions:void",
    "reports:read", "exports:create",
  ]),
};

export function hasPermission(member: PublicOrganizationMember, permission: Permission): boolean {
  return ROLE_PERMISSIONS[member.role].has(permission);
}

export function requirePermission(member: PublicOrganizationMember, permission: Permission): void {
  if (!hasPermission(member, permission)) {
    throw badRequest("permission_denied", "Permission denied");
  }
}

export async function getCurrentOrganization(
  db: D1Database,
  session: CurrentSessionRow,
): Promise<OrganizationContext | null> {
  const context = await getOrganizationContextForUser(db, session.user_id, session.current_organization_id ?? undefined);
  return context;
}

export async function listOrganizationsForUser(
  db: D1Database,
  userId: string,
): Promise<OrganizationContext[]> {
  const rows = await queryAll<OrganizationMemberRow>(
    db,
    `${organizationMemberSelect()} WHERE m.user_id = ? ORDER BY m.created_at ASC`,
    [userId],
  );
  return rows.map(toContext);
}

export async function getOrganizationContextForUser(
  db: D1Database,
  userId: string,
  organizationId?: string,
): Promise<OrganizationContext | null> {
  const row = await queryFirst<OrganizationMemberRow>(
    db,
    `${organizationMemberSelect()} WHERE m.user_id = ? ${organizationId ? "AND m.organization_id = ?" : ""} ORDER BY m.created_at ASC LIMIT 1`,
    organizationId ? [userId, organizationId] : [userId],
  );
  return row ? toContext(row) : null;
}

export async function setCurrentOrganization(
  db: D1Database,
  session: CurrentSessionRow,
  organizationId: string,
): Promise<OrganizationContext | null> {
  const context = await getOrganizationContextForUser(db, session.user_id, organizationId);
  if (!context) throw badRequest("organization_forbidden", "Organization access denied");
  await setSessionCurrentOrganization(db, session.session_id, organizationId);
  return context;
}

/**
 * Create an organization with the creating user as its only owner member and
 * seed the default MVP chart of accounts. Called by registration.
 */
export async function createOrganizationWithOwner(
  db: D1Database,
  userId: string,
  organizationName: string,
  current = Date.now(),
): Promise<PublicOrganization> {
  if (!organizationName) {
    throw badRequest("organization_name_required", "Nama usaha harus diisi.");
  }

  const organizationId = crypto.randomUUID();
  await execute(
    db,
    `INSERT INTO organizations (id, name, base_currency, status, created_at, updated_at)
     VALUES (?, ?, 'IDR', 'active', ?, ?)`,
    [organizationId, organizationName, current, current],
  );

  await execute(
    db,
    `INSERT INTO memberships (id, user_id, organization_id, role, created_at)
     VALUES (?, ?, ?, 'owner', ?)`,
    [crypto.randomUUID(), userId, organizationId, current],
  );

  await createDefaultAccounts(db, organizationId, current);

  return { id: organizationId, name: organizationName, base_currency: "IDR", status: "active", created_at: current };
}

export async function updateOrganization(
  db: D1Database,
  organizationId: string,
  userId: string,
  name: string,
): Promise<void> {
  const current = Date.now();
  await execute(
    db,
    `UPDATE organizations SET name = ?, updated_at = ? WHERE id = ?`,
    [name.trim(), current, organizationId],
  );
  await logAuthEvent(db, userId, organizationId, "organization_updated", { name });
}

function organizationMemberSelect(): string {
  return `SELECT o.id AS organization_id, o.name AS organization_name, o.base_currency, o.status AS organization_status, o.created_at, m.id AS member_id, m.user_id, m.role FROM memberships m JOIN organizations o ON o.id = m.organization_id`;
}

function toContext(row: OrganizationMemberRow): OrganizationContext {
  return {
    organization: {
      id: row.organization_id,
      name: row.organization_name,
      base_currency: row.base_currency,
      status: row.organization_status,
      created_at: row.created_at,
    },
    member: {
      id: row.member_id,
      organization_id: row.organization_id,
      user_id: row.user_id,
      role: row.role,
      status: "active",
      can_create_transaction: true,
      can_view_reports: true,
      can_manage_accounts: true,
      can_void_transaction: true,
    },
  };
}

interface DefaultAccount {
  code: string;
  name: string;
  accountClass: AccountClass;
  accountSubtype?: "cash" | "bank";
  isSystem: boolean;
}

// PRD §10.8 — chart of accounts default MVP.
export const DEFAULT_ACCOUNTS: readonly DefaultAccount[] = [
  { code: "1110", name: "Kas", accountClass: "asset", accountSubtype: "cash", isSystem: true },
  { code: "1120", name: "Bank", accountClass: "asset", accountSubtype: "bank", isSystem: true },
  { code: "3110", name: "Modal Pemilik", accountClass: "equity", isSystem: true },
  { code: "3120", name: "Pengambilan Pemilik", accountClass: "equity", isSystem: true },
  { code: "4110", name: "Pendapatan Usaha", accountClass: "income", isSystem: true },
  { code: "4120", name: "Pendapatan Lain", accountClass: "income", isSystem: true },
  { code: "6110", name: "Beban Gaji & Upah", accountClass: "expense", isSystem: true },
  { code: "6120", name: "Beban Sewa", accountClass: "expense", isSystem: true },
  { code: "6130", name: "Beban Pemasaran", accountClass: "expense", isSystem: true },
  { code: "6140", name: "Beban Transportasi", accountClass: "expense", isSystem: true },
  { code: "6150", name: "Beban Komunikasi & Internet", accountClass: "expense", isSystem: true },
  { code: "6160", name: "Beban Perlengkapan", accountClass: "expense", isSystem: true },
  { code: "6170", name: "Beban Administrasi", accountClass: "expense", isSystem: true },
  { code: "6180", name: "Beban Lain-lain", accountClass: "expense", isSystem: true },
];

export async function createDefaultAccounts(
  db: D1Database,
  organizationId: string,
  current = Date.now(),
): Promise<void> {
  for (const account of DEFAULT_ACCOUNTS) {
    await execute(
      db,
      `INSERT INTO accounts (
         id, organization_id, code, name, account_class, account_subtype,
         is_system, is_active, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      [
        crypto.randomUUID(),
        organizationId,
        account.code,
        account.name,
        account.accountClass,
        account.accountSubtype ?? null,
        account.isSystem ? 1 : 0,
        current,
        current,
      ],
    );
  }
}