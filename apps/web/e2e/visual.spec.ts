/**
 * P4.5 True Visual Regression Tests
 *
 * Uses Playwright's built-in screenshot comparison for pixel-level regression.
 * Every state should be covered: loading, empty, populated, error, and modal.
 *
 * Run with:
 *   E2E_VISUAL=1 npx playwright test e2e/visual.spec.ts           # compare
 *   E2E_VISUAL=1 npx playwright test e2e/visual.spec.ts --update-snapshots  # update baseline
 *
 * Configuration:
 * - Time frozen to 2026-06-15T10:00:00.000Z
 * - Animations disabled
 * - Nondeterministic content masked (IDs, timestamps, avatars)
 * - Viewports: 1280x800 (desktop), 375x667 (mobile)
 */

import { test, expect } from "@playwright/test";
import {
  freezeTime,
  disableAnimation,
  navigateAndStabilize,
  NONDETERMINISTIC_SELECTORS,
} from "./helpers/visual";

// ── Desktop Viewport ─────────────────────────────────────────────

test.describe("Visual regression — desktop (1280x800)", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test.beforeEach(async ({ page }) => {
    await freezeTime(page);
    await disableAnimation(page);
  });

  // ── Landing Page ───────────────────────────────────────────────

  test("landing page — hero section", async ({ page }) => {
    await navigateAndStabilize(page, "/");
    await expect(page).toHaveScreenshot("landing-hero.png", {
      mask: NONDETERMINISTIC_SELECTORS.map((s) => page.locator(s)),
      fullPage: true,
    });
  });

  // ── Login Page ─────────────────────────────────────────────────

  test("login page — empty form", async ({ page }) => {
    await navigateAndStabilize(page, "/login");
    await expect(page).toHaveScreenshot("login-empty.png", {
      mask: NONDETERMINISTIC_SELECTORS.map((s) => page.locator(s)),
      fullPage: true,
    });
  });

  test("login page — validation errors", async ({ page }) => {
    await navigateAndStabilize(page, "/login");
    // Submit empty form to trigger validation
    await page.getByRole("button", { name: /masuk/i }).first().click();
    await page.waitForTimeout(300);
    await expect(page).toHaveScreenshot("login-validation.png", {
      mask: NONDETERMINISTIC_SELECTORS.map((s) => page.locator(s)),
      fullPage: true,
    });
  });

  // ── Register Page ──────────────────────────────────────────────

  test("register page — empty form", async ({ page }) => {
    await navigateAndStabilize(page, "/register");
    await expect(page).toHaveScreenshot("register-empty.png", {
      mask: NONDETERMINISTIC_SELECTORS.map((s) => page.locator(s)),
      fullPage: true,
    });
  });

  // ── Forgot Password Page ───────────────────────────────────────

  test("forgot password page — empty form", async ({ page }) => {
    await navigateAndStabilize(page, "/forgot-password");
    await expect(page).toHaveScreenshot("forgot-password-empty.png", {
      mask: NONDETERMINISTIC_SELECTORS.map((s) => page.locator(s)),
      fullPage: true,
    });
  });

  // ── 404 Page ───────────────────────────────────────────────────

  test("not found page — 404", async ({ page }) => {
    await navigateAndStabilize(page, "/nonexistent-page");
    await expect(page).toHaveScreenshot("not-found.png", {
      mask: NONDETERMINISTIC_SELECTORS.map((s) => page.locator(s)),
      fullPage: true,
    });
  });
});

// ── Mobile Viewport ──────────────────────────────────────────────

test.describe("Visual regression — mobile (375x667)", () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test.beforeEach(async ({ page }) => {
    await freezeTime(page);
    await disableAnimation(page);
  });

  test("landing page — mobile hero", async ({ page }) => {
    await navigateAndStabilize(page, "/");
    await expect(page).toHaveScreenshot("landing-hero-mobile.png", {
      mask: NONDETERMINISTIC_SELECTORS.map((s) => page.locator(s)),
      fullPage: true,
    });
  });

  test("login page — mobile form", async ({ page }) => {
    await navigateAndStabilize(page, "/login");
    await expect(page).toHaveScreenshot("login-mobile.png", {
      mask: NONDETERMINISTIC_SELECTORS.map((s) => page.locator(s)),
      fullPage: true,
    });
  });

  test("register page — mobile form", async ({ page }) => {
    await navigateAndStabilize(page, "/register");
    await expect(page).toHaveScreenshot("register-mobile.png", {
      mask: NONDETERMINISTIC_SELECTORS.map((s) => page.locator(s)),
      fullPage: true,
    });
  });
});

