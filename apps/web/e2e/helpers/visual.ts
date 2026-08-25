/**
 * P4.5 Visual Regression Test Helpers
 *
 * Provides utilities for consistent visual regression tests:
 * - freezeTime: lock the browser clock to a fixed date
 * - disableAnimation: inject CSS to disable all animations/transitions
 * - maskNondeterministic: generate mask locators for dynamic content
 * - injectSeedData: set up seeded test data via API
 * - getScreenshotOptions: standard options for toHaveScreenshot
 */

import type { Page } from "@playwright/test";
import { waitForAppReady } from "./ready";

/** Fixed date for all visual tests - ensures deterministic output */
export const FIXED_DATE = "2026-06-15T10:00:00.000Z";
export const FIXED_DATE_OBJ = new Date(FIXED_DATE);

/** Nondeterministic selectors that should be masked in screenshots */
export const NONDETERMINISTIC_SELECTORS = [
  // Dynamic IDs and timestamps
  '[data-testid="request-id"]',
  '[data-testid="timestamp"]',
  '[data-testid="last-updated"]',
  '[data-testid="created-at"]',
  // Avatar/initials (user-specific)
  '[data-testid="user-avatar"]',
  '[data-testid="org-avatar"]',
  // Loading states
  '[data-testid="skeleton"]',
  '.animate-pulse',
  '[aria-busy="true"]',
  // Dynamic counts that vary by seed
  '[data-testid="notification-count"]',
  '.notification-badge',
  // Random/unique IDs
  '[data-testid="id-display"]',
  '[data-testid="entity-id"]',
];

/**
 * Freeze the browser clock to a fixed date/time.
 * Must be called before navigating to the page.
 */
export async function freezeTime(page: Page): Promise<void> {
  await page.clock.install({ time: FIXED_DATE_OBJ });
  await page.clock.setFixedTime(FIXED_DATE_OBJ);
}

/**
 * Disable all CSS animations, transitions, and reduces motion.
 * Injects a style tag into the page that overrides all animations.
 */
export async function disableAnimation(page: Page): Promise<void> {
  await page.addStyleTag({
    content: `
      *, *::before, *::after {
        animation-duration: 0s !important;
        animation-delay: -0s !important;
        animation-iteration-count: 1 !important;
        transition-duration: 0s !important;
        transition-delay: -0s !important;
        scroll-behavior: auto !important;
      }
    `,
  });
}


/**
 * Navigate to a page and wait for it to be fully loaded.
 * Handles both SPA routes and regular navigations.
 */
export async function navigateAndStabilize(
  page: Page,
  url: string,
  options: {
    waitForNetworkIdle?: boolean;
    waitForLoadState?: "load" | "domcontentloaded";
    extraWait?: number;
  } = {},
): Promise<void> {
  await page.goto(url, {
    waitUntil: options.waitForLoadState ?? "load",
  });

  if (options.waitForNetworkIdle !== false) {
    await waitForAppReady(page);
  }

  // Small extra wait for fonts and layout to settle
  if (options.extraWait ?? 500) {
    await page.waitForTimeout(options.extraWait ?? 500);
  }
}

/**
 * Check if the page has visible console errors.
 * Returns an array of error messages.
 */
export async function getPageErrors(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(err.message));
  return errors;
}

/**
 * Take a screenshot of a specific element (useful for component-level visual tests).
 */
export async function screenshotElement(
  page: Page,
  selector: string,
  screenshotName: string,
): Promise<void> {
  const element = page.locator(selector);
  await element.screenshot({
    path: `e2e/screenshots/${screenshotName}.png`,
    animations: "disabled",
  });
}
