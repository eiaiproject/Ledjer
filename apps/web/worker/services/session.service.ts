import { execute, queryFirst } from "../db/client";
import { generateId, generateToken, hashToken } from "../auth/tokens";

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;

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
}

export interface CreatedSession {
  token: string;
  expiresAt: number;
}

export async function createSession(
  db: D1Database,
  userId: string,
  request: Request,
): Promise<CreatedSession> {
  const token = generateToken();
  const tokenHash = await hashToken(token);
  const createdAt = Date.now();
  const expiresAt = createdAt + SESSION_TTL_MS;

  await execute(
    db,
    `INSERT INTO sessions (
       id, user_id, token_hash, ip_address, user_agent, expires_at, last_used_at, created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      generateId(),
      userId,
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

const TOKEN_ROTATION_INTERVAL_MS = 5 * 60 * 1000; // Only rotate token every 5 minutes

export async function getSessionByToken(
  db: D1Database,
  token: string,
): Promise<(CurrentSessionRow & { newToken?: string }) | null> {
  const tokenHash = await hashToken(token);
  const current = Date.now();

  const row = await queryFirst<CurrentSessionRow & { last_used_at: number }>(
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
     WHERE s.token_hash = ?
       AND s.revoked_at IS NULL
       AND s.expires_at > ?`,
    [tokenHash, current],
  );

  if (!row) return null;

  // Only rotate token if enough time has passed since last rotation/use.
  // This prevents race conditions when the SPA makes parallel API calls
  // during page load — all requests within the interval share the same token.
  const shouldRotate = current - row.last_used_at > TOKEN_ROTATION_INTERVAL_MS;

  if (shouldRotate) {
    const newToken = generateToken();
    const newTokenHash = await hashToken(newToken);

    const result = await execute(
      db,
      `UPDATE sessions
       SET token_hash = ?,
           last_used_at = ?
       WHERE id = ?
         AND token_hash = ?
         AND revoked_at IS NULL`,
      [newTokenHash, current, row.session_id, tokenHash],
    );

    if (result.meta.changes > 0) {
      return { ...row, newToken };
    }
    // Another request already rotated the token — fall through to update last_used_at
  }

  // Update last_used_at so the sliding window stays accurate
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
