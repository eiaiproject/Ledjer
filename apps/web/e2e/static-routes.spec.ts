import { test, expect } from "@playwright/test";

/**
 * Static routes E2E tests.
 *
 * Enumerates all expected public routes and verifies they:
 * 1. Return HTTP 200 (not a redirect or error)
 * 2. Have a meaningful page title
 * 3. Render expected content elements
 *
 * Protected routes are tested separately (see smoke.spec.ts).
 */

const PUBLIC_ROUTES = [
  { path: "/", title: /Ledjer/i, content: "Ledjer" },
  { path: "/login", title: /Ledjer/i, content: /email/i },
  { path: "/register", title: /Ledjer/i, content: /email/i },
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
    "/transactions/new",
    "/accounts",
    "/reports/profit-loss",
    "/reports/balance-sheet",
    "/settings",
  ];

  for (const route of protectedRoutes) {
    test(`unauthenticated user redirected from ${route} to login`, async ({ page }) => {
      await page.goto(route, { timeout: 30000 });
      await expect(page).toHaveURL(/\/login/, { timeout: 30000 });
    });
  }
});

test.describe("404 handling", () => {
  test("unknown route shows not-found page", async ({ page }) => {
    await page.goto("/nonexistent-page-12345");
    await expect(page.locator("h1")).toBeVisible();
    await expect(page.getByRole("heading", { name: /tidak ditemukan|not found/i })).toBeVisible();
  });

  test("removed non-MVP routes show not-found page", async ({ page }) => {
    const removedRoutes = [
      "/products",
      "/forgot-password",
      "/reset-password",
      "/reports/trial-balance",
      "/reports/general-ledger",
      "/settings/team",
      "/settings/period-locks",
      "/auth/login",
      "/auth/register",
    ];
    for (const route of removedRoutes) {
      await page.goto(route);
      await expect(page.getByRole("heading", { name: /tidak ditemukan|not found/i })).toBeVisible();
    }
  });
});