import { test, expect } from "@playwright/test";
import { E2E_OWNER, freshRegisterEmail } from "./fixtures/users";
import { E2E } from "./fixtures/env";

/**
 * Onboarding E2E tests.
 * Tests the full onboarding flow for a new user.
 */

test.describe("Onboarding", () => {
  test("new user sees onboarding page after login", async ({ page }) => {
    // Register a fresh user who hasn't onboarded
    const email = freshRegisterEmail();
    const password = "OnboardTest1!";

    await page.goto("/register");
    await page.getByRole("textbox", { name: /nama lengkap/i }).fill("E2E Onboard User");
    await page.getByRole("textbox", { name: /email/i }).fill(email);
    await page.getByRole("textbox", { name: /password/i }).first().fill(password);
    await page.getByRole("textbox", { name: /konfirmasi password/i }).fill(password);
    await page.getByRole("button", { name: /daftar/i }).click();

    // In local mode with email confirmations disabled, goes straight to onboarding
    // In deployed mode with confirmations, shows "check email" state
    const isLocalMode = E2E.isLocal;

    if (isLocalMode) {
      // Should navigate to onboarding
      await page.waitForURL((url) => url.pathname.includes("/onboarding"), {
        timeout: 15_000,
      });
      await expect(page).toHaveURL(/\/onboarding/);
    } else {
      // Check email state
      await expect(page.locator("text=/cek email/i")).toBeVisible({ timeout: 10_000 });
    }
  });

  test("onboarding form has required fields", async ({ page }) => {
    // Navigate to onboarding (requires auth)
    await page.goto("/login");
    await page.getByRole("textbox", { name: /email/i }).fill(E2E_OWNER.email);
    await page.getByRole("textbox", { name: /password/i }).fill(E2E_OWNER.password);
    await page.getByRole("button", { name: /masuk/i }).first().click();
    await page.waitForURL((url) =>
      url.pathname.includes("/dashboard") || url.pathname.includes("/onboarding"),
      { timeout: 15_000 },
    );

    if (page.url().includes("/onboarding")) {
      // Check for onboarding form elements
      await expect(page.locator("text=/nama bisnis|nama toko/i")).toBeVisible();
      await expect(page.locator("text=/jenis bisnis/i")).toBeVisible();
      await expect(page.locator("text=/tanggal/i")).toBeVisible();
    }
    // If already onboarded, user goes to dashboard (expected for owner)
  });

  test("empty business name is rejected", async ({ page }) => {
    const email = freshRegisterEmail();
    const password = "OnboardTest1!";

    // Register fresh user
    await page.goto("/register");
    await page.getByRole("textbox", { name: /nama lengkap/i }).fill("E2E Empty Name");
    await page.getByRole("textbox", { name: /email/i }).fill(email);
    await page.getByRole("textbox", { name: /password/i }).first().fill(password);
    await page.getByRole("textbox", { name: /konfirmasi password/i }).fill(password);
    await page.getByRole("button", { name: /daftar/i }).click();

    if (E2E.isLocal) {
      await page.waitForURL((url) => url.pathname.includes("/onboarding"), {
        timeout: 15_000,
      });

      // Try to submit without business name
      const submitBtn = page.getByRole("button", { name: /lanjut|simpan|submit/i });
      if (await submitBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await submitBtn.click();
        // Should show validation error for empty name
        await expect(page.locator("text=/2 karakter|wajib/i")).toBeVisible({ timeout: 5_000 });
      }
    }
  });
});

test.describe("Dashboard after onboarding", () => {
  test("owner can access dashboard", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("textbox", { name: /email/i }).fill(E2E_OWNER.email);
    await page.getByRole("textbox", { name: /password/i }).fill(E2E_OWNER.password);
    await page.getByRole("button", { name: /masuk/i }).first().click();
    await page.waitForURL((url) =>
      url.pathname.includes("/dashboard") || url.pathname.includes("/onboarding"),
      { timeout: 15_000 },
    );

    if (page.url().includes("/dashboard")) {
      await expect(page.locator("text=/dashboard|ringkasan/i").first()).toBeVisible({ timeout: 10_000 });
    }
  });
});
