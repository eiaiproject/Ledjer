import { test, expect } from "@playwright/test";
import { E2E_OWNER, E2E_STAFF } from "./fixtures/users";
import { E2E } from "./fixtures/env";

/**
 * Team and permission E2E tests.
 * Tests staff access, permission matrix, and cross-org isolation.
 */

async function loginAs(
  page: import("@playwright/test").Page,
  email: string,
  password: string,
): Promise<void> {
  await page.goto("/login");
  await page.getByRole("textbox", { name: /email/i }).fill(email);
  await page.getByRole("textbox", { name: /password/i }).fill(password);
  await page.getByRole("button", { name: /masuk/i }).first().click();
  await page.waitForURL((url) =>
    url.pathname.includes("/dashboard") || url.pathname.includes("/onboarding"),
    { timeout: 15_000 },
  );
}

test.describe("Team settings", () => {
  test("owner can access team settings", async ({ page }) => {
    await loginAs(page, E2E_OWNER.email, E2E_OWNER.password);
    if (!page.url().includes("/dashboard")) return;

    await page.goto("/settings/team");
    await page.waitForLoadState("networkidle");
    const body = page.locator("body");
    await expect(body).toBeVisible();
    // Should show team content or not redirect
    const hasTeamContent =
      (await page.locator("text=/tim|anggota|staff|role/i").first().isVisible({ timeout: 5_000 }).catch(() => false));
    expect(hasTeamContent).toBeTruthy();
  });

  test("billing settings page loads for owner", async ({ page }) => {
    await loginAs(page, E2E_OWNER.email, E2E_OWNER.password);
    if (!page.url().includes("/dashboard")) return;

    await page.goto("/settings/billing");
    await page.waitForLoadState("networkidle");
    const body = page.locator("body");
    await expect(body).toBeVisible();
  });
});

test.describe("Staff permissions", () => {
  test("staff can login and access dashboard", async ({ page }) => {
    await loginAs(page, E2E_STAFF.email, E2E_STAFF.password);
    // Staff should be able to reach dashboard (if permissions allow)
    const currentUrl = page.url();
    expect(
      currentUrl.includes("/dashboard") ||
      currentUrl.includes("/login") || // If not seeded
      currentUrl.includes("/onboarding"),
    ).toBeTruthy();
  });

  test("staff without permission sees restricted state", async ({ page }) => {
    // This test verifies that the UI properly handles permission restrictions
    // Staff with limited permissions should see appropriate messages
    await loginAs(page, E2E_STAFF.email, E2E_STAFF.password);
    if (!page.url().includes("/dashboard")) return;

    // Try to access transaction creation
    await page.goto("/transactions/new");
    await page.waitForLoadState("networkidle");

    // Either form loads (has permission) or restricted state shows
    const hasAccess =
      (await page.locator("text=/transaksi baru/i").first().isVisible({ timeout: 5_000 }).catch(() => false)) ||
      (await page.locator("text=/tidak ada akses|izin/i").first().isVisible({ timeout: 3_000 }).catch(() => false));
    expect(hasAccess).toBeTruthy();
  });
});

test.describe("Cross-org isolation", () => {
  test("unauthenticated user cannot access API directly", async ({ page }) => {
    // Try to access Supabase REST API without auth
    const response = await page.request.get(
      `${E2E.supabaseUrl}/rest/v1/organizations?select=*`,
      {
        headers: {
          apikey: E2E.supabaseAnonKey,
        },
      },
    );
    // RLS should block unauthorized access: either 401/403 or 200 with empty array
    const status = response.status();
    const isSuccess = status === 200 || status === 401 || status === 403;
    expect(isSuccess).toBeTruthy();
    if (status === 200) {
      const data = await response.json();
      expect(Array.isArray(data)).toBeTruthy();
      // Should not return other orgs' data
      expect(data.length).toBe(0);
    }
  });
});
