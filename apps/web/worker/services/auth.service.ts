import { execute, queryFirst } from "../db/client";
import { forbidden, unauthorized } from "../http/errors";
import { hashPassword, verifyPassword } from "../auth/password";
import { logAuthEvent } from "./auth-audit.service";
import { createSession, revokeAllUserSessions, type CreatedSession } from "./session.service";
import { createOrganizationWithOwner, type PublicOrganization } from "./organization.service";

interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  full_name: string;
  status: string;
}

export interface RegisterInput {
  email: string;
  password: string;
  fullName: string;
  organizationName: string;
}

export interface RegisterResult {
  userId: string;
  organization: PublicOrganization;
  session: CreatedSession;
}

export async function registerUser(
  db: D1Database,
  input: RegisterInput,
  request: Request,
  pepper?: string,
): Promise<RegisterResult> {
  const email = input.email.trim().toLowerCase();
  const current = Date.now();

  const existing = await findUserByEmail(db, email);
  if (existing) {
    await logDuplicateRegistration(db, email, current);
    throw forbidden("email_taken", "Email sudah terdaftar.");
  }

  const userId = crypto.randomUUID();
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

  const organization = await createOrganizationWithOwner(db, userId, input.organizationName.trim(), current);
  const session = await createSession(db, userId, request, organization.id);

  await logAuthEvent(db, userId, userId, "registration", { email, organizationId: organization.id });
  return { userId, organization, session };
}

export async function loginUser(
  db: D1Database,
  emailInput: string,
  password: string,
  request: Request,
  pepper?: string,
): Promise<CreatedSession> {
  const email = emailInput.trim().toLowerCase();
  const user = await findUserByEmail(db, email);
  if (!user || !(await verifyPassword(password, user.password_hash, pepper))) {
    throw unauthorized("Email atau password salah.");
  }

  if (user.status !== "active") {
    throw forbidden("user_disabled", "Akun dinonaktifkan.");
  }

  await logAuthEvent(db, user.id, user.id, "login_success", { email });
  return createSession(db, user.id, request);
}

export async function changePassword(
  db: D1Database,
  userId: string,
  nextPassword: string,
  pepper?: string,
): Promise<void> {
  const current = Date.now();
  await execute(
    db,
    "UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?",
    [await hashPassword(nextPassword, pepper), current, userId],
  );
  await revokeAllUserSessions(db, userId);
  await logAuthEvent(db, userId, userId, "password_changed", {});
}

async function findUserByEmail(db: D1Database, email: string): Promise<UserRow | null> {
  return queryFirst<UserRow>(
    db,
    `SELECT id, email, password_hash, full_name, status
     FROM users
     WHERE email = ?`,
    [email],
  );
}

async function logDuplicateRegistration(
  db: D1Database,
  email: string,
  current: number,
): Promise<void> {
  await execute(
    db,
    `INSERT INTO audit_logs (
       id, organization_id, actor_user_id, entity_type, entity_id, action,
       before_json, after_json, reason, created_at
     ) VALUES (?, NULL, NULL, 'auth', ?, 'duplicate_registration', NULL, NULL, ?, ?)`,
    [crypto.randomUUID(), email, `Duplicate registration attempt for ${email}`, current],
  );
}