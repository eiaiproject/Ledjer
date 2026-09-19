import { execute, queryFirst } from "../db/client";
import { forbidden, unauthorized } from "../http/errors";
import { hashPassword, verifyPassword } from "../auth/password";
import { logAuthEvent } from "./auth-audit.service";
import { createDefaultAccounts } from "./ledger.service";
import { createSession, revokeAllUserSessions, type CreatedSession } from "./session.service";

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
  businessName: string;
}

export interface RegisterResult {
  userId: string;
  businessName: string;
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
    // Samakan biaya hashing agar register gagal ≈ sukses (mitigasi enumerasi via timing, #4).
    await hashPassword(input.password, pepper);
    await logDuplicateRegistration(db, email, current);
    throw forbidden("email_taken", "Email sudah terdaftar.");
  }

  const businessName = input.businessName.trim();
  const userId = crypto.randomUUID();
  await execute(
    db,
    `INSERT INTO users (
       id, email, password_hash, full_name, business_name, status, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, 'active', ?, ?)`,
    [
      userId,
      email,
      await hashPassword(input.password, pepper),
      input.fullName.trim(),
      businessName,
      current,
      current,
    ],
  );

  // Setiap buku lahir siap pakai: chart of accounts default ikut dibuat.
  await createDefaultAccounts(db, userId, current);
  const session = await createSession(db, userId, request);

  await logAuthEvent(db, userId, "registration", { email, businessName });
  return { userId, businessName, session };
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
  if (!user) {
    // Mitigasi timing side-channel (#5): user tidak ada tetap bakar biaya
    // PBKDF2 agar waktu respons ≈ password salah (verifyPassword dummy).
    await verifyPassword(password, "invalid-hash", pepper);
    throw unauthorized("Email atau password salah.");
  }
  if (!(await verifyPassword(password, user.password_hash, pepper))) {
    throw unauthorized("Email atau password salah.");
  }

  if (user.status !== "active") {
    throw forbidden("user_disabled", "Akun dinonaktifkan.");
  }

  await logAuthEvent(db, user.id, "login_success", { email });
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
  await logAuthEvent(db, userId, "password_changed", {});
}

export async function updateBusinessName(
  db: D1Database,
  userId: string,
  rawName: string,
): Promise<string> {
  const name = rawName.trim();
  if (!name) {
    throw forbidden("business_name_required", "Nama usaha harus diisi.");
  }
  if (name.length > 120) {
    throw forbidden("business_name_too_long", "Nama usaha maksimal 120 karakter.");
  }
  await execute(
    db,
    "UPDATE users SET business_name = ?, updated_at = ? WHERE id = ?",
    [name, Date.now(), userId],
  );
  await logAuthEvent(db, userId, "business_name_updated", { businessName: name });
  return name;
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
       id, user_id, actor_user_id, entity_type, entity_id, action,
       before_json, after_json, reason, created_at
     ) VALUES (?, NULL, NULL, 'auth', ?, 'duplicate_registration', NULL, NULL, ?, ?)`,
    [crypto.randomUUID(), email, `Duplicate registration attempt for ${email}`, current],
  );
}
