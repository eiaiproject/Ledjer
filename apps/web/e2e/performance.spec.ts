import { test, expect } from "@playwright/test";

/**
 * Performance E2E tests — basic timing budgets.
 * These are render-smoke timing checks, not full load tests.
 * For comprehensive load testing, see /load-tests/ directory (k6).
 */

test.describe("Page load timing", () => {
  test("landing page loads within 5s (client-side render)", async ({ page }) => {
    const start = Date.now();
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    const loadTime = Date.now() - start;

    // Budget: 5s from cold start including network idle
    expect(loadTime).toBeLessThan(5000);
  });

  test("login page loads within 5s", async ({ page }) => {
    const start = Date.now();
    await page.goto("/login");
    await page.waitForLoadState("networkidle");
    const loadTime = Date.now() - start;

    expect(loadTime).toBeLessThan(5000);
  });

  test("register page loads within 5s", async ({ page }) => {
    const start = Date.now();
    await page.goto("/register");
    await page.waitForLoadState("networkidle");
    const loadTime = Date.now() - start;

    expect(loadTime).toBeLessThan(5000);
  });
});

test.describe("Bundle size verification", () => {
  test("main JS bundle is under 500KB gzipped", async ({ page, request }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Check the main entry script size
    const scripts = await page.evaluate(() =>
      Array.from(document.querySelectorAll('script[src*="/assets/"]'))
        .map((s) => (s as HTMLScriptElement).src)
        .filter((src) => src.includes("index-") || src.includes("main-")),
    );

    for (const src of scripts) {
      const resp = await request.get(src);
      const body = await resp.body();
      const sizeKB = body.length / 1024;
      // ponytail: main bundle should be under 500KB. Adjust as app grows.
      expect(sizeKB).toBeLessThan(500);
    }
  });
});
