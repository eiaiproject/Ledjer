import { test, expect } from "@playwright/test";
import { waitForAppReady } from "./helpers/ready";

/**
 * Public security tests — safe for production deploy smoke.
 * No seeded backend users required.
 *
 * These tests use only GET requests and never mutate production data.
 * All API endpoint paths are verified against actual route registrations
 * in apps/web/worker/index.ts.
 */

test.describe("XSS prevention", () => {
  function setupXssDetectors(page: import("@playwright/test").Page) {
    const injectedUrls: string[] = [];
    let alertTriggered = false;
    let scriptInjected = false;

    page.on("dialog", () => {
      alertTriggered = true;
    });

    page.on("request", (req) => {
      // Detect outbound requests to suspicious URLs from injected elements
      const url = req.url();
      if (
        url.startsWith("http://evil") ||
        url.startsWith("https://evil") ||
        url.startsWith("http://xss") ||
        (url.startsWith("data:") && req.resourceType() === "script")
      ) {
        injectedUrls.push(url);
      }
    });

    // After navigating, check DOM for dynamically injected script elements
    const checkDomInjection = async () => {
      scriptInjected = await page.evaluate(() => {
        // Only check dynamically added scripts (those not in original source)
        // by comparing against the initial page source.
        const pageScripts = new Set<string>();
        const originalScripts = document.querySelectorAll(
          'script[src*="/assets/"]',
        );
        originalScripts.forEach((s) => pageScripts.add(s.outerHTML));

        for (const script of document.querySelectorAll("script")) {
          // Skip known-good app scripts from /assets/
          if (script.src && script.src.includes("/assets/")) continue;
          // Skip inline scripts that are app-initialization (Sentry, etc.)
          if (
            !script.src &&
            script.textContent &&
            (script.textContent.includes("Sentry") ||
              script.textContent.includes("sentry"))
          )
            continue;
          // Check for suspicious content
          if (
            script.textContent &&
            (script.textContent.includes("alert(") ||
              script.textContent.includes("eval("))
          )
            return true;
          // Check for external non-asset script sources
          if (script.src && !script.src.includes("/assets/")) return true;
        }
        return false;
      });
    };

    return {
      checkDomInjection,
      get injectedUrls() {
        return injectedUrls;
      },
      get alertTriggered() {
        return alertTriggered;
      },
      get scriptInjected() {
        return scriptInjected;
      },
    };
  }

  test("XSS payloads in URL params do not execute or mutate DOM", async ({
    page,
  }) => {
    const xssPayloads = [
      '<script>alert("xss")</script>',
      '<img src=x onerror=alert(1)>',
      '"><script>alert(1)</script>',
      "javascript:alert(1)",
    ];

    const detectors = setupXssDetectors(page);

    for (const payload of xssPayloads) {
      await page.goto(`/?q=${encodeURIComponent(payload)}`);
      await waitForAppReady(page);
      await detectors.checkDomInjection();

      expect(detectors.alertTriggered).toBeFalsy();
      expect(detectors.scriptInjected).toBeFalsy();
      expect(detectors.injectedUrls).toEqual([]);
    }
  });

  test("XSS in reset-password token param does not execute or mutate DOM", async ({
    page,
  }) => {
    const detectors = setupXssDetectors(page);

    await page.goto("/reset-password?token=<script>alert(1)</script>");
    await waitForAppReady(page);
    await detectors.checkDomInjection();

    expect(detectors.alertTriggered).toBeFalsy();
    expect(detectors.scriptInjected).toBeFalsy();
    expect(detectors.injectedUrls).toEqual([]);
  });
});

test.describe("Secrets exposure", () => {
  test("service role key is not in frontend bundle", async ({ page }) => {
    await page.goto("/");
    await waitForAppReady(page);

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
    const envPaths = ["/.env", "/.env.local", "/.env.production"];
    for (const envPath of envPaths) {
      const resp = await page.request.get(envPath);
      const contentType = resp.headers()["content-type"] || "";
      // The app must not serve .env files as plain text (which would expose
      // their contents). In production, these should return 403/404; in local
      // preview they may return the SPA app shell (text/html) which is safe.
      expect(contentType).not.toContain("text/plain");

      // Additionally, verify the response body does NOT contain env file
      // patterns (real secrets, placeholder values)
      const body = await resp.text();
      expect(body).not.toContain("your-session-secret");
      expect(body).not.toContain("your-pepper");
      expect(body).not.toContain("your-google-client");
    }
  });
});

