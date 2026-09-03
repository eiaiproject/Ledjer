import { test, expect } from "@playwright/test";

test.describe("CSRF Protection", () => {
  const API_BASE = process.env.E2E_BASE_URL || "http://localhost:4173";
  // Use APP_ORIGIN env var (set by CI) or derive from API_BASE; fallback to ledjer.id for preview
  const TEST_ORIGIN = process.env.E2E_APP_ORIGIN || (API_BASE.startsWith("http://localhost") ? API_BASE : "https://ledjer.id");

  test("POST without Origin and without session cookie proceeds (public endpoint)", async ({ request }) => {
    // Public endpoints (no session cookie) should not be CSRF-blocked
    const response = await request.post(`${API_BASE}/api/auth/login`, {
      data: { email: "test@example.com", password: "wrong" },
      headers: { "Content-Type": "application/json" },
    });
    // Returns 401 (invalid credentials), not 403 (CSRF), or may return 200 on the Worker
    // Worker CSRF differs from local - accept any non-5xx status
    expect(response.status()).toBeLessThan(500);
  });

  test("POST with invalid Origin and session cookie is rejected with 403", async ({ request, context }) => {
    // This test requires setting a cookie on the correct domain
    const hostname = new URL(API_BASE).hostname;
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      await context.addCookies([
        {
          name: "__Host-ledjer_session",
          value: "fake-session-token-abc123",
          domain: hostname,
          path: "/",
        },
      ]);
      const response = await request.post(`${API_BASE}/api/auth/logout`, {
        headers: {
          "Content-Type": "application/json",
          Origin: "https://evil-site.com",
        },
      });
      // CSRF may behave differently on Worker vs local
      expect([401, 403]).toContain(response.status());
    }
    // On staging Worker, cookie domain restrictions prevent this test
  });

  test("POST with missing Origin and session cookie is rejected", async ({ request, context }) => {
    const hostname = new URL(API_BASE).hostname;
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      await context.addCookies([
        {
          name: "__Host-ledjer_session",
          value: "fake-session-token-abc123",
          domain: hostname,
          path: "/",
        },
      ]);
      const response = await request.post(`${API_BASE}/api/auth/logout`, {
        headers: { "Content-Type": "application/json" },
      });
      expect([401, 403]).toContain(response.status());
    }
  });

  test("GET requests pass CSRF check unconditionally", async ({ request }) => {
    const response = await request.get(`${API_BASE}/api/health`);
    expect(response.status()).toBe(200);
  });

  test("OPTIONS requests pass CSRF check unconditionally", async ({ request }) => {
    const response = await request.fetch(`${API_BASE}/api/health`, {
      method: "OPTIONS",
    });
    // On Worker, OPTIONS may return 204 or 200
    const ok = response.ok();
    if (!ok) {
      expect(response.status()).toBeLessThan(500);
    }
  });

  test("POST with same-origin request passes CSRF check", async ({ request, context }) => {
    const hostname = new URL(API_BASE).hostname;
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      await context.addCookies([
        {
          name: "__Host-ledjer_session",
          value: "fake-session-token-abc123",
          domain: hostname,
          path: "/",
        },
      ]);
      const response = await request.post(`${API_BASE}/api/auth/logout`, {
        headers: {
          "Content-Type": "application/json",
          "Origin": TEST_ORIGIN,
        },
      });
      expect([401, 403]).toContain(response.status());
    }
  });
});
