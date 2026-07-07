import { execute, nowMs } from "../db/client";

export interface CleanupResult {
  sessions: number;
  emailVerifications: number;
  passwordResetTokens: number;
  exportJobs: number;
}

export async function cleanupExpiredRows(
  db: D1Database,
  current = nowMs(),
): Promise<CleanupResult> {
  const sessions = await execute(
    db,
    "DELETE FROM sessions WHERE expires_at <= ? OR (revoked_at IS NOT NULL AND revoked_at <= ?)",
    [current, current],
  );
  const emailVerifications = await execute(
    db,
    "DELETE FROM email_verifications WHERE expires_at <= ? OR used_at IS NOT NULL",
    [current],
  );
  const passwordResetTokens = await execute(
    db,
    "DELETE FROM password_reset_tokens WHERE expires_at <= ? OR used_at IS NOT NULL",
    [current],
  );
  const exportJobs = await execute(
    db,
    "DELETE FROM export_jobs WHERE expires_at IS NOT NULL AND expires_at <= ?",
    [current],
  );

  return {
    sessions: sessions.meta.changes ?? 0,
    emailVerifications: emailVerifications.meta.changes ?? 0,
    passwordResetTokens: passwordResetTokens.meta.changes ?? 0,
    exportJobs: exportJobs.meta.changes ?? 0,
  };
}
