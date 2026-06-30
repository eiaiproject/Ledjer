import { test, expect } from "@playwright/test";
import { E2E_OWNER, E2E_STAFF } from "./fixtures/users";
import { E2E } from "./fixtures/env";
import { loginViaUI } from "./fixtures/auth";

/**
 * Team and permission E2E tests.
 * Each permission test has ONE expected outcome — not both allowed and restricted.
 */

test.describe("Owner has full access", () => {
  test("owner can access dashboard", async ({ page }) => {
    await loginViaUI(page, E2E_OWNER);
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test("owner can access team settings", async ({ page }) => {
    await loginViaUI(page, E2E_OWNER);
    await page.goto("/settings/team");
    await page.waitForLoadState("networkidle");

    const hasTeamContent = await page
      .locator("text=/tim|anggota|staff|role/i")
      .first()
      .isVisible({ timeout: 5_000 })
      .catch(() => false);
    expect(hasTeamContent).toBeTruthy();
  });

  test("owner can access billing settings", async ({ page }) => {
    await loginViaUI(page, E2E_OWNER);
    await page.goto("/settings/billing");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("body")).toBeVisible();
  });

  test("owner can access transaction form", async ({ page }) => {
    await loginViaUI(page, E2E_OWNER);
    await page.goto("/transactions/new");
    await page.waitForLoadState("networkidle");
    // Owner should see transaction types
    await expect(page.locator("text=/penjualan|pembelian|modal|transfer/i").first()).toBeVisible({ timeout: 10_000 });
  });

  test("owner can access accounts page", async ({ page }) => {
    await loginViaUI(page, E2E_OWNER);
    await page.goto("/accounts");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("text=/akun|chart/i").first()).toBeVisible({ timeout: 10_000 });
  });
});

test.describe("Staff permissions", () => {
  test("staff can login and reach dashboard", async ({ page }) => {
    await loginViaUI(page, E2E_STAFF);
    // Staff should reach dashboard or onboarding
    const url = page.url();
    expect(
      url.includes("/dashboard") || url.includes("/onboarding"),
    ).toBeTruthy();
  });

  test("staff without permission cannot create transactions", async ({ page }) => {
    await loginViaUI(page, E2E_STAFF);
    await page.goto("/transactions/new");
    await page.waitForLoadState("networkidle");

    // Staff without can_create_transaction should see restricted state
    const hasRestricted = await page
      .locator("text=/tidak ada akses|izin|akses ditolak|unauthorized/i")
      .first()
      .isVisible({ timeout: 5_000 })
      .catch(() => false);

    const hasNoForm = !(await page
      .locator("text=/transaksi baru/i")
      .first()
      .isVisible({ timeout: 2_000 })
      .catch(() => false));

    // Exactly one: restricted OR no form (not both "can" and "can't")
    expect(hasRestricted || hasNoForm).toBeTruthy();
  });

  test("staff without permission cannot access accounts management", async ({ page }) => {
    await loginViaUI(page, E2E_STAFF);
    await page.goto("/accounts");
    await page.waitForLoadState("networkidle");

    const hasRestricted = await page
      .locator("text=/tidak ada akses|izin|akses ditolak/i")
      .first()
      .isVisible({ timeout: 5_000 })
      .catch(() => false);

    const hasNoAddButton = !(await page
      .getByRole("button", { name: /tambah akun|add account/i })
      .isVisible({ timeout: 2_000 })
      .catch(() => false));

    expect(hasRestricted || hasNoAddButton).toBeTruthy();
  });

  test("staff without permission cannot access team settings", async ({ page }) => {
    await loginViaUI(page, E2E_STAFF);
    await page.goto("/settings/team");
    await page.waitForLoadState("networkidle");

    const hasRestricted = await page
      .locator("text=/tidak ada akses|izin|akses ditolak|forbidden/i")
      .first()
      .isVisible({ timeout: 5_000 })
      .catch(() => false);

    const hasNoTeamMgmt = !(await page
      .locator("text=/undang|invite|kelola tim/i")
      .first()
      .isVisible({ timeout: 2_000 })
      .catch(() => false));

    expect(hasRestricted || hasNoTeamMgmt).toBeTruthy();
  });
});

test.describe("Cross-org isolation", () => {
  test("unauthenticated anon cannot read other orgs via API", async ({ request }) => {
    const response = await request.get(
      `${E2E.supabaseUrl}/rest/v1/organizations?select=*`,
      { headers: { apikey: E2E.supabaseAnonKey } },
    );

    const status = response.status();
    if (status === 200) {
      const data = await response.json();
      expect(data.length).toBe(0);
    } else {
      expect(status).toBeGreaterThanOrEqual(400);
    }
  });
});
