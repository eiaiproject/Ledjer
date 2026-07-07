import { describe, expect, it } from "vitest";
import { hashToken } from "../auth/tokens";
import { FakeD1Database } from "../test/fake-d1";
import {
  acceptTeamInvitation,
  buildInvitationAcceptUrl,
  createTeamInvitation,
  normalizeInvitationEmail,
  removeTeamMember,
} from "./team.service";
import type { CurrentSessionRow } from "./session.service";

interface FakeInvitation {
  id: string;
  organization_id: string;
  email: string;
  role: "admin" | "member" | "viewer";
  token_hash: string;
  status: "pending" | "accepted" | "revoked" | "expired";
  invited_by: string;
  accepted_by: string | null;
  expires_at: number;
  accepted_at: number | null;
  revoked_at: number | null;
  created_at: number;
  updated_at: number;
}

type TeamDb = FakeD1Database & {
  readonly invitationInsertValues: unknown[] | null;
  readonly memberWriteCount: number;
};

function teamDb(
  invitation: FakeInvitation | null = null,
  member: Record<string, unknown> | null = null,
): TeamDb {
  const state = {
    invitationInsertValues: null as unknown[] | null,
    memberWriteCount: 0,
  };
  const db = new FakeD1Database({
    first: (sql) => {
      if (sql.includes("FROM organization_invitations WHERE token_hash")) return invitation;
      if (sql.includes("FROM organization_members m")) return member;
      return null;
    },
    run: (sql, values) => {
      if (sql.includes("INSERT INTO organization_invitations")) {
        state.invitationInsertValues = values;
      }
      if (
        sql.includes("INSERT INTO organization_members") ||
        sql.includes("UPDATE organization_members")
      ) {
        state.memberWriteCount += 1;
      }
    },
  }) as TeamDb;

  Object.defineProperties(db, {
    invitationInsertValues: { get: () => state.invitationInsertValues },
    memberWriteCount: { get: () => state.memberWriteCount },
  });

  return db;
}

function session(overrides: Partial<CurrentSessionRow> = {}): CurrentSessionRow {
  return {
    session_id: "session-1",
    user_id: "user-1",
    expires_at: Date.now() + 60_000,
    current_organization_id: null,
    email: "invitee@example.com",
    full_name: "Invitee",
    email_verified_at: Date.now(),
    ...overrides,
  };
}

describe("team invitation helpers", () => {
  it("normalizes invitation emails and rejects invalid values", () => {
    expect(normalizeInvitationEmail(" USER@Example.COM ")).toBe("user@example.com");
    expect(() => normalizeInvitationEmail("not-an-email")).toThrow(
      expect.objectContaining({ code: "invitation_email_invalid" }),
    );
  });

  it("builds accept links without exposing implementation routes", () => {
    expect(buildInvitationAcceptUrl("https://app.example", "abc123")).toBe(
      "https://app.example/invitations/accept?token=abc123",
    );
  });

  it("does not allow removing an owner member", async () => {
    const db = teamDb(null, {
      id: "member-owner",
      organization_id: "org-1",
      user_id: "owner-1",
      role: "owner",
      status: "active",
      joined_at: Date.now(),
      full_name: "Owner",
      email: "owner@example.com",
    });

    await expect(
      removeTeamMember(db as unknown as D1Database, {
        organizationId: "org-1",
        memberId: "member-owner",
        actorUserId: "admin-1",
      }),
    ).rejects.toMatchObject({
      code: "member_role_protected",
      status: 403,
    });
    expect(db.memberWriteCount).toBe(0);
  });

  it("does not allow a non-owner member to remove themselves", async () => {
    const db = teamDb(null, {
      id: "member-admin",
      organization_id: "org-1",
      user_id: "admin-1",
      role: "admin",
      status: "active",
      joined_at: Date.now(),
      full_name: "Admin",
      email: "admin@example.com",
    });

    await expect(
      removeTeamMember(db as unknown as D1Database, {
        organizationId: "org-1",
        memberId: "member-admin",
        actorUserId: "admin-1",
      }),
    ).rejects.toMatchObject({
      code: "member_self_remove_forbidden",
      status: 403,
    });
    expect(db.memberWriteCount).toBe(0);
  });
});

describe("team invitation service", () => {
  it("stores only the invitation token hash when creating an invitation", async () => {
    const db = teamDb();
    const result = await createTeamInvitation(db as unknown as D1Database, {
      organizationId: "org-1",
      invitedByUserId: "owner-1",
      email: "invitee@example.com",
      role: "member",
      requestId: "request-1",
    });

    expect(result.token).toBeTruthy();
    expect(db.invitationInsertValues?.[4]).toMatch(/^[a-f0-9]{64}$/);
    expect(db.invitationInsertValues?.[4]).toBe(await hashToken(result.token));
    expect(db.invitationInsertValues).not.toContain(result.token);
  });

  it("rejects revoked, accepted, or expired invitations before member writes", async () => {
    const db = teamDb({
      id: "invitation-1",
      organization_id: "org-1",
      email: "invitee@example.com",
      role: "member",
      token_hash: await hashToken("used-token"),
      status: "revoked",
      invited_by: "owner-1",
      accepted_by: null,
      expires_at: Date.now() + 60_000,
      accepted_at: null,
      revoked_at: Date.now(),
      created_at: Date.now(),
      updated_at: Date.now(),
    });

    await expect(
      acceptTeamInvitation(db as unknown as D1Database, session(), "used-token"),
    ).rejects.toMatchObject({
      code: "invitation_not_pending",
      status: 409,
    });
    expect(db.memberWriteCount).toBe(0);
  });
});
