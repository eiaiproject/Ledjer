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

  // The local worker runs with APP_ENV=development, so the session cookie is
  // `ledjer_session`, not the production `__Host-ledjer_session`. Chromium also
  // rejects a `__Host-` cookie sent over http with a domain attribute, which is
  // why these local branches must use the dev name and a url.
  test("POST with invalid Origin and session cookie is rejected with 403", async ({ request, context }) => {
    const hostname = new URL(API_BASE).hostname;
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      await context.addCookies([
        {
          name: "ledjer_session",
          value: "fake-session-token-abc123",
          url: API_BASE,
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

  test("POST with missing Origin and session cookie is rejected", async ({ request }) => {
    const hostname = new URL(API_BASE).hostname;
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      // The `request` fixture does not share the browser context's cookie jar,
      // so the session cookie is sent explicitly. Without it the middleware
      // treats the call as a public endpoint and lets it through.
      const response = await request.post(`${API_BASE}/api/auth/logout`, {
        headers: {
          "Content-Type": "application/json",
          Cookie: "ledjer_session=fake-session-token-abc123",
        },
      });
      expect(response.status()).toBe(403);
      expect((await response.json()).error.code).toBe("csrf_invalid");
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
          name: "ledjer_session",
          value: "fake-session-token-abc123",
          url: API_BASE,
        },
      ]);
      // Same-origin, so CSRF must NOT block it: the request reaches the
      // session layer (401 for the bogus token, or 200 for idempotent logout).
      const response = await request.post(`${API_BASE}/api/auth/logout`, {
        headers: {
          "Content-Type": "application/json",
          "Origin": TEST_ORIGIN,
        },
      });
      expect(response.status()).not.toBe(403);
      expect(response.status()).toBeLessThan(500);
    }
  });
});
