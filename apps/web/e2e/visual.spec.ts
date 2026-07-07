import { test, expect } from "@playwright/test";

/**
 * Visual regression E2E tests.
 *
 * CI runs in comparison mode against committed Linux baselines.
 * To refresh baselines after an intentional UI change, run the manual
 * `Generate visual baselines` workflow.
 *
 * Determinism notes:
 *  - We disable animations and transitions (`*::before`/`*::after`) for the
 *    duration of each test. This eliminates flicker from skeleton/spinner
 *    CSS and stops caret blinking in form fields.
 *  - We prefer waiting on network idle + the first heading / hero element,
 *    then wait for fonts, images, and two animation frames before capturing.
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

async function waitForVisualReady(
  page: import("@playwright/test").Page,
): Promise<void> {
  await page.waitForFunction(async () => {
    const fonts = "fonts" in document
      ? (document as Document & { fonts: { ready: Promise<unknown> } }).fonts
      : undefined;
    await fonts?.ready;

    const viewportImages = Array.from(document.images).filter((image) => {
      const style = window.getComputedStyle(image);
      const rect = image.getBoundingClientRect();

      return (
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        rect.width > 0 &&
        rect.height > 0 &&
        rect.bottom >= 0 &&
        rect.right >= 0 &&
        rect.top <= window.innerHeight &&
        rect.left <= window.innerWidth
      );
    });

    await Promise.all(viewportImages.map((image) => {
      if (image.complete) return undefined;

      return new Promise<void>((resolve) => {
        const done = () => resolve();
        image.addEventListener("load", done, { once: true });
        image.addEventListener("error", done, { once: true });
      });
    }));

    return true;
  }, undefined, { timeout: 10_000 });

  await page.waitForFunction(() => new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve(true)));
  }), undefined, { timeout: 5_000 });
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
    await waitForVisualReady(page);

    await expect(page).toHaveScreenshot(`${vp.name}.png`, {
      maxDiffPixelRatio: 0.01,
      fullPage: false,
    });
  });
}
