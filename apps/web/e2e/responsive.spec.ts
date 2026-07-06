import { test, expect } from "@playwright/test";
import { E2E } from "./fixtures/env";
import { loginViaUI } from "./fixtures/auth";


/**
 * Responsive layout E2E tests.
 * Tests mobile (375px), tablet (768px), and desktop (1440px) viewports.
 */

const viewports = [
  { name: "Mobile", width: 375, height: 812 },
  { name: "Tablet", width: 768, height: 1024 },
  { name: "Desktop", width: 1440, height: 900 },
];

for (const vp of viewports) {
  test.describe(`${vp.name} (${vp.width}px)`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    test("landing page renders without horizontal overflow", async ({ page }) => {
      await page.goto("/");
      const hasOverflow = await page.evaluate(() => {
        return document.body.scrollWidth > window.innerWidth;
      });
      // Allow some tolerance for report tables, but landing should be clean
      expect(hasOverflow).toBeFalsy();
    });

    test("login page renders correctly", async ({ page }) => {
      await page.goto("/login");
      await page.waitForLoadState("networkidle");
      await expect(page.getByRole("textbox", { name: /email/i })).toBeVisible({ timeout: 15_000 });
      await expect(page.getByRole("button", { name: /^Masuk$/ })).toBeVisible({ timeout: 15_000 });
    });

    test("register page renders correctly", async ({ page }) => {
      await page.goto("/register");
      await page.waitForLoadState("networkidle");
      await expect(page.getByRole("textbox", { name: /email/i })).toBeVisible({ timeout: 15_000 });
      await expect(page.getByRole("button", { name: /^Daftar$/ })).toBeVisible({ timeout: 15_000 });
    });

    if (vp.width < 768) {
      test("mobile navigation menu works", async ({ page }) => {
        if (!E2E.isFullLocal) return;
        await loginViaUI(page);

        const menuBtn = page.getByRole("button", { name: /menu|navigation|sidebar/i }).first();
        await expect(menuBtn).toBeVisible({ timeout: 5_000 });
        await menuBtn.click();
        await expect(page.getByRole("dialog", { name: /menu navigasi/i })).toBeVisible({ timeout: 5_000 });
      });
    }
  });
}

test.describe("Transaction form responsive", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("transaction form is usable on mobile", async ({ page }) => {
    if (!E2E.isFullLocal) return;
    await loginViaUI(page);

    await page.goto("/transactions/new");
    await page.waitForLoadState("networkidle");

    await expect(page.locator("body")).toBeVisible();

    const hasOverflow = await page.evaluate(() => {
      return document.body.scrollWidth > window.innerWidth;
    });
    expect(hasOverflow).toBeFalsy();
  });
});

test.describe("Dashboard responsive", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("dashboard renders on mobile without crash", async ({ page }) => {
    if (!E2E.isFullLocal) return;
    await loginViaUI(page);

    await expect(page.locator("body")).toBeVisible();
  });
});
