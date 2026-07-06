import { test, expect } from "@playwright/test";
import { E2E_OWNER, freshRegisterEmail } from "./fixtures/users";

/**
 * Auth flow E2E tests.
 * Uses deployed app (Mode B) with seeded owner user.
 * Registration email tests use Inbucket (Mode A only).
 */

const LOGIN_TIMEOUT = 20_000;

test.describe("Login", () => {
  test("successful login navigates to dashboard", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("textbox", { name: /email/i }).fill(E2E_OWNER.email);
    await page.locator('input[type="password"]').fill(E2E_OWNER.password);
    // Exact-match "Masuk" to avoid clicking "Masuk dengan Google"
    await page.getByRole("button", { name: /^Masuk$/ }).click();
    await page.waitForURL((url) => url.pathname.includes("/dashboard"), {
      timeout: LOGIN_TIMEOUT,
    });
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test("login with wrong password shows error", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("textbox", { name: /email/i }).fill(E2E_OWNER.email);
    await page.locator('input[type="password"]').fill("WrongPassword999!");
    await page.getByRole("button", { name: /^Masuk$/ }).click();
    await expect(page.locator("[role='alert']")).toBeVisible({ timeout: LOGIN_TIMEOUT });
  });

  test("login with invalid email shows error", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("textbox", { name: /email/i }).fill("nonexistent@test.com");
    await page.locator('input[type="password"]').fill("SomePassword1!");
    await page.getByRole("button", { name: /^Masuk$/ }).click();
    await expect(page.locator("[role='alert']")).toBeVisible({ timeout: LOGIN_TIMEOUT });
  });

  test("login with empty fields shows validation error", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("button", { name: /^Masuk$/ }).click();
    await expect(
      page.getByRole("alert").filter({ hasText: /email tidak valid|password wajib diisi/i }).first(),
    ).toBeVisible({ timeout: 5_000 });
    await expect(page).toHaveURL(/\/login/);
  });

  test("logged-in user visiting /login redirects to dashboard", async ({ page }) => {
    // First log in
    await page.goto("/login");
    await page.getByRole("textbox", { name: /email/i }).fill(E2E_OWNER.email);
    await page.locator('input[type="password"]').fill(E2E_OWNER.password);
    await page.getByRole("button", { name: /^Masuk$/ }).click();
    await page.waitForURL((url) => url.pathname.includes("/dashboard"), {
      timeout: LOGIN_TIMEOUT,
    });

    // Navigate to /login — should redirect back
    await page.goto("/login");
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(/\/dashboard/);
  });
});

