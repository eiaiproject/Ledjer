import { execute, queryAll, queryFirst } from "../db/client";
import { generateId, generateToken, hashToken } from "../auth/tokens";
import { notFound, badRequest } from "../http/errors";
import { prepareList, countRows } from "./list-utils";
import { logAdminEvent } from "./admin-audit.service";
import { sendEmail } from "./email.service";

const PASSWORD_RESET_TTL_MS = 1000 * 60 * 60; // 1 hour

interface UserRow {
  id: string;
  email: string;
  full_name: string;
  status: "active" | "disabled";
  email_verified_at: number | null;
  created_at: number;
  updated_at: number;
}

export interface AdminUserDetail extends UserRow {
  organization_count: number;
  has_oauth: boolean;
  member_roles: { organization_id: string; organization_name: string; role: string }[];
}

export async function listUsers(
  db: D1Database,
  filters: { search?: string; status?: string; limit?: number; offset?: number },
): Promise<{ users: AdminUserDetail[]; total: number }> {
  const { where, limit, offset, values } = prepareList(
    filters,
    "(lower(u.email) LIKE ? OR lower(u.full_name) LIKE ?)",
    "u.status",
  );

  const total = await countRows(db, "users u", where, values);
  const rows = await queryAll<UserRow>(
    db,
    `SELECT u.id, u.email, u.full_name, u.status, u.email_verified_at, u.created_at, u.updated_at
     FROM users u ${where}
     ORDER BY u.created_at DESC
     LIMIT ? OFFSET ?`,
    [...values, limit, offset],
  );

  const users: AdminUserDetail[] = [];
  for (const row of rows) {
    users.push(await toDetail(db, row));
  }

  return { users, total };
}

export async function getUserDetail(
  db: D1Database,
  userId: string,
): Promise<AdminUserDetail> {
  const row = await queryFirst<UserRow>(
    db,
    "SELECT id, email, full_name, status, email_verified_at, created_at, updated_at FROM users WHERE id = ?",
    [userId],
  );
  if (!row) throw notFound("user_not_found", "User not found");
  return toDetail(db, row);
}

async function toDetail(db: D1Database, row: UserRow): Promise<AdminUserDetail> {
  const orgCount = await queryFirst<{ c: number }>(
    db,
    "SELECT COUNT(*) AS c FROM organization_members WHERE user_id = ? AND status = 'active'",
    [row.id],
  );
  const oauth = await queryFirst<{ id: string }>(
    db,
    "SELECT id FROM oauth_accounts WHERE user_id = ? LIMIT 1",
    [row.id],
  );
  const memberRoles = await queryAll<{ organization_id: string; organization_name: string; role: string }>(
    db,
    `SELECT m.organization_id, o.name AS organization_name, m.role
     FROM organization_members m
     JOIN organizations o ON o.id = m.organization_id
     WHERE m.user_id = ? AND m.status = 'active'
     ORDER BY o.created_at ASC`,
    [row.id],
  );

  return {
    ...row,
    organization_count: orgCount?.c ?? 0,
    has_oauth: !!oauth,
    member_roles: memberRoles,
  };
}

export async function setUserStatus(
  db: D1Database,
  actor: { id: string; email: string },
  userId: string,
  status: "active" | "disabled",
): Promise<void> {
  const user = await queryFirst<{ email: string; status: string }>(
    db,
    "SELECT email, status FROM users WHERE id = ?",
    [userId],
  );
  if (!user) throw notFound("user_not_found", "User not found");

  await execute(
    db,
    "UPDATE users SET status = ?, updated_at = ? WHERE id = ?",
    [status, Date.now(), userId],
  );
  if (status === "disabled") {
    // Revoke all sessions so a disabled user is signed out immediately.
    await execute(
      db,
      "UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL",
      [Date.now(), userId],
    );
  }

  await logAdminEvent(db, {
    actorAdminId: actor.id,
    actorEmail: actor.email,
    entityType: "user",
    entityId: userId,
    action: status === "disabled" ? "user_disabled" : "user_enabled",
    before: { status: user.status },
    after: { email: user.email, status },
  });
}

/**
 * Create a password_reset_tokens row and email the user a recovery link
 * pointing at the main app (ledjer.id) — the admin dashboard never hosts
 * user-facing flows.
 */
export async function sendUserPasswordReset(
  db: D1Database,
  actor: { id: string; email: string },
  userId: string,
  opts: { emailApiKey?: string; emailFrom?: string; userAppOrigin?: string },
): Promise<void> {
  const user = await queryFirst<{ id: string; email: string; status: string }>(
    db,
    "SELECT id, email, status FROM users WHERE id = ?",
    [userId],
  );
  if (!user) throw notFound("user_not_found", "User not found");
  if (user.status !== "active") {
    throw badRequest("user_not_active", "Cannot reset password for a disabled user");
  }

  const token = generateToken();
  const current = Date.now();
  await execute(
    db,
    `INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at, created_at)
     VALUES (?, ?, ?, ?, ?)`,
    [generateId(), user.id, await hashToken(token), current + PASSWORD_RESET_TTL_MS, current],
  );

  if (opts.emailApiKey && opts.userAppOrigin) {
    const link = `${opts.userAppOrigin}/auth/callback?token=${token}&type=recovery`;
    await sendEmail(opts.emailApiKey, {
      to: user.email,
      subject: "Atur ulang password — Ledjer",
      html: `<p>Admin Ledjer telah meminta reset password untuk akun Anda.</p><p>Klik tautan berikut untuk mengatur ulang password Anda:</p><p><a href="${link}">${link}</a></p><p>Tautan berlaku selama 1 jam.</p>`,
    }, opts.emailFrom);
  }

  await logAdminEvent(db, {
    actorAdminId: actor.id,
    actorEmail: actor.email,
    entityType: "user",
    entityId: userId,
    action: "user_password_reset_requested",
    after: { email: user.email },
  });
}

/** Permanently delete a user account and cascade-delete owned orgs. */
export async function deleteUser(
  db: D1Database,
  actor: { id: string; email: string },
  userId: string,
): Promise<void> {
  const user = await queryFirst<{ id: string; email: string }>(
    db,
    "SELECT id, email FROM users WHERE id = ?",
    [userId],
  );
  if (!user) throw notFound("user_not_found", "User not found");

  const ownedOrgs = await queryAll<{ organization_id: string }>(
    db,
    "SELECT organization_id FROM organization_members WHERE user_id = ? AND role = 'owner'",
    [userId],
  );

  const current = Date.now();
  // Audit trail first — actor NULL survives the user delete.
  await execute(
    db,
    `INSERT INTO audit_logs (id, organization_id, actor_user_id, entity_type, entity_id, action, created_at)
     VALUES (?, NULL, NULL, 'user', ?, 'account_deleted_by_admin', ?)`,
    [generateId(), user.email, current],
  );

  const statements: D1PreparedStatement[] = [
    db.prepare("DELETE FROM audit_logs WHERE actor_user_id = ?").bind(userId),
    ...ownedOrgs.map((org) =>
      db.prepare("DELETE FROM organizations WHERE id = ?").bind(org.organization_id),
    ),
    db.prepare("DELETE FROM login_attempts WHERE email = ?").bind(user.email),
    db.prepare("DELETE FROM users WHERE id = ?").bind(userId),
  ];
  await db.batch(statements);

  await logAdminEvent(db, {
    actorAdminId: actor.id,
    actorEmail: actor.email,
    entityType: "user",
    entityId: userId,
    action: "user_deleted",
    before: { email: user.email },
  });
}