// ── Authenticated Pages (requires seeded session) ────────────────

test.describe("Visual regression — authenticated pages", () => {
  const hasStorage = !!process.env.E2E_STORAGE_STATE;
  test.skip(!hasStorage, "E2E_STORAGE_STATE not set — skipping authenticated visual tests");

  test.use({
    viewport: { width: 1280, height: 800 },
    storageState: hasStorage ? process.env.E2E_STORAGE_STATE : undefined,
  });

  test.beforeEach(async ({ page }) => {
    await freezeTime(page);
    await disableAnimation(page);
  });

  // Note: These tests require a valid authenticated session.
  // Run with: E2E_STORAGE_STATE=auth.json E2E_VISUAL=1 npx playwright test ...

  test("dashboard — loading state (authenticated)", async ({ page }) => {
    await navigateAndStabilize(page, "/dashboard", { waitForNetworkIdle: false });
    // Capture initial loading state before data loads
    await page.waitForTimeout(200);
    await expect(page).toHaveScreenshot("dashboard-loading.png", {
      mask: NONDETERMINISTIC_SELECTORS.map((s) => page.locator(s)),
      fullPage: true,
    });
  });

  test("dashboard — populated state (authenticated)", async ({ page }) => {
    await navigateAndStabilize(page, "/dashboard");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);
    await expect(page).toHaveScreenshot("dashboard-populated.png", {
      mask: NONDETERMINISTIC_SELECTORS.map((s) => page.locator(s)),
      fullPage: true,
    });
  });

  test("accounts page — list view (authenticated)", async ({ page }) => {
    await navigateAndStabilize(page, "/accounts");
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveScreenshot("accounts-list.png", {
      mask: NONDETERMINISTIC_SELECTORS.map((s) => page.locator(s)),
      fullPage: true,
    });
  });

  test("transactions page — list view (authenticated)", async ({ page }) => {
    await navigateAndStabilize(page, "/transactions");
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveScreenshot("transactions-list.png", {
      mask: NONDETERMINISTIC_SELECTORS.map((s) => page.locator(s)),
      fullPage: true,
    });
  });

  test("products page — list view (authenticated)", async ({ page }) => {
    await navigateAndStabilize(page, "/products");
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveScreenshot("products-list.png", {
      mask: NONDETERMINISTIC_SELECTORS.map((s) => page.locator(s)),
      fullPage: true,
    });
  });

  test("reports — trial balance (authenticated)", async ({ page }) => {
    await navigateAndStabilize(page, "/reports/trial-balance");
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveScreenshot("trial-balance.png", {
      mask: NONDETERMINISTIC_SELECTORS.map((s) => page.locator(s)),
      fullPage: true,
    });
  });

  test("reports — profit & loss (authenticated)", async ({ page }) => {
    await navigateAndStabilize(page, "/reports/profit-loss");
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveScreenshot("profit-loss.png", {
      mask: NONDETERMINISTIC_SELECTORS.map((s) => page.locator(s)),
      fullPage: true,
    });
  });

  test("reports — balance sheet (authenticated)", async ({ page }) => {
    await navigateAndStabilize(page, "/reports/balance-sheet");
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveScreenshot("balance-sheet.png", {
      mask: NONDETERMINISTIC_SELECTORS.map((s) => page.locator(s)),
      fullPage: true,
    });
  });
});

// ── Modal States ─────────────────────────────────────────────────

test.describe("Visual regression — modals & dialogs", () => {
  const hasStorage = !!process.env.E2E_STORAGE_STATE;
  test.skip(!hasStorage, "E2E_STORAGE_STATE not set — skipping authenticated modal visual tests");

  test.use({
    viewport: { width: 1280, height: 800 },
    storageState: hasStorage ? process.env.E2E_STORAGE_STATE : undefined,
  });

  test.beforeEach(async ({ page }) => {
    await freezeTime(page);
    await disableAnimation(page);
  });

  test("new transaction modal — empty form (authenticated)", async ({ page }) => {
    await navigateAndStabilize(page, "/transactions/new");
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveScreenshot("transaction-new-empty.png", {
      mask: NONDETERMINISTIC_SELECTORS.map((s) => page.locator(s)),
      fullPage: true,
    });
  });
});
