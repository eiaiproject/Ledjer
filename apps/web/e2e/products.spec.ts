import { test } from "./helpers/auth";
import { expect, type Page } from "@playwright/test";

/**
 * Products + inventory flows E2E (F-03): product CRUD via the /products UI,
 * goods purchase (pembelian) and goods sale (penjualan) via /transactions/new.
 *
 * Creates real data against the staging Worker, so unique names/descriptions
 * mark each run's data. Each test is self-contained (no cross-test order
 * dependency - the suite runs fully parallel).
 */

const TS = Date.now();
const PRODUCT_NAME = `Produk E2E ${TS}`;
const EDIT_PRODUCT_NAME = `Produk E2E Edit ${TS}`;
const EDIT_PRODUCT_NEW_NAME = `Produk E2E Edit Fixed ${TS}`;
const TOGGLE_PRODUCT_NAME = `Produk E2E Toggle ${TS}`;
const PURCHASE_PRODUCT_NAME = `Produk E2E Beli ${TS}`;
const SALE_PRODUCT_NAME = `Produk E2E Jual ${TS}`;
const PURCHASE_DESC = `Beli E2E ${TS}`;
const SALE_DESC = `Jual E2E ${TS}`;

const DETAIL_URL = /\/transactions\/[0-9a-f-]{36}$/;

/**
 * Same reload-then-assert pattern as accounts.spec.ts: the post-create list
 * refetch can hit a lagging D1 replica, so reload once before giving up.
 */
async function expectProductVisible(page: Page, productName: string) {
  try {
    await expect(page.getByText(productName).first()).toBeVisible({ timeout: 8000 });
  } catch {
    await page.reload({ waitUntil: "load" });
    await expect(page.getByText(productName).first()).toBeVisible({ timeout: 20000 });
  }
}

/** Fetch the id of a product by exact name via the authenticated page context. */
async function getProductId(page: Page, productName: string): Promise<string> {
  const id = await page.evaluate(async (name: string) => {
    const res = await fetch("/api/products?includeInactive=true");
    const body = await res.json();
    const found = (body.products as Array<{ id: string; name: string }>).find((p) => p.name === name);
    return found?.id ?? "";
  }, productName);
  expect(id).not.toBe("");
  return id;
}

/** Build stock for the sale test without depending on other tests. */
async function apiPurchase(page: Page, productId: string, qty: number, unitCost: number, description: string) {
  const ok = await page.evaluate(
    async (args: { productId: string; qty: number; unitCost: number; description: string }) => {
      const accRes = await fetch("/api/accounts");
      const accBody = await accRes.json();
      const kas = (accBody.accounts as Array<{ id: string; code: string }>).find((a) => a.code === "1110");
      if (!kas) return false;
      const res = await fetch("/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transactionType: "purchase",
          transactionDate: "2026-08-01",
          cashAccountId: kas.id,
          description: args.description,
          idempotencyKey: `e2e-sale-stock-${Date.now()}-abcdef`,
          items: [{ productId: args.productId, quantity: args.qty, unitCostIdr: args.unitCost }],
        }),
      });
      return res.ok;
    },
    { productId, qty, unitCost, description },
  );
  expect(ok).toBe(true);
}

test.describe("Products page", () => {
  test("shows products page with create form", async ({ authPage }) => {
    await authPage.goto("/products", { waitUntil: "load", timeout: 15000 });
    await expect(authPage.getByRole("heading", { name: "Produk", exact: true })).toBeVisible({ timeout: 15000 });
    await expect(authPage.getByLabel("Nama Produk").first()).toBeVisible({ timeout: 15000 });
    await expect(authPage.getByLabel("Satuan").first()).toBeVisible({ timeout: 15000 });
    await expect(authPage.getByRole("button", { name: /Tambah Produk/ })).toBeVisible();
  });

  test("rejects a product with empty name", async ({ authPage }) => {
    await authPage.goto("/products", { waitUntil: "load", timeout: 15000 });
    await authPage.getByLabel("Satuan").first().fill("pcs");
    await authPage.getByRole("button", { name: /Tambah Produk/ }).click();

    await expect(authPage.getByText("Nama produk harus diisi.")).toBeVisible({ timeout: 10000 });
  });

  test("creates a new product", async ({ authPage }) => {
    await authPage.goto("/products", { waitUntil: "load", timeout: 15000 });
    await authPage.getByLabel("Nama Produk").first().fill(PRODUCT_NAME);
    await authPage.getByLabel("Satuan").first().fill("pcs");
    await authPage.getByLabel("Harga Jual (Rp)").first().fill("15000");
    await authPage.getByRole("button", { name: /Tambah Produk/ }).click();

    await expect(authPage.getByText("Produk berhasil dibuat.")).toBeVisible({ timeout: 10000 });
    await expectProductVisible(authPage, PRODUCT_NAME);
  });

  test("edits a product", async ({ authPage }) => {
    await authPage.goto("/products", { waitUntil: "load", timeout: 15000 });
    await authPage.getByLabel("Nama Produk").first().fill(EDIT_PRODUCT_NAME);
    await authPage.getByLabel("Satuan").first().fill("pcs");
    await authPage.getByRole("button", { name: /Tambah Produk/ }).click();
    await expectProductVisible(authPage, EDIT_PRODUCT_NAME);

    const row = authPage.locator("li", { hasText: EDIT_PRODUCT_NAME });
    await row.getByRole("button", { name: "Edit" }).click();
    await expect(authPage.getByText("Edit Produk")).toBeVisible({ timeout: 10000 });
    await authPage.getByLabel("Nama Produk").last().fill(EDIT_PRODUCT_NEW_NAME);
    await authPage.getByRole("button", { name: "Simpan" }).click();

    await expect(authPage.getByText("Produk berhasil diperbarui.")).toBeVisible({ timeout: 10000 });
    await expectProductVisible(authPage, EDIT_PRODUCT_NEW_NAME);
  });

  test("deactivates and reactivates a product", async ({ authPage }) => {
    await authPage.goto("/products", { waitUntil: "load", timeout: 15000 });
    await authPage.getByLabel("Nama Produk").first().fill(TOGGLE_PRODUCT_NAME);
    await authPage.getByLabel("Satuan").first().fill("pcs");
    await authPage.getByRole("button", { name: /Tambah Produk/ }).click();
    await expectProductVisible(authPage, TOGGLE_PRODUCT_NAME);

    const row = authPage.locator("li", { hasText: TOGGLE_PRODUCT_NAME });
    await row.getByRole("button", { name: /Nonaktifkan/ }).click();
    await expect(authPage.getByText("Produk dinonaktifkan.")).toBeVisible({ timeout: 15000 });
    await expect(row.getByText("Nonaktif", { exact: true })).toBeVisible({ timeout: 15000 });

    await row.getByRole("button", { name: /Aktifkan/ }).click();
    await expect(authPage.getByText("Produk diaktifkan.")).toBeVisible({ timeout: 15000 });
    await expect(row.getByText("Nonaktif", { exact: true })).toHaveCount(0);
  });
});

