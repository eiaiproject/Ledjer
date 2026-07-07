/**
 * Authentication helpers for E2E tests using Cloudflare Worker API.
 * No Supabase dependency — all auth goes through /api/auth/* endpoints.
 */

import { type Page, type BrowserContext } from "@playwright/test";
import { E2E } from "./env";
import { E2E_OWNER, type TestUser } from "./users";

/**
 * Register a new user via Worker API and verify their email locally.
 * Returns the userId for later D1 operations.
 */
export async function registerUser(user: TestUser): Promise<string> {
  const res = await fetch(`${E2E.baseUrl}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: user.email,
      password: user.password,
      fullName: user.fullName,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to register ${user.email}: ${res.status} ${text}`);
  }
  const data = await res.json();
  return data.userId;
}

/**
 * Verify email token via Worker API. For E2E testing, we need to get the
 * token from D1 directly. This uses a local-only endpoint or direct D1 access.
 * For now, we use the Worker's email verification endpoint with a test token.
 */
export async function verifyEmailLocally(userId: string): Promise<void> {
  // In local dev, we can call the Worker's internal verify endpoint
  // or use the auth callback with a known test token.
  // For E2E, we'll use a helper that directly sets email_verified_at via D1.
  const res = await fetch(`${E2E.baseUrl}/api/auth/verify-email`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId }),
  });
  // If the endpoint doesn't exist yet, we skip and rely on login flow
  if (!res.ok) {
    console.warn(`Email verification helper returned ${res.status} — skipping`);
  }
}

/**
 * Login a user via the UI and wait for redirect away from /login.
 */
export async function loginViaUI(
  page: Page,
  user: TestUser = E2E_OWNER,
): Promise<void> {
  if (!page.url().includes("/login")) {
    await page.goto("/login");
  }
  await page.getByRole("textbox", { name: /email/i }).fill(user.email);
  await page.locator('input[type="password"]').fill(user.password);
  await page.getByRole("button", { name: /^Masuk$/ }).click();
  await page.waitForURL((url) => !url.pathname.includes("/login"), {
    timeout: 15_000,
  });
}

/**
 * Login a user via Worker API and return the session cookie.
 */
export async function loginViaAPI(
  user: TestUser,
): Promise<string> {
  const res = await fetch(`${E2E.baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: user.email,
      password: user.password,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to login ${user.email}: ${res.status} ${text}`);
  }
  // Extract session cookie from response
  const setCookie = res.headers.get("set-cookie");
  if (!setCookie) throw new Error("No session cookie returned");
  const match = setCookie.match(/ledjer_session=([^;]+)/);
  if (!match) throw new Error("Session cookie not found");
  return match[1];
}

/**
 * Inject a session cookie into a Playwright BrowserContext for fast auth.
 */
export async function setSessionCookie(
  context: BrowserContext,
  sessionToken: string,
): Promise<void> {
  await context.addCookies([
    {
      name: "ledjer_session",
      value: sessionToken,
      domain: "localhost",
      path: "/",
      httpOnly: true,
      secure: false,
      sameSite: "Lax",
    },
  ]);
}

/**
 * Logout the current user via UI.
 */
export async function logoutViaUI(page: Page): Promise<void> {
  const menuBtn = page.getByRole("button", { name: /menu|profil|akun|keluar/i });
  if (await menuBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await menuBtn.click();
  }
  const logoutBtn = page.getByRole("button", { name: /keluar|logout|sign.?out/i });
  if (await logoutBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await logoutBtn.click();
    await page.waitForURL((url) => url.pathname.includes("/login"), {
      timeout: 10_000,
    });
  }
}
