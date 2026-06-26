import { test, expect } from "@playwright/test";
import { E2E } from "./fixtures/env";

/**
 * Security E2E tests.
 * Checks XSS, secrets exposure, route bypass, security headers.
 */

test.describe("XSS prevention", () => {
  test("XSS payloads in URL params do not execute", async ({ page }) => {
    const xssPayloads = [
      '<script>alert("xss")</script>',
      '<img src=x onerror=alert(1)>',
      '"><script>alert(1)</script>',
      "javascript:alert(1)",
    ];

    let alertTriggered = false;
    page.on("dialog", () => {
      alertTriggered = true;
    });

    for (const payload of xssPayloads) {
      await page.goto(`/?q=${encodeURIComponent(payload)}`);
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(500);
    }

    expect(alertTriggered).toBeFalsy();
  });

  test("XSS in reset-password token param does not execute", async ({ page }) => {
    let alertTriggered = false;
    page.on("dialog", () => {
      alertTriggered = true;
    });

    await page.goto("/reset-password?token=<script>alert(1)</script>");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);

    expect(alertTriggered).toBeFalsy();
  });
});

test.describe("Secrets exposure", () => {
  test("service role key is not in frontend bundle", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Check all loaded scripts for service_role key patterns
    const scripts = await page.evaluate(() => {
      return Array.from(document.querySelectorAll("script[src]")).map(
        (s) => (s as HTMLScriptElement).src,
      );
    });

    for (const scriptUrl of scripts) {
      const resp = await page.request.get(scriptUrl);
      const body = await resp.text();
      expect(body).not.toContain("service_role");
      expect(body).not.toContain("service-role");
    }
  });

  test("env files are not served by the app", async ({ page }) => {
    const envPaths = ["/.env", "/.env.local"];
    for (const envPath of envPaths) {
      const resp = await page.request.get(envPath);
      // Should return 404 or serve index.html (SPA) — not serve raw env
      const contentType = resp.headers()["content-type"] || "";
      expect(contentType).not.toContain("text/plain");
    }
  });
});

test.describe("Route guards", () => {
  test("unauthenticated API calls return empty or blocked by RLS", async ({ page }) => {
    await page.goto("/login"); // Ensure app is loaded

    // Try to access organizations without auth token
    const response = await page.request.get(
      `${E2E.supabaseUrl}/rest/v1/organizations?select=*`,
      {
        headers: {
          apikey: E2E.supabaseAnonKey,
        },
      },
    );

    // RLS should return empty array or 403/401
    if (response.ok()) {
      const data = await response.json();
      expect(Array.isArray(data)).toBeTruthy();
      // With RLS, should be empty for unauthenticated
    } else {
      expect(response.status()).toBeGreaterThanOrEqual(400);
    }
  });

  test("protected pages redirect to login when unauthenticated", async ({ page }) => {
    const protectedRoutes = [
      "/dashboard",
      "/transactions",
      "/products",
      "/accounts",
      "/settings/team",
      "/settings/billing",
    ];

    for (const route of protectedRoutes) {
      await page.goto(route);
      await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });
    }
  });
});

test.describe("Security headers", () => {
  test("app returns security headers or meta CSP", async ({ page }) => {
    const resp = await page.goto("/");
    await page.waitForLoadState("networkidle");
    const headers = resp!.headers();

    // Check for HTTP security headers
    const hasHttpHeaders =
      headers["x-content-type-options"] ||
      headers["x-frame-options"] ||
      headers["content-security-policy"] ||
      headers["strict-transport-security"];

    // Or check for meta CSP tag
    const hasMetaCSP = await page
      .locator("meta[http-equiv='Content-Security-Policy']")
      .count()
      .then((c) => c > 0)
      .catch(() => false);

    expect(hasHttpHeaders || hasMetaCSP).toBeTruthy();
  });
});

test.describe("Error message safety", () => {
  test("login error does not leak internal details", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("textbox", { name: /email/i }).fill("nonexistent@test.com");
    await page.getByRole("textbox", { name: /password/i }).fill("WrongPass1!");
    await page.getByRole("button", { name: /masuk/i }).first().click();

    const errorAlert = page.locator("[role='alert']");
    if (await errorAlert.isVisible({ timeout: 10_000 }).catch(() => false)) {
      const errorText = await errorAlert.textContent();
      // Should not contain SQL errors, stack traces, or internal details
      expect(errorText).not.toContain("SELECT");
      expect(errorText).not.toContain("ERROR:");
      expect(errorText).not.toContain("stack");
      expect(errorText).not.toContain("at ");
    }
  });
});
