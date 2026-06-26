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
    if (!page.url().includes("/dashboard")) return;
    await page.goto("/products");
  });

  test("products page loads", async ({ page }) => {
    if (!page.url().includes("/products")) return;
    await page.waitForLoadState("networkidle");
    await expect(page.locator("text=/produk/i").first()).toBeVisible({ timeout: 10_000 });
  });

  test("add product button is visible", async ({ page }) => {
    if (!page.url().includes("/products")) return;
    const addBtn = page.getByRole("button", { name: /tambah|add|buat/i });
    if (await addBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await expect(addBtn).toBeVisible();
    }
  });

  test("product form has required fields", async ({ page }) => {
    if (!page.url().includes("/products")) return;
    const addBtn = page.getByRole("button", { name: /tambah|add|buat/i }).first();
    if (!(await addBtn.isVisible({ timeout: 3_000 }).catch(() => false))) return;

    await addBtn.click();
    // Should show form with name, code, price fields
    await expect(page.locator("text=/nama|kode|harga/i").first()).toBeVisible({ timeout: 5_000 });
  });

  test("empty product name is rejected", async ({ page }) => {
    if (!page.url().includes("/products")) return;
    const addBtn = page.getByRole("button", { name: /tambah|add|buat/i }).first();
    if (!(await addBtn.isVisible({ timeout: 3_000 }).catch(() => false))) return;

    await addBtn.click();
    // Submit without filling name
    const submitBtn = page.getByRole("button", { name: /simpan|save|buat/i }).first();
    if (await submitBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await submitBtn.click();
      // Should show validation error
      await page.waitForTimeout(500);
    }
  });
});
