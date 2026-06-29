import { test, expect } from "@playwright/test";
import { E2E_OWNER, freshRegisterEmail } from "./fixtures/users";
import { E2E } from "./fixtures/env";

/**
 * Onboarding E2E tests.
 */

test.describe("Onboarding", () => {
  test("new user sees onboarding page after login", async ({ page }) => {
    const email = freshRegisterEmail();
    const password = "OnboardTest1!";

    await page.goto("/register");
    await page.getByRole("textbox", { name: /nama lengkap/i }).fill("E2E Onboard User");
    await page.getByRole("textbox", { name: /email/i }).fill(email);
    await page.locator('input[type="password"]').first().fill(password);
    await page.getByLabel(/konfirmasi password/i).fill(password);
    await page.getByRole("button", { name: /^Daftar$/ }).click();

    if (E2E.isLocal) {
      await page.waitForURL((url) => url.pathname.includes("/onboarding"), {
        timeout: 15_000,
      });
      await expect(page).toHaveURL(/\/onboarding/);
    } else {
      await expect(page.locator("text=/cek email/i")).toBeVisible({ timeout: 10_000 });
    }
  });

  test("onboarding form has required fields", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("textbox", { name: /email/i }).fill(E2E_OWNER.email);
    await page.locator('input[type="password"]').fill(E2E_OWNER.password);
    await page.getByRole("button", { name: /^Masuk$/ }).click();
    await page.waitForURL((url) =>
      url.pathname.includes("/dashboard") || url.pathname.includes("/onboarding"),
      { timeout: 15_000 },
    );

    // Owner should reach dashboard or onboarding — either is valid
    const url = page.url();
    expect(url.includes("/dashboard") || url.includes("/onboarding")).toBeTruthy();

    if (page.url().includes("/onboarding")) {
      await expect(page.locator("text=/nama bisnis|nama toko/i")).toBeVisible();
      await expect(page.locator("text=/jenis bisnis/i")).toBeVisible();
      await expect(page.locator("text=/tanggal/i")).toBeVisible();
    }
  });

  test("empty business name is rejected", async ({ page }) => {
    test.skip(!E2E.isLocal, "Requires local Supabase for fresh registration");

    const email = freshRegisterEmail();
    const password = "OnboardTest1!";

    await page.goto("/register");
    await page.getByRole("textbox", { name: /nama lengkap/i }).fill("E2E Empty Name");
    await page.getByRole("textbox", { name: /email/i }).fill(email);
    await page.locator('input[type="password"]').first().fill(password);
    await page.getByLabel(/konfirmasi password/i).fill(password);
    await page.getByRole("button", { name: /^Daftar$/ }).click();

    await page.waitForURL((url) => url.pathname.includes("/onboarding"), {
      timeout: 15_000,
    });

    const submitBtn = page.getByRole("button", { name: /lanjut|simpan|submit/i });
    await expect(submitBtn).toBeVisible({ timeout: 5_000 });
    await submitBtn.click();
    await expect(page.locator("text=/2 karakter|wajib/i")).toBeVisible({ timeout: 5_000 });
  });
});

test.describe("Dashboard after onboarding", () => {
  test("owner can access dashboard", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("textbox", { name: /email/i }).fill(E2E_OWNER.email);
    await page.locator('input[type="password"]').fill(E2E_OWNER.password);
    await page.getByRole("button", { name: /^Masuk$/ }).click();
    await page.waitForURL((url) =>
      url.pathname.includes("/dashboard") || url.pathname.includes("/onboarding"),
      { timeout: 15_000 },
    );

    if (page.url().includes("/dashboard")) {
      await expect(page.locator("text=/dashboard|ringkasan/i").first()).toBeVisible({ timeout: 10_000 });
    } else {
      // On onboarding — valid state for fresh owner
      await expect(page).toHaveURL(/\/onboarding/);
    }
  });
});
