import { execute, queryFirst } from "../db/client";
import { generateId, generateToken, hashToken } from "../auth/tokens";

// Absolute session lifetime: the session is invalidated 14 days after login
// regardless of activity (PRD AUTH-04).
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 14; // 14 days

// Idle timeout: the session is invalidated after 7 days without any request
// (tracked via last_used_at). Combined with the absolute TTL, active users
// stay logged in up to 14 days, but an unused session dies after 7 days idle
// (PRD AUTH-04). Exported for reuse in the maintenance cleanup.
export const IDLE_TIMEOUT_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

// Rotate the token hash when it is older than 50% of TTL (7 days) since it
// was issued (creation or last rotation). Active sessions get a fresh hash
// every 7 days so a leaked token stops working before the absolute TTL.
// This prevents race conditions when the SPA makes parallel API calls
// during page load - all requests within the interval share the same token.
const TOKEN_ROTATION_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// After a rotation, the previous token hash stays valid for this grace window
// so parallel requests that were already in flight with the old cookie (and
// read the session a moment after the rotation committed) are not logged out
// against a live session. The browser swaps to the new cookie from the
// rotating response within milliseconds; 60s covers any stragglers comfortably.
export const TOKEN_ROTATION_GRACE_MS = 60 * 1000; // 60 seconds

// Throttle last_used_at writes: refreshing the sliding window every few
// minutes is plenty, and avoids a D1 write on every authenticated read.
export const LAST_USED_WRITE_MS = 5 * 60 * 1000;

export interface SessionUser {
  id: string;
  email: string;
  full_name: string;
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
}

interface SessionLookupRow extends CurrentSessionRow {
  last_used_at: number;
  last_rotated_at?: number;
  created_at: number;
  previous_token_hash?: string | null;
  previous_token_expires_at?: number | null;
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
  const idleCutoff = current - IDLE_TIMEOUT_MS;

  const row = await queryFirst<SessionLookupRow>(
    db,
    `SELECT
       s.id AS session_id,
       s.user_id,
       s.expires_at,
       s.current_organization_id,
       u.email,
       u.full_name,
       s.last_used_at,
       s.last_rotated_at,
       s.created_at,
       s.previous_token_hash,
       s.previous_token_expires_at
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.revoked_at IS NULL
       AND s.expires_at > ?
       AND s.last_used_at >= ?
       AND (
         s.token_hash = ?
         OR (s.previous_token_hash = ? AND s.previous_token_expires_at > ?)
       )`,
    [current, idleCutoff, tokenHash, tokenHash, current],
  );

  if (!row) return null;

  // The request may carry the token that a parallel request rotated out a
  // moment ago (grace window). It is still a live session: accept it and
  // refresh the sliding window without rotating again - the browser already
  // received (or is about to receive) the new cookie from the rotating
  // response, so no new cookie is needed here.
  const matchedViaPrevious =
    row.previous_token_hash != null && row.previous_token_hash === tokenHash;
  if (matchedViaPrevious) {
    if (current - (row.last_used_at ?? 0) > LAST_USED_WRITE_MS) {
      await execute(
        db,
        `UPDATE sessions
         SET last_used_at = ?
         WHERE id = ?
           AND revoked_at IS NULL`,
        [current, row.session_id],
      );
    }
    return {
      session_id: row.session_id,
      user_id: row.user_id,
      expires_at: row.expires_at,
      current_organization_id: row.current_organization_id,
      email: row.email,
      full_name: row.full_name,
    };
  }

  // Rotate the token when the current token hash is older than 50% of TTL
  // (7 days) since it was issued (creation or last rotation). Active sessions
  // get a fresh token hash every 7 days so a leaked token stops working even
  // before the absolute TTL. Rotation is based on token age, NOT last_used_at:
  // the idle timeout above already expires unused sessions after 7 days.
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
           last_rotated_at = ?,
           previous_token_hash = ?,
           previous_token_expires_at = ?
       WHERE id = ?
         AND token_hash = ?
         AND revoked_at IS NULL`,
      [newTokenHash, current, current, tokenHash, current + TOKEN_ROTATION_GRACE_MS, row.session_id, tokenHash],
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

  // Rotation skipped - refresh last_used_at only when the stored value is
  // older than the throttle window, so the sliding window stays accurate
  // without a D1 write on every request.
  if (current - (row.last_used_at ?? 0) > LAST_USED_WRITE_MS) {
    await execute(
      db,
      `UPDATE sessions
       SET last_used_at = ?
       WHERE id = ?
         AND revoked_at IS NULL`,
      [current, row.session_id],
    );
  }

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
