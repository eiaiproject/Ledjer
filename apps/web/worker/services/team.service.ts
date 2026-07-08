import { generateId, generateToken, hashToken } from "../auth/tokens";
import { execute, nowMs, queryAll, queryFirst } from "../db/client";
import type { Role } from "../db/schema";
import { badRequest, conflict, forbidden, notFound } from "../http/errors";
import {
  setSessionCurrentOrganization,
  type CurrentSessionRow,
} from "./session.service";

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/;

export const INVITABLE_ROLES = ["admin", "member", "viewer"] as const;
export type InvitableRole = (typeof INVITABLE_ROLES)[number];

export interface PublicTeamMember {
  id: string;
  organization_id: string;
  user_id: string;
  role: Role;
  status: string;
  joined_at: number | null;
  full_name: string;
  email: string;
  can_create_transaction: boolean;
  can_view_reports: boolean;
  can_manage_accounts: boolean;
  can_void_transaction: boolean;
  can_manage_products: boolean;
  can_view_audit_log: boolean;
}

export interface PublicTeamInvitation {
  id: string;
  email: string;
  role: InvitableRole;
  status: string;
  expires_at: number;
  created_at: number;
  invited_by_name: string | null;
}

export interface CreatedTeamInvitation extends PublicTeamInvitation {
  invitation_id: string;
  token: string;
  resent: boolean;
}

export interface InvitationAcceptResult {
  organization_id: string;
  member_id: string;
  role: Role;
}

export interface TeamInvitationEmailInput {
  email: string;
  role: InvitableRole;
  organizationName: string;
  inviterName: string;
  acceptUrl: string;
}

export interface TeamInvitationEmailSender {
  sendInvitation(input: TeamInvitationEmailInput): Promise<void>;
}

export const devTeamInvitationEmailSender: TeamInvitationEmailSender = {
  async sendInvitation() {
    // Dev stub: production wiring can replace this with a provider-backed sender.
  },
};

interface TeamMemberRow {
  id: string;
  organization_id: string;
  user_id: string;
  role: Role;
  status: string;
  joined_at: number | null;
  full_name: string;
  email: string;
}

interface InvitationRow {
  id: string;
  organization_id: string;
  email: string;
  role: InvitableRole;
  token_hash: string;
  status: "pending" | "accepted" | "revoked" | "expired";
  invited_by: string;
  accepted_by: string | null;
  expires_at: number;
  accepted_at: number | null;
  revoked_at: number | null;
  created_at: number;
  updated_at: number;
  invited_by_name?: string | null;
}

interface ExistingMemberRow {
  id: string;
  user_id: string;
  role: Role;
  status: string;
}

interface UserIdRow {
  id: string;
}

export async function listTeamMembers(
  db: D1Database,
  organizationId: string,
): Promise<PublicTeamMember[]> {
  const rows = await queryAll<TeamMemberRow>(
    db,
    `SELECT
       m.id,
       m.organization_id,
       m.user_id,
       m.role,
       m.status,
       m.joined_at,
       u.full_name,
       u.email
     FROM organization_members m
     JOIN users u ON u.id = m.user_id
     WHERE m.organization_id = ?
       AND m.status = 'active'
     ORDER BY
       CASE m.role
         WHEN 'owner' THEN 1
         WHEN 'admin' THEN 2
         WHEN 'member' THEN 3
         WHEN 'viewer' THEN 4
         ELSE 5
       END,
       lower(u.full_name),
       lower(u.email)`,
    [organizationId],
  );

  return rows.map(toPublicTeamMember);
}

export async function listPendingInvitations(
  db: D1Database,
  organizationId: string,
): Promise<PublicTeamInvitation[]> {
  await expirePendingInvitations(db, organizationId);

  const rows = await queryAll<InvitationRow>(
    db,
    `SELECT
       oi.id,
       oi.organization_id,
       oi.email,
       oi.role,
       oi.token_hash,
       oi.status,
       oi.invited_by,
       oi.accepted_by,
       oi.expires_at,
       oi.accepted_at,
       oi.revoked_at,
       oi.created_at,
       oi.updated_at,
       u.full_name AS invited_by_name
     FROM organization_invitations oi
     JOIN users u ON u.id = oi.invited_by
     WHERE oi.organization_id = ?
       AND oi.status = 'pending'
     ORDER BY oi.created_at DESC`,
    [organizationId],
  );

  return rows.map(toPublicInvitation);
}

