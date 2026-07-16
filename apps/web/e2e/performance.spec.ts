import { test, expect } from "@playwright/test";

/**
 * Performance E2E tests.
 * Placeholder — real tests TBD.
 * @see P0-3 follow-up in §8
 */
test.describe("Performance (placeholder)", () => {
  test("placeholder: page loads within time budget", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    expect(await page.title()).toMatch(/Ledjer/i);
  });
});
