import { test, expect } from "@playwright/test";

/**
 * Public auth-form checks that do not require seeded backend users.
 */

const LOGIN_TIMEOUT = 20_000;

test.describe("Login", () => {
  test("login with wrong credentials shows generic error (no account enumeration)", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("textbox", { name: /email/i }).fill("nonexistent@test.com");
    await page.locator('input[type="password"]').fill("WrongPassword999!");
    await page.getByRole("button", { name: /^Masuk$/ }).click();
    const alert = page.locator("[role='alert']");
    await expect(alert).toBeVisible({ timeout: LOGIN_TIMEOUT });
    // Verify generic error message does not reveal whether email exists
    const alertText = await alert.textContent();
    expect(alertText).not.toContain("registered");
    expect(alertText).not.toContain("exist");
    expect(alertText).not.toContain("found");
    expect(alertText).not.toContain("tidak terdaftar");
  });

  test("login with syntactically invalid email shows browser validation error", async ({ page }) => {
    await page.goto("/login");
    const emailInput = page.getByRole("textbox", { name: /email/i });
    // Use a syntactically invalid email (not just a non-existent one)
    await emailInput.fill("not-an-email");
    await page.locator('input[type="password"]').fill("SomePassword1!");
    await page.getByRole("button", { name: /^Masuk$/ }).click();
    // Browser-native validity check should fire before form submission
    await expect.poll(async () => emailInput.evaluate((input) => (input as HTMLInputElement).validity.typeMismatch)).toBe(true);
    await expect(page).toHaveURL(/\/login/);
  });

  test("login with empty fields shows validation error", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("button", { name: /^Masuk$/ }).click();
    await expect(
      page.getByRole("alert").filter({ hasText: /email tidak valid|password wajib diisi/i }).first(),
    ).toBeVisible({ timeout: 5_000 });
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe("Register", () => {
  test("register form has all fields", async ({ page }) => {
    await page.goto("/register");
    await expect(page.getByRole("textbox", { name: /nama lengkap/i })).toBeVisible();
    await expect(page.getByRole("textbox", { name: /email/i })).toBeVisible();
    await expect(page.locator('input[type="password"]')).toHaveCount(2);
    await expect(page.getByRole("button", { name: /^Daftar$|buat akun gratis/i })).toBeVisible();
  });

  test("register with invalid email shows validation error", async ({ page }) => {
    await page.goto("/register");
    await page.getByRole("textbox", { name: /nama lengkap/i }).fill("Test User");
    const emailInput = page.getByRole("textbox", { name: /email/i });
    await emailInput.fill("not-an-email");
    await page.locator('input[type="password"]').first().fill("Password1!");
    await page.getByLabel(/konfirmasi password/i).fill("Password1!");
    await page.getByRole("button", { name: /^Daftar$|buat akun gratis/i }).click();
    await expect.poll(async () => emailInput.evaluate((input) => (input as HTMLInputElement).validity.typeMismatch)).toBe(true);
    await expect(page).toHaveURL(/\/register/);
  });

  test("register with weak password shows validation error", async ({ page }) => {
    await page.goto("/register");
    await page.getByRole("textbox", { name: /nama lengkap/i }).fill("Test User");
    await page.getByRole("textbox", { name: /email/i }).fill("register-validation@test.com");
    await page.locator('input[type="password"]').first().fill("weak");
    await page.getByLabel(/konfirmasi password/i).fill("weak");
    await page.getByRole("button", { name: /^Daftar$|buat akun gratis/i }).click();
    await expect(page.locator("text=/8 karakter/i")).toBeVisible({ timeout: 5_000 });
  });

  test("register with mismatched passwords shows error", async ({ page }) => {
    await page.goto("/register");
    await page.getByRole("textbox", { name: /nama lengkap/i }).fill("Test User");
    await page.getByRole("textbox", { name: /email/i }).fill("register-validation@test.com");
    await page.locator('input[type="password"]').first().fill("Password1!");
    await page.getByLabel(/konfirmasi password/i).fill("Different1!");
    await page.getByRole("button", { name: /^Daftar$|buat akun gratis/i }).click();
    await expect(page.locator("text=/tidak cocok/i")).toBeVisible({ timeout: 5_000 });
  });
});

test.describe("Forgot Password", () => {
  test("invalid email shows validation error", async ({ page }) => {
    await page.goto("/forgot-password");
    const emailInput = page.getByRole("textbox", { name: /email/i });
    await emailInput.fill("not-email");
    await page.getByRole("button", { name: /kirim/i }).click();
    await expect.poll(async () => emailInput.evaluate((input) => (input as HTMLInputElement).validity.typeMismatch)).toBe(true);
    await expect(page).toHaveURL(/\/forgot-password/);
  });
});
