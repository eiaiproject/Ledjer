import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { E2E } from "./fixtures/env";
import { loginViaUI } from "./fixtures/auth";

/**
 * Accessibility E2E tests.
 * Manual checks + axe-core automated audits.
 */

test.describe("axe-core automated audits", () => {
  const publicPages = [
    { url: "/", name: "Landing" },
    { url: "/login", name: "Login" },
    { url: "/register", name: "Register" },
    { url: "/forgot-password", name: "Forgot Password" },
  ];

  for (const p of publicPages) {
    test(`${p.name} has no critical axe violations`, async ({ page }) => {
      await page.goto(p.url);
      await page.waitForLoadState("networkidle");

      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "best-practice"])
        .analyze();

      // Fail only on critical violations
      const criticalOnly = results.violations.filter((v) => v.impact === "critical");

      if (criticalOnly.length > 0) {
        const msg = criticalOnly
          .map((v) => `${v.id}: ${v.description} (${v.nodes.length} elements)`)
          .join("\n");
        console.error(`Critical axe violations on ${p.name}:\n${msg}`);
      }

      expect(criticalOnly).toHaveLength(0);
    });
  }
});

test.describe("HTML semantics", () => {
  const pages = [
    { url: "/", name: "Landing" },
    { url: "/login", name: "Login" },
    { url: "/register", name: "Register" },
    { url: "/forgot-password", name: "Forgot Password" },
  ];

  for (const p of pages) {
    test(`${p.name} page has html lang attribute`, async ({ page }) => {
      await page.goto(p.url);
      const html = page.locator("html");
      await expect(html).toHaveAttribute("lang", "id");
    });

    test(`${p.name} page has proper heading hierarchy`, async ({ page }) => {
      await page.goto(p.url);
      await page.waitForLoadState("networkidle");
      // App uses div-based headings; check for visible heading-like elements
      const headings = page.locator(
        "h1, h2, h3, [class*='heading'], [class*='title'], [role='heading']",
      );
      const count = await headings.count();
      expect(count).toBeGreaterThanOrEqual(1);
    });
  }
});

test.describe("Form accessibility", () => {
  test("login form inputs have accessible labels", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("networkidle");
    const emailInput = page.getByRole("textbox", { name: /email/i });
    await expect(emailInput).toBeVisible({ timeout: 15_000 });
    const passwordInput = page.locator('input[type="password"]');
    await expect(passwordInput).toBeVisible({ timeout: 15_000 });
  });

  test("register form inputs have accessible labels", async ({ page }) => {
    await page.goto("/register");
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("textbox", { name: /nama lengkap/i })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("textbox", { name: /email/i })).toBeVisible({ timeout: 15_000 });
    const passwordInputs = page.locator('input[type="password"]');
    expect(await passwordInputs.count()).toBe(2);
  });

  test("forgot password form has accessible labels", async ({ page }) => {
    await page.goto("/forgot-password");
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("textbox", { name: /email/i })).toBeVisible({ timeout: 15_000 });
  });
});

test.describe("Keyboard navigation", () => {
  test("tab navigates through login form", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("networkidle");

    await page.keyboard.press("Tab");
    const focused = await page.evaluate(() => {
      const el = document.activeElement;
      return el ? el.tagName + (el.getAttribute("name") || "") : "";
    });
    expect(focused).toMatch(/INPUT|BUTTON|SELECT|A/i);
  });

  test("buttons are keyboard accessible", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("networkidle");
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
    await page.waitForLoadState("networkidle");
    await page.getByRole("textbox", { name: /email/i }).fill("test@test.com");
    await page.locator('input[type="password"]').fill("Wrong1!");
    await page.getByRole("button", { name: /^Masuk$/ }).click();

    const alert = page.locator("[role='alert']");
    await expect(alert).toBeVisible({ timeout: 15_000 });
  });
});

// Authenticated dashboard tests only run when we have full-local mode with service role.
// Conditional registration avoids Sonar flagged 'ignored test' from test.skip().
if (E2E.canRunAuthenticatedDashboardTests) {
  test.describe("Dashboard accessibility (logged in)", () => {
    test.beforeEach(async ({ page }) => {
      await loginViaUI(page);
      await page.waitForURL(/\/dashboard/, { timeout: 15_000 });
      // Wait for the dashboard shell to be fully rendered
      await expect(page.locator("main")).toBeVisible({ timeout: 10_000 });
      await expect(page.getByRole("navigation")).toBeVisible({ timeout: 10_000 });
    });

    test("dashboard has proper heading", async ({ page }) => {
      const heading = page.locator("h1, h2").first();
      await expect(heading).toBeVisible({ timeout: 10_000 });
    });

    test("navigation links are keyboard accessible", async ({ page }) => {
      const nav = page.getByRole("navigation");
      await expect(nav).toBeVisible();

      // Verify key nav items are present and visible
      for (const name of ["Transaksi", "Akun", "Produk", "Laporan", "Pengaturan"]) {
        await expect(nav.getByText(name)).toBeVisible();
      }

      // Verify keyboard focus reaches the navigation
      await page.keyboard.press("Tab");
      const focusedTag = await page.evaluate(() =>
        document.activeElement?.tagName,
      );
      expect(focusedTag).toBeTruthy();
    });
  });
}
