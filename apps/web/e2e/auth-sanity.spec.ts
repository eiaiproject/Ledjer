import { test, expect } from "@playwright/test";
import { E2E_OWNER } from "./fixtures/users";

/**
 * Early sanity gate for full-local mode.
 *
 * Runs first because the filename sorts first alphabetically.
 * If seeded owner cannot log in and reach /dashboard, the rest of the
 * suite is meaningless — fail fast so we don't burn 30 minutes on
 * cascading auth failures.
 */
if (process.env.E2E_SUPABASE_URL) {
test("seeded owner can log in and reach /dashboard", async ({ page }) => {

  await page.goto("/login");
  await page.locator('input[type="email"]').fill(E2E_OWNER.email);
  await page.locator('input[type="password"]').fill(E2E_OWNER.password);
  await page.getByRole("button", { name: /^Masuk$/ }).click();

  await page.waitForURL((url) => url.pathname.includes("/dashboard"), {
    timeout: 20_000,
  });
  await expect(page).toHaveURL(/\/dashboard/);
});
}
