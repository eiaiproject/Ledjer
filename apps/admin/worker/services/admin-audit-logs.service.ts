import { queryAll, queryFirst, type D1Input } from "../db/client";

export interface AuditLogEntry {
  id: string;
  organization_id: string | null;
  organization_name: string | null;
  actor_user_id: string | null;
  actor_email: string | null;
  actor_full_name: string | null;
  entity_type: string;
  entity_id: string;
  action: string;
  before_json: string | null;
  after_json: string | null;
  reason: string | null;
  request_id: string | null;
  created_at: number;
}

export interface AuditLogFilters {
  entityType?: string;
  action?: string;
  search?: string;
  organizationId?: string;
  fromDate?: string;
  toDate?: string;
  limit?: number;
  offset?: number;
}

export async function listAuditLogs(
  db: D1Database,
  filters: AuditLogFilters = {},
): Promise<{ entries: AuditLogEntry[]; total: number }> {
  const conditions: string[] = [];
  const values: D1Input[] = [];

  if (filters.entityType) {
    conditions.push("al.entity_type = ?");
    values.push(filters.entityType);
  }
  if (filters.action) {
    conditions.push("al.action = ?");
    values.push(filters.action);
  }
  if (filters.organizationId) {
    conditions.push("al.organization_id = ?");
    values.push(filters.organizationId);
  }
  if (filters.search) {
    const search = `%${filters.search.toLowerCase()}%`;
    conditions.push("(lower(al.entity_id) LIKE ? OR lower(al.reason) LIKE ?)");
    values.push(search, search);
  }
  if (filters.fromDate) {
    conditions.push("al.created_at >= ?");
    values.push(new Date(`${filters.fromDate}T00:00:00Z`).getTime());
  }
  if (filters.toDate) {
    conditions.push("al.created_at < ?");
    values.push(new Date(`${filters.toDate}T23:59:59Z`).getTime());
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const limit = Math.min(Math.max(filters.limit ?? 50, 1), 200);
  const offset = Math.max(filters.offset ?? 0, 0);

  const totalRow = await queryFirst<{ c: number }>(
    db,
    `SELECT COUNT(*) AS c FROM audit_logs al ${where}`,
    values,
  );
  const rows = await queryAll<AuditLogEntry>(
    db,
    `SELECT
       al.id,
       al.organization_id,
       o.name AS organization_name,
       al.actor_user_id,
       u.email AS actor_email,
       u.full_name AS actor_full_name,
       al.entity_type,
       al.entity_id,
       al.action,
       al.before_json,
       al.after_json,
       al.reason,
       al.request_id,
       al.created_at
     FROM audit_logs al
     LEFT JOIN organizations o ON o.id = al.organization_id
     LEFT JOIN users u ON u.id = al.actor_user_id
     ${where}
     ORDER BY al.created_at DESC
     LIMIT ? OFFSET ?`,
    [...values, limit, offset],
  );

  return { entries: rows, total: totalRow?.c ?? 0 };
}
