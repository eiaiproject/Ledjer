import { test } from "./helpers/auth";
import { expect } from "@playwright/test";

test.describe("Authenticated API Flows", () => {
  test("GET /api/accounts returns accounts", async ({ authPage }) => {
    const res = await authPage.request.get("/api/accounts");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.accounts).toBeDefined();
    expect(Array.isArray(body.accounts)).toBe(true);
  });

  test("GET /api/transactions returns transactions", async ({ authPage }) => {
    const res = await authPage.request.get("/api/transactions?limit=20");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.transactions).toBeDefined();
  });

  test("GET /api/dashboard/summary returns dashboard data", async ({ authPage }) => {
    const res = await authPage.request.get("/api/dashboard/summary");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.summary).toBeDefined();
  });

  test("GET /api/products returns products", async ({ authPage }) => {
    const res = await authPage.request.get("/api/products");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.products).toBeDefined();
  });

  test("GET /api/reports/trial-balance returns trial balance", async ({ authPage }) => {
    const res = await authPage.request.get(
      "/api/reports/trial-balance?asOfDate=2026-07-17",
    );
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toBeDefined();
  });

  test("GET /api/reports/profit-loss returns P&L", async ({ authPage }) => {
    const res = await authPage.request.get(
      "/api/reports/profit-loss?fromDate=2026-01-01&toDate=2026-12-31",
    );
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toBeDefined();
  });

  test("GET /api/reports/balance-sheet returns balance sheet", async ({ authPage }) => {
    const res = await authPage.request.get(
      "/api/reports/balance-sheet?asOfDate=2026-07-17",
    );
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toBeDefined();
  });

  test("GET /api/team/members returns team members", async ({ authPage }) => {
    const res = await authPage.request.get("/api/team/members");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toBeDefined();
  });

  test("GET /api/period-locks returns locks", async ({ authPage }) => {
    const res = await authPage.request.get("/api/period-locks");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toBeDefined();
  });

  test("GET /api/audit-logs returns audit logs", async ({ authPage }) => {
    const res = await authPage.request.get("/api/audit-logs?limit=10");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toBeDefined();
  });

  test("GET /api/organizations/current returns org details", async ({ authPage }) => {
    const res = await authPage.request.get("/api/organizations/current");
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.organization?.name || body.name).toBeDefined();
  });
});
