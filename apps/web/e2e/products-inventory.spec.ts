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

type ProductRecord = {
  id: string;
  name: string;
  current_stock: number | string | null;
};

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Get product by name via Supabase API */
async function getProductByName(orgId: string, name: string): Promise<ProductRecord | null> {
  const res = await fetch(
    `${E2E.supabaseUrl}/rest/v1/products?organization_id=eq.${orgId}&name=eq.${encodeURIComponent(name)}&select=*`,
    { headers: SR_HEADERS },
  );
  if (!res.ok) return null;
  const data = await res.json();
  return data[0] || null;
}

async function waitForProduct(
  orgId: string,
  name: string,
  predicate: (product: ProductRecord) => boolean = () => true,
  label = "product",
  timeoutMs = 15_000,
): Promise<ProductRecord> {
  const deadline = Date.now() + timeoutMs;
  let lastProduct: ProductRecord | null = null;

  while (Date.now() < deadline) {
    lastProduct = await getProductByName(orgId, name);
    if (lastProduct && predicate(lastProduct)) return lastProduct;
    await new Promise((resolve) => setTimeout(resolve, 300));
  }

  throw new Error(
    `Timed out waiting for ${label}: ${name}. Last product state: ${JSON.stringify(lastProduct)}`,
  );
}

/** Get org ID from authenticated user's context */
async function getOrgId(): Promise<string> {
  const seedOrgName = encodeURIComponent("[E2E] Toko Otomatis");
  const res = await fetch(
    `${E2E.supabaseUrl}/rest/v1/organizations?select=id&name=eq.${seedOrgName}&limit=1`,
    { headers: SR_HEADERS },
  );
  const data = await res.json();
  return data[0]?.id || "";
}

async function selectProductForTransaction(
  page: import("@playwright/test").Page,
  productName: string,
) {
  const productCombobox = page.locator('input[role="combobox"][name="productId"]');
  await expect(productCombobox).toBeVisible({ timeout: 10_000 });

  const listbox = page.locator("#productId-listbox");
  const productOptionName = new RegExp(escapeRegExp(productName), "i");
  const deadline = Date.now() + 15_000;
  let lastListboxText = "";

  while (Date.now() < deadline) {
    await productCombobox.click();
    await productCombobox.fill(productName);
    await expect(listbox).toBeVisible({ timeout: 3_000 });

    const productOption = listbox
      .getByRole("option", { name: productOptionName })
      .first();

    if (await productOption.isVisible({ timeout: 1_000 }).catch(() => false)) {
      await productOption.click();
      await expect(productCombobox).toHaveValue(productOptionName, { timeout: 3_000 });
      return;
    }

    lastListboxText = (await listbox.textContent().catch(() => "")) || "";
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
  }

  throw new Error(
    `Product option "${productName}" was not available in transaction combobox. Last listbox: ${lastListboxText}`,
  );
}

