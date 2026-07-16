import { execute } from "../db/client";

const MS_PER_DAY = 86400000;

export interface CleanupResult {
  sessions: number;
  emailVerifications: number;
  passwordResetTokens: number;
  exportJobs: number;
  loginAttempts: number;
  auditLogs: number;
}

export async function cleanupExpiredRows(
  db: D1Database,
  current = Date.now(),
  config?: { auditRetentionDays?: number },
): Promise<CleanupResult> {
  const auditRetentionDays = config?.auditRetentionDays ?? 7 * 365; // default 7 years

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
  const loginAttempts = await execute(
    db,
    "DELETE FROM login_attempts WHERE created_at <= ?",
    [current - 90 * MS_PER_DAY], // retain 90 days
  );
  const auditLogs = await execute(
    db,
    "DELETE FROM audit_logs WHERE created_at <= ?",
    [current - auditRetentionDays * MS_PER_DAY],
  );

  return {
    sessions: sessions.meta.changes ?? 0,
    emailVerifications: emailVerifications.meta.changes ?? 0,
    passwordResetTokens: passwordResetTokens.meta.changes ?? 0,
    exportJobs: exportJobs.meta.changes ?? 0,
    loginAttempts: loginAttempts.meta.changes ?? 0,
    auditLogs: auditLogs.meta.changes ?? 0,
  };
}
