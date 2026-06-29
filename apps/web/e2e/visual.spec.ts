import { test, expect } from "@playwright/test";
import { E2E_OWNER } from "./fixtures/users";

/**
 * Visual regression E2E tests.
 *
 * CI runs in comparison mode against committed Linux baselines.
 * To refresh baselines after an intentional UI change:
 *   pnpm --filter web exec playwright test e2e/visual.spec.ts --project=chromium --update-snapshots
 *
 * Determinism notes:
 *  - We disable animations and transitions (`*::before`/`*::after`) for the
 *    duration of each test. This eliminates flicker from skeleton/spinner
 *    CSS and stops caret blinking in form fields.
 *  - We prefer waiting on network idle + the first heading / hero element
 *    over arbitrary `waitForTimeout`. A small 200ms settle is kept as a
 *    last-resort buffer for late layout shifts from fonts / images.
 */
const REDUCED_MOTION_CSS = `
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-delay: 0s !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    transition-delay: 0s !important;
    caret-color: transparent !important;
  }
`;

async function applyReducedMotion(
  page: import("@playwright/test").Page,
): Promise<void> {
  await page.addStyleTag({ content: REDUCED_MOTION_CSS });
}

async function loginAsOwner(page: import("@playwright/test").Page): Promise<void> {
  await page.goto("/login");
  await page.getByRole("textbox", { name: /email/i }).fill(E2E_OWNER.email);
  await page.locator('input[type="password"]').fill(E2E_OWNER.password);
  // Exact-match to avoid clicking "Masuk dengan Google"
  await page.getByRole("button", { name: /^Masuk$/ }).click();
  // 30s for the seed-and-login round trip to complete in CI image.
  await page.waitForURL(
    (url) => url.pathname.includes("/dashboard") || url.pathname.includes("/onboarding"),
    { timeout: 30_000 },
  );
}

interface VisualPage {
  url: string;
  name: string;
  viewport: { width: number; height: number };
  /** Stable element to wait for after navigation; falls back to body. */
  waitFor?: string;
}

const visualPages: VisualPage[] = [
  { url: "/", name: "landing-desktop", viewport: { width: 1440, height: 900 }, waitFor: "main, h1" },
  { url: "/", name: "landing-mobile", viewport: { width: 375, height: 812 }, waitFor: "main, h1" },
  { url: "/login", name: "login-desktop", viewport: { width: 1440, height: 900 }, waitFor: "form" },
  { url: "/register", name: "register-desktop", viewport: { width: 1440, height: 900 }, waitFor: "form" },
  { url: "/forgot-password", name: "forgot-password-desktop", viewport: { width: 1440, height: 900 }, waitFor: "form" },
];

for (const vp of visualPages) {
  test(`${vp.name} screenshot`, async ({ page }) => {
    await page.setViewportSize(vp.viewport);
    await page.goto(vp.url);
    await applyReducedMotion(page);
    // Deterministic waits: network idle plus a stable landing element.
    await page.waitForLoadState("networkidle");
    if (vp.waitFor) {
      await page.locator(vp.waitFor).first().waitFor({ state: "visible", timeout: 10_000 });
    }
    // Tiny settle for late fonts/images. Don't grow this; it hides real bugs.
    await page.waitForTimeout(200);

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

    await applyReducedMotion(page);
    await page.waitForLoadState("networkidle");
    await page.locator("main, h1").first().waitFor({ state: "visible", timeout: 10_000 });
    await page.waitForTimeout(200);

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
    await applyReducedMotion(page);
    await page.waitForLoadState("networkidle");
    await page.locator("form, main, h1").first().waitFor({ state: "visible", timeout: 10_000 });
    await page.waitForTimeout(200);

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
    // Wait for the sidebar dialog/state we just opened to be attached.
    await page.locator('[role="dialog"], aside, [data-state="open"]').first()
      .waitFor({ state: "visible", timeout: 5_000 })
      .catch(() => undefined); // Best-effort: layout may use inline drawer.

    await applyReducedMotion(page);
    await page.waitForTimeout(200);

    await expect(page).toHaveScreenshot("mobile-sidebar.png", {
      maxDiffPixelRatio: 0.01,
      fullPage: false,
    });
  });
});
