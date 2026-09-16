import { execute } from "../db/client";
import { generateId } from "../auth/tokens";

/**
 * Write an auth-scoped audit entry (entity_type = 'auth') for a user's own book.
 * Ledjer is single-user, so the acting user and the book owner are the same.
 *
 * `userId` is null for anonymous events (e.g. a rejected login for an unknown
 * address): nothing is recorded against a book that does not exist.
 */
export async function logAuthEvent(
  db: D1Database,
  userId: string | null,
  action: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  await execute(
    db,
    `INSERT INTO audit_logs (
       id, user_id, actor_user_id, entity_type, entity_id, action,
       before_json, after_json, reason, created_at
     ) VALUES (?, ?, ?, 'auth', ?, ?, NULL, ?, NULL, ?)`,
    [
      generateId(),
      userId,
      userId,
      userId ?? "system",
      action,
      metadata ? JSON.stringify(metadata) : null,
      Date.now(),
    ],
  );
}
