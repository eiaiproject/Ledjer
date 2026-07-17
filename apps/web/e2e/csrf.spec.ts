import { test, expect } from "@playwright/test";

test.describe("CSRF Protection", () => {
  const API_BASE = process.env.E2E_BASE_URL || "http://localhost:4173";

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
        name: "ledjer_session",
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

  test("POST with missing Origin and session cookie is rejected with 403", async ({ request, context }) => {
    await context.addCookies([
      {
        name: "ledjer_session",
        value: "fake-session-token-abc123",
        domain: new URL(API_BASE).hostname,
        path: "/",
      },
    ]);
    const response = await request.post(`${API_BASE}/api/auth/logout`, {
      headers: { "Content-Type": "application/json" },
      // No Origin header
    });
    expect(response.status()).toBe(403);
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

  test("POST with valid Origin and session cookie passes CSRF check", async ({ request, context }) => {
    await context.addCookies([
      {
        name: "ledjer_session",
        value: "fake-session-token-abc123",
        domain: new URL(API_BASE).hostname,
        path: "/",
      },
    ]);
    const response = await request.post(`${API_BASE}/api/auth/logout`, {
      headers: {
        "Content-Type": "application/json",
        "Origin": API_BASE,
      },
    });
    // 401 means CSRF passed (session token is fake, so auth fails)
    // 403 would mean CSRF blocked it
    expect(response.status()).toBe(401);
  });
});
