import { execute, queryAll, queryFirst, type D1Input } from "../db/client";
import { notFound } from "../http/errors";
import { logAdminEvent } from "./admin-audit.service";

interface OrganizationRow {
  id: string;
  name: string;
  business_type: "service" | "simple_trading";
  base_currency: string;
  books_start_date: string;
  onboarding_status: string;
  status: "active" | "disabled";
  created_by: string;
  created_at: number;
  updated_at: number;
  member_count?: number;
}

export interface AdminOrganizationDetail extends OrganizationRow {
  member_count: number;
  transaction_count: number;
  journal_entry_count: number;
  owner_email: string | null;
  members: {
    id: string;
    user_id: string;
    email: string | null;
    full_name: string | null;
    role: "owner" | "admin" | "member" | "viewer";
    status: string;
    joined_at: number | null;
  }[];
}

export async function listOrganizations(
  db: D1Database,
  filters: { search?: string; status?: string; limit?: number; offset?: number },
): Promise<{ organizations: Array<OrganizationRow & { member_count: number }>; total: number }> {
  const conditions: string[] = [];
  const values: D1Input[] = [];

  if (filters.search) {
    const search = `%${filters.search.toLowerCase()}%`;
    conditions.push("(lower(o.name) LIKE ? OR o.id LIKE ?)");
    values.push(search, search);
  }
  if (filters.status) {
    conditions.push("o.status = ?");
    values.push(filters.status);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const limit = Math.min(Math.max(filters.limit ?? 50, 1), 200);
  const offset = Math.max(filters.offset ?? 0, 0);

  const totalRow = await queryFirst<{ c: number }>(
    db,
    `SELECT COUNT(*) AS c FROM organizations o ${where}`,
    values,
  );
  const rows = await queryAll<OrganizationRow & { member_count: number }>(
    db,
    `SELECT o.id, o.name, o.business_type, o.base_currency, o.books_start_date,
            o.onboarding_status, o.status, o.created_by, o.created_at, o.updated_at,
            (SELECT COUNT(*) FROM organization_members m WHERE m.organization_id = o.id AND m.status = 'active') AS member_count
     FROM organizations o ${where}
     ORDER BY o.created_at DESC
     LIMIT ? OFFSET ?`,
    [...values, limit, offset],
  );

  return { organizations: rows, total: totalRow?.c ?? 0 };
}

export async function getOrganizationDetail(
  db: D1Database,
  organizationId: string,
): Promise<AdminOrganizationDetail> {
  const org = await queryFirst<OrganizationRow>(
    db,
    `SELECT id, name, business_type, base_currency, books_start_date,
            onboarding_status, status, created_by, created_at, updated_at
     FROM organizations WHERE id = ?`,
    [organizationId],
  );
  if (!org) throw notFound("organization_not_found", "Organization not found");

  const members = await queryAll<AdminOrganizationDetail["members"][number]>(
    db,
    `SELECT m.id, m.user_id, u.email, u.full_name, m.role, m.status, m.joined_at
     FROM organization_members m
     LEFT JOIN users u ON u.id = m.user_id
     WHERE m.organization_id = ?
     ORDER BY m.created_at ASC`,
    [organizationId],
  );

  const memberCount = await queryFirst<{ c: number }>(
    db,
    "SELECT COUNT(*) AS c FROM organization_members WHERE organization_id = ? AND status = 'active'",
    [organizationId],
  );
  const txCount = await queryFirst<{ c: number }>(
    db,
    "SELECT COUNT(*) AS c FROM transactions WHERE organization_id = ?",
    [organizationId],
  );
  const jeCount = await queryFirst<{ c: number }>(
    db,
    "SELECT COUNT(*) AS c FROM journal_entries WHERE organization_id = ?",
    [organizationId],
  );
  const owner = members.find((m) => m.role === "owner" && m.status === "active");

  return {
    ...org,
    member_count: memberCount?.c ?? 0,
    transaction_count: txCount?.c ?? 0,
    journal_entry_count: jeCount?.c ?? 0,
    owner_email: owner?.email ?? null,
    members,
  };
}

export async function setOrganizationStatus(
  db: D1Database,
  actor: { id: string; email: string },
  organizationId: string,
  status: "active" | "disabled",
): Promise<void> {
  const org = await queryFirst<{ name: string; status: string }>(
    db,
    "SELECT name, status FROM organizations WHERE id = ?",
    [organizationId],
  );
  if (!org) throw notFound("organization_not_found", "Organization not found");
  if (org.status === status) return;

  await execute(
    db,
    "UPDATE organizations SET status = ?, updated_at = ? WHERE id = ?",
    [status, Date.now(), organizationId],
  );

  await logAdminEvent(db, {
    actorAdminId: actor.id,
    actorEmail: actor.email,
    entityType: "organization",
    entityId: organizationId,
    action: status === "disabled" ? "organization_disabled" : "organization_enabled",
    before: { name: org.name, status: org.status },
    after: { status },
  });
}
