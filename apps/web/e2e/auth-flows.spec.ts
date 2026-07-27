import { test } from "./helpers/auth";
import { expect } from "@playwright/test";

/**
 * Helper: make an authenticated GET request via the browser's native fetch API.
 * Using page.evaluate (instead of page.request) ensures that the browser
 * natively handles Set-Cookie token rotation from the server.
 */
async function apiGet(page: import("@playwright/test").Page, url: string) {
  return page.evaluate(async (u: string) => {
    const res = await fetch(u);
    return {
      status: res.status,
      ok: res.ok,
      body: await res.json(),
    };
  }, url);
}

test.describe("Authenticated API Flows", () => {
  test("GET /api/accounts returns accounts", async ({ authPage }) => {
    const res = await apiGet(authPage, "/api/accounts");
    expect(res.status).toBe(200);
    expect(res.body.accounts).toBeDefined();
    expect(Array.isArray(res.body.accounts)).toBe(true);
  });

  test("GET /api/transactions returns transactions", async ({ authPage }) => {
    const res = await apiGet(authPage, "/api/transactions?limit=20");
    expect(res.status).toBe(200);
    expect(res.body.transactions).toBeDefined();
  });

  test("GET /api/dashboard/summary returns dashboard data", async ({ authPage }) => {
    const res = await apiGet(authPage, "/api/dashboard/summary");
    expect(res.status).toBe(200);
    expect(res.body.summary).toBeDefined();
  });

  test("GET /api/products returns products", async ({ authPage }) => {
    const res = await apiGet(authPage, "/api/products");
    expect(res.status).toBe(200);
    expect(res.body.products).toBeDefined();
  });

  test("GET /api/reports/trial-balance returns trial balance", async ({ authPage }) => {
    const res = await apiGet(
      authPage,
      "/api/reports/trial-balance?asOfDate=2026-07-17",
    );
    expect(res.status).toBe(200);
    expect(res.body).toBeDefined();
  });

  test("GET /api/reports/profit-loss returns P&L", async ({ authPage }) => {
    const res = await apiGet(
      authPage,
      "/api/reports/profit-loss?fromDate=2026-01-01&toDate=2026-12-31",
    );
    expect(res.status).toBe(200);
    expect(res.body).toBeDefined();
  });

  test("GET /api/reports/balance-sheet returns balance sheet", async ({ authPage }) => {
    const res = await apiGet(
      authPage,
      "/api/reports/balance-sheet?asOfDate=2026-07-17",
    );
    expect(res.status).toBe(200);
    expect(res.body).toBeDefined();
  });

  test("GET /api/team/members returns team members", async ({ authPage }) => {
    const res = await apiGet(authPage, "/api/team/members");
    expect(res.status).toBe(200);
    expect(res.body).toBeDefined();
  });

  test("GET /api/period-locks returns locks", async ({ authPage }) => {
    const res = await apiGet(authPage, "/api/period-locks");
    expect(res.status).toBe(200);
    expect(res.body).toBeDefined();
  });

  test("GET /api/audit-logs returns audit logs", async ({ authPage }) => {
    const res = await apiGet(authPage, "/api/audit-logs?limit=10");
    expect(res.status).toBe(200);
    expect(res.body).toBeDefined();
  });

  test("GET /api/organizations/current returns org details", async ({ authPage }) => {
    const res = await apiGet(authPage, "/api/organizations/current");
    expect(res.ok).toBe(true);
    expect(res.body.organization?.name || res.body.name).toBeDefined();
  });
});
