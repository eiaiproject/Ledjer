import { describe, expect, it } from "vitest";
import { hashToken } from "./auth/tokens";
import type { Env } from "./env";
import app from "./index";
import { FakeD1Database } from "./test/fake-d1";

interface FakeSession {
  session_id: string;
  user_id: string;
  expires_at: number;
  current_organization_id: string | null;
  email: string;
  full_name: string;
  email_verified_at: number | null;
  token_hash: string;
}

interface FakeOrganization {
  id: string;
  name: string;
  business_type: "service" | "simple_trading";
  base_currency: string;
  books_start_date: string;
  onboarding_status: string;
  created_by: string;
}

interface FakeMember {
  id: string;
  organization_id: string;
  user_id: string;
  role: "owner" | "admin" | "member" | "viewer";
  status: string;
}

function organizationDb(
  session: FakeSession,
  organizations: FakeOrganization[],
  members: FakeMember[],
): D1Database {
  const newOrganizations: FakeOrganization[] = [];
  const newMembers: FakeMember[] = [];

  const findOrganizationMemberRow = (
    sql: string,
    values: unknown[],
  ): Record<string, unknown> | null => {
    const userId = values[0] as string;
    const organizationId = sql.includes("m.organization_id = ?")
      ? values[1] as string
      : undefined;
    const allMembers = [...members, ...newMembers];
    const allOrgs = [...organizations, ...newOrganizations];
    const member = allMembers.find(
      (candidate) =>
        candidate.user_id === userId &&
        candidate.status === "active" &&
        (!organizationId || candidate.organization_id === organizationId),
    );
    if (!member) return null;

    const organization = allOrgs.find(
      (candidate) => candidate.id === member.organization_id,
    );
    if (!organization) return null;

    return {
      organization_id: organization.id,
      organization_name: organization.name,
      business_type: organization.business_type,
      base_currency: organization.base_currency,
      books_start_date: organization.books_start_date,
      onboarding_status: organization.onboarding_status,
      created_by: organization.created_by,
      member_id: member.id,
      user_id: member.user_id,
      role: member.role,
      status: member.status,
    };
  };

  return new FakeD1Database({
    first: (sql, values) => {
      if (sql.includes("FROM sessions s")) {
        const [tokenHash, current] = values as [string, number];
        if (tokenHash !== session.token_hash || session.expires_at <= current) {
          return null;
        }
        return {
          session_id: session.session_id,
          user_id: session.user_id,
          expires_at: session.expires_at,
          current_organization_id: session.current_organization_id,
          email: session.email,
          full_name: session.full_name,
          email_verified_at: session.email_verified_at,
        };
      }

      if (sql.includes("FROM organization_members m")) {
        return findOrganizationMemberRow(sql, values);
      }

      return null;
    },
    all: (sql, values) => {
      if (!sql.includes("FROM organization_members m")) return [];
      const row = findOrganizationMemberRow(sql, values);
      return row ? [row] : [];
    },
    run: (sql, values) => {
      if (sql.includes("UPDATE sessions SET current_organization_id")) {
        session.current_organization_id = values[0] as string | null;
        return;
      }

      if (sql.includes("INSERT INTO")) {
        if (sql.includes("INSERT INTO organizations")) {
          newOrganizations.push({
            id: values[0] as string,
            name: values[1] as string,
            business_type: values[2] as "service" | "simple_trading",
            base_currency: values[3] as string,
            books_start_date: values[4] as string,
            onboarding_status: "completed",
            created_by: values[6] as string,
          });
        }
        if (sql.includes("INSERT INTO organization_members")) {
          newMembers.push({
            id: values[0] as string,
            organization_id: values[1] as string,
            user_id: values[2] as string,
            role: "owner" as const,
            status: "active",
          });
        }
      }
    },
  }) as unknown as D1Database;
}

async function testEnv(token: string): Promise<Env> {
  const session: FakeSession = {
    session_id: "session-1",
    user_id: "user-1",
    expires_at: Date.now() + 60_000,
    current_organization_id: "org-1",
    email: "owner@example.com",
    full_name: "Owner",
    email_verified_at: Date.now(),
    token_hash: await hashToken(token),
  };

  return {
    ASSETS: {
      fetch: () => Promise.resolve(new Response("asset")),
    } as unknown as Fetcher,
    DB: organizationDb(
      session,
      [
        {
          id: "org-1",
          name: "Owner Org",
          business_type: "service",
          base_currency: "IDR",
          books_start_date: "2026-07-07",
          onboarding_status: "completed",
          created_by: "user-1",
        },
        {
          id: "org-2",
          name: "Other Org",
          business_type: "service",
          base_currency: "IDR",
          books_start_date: "2026-07-07",
          onboarding_status: "completed",
          created_by: "user-2",
        },
      ],
      [
        {
          id: "member-1",
          organization_id: "org-1",
          user_id: "user-1",
          role: "owner",
          status: "active",
        },
      ],
    ),
    APP_ORIGIN: "http://localhost:5173",
  };
}

describe("Organization API", () => {
  it("returns the selected current organization for an authenticated member", async () => {
    const token = "session-token";
    const response = await app.fetch(
      new Request("http://localhost/api/organizations/current", {
        headers: { Cookie: `ledjer_session=${token}` },
      }),
      await testEnv(token),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      organization: { id: "org-1", name: "Owner Org" },
      member: {
        organization_id: "org-1",
        user_id: "user-1",
        role: "owner",
        can_manage_accounts: true,
      },
      needsOnboarding: false,
    });
  });

  it("fails closed when the authenticated user is not an organization member", async () => {
    const token = "session-token";
    const response = await app.fetch(
      new Request("http://localhost/api/organizations/org-2", {
        headers: { Cookie: `ledjer_session=${token}` },
      }),
      await testEnv(token),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "organization_forbidden" },
    });
  });

  it("creates organization without opening balances", async () => {
    const token = "session-token";
    const env = await testEnv(token);
    const response = await app.fetch(
      new Request("http://localhost/api/organizations", {
        method: "POST",
        headers: {
          Cookie: `ledjer_session=${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          organizationName: "New Org",
          businessType: "service",
          booksStartDate: "2026-07-07",
          openingCashBalance: 0,
          extraOpeningBalances: [],
        }),
      }),
      env,
    );

    // Organization creation without opening balances should succeed
    expect(response.status).toBe(200);
  });
});
