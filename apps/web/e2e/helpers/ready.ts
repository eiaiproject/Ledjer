import type { Page } from "@playwright/test";

/**
 * Wait until the app's loading skeletons are gone — a web-first readiness
 * condition that replaces waitForLoadState("networkidle").
 *
 * Resolves immediately when the page never renders a loading skeleton
 * (e.g. static public pages), so it is safe to use on any route.
 */
export async function waitForAppReady(page: Page, timeout = 15_000): Promise<void> {
  await page
    .waitForFunction(
      () =>
        !document.querySelector(
          '.animate-pulse, [aria-busy="true"], [data-testid="skeleton"]',
        ),
      undefined,
      { timeout },
    )
    .catch(() => {
      // Timeout is acceptable — fall back to whatever is rendered rather than
      // failing the test on a lingering skeleton.
    });
}
