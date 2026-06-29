import { test, expect } from "@playwright/test";
import { E2E_OWNER } from "./fixtures/users";

/**
 * Visual regression E2E tests.
 *
 * CI runs in comparison mode against committed Linux baselines.
 * To refresh baselines after an intentional UI change:
 *   pnpm --filter web exec playwright test e2e/visual.spec.ts --project=chromium --update-snapshots
 */

async function loginAsOwner(page: import("@playwright/test").Page): Promise<void> {
  await page.goto("/login");
  await page.getByRole("textbox", { name: /email/i }).fill(E2E_OWNER.email);
  await page.locator('input[type="password"]').fill(E2E_OWNER.password);
  // Exact-match to avoid clicking "Masuk dengan Google"
  await page.getByRole("button", { name: /^Masuk$/ }).click();
  await page.waitForURL(
    (url) => url.pathname.includes("/dashboard") || url.pathname.includes("/onboarding"),
    { timeout: 20_000 },
  );
}

const visualPages = [
  { url: "/", name: "landing-desktop", viewport: { width: 1440, height: 900 } },
  { url: "/", name: "landing-mobile", viewport: { width: 375, height: 812 } },
  { url: "/login", name: "login-desktop", viewport: { width: 1440, height: 900 } },
  { url: "/register", name: "register-desktop", viewport: { width: 1440, height: 900 } },
  { url: "/forgot-password", name: "forgot-password-desktop", viewport: { width: 1440, height: 900 } },
];

for (const vp of visualPages) {
  test(`${vp.name} screenshot`, async ({ page }) => {
    await page.setViewportSize(vp.viewport);
    await page.goto(vp.url);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);

    await expect(page).toHaveScreenshot(`${vp.name}.png`, {
      maxDiffPixelRatio: 0.01,
      fullPage: false,
    });
  });
}

test.describe("Dashboard visual", () => {
  test("dashboard screenshot", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await loginAsOwner(page);
    if (!page.url().includes("/dashboard")) {
      throw new Error(
        `Dashboard visual test: seeded owner did not reach dashboard. ` +
        `Current URL: ${page.url()}. Ensure seed completed successfully.`,
      );
    }

    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);

    await expect(page).toHaveScreenshot("dashboard-desktop.png", {
      maxDiffPixelRatio: 0.01,
      fullPage: false,
    });
  });
});

test.describe("Transaction form visual", () => {
  test("transaction form screenshot", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await loginAsOwner(page);
    if (!page.url().includes("/dashboard")) {
      throw new Error(
        `Transaction form visual test: seeded owner did not reach dashboard. ` +
        `Current URL: ${page.url()}. Ensure seed completed successfully.`,
      );
    }

    await page.goto("/transactions/new");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);

    await expect(page).toHaveScreenshot("transaction-form-desktop.png", {
      maxDiffPixelRatio: 0.01,
      fullPage: false,
    });
  });
});

test.describe("Mobile sidebar visual", () => {
  test("mobile sidebar screenshot", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await loginAsOwner(page);
    if (!page.url().includes("/dashboard")) {
      throw new Error(
        `Mobile sidebar visual test: seeded owner did not reach dashboard. ` +
        `Current URL: ${page.url()}. Ensure seed completed successfully.`,
      );
    }

    const menuBtn = page.getByRole("button", { name: /menu|navigation|sidebar/i }).first();
    await expect(menuBtn).toBeVisible({ timeout: 5_000 });
    await menuBtn.click();
    await page.waitForTimeout(500);

    await expect(page).toHaveScreenshot("mobile-sidebar.png", {
      maxDiffPixelRatio: 0.01,
      fullPage: false,
    });
  });
});
