import { test, expect } from "@playwright/test";
import { waitForAppReady } from "./helpers/ready";

/**
 * Smoke tests — verify app shell loads, routes work, no fatal errors.
 * Resilient against third-party console noise (Sentry, etc.).
 */

test.describe("Landing page", () => {
  test("loads and shows branding", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/Ledjer/);
    await expect(page.locator("body")).toContainText("Ledjer");
    await expect(page.locator("html")).toHaveAttribute("lang", "id");
  });

  test("no fatal console errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        const text = msg.text();
        // Only ignore documented third-party noise identified by domain + exact pattern.
        // Application-level errors (chunk load failure, CSP violation, dynamic import
        // failure) are real failures that must be caught.
        const isNoise = [
          // Sentry: third-party error reporting, fails independently
          /sentry\.io/i.test(text) && /failed|error/i.test(text),
        ].some(Boolean);
        if (!isNoise) errors.push(text);
      }
    });
    await page.goto("/");
    await waitForAppReady(page);
    expect(errors).toEqual([]);
  });

  test("static assets load", async ({ page }) => {
    const failed: string[] = [];
    page.on("requestfailed", (req) => {
      const url = req.url();
      // Only ignore known third-party endpoints. Chunk, asset, and API failures
      // are application-level failures.
      if (/sentry\.io/i.test(url) && /failed|error/i.test(url)) return;
      failed.push(url);
    });
    await page.goto("/");
    await waitForAppReady(page);
    expect(failed).toEqual([]);
  });
});

test.describe("Auth pages", () => {
  test("login page loads with form elements", async ({ page }) => {
    await page.goto("/login");
    await waitForAppReady(page);
    await expect(page).toHaveTitle(/Ledjer/);
    // Email and password inputs
    await expect(page.getByRole("textbox", { name: /email/i })).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('input[type="password"]')).toBeVisible({ timeout: 15_000 });
    // The login form has a submit button. The exact text is "Masuk".
    // There's also "Masuk dengan Google" — use first() to pick the form submit.
    const loginBtn = page.getByRole("button", { name: /^masuk$/i }).first();
    await expect(loginBtn).toBeVisible({ timeout: 15_000 });
  });

  test("register page loads with form elements", async ({ page }) => {
    await page.goto("/register");
    await waitForAppReady(page);
    await expect(page.getByRole("textbox", { name: /email/i })).toBeVisible({ timeout: 15_000 });
    // Register has two password fields — just verify at least one is visible
    const pwFields = page.locator('input[type="password"]');
    await expect(pwFields.first()).toBeVisible({ timeout: 15_000 });
    // Submit button
    const registerBtn = page.getByRole("button", { name: /buat akun gratis/i }).first();
    await expect(registerBtn).toBeVisible({ timeout: 15_000 });
  });

  test("forgot password page loads", async ({ page }) => {
    await page.goto("/forgot-password");
    await waitForAppReady(page);
    await expect(page.getByRole("textbox", { name: /email/i })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: /kirim/i })).toBeVisible({ timeout: 15_000 });
  });

  test("reset-password without token shows safe state", async ({ page }) => {
    await page.goto("/reset-password");
    await waitForAppReady(page);
    const body = page.locator("body");
    await expect(body).toBeVisible();
  });
});

test.describe("Route guards", () => {
  const protectedRoutes = [
    "/dashboard",
    "/transactions",
    "/products",
    "/accounts",
    "/reports/general-ledger",
    "/reports/trial-balance",
    "/reports/profit-loss",
    "/reports/balance-sheet",
    "/settings/team",
  ];

  for (const route of protectedRoutes) {
    test(`unauthenticated user redirects from ${route}`, async ({ page }) => {
      await page.goto(route, { timeout: 30_000 });
      await expect(page).toHaveURL(/\/login/, { timeout: 30_000 });
    });
  }
});

test.describe("Unknown route", () => {
  test("unknown route shows not found page", async ({ page }) => {
    await page.goto("/nonexistent-page-12345");
    await waitForAppReady(page);
    await expect(page.getByRole("heading", { name: /halaman tidak ditemukan/i })).toBeVisible();
  });
});
