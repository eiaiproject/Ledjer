import { execute, queryAll, queryFirst } from "../db/client";
import { generateId } from "../auth/tokens";
import { hashPassword, verifyPassword } from "../auth/password";
import { badRequest, forbidden, notFound, unauthorized } from "../http/errors";
import { checkRateLimit } from "./rate-limit.service";
import { logAdminEvent } from "./admin-audit.service";
import {
  createAdminSession,
  revokeAllAdminSessions,
  type CreatedAdminSession,
} from "./admin-session.service";

interface AdminUserRow {
  id: string;
  email: string;
  password_hash: string;
  full_name: string;
  status: "active" | "disabled";
  last_login_at: number | null;
  created_at: number;
  updated_at: number;
}

export interface AdminLoginInput {
  email: string;
  password: string;
}

export async function loginAdmin(
  db: D1Database,
  input: AdminLoginInput,
  request: Request,
  pepper?: string,
): Promise<CreatedAdminSession> {
  const email = input.email.trim().toLowerCase();
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";

  // Anti-brute-force: 5 failed attempts per 15 min per email or IP.
  if (await checkRateLimit(db, "admin_login", email, { max: 5, windowMs: 15 * 60 * 1000 })) {
    throw forbidden("rate_limited", "Too many failed login attempts");
  }
  if (await checkRateLimit(db, "admin_login", ip, { max: 20, windowMs: 15 * 60 * 1000 })) {
    throw forbidden("rate_limited", "Too many failed login attempts");
  }

  const admin = await queryFirst<AdminUserRow>(
    db,
    "SELECT id, email, password_hash, full_name, status, last_login_at, created_at, updated_at FROM admin_users WHERE email = ?",
    [email],
  );

  if (!admin || !(await verifyPassword(input.password, admin.password_hash, pepper))) {
    throw unauthorized("Invalid email or password");
  }
  if (admin.status !== "active") {
    throw forbidden("admin_disabled", "Admin account is disabled");
  }

  await execute(
    db,
    "UPDATE admin_users SET last_login_at = ?, updated_at = ? WHERE id = ?",
    [Date.now(), Date.now(), admin.id],
  );
  await logAdminEvent(db, {
    actorAdminId: admin.id,
    actorEmail: admin.email,
    entityType: "admin",
    entityId: admin.id,
    action: "admin_login",
  });

  return createAdminSession(db, admin.id, request);
}

export async function changeAdminPassword(
  db: D1Database,
  adminUserId: string,
  currentPassword: string,
  nextPassword: string,
  pepper?: string,
): Promise<void> {
  const admin = await queryFirst<AdminUserRow>(
    db,
    "SELECT id, email, password_hash, full_name, status, last_login_at, created_at, updated_at FROM admin_users WHERE id = ?",
    [adminUserId],
  );
  if (!admin || !(await verifyPassword(currentPassword, admin.password_hash, pepper))) {
    throw unauthorized("Invalid current password");
  }

  await execute(
    db,
    "UPDATE admin_users SET password_hash = ?, updated_at = ? WHERE id = ?",
    [await hashPassword(nextPassword, pepper), Date.now(), adminUserId],
  );
  await revokeAllAdminSessions(db, adminUserId);
  await logAdminEvent(db, {
    actorAdminId: admin.id,
    actorEmail: admin.email,
    entityType: "admin",
    entityId: admin.id,
    action: "admin_password_changed",
  });
}

// ── Admin user management ──────────────────────────────────────

export interface CreateAdminInput {
  email: string;
  password: string;
  fullName: string;
}

export async function listAdmins(
  db: D1Database,
): Promise<Array<Omit<AdminUserRow, "password_hash">>> {
  const rows = await queryAll<AdminUserRow>(
    db,
    "SELECT id, email, full_name, status, last_login_at, created_at, updated_at FROM admin_users ORDER BY created_at ASC",
  );
  return rows;
}

export async function createAdmin(
  db: D1Database,
  actor: { id: string; email: string },
  input: CreateAdminInput,
  pepper?: string,
): Promise<Omit<AdminUserRow, "password_hash">> {
  const email = input.email.trim().toLowerCase();
  const existing = await queryFirst<{ id: string }>(
    db,
    "SELECT id FROM admin_users WHERE email = ?",
    [email],
  );
  if (existing) throw badRequest("admin_exists", "Admin with this email already exists");

  const adminId = generateId();
  const now = Date.now();
  await execute(
    db,
    `INSERT INTO admin_users (id, email, password_hash, full_name, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'active', ?, ?)`,
    [adminId, email, await hashPassword(input.password, pepper), input.fullName.trim(), now, now],
  );

  await logAdminEvent(db, {
    actorAdminId: actor.id,
    actorEmail: actor.email,
    entityType: "admin",
    entityId: adminId,
    action: "admin_created",
    after: { email },
  });

  return { id: adminId, email, full_name: input.fullName.trim(), status: "active", last_login_at: null, created_at: now, updated_at: now };
}

export async function setAdminStatus(
  db: D1Database,
  actor: { id: string; email: string },
  adminId: string,
  status: "active" | "disabled",
): Promise<void> {
  if (actor.id === adminId && status === "disabled") {
    throw badRequest("cannot_disable_self", "You cannot disable your own admin account");
  }

  const admin = await queryFirst<AdminUserRow>(
    db,
    "SELECT id, email, full_name, status FROM admin_users WHERE id = ?",
    [adminId],
  );
  if (!admin) throw notFound("admin_not_found", "Admin not found");

  await execute(
    db,
    "UPDATE admin_users SET status = ?, updated_at = ? WHERE id = ?",
    [status, Date.now(), adminId],
  );
  if (status === "disabled") {
    await revokeAllAdminSessions(db, adminId);
  }

  await logAdminEvent(db, {
    actorAdminId: actor.id,
    actorEmail: actor.email,
    entityType: "admin",
    entityId: adminId,
    action: status === "disabled" ? "admin_disabled" : "admin_enabled",
    before: { status: admin.status },
    after: { email: admin.email, status },
  });
}
