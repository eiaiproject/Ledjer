import { Hono } from "hono";
import { z } from "zod";
import type { AppContext } from "../env";
import { readJson } from "../http/json";
import { requireAuth } from "../middleware/auth.middleware";
import {
  loadCurrentOrganization,
  requirePermission,
} from "../middleware/organization.middleware";
import {
  acceptTeamInvitation,
  buildInvitationAcceptUrl,
  createTeamInvitation,
  listPendingInvitations,
  listTeamMembers,
  removeTeamMember,
  revokeTeamInvitation,
  updateTeamMemberRole,
} from "../services/team.service";

const invitationRoleSchema = z.enum(["admin", "member", "viewer"]);

const createInvitationSchema = z.object({
  email: z.string().min(1).max(320),
  role: invitationRoleSchema.default("member"),
});

const acceptInvitationSchema = z.object({
  token: z.string().min(16).max(256),
});

const updateRoleSchema = z.object({
  role: invitationRoleSchema,
});

export const teamRoutes = new Hono<AppContext>();

teamRoutes.use("*", requireAuth());

teamRoutes.post("/invitations/accept", async (c) => {
  const body = await readJson(c, acceptInvitationSchema);
  const result = await acceptTeamInvitation(
    c.env.DB,
    c.get("session"),
    body.token,
    c.get("requestId"),
  );
  return c.json(result);
});

teamRoutes.use("*", loadCurrentOrganization());

teamRoutes.get("/members", requirePermission("team:read"), async (c) => {
  const context = c.get("organizationContext");
  const members = await listTeamMembers(c.env.DB, context.organization.id);
  return c.json({ members });
});

teamRoutes.get("/invitations", requirePermission("team:read"), async (c) => {
  const context = c.get("organizationContext");
  const invitations = await listPendingInvitations(
    c.env.DB,
    context.organization.id,
  );
  return c.json({ invitations });
});

teamRoutes.post("/invitations", requirePermission("team:manage"), async (c) => {
  const context = c.get("organizationContext");
  const body = await readJson(c, createInvitationSchema);
  const invitation = await createTeamInvitation(c.env.DB, {
    organizationId: context.organization.id,
    invitedByUserId: context.member.user_id,
    email: body.email,
    role: body.role,
    requestId: c.get("requestId"),
  });
  const acceptUrl = buildInvitationAcceptUrl(
    c.env.APP_ORIGIN ?? new URL(c.req.url).origin,
    invitation.token,
  );

  // Dev stub: production wiring replaces this with a provider-backed sender.
  await Promise.resolve();

  return c.json({ invitation: { ...invitation, accept_url: acceptUrl } });
});

teamRoutes.delete(
  "/invitations/:invitationId",
  requirePermission("team:manage"),
  async (c) => {
    const context = c.get("organizationContext");
    await revokeTeamInvitation(c.env.DB, {
      organizationId: context.organization.id,
      invitationId: c.req.param("invitationId"),
      actorUserId: context.member.user_id,
      requestId: c.get("requestId"),
    });
    return c.body(null, 204);
  },
);

teamRoutes.patch(
  "/members/:memberId/role",
  requirePermission("team:manage"),
  async (c) => {
    const context = c.get("organizationContext");
    const body = await readJson(c, updateRoleSchema);
    const member = await updateTeamMemberRole(c.env.DB, {
      organizationId: context.organization.id,
      memberId: c.req.param("memberId"),
      actorUserId: context.member.user_id,
      role: body.role,
      requestId: c.get("requestId"),
    });
    return c.json({ member });
  },
);

teamRoutes.delete(
  "/members/:memberId",
  requirePermission("team:manage"),
  async (c) => {
    const context = c.get("organizationContext");
    await removeTeamMember(c.env.DB, {
      organizationId: context.organization.id,
      memberId: c.req.param("memberId"),
      actorUserId: context.member.user_id,
      requestId: c.get("requestId"),
    });
    return c.body(null, 204);
  },
);
