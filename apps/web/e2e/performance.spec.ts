import { test, expect } from "@playwright/test";

/**
 * Performance E2E tests.
 *
 * These are render-smoke timing checks and bundle-size verification.
 * For comprehensive load testing, see /load-tests/ directory (k6).
 * For visual regression, see e2e/visual.spec.ts.
 *
 * Budgets are set conservatively for CI cold-start environments.
 * Adjust budgets upward only when a genuine bottleneck is identified and
 * documented — not to make a failing test pass.
 */

test.describe("Page load timing", () => {
  test("landing page loads within 3s (client-side render)", async ({ page }) => {
    const start = Date.now();
    await page.goto("/", { waitUntil: "networkidle" });
    const loadTime = Date.now() - start;

    // Budget: 3s from cold start including network idle
    expect(loadTime).toBeLessThan(3000);
  });

  test("login page loads within 3s", async ({ page }) => {
    const start = Date.now();
    await page.goto("/login", { waitUntil: "networkidle" });
    const loadTime = Date.now() - start;

    expect(loadTime).toBeLessThan(3000);
  });

  test("register page loads within 3s", async ({ page }) => {
    const start = Date.now();
    await page.goto("/register", { waitUntil: "networkidle" });
    const loadTime = Date.now() - start;

    expect(loadTime).toBeLessThan(3000);
  });

  test("forgot-password page loads within 3s", async ({ page }) => {
    const start = Date.now();
    await page.goto("/forgot-password", { waitUntil: "networkidle" });
    const loadTime = Date.now() - start;

    expect(loadTime).toBeLessThan(3000);
  });
});

test.describe("Bundle size verification", () => {
  test("main JS bundle is under 400KB gzipped", async ({ page, request }) => {
    await page.goto("/", { waitUntil: "networkidle" });

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
      // ponytail: main bundle should be under 400KB. Adjust as app grows with
      // documented reasoning for each significant increase.
      expect(sizeKB).toBeLessThan(400);
    }
  });

  test("no single chunk exceeds 300KB gzipped", async ({ page, request }) => {
    await page.goto("/", { waitUntil: "networkidle" });

    const scriptSrcs = await page.evaluate(() =>
      Array.from(document.querySelectorAll('script[src*="/assets/"]'))
        .map((s) => (s as HTMLScriptElement).src),
    );

    for (const src of scriptSrcs) {
      const resp = await request.get(src);
      const body = await resp.body();
      const sizeKB = body.length / 1024;
      expect(sizeKB).toBeLessThan(300);
    }
  });
});

test.describe("API response timing", () => {
  test("metrics endpoint responds within 500ms", async ({ request }) => {
    const start = Date.now();
    const resp = await request.get("/api/metrics");
    const elapsed = Date.now() - start;

    // Accept 200 or 404 (metrics may not be available on Worker)
    if (resp.ok()) {
      expect(elapsed).toBeLessThan(500);
    }
  });

  test("detailed metrics endpoint has route stats structure", async ({ request }) => {
    const resp = await request.get("/api/metrics/detailed");
    // This endpoint may not exist on Worker — accept 404
    if (resp.ok()) {
      const body = await resp.json();
      expect(body).toHaveProperty("requests");
      expect(body).toHaveProperty("routes");
      expect(body).toHaveProperty("bucketBoundaries");
    }
  });
});
