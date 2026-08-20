import { execute } from "../db/client";
import { generateId } from "../auth/tokens";

/**
 * Write an admin-scoped audit entry. Admin users live in admin_users (not
 * users), so actor_user_id must stay NULL — audit_logs.actor_user_id has a
 * FK to users(id) with no ON DELETE action, and admin ids don't exist there.
 * The acting admin is recorded in after_json (email + id).
 */
export async function logAdminEvent(
  db: D1Database,
  input: {
    actorAdminId: string;
    actorEmail: string;
    entityType: string;
    entityId: string;
    action: string;
    before?: unknown;
    after?: unknown;
    reason?: string | null;
  },
): Promise<void> {
  await execute(
    db,
    `INSERT INTO audit_logs (
       id, organization_id, actor_user_id, entity_type, entity_id, action,
       before_json, after_json, reason, created_at
     ) VALUES (?, NULL, NULL, ?, ?, ?, ?, ?, ?, ?)`,
    [
      generateId(),
      input.entityType,
      input.entityId,
      input.action,
      input.before ? JSON.stringify(input.before) : null,
      JSON.stringify({
        actor: { id: input.actorAdminId, email: input.actorEmail },
        ...(input.after ? { after: input.after } : {}),
      }),
      input.reason ?? null,
      Date.now(),
    ],
  );
}
