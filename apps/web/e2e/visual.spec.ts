import { test, expect } from "@playwright/test";

/**
 * Visual regression E2E tests.
 * Placeholder — real tests TBD.
 * @see P0-3 follow-up in §8
 */
test.describe("Visual regression (placeholder)", () => {
  test("placeholder: page renders without visual issues", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    expect(await page.title()).toMatch(/Ledjer/i);
  });
});
