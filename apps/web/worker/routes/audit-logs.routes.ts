import { Hono } from "hono";
import type { AppContext } from "../env";
import { requireAuth } from "../middleware/auth.middleware";
import { requirePermission } from "../middleware/organization.middleware";
import type { D1Input } from "../db/client";
import { queryAll } from "../db/client";


export const auditLogsRoutes = new Hono<AppContext>();

auditLogsRoutes.use("*", requireAuth(), requirePermission("team:manage"));

auditLogsRoutes.get("/", async (c) => {
  const context = c.get("organizationContext");
  const limit = Math.min(Number(c.req.query("limit")) || 50, 200);
  const offset = Number(c.req.query("offset")) || 0;
  const action = c.req.query("action");

  const conditions = ["al.organization_id = ?"];
  const values: D1Input[] = [context.organization.id];
  if (action) {
    conditions.push("al.action = ?");
    values.push(action);
  }

  interface AuditLogRow {
    id: string;
    actor_user_id: string;
    actor_email: string;
    entity_type: string;
    entity_id: string;
    action: string;
    before_json: string | null;
    after_json: string | null;
    reason: string | null;
    created_at: string;
  }
  const rows = await queryAll<AuditLogRow>(
    c.env.DB,
    `SELECT al.id, al.actor_user_id, u.email AS actor_email,
            al.entity_type, al.entity_id, al.action,
            al.before_json, al.after_json, al.reason, al.created_at
     FROM audit_logs al
     LEFT JOIN users u ON u.id = al.actor_user_id
     WHERE ${conditions.join(" AND ")}
     ORDER BY al.created_at DESC
     LIMIT ? OFFSET ?`,
    [...values, limit, offset],
  );

  return c.json({ auditLogs: rows });
});
