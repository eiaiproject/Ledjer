import { execute, nowMs, queryAll, queryFirst } from "../db/client";
import { conflict, forbidden, unauthorized } from "../http/errors";
import { hashPassword, verifyPassword } from "../auth/password";
import { generateId, generateToken, hashToken } from "../auth/tokens";
import {
  createSession,
  revokeAllUserSessions,
  type CreatedSession,
} from "./session.service";

const EMAIL_VERIFICATION_TTL_MS = 1000 * 60 * 60 * 24;
const PASSWORD_RESET_TTL_MS = 1000 * 60 * 60;
const LOGIN_LOCKOUT_MS = 1000 * 60 * 15;
const LOGIN_MAX_FAILURES = 5;

interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  full_name: string;
  status: string;
  email_verified_at: number | null;
}

interface TokenUserRow {
  user_id: string;
  expires_at: number;
  used_at: number | null;
  email: string;
}

export interface RegisterInput {
  email: string;
  password: string;
  fullName: string;
}

export interface RegisterResult {
  userId: string;
  needsEmailConfirmation: boolean;
}

export async function registerUser(
  db: D1Database,
  input: RegisterInput,
  pepper?: string,
): Promise<RegisterResult> {
  const email = input.email.trim().toLowerCase();
  const existing = await findUserByEmail(db, email);
  if (existing) {
    throw conflict("email_already_registered", "Email is already registered");
  }

  const current = nowMs();
  const userId = generateId();
  await execute(
    db,
    `INSERT INTO users (
       id, email, password_hash, full_name, status, created_at, updated_at
     ) VALUES (?, ?, ?, ?, 'active', ?, ?)`,
    [
      userId,
      email,
      await hashPassword(input.password, pepper),
      input.fullName.trim(),
      current,
      current,
    ],
  );
  await createEmailVerification(db, userId, email);

  return {
    userId,
    needsEmailConfirmation: true,
  };
}

export async function loginUser(
  db: D1Database,
  emailInput: string,
  password: string,
  request: Request,
  pepper?: string,
): Promise<CreatedSession> {
  const email = emailInput.trim().toLowerCase();
  const ipAddress = request.headers.get("CF-Connecting-IP");
  const locked = await isLoginRateLimited(db, email, ipAddress);
  if (locked) {
    throw forbidden("rate_limited", "Too many failed login attempts");
  }

  const user = await findUserByEmail(db, email);
  if (!user || !(await verifyPassword(password, user.password_hash, pepper))) {
    await recordLoginAttempt(db, email, request, false, "invalid_credentials");
    throw unauthorized("Invalid email or password");
  }

  if (user.status !== "active") {
    await recordLoginAttempt(db, email, request, false, "user_disabled");
    throw forbidden("user_disabled", "User is disabled");
  }

  if (!user.email_verified_at) {
    await recordLoginAttempt(db, email, request, false, "email_not_confirmed");
    throw forbidden("email_not_confirmed", "Email is not confirmed");
  }

  await recordLoginAttempt(db, email, request, true);
  return createSession(db, user.id, request);
}

export async function verifyEmailToken(
  db: D1Database,
  token: string,
  request: Request,
): Promise<CreatedSession> {
  const tokenHash = await hashToken(token);
  const current = nowMs();
  const row = await queryFirst<TokenUserRow>(
    db,
    `SELECT ev.user_id, ev.expires_at, ev.used_at, u.email
     FROM email_verifications ev
     JOIN users u ON u.id = ev.user_id
     WHERE ev.token_hash = ?`,
    [tokenHash],
  );

  if (!row || row.used_at || row.expires_at <= current) {
    throw forbidden("token_expired", "Verification token is invalid or expired");
  }

  await execute(
    db,
    "UPDATE email_verifications SET used_at = ? WHERE token_hash = ?",
    [current, tokenHash],
  );
  await execute(
    db,
    "UPDATE users SET email_verified_at = ?, updated_at = ? WHERE id = ?",
    [current, current, row.user_id],
  );

  return createSession(db, row.user_id, request);
}

export async function resendEmailVerification(
  db: D1Database,
  emailInput: string,
): Promise<void> {
  const email = emailInput.trim().toLowerCase();
  const user = await findUserByEmail(db, email);
  if (!user || user.email_verified_at) return;
  await createEmailVerification(db, user.id, email);
}