test.describe("Inventory transactions", () => {
  test("creates a purchase (pembelian) with product items", async ({ authPage }) => {
    // Self-contained: create the product first, then buy it.
    await authPage.goto("/products", { waitUntil: "load", timeout: 15000 });
    await authPage.getByLabel("Nama Produk").first().fill(PURCHASE_PRODUCT_NAME);
    await authPage.getByLabel("Satuan").first().fill("pcs");
    await authPage.getByRole("button", { name: /Tambah Produk/ }).click();
    await expectProductVisible(authPage, PURCHASE_PRODUCT_NAME);
    const productId = await getProductId(authPage, PURCHASE_PRODUCT_NAME);

    await authPage.goto("/transactions/new", { waitUntil: "load", timeout: 15000 });
    await authPage.getByLabel("Tanggal").fill("2026-08-01");
    await authPage.getByLabel("Jenis Transaksi").selectOption("purchase");
    await authPage.getByLabel("Akun Kas/Bank Sumber").selectOption({ label: "1110 · Kas" });
    await authPage.getByRole("button", { name: /Tambah Baris/ }).click();
    await authPage.getByLabel("Produk").selectOption(productId);
    await authPage.getByLabel("Jumlah").fill("2");
    await authPage.getByLabel("Harga Beli (Rp)").fill("25000");
    await authPage.getByLabel("Keterangan").fill(PURCHASE_DESC);
    await authPage.getByRole("button", { name: "Simpan Transaksi" }).click();

    await expect(authPage).toHaveURL(DETAIL_URL, { timeout: 15000 });
    await expect(authPage.getByText(/Pembelian Barang/)).toBeVisible({ timeout: 15000 });
    await expect(authPage.getByText(PURCHASE_DESC)).toBeVisible({ timeout: 15000 });
  });

  test("creates a goods sale (penjualan) from purchased stock", async ({ authPage }) => {
    // Self-contained: create product + stock via API, then sell via UI.
    await authPage.goto("/products", { waitUntil: "load", timeout: 15000 });
    await authPage.getByLabel("Nama Produk").first().fill(SALE_PRODUCT_NAME);
    await authPage.getByLabel("Satuan").first().fill("pcs");
    await authPage.getByLabel("Harga Jual (Rp)").first().fill("30000");
    await authPage.getByRole("button", { name: /Tambah Produk/ }).click();
    await expectProductVisible(authPage, SALE_PRODUCT_NAME);
    const productId = await getProductId(authPage, SALE_PRODUCT_NAME);
    await apiPurchase(authPage, productId, 5, 20000, `Stok E2E ${TS}`);

    await authPage.goto("/transactions/new", { waitUntil: "load", timeout: 15000 });
    await authPage.getByLabel("Tanggal").fill("2026-08-01");
    await authPage.getByLabel("Jenis Transaksi").selectOption("cash_in");
    await authPage.getByLabel("Akun Kas/Bank Tujuan").selectOption({ label: "1110 · Kas" });
    await authPage.getByLabel("Kategori Pendapatan").selectOption({ label: "4110 · Pendapatan Usaha" });
    await authPage.getByRole("button", { name: /Ini penjualan barang/ }).click();
    await authPage.getByRole("button", { name: /Tambah Baris/ }).click();
    await authPage.getByLabel("Produk").selectOption(productId);
    await authPage.getByLabel("Jumlah").fill("1");
    await authPage.getByLabel("Harga Jual (Rp)").fill("30000");
    await authPage.getByLabel("Keterangan").fill(SALE_DESC);
    await authPage.getByRole("button", { name: "Simpan Transaksi" }).click();

    await expect(authPage).toHaveURL(DETAIL_URL, { timeout: 15000 });
    await expect(authPage.getByText(/Uang Masuk/)).toBeVisible({ timeout: 15000 });
    await expect(authPage.getByText(SALE_DESC)).toBeVisible({ timeout: 15000 });
  });
});