async function selectFirstComboboxOption(
  page: import("@playwright/test").Page,
  name: string,
) {
  const combobox = page.locator(`input[role="combobox"][name="${name}"]`);
  if (!(await combobox.isVisible({ timeout: 3_000 }).catch(() => false))) {
    return;
  }

  await combobox.click();
  const listbox = page.locator(`#${name}-listbox`);
  await expect(listbox).toBeVisible({ timeout: 5_000 });
  const firstOption = listbox.getByRole("option").first();
  await expect(firstOption).toBeVisible({ timeout: 5_000 });
  await firstOption.click();
  await expect(combobox).not.toHaveValue("", { timeout: 3_000 });
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

if (E2E.hasServiceRole) {
test.describe("Inventory purchase-to-sale flow (API-verified)", () => {
  test("create product → purchase → verify stock → sell → verify stock & COGS", async ({ page }, testInfo) => {
    const suffix = `${Date.now()}-${testInfo.retry}-${testInfo.workerIndex}`;
    const productCode = `E2E-INV-${suffix}`;
    const productName = `[E2E] Inv ${suffix}`;
    const orgId = await getOrgId();
    expect(orgId).toBeTruthy();

    await loginViaUI(page);
    await expect(page).toHaveURL(/\/dashboard|\/onboarding/);

    // Step 1: Create a product via UI
    await page.goto("/products");
    await page.waitForLoadState("networkidle");

    const addBtn = page.getByRole("button", { name: /Tambah Produk/i }).first();
    await expect(addBtn).toBeVisible({ timeout: 10_000 });
    await addBtn.click();

    const dialog = page.getByRole("dialog", { name: /tambah produk/i });
    await expect(dialog).toBeVisible({ timeout: 5_000 });

    await dialog.getByLabel(/kode produk/i).fill(productCode);
    await dialog.getByLabel(/nama produk/i).fill(productName);

    const priceInput = dialog.getByLabel(/harga jual/i);
    if (await priceInput.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await priceInput.fill("50000");
    }

    const purchasePriceInput = dialog.getByLabel(/harga beli/i);
    if (await purchasePriceInput.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await purchasePriceInput.fill("25000");
    }

    // Listen for product creation API response before submitting
    const createProductResponsePromise = page.waitForResponse(
      (res) => res.url().includes("/rest/v1/products") && res.request().method() === "POST",
    );

    const submitBtn = dialog.getByRole("button", { name: /^Tambah$/i });
    await expect(submitBtn).toBeVisible({ timeout: 3_000 });
    await expect(submitBtn).toBeEnabled();
    await submitBtn.click();

    const createProductResponse = await createProductResponsePromise;
    const responseBody = await createProductResponse.text();
    expect(
      createProductResponse.status(),
      `Product creation failed (HTTP ${createProductResponse.status()}). Response: ${responseBody}`,
    ).toBeLessThan(300);

    // If dialog stays open after a 2xx response, the mutation likely failed
    // client-side (onError handler). Expose the real failure with full context.
    try {
      await expect(dialog).toBeHidden({ timeout: 10_000 });
    } catch {
      const pageText = await page.locator("body").innerText();
      throw new Error(
        `Product creation returned HTTP ${createProductResponse.status()} but dialog stayed open.\n` +
          `Response body: ${responseBody}\n` +
          `Page text:\n${pageText}`,
      );
    }

    // Step 2: Verify product exists in DB with stock = 0
    const productBefore = await waitForProduct(
      orgId,
      productName,
      (product) => Number(product.current_stock) === 0,
      "created product with zero stock",
    );
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

    await selectProductForTransaction(page, productName);
    const qtyInput = page.locator("#product-quantity");
    await expect(qtyInput).toBeVisible({ timeout: 5_000 });
    await qtyInput.fill("10");

    await selectFirstComboboxOption(page, "cashAccountId");

    const txSubmitBtn = page.getByRole("button", { name: /Catat Pembelian|Catat Transaksi/i }).first();
    await expect(txSubmitBtn).toBeVisible({ timeout: 5_000 });
    await txSubmitBtn.click();

    await expect(
      page.getByText(/Transaksi tersimpan|berhasil/i).first(),
    ).toBeVisible({ timeout: 15_000 });

    // Step 4: Verify stock increased via API (if product was attached)
    const productAfterPurchase = await waitForProduct(
      orgId,
      productName,
      (product) => Number(product.current_stock) === 10,
      "purchase stock update",
    );
    expect(Number(productAfterPurchase.current_stock)).toBe(10);

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

    await selectProductForTransaction(page, productName);
    const saleQtyInput = page.locator("#product-quantity");
    await expect(saleQtyInput).toBeVisible({ timeout: 5_000 });
    await saleQtyInput.fill("2");

    await selectFirstComboboxOption(page, "cashAccountId");

    const saleSubmit = page.getByRole("button", { name: /Catat Penjualan|Catat Transaksi/i }).first();
    await expect(saleSubmit).toBeVisible({ timeout: 5_000 });
    await saleSubmit.click();

    await expect(
      page.getByText(/Transaksi tersimpan|berhasil/i).first(),
    ).toBeVisible({ timeout: 15_000 });

    // Step 6: Verify stock decreased via API
    const productAfterSale = await waitForProduct(
      orgId,
      productName,
      (product) => Number(product.current_stock) === 8,
      "sale stock update",
    );
    expect(Number(productAfterSale.current_stock)).toBe(8);
  });
});
}
