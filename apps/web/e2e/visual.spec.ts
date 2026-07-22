import { test, expect } from "@playwright/test";

/**
 * Visual regression smoke tests.
 *
 * These are render-smoke checks — they verify pages render without
 * visible errors, not pixel-perfect visual regression.
 * For true visual regression, use a dedicated service (Chromatic, Percy).
 *
 * Each test:
 * 1. Navigates to a page
 * 2. Waits for network idle
 * 3. Verifies the page renders expected layout elements
 */

test.describe("Visual render smoke tests", () => {
  test("landing page renders hero section", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("h1, h2, h3").first()).toBeVisible();
    // Hero should contain "Ledjer" brand text
    await expect(page.locator("body")).toContainText("Ledjer");
  });

  test("login page renders form layout", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("networkidle");
    // Login form should have email input
    await expect(page.getByRole("textbox", { name: /email/i })).toBeVisible();
    // Password field should exist
    await expect(page.locator('input[type="password"]')).toBeVisible();
    // Submit button should exist
    await expect(page.getByRole("button", { name: /masuk/i }).first()).toBeVisible();
  });

  test("register page renders form layout", async ({ page }) => {
    await page.goto("/register");
    await page.waitForLoadState("networkidle");
    // Register form should have full name, email, password fields
    await expect(page.getByRole("textbox", { name: /nama/i }).or(page.getByRole("textbox", { name: /email/i }))).toBeVisible();
    await expect(page.locator('input[type="password"]').first()).toBeVisible();
  });

  test("forgot password page renders recovery form", async ({ page }) => {
    await page.goto("/forgot-password");
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("textbox", { name: /email/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /kirim/i })).toBeVisible();
  });
});
