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
    // Returns 401 (invalid credentials), not 403 (CSRF)
    expect(response.status()).toBe(401);
  });

  test("POST with invalid Origin and session cookie is rejected with 403", async ({ request, context }) => {
    await context.addCookies([
      {
        name: "__Host-ledjer_session",
        value: "fake-session-token-abc123",
        domain: new URL(API_BASE).hostname,
        path: "/",
      },
    ]);
    const response = await request.post(`${API_BASE}/api/auth/logout`, {
      headers: {
        "Content-Type": "application/json",
        Origin: "https://evil-site.com",
      },
    });
    expect(response.status()).toBe(403);
  });

  test("POST with missing Origin and session cookie is rejected", async ({ request, context }) => {
    await context.addCookies([
      {
        name: "__Host-ledjer_session",
        value: "fake-session-token-abc123",
        domain: new URL(API_BASE).hostname,
        path: "/",
      },
    ]);
    const response = await request.post(`${API_BASE}/api/auth/logout`, {
      headers: { "Content-Type": "application/json" },
      // No Origin header
    });
    // In production: 403 (CSRF blocked). In dev without APP_ORIGIN: 401 (auth failed).
    expect([401, 403]).toContain(response.status());
  });

  test("GET requests pass CSRF check unconditionally", async ({ request }) => {
    const response = await request.get(`${API_BASE}/api/health`);
    expect(response.status()).toBe(200);
  });

  test("OPTIONS requests pass CSRF check unconditionally", async ({ request }) => {
    const response = await request.fetch(`${API_BASE}/api/health`, {
      method: "OPTIONS",
    });
    expect(response.ok()).toBe(true);
  });

  test("POST with same-origin request passes CSRF check", async ({ request, context }) => {
    // Same-origin requests always pass CSRF (Origin header matches APP_ORIGIN)
    // In the preview server, APP_ORIGIN = https://ledjer.id (from wrangler.jsonc)
    // So same-origin means making a request without explicit Origin header
    // (browsers add it automatically for same-origin)
    await context.addCookies([
      {
        name: "__Host-ledjer_session",
        value: "fake-session-token-abc123",
        domain: new URL(API_BASE).hostname,
        path: "/",
      },
    ]);
    const response = await request.post(`${API_BASE}/api/auth/logout`, {
      headers: {
        "Content-Type": "application/json",
        // Use the configured APP_ORIGIN
        "Origin": TEST_ORIGIN,
      },
    });
    // 401 means CSRF passed, auth failed (expected with fake token)
    expect(response.status()).toBe(401);
  });
});
