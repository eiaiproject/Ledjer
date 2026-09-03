import { test, expect, type APIRequestContext } from "@playwright/test";

/**
 * Fetch the app-root headers for one test. Each test calls this helper so a
 * single failure stays isolated while keeping the per-test bodies minimal.
 */
async function getSecurityHeaders(request: APIRequestContext): Promise<Record<string, string>> {
  const baseURL = process.env.E2E_BASE_URL || "http://localhost:4173";
  const response = await request.get(baseURL);
  return response.headers();
}

test.describe("Security Headers", () => {
  test("CSP header contains required directives", async ({ request }) => {
    const csp = (await getSecurityHeaders(request))["content-security-policy"] || "";

    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("style-src 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'self'");
  });

  test("CSP script-src does not allow inline scripts", async ({ request }) => {
    const csp = (await getSecurityHeaders(request))["content-security-policy"] || "";
    // Production HTML has no inline executable scripts (JSON-LD is a data
    // block, not covered by script-src), so 'unsafe-inline' must stay out.
    expect(csp).not.toMatch(/script-src[^;]*'unsafe-inline'/);
  });

  test("X-XSS-Protection is disabled (0)", async ({ request }) => {
    const headers = await getSecurityHeaders(request);
    // Legacy header; modern guidance is to set it to 0 (auditor is obsolete
    // and '1; mode=block' can introduce XSS auditor bugs).
    expect(headers["x-xss-protection"]).toBe("0");
  });

  test("X-Content-Type-Options is nosniff", async ({ request }) => {
    const headers = await getSecurityHeaders(request);
    expect(headers["x-content-type-options"]).toBe("nosniff");
  });

  test("X-Frame-Options is DENY", async ({ request }) => {
    const headers = await getSecurityHeaders(request);
    expect(headers["x-frame-options"]).toBe("DENY");
  });

  test("Strict-Transport-Security is present", async ({ request }) => {
    const headers = await getSecurityHeaders(request);
    const hsts = headers["strict-transport-security"];
    expect(hsts).toBeTruthy();
  });
});
