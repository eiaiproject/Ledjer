import { test, expect } from "@playwright/test";
import { E2E } from "./fixtures/env";
import { E2E_OWNER, E2E_STAFF } from "./fixtures/users";
import { loginViaUI } from "./fixtures/auth";
import { ensureOwnerOrg } from "./fixtures/organizations";
import { ensureTestUser } from "./fixtures/seed";

if (E2E.isFullLocal) {
  test.describe("Billing manual transfer", () => {
    test.beforeAll(async () => {
      await ensureTestUser(E2E_OWNER);
      await ensureTestUser(E2E_STAFF);
      await ensureOwnerOrg();
    });

    test("owner gets a manual-transfer mailto link with org, plan, and period", async ({ page }) => {
      const org = await ensureOwnerOrg();

      await loginViaUI(page, E2E_OWNER);
      await page.goto("/settings/billing");
      await page.waitForLoadState("networkidle");

      await expect(page.getByRole("heading", { name: /Langganan & Billing/i })).toBeVisible();
      await expect(page.getByText(/Upgrade via transfer manual/i)).toBeVisible();

      const soloLink = page
        .locator('a[href^="mailto:"]')
        .filter({ hasText: "Hubungi Admin" })
        .first();
      await expect(soloLink).toBeVisible();

      const monthlyHref = await soloLink.getAttribute("href");
      expect(monthlyHref).toBeTruthy();
      const monthlyUrl = new URL(monthlyHref!);
      expect(monthlyUrl.pathname).toBe("projects.eiai@gmail.com");
      expect(monthlyUrl.searchParams.get("subject")).toContain(org.name);

      const monthlyBody = monthlyUrl.searchParams.get("body") ?? "";
      expect(monthlyBody).toContain(`- Organisasi: ${org.name}`);
      expect(monthlyBody).toContain("- Paket tujuan: Solo");
      expect(monthlyBody).toContain("- Periode: Bulanan");
      expect(monthlyBody).toContain("transfer manual");

      await page.getByRole("button", { name: /Tahunan/i }).click();
      const yearlyHref = await soloLink.getAttribute("href");
      expect(new URL(yearlyHref!).searchParams.get("body")).toContain("- Periode: Tahunan");
    });

    test("staff can view billing but cannot start manual upgrade", async ({ page }) => {
      await loginViaUI(page, E2E_STAFF);
      await page.goto("/settings/billing");
      await page.waitForLoadState("networkidle");

      await expect(page.getByRole("heading", { name: /Langganan & Billing/i })).toBeVisible();
      await expect(page.getByText(/Hanya pemilik organisasi/i)).toBeVisible();
      await expect(page.locator('a[href^="mailto:"]').filter({ hasText: "Hubungi Admin" })).toHaveCount(0);
      await expect(page.getByRole("button", { name: /Tidak tersedia/i }).first()).toBeDisabled();
    });
  });
}
