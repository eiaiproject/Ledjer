import { test } from "./helpers/auth";
import { expect } from "@playwright/test";

/**
 * Quick-entry chat E2E: ketik "jual ..." di /transactions → pratinjau →
 * Catat → mutasi terlihat di expand /products.
 *
 * Self-contained: produk + stok dibuat via API dengan nama unik per run.
 */

const TS = Date.now();
const PRODUCT_NAME = `Produk QE ${TS}`;

test("chat jual mencatat penjualan dan terlihat di mutasi stok", async ({ authPage }) => {
  const setup = await authPage.evaluate(async (name: string) => {
    const prodRes = await fetch("/api/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, unit: "pcs", sellingPriceIdr: 50000 }),
    });
    const prodBody = await prodRes.json();
    const accRes = await fetch("/api/accounts");
    const accBody = await accRes.json();
    const kas = (accBody.accounts as Array<{ id: string; code: string }>).find((a) => a.code === "1110");
    if (!kas) return { productId: "", bought: false };
    const buyRes = await fetch("/api/transactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        transactionType: "purchase",
        transactionDate: "2026-09-09",
        cashAccountId: kas.id,
        description: `Beli ${name}`,
        idempotencyKey: `qe-stock-${Date.now()}`,
        items: [{ productId: prodBody.product.id, quantity: 10, unitCostIdr: 30000 }],
      }),
    });
    return { productId: prodBody.product.id as string, bought: buyRes.ok };
  }, PRODUCT_NAME);
  expect(setup.bought).toBe(true);

  await authPage.goto("/transactions/new");
  await authPage.getByLabel(/input cepat/i).fill(`jual ${PRODUCT_NAME} 2pcs 50000`);
  await authPage.getByRole("button", { name: /kirim/i }).click();
  await expect(authPage.getByRole("button", { name: /^Catat$/ })).toBeEnabled({ timeout: 15000 });
  await authPage.getByRole("button", { name: /^Catat$/ }).click();
  await expect(authPage.getByText(/tercatat/i).first()).toBeVisible({ timeout: 15000 });

  await authPage.goto("/products");
  await authPage.getByText(PRODUCT_NAME).first().waitFor({ timeout: 15000 });
  await authPage
    .getByRole("button", { name: new RegExp(`Riwayat mutasi ${PRODUCT_NAME}`) })
    .click();
  await expect(authPage.getByText(/TRX-/).first()).toBeVisible({ timeout: 15000 });
});