export async function createTeamInvitation(
  db: D1Database,
  input: {
    organizationId: string;
    invitedByUserId: string;
    email: string;
    role?: InvitableRole;
    requestId?: string;
  },
): Promise<CreatedTeamInvitation> {
  const email = normalizeInvitationEmail(input.email);
  const role = input.role ?? "member";
  assertInvitableRole(role);

  const current = nowMs();
  await expirePendingInvitations(db, input.organizationId, email, current);
  await ensureEmailIsNotActiveMember(db, input.organizationId, email);

  const token = generateToken(32);
  const tokenHash = await hashToken(token);
  const expiresAt = current + INVITATION_TTL_MS;

  const existing = await queryFirst<InvitationRow>(
    db,
    `SELECT *
     FROM organization_invitations
     WHERE organization_id = ?
       AND lower(email) = lower(?)
       AND status = 'pending'
       AND expires_at > ?
     ORDER BY created_at DESC
     LIMIT 1`,
    [input.organizationId, email, current],
  );

  if (existing) {
    await execute(
      db,
      `UPDATE organization_invitations
       SET token_hash = ?,
           role = ?,
           invited_by = ?,
           expires_at = ?,
           updated_at = ?
       WHERE id = ?
         AND organization_id = ?
         AND status = 'pending'`,
      [
        tokenHash,
        role,
        input.invitedByUserId,
        expiresAt,
        current,
        existing.id,
        input.organizationId,
      ],
    );

    await writeTeamAudit(db, {
      organizationId: input.organizationId,
      actorUserId: input.invitedByUserId,
      entityType: "invitation",
      entityId: existing.id,
      action: "invitation_resent",
      after: { email, role, expires_at: expiresAt },
      requestId: input.requestId,
      current,
    });

    return {
      ...toPublicInvitation({
        ...existing,
        role,
        invited_by: input.invitedByUserId,
        expires_at: expiresAt,
        updated_at: current,
      }),
      invitation_id: existing.id,
      token,
      resent: true,
    };
  }

  const invitationId = generateId();
  await execute(
    db,
    `INSERT INTO organization_invitations (
       id, organization_id, email, role, token_hash, status, invited_by,
       expires_at, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?)`,
    [
      invitationId,
      input.organizationId,
      email,
      role,
      tokenHash,
      input.invitedByUserId,
      expiresAt,
      current,
      current,
    ],
  );

  await writeTeamAudit(db, {
    organizationId: input.organizationId,
    actorUserId: input.invitedByUserId,
    entityType: "invitation",
    entityId: invitationId,
    action: "invitation_created",
    after: { email, role, expires_at: expiresAt },
    requestId: input.requestId,
    current,
  });

  return {
    id: invitationId,
    invitation_id: invitationId,
    email,
    role,
    status: "pending",
    expires_at: expiresAt,
    created_at: current,
    invited_by_name: null,
    token,
    resent: false,
  };
}

export async function acceptTeamInvitation(
  db: D1Database,
  session: CurrentSessionRow,
  tokenInput: string,
  requestId?: string,
): Promise<InvitationAcceptResult> {
  const token = tokenInput.trim();
  if (!token) throw badRequest("invitation_token_required", "Invitation token is required");

  const tokenHash = await hashToken(token);
  const invitation = await queryFirst<InvitationRow>(
    db,
    "SELECT * FROM organization_invitations WHERE token_hash = ? LIMIT 1",
    [tokenHash],
  );

  if (!invitation) {
    throw notFound("invitation_not_found", "Invitation not found");
  }

  const current = nowMs();
  if (invitation.status !== "pending") {
    throw conflict("invitation_not_pending", "Invitation is no longer pending");
  }

  if (invitation.expires_at <= current) {
    await execute(
      db,
      `UPDATE organization_invitations
       SET status = 'expired', updated_at = ?
       WHERE id = ?
         AND status = 'pending'`,
      [current, invitation.id],
    );
    throw conflict("invitation_expired", "Invitation has expired");
  }

  if (session.email.toLowerCase() !== invitation.email.toLowerCase()) {
    throw forbidden("invitation_email_mismatch", "Invitation is for a different email");
  }

  const existingMember = await queryFirst<ExistingMemberRow>(
    db,
    `SELECT id, user_id, role, status
     FROM organization_members
     WHERE organization_id = ?
       AND user_id = ?
     LIMIT 1`,
    [invitation.organization_id, session.user_id],
  );

  let memberId = existingMember?.id ?? generateId();
  if (existingMember && existingMember.status !== "removed") {
    throw conflict("invitation_already_member", "User is already a member of this organization");
  }

  if (existingMember?.status === "removed") {
    await execute(
      db,
      `UPDATE organization_members
       SET role = ?,
           status = 'active',
           invited_by = ?,
           joined_at = ?,
           updated_at = ?
       WHERE id = ?
         AND organization_id = ?`,
      [
        invitation.role,
        invitation.invited_by,
        current,
        current,
        existingMember.id,
        invitation.organization_id,
      ],
    );
    memberId = existingMember.id;
  } else {
    await execute(
      db,
      `INSERT INTO organization_members (
         id, organization_id, user_id, role, status, invited_by,
         joined_at, created_at, updated_at
       ) VALUES (?, ?, ?, ?, 'active', ?, ?, ?, ?)`,
      [
        memberId,
        invitation.organization_id,
        session.user_id,
        invitation.role,
        invitation.invited_by,
        current,
        current,
        current,
      ],
    );
  }

  await execute(
    db,
    `UPDATE organization_invitations
     SET status = 'accepted',
         accepted_by = ?,
         accepted_at = ?,
         updated_at = ?
     WHERE id = ?
       AND status = 'pending'`,
    [session.user_id, current, current, invitation.id],
  );

  await setSessionCurrentOrganization(
    db,
    session.session_id,
    invitation.organization_id,
  );

  await writeTeamAudit(db, {
    organizationId: invitation.organization_id,
    actorUserId: session.user_id,
    entityType: "invitation",
    entityId: invitation.id,
    action: "invitation_accepted",
    after: {
      member_id: memberId,
      email: invitation.email,
      role: invitation.role,
    },
    requestId,
    current,
  });

  return {
    organization_id: invitation.organization_id,
    member_id: memberId,
    role: invitation.role,
  };
}

