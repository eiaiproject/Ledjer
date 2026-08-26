import { test, expect } from "@playwright/test";

test.describe("Security Headers", () => {
  test("CSP header contains required directives", async ({ request }) => {
    const baseURL = process.env.E2E_BASE_URL || "http://localhost:4173";
    const response = await request.get(baseURL);
    const headers = response.headers();
    const csp = headers["content-security-policy"] || "";

    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("style-src 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'self'");
  });

  test("CSP script-src does not allow inline scripts", async ({ request }) => {
    const baseURL = process.env.E2E_BASE_URL || "http://localhost:4173";
    const response = await request.get(baseURL);
    const csp = response.headers()["content-security-policy"] || "";
    // Production HTML has no inline executable scripts (JSON-LD is a data
    // block, not covered by script-src), so 'unsafe-inline' must stay out.
    expect(csp).not.toMatch(/script-src[^;]*'unsafe-inline'/);
  });

  test("X-XSS-Protection is disabled (0)", async ({ request }) => {
    const baseURL = process.env.E2E_BASE_URL || "http://localhost:4173";
    const response = await request.get(baseURL);
    // Legacy header; modern guidance is to set it to 0 (auditor is obsolete
    // and '1; mode=block' can introduce XSS auditor bugs).
    expect(response.headers()["x-xss-protection"]).toBe("0");
  });

  test("X-Content-Type-Options is nosniff", async ({ request }) => {
    const baseURL = process.env.E2E_BASE_URL || "http://localhost:4173";
    const response = await request.get(baseURL);
    expect(response.headers()["x-content-type-options"]).toBe("nosniff");
  });

  test("X-Frame-Options is DENY", async ({ request }) => {
    const baseURL = process.env.E2E_BASE_URL || "http://localhost:4173";
    const response = await request.get(baseURL);
    expect(response.headers()["x-frame-options"]).toBe("DENY");
  });

  test("Strict-Transport-Security is present", async ({ request }) => {
    const baseURL = process.env.E2E_BASE_URL || "http://localhost:4173";
    const response = await request.get(baseURL);
    const hsts = response.headers()["strict-transport-security"];
    expect(hsts).toBeTruthy();
  });
});
