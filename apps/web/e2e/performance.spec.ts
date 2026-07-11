import { test, expect } from "@playwright/test";

/**
 * Performance smoke E2E tests.
 */

test.describe("Page load performance", () => {
  const performancePages = [
    { url: "/", name: "Landing", budgetMs: 5000 },
    { url: "/login", name: "Login", budgetMs: 5000 },
    { url: "/register", name: "Register", budgetMs: 5000 },
    { url: "/forgot-password", name: "Forgot Password", budgetMs: 5000 },
  ];

  for (const p of performancePages) {
    test(`${p.name} loads within ${p.budgetMs}ms`, async ({ page }) => {
      const start = Date.now();
      await page.goto(p.url);
      await page.waitForLoadState("networkidle");
      const duration = Date.now() - start;
      expect(duration).toBeLessThan(p.budgetMs);
    });
  }
});

test.describe("Static asset performance", () => {
  test("landing page has reasonable number of requests", async ({ page }) => {
    const requests: string[] = [];
    page.on("request", (req) => requests.push(req.url()));

    await page.goto("/");
    await page.waitForLoadState("networkidle");
    expect(requests.length).toBeLessThan(50);
  });

  test("no request takes more than 10 seconds", async ({ page }) => {
    const timings: { url: string; duration: number }[] = [];

    page.on("requestfinished", async (req) => {
      const timing = req.timing();
      timings.push({ url: req.url(), duration: timing.responseEnd - timing.requestStart });
    });

    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const slowRequests = timings.filter((t) => t.duration > 10000);
    expect(slowRequests).toEqual([]);
  });
});

test.describe("Bundle size", () => {
  test("main bundle is under 750 KB (raw size)", async ({ page }) => {
    const scriptSizes: { url: string; rawSize: number }[] = [];

    page.on("response", async (response) => {
      if (response.url().endsWith(".js")) {
        try {
          const body = await response.body();
          scriptSizes.push({ url: response.url(), rawSize: body.length });
        } catch {
          // Response body may not be available
        }
      }
    });

    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Budget measures the raw (uncompressed) JS size as served by Vite preview.
    // The Vite preview server may or may not compress responses, so we measure
    // raw size which is deterministic regardless of server compression config.
    // Current main chunk is ~611 KB raw. Budget set to 750 KB to leave headroom.
    const mainBundle = scriptSizes.find(
      (s) => s.url.includes("index") || s.url.includes("main"),
    );
    if (mainBundle) {
      expect(mainBundle.rawSize).toBeLessThan(750 * 1024);
    }
  });
});
