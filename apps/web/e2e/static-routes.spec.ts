import { test, expect } from "@playwright/test";

/**
 * Static routes E2E tests.
 * Placeholder — real tests TBD.
 * @see P0-3 follow-up in §8
 */
test.describe("Static routes (placeholder)", () => {
  test("placeholder: static routes load", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    expect(await page.title()).toMatch(/Ledjer/i);
  });
});
