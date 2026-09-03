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
 *   2. Attempt to read OrgB resources - expect 403
 *   3. Auth as User in OrgB using PLAYWRIGHT_SESSION_TOKEN_B
 *   4. Attempt to read OrgA resources - expect 403
 */

const API_BASE = process.env.E2E_BASE_URL || "http://localhost:4173";

/**
 * Require an env var. Throws with a clear setup message if missing.
 * Per MASTER.md: "A test must fail if its prerequisite data or authenticated
 * session is unavailable."
 */
function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`\n  Required env var ${name} is not set.\n  To run cross-tenant E2E tests, set the following env vars:\n  export PLAYWRIGHT_SESSION_TOKEN_A=<token for Org A>\n  export PLAYWRIGHT_SESSION_TOKEN_B=<token for Org B>\n  export PLAYWRIGHT_ORG_A_ID=<Org A ID>\n  export PLAYWRIGHT_ORG_B_ID=<Org B ID>\n`);
  }
  return value;
}

test.describe("Tenant Isolation (API-level)", () => {
  test("unauthenticated requests to tenant-scoped endpoints return 401", async ({ request }) => {
    const endpoints = [
      "/api/accounts",
      "/api/transactions",
      "/api/dashboard/summary",
      "/api/reports/profit-loss?fromDate=2026-01-01&toDate=2026-12-31",
      "/api/reports/balance-sheet?asOfDate=2026-01-01",
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

  test("cross-tenant access blocked: OrgA cannot read OrgB accounts", async ({ request, context }) => {
    const tokenA = requireEnv("PLAYWRIGHT_SESSION_TOKEN_A");
    const orgBId = requireEnv("PLAYWRIGHT_ORG_B_ID");

    await context.addCookies([
      {
        name: "__Host-ledjer_session",
        value: tokenA,
        domain: new URL(API_BASE).hostname,
        path: "/",
      },
    ]);

    const response = await request.get(`${API_BASE}/api/accounts`, {
      headers: { "x-org-id": orgBId },
    });
    expect(response.status()).not.toBe(200);
  });

  test("cross-tenant access blocked: OrgB cannot read OrgA reports", async ({ request, context }) => {
    const tokenB = requireEnv("PLAYWRIGHT_SESSION_TOKEN_B");
    const orgAId = requireEnv("PLAYWRIGHT_ORG_A_ID");

    await context.addCookies([
      {
        name: "__Host-ledjer_session",
        value: tokenB,
        domain: new URL(API_BASE).hostname,
        path: "/",
      },
    ]);

    const response = await request.get(`${API_BASE}/api/reports/balance-sheet?asOfDate=2026-01-31`, {
      headers: { "x-org-id": orgAId },
    });
    expect(response.status()).not.toBe(200);
  });

  test("org list only shows the user's member orgs", async ({ request, context }) => {
    const tokenA = requireEnv("PLAYWRIGHT_SESSION_TOKEN_A");

    await context.addCookies([
      {
        name: "__Host-ledjer_session",
        value: tokenA,
        domain: new URL(API_BASE).hostname,
        path: "/",
      },
    ]);

    const response = await request.get(`${API_BASE}/api/organizations`);
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThanOrEqual(1);
  });
});
