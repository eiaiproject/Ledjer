import { test, expect } from "@playwright/test";
import { E2E } from "./fixtures/env";
import { E2E_OWNER, E2E_OWNER2, E2E_STAFF } from "./fixtures/users";
import {
  ensureTestUser,
  seedOrganization,
  loginUser,
  seedStaffMember,
} from "./fixtures/seed";
import { cleanupE2EOrganizations, cleanupE2EUsers } from "./fixtures/cleanup";

// ── Helpers ──────────────────────────────────────────────────────────────

const SR_HEADERS = {
  apikey: E2E.serviceRoleKey,
  Authorization: `Bearer ${E2E.serviceRoleKey}`,
  "Content-Type": "application/json",
};

function userHeaders(token: string) {
  return {
    apikey: E2E.supabaseAnonKey,
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

async function rpc(
  token: string,
  fn: string,
  body: Record<string, unknown>,
): Promise<{ status: number; data: unknown }> {
  const res = await fetch(`${E2E.supabaseUrl}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: userHeaders(token),
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

async function setOrgPlan(
  orgId: string,
  plan: "free" | "solo" | "business",
): Promise<void> {
  const res = await fetch(
    `${E2E.supabaseUrl}/rest/v1/organizations?id=eq.${orgId}`,
    {
      method: "PATCH",
      headers: SR_HEADERS,
      body: JSON.stringify({
        current_plan: plan,
        subscription_status: plan === "free" ? null : "active",
      }),
    },
  );
  expect(res.ok).toBe(true);
}

async function getInvitationById(invitationId: string) {
  const res = await fetch(
    `${E2E.supabaseUrl}/rest/v1/organization_invitations?id=eq.${invitationId}&select=id,status,email,expires_at&limit=1`,
    { headers: SR_HEADERS },
  );
  expect(res.ok).toBe(true);
  const rows = await res.json();
  return rows[0] ?? null;
}

async function expireInvitation(invitationId: string): Promise<void> {
  const past = new Date(Date.now() - 60_000).toISOString();
  const res = await fetch(
    `${E2E.supabaseUrl}/rest/v1/organization_invitations?id=eq.${invitationId}`,
    {
      method: "PATCH",
      headers: SR_HEADERS,
      body: JSON.stringify({ expires_at: past }),
    },
  );
  expect(res.ok).toBe(true);
}

async function getMemberCount(orgId: string, userId: string) {
  const res = await fetch(
    `${E2E.supabaseUrl}/rest/v1/organization_members?organization_id=eq.${orgId}&user_id=eq.${userId}&status=neq.removed&select=id`,
    { headers: SR_HEADERS },
  );
  expect(res.ok).toBe(true);
  return (await res.json()).length;
}

async function getMemberRow(orgId: string, userId: string) {
  const res = await fetch(
    `${E2E.supabaseUrl}/rest/v1/organization_members?organization_id=eq.${orgId}&user_id=eq.${userId}&select=id,status,role&limit=1`,
    { headers: SR_HEADERS },
  );
  expect(res.ok).toBe(true);
  const rows = await res.json();
  return rows[0] ?? null;
}

/**
 * Revoke an invitation — service-role PATCH directly.
 * PostgREST returns 204 (No Content) on successful PATCH without Prefer header.
 */
async function revokeInvite(
  invitationId: string,
): Promise<{ status: number; data: unknown }> {
  const res = await fetch(
    `${E2E.supabaseUrl}/rest/v1/organization_invitations?id=eq.${invitationId}`,
    {
      method: "PATCH",
      headers: SR_HEADERS,
      body: JSON.stringify({ status: "revoked" }),
    },
  );
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

/**
 * create_invitation RPC returns { invitation_id, email, token, expires_at, resent }
 * NOT { id, token }.
 */
interface InvitationResult {
  invitation_id: string;
  email: string;
  token: string;
  expires_at: string;
  resent: boolean;
}

async function createBusinessOrg(ownerEmail: string) {
  const owner =
    ownerEmail === E2E_OWNER.email
      ? E2E_OWNER
      : ownerEmail === E2E_OWNER2.email
        ? E2E_OWNER2
        : E2E_STAFF;
  const ownerId = await ensureTestUser(owner);
  const ownerToken = await loginUser(owner);
  const orgId = await seedOrganization(
    ownerId,
    `[E2E] Invite ${Date.now()}`,
    owner,
  );
  await setOrgPlan(orgId, "business");
  return { orgId, ownerId, ownerToken };
}

// ── Tests ────────────────────────────────────────────────────────────────

test.describe("Team invites: security + membership lifecycle", () => {
  test.skip(!E2E.isFullLocal, "Butuh local Supabase + service role key");
  test.describe.configure({ mode: "serial" });

  test.beforeAll(async () => {
    await ensureTestUser(E2E_OWNER);
    await ensureTestUser(E2E_OWNER2);
    await ensureTestUser(E2E_STAFF);
  });

  test.afterAll(async () => {
    await cleanupE2EOrganizations();
    await cleanupE2EUsers();
  });

  test("revoked invite cannot be accepted", async () => {
    const { orgId, ownerToken } = await createBusinessOrg(E2E_OWNER.email);
    const staffId = await ensureTestUser(E2E_STAFF);
    const staffToken = await loginUser(E2E_STAFF);

    const createRes = await rpc(ownerToken, "create_invitation", {
      p_organization_id: orgId,
      p_email: E2E_STAFF.email,
    });
    expect(createRes.status).toBe(200);
    const invitation = createRes.data as InvitationResult;

    // Revoke via service-role PATCH (204 = success with no content)
    const revokeRes = await revokeInvite(invitation.invitation_id);
    expect([200, 204]).toContain(revokeRes.status);

    // Verify invitation is revoked in DB
    const dbInvite = await getInvitationById(invitation.invitation_id);
    expect(dbInvite?.status).toBe("revoked");

    // Accept should fail
    const acceptRes = await rpc(staffToken, "accept_invitation", {
      p_token: invitation.token,
    });
    expect(acceptRes.status).not.toBe(200);

    const memberCount = await getMemberCount(orgId, staffId);
    expect(memberCount).toBe(0);
  });

  test("expired invite cannot be accepted", async () => {
    const { orgId, ownerToken } = await createBusinessOrg(E2E_OWNER.email);
    const userId = await ensureTestUser(E2E_OWNER2);
    const userToken = await loginUser(E2E_OWNER2);

    const createRes = await rpc(ownerToken, "create_invitation", {
      p_organization_id: orgId,
      p_email: E2E_OWNER2.email,
    });
    expect(createRes.status).toBe(200);
    const invitation = createRes.data as InvitationResult;

    await expireInvitation(invitation.invitation_id);

    const acceptRes = await rpc(userToken, "accept_invitation", {
      p_token: invitation.token,
    });
    expect(acceptRes.status).not.toBe(200);

    const dbInvite = await getInvitationById(invitation.invitation_id);
    // Status should be 'expired' (set by accept_invitation) or still 'pending'
    // if the RPC failed before reaching the expiration check.
    // Either way, the invitation must NOT be 'accepted'.
    expect(dbInvite?.status).not.toBe("accepted");

    const memberCount = await getMemberCount(orgId, userId);
    expect(memberCount).toBe(0);
  });

  test("accept invite does not duplicate membership", async () => {
    const { orgId, ownerToken } = await createBusinessOrg(E2E_OWNER.email);
    const staffId = await ensureTestUser(E2E_STAFF);
    const staffToken = await loginUser(E2E_STAFF);

    const createRes = await rpc(ownerToken, "create_invitation", {
      p_organization_id: orgId,
      p_email: E2E_STAFF.email,
    });
    expect(createRes.status).toBe(200);
    const invitation = createRes.data as InvitationResult;

    // First accept: should succeed
    const accept1 = await rpc(staffToken, "accept_invitation", {
      p_token: invitation.token,
    });
    expect(accept1.status).toBe(200);

    const countAfterFirst = await getMemberCount(orgId, staffId);
    expect(countAfterFirst).toBe(1);

    // Second accept: should fail (already a member)
    const accept2 = await rpc(staffToken, "accept_invitation", {
      p_token: invitation.token,
    });
    expect(accept2.status).not.toBe(200);

    const countAfterSecond = await getMemberCount(orgId, staffId);
    expect(countAfterSecond).toBe(1);

    const dbInvite = await getInvitationById(invitation.invitation_id);
    expect(dbInvite?.status).toBe("accepted");
  });

  test("removed staff cannot access with old session", async () => {
    const { orgId, ownerToken } = await createBusinessOrg(E2E_OWNER.email);
    const staffId = await ensureTestUser(E2E_STAFF);

    await seedStaffMember(orgId, staffId, {
      can_create_transaction: true,
      can_view_reports: true,
    });

    const staffToken = await loginUser(E2E_STAFF);

    // Before removal: staff can access
    const beforeRemove = await rpc(staffToken, "get_monthly_usage", {
      p_org_id: orgId,
    });
    expect(beforeRemove.status).toBe(200);

    const member = await getMemberRow(orgId, staffId);
    expect(member?.status).toBe("active");

    // Owner removes staff
    const removeRes = await rpc(ownerToken, "remove_staff", {
      p_organization_id: orgId,
      p_member_id: member!.id,
    });
    expect(removeRes.status).toBe(200);

    // After removal: same session token is rejected (RLS blocks)
    const afterRemove = await rpc(staffToken, "get_monthly_usage", {
      p_org_id: orgId,
    });
    expect(afterRemove.status).not.toBe(200);

    const removedMember = await getMemberRow(orgId, staffId);
    expect(removedMember?.status).toBe("removed");
  });

  test("invite cannot be accepted by the wrong email", async () => {
    const { orgId, ownerToken } = await createBusinessOrg(E2E_OWNER.email);
    const intendedUserId = await ensureTestUser(E2E_STAFF);
    const wrongUserId = await ensureTestUser(E2E_OWNER2);
    const wrongUserToken = await loginUser(E2E_OWNER2);

    const createRes = await rpc(ownerToken, "create_invitation", {
      p_organization_id: orgId,
      p_email: E2E_STAFF.email,
    });
    expect(createRes.status).toBe(200);
    const invitation = createRes.data as InvitationResult;

    // Wrong user tries to accept
    const acceptRes = await rpc(wrongUserToken, "accept_invitation", {
      p_token: invitation.token,
    });
    expect(acceptRes.status).not.toBe(200);

    // Invitation still pending
    const inviteRow = await getInvitationById(invitation.invitation_id);
    expect(inviteRow?.status).toBe("pending");

    // Neither user was added as member
    const intendedCount = await getMemberCount(orgId, intendedUserId);
    const wrongCount = await getMemberCount(orgId, wrongUserId);
    expect(intendedCount).toBe(0);
    expect(wrongCount).toBe(0);
  });
});
