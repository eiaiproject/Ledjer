import { test as base, type Page, expect } from "@playwright/test";

export interface AuthFixtures {
  /** Authenticated page with a valid session, navigated to the app. */
  authPage: Page;
  /** Org ID for the authenticated user's active org. */
  orgId: string;
}

export { expect };

/**
 * Playwright fixture providing an authenticated browser session.
 *
 * Injects a session cookie from PLAYWRIGHT_SESSION_TOKEN, navigates to the app
 * to establish the session, then provides the page for authenticated tests.
 *
 * Usage:
 *   test("list accounts", async ({ authPage, orgId }) => {
 *     const resp = await authPage.request.get("/api/accounts");
 *     expect(resp.status()).toBe(200);
 *   });
 */
export const test = base.extend<AuthFixtures>({
  orgId: "b7ad230e-e7a9-4c09-ad87-5a0599567c28",

  authPage: async ({ browser }, use) => {
    const token = process.env.PLAYWRIGHT_SESSION_TOKEN;
    if (!token) {
      throw new Error(
        "PLAYWRIGHT_SESSION_TOKEN not set. Run: eval $(node scripts/create-e2e-session.mjs) " +
        "then export PLAYWRIGHT_SESSION_TOKEN=<value>",
      );
    }

    const baseURL = process.env.E2E_BASE_URL || "http://localhost:4173";
    const context = await browser.newContext({
      baseURL,
    });

    // Inject session cookie before navigating
    const url = new URL(baseURL);
    await context.addCookies([
      {
        name: "__Host-ledjer_session",
        value: token,
        domain: url.hostname,
        path: "/",
        secure: url.protocol === "https:",
        httpOnly: true,
        sameSite: "Lax" as const,
      },
    ]);

    const page = await context.newPage();
    // Navigate to establish session context (handles Cloudflare challenges)
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await use(page);
    await context.close();
  },
});
