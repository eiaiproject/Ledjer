import { test, expect } from "@playwright/test";

/**
 * Static/legal route smoke tests.
 * No auth required. Verifies routes return app shell without fatal errors.
 */

const staticRoutes = [
  { path: "/terms", heading: /syarat|ketentuan|terms/i },
  { path: "/privacy", heading: /privasi|privacy/i },
  { path: "/refund", heading: /kebijakan layanan/i },
  { path: "/security", heading: /keamanan|security/i },
  { path: "/contact", heading: /hubungi kami|kontak|contact/i },
];

test.describe("Static/legal routes", () => {
  for (const route of staticRoutes) {
    test(`${route.path} loads with correct content`, async ({ page }) => {
      const consoleErrors: string[] = [];
      page.on("console", (msg) => {
        if (msg.type() === "error") {
          const text = msg.text();
          // Only ignore documented third-party Sentry noise
          const isNoise = [
            /sentry\.io/i.test(text) && /failed|error/i.test(text),
          ].some(Boolean);
          if (!isNoise) consoleErrors.push(text);
        }
      });

      const response = await page.goto(route.path);
      expect(response?.status()).toBe(200);

      await page.waitForLoadState("networkidle");

      // Assert final URL (not redirected to login or 404)
      const finalUrl = page.url();
      expect(finalUrl).toContain(route.path);

      // Assert route-specific heading content
      const heading = page.locator("h1").first();
      await expect(heading).toBeVisible({ timeout: 10_000 });
      await expect(heading).toContainText(route.heading);

      // No fatal JS errors
      expect(consoleErrors).toEqual([]);
    });
  }
});
