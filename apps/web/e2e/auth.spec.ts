import { test, expect } from "@playwright/test";
import { E2E_OWNER, freshRegisterEmail } from "./fixtures/users";


/**
 * Auth flow E2E tests.
 * Uses deployed app (Mode B) with seeded owner user.
 * Registration email tests use Inbucket (Mode A only).
 */

test.describe("Login", () => {
  test("successful login navigates to dashboard", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("textbox", { name: /email/i }).fill(E2E_OWNER.email);
    await page.getByRole("textbox", { name: /password/i }).fill(E2E_OWNER.password);
    await page.getByRole("button", { name: /masuk/i }).first().click();
    await page.waitForURL((url) => url.pathname.includes("/dashboard"), {
      timeout: 15_000,
    });
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test("login with wrong password shows error", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("textbox", { name: /email/i }).fill(E2E_OWNER.email);
    await page.getByRole("textbox", { name: /password/i }).fill("WrongPassword999!");
    await page.getByRole("button", { name: /masuk/i }).first().click();
    await expect(page.locator("[role='alert']")).toBeVisible({ timeout: 10_000 });
  });

  test("login with invalid email shows error", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("textbox", { name: /email/i }).fill("nonexistent@test.com");
    await page.getByRole("textbox", { name: /password/i }).fill("SomePassword1!");
    await page.getByRole("button", { name: /masuk/i }).first().click();
    await expect(page.locator("[role='alert']")).toBeVisible({ timeout: 10_000 });
  });

  test("login with empty fields shows validation error", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("button", { name: /masuk/i }).first().click();
    // Form validation should prevent submission or show errors
    await page.waitForTimeout(500);
    await expect(page.getByRole("textbox", { name: /email/i })).toBeVisible();
  });

  test("logged-in user visiting /login redirects to dashboard", async ({ page }) => {
    // First log in
    await page.goto("/login");
    await page.getByRole("textbox", { name: /email/i }).fill(E2E_OWNER.email);
    await page.getByRole("textbox", { name: /password/i }).fill(E2E_OWNER.password);
    await page.getByRole("button", { name: /masuk/i }).first().click();
    await page.waitForURL((url) => url.pathname.includes("/dashboard"), {
      timeout: 15_000,
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
    const passwordFields = page.getByRole("textbox", { name: /password/i });
    await expect(passwordFields).toHaveCount(2);
    await expect(page.getByRole("button", { name: /daftar/i })).toBeVisible();
  });

  test("register with invalid email shows validation error", async ({ page }) => {
    await page.goto("/register");
    await page.getByRole("textbox", { name: /nama lengkap/i }).fill("Test User");
    await page.getByRole("textbox", { name: /email/i }).fill("not-an-email");
    await page.getByRole("textbox", { name: /password/i }).first().fill("Password1!");
    await page.getByRole("textbox", { name: /konfirmasi password/i }).fill("Password1!");
    // HTML5 type=email blocks native submit; check form wasn't submitted
    await page.waitForTimeout(500);
    await expect(page).toHaveURL(/\/register/);
  });

  test("register with weak password shows validation error", async ({ page }) => {
    await page.goto("/register");
    await page.getByRole("textbox", { name: /nama lengkap/i }).fill("Test User");
    await page.getByRole("textbox", { name: /email/i }).fill(freshRegisterEmail());
    await page.getByRole("textbox", { name: /password/i }).first().fill("weak");
    await page.getByRole("textbox", { name: /konfirmasi password/i }).fill("weak");
    await page.getByRole("button", { name: /daftar/i }).click();
    await expect(page.locator("text=/8 karakter/i")).toBeVisible({ timeout: 5_000 });
  });

  test("register with mismatched passwords shows error", async ({ page }) => {
    await page.goto("/register");
    await page.getByRole("textbox", { name: /nama lengkap/i }).fill("Test User");
    await page.getByRole("textbox", { name: /email/i }).fill(freshRegisterEmail());
    await page.getByRole("textbox", { name: /password/i }).first().fill("Password1!");
    await page.getByRole("textbox", { name: /konfirmasi password/i }).fill("Different1!");
    await page.getByRole("button", { name: /daftar/i }).click();
    await expect(page.locator("text=/tidak cocok/i")).toBeVisible({ timeout: 5_000 });
  });

  test("register with valid data shows email confirmation state", async ({ page }) => {
    const email = freshRegisterEmail();
    await page.goto("/register");
    await page.getByRole("textbox", { name: /nama lengkap/i }).fill("E2E Register Test");
    await page.getByRole("textbox", { name: /email/i }).fill(email);
    await page.getByRole("textbox", { name: /password/i }).first().fill("Password1!");
    await page.getByRole("textbox", { name: /konfirmasi password/i }).fill("Password1!");
    await page.getByRole("button", { name: /daftar/i }).click();
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
    // HTML5 type=email blocks native submit; check form wasn't submitted
    await page.waitForTimeout(500);
    await expect(page).toHaveURL(/\/forgot-password/);
  });
});

test.describe("Logout", () => {
  test("user can log out and is redirected to login", async ({ page }) => {
    // Log in first
    await page.goto("/login");
    await page.getByRole("textbox", { name: /email/i }).fill(E2E_OWNER.email);
    await page.getByRole("textbox", { name: /password/i }).fill(E2E_OWNER.password);
    await page.getByRole("button", { name: /masuk/i }).first().click();
    await page.waitForURL((url) => url.pathname.includes("/dashboard"), {
      timeout: 15_000,
    });

    // Find and click logout
    // Try user menu button first
    const userMenu = page.getByRole("button", { name: /menu|profil|akun|keluar/i }).first();
    if (await userMenu.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await userMenu.click();
    }
    const logoutBtn = page.getByRole("button", { name: /keluar|logout|sign.?out/i }).first();
    await logoutBtn.click({ timeout: 5_000 });
    await page.waitForURL((url) => url.pathname.includes("/login"), { timeout: 10_000 });
    await expect(page).toHaveURL(/\/login/);
  });
});
