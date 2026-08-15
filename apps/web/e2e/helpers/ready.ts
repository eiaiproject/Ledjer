import type { Page } from "@playwright/test";

/**
 * Wait until the app's loading indicators are gone — a web-first readiness
 * condition that replaces waitForLoadState("networkidle").
 *
 * Covers the app's actual loading UI:
 *  - RouteFallback (`<output aria-live="polite">` with a spinner + "Memuat...")
 *    shown while React.lazy route chunks load;
 *  - `Skeleton`/`.animate-pulse` data-loading blocks;
 *  - `aria-busy` buttons.
 *
 * Resolves immediately when the page never renders a loading indicator
 * (e.g. static public pages), so it is safe to use on any route.
 */
export async function waitForAppReady(page: Page, timeout = 15_000): Promise<void> {
  await page
    .waitForFunction(
      () =>
        !document.querySelector(
          '.animate-pulse, [aria-busy="true"], [data-testid="skeleton"], output[aria-live="polite"]',
        ),
      undefined,
      { timeout },
    )
    .catch(() => {
      // Timeout is acceptable — fall back to whatever is rendered rather than
      // failing the test on a lingering indicator.
    });
}