export async function revokeTeamInvitation(
  db: D1Database,
  input: {
    organizationId: string;
    invitationId: string;
    actorUserId: string;
    requestId?: string;
  },
): Promise<void> {
  const invitation = await queryFirst<InvitationRow>(
    db,
    `SELECT *
     FROM organization_invitations
     WHERE id = ?
       AND organization_id = ?
     LIMIT 1`,
    [input.invitationId, input.organizationId],
  );

  if (!invitation) throw notFound("invitation_not_found", "Invitation not found");
  if (invitation.status !== "pending") {
    throw conflict("invitation_not_pending", "Invitation is no longer pending");
  }

  const current = nowMs();
  await execute(
    db,
    `UPDATE organization_invitations
     SET status = 'revoked',
         revoked_at = ?,
         updated_at = ?
     WHERE id = ?
       AND organization_id = ?
       AND status = 'pending'`,
    [current, current, input.invitationId, input.organizationId],
  );

  await writeTeamAudit(db, {
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
    entityType: "invitation",
    entityId: input.invitationId,
    action: "invitation_revoked",
    before: { email: invitation.email, role: invitation.role },
    requestId: input.requestId,
    current,
  });
}

export async function updateTeamMemberRole(
  db: D1Database,
  input: {
    organizationId: string;
    memberId: string;
    actorUserId: string;
    role: InvitableRole;
    requestId?: string;
  },
): Promise<PublicTeamMember> {
  assertInvitableRole(input.role);
  const member = await getTeamMemberRow(db, input.organizationId, input.memberId);
  if (!member) throw notFound("member_not_found", "Team member not found");
  if (member.role === "owner") {
    throw forbidden("member_role_protected", "Owner role cannot be changed here");
  }

  const current = nowMs();
  if (member.role !== input.role) {
    await execute(
      db,
      `UPDATE organization_members
       SET role = ?,
           updated_at = ?
       WHERE id = ?
         AND organization_id = ?
         AND status = 'active'`,
      [input.role, current, input.memberId, input.organizationId],
    );

    await writeTeamAudit(db, {
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      entityType: "organization_member",
      entityId: input.memberId,
      action: "member_role_updated",
      before: { role: member.role },
      after: { role: input.role },
      requestId: input.requestId,
      current,
    });
  }

  const updated = await getTeamMemberRow(db, input.organizationId, input.memberId);
  if (!updated) throw notFound("member_not_found", "Team member not found");
  return toPublicTeamMember(updated);
}

export async function removeTeamMember(
  db: D1Database,
  input: {
    organizationId: string;
    memberId: string;
    actorUserId: string;
    requestId?: string;
  },
): Promise<void> {
  const member = await getTeamMemberRow(db, input.organizationId, input.memberId);
  if (!member) throw notFound("member_not_found", "Team member not found");
  if (member.role === "owner") {
    throw forbidden("member_role_protected", "Owner cannot be removed here");
  }
  if (member.user_id === input.actorUserId) {
    throw forbidden("member_self_remove_forbidden", "You cannot remove yourself");
  }

  const current = nowMs();
  await execute(
    db,
    `UPDATE organization_members
     SET status = 'removed',
         updated_at = ?
     WHERE id = ?
       AND organization_id = ?
       AND status = 'active'`,
    [current, input.memberId, input.organizationId],
  );

  await writeTeamAudit(db, {
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
    entityType: "organization_member",
    entityId: input.memberId,
    action: "member_removed",
    before: {
      user_id: member.user_id,
      role: member.role,
      status: member.status,
    },
    requestId: input.requestId,
    current,
  });
}

