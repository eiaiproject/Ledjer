import { test, expect } from "@playwright/test";
import { test as authTest } from "./helpers/auth";
import { waitForAppReady } from "./helpers/ready";
import AxeBuilder from "@axe-core/playwright";

/**
 * Accessibility E2E tests.
 * Automated axe-core audits + manual semantic/flow checks.
 */

test.describe("axe-core automated audits (public pages)", () => {
  const publicPages = [
    { url: "/", name: "Landing" },
    { url: "/login", name: "Login" },
    { url: "/register", name: "Register" },
    { url: "/forgot-password", name: "Forgot Password" },
    { url: "/reset-password", name: "Reset Password" },
    { url: "/privacy", name: "Privacy" },
    { url: "/terms", name: "Terms" },
    { url: "/contact", name: "Contact" },
    { url: "/security", name: "Security" },
    { url: "/refund", name: "Refund" },
    { url: "/nonexistent-page", name: "404" },
  ];

  for (const p of publicPages) {
    test(`${p.name} has no critical or serious axe violations`, async ({ page }) => {
      await page.goto(p.url);
      await waitForAppReady(page);

      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "best-practice"])
        .analyze();

      // Fail on critical AND serious violations
      const violations = results.violations.filter(
        (v) => v.impact === "critical" || v.impact === "serious",
      );

      if (violations.length > 0) {
        const msg = violations
          .map((v) => `${v.id} (${v.impact}): ${v.description} (${v.nodes.length} elements)`)
          .join("\n");
        console.error(`Axe violations on ${p.name}:\n${msg}`);
      }

      expect(violations).toHaveLength(0);
    });
  }
});

test.describe("HTML semantics", () => {
  const pages = [
    { url: "/", name: "Landing" },
    { url: "/login", name: "Login" },
    { url: "/register", name: "Register" },
    { url: "/forgot-password", name: "Forgot Password" },
    { url: "/reset-password", name: "Reset Password" },
    { url: "/privacy", name: "Privacy" },
    { url: "/terms", name: "Terms" },
    { url: "/contact", name: "Contact" },
    { url: "/security", name: "Security" },
    { url: "/refund", name: "Refund" },
  ];

  for (const p of pages) {
    test(`${p.name} page has html lang attribute`, async ({ page }) => {
      await page.goto(p.url);
      const html = page.locator("html");
      await expect(html).toHaveAttribute("lang", "id");
    });

    test(`${p.name} page has a semantic h1 heading`, async ({ page }) => {
      await page.goto(p.url);
      await waitForAppReady(page);
      // Verify there is at least one <h1> element (semantic heading).
      // toBeVisible auto-waits for the SPA to mount the heading.
      await expect(page.locator("h1").first()).toBeVisible({ timeout: 15_000 });
    });
  }

  test("404 page has a semantic h1 heading", async ({ page }) => {
    await page.goto("/nonexistent-page");
    await waitForAppReady(page);
    await expect(page.locator("h1").first()).toBeVisible({ timeout: 15_000 });
  });
});

test.describe("Form accessibility", () => {
  test("login form inputs have accessible labels", async ({ page }) => {
    await page.goto("/login");
    await waitForAppReady(page);
    const emailInput = page.getByRole("textbox", { name: /email/i });
    await expect(emailInput).toBeVisible({ timeout: 15_000 });
    const passwordInput = page.locator('input[type="password"]');
    await expect(passwordInput).toBeVisible({ timeout: 15_000 });
  });

  test("register form inputs have accessible labels", async ({ page }) => {
    await page.goto("/register");
    await waitForAppReady(page);
    await expect(page.getByRole("textbox", { name: /nama lengkap/i })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("textbox", { name: /email/i })).toBeVisible({ timeout: 15_000 });
    const passwordInputs = page.locator('input[type="password"]');
    await expect(passwordInputs).toHaveCount(2);
  });

  test("forgot password form has accessible labels", async ({ page }) => {
    await page.goto("/forgot-password");
    await waitForAppReady(page);
    await expect(page.getByRole("textbox", { name: /email/i })).toBeVisible({ timeout: 15_000 });
  });
});

test.describe("Keyboard navigation", () => {
  test("tab navigates through login form", async ({ page }) => {
    await page.goto("/login");
    await waitForAppReady(page);

    await page.keyboard.press("Tab");
    const focused = await page.evaluate(() => {
      const el = document.activeElement;
      return el ? el.tagName + (el.getAttribute("name") || "") : "";
    });
    expect(focused).toMatch(/INPUT|BUTTON|SELECT|A/i);
  });

  test("buttons are keyboard accessible", async ({ page }) => {
    await page.goto("/login");
    await waitForAppReady(page);
    const submitBtn = page.getByRole("button", { name: /^Masuk$/ });
    await expect(submitBtn).toBeVisible({ timeout: 15_000 });
    await submitBtn.focus();
    const isFocused = await page.evaluate(
      () => document.activeElement?.tagName === "BUTTON",
    );
    expect(isFocused).toBeTruthy();
  });
});

test.describe("Error announcements", () => {
  test("login error has role='alert'", async ({ page }) => {
    await page.goto("/login");
    await waitForAppReady(page);
    await page.getByRole("textbox", { name: /email/i }).fill("test@test.com");
    await page.locator('input[type="password"]').fill("Wrong1!");
    await page.getByRole("button", { name: /^Masuk$/ }).click();

    const alert = page.locator("[role='alert']");
    await expect(alert).toBeVisible({ timeout: 15_000 });
  });
});

authTest.describe("axe-core automated audits (authenticated pages)", () => {
  const authedPages = [
    // Dashboard & core data
    { url: "/dashboard", name: "Dashboard" },
    { url: "/transactions", name: "Transactions" },
    { url: "/accounts", name: "Accounts" },
    { url: "/products", name: "Products" },
    { url: "/invoices", name: "Invoices" },
    { url: "/journals", name: "Journals" },
    // Reports
    { url: "/reports/general-ledger", name: "General Ledger" },
    { url: "/reports/trial-balance", name: "Trial Balance" },
    { url: "/reports/profit-loss", name: "Profit & Loss" },
    { url: "/reports/balance-sheet", name: "Balance Sheet" },
    { url: "/reports/cash-flow", name: "Cash Flow" },
    { url: "/reports/aging", name: "Aging" },
    { url: "/notifications", name: "Notifications" },
    // Settings & operations
    { url: "/settings/team", name: "Team Settings" },
    { url: "/settings/period-locks", name: "Period Locks" },
    { url: "/import", name: "Import" },
    { url: "/reconciliation", name: "Reconciliation" },
    { url: "/opening-balance", name: "Opening Balance" },
  ];

  for (const p of authedPages) {
    authTest(`${p.name} has no critical or serious axe violations`, async ({ authPage }) => {
      await authPage.goto(p.url);
      await waitForAppReady(authPage);

      const results = await new AxeBuilder({ page: authPage })
        .withTags(["wcag2a", "wcag2aa", "best-practice"])
        .analyze();

      const violations = results.violations.filter(
        (v) => v.impact === "critical" || v.impact === "serious",
      );

      if (violations.length > 0) {
        const msg = violations
          .map((v) => `${v.id} (${v.impact}): ${v.description} (${v.nodes.length} elements)`)
          .join("\n");
        console.error(`Axe violations on ${p.name}:\n${msg}`);
      }

      expect(violations).toHaveLength(0);
    });
  }
});
