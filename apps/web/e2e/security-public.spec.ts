import { test, expect } from "@playwright/test";

/**
 * Public security tests — safe for production deploy smoke.
 * No local Supabase required.
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

    expect(alertTriggered).toBeFalsy();
  });
});

test.describe("Secrets exposure", () => {
  test("service role key is not in frontend bundle", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

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
      const contentType = resp.headers()["content-type"] || "";
      expect(contentType).not.toContain("text/plain");
    }
  });
});

test.describe("Admin surface", () => {
  test("admin dashboard is not exposed in the public client router", async ({ page }) => {
    await page.goto("/admin");
    await expect(page.getByRole("heading", { name: /halaman tidak ditemukan/i })).toBeVisible();
    await expect(page.getByText(/admin dashboard/i)).toHaveCount(0);
  });
});

test.describe("Security headers", () => {
  test("app returns security headers or meta CSP", async ({ page }) => {
    const resp = await page.goto("/");
    await page.waitForLoadState("networkidle");
    const headers = resp!.headers();

    const hasHttpHeaders =
      headers["x-content-type-options"] ||
      headers["x-frame-options"] ||
      headers["content-security-policy"] ||
      headers["strict-transport-security"];

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
