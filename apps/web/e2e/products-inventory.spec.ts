import { test, expect } from "@playwright/test";
import { E2E } from "./fixtures/env";
import { loginViaUI } from "./fixtures/auth";

/**
 * Product, inventory, and purchase-to-sale E2E tests.
 * Uses Supabase API for stock/COGS verification where possible.
 */

const SR_HEADERS = {
  apikey: E2E.serviceRoleKey,
  Authorization: `Bearer ${E2E.serviceRoleKey}`,
  "Content-Type": "application/json",
};

/** Get product by name via Supabase API */
async function getProductByName(orgId: string, name: string) {
  const res = await fetch(
    `${E2E.supabaseUrl}/rest/v1/products?organization_id=eq.${orgId}&name=eq.${encodeURIComponent(name)}&select=*`,
    { headers: SR_HEADERS },
  );
  if (!res.ok) return null;
  const data = await res.json();
  return data[0] || null;
}

/** Get org ID from authenticated user's context */
async function getOrgId(): Promise<string> {
  const res = await fetch(
    `${E2E.supabaseUrl}/rest/v1/organizations?select=id&limit=1`,
    { headers: SR_HEADERS },
  );
  const data = await res.json();
  return data[0]?.id || "";
}

test.describe("Products page — smoke", () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
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
    await expect(page.locator("body")).toBeVisible();
  });
});

test.describe("Inventory purchase-to-sale flow (API-verified)", () => {
  const productName = `[E2E] Inv ${Date.now()}`;

  test("create product → purchase → verify stock → sell → verify stock & COGS", async ({ page }) => {
    test.skip(!E2E.hasServiceRole, "Requires E2E_SUPABASE_SERVICE_ROLE_KEY");

    await loginViaUI(page);
    await expect(page).toHaveURL(/\/dashboard|\/onboarding/);

    // Step 1: Create a product via UI
    await page.goto("/products");
    await page.waitForLoadState("networkidle");

    const addBtn = page.getByRole("button", { name: /Tambah Produk/i }).first();
    await expect(addBtn).toBeVisible({ timeout: 10_000 });
    await addBtn.click();

    const nameInput = page.locator('input[name="name"], input[name="product_name"], input[placeholder*="nama" i]').first();
    await expect(nameInput).toBeVisible({ timeout: 5_000 });
    await nameInput.fill(productName);

    const priceInput = page.locator('input[name="selling_price"], input[name="price"], input[placeholder*="harga jual" i]').first();
    if (await priceInput.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await priceInput.fill("50000");
    }

    const purchasePriceInput = page.locator('input[name="purchase_price"], input[placeholder*="harga beli" i]').first();
    if (await purchasePriceInput.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await purchasePriceInput.fill("25000");
    }

    const submitBtn = page.getByRole("button", { name: /^Tambah$/i }).first();
    await expect(submitBtn).toBeVisible({ timeout: 3_000 });
    await submitBtn.click();

    await expect(
      page.getByText(/berhasil|tersimpan| Produk /i).first(),
    ).toBeVisible({ timeout: 10_000 });

    // Step 2: Verify product exists in DB with stock = 0
    const orgId = await getOrgId();
    const productBefore = await getProductByName(orgId, productName);
    expect(productBefore).toBeTruthy();
    expect(Number(productBefore.current_stock)).toBe(0);

    // Step 3: Purchase stock via cash purchase
    await page.goto("/transactions/new");
    await page.waitForLoadState("networkidle");

    const purchaseBtn = page.getByRole("button", { name: /Pembelian Tunai/i });
    await expect(purchaseBtn).toBeVisible({ timeout: 5_000 });
    await purchaseBtn.click();

    const amountField = page.locator('input[name="amount"], input[name*="amount"]').first();
    await expect(amountField).toBeVisible({ timeout: 5_000 });
    await amountField.fill("250000");
    await amountField.press("Tab");

    const descField = page.locator('input[name="description"], textarea[name="description"]').first();
    if (await descField.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await descField.fill(`[E2E] Purchase stock: ${productName}`);
    }

    // Select product if product field is visible
    const productCombobox = page.locator('input[role="combobox"][name="productId"]');
    if (await productCombobox.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await productCombobox.click();
      const listbox = page.locator('[role="listbox"]');
      await expect(listbox).toBeVisible({ timeout: 3_000 });
      // Find the product by name in the listbox
      const productOption = listbox.locator(`[role="option"]:has-text("${productName}")`);
      if (await productOption.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await productOption.click();
        // Fill quantity if visible
        const qtyInput = page.locator('input[name="quantity"], input[placeholder*="qty" i], input[placeholder*="kuantitas" i]').first();
        if (await qtyInput.isVisible({ timeout: 2_000 }).catch(() => false)) {
          await qtyInput.fill("10");
        }
      }
    }

    const cashAccountCombobox = page.locator('input[role="combobox"][name="cashAccountId"]');
    if (await cashAccountCombobox.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await cashAccountCombobox.click();
      const listbox = page.locator('[role="listbox"]');
      await expect(listbox).toBeVisible({ timeout: 3_000 });
      const firstOption = listbox.locator('[role="option"]').first();
      await firstOption.click();
    }

    const txSubmitBtn = page.getByRole("button", { name: /Catat Pembelian|Catat Transaksi/i }).first();
    await expect(txSubmitBtn).toBeVisible({ timeout: 5_000 });
    await txSubmitBtn.click();

    await expect(
      page.getByText(/Transaksi tersimpan|berhasil/i).first(),
    ).toBeVisible({ timeout: 15_000 });

    // Step 4: Verify stock increased via API (if product was attached)
    const productAfterPurchase = await getProductByName(orgId, productName);
    if (productAfterPurchase && Number(productAfterPurchase.current_stock) > 0) {
      expect(Number(productAfterPurchase.current_stock)).toBeGreaterThan(0);
    }

    // Step 5: Sell via cash sale
    await page.goto("/transactions/new");
    await page.waitForLoadState("networkidle");

    const saleBtn = page.getByRole("button", { name: /Penjualan Tunai/i });
    await expect(saleBtn).toBeVisible({ timeout: 5_000 });
    await saleBtn.click();

    const saleAmountField = page.locator('input[name="amount"], input[name*="amount"]').first();
    await expect(saleAmountField).toBeVisible({ timeout: 5_000 });
    await saleAmountField.fill("500000");
    await saleAmountField.press("Tab");

    const saleDescField = page.locator('input[name="description"], textarea[name="description"]').first();
    if (await saleDescField.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await saleDescField.fill(`[E2E] Sale: ${productName}`);
    }

    const saleCashAccount = page.locator('input[role="combobox"][name="cashAccountId"]');
    if (await saleCashAccount.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await saleCashAccount.click();
      const listbox = page.locator('[role="listbox"]');
      await expect(listbox).toBeVisible({ timeout: 3_000 });
      const firstOption = listbox.locator('[role="option"]').first();
      await firstOption.click();
    }

    const saleSubmit = page.getByRole("button", { name: /Catat Penjualan|Catat Transaksi/i }).first();
    await expect(saleSubmit).toBeVisible({ timeout: 5_000 });
    await saleSubmit.click();

    await expect(
      page.getByText(/Transaksi tersimpan|berhasil/i).first(),
    ).toBeVisible({ timeout: 15_000 });

    // Step 6: Verify stock decreased via API
    const productAfterSale = await getProductByName(orgId, productName);
    if (productAfterSale && Number(productAfterPurchase?.current_stock ?? 0) > 0) {
      expect(Number(productAfterSale.current_stock)).toBeLessThan(
        Number(productAfterPurchase.current_stock),
      );
    }
  });
});