test.describe("Register", () => {
  test("register form has all fields", async ({ page }) => {
    await page.goto("/register");
    await expect(page.getByRole("textbox", { name: /nama lengkap/i })).toBeVisible();
    await expect(page.getByRole("textbox", { name: /email/i })).toBeVisible();
    // Password fields
    const passwordFields = page.locator('input[type="password"]');
    await expect(passwordFields).toHaveCount(2);
    await expect(page.getByRole("button", { name: /^Daftar$/ })).toBeVisible();
  });

  test("register with invalid email shows validation error", async ({ page }) => {
    await page.goto("/register");
    await page.getByRole("textbox", { name: /nama lengkap/i }).fill("Test User");
    await page.getByRole("textbox", { name: /email/i }).fill("not-an-email");
    await page.locator('input[type="password"]').first().fill("Password1!");
    await page.getByLabel(/konfirmasi password/i).fill("Password1!");
    await page.getByRole("button", { name: /^Daftar$/ }).click();
    await expect(page.getByRole("alert").filter({ hasText: /email tidak valid/i }).first()).toBeVisible({ timeout: 5_000 });
    await expect(page).toHaveURL(/\/register/);
  });

  test("register with weak password shows validation error", async ({ page }) => {
    await page.goto("/register");
    await page.getByRole("textbox", { name: /nama lengkap/i }).fill("Test User");
    await page.getByRole("textbox", { name: /email/i }).fill(freshRegisterEmail());
    await page.locator('input[type="password"]').first().fill("weak");
    await page.getByLabel(/konfirmasi password/i).fill("weak");
    await page.getByRole("button", { name: /^Daftar$/ }).click();
    await expect(page.locator("text=/8 karakter/i")).toBeVisible({ timeout: 5_000 });
  });

  test("register with mismatched passwords shows error", async ({ page }) => {
    await page.goto("/register");
    await page.getByRole("textbox", { name: /nama lengkap/i }).fill("Test User");
    await page.getByRole("textbox", { name: /email/i }).fill(freshRegisterEmail());
    await page.locator('input[type="password"]').first().fill("Password1!");
    await page.getByLabel(/konfirmasi password/i).fill("Different1!");
    await page.getByRole("button", { name: /^Daftar$/ }).click();
    await expect(page.locator("text=/tidak cocok/i")).toBeVisible({ timeout: 5_000 });
  });

  test("register with valid data shows email confirmation state", async ({ page }) => {
    const email = freshRegisterEmail();
    await page.goto("/register");
    await page.getByRole("textbox", { name: /nama lengkap/i }).fill("E2E Register Test");
    await page.getByRole("textbox", { name: /email/i }).fill(email);
    await page.locator('input[type="password"]').first().fill("Password1!");
    await page.getByLabel(/konfirmasi password/i).fill("Password1!");
    await page.getByRole("button", { name: /^Daftar$/ }).click();
    // Should navigate away from /register (either email confirmation, onboarding, or dashboard)
    await page.waitForURL((url) => !url.pathname.includes("/register"), {
      timeout: 15_000,
    });
  });
});

test.describe("Forgot Password", () => {
  test("submit valid email shows success state", async ({ page }) => {
    await page.goto("/forgot-password");
    await page.getByRole("textbox", { name: /email/i }).fill(E2E_OWNER.email);
    await page.getByRole("button", { name: /kirim/i }).click();
    // Always shows success (prevents account enumeration)
    await expect(page.locator("text=/cek email/i")).toBeVisible({ timeout: 10_000 });
  });

  test("submit unknown email also shows success state (no enumeration)", async ({ page }) => {
    await page.goto("/forgot-password");
    await page.getByRole("textbox", { name: /email/i }).fill("nonexistent-xyz@test.com");
    await page.getByRole("button", { name: /kirim/i }).click();
    // Should still show success to prevent enumeration
    await expect(page.locator("text=/cek email/i")).toBeVisible({ timeout: 10_000 });
  });

  test("invalid email shows validation error", async ({ page }) => {
    await page.goto("/forgot-password");
    await page.getByRole("textbox", { name: /email/i }).fill("not-email");
    await page.getByRole("button", { name: /kirim/i }).click();
    await expect(page.getByRole("alert").filter({ hasText: /email tidak valid/i }).first()).toBeVisible({ timeout: 5_000 });
    await expect(page).toHaveURL(/\/forgot-password/);
  });
});

test.describe("Logout", () => {
  test("user can log out and is redirected to login", async ({ page }) => {
    // Log in first
    await page.goto("/login");
    await page.getByRole("textbox", { name: /email/i }).fill(E2E_OWNER.email);
    await page.locator('input[type="password"]').fill(E2E_OWNER.password);
    await page.getByRole("button", { name: /^Masuk$/ }).click();
    await page.waitForURL((url) => url.pathname.includes("/dashboard"), {
      timeout: LOGIN_TIMEOUT,
    });

    // Click the logout button (aria-label="Keluar")
    const logoutBtn = page.getByRole("button", { name: /keluar/i });
    await logoutBtn.first().click({ timeout: 5_000 });
    await page.waitForURL((url) => url.pathname.includes("/login"), { timeout: 10_000 });
    await expect(page).toHaveURL(/\/login/);
  });
});
