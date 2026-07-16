import { execute } from "../db/client";
import { generateId } from "../auth/tokens";

/**
 * Write an auth-scoped audit entry (organization_id = NULL, entity_type = 'auth').
 * For auth events that occur within an org context, use writeAuditStatement instead.
 */
export async function logAuthEvent(
  db: D1Database,
  actorUserId: string | null,
  entityId: string,
  action: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  await execute(
    db,
    `INSERT INTO audit_logs (
       id, organization_id, actor_user_id, entity_type, entity_id, action,
       before_json, after_json, reason, created_at
     ) VALUES (?, NULL, ?, 'auth', ?, ?, NULL, ?, NULL, ?)`,
    [
      generateId(),
      actorUserId,
      entityId,
      action,
      metadata ? JSON.stringify(metadata) : null,
      Date.now(),
    ],
  );
}
