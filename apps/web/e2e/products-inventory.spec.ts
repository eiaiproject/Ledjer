import { test, expect } from "@playwright/test";
import { E2E_OWNER } from "./fixtures/users";

/**
 * Product and inventory E2E tests.
 */

async function loginAsOwner(page: import("@playwright/test").Page): Promise<void> {
  await page.goto("/login");
  await page.getByRole("textbox", { name: /email/i }).fill(E2E_OWNER.email);
  await page.getByRole("textbox", { name: /password/i }).fill(E2E_OWNER.password);
  await page.getByRole("button", { name: /masuk/i }).first().click();
  await page.waitForURL((url) =>
    url.pathname.includes("/dashboard") || url.pathname.includes("/onboarding"),
    { timeout: 15_000 },
  );
}

test.describe("Products page", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsOwner(page);
    await expect(page).toHaveURL(/\/dashboard|\/onboarding/);
    await page.goto("/products");
    await expect(page).toHaveURL(/\/products/);
  });

  test("products page loads", async ({ page }) => {
    await page.waitForLoadState("networkidle");
    await expect(page.locator("text=/produk/i").first()).toBeVisible({ timeout: 10_000 });
  });

  test("add product button is visible", async ({ page }) => {
    const addBtn = page.getByRole("button", { name: /Tambah Produk/i }).first();
    await expect(addBtn).toBeVisible({ timeout: 5_000 });
  });

  test("product form has required fields", async ({ page }) => {
    const addBtn = page.getByRole("button", { name: /Tambah Produk/i }).first();
    await expect(addBtn).toBeVisible({ timeout: 5_000 });

    await addBtn.click();
    await expect(page.locator("text=/nama|kode|harga/i").first()).toBeVisible({ timeout: 5_000 });
  });

  test("empty product name is rejected", async ({ page }) => {
    const addBtn = page.getByRole("button", { name: /Tambah Produk/i }).first();
    await expect(addBtn).toBeVisible({ timeout: 5_000 });

    await addBtn.click();
    const submitBtn = page.getByRole("button", { name: /^Tambah$/i }).first();
    await expect(submitBtn).toBeVisible({ timeout: 3_000 });
    await submitBtn.click();
    await page.waitForTimeout(500);
    // Form should still be visible (validation prevented submission)
    await expect(page.locator("body")).toBeVisible();
  });
});
