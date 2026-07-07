import { describe, expect, it } from "vitest";
import { SESSION_COOKIE } from "./auth/cookies";
import { hashToken } from "./auth/tokens";
import type { Env } from "./env";
import app from "./index";

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

class FakeD1Statement {
  private values: unknown[] = [];

  constructor(
    private readonly db: FakeD1Database,
    private readonly sql: string,
  ) {}

  bind(...values: unknown[]): FakeD1Statement {
    this.values = values;
    return this;
  }

  async first<T>(): Promise<T | null> {
    return this.db.first<T>(this.sql, this.values);
  }

  async all<T>(): Promise<{ results: T[] }> {
    return { results: await this.db.all<T>(this.sql, this.values) };
  }

  async run(): Promise<D1Result> {
    this.db.run(this.sql, this.values);
    return { success: true } as D1Result;
  }
}

class FakeD1Database {
  public inserts = 0;
  private newOrganizations: FakeOrganization[] = [];
  private newMembers: FakeMember[] = [];

  constructor(
    private readonly session: FakeSession,
    private readonly organizations: FakeOrganization[],
    private readonly members: FakeMember[],
  ) {}

  prepare(sql: string): FakeD1Statement {
    return new FakeD1Statement(this, sql);
  }

  async first<T>(sql: string, values: unknown[]): Promise<T | null> {
    if (sql.includes("FROM sessions s")) {
      const [tokenHash, current] = values as [string, number];
      if (tokenHash !== this.session.token_hash || this.session.expires_at <= current) {
        return null;
      }
      return {
        session_id: this.session.session_id,
        user_id: this.session.user_id,
        expires_at: this.session.expires_at,
        current_organization_id: this.session.current_organization_id,
        email: this.session.email,
        full_name: this.session.full_name,
        email_verified_at: this.session.email_verified_at,
      } as T;
    }

    if (sql.includes("FROM organization_members m")) {
      return this.findOrganizationMemberRow(sql, values) as T | null;
    }

    return null;
  }

  async all<T>(sql: string, values: unknown[]): Promise<T[]> {
    if (!sql.includes("FROM organization_members m")) return [];
    const row = this.findOrganizationMemberRow(sql, values);
    return row ? [row as T] : [];
  }

  run(sql: string, values: unknown[]): void {
    if (sql.includes("UPDATE sessions SET current_organization_id")) {
      this.session.current_organization_id = values[0] as string | null;
      return;
    }

    if (sql.includes("INSERT INTO")) {
      this.inserts += 1;
      // Track new organizations
      if (sql.includes("INSERT INTO organizations")) {
        this.newOrganizations.push({
          id: values[0] as string,
          name: values[1] as string,
          business_type: values[2] as "service" | "simple_trading",
          base_currency: values[3] as string,
          books_start_date: values[4] as string,
          onboarding_status: "completed",
          created_by: values[6] as string,
        });
      }
      // Track new members
      if (sql.includes("INSERT INTO organization_members")) {
        this.newMembers.push({
          id: values[0] as string,
          organization_id: values[1] as string,
          user_id: values[2] as string,
          role: "owner" as const,
          status: "active",
        });
      }
    }
  }

  private findOrganizationMemberRow(
    sql: string,
    values: unknown[],
  ): Record<string, unknown> | null {
    const userId = values[0] as string;
    const organizationId = sql.includes("m.organization_id = ?")
      ? values[1] as string
      : undefined;
    // Check both static and dynamically created members
    const allMembers = [...this.members, ...this.newMembers];
    const allOrgs = [...this.organizations, ...this.newOrganizations];
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
  }
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
    DB: new FakeD1Database(
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
    ) as unknown as D1Database,
    APP_ORIGIN: "http://localhost:5173",
  };
}

describe("Organization API", () => {
  it("returns the selected current organization for an authenticated member", async () => {
    const token = "session-token";
    const response = await app.fetch(
      new Request("http://localhost/api/organizations/current", {
        headers: { Cookie: `${SESSION_COOKIE}=${token}` },
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
        headers: { Cookie: `${SESSION_COOKIE}=${token}` },
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
          Cookie: `${SESSION_COOKIE}=${token}`,
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
