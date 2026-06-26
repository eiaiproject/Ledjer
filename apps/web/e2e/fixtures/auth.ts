import { type Page, type BrowserContext } from "@playwright/test";
import { E2E_OWNER, type TestUser } from "./users";

/**
 * Log in a user via the UI and return when dashboard is reachable.
 */
export async function loginViaUI(
  page: Page,
  user: TestUser = E2E_OWNER,
): Promise<void> {
  await page.goto("/login");
  await page.getByRole("textbox", { name: /email/i }).fill(user.email);
  await page.getByRole("textbox", { name: /password/i }).fill(user.password);
  await page.getByRole("button", { name: /masuk/i }).first().click();
  // Wait for navigation away from /login
  await page.waitForURL((url) => !url.pathname.includes("/login"), {
    timeout: 15_000,
  });
}

/**
 * Log in via storage state injection (fast, no UI).
 * Requires a pre-generated auth session.
 */
export async function loginViaStorageState(
  context: BrowserContext,
  storageStatePath: string,
): Promise<void> {
  await context.storageState({ path: storageStatePath });
}

/**
 * Log out the current user via UI.
 */
export async function logoutViaUI(page: Page): Promise<void> {
  // Try to find and click the user menu / logout button
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

/**
 * Generate a storageState JSON for a given user (for CI fast-path).
 * This calls the Supabase auth API directly — no browser needed.
 */
export async function generateStorageState(
  baseUrl: string,
  supabaseUrl: string,
  supabaseAnonKey: string,
  user: TestUser,
): Promise<string> {
  const res = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: supabaseAnonKey,
    },
    body: JSON.stringify({ email: user.email, password: user.password }),
  });
  if (!res.ok) {
    throw new Error(`Failed to generate storage state for ${user.email}: ${res.statusText}`);
  }
  const data = await res.json();
  // Build minimal storage state for Playwright
  const storageState = {
    cookies: [],
    origins: [
      {
        origin: baseUrl,
        localStorage: [
          {
            name: "sb-access-token",
            value: data.access_token,
          },
          {
            name: "sb-refresh-token",
            value: data.refresh_token,
          },
        ],
      },
    ],
  };
  return JSON.stringify(storageState);
}
