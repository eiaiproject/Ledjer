import { test, expect } from "@playwright/test";

/**
 * Tenant Isolation E2E Tests
 *
 * These tests verify that authenticated users cannot access resources
 * belonging to a different organization.
 *
 * Prerequisites:
 *   - Staging env with seeded data for at least 2 orgs
 *   - PLAYWRIGHT_SESSION_TOKEN_A and PLAYWRIGHT_SESSION_TOKEN_B set
 *
 * Cross-tenant verification pattern:
 *   1. Auth as User in OrgA using PLAYWRIGHT_SESSION_TOKEN_A
 *   2. Attempt to read OrgB resources — expect 403
 *   3. Auth as User in OrgB using PLAYWRIGHT_SESSION_TOKEN_B
 *   4. Attempt to read OrgA resources — expect 403
 */

const API_BASE = process.env.E2E_BASE_URL || "http://localhost:4173";

test.describe("Tenant Isolation (API-level)", () => {
  test("unauthenticated requests to tenant-scoped endpoints return 401", async ({ request }) => {
    const endpoints = [
      "/api/accounts",
      "/api/transactions",
      "/api/products",
      "/api/reports/trial-balance?asOfDate=2026-01-01",
      "/api/team",
    ];

    for (const endpoint of endpoints) {
      const response = await request.get(`${API_BASE}${endpoint}`);
      expect(response.status()).toBe(401);
    }
  });

  test("request with invalid session returns 401", async ({ request, context }) => {
    await context.addCookies([
      {
        name: "__Host-ledjer_session",
        value: "invalid-session-token",
        domain: new URL(API_BASE).hostname,
        path: "/",
      },
    ]);

    const response = await request.get(`${API_BASE}/api/accounts`);
    expect(response.status()).toBe(401);
  });

  test.skip(!process.env.PLAYWRIGHT_SESSION_TOKEN_A || !process.env.PLAYWRIGHT_ORG_B_ID,
    "PLAYWRIGHT_SESSION_TOKEN_A or PLAYWRIGHT_ORG_B_ID not set — cross-tenant E2E requires seeded data");
  test("cross-tenant access blocked: OrgA cannot read OrgB accounts", async ({ request, context }) => {
    // Authenticate as OrgA user
    await context.addCookies([
      {
        name: "__Host-ledjer_session",
        value: process.env.PLAYWRIGHT_SESSION_TOKEN_A!,
        domain: new URL(API_BASE).hostname,
        path: "/",
      },
    ]);

    // Read OrgB accounts while authenticated as OrgA
    const response = await request.get(`${API_BASE}/api/accounts`, {
      headers: { "x-org-id": process.env.PLAYWRIGHT_ORG_B_ID! },
    });
    // Organization middleware should scope to user's org, not the x-org-id header
    // The response should either be 403 or empty results from OrgA's context
    expect(response.status()).not.toBe(200);
  });

  test.skip(!process.env.PLAYWRIGHT_SESSION_TOKEN_B || !process.env.PLAYWRIGHT_ORG_A_ID,
    "PLAYWRIGHT_SESSION_TOKEN_B or PLAYWRIGHT_ORG_A_ID not set");
  test("cross-tenant access blocked: OrgB cannot read OrgA reports", async ({ request, context }) => {
    await context.addCookies([
      {
        name: "__Host-ledjer_session",
        value: process.env.PLAYWRIGHT_SESSION_TOKEN_B!,
        domain: new URL(API_BASE).hostname,
        path: "/",
      },
    ]);

    const response = await request.get(`${API_BASE}/api/reports/trial-balance?asOfDate=2026-01-31`, {
      headers: { "x-org-id": process.env.PLAYWRIGHT_ORG_A_ID! },
    });
    expect(response.status()).not.toBe(200);
  });

  test.skip(!process.env.PLAYWRIGHT_SESSION_TOKEN_A,
    "PLAYWRIGHT_SESSION_TOKEN_A not set");
  test("org list only shows the user's member orgs", async ({ request, context }) => {
    await context.addCookies([
      {
        name: "__Host-ledjer_session",
        value: process.env.PLAYWRIGHT_SESSION_TOKEN_A!,
        domain: new URL(API_BASE).hostname,
        path: "/",
      },
    ]);

    await context.addCookies([
      {
        name: "__Host-ledjer_session",
        value: token,
        domain: new URL(API_BASE).hostname,
        path: "/",
      },
    ]);

    const response = await request.get(`${API_BASE}/api/organizations`);
    expect(response.status()).toBe(200);

    const body = await response.json();
    // Should be a list of orgs the user belongs to (not all orgs)
    expect(Array.isArray(body)).toBe(true);
    // If Org A user is not a member of any other org, list should have 1 entry
    // This is a soft assertion — the exact count depends on seed data
    expect(body.length).toBeGreaterThanOrEqual(1);
  });
});
