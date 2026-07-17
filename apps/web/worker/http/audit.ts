import { statement } from "../db/client";
import { generateId } from "../auth/tokens";

export interface WriteAuditInput {
  organizationId: string | null;
  actorUserId: string;
  entityType: string;
  entityId: string;
  action: string;
  before?: unknown;
  after?: unknown;
  reason?: string | null;
  requestId?: string;
  current?: number;
}

// ponytail: Single audit write used by 5 services (was 5 copies of the same
// INSERT). Add fields when a service needs them.
export function writeAuditStatement(
  db: D1Database,
  input: WriteAuditInput,
): D1PreparedStatement {
  return statement(
    db,
    `INSERT INTO audit_logs (
       id, organization_id, actor_user_id, entity_type, entity_id, action,
       before_json, after_json, reason, request_id, created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      generateId(),
      input.organizationId,
      input.actorUserId,
      input.entityType,
      input.entityId,
      input.action,
      input.before ? JSON.stringify(input.before) : null,
      input.after ? JSON.stringify(input.after) : null,
      input.reason ?? null,
      input.requestId ?? null,
      input.current ?? Date.now(),
    ],
  );
}