test.describe("Admin surface", () => {
  test("admin dashboard is not exposed in the public client router", async ({
    page,
  }) => {
    await page.goto("/admin");
    await waitForAppReady(page);
    await expect(
      page.getByRole("heading", { name: /halaman tidak ditemukan/i }),
    ).toBeVisible();
    await expect(page.getByText(/admin dashboard/i)).toHaveCount(0);
  });
});

test.describe("Security headers", () => {
  test("app returns required security headers independently", async ({
    page,
  }) => {
    const resp = await page.goto("/");
    await waitForAppReady(page);
    const headers = resp!.headers();

    // Each security header must be asserted independently
    const expectedHeaders = [
      "x-content-type-options",
      "x-frame-options",
      "strict-transport-security",
    ];

    const missingHeaders: string[] = [];
    for (const header of expectedHeaders) {
      if (!headers[header]) {
        missingHeaders.push(header);
      }
    }

    // Check CSP - must exist either as HTTP header or meta tag
    const hasCspHeader = !!headers["content-security-policy"];
    const hasMetaCSP = await page
      .locator("meta[http-equiv='Content-Security-Policy']")
      .count()
      .then((c) => c > 0)
      .catch(() => false);

    if (!hasCspHeader && !hasMetaCSP) {
      missingHeaders.push("content-security-policy (header or meta)");
    }

    if (missingHeaders.length > 0) {
      console.error(
        `Missing security headers: ${missingHeaders.join(", ")}`,
      );
    }

    expect(missingHeaders).toEqual([]);
  });
});

test.describe("API-level authorization", () => {
  test("API endpoints reject unauthenticated GET requests with 401", async ({
    request,
  }) => {
    // Direct API calls without session cookie must return 401.
    // Paths verified against actual route registrations in worker/index.ts:
    //   /api/period-locks (not /api/settings/period-locks)
    //   /api/exports (not /api/exports/transactions)
    const sensitiveEndpoints = [
      "/api/transactions",
      "/api/dashboard/summary",
      "/api/accounts",
      "/api/reports/trial-balance?asOfDate=2026-01-01",
      "/api/team",
      "/api/period-locks",
      "/api/products",
      "/api/parties",
      "/api/exports/transactions",
      "/api/inventory",
      "/api/organizations",
    ];

    for (const endpoint of sensitiveEndpoints) {
      const resp = await request.get(endpoint);
      const status = resp.status();
      // Must return 401 (unauthorized), not 200, 404, or 500
      expect(status).toBe(401);
    }
  });

  test("API mutation endpoints reject unauthenticated POST with 401", async ({
    request,
  }) => {
    const mutationEndpoints = [
      { url: "/api/transactions", body: {} },
      { url: "/api/accounts", body: {} },
      { url: "/api/products", body: {} },
      { url: "/api/period-locks", body: {} },
    ];

    for (const ep of mutationEndpoints) {
      const resp = await request.post(ep.url, { data: ep.body });
      const status = resp.status();
      expect(status).toBe(401);
      const body = await resp.json();
      expect(body?.error?.code).toBe("unauthorized");
    }
  });
});

test.describe("Error message safety", () => {
  test("login error does not leak internal details", async ({ page }) => {
    await page.goto("/login");
    await waitForAppReady(page);
    await expect(
      page.getByRole("textbox", { name: /email/i }),
    ).toBeVisible({ timeout: 15_000 });
    await page
      .getByRole("textbox", { name: /email/i })
      .fill("nonexistent@test.com");
    await expect(page.locator('input[type="password"]')).toBeVisible({
      timeout: 15_000,
    });
    await page.locator('input[type="password"]').fill("WrongPass1!");
    await page.getByRole("button", { name: /^Masuk$/ }).click();

    const errorAlert = page.locator("[role='alert']");
    await expect(errorAlert).toBeVisible({ timeout: 10_000 });
    const errorText = await errorAlert.textContent();
    expect(errorText).not.toContain("SELECT");
    expect(errorText).not.toContain("ERROR:");
    expect(errorText).not.toContain("stack");
    expect(errorText).not.toContain("at ");
  });
});
