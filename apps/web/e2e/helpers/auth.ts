import { test as base, type Page } from "@playwright/test";

export interface AuthFixtures {
  /** Authenticated page with a valid session, navigated to the app. */
  authPage: Page;
  /** Org ID for the authenticated user's active org. */
  orgId: string;
}

/**
 * Playwright fixture providing an authenticated browser session.
 *
 * Logs in via the login API using the configured E2E credentials, then
 * navigates to the app to establish the session.
 *
 * Credentials are read from E2E_EMAIL / E2E_PASSWORD env vars (defaults:
 * ledjer@yopmail.com / Ledjer26#).
 *
 * Usage:
 *   test("list accounts", async ({ authPage, orgId }) => {
 *     const resp = await authPage.evaluate(async () => {
 *       const res = await fetch("/api/accounts");
 *       return res.json();
 *     });
 *     expect(resp.accounts).toBeDefined();
 *   });
 *
 * Note: Use authPage.evaluate(fetch) instead of authPage.request.get()
 * so that the browser natively handles Set-Cookie token rotation from the
 * server's session-rotation mechanism.
 */
export const test = base.extend<AuthFixtures>({
  orgId: "046e96ee-6399-4704-ad25-66bc7f917742",

  authPage: async ({ browser }, acceptFixture) => {
    const email = process.env.E2E_EMAIL || "ledjer@yopmail.com";
    const password = process.env.E2E_PASSWORD || "Ledjer26#";
    const baseURL = process.env.E2E_BASE_URL || "https://ledjer.id";

    const context = await browser.newContext({
      baseURL,
    });

    const page = await context.newPage();

    // Navigate to the app first to establish the origin
    await page.goto("/login", { waitUntil: "domcontentloaded", timeout: 15000 });

    // Log in via fetch so cookies are handled natively by the browser.
    // Retry with backoff: the worker rate-limits bursts of parallel logins
    // (403 rate_limited after 5 failed attempts / 15 min per email, 429 from
    // edge throttling when CI runs land simultaneously). Each test in a
    // parallel worker logs in, so a transient failure must not fail the run.
    //
    // BUG-07: the backoff below (5s, 10s, 20s, 40s ≈ 75s total) is only meant
    // to ride out short-lived edge throttling. It does NOT (and cannot) wait
    // out the server's 15-minute sliding lockout window - a hard lockout still
    // fails the fixture, and that is intentional: it surfaces real rate-limit
    // problems instead of silently hiding them.
    let loginResult: { ok: boolean; status: number; error?: string } = { ok: false, status: 0 };
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      loginResult = await page.evaluate(
        async ({ email, password }: { email: string; password: string }) => {
          try {
            const res = await fetch("/api/auth/login", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ email, password }),
            });
            return { ok: res.ok, status: res.status };
          } catch (err) {
            return { ok: false, status: 0, error: String(err) };
          }
        },
        { email, password },
      );
      if (loginResult.ok) break;
      await page.waitForTimeout(attempt * 5000);
    }

    if (!loginResult.ok) {
      throw new Error(
        `Login failed (${loginResult.status}): ${loginResult.error || "unknown"}` +
        ". Check E2E_EMAIL / E2E_PASSWORD env vars.",
      );
    }

    // Navigate to the app root
    await page.goto("/", { waitUntil: "domcontentloaded", timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(2000);

    // Explicitly fetch current org to set current_organization_id in session.
    // Without this, session.current_organization_id stays null and pages that
    // action buttons because permissions resolve to false.
    await page.evaluate(async () => {
      await fetch("/api/organizations/current");
    });
    await page.waitForTimeout(1000);

    // Debug: check cookies
    const cookies = await context.cookies();
    const sessionCookie = cookies.find(c => c.name.includes("session"));
    if (sessionCookie) {
      console.log("  [auth fixture] session cookie:", sessionCookie.value.substring(0, 15) + "...");
    } else {
      console.log("  [auth fixture] WARNING: No session cookie found!");
    }

    await acceptFixture(page);
    await context.close();
  },
});
