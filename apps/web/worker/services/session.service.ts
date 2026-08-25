import { execute, queryFirst } from "../db/client";
import { generateId, generateToken, hashToken } from "../auth/tokens";

// Absolute session lifetime: the session is invalidated 14 days after login
// regardless of activity.
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 14; // 14 days

// Idle timeout: the session is invalidated after 1 hour without any request
// (tracked via last_used_at). Combined with the absolute TTL, active users
// stay logged in up to 14 days, but an unused session dies after 1h idle.
// Exported for reuse in the maintenance cleanup (keep both in sync).
export const IDLE_TIMEOUT_MS = 1000 * 60 * 60; // 1 hour

// Rotate the token hash when it is older than 50% of TTL (7 days) since it
// was issued (creation or last rotation). Active sessions get a fresh hash
// every 7 days so a leaked token stops working before the absolute TTL.
// This prevents race conditions when the SPA makes parallel API calls
// during page load - all requests within the interval share the same token.
const TOKEN_ROTATION_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export interface SessionUser {
  id: string;
  email: string;
  full_name: string;
  email_verified_at: number | null;
}

export interface AuthSession {
  id: string;
  user_id: string;
  expires_at: number;
  current_organization_id: string | null;
}

interface SessionRow extends AuthSession {
  token_hash: string;
}

interface CurrentSessionRow {
  session_id: string;
  user_id: string;
  expires_at: number;
  current_organization_id: string | null;
  email: string;
  full_name: string;
  email_verified_at: number | null;
  has_oauth: number;
}

export interface CreatedSession {
  token: string;
  expiresAt: number;
}

export async function createSession(
  db: D1Database,
  userId: string,
  request: Request,
  organizationId?: string,
): Promise<CreatedSession> {
  const token = generateToken();
  const tokenHash = await hashToken(token);
  const createdAt = Date.now();
  const expiresAt = createdAt + SESSION_TTL_MS;

  // Include current_organization_id in INSERT if organizationId provided
  const hasOrg = organizationId !== undefined;
  await execute(
    db,
    hasOrg
      ? `INSERT INTO sessions (
         id, user_id, token_hash, ip_address, user_agent, current_organization_id, expires_at, last_used_at, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      : `INSERT INTO sessions (
         id, user_id, token_hash, ip_address, user_agent, expires_at, last_used_at, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    hasOrg
      ? [generateId(), userId, tokenHash, request.headers.get("CF-Connecting-IP"), request.headers.get("User-Agent"), organizationId, expiresAt, createdAt, createdAt]
      : [generateId(), userId, tokenHash, request.headers.get("CF-Connecting-IP"), request.headers.get("User-Agent"), expiresAt, createdAt, createdAt],
  );

  return { token, expiresAt };
}

export async function getSessionByToken(
  db: D1Database,
  token: string,
): Promise<(CurrentSessionRow & { newToken?: string }) | null> {
  const tokenHash = await hashToken(token);
  const current = Date.now();

  const row = await queryFirst<CurrentSessionRow & { last_used_at: number; last_rotated_at?: number; created_at: number }>(
    db,
    `SELECT
       s.id AS session_id,
       s.user_id,
       s.expires_at,
       s.current_organization_id,
       u.email,
       u.full_name,
       u.email_verified_at,
       EXISTS(SELECT 1 FROM oauth_accounts oa WHERE oa.user_id = u.id) AS has_oauth,
       s.last_used_at,
       s.last_rotated_at,
       s.created_at
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ?
       AND s.revoked_at IS NULL
       AND s.expires_at > ?
       AND s.last_used_at >= ?`,
    [tokenHash, current, current - IDLE_TIMEOUT_MS],
  );

  if (!row) return null;

  // Rotate the token when the current token hash is older than 50% of TTL
  // (7 days) since it was issued (creation or last rotation). Active sessions
  // get a fresh token hash every 7 days so a leaked token stops working even
  // before the absolute TTL. Rotation is based on token age, NOT last_used_at:
  // the idle timeout above already expires unused sessions after 1 hour.
  const tokenIssuedAt = row.last_rotated_at ?? row.created_at;
  const shouldRotate = current - tokenIssuedAt > TOKEN_ROTATION_INTERVAL_MS;

  if (shouldRotate) {
    const newToken = generateToken();
    const newTokenHash = await hashToken(newToken);

    // The UPDATE is guarded by token_hash = ?, so parallel requests can't
    // rotate past each other: exactly one wins (meta.changes = 1), the rest
    // fall through to the re-read below.
    const result = await execute(
      db,
      `UPDATE sessions
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

    // Another request already rotated the token - re-read the session
    // by session id + user_id to get the current (already rotated) session.
    const refreshedRow = await queryFirst<CurrentSessionRow & { last_used_at: number }>(
      db,
      `SELECT
         s.id AS session_id,
         s.user_id,
         s.expires_at,
         s.current_organization_id,
         u.email,
         u.full_name,
         u.email_verified_at,
         s.last_used_at
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.id = ?
         AND s.user_id = ?
         AND s.revoked_at IS NULL
         AND s.expires_at > ?
         AND s.last_used_at >= ?`,
      [row.session_id, row.user_id, current, current - IDLE_TIMEOUT_MS],
    );

    if (refreshedRow) {
      return refreshedRow; // No newToken - caller should NOT set a new cookie
    }

    // Session was revoked or expired between checks - return null
    return null;
  }

  // Rotation skipped - just update last_used_at so the sliding window stays accurate
  await execute(
    db,
    `UPDATE sessions
     SET last_used_at = ?
     WHERE id = ?
       AND revoked_at IS NULL`,
    [current, row.session_id],
  );

  return row;
}

export async function revokeSessionToken(
  db: D1Database,
  token: string,
): Promise<void> {
  const tokenHash = await hashToken(token);
  await execute(
    db,
    "UPDATE sessions SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL",
    [Date.now(), tokenHash],
  );
}

export async function revokeAllUserSessions(
  db: D1Database,
  userId: string,
): Promise<void> {
  await execute(
    db,
    "UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL",
    [Date.now(), userId],
  );
}

export async function setSessionCurrentOrganization(
  db: D1Database,
  sessionId: string,
  organizationId: string | null,
): Promise<void> {
  await execute(
    db,
    "UPDATE sessions SET current_organization_id = ? WHERE id = ? AND revoked_at IS NULL",
    [organizationId, sessionId],
  );
}

export type { CurrentSessionRow, SessionRow };
