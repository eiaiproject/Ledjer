import { execute } from "../db/client";
import { IDLE_TIMEOUT_MS } from "./session.service";

const MS_PER_DAY = 86400000;

export interface CleanupResult {
  sessions: number;
  auditLogs: number;
  rateLimits: number;
}

export async function cleanupExpiredRows(
  db: D1Database,
  current = Date.now(),
  config?: { auditRetentionDays?: number },
): Promise<CleanupResult> {
  const auditRetentionDays = config?.auditRetentionDays ?? 7 * 365; // default 7 years

  const sessions = await execute(
    db,
    "DELETE FROM sessions WHERE expires_at <= ? OR (revoked_at IS NOT NULL AND revoked_at <= ?) OR COALESCE(last_used_at, created_at) <= ?",
    [current, current, current - IDLE_TIMEOUT_MS],
  );
  const auditLogs = await execute(
    db,
    "DELETE FROM audit_logs WHERE created_at <= ?",
    [current - auditRetentionDays * MS_PER_DAY],
  );
  const rateLimits = await execute(
    db,
    "DELETE FROM rate_limits WHERE created_at <= ?",
    [current - 3600000], // 1 hour retention
  );

  return {
    sessions: sessions.meta.changes ?? 0,
    auditLogs: auditLogs.meta.changes ?? 0,
    rateLimits: rateLimits.meta.changes ?? 0,
  };
}