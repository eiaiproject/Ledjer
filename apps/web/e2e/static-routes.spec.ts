import { test, expect } from "@playwright/test";

/**
 * Static/legal route smoke tests.
 * No auth required. Verifies routes return app shell without fatal errors.
 */

const staticRoutes = [
  { path: "/terms", heading: /syarat|ketentuan|terms/i },
  { path: "/privacy", heading: /privasi|privacy/i },
  { path: "/refund", heading: /refund|pengembalian/i },
  { path: "/security", heading: /keamanan|security/i },
  { path: "/contact", heading: /kontak|contact/i },
];

test.describe("Static/legal routes", () => {
  for (const route of staticRoutes) {
    test(`${route.path} loads successfully`, async ({ page }) => {
      const consoleErrors: string[] = [];
      page.on("console", (msg) => {
        if (msg.type() === "error") {
          const text = msg.text();
          const isNoise = [
            "sentry", "Sentry", "analytics", "Failed to load resource",
            "net::ERR", "ResizeObserver", "Non-Error promise rejection",
            "hydrat", "chunk", "Loading CSS chunk", "dynamically imported",
          ].some((p) => text.toLowerCase().includes(p.toLowerCase()));
          if (!isNoise) consoleErrors.push(text);
        }
      });

      const response = await page.goto(route.path);
      expect(response?.status()).toBe(200);

      await page.waitForLoadState("networkidle");

      // App shell loaded — body is visible
      await expect(page.locator("body")).toBeVisible();

      // No fatal JS errors
      expect(consoleErrors).toEqual([]);
    });
  }
});
