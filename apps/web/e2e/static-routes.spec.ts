import { test, expect } from "@playwright/test";

/**
 * Static routes E2E tests.
 *
 * Enumerates all expected public routes and verifies they:
 * 1. Return HTTP 200 (not a redirect or error)
 * 2. Have a meaningful page title
 * 3. Render expected content elements
 *
 * Protected routes are tested separately (see auth.spec.ts, explore.spec.ts).
 */

const PUBLIC_ROUTES = [
  { path: "/", title: /Ledjer/i, content: "Ledjer" },
  { path: "/login", title: /Ledjer/i, content: /email/i },
  { path: "/register", title: /Ledjer/i, content: /email/i },
  { path: "/forgot-password", title: /Ledjer/i, content: /email/i },
  { path: "/reset-password", title: /Ledjer/i, content: /email|password|token|reset/i },
  { path: "/privacy", title: /Ledjer/i, content: /privasi|data|pribadi/i },
  { path: "/terms", title: /Ledjer/i, content: /ketentuan|syarat/i },
  { path: "/contact", title: /Ledjer/i, content: /kontak|email/i },
];

test.describe("Public static routes", () => {
  for (const route of PUBLIC_ROUTES) {
    test(`${route.path} loads with expected content`, async ({ page }) => {
      const resp = await page.goto(route.path, { waitUntil: "load", timeout: 15000 });
      expect(resp?.status()).toBe(200);

      const title = await page.title();
      expect(title).toMatch(route.title);

      await expect(page.locator("body")).toContainText(route.content);
    });
  }
});

test.describe("Protected route redirects", () => {
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
    test(`unauthenticated user redirected from ${route} to login`, async ({ page }) => {
      await page.goto(route, { timeout: 30000 });
      await expect(page).toHaveURL(/\/login/, { timeout: 30000 });
    });
  }
});

test.describe("Canonical auth routes", () => {
  const OLD_AUTH_PATHS = [
    "/auth/login",
    "/auth/register",
    "/auth/forgot-password",
  ];

  for (const oldPath of OLD_AUTH_PATHS) {
    test(`old ${oldPath} path shows not-found (canonical route is ${oldPath.replace("/auth", "")})`, async ({ page }) => {
      await page.goto(oldPath);
      await expect(page.locator("h1")).toBeVisible();
      // Must not show any auth page — confirm not-found is displayed
      await expect(page.getByRole("heading", { name: /tidak ditemukan|not found/i })).toBeVisible();
      // Safety check: canonical route h1 must not contain "masuk" or "daftar"
      const h1Text = await page.locator("h1").textContent();
      expect(h1Text?.toLowerCase()).not.toMatch(/masuk|daftar|email/i);
    });
  }
});

test.describe("404 handling", () => {
  test("unknown route shows not-found page", async ({ page }) => {
    await page.goto("/nonexistent-page-12345");
    await expect(page.locator("h1")).toBeVisible();
    await expect(page.getByRole("heading", { name: /tidak ditemukan|not found/i })).toBeVisible();
  });
});
