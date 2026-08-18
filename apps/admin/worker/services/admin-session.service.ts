import { execute, queryFirst } from "../db/client";
import { generateId, generateToken, hashToken } from "../auth/tokens";

// Absolute session lifetime: the admin session is invalidated 14 days after
// login regardless of activity.
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 14; // 14 days

// Idle timeout: the session is invalidated after 1 hour without any request.
export const IDLE_TIMEOUT_MS = 1000 * 60 * 60; // 1 hour

// Rotate the token hash when it is older than 50% of TTL (7 days) since it
// was issued (creation or last rotation).
const TOKEN_ROTATION_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export interface AdminSessionRow {
  session_id: string;
  admin_user_id: string;
  expires_at: number;
  email: string;
  full_name: string;
  status: "active" | "disabled";
}

export interface CreatedAdminSession {
  token: string;
  expiresAt: number;
}

export async function createAdminSession(
  db: D1Database,
  adminUserId: string,
  request: Request,
): Promise<CreatedAdminSession> {
  const token = generateToken();
  const tokenHash = await hashToken(token);
  const createdAt = Date.now();
  const expiresAt = createdAt + SESSION_TTL_MS;

  await execute(
    db,
    `INSERT INTO admin_sessions (
       id, admin_user_id, token_hash, ip_address, user_agent, expires_at, last_used_at, created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      generateId(),
      adminUserId,
      tokenHash,
      request.headers.get("CF-Connecting-IP"),
      request.headers.get("User-Agent"),
      expiresAt,
      createdAt,
      createdAt,
    ],
  );

  return { token, expiresAt };
}

export async function getAdminSessionByToken(
  db: D1Database,
  token: string,
): Promise<(AdminSessionRow & { newToken?: string }) | null> {
  const tokenHash = await hashToken(token);
  const current = Date.now();

  const row = await queryFirst<AdminSessionRow & { last_used_at: number; last_rotated_at?: number; created_at: number }>(
    db,
    `SELECT
       s.id AS session_id,
       s.admin_user_id,
       s.expires_at,
       au.email,
       au.full_name,
       au.status,
       s.last_used_at,
       s.last_rotated_at,
       s.created_at
     FROM admin_sessions s
     JOIN admin_users au ON au.id = s.admin_user_id
     WHERE s.token_hash = ?
       AND s.revoked_at IS NULL
       AND s.expires_at > ?
       AND s.last_used_at >= ?`,
    [tokenHash, current, current - IDLE_TIMEOUT_MS],
  );

  if (!row) return null;

  // A disabled admin cannot use an existing session.
  if (row.status !== "active") return null;

  const tokenIssuedAt = row.last_rotated_at ?? row.created_at;
  const shouldRotate = current - tokenIssuedAt > TOKEN_ROTATION_INTERVAL_MS;

  if (shouldRotate) {
    const newToken = generateToken();
    const newTokenHash = await hashToken(newToken);

    const result = await execute(
      db,
      `UPDATE admin_sessions
       SET token_hash = ?,
           last_used_at = ?,
           last_rotated_at = ?
       WHERE id = ?
         AND token_hash = ?
         AND revoked_at IS NULL`,
      [newTokenHash, current, current, row.session_id, tokenHash],
    );

    if (result.meta.changes > 0) {
      return { ...row, newToken };
    }

    // Another request already rotated the token — re-read.
    const refreshedRow = await queryFirst<AdminSessionRow & { last_used_at: number }>(
      db,
      `SELECT
         s.id AS session_id,
         s.admin_user_id,
         s.expires_at,
         au.email,
         au.full_name,
         au.status,
         s.last_used_at
       FROM admin_sessions s
       JOIN admin_users au ON au.id = s.admin_user_id
       WHERE s.id = ?
         AND s.admin_user_id = ?
         AND s.revoked_at IS NULL
         AND s.expires_at > ?
         AND s.last_used_at >= ?`,
      [row.session_id, row.admin_user_id, current, current - IDLE_TIMEOUT_MS],
    );

    if (refreshedRow) {
      if (refreshedRow.status !== "active") return null;
      return refreshedRow;
    }

    return null;
  }

  // Rotation skipped — update last_used_at for the sliding window.
  await execute(
    db,
    `UPDATE admin_sessions
     SET last_used_at = ?
     WHERE id = ?
       AND revoked_at IS NULL`,
    [current, row.session_id],
  );

  return row;
}

export async function revokeAdminSession(
  db: D1Database,
  token: string,
): Promise<void> {
  const tokenHash = await hashToken(token);
  await execute(
    db,
    "UPDATE admin_sessions SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL",
    [Date.now(), tokenHash],
  );
}

export async function revokeAllAdminSessions(
  db: D1Database,
  adminUserId: string,
): Promise<void> {
  await execute(
    db,
    "UPDATE admin_sessions SET revoked_at = ? WHERE admin_user_id = ? AND revoked_at IS NULL",
    [Date.now(), adminUserId],
  );
}
