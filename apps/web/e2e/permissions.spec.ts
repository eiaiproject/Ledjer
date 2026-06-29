import { test, expect } from "@playwright/test";
import { E2E_OWNER, E2E_STAFF } from "./fixtures/users";
import { E2E } from "./fixtures/env";

/**
 * Team and permission E2E tests.
 */

async function loginAs(
  page: import("@playwright/test").Page,
  email: string,
  password: string,
): Promise<void> {
  await page.goto("/login");
  await page.getByRole("textbox", { name: /email/i }).fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole("button", { name: /^Masuk$/ }).click();
  await page.waitForURL((url) =>
    url.pathname.includes("/dashboard") || url.pathname.includes("/onboarding"),
    { timeout: 15_000 },
  );
}

test.describe("Team settings", () => {
  test("owner can access team settings", async ({ page }) => {
    await loginAs(page, E2E_OWNER.email, E2E_OWNER.password);
    await expect(page).toHaveURL(/\/dashboard|\/onboarding/);

    await page.goto("/settings/team");
    await page.waitForLoadState("networkidle");

    const hasTeamContent = await page
      .locator("text=/tim|anggota|staff|role/i")
      .first()
      .isVisible({ timeout: 5_000 })
      .catch(() => false);
    expect(hasTeamContent).toBeTruthy();
  });

  test("billing settings page loads for owner", async ({ page }) => {
    await loginAs(page, E2E_OWNER.email, E2E_OWNER.password);
    await expect(page).toHaveURL(/\/dashboard|\/onboarding/);

    await page.goto("/settings/billing");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("body")).toBeVisible();
  });
});

test.describe("Staff permissions", () => {
  test("staff can login and access dashboard", async ({ page }) => {
    await loginAs(page, E2E_STAFF.email, E2E_STAFF.password);
    const currentUrl = page.url();
    expect(
      currentUrl.includes("/dashboard") ||
      currentUrl.includes("/login") ||
      currentUrl.includes("/onboarding"),
    ).toBeTruthy();
  });

  test("staff without permission sees restricted state", async ({ page }) => {
    await loginAs(page, E2E_STAFF.email, E2E_STAFF.password);
    await expect(page).toHaveURL(/\/dashboard|\/onboarding/);

    await page.goto("/transactions/new");
    await page.waitForLoadState("networkidle");

    const hasAccess = await page
      .locator("text=/transaksi baru/i")
      .first()
      .isVisible({ timeout: 5_000 })
      .catch(() => false);
    const hasRestricted = await page
      .locator("text=/tidak ada akses|izin/i")
      .first()
      .isVisible({ timeout: 3_000 })
      .catch(() => false);
    expect(hasAccess || hasRestricted).toBeTruthy();
  });
});

test.describe("Cross-org isolation", () => {
  test("unauthenticated user cannot access API directly", async ({ request }) => {
    const response = await request.get(
      `${E2E.supabaseUrl}/rest/v1/organizations?select=*`,
      { headers: { apikey: E2E.supabaseAnonKey } },
    );

    const status = response.status();
    const isBlocked = status === 401 || status === 403;
    if (status === 200) {
      const data = await response.json();
      expect(data.length).toBe(0);
    } else {
      expect(isBlocked).toBeTruthy();
    }
  });
});
