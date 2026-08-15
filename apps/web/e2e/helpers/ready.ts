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
      () => {
        // React 19 renders concurrently, so right after "load" the root may
        // still be empty and the RouteFallback mounts a tick later. Wait for
        // the root to fill in first, otherwise an absence-only check can
        // resolve before the fallback ever appears.
        const root = document.getElementById("root");
        if (!root || root.children.length === 0) return false;
        return !document.querySelector(
          '.animate-pulse, [aria-busy="true"], [data-testid="skeleton"], output[aria-live="polite"]',
        );
      },
      undefined,
      { timeout },
    )
    .catch(() => {
      // Timeout is acceptable — fall back to whatever is rendered rather than
      // failing the test on a lingering indicator.
    });
}

/**
 * Wait until the page is stable: no loading indicators AND no running finite
 * animations, sustained for `stableMs` milliseconds.
 *
 * Why a sustained window: entrance animations (ledger-page-in, ledger-row-in,
 * ledger-stamp-in, ...) fade content in from opacity 0 with fill-mode both,
 * so axe color-contrast checks running mid-animation measure colors blended
 * against the background. And on lazy routes the RouteFallback can reappear a
 * tick after a single absence check, e.g. while an authenticated page loads
 * its route chunk. Requiring the clean state to persist closes both races.
 * Infinite animations (e.g. ledger-soft-float) never finish and are ignored.
 */
export async function waitForPageStable(page: Page, stableMs = 400, timeout = 15_000): Promise<void> {
  await page
    .waitForFunction(
      ({ stableMs }: { stableMs: number }) => {
        const w = window as unknown as { __ledjerStableSince?: number };
        const loading =
          !!document.querySelector(
            '.animate-pulse, [aria-busy="true"], [data-testid="skeleton"], output[aria-live="polite"]',
          ) ||
          Array.from(document.getAnimations()).some((a) => {
            const timing = a.effect?.getTiming?.();
            if (!timing || timing.iterations === Infinity) return false;
            return a.playState !== "finished";
          });
        const now = performance.now();
        if (loading) {
          w.__ledjerStableSince = undefined;
          return false;
        }
        w.__ledjerStableSince ??= now;
        return now - w.__ledjerStableSince >= stableMs;
      },
      { stableMs },
      { timeout },
    )
    .catch(() => {
      // Timeout is acceptable — fall back to whatever is rendered.
    });
}
