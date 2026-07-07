import { test, expect } from "@playwright/test";


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

  });
}
