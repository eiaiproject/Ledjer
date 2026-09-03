import { describe, expect, it } from "vitest";
import { hashToken } from "./auth/tokens";
import type { Env } from "./env";
import { app } from "./index";
import { FakeD1Database } from "./test/fake-d1";

interface FakeOrg {
  id: string;
  name: string;
  base_currency: string;
  status: "active" | "disabled";
  created_at: number;
  updated_at: number;
}

interface FakeMember {
  id: string;
  organization_id: string;
  user_id: string;
  role: "owner";
}

const ORGS: FakeOrg[] = [
  { id: "org-1", name: "Owner Org", base_currency: "IDR", status: "active", created_at: 1, updated_at: 1 },
  { id: "org-2", name: "Other Org", base_currency: "IDR", status: "active", created_at: 1, updated_at: 1 },
];

const MEMBERS: FakeMember[] = [
  { id: "member-1", organization_id: "org-1", user_id: "user-1", role: "owner" },
];

function organizationDb(tokenHash: string): D1Database {
  return new FakeD1Database({
    first: (sql, values) => {
      const s = (sql as string).replace(/\s+/g, " ");
      if (s.includes("FROM sessions s") && s.includes("JOIN users u")) {
        if (tokenHash !== (values[0] as string)) return null;
        return {
          session_id: "session-1",
          user_id: "user-1",
          expires_at: Date.now() + 60_000,
          current_organization_id: "org-1",
          email: "owner@example.com",
          full_name: "Owner",
          last_used_at: Date.now(),
          last_rotated_at: null,
          created_at: Date.now() - 1000,
        };
      }
      if (s.includes("FROM memberships m") && s.includes("JOIN organizations o")) {
        const userId = values[0] as string;
        const orgId = s.includes("m.organization_id = ?") ? (values[1] as string) : undefined;
        const member = MEMBERS.find(
          (m) => m.user_id === userId && (!orgId || m.organization_id === orgId),
        );
        if (!member) return null;
        const org = ORGS.find((o) => o.id === member.organization_id);
        if (!org) return null;
        return {
          organization_id: org.id,
          organization_name: org.name,
          base_currency: org.base_currency,
          organization_status: org.status,
          created_at: org.created_at,
          member_id: member.id,
          user_id: member.user_id,
          role: member.role,
        };
      }
      return null;
    },
    run: (sql, values) => {
      const s = (sql as string).replace(/\s+/g, " ");
      if (s.includes("UPDATE organizations SET name")) {
        const org = ORGS.find((o) => o.id === (values[2] as string));
        if (org) org.name = values[0] as string;
      }
      return { success: true, meta: { changes: 1 } } as D1Result;
    },
  }) as unknown as D1Database;
}

async function testEnv(token: string): Promise<Env> {
  return {
    ASSETS: {
      fetch: () => Promise.resolve(new Response("asset")),
    } as unknown as Fetcher,
    DB: organizationDb(await hashToken(token)),
    APP_ORIGIN: "http://localhost:5173",
  };
}

describe("Organization API", () => {
  it("returns the current organization for an authenticated member", async () => {
    const token = "session-token";
    const response = await app.fetch(
      new Request("http://localhost/api/organizations/current", {
        headers: { Cookie: `ledjer_session=${token}` },
      }),
      await testEnv(token),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      organization: { id: "org-1", name: "Owner Org", base_currency: "IDR" },
      member: {
        organization_id: "org-1",
        user_id: "user-1",
        role: "owner",
        can_manage_accounts: true,
      },
      needsOnboarding: false,
    });
  });

  it("rejects unauthenticated requests", async () => {
    const response = await app.fetch(
      new Request("http://localhost/api/organizations/current"),
      await testEnv("no-such-token"),
    );
    expect(response.status).toBe(401);
  });

  it("rejects a mutating request from a foreign origin (CSRF)", async () => {
    const token = "session-token";
    const response = await app.fetch(
      new Request("http://localhost/api/organizations/current", {
        method: "PATCH",
        headers: {
          Cookie: `ledjer_session=${token}`,
          "Content-Type": "application/json",
          Origin: "https://evil.example",
        },
        body: JSON.stringify({ name: "Hacked" }),
      }),
      await testEnv(token),
    );
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "csrf_invalid" },
    });
  });

  it("updates the organization name", async () => {
    const token = "session-token";
    const response = await app.fetch(
      new Request("http://localhost/api/organizations/current", {
        method: "PATCH",
        headers: {
          Cookie: `ledjer_session=${token}`,
          "Content-Type": "application/json",
          Origin: "http://localhost:5173",
        },
        body: JSON.stringify({ name: "Warung Baru" }),
      }),
      await testEnv(token),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      organization: { id: "org-1", name: "Warung Baru" },
    });
  });
});