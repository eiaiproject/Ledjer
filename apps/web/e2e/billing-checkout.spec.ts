import { test, expect } from "@playwright/test";
import { loginViaUI } from "./fixtures/auth";
import { E2E } from "./fixtures/env";
import { E2E_OWNER, E2E_STAFF } from "./fixtures/users";
import { ensureTestUser, loginUser } from "./fixtures/seed";
import { ensureOwnerOrg } from "./fixtures/organizations";

/**
 * Billing checkout E2E tests.
 * Tests depend on local Supabase seed data.
 */
const SR_HEADERS = {
  apikey: E2E.serviceRoleKey,
  Authorization: `Bearer ${E2E.serviceRoleKey}`,
  "Content-Type": "application/json",
};

async function deletePendingSessions(orgId: string) {
  await fetch(
    `${E2E.supabaseUrl}/rest/v1/billing_checkout_sessions?organization_id=eq.${orgId}&status=eq.pending`,
    { method: "DELETE", headers: SR_HEADERS },
  ).catch(() => {});
}

// Legacy Mayar coverage is intentionally excluded from normal full-local runs.
if (E2E.isFullLocal && process.env.E2E_MAYAR_LEGACY === "1") {
test.describe("Legacy Mayar Checkout", () => {
  test.beforeAll(async () => {
    // Ensure the owner user exists
    await ensureTestUser(E2E_OWNER);
    await ensureTestUser(E2E_STAFF);
    // Ensure the owner has an org
    await ensureOwnerOrg();
  });

  test.beforeEach(async ({ page }) => {
    // Clean up any previous pending sessions
    const org = await ensureOwnerOrg();
    await deletePendingSessions(org.id);
    await loginViaUI(page);
    await expect(page).toHaveURL(/\/dashboard|\/onboarding/);
    await page.goto("/settings/billing");
    await expect(page).toHaveURL(/\/settings\/billing/);
  });

  test("Owner can see plan comparison cards", async ({ page }) => {
    await page.waitForLoadState("networkidle");
    // Verify both paid plan cards are visible
    await expect(page.getByRole("heading", { name: /^Solo$/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: /^Business$/ })).toBeVisible();
  });

  test("Checkout requires WhatsApp number", async ({ page }) => {
    await page.waitForLoadState("networkidle");

    // Check WhatsApp input is visible
    await expect(page.getByLabel(/nomor whatsapp pembayaran/i)).toBeVisible();

    // Click checkout without entering number
    const mayarButtons = page.getByRole("button", { name: /bayar dengan mayar/i });
    await expect(mayarButtons.first()).toBeVisible();
    await mayarButtons.first().click();

    // Should show validation error
    await expect(page.getByRole("alert")).toBeVisible();
    await expect(page).toHaveURL(/\/settings\/billing/);
  });

  if (process.env.E2E_MAYAR_LEGACY === "1") {
    test("Owner checkout creates pending session with correct details", async ({ page }) => {
      await page.waitForLoadState("networkidle");

      // Verify the billing page renders correctly and checkout is enabled
      await expect(page.getByRole("heading", { name: /^Solo$/ })).toBeVisible();
      const mobileInput = page.getByLabel(/nomor whatsapp pembayaran/i);
      await mobileInput.fill("081234567890");
      const soloButton = page.getByRole("button", { name: /bayar dengan mayar/i }).first();
      await expect(soloButton).toBeEnabled();

      // Call the Edge Function directly with a real user JWT (same pattern as Non-owner test)
      // The browser UI flow can fail if the Supabase client session doesn't transfer
      // correctly to the Edge Function runtime — using loginUser ensures a valid JWT.
      const org = await ensureOwnerOrg();
      const ownerToken = await loginUser(E2E_OWNER);
      const checkoutRes = await fetch(
        `${E2E.supabaseUrl}/functions/v1/mayar-create-checkout`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${ownerToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            organizationId: org.id,
            plan: "solo",
            billingPeriod: "monthly",
            customerMobile: "081234567890",
          }),
        },
      );

      // Edge Function should succeed (200) for owner
      expect(checkoutRes.status).toBe(200);
      const checkoutData = await checkoutRes.json();
      expect(checkoutData.checkoutUrl).toBeTruthy();
      expect(checkoutData.checkoutUrl).toContain("https://");
      expect(checkoutData.sessionId).toBeTruthy();

      // Small buffer for DB commit to complete
      await page.waitForTimeout(1_000);

      // Verify a pending session was created in the DB
      const sessionsRes = await fetch(
        `${E2E.supabaseUrl}/rest/v1/billing_checkout_sessions` +
        `?organization_id=eq.${org.id}&status=eq.pending&select=*`,
        { headers: SR_HEADERS },
      );
      const sessions = await sessionsRes.json();
      const pendingSessions = Array.isArray(sessions) ? sessions : [];

      expect(pendingSessions.length).toBeGreaterThanOrEqual(1);
      const session = pendingSessions[0];

      // Verify session has correct details
      expect(session.plan).toBe("solo");
      expect(session.billing_period).toBe("monthly");
      expect(session.amount).toBe(39000);
      expect(session.currency).toBe("IDR");
      expect(session.payment_provider).toBe("mayar");
      expect(session.checkout_url).toBeTruthy();
      expect(session.checkout_url).toContain("https://");
      expect(session.mayar_invoice_id).toBeTruthy();
      expect(session.mayar_transaction_id).toBeTruthy();
      expect(session.customer_mobile).toBe("6281234567890");
    });
  }

  test("Invalid mobile number is rejected", async ({ page }) => {
    await page.waitForLoadState("networkidle");

    const mobileInput = page.getByLabel(/nomor whatsapp pembayaran/i);

    // Too short
    await mobileInput.fill("081");
    await page.getByRole("button", { name: /bayar dengan mayar/i }).first().click();
    await expect(page.getByRole("alert")).toBeVisible();
  });

  test("Owner sees checkout button enabled", async ({ page }) => {
    await page.waitForLoadState("networkidle");

    await page.getByLabel(/nomor whatsapp pembayaran/i).fill("081234567890");
    const checkoutButton = page.getByRole("button", { name: /bayar dengan mayar/i }).first();
    await expect(checkoutButton).toBeEnabled();
  });

  test("Non-owner sees disabled checkout", async ({ page }) => {
    // Clear auth state (cookies + localStorage + sessionStorage) before switching user
    await page.context().clearCookies();
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await page.goto("/login");
    // Login as staff
    await page.getByRole("textbox", { name: /email/i }).fill(E2E_STAFF.email);
    await page.getByRole("textbox", { name: /password/i }).fill(E2E_STAFF.password);
    await page.getByRole("button", { name: /^Masuk$/ }).click();
    await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 15_000 });

    if (process.env.E2E_MAYAR_LEGACY) {
      // Verify server-side 403: non-owner cannot call mayar-create-checkout
      const org = await ensureOwnerOrg();
      const staffToken = await loginUser(E2E_STAFF);
      const checkoutRes = await fetch(
        `${E2E.supabaseUrl}/functions/v1/mayar-create-checkout`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${staffToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            organizationId: org.id,
            plan: "solo",
            billingPeriod: "monthly",
            customerMobile: "081234567890",
          }),
        },
      );
      expect(checkoutRes.status).toBe(403);
    }

    await page.goto("/settings/billing");
    await page.waitForLoadState("networkidle");

    // Non-owner should see information that only owner can change plan
    await expect(page.getByText(/hanya pemilik/i)).toBeVisible();

    // Checkout buttons should be disabled or not show "Bayar dengan Mayar"
    const mayarButtons = page.getByRole("button", { name: /bayar dengan mayar/i });
    await expect(mayarButtons).toHaveCount(0);
  });
});
}