export async function createPasswordReset(
  db: D1Database,
  emailInput: string,
): Promise<void> {
  const email = emailInput.trim().toLowerCase();
  const user = await findUserByEmail(db, email);
  if (user?.status !== "active") return;

  const token = generateToken();
  const current = nowMs();
  await execute(
    db,
    `INSERT INTO password_reset_tokens (
       id, user_id, token_hash, expires_at, created_at
     ) VALUES (?, ?, ?, ?, ?)`,
    [
      generateId(),
      user.id,
      await hashToken(token),
      current + PASSWORD_RESET_TTL_MS,
      current,
    ],
  );
}

export async function verifyPasswordResetToken(
  db: D1Database,
  token: string,
  request: Request,
): Promise<CreatedSession> {
  const tokenHash = await hashToken(token);
  const current = nowMs();
  const row = await queryFirst<TokenUserRow>(
    db,
    `SELECT pr.user_id, pr.expires_at, pr.used_at, u.email
     FROM password_reset_tokens pr
     JOIN users u ON u.id = pr.user_id
     WHERE pr.token_hash = ?`,
    [tokenHash],
  );

  if (!row || row.used_at || row.expires_at <= current) {
    throw forbidden("token_expired", "Recovery token is invalid or expired");
  }

  await execute(
    db,
    "UPDATE password_reset_tokens SET used_at = ? WHERE token_hash = ?",
    [current, tokenHash],
  );

  return createSession(db, row.user_id, request);
}

export async function resetPassword(
  db: D1Database,
  userId: string,
  password: string,
  pepper?: string,
): Promise<void> {
  const current = nowMs();
  await execute(
    db,
    "UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?",
    [await hashPassword(password, pepper), current, userId],
  );
  await revokeAllUserSessions(db, userId);
}

export async function changePassword(
  db: D1Database,
  userId: string,
  currentPassword: string,
  nextPassword: string,
  pepper?: string,
): Promise<void> {
  const user = await queryFirst<UserRow>(
    db,
    "SELECT id, email, password_hash, full_name, status, email_verified_at FROM users WHERE id = ?",
    [userId],
  );
  if (!user || !(await verifyPassword(currentPassword, user.password_hash, pepper))) {
    throw unauthorized("Invalid current password");
  }
  await resetPassword(db, userId, nextPassword, pepper);
}

async function findUserByEmail(db: D1Database, email: string): Promise<UserRow | null> {
  return queryFirst<UserRow>(
    db,
    `SELECT id, email, password_hash, full_name, status, email_verified_at
     FROM users
     WHERE email = ?`,
    [email],
  );
}

async function createEmailVerification(
  db: D1Database,
  userId: string,
  email: string,
): Promise<void> {
  const token = generateToken();
  const current = nowMs();
  await execute(
    db,
    `INSERT INTO email_verifications (
       id, user_id, email, token_hash, expires_at, created_at
     ) VALUES (?, ?, ?, ?, ?, ?)`,
    [
      generateId(),
      userId,
      email,
      await hashToken(token),
      current + EMAIL_VERIFICATION_TTL_MS,
      current,
    ],
  );
}

async function isLoginRateLimited(
  db: D1Database,
  email: string,
  ipAddress: string | null,
): Promise<boolean> {
  const since = nowMs() - LOGIN_LOCKOUT_MS;
  const rows = await queryAll<{ id: string }>(
    db,
    `SELECT id
     FROM login_attempts
     WHERE success = 0
       AND created_at >= ?
       AND (email = ? OR (? IS NOT NULL AND ip_address = ?))
     LIMIT ?`,
    [since, email, ipAddress, ipAddress, LOGIN_MAX_FAILURES],
  );

  return rows.length >= LOGIN_MAX_FAILURES;
}

async function recordLoginAttempt(
  db: D1Database,
  email: string,
  request: Request,
  success: boolean,
  errorCode?: string,
): Promise<void> {
  await execute(
    db,
    `INSERT INTO login_attempts (
       id, email, ip_address, user_agent, success, error_code, created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      generateId(),
      email,
      request.headers.get("CF-Connecting-IP"),
      request.headers.get("User-Agent"),
      success,
      errorCode,
      nowMs(),
    ],
  );
}