export function normalizeInvitationEmail(email: string): string {
  const normalized = email.trim().toLowerCase();
  if (!EMAIL_RE.test(normalized)) {
    throw badRequest("invitation_email_invalid", "Invitation email is invalid");
  }
  return normalized;
}

export function buildInvitationAcceptUrl(appOrigin: string, token: string): string {
  const url = new URL("/invitations/accept", appOrigin);
  url.searchParams.set("token", token);
  return url.toString();
}

function isInvitableRole(role: string): role is InvitableRole {
  return (INVITABLE_ROLES as readonly string[]).includes(role);
}

function assertInvitableRole(role: string): asserts role is InvitableRole {
  if (!isInvitableRole(role)) {
    throw badRequest("member_role_invalid", "Member role is invalid");
  }
}

async function ensureEmailIsNotActiveMember(
  db: D1Database,
  organizationId: string,
  email: string,
): Promise<void> {
  const user = await queryFirst<UserIdRow>(
    db,
    "SELECT id FROM users WHERE lower(email) = lower(?) LIMIT 1",
    [email],
  );
  if (!user) return;

  const member = await queryFirst<ExistingMemberRow>(
    db,
    `SELECT id, user_id, role, status
     FROM organization_members
     WHERE organization_id = ?
       AND user_id = ?
       AND status != 'removed'
     LIMIT 1`,
    [organizationId, user.id],
  );

  if (member) {
    throw conflict("invitation_already_member", "Email is already a member of this organization");
  }
}

async function expirePendingInvitations(
  db: D1Database,
  organizationId: string,
  email?: string,
  current = nowMs(),
): Promise<void> {
  const emailFilter = email ? "AND lower(email) = lower(?)" : "";
  await execute(
    db,
    `UPDATE organization_invitations
     SET status = 'expired',
         updated_at = ?
     WHERE organization_id = ?
       AND status = 'pending'
       AND expires_at <= ?
       ${emailFilter}`,
    email ? [current, organizationId, current, email] : [current, organizationId, current],
  );
}

async function getTeamMemberRow(
  db: D1Database,
  organizationId: string,
  memberId: string,
): Promise<TeamMemberRow | null> {
  return queryFirst<TeamMemberRow>(
    db,
    `SELECT
       m.id,
       m.organization_id,
       m.user_id,
       m.role,
       m.status,
       m.joined_at,
       u.full_name,
       u.email
     FROM organization_members m
     JOIN users u ON u.id = m.user_id
     WHERE m.id = ?
       AND m.organization_id = ?
       AND m.status = 'active'
     LIMIT 1`,
    [memberId, organizationId],
  );
}

function toPublicInvitation(row: InvitationRow): PublicTeamInvitation {
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    status: row.status,
    expires_at: row.expires_at,
    created_at: row.created_at,
    invited_by_name: row.invited_by_name ?? null,
  };
}

function toPublicTeamMember(row: TeamMemberRow): PublicTeamMember {
  return {
    id: row.id,
    organization_id: row.organization_id,
    user_id: row.user_id,
    role: row.role,
    status: row.status,
    joined_at: row.joined_at,
    full_name: row.full_name,
    email: row.email,
    can_create_transaction: row.role === "owner" || row.role === "admin" || row.role === "member",
    can_view_reports: true,
    can_manage_accounts: row.role === "owner" || row.role === "admin",
    can_void_transaction: row.role === "owner" || row.role === "admin",
    can_manage_products: row.role === "owner" || row.role === "admin",
    can_view_audit_log: row.role === "owner" || row.role === "admin",
  };
}

async function writeTeamAudit(
  db: D1Database,
  input: {
    organizationId: string;
    actorUserId: string;
    entityType: string;
    entityId: string;
    action: string;
    before?: unknown;
    after?: unknown;
    requestId?: string;
    current: number;
  },
): Promise<void> {
  await execute(
    db,
    `INSERT INTO audit_logs (
       id, organization_id, actor_user_id, entity_type, entity_id, action,
       before_json, after_json, request_id, created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      generateId(),
      input.organizationId,
      input.actorUserId,
      input.entityType,
      input.entityId,
      input.action,
      input.before ? JSON.stringify(input.before) : null,
      input.after ? JSON.stringify(input.after) : null,
      input.requestId,
      input.current,
    ],
  );
}
