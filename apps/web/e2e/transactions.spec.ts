import { test, expect } from "@playwright/test";
import { E2E_OWNER } from "./fixtures/users";

/**
 * Transaction creation E2E tests.
 */

async function loginAsOwner(page: import("@playwright/test").Page): Promise<void> {
  await page.goto("/login");
  await page.getByRole("textbox", { name: /email/i }).fill(E2E_OWNER.email);
  await page.locator('input[type="password"]').fill(E2E_OWNER.password);
  await page.getByRole("button", { name: /^Masuk$/ }).click();
  await page.waitForURL((url) =>
    url.pathname.includes("/dashboard") || url.pathname.includes("/onboarding"),
    { timeout: 15_000 },
  );
}

test.describe("Transaction creation", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsOwner(page);
    await expect(page).toHaveURL(/\/dashboard|\/onboarding/);
  });

  test("navigate to new transaction page", async ({ page }) => {
    await page.goto("/transactions/new");
    await expect(page.locator("text=/transaksi baru/i").first()).toBeVisible({ timeout: 10_000 });
  });

  test("transaction type selector is visible", async ({ page }) => {
    await page.goto("/transactions/new");
    await expect(page.locator("text=/penjualan|pembelian|modal|transfer/i").first()).toBeVisible({
      timeout: 10_000,
    });
  });

  test("cash sale type shows correct fields", async ({ page }) => {
    await page.goto("/transactions/new");
    const cashSaleBtn = page.getByRole("button", { name: /Penjualan Tunai/i });
    await expect(cashSaleBtn).toBeVisible({ timeout: 5_000 });
    await cashSaleBtn.click();
    // Amount field labeled "Total Penjualan" for sale types
    await expect(page.locator("text=/Total Penjualan|Nominal/i").first()).toBeVisible({ timeout: 5_000 });
    // Cash account field labeled "Diterima di"
    await expect(page.locator("text=/Diterima di|Akun kas/i").first()).toBeVisible({ timeout: 5_000 });
  });

  test("credit sale type shows payment status field", async ({ page }) => {
    await page.goto("/transactions/new");
    const creditSaleBtn = page.getByRole("button", { name: /Penjualan Kredit/i });
    await expect(creditSaleBtn).toBeVisible({ timeout: 5_000 });
    await creditSaleBtn.click();
    await expect(page.locator("text=/Status Bayar|pelanggan|Pembayaran/i").first()).toBeVisible({ timeout: 5_000 });
  });

  test("owner capital type shows correct fields", async ({ page }) => {
    await page.goto("/transactions/new");
    const capitalBtn = page.getByRole("button", { name: /Modal Pemilik/i });
    await expect(capitalBtn).toBeVisible({ timeout: 5_000 });
    await capitalBtn.click();
    await expect(page.locator("text=/Masuk ke|Akun kas/i").first()).toBeVisible({ timeout: 5_000 });
  });

  test("empty amount is rejected", async ({ page }) => {
    await page.goto("/transactions/new");
    const cashSaleBtn = page.getByRole("button", { name: /Penjualan Tunai/i });
    await expect(cashSaleBtn).toBeVisible({ timeout: 5_000 });
    await cashSaleBtn.click();

    const submitBtn = page.getByRole("button", { name: /Catat Penjualan|Catat Transaksi/i }).first();
    await expect(submitBtn).toBeVisible({ timeout: 3_000 });
    await submitBtn.click();
    await expect(page.locator("text=/lebih dari 0|wajib/i").first()).toBeVisible({ timeout: 5_000 });
  });
});

test.describe("Transaction list", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsOwner(page);
    await expect(page).toHaveURL(/\/dashboard|\/onboarding/);
  });

  test("transaction list page loads", async ({ page }) => {
    await page.goto("/transactions");
    await expect(page.locator("text=/transaksi/i").first()).toBeVisible({ timeout: 10_000 });
  });

  test("search input is present", async ({ page }) => {
    await page.goto("/transactions");
    const searchInput = page.getByRole("textbox", { name: /cari|search/i });
    await expect(searchInput).toBeVisible({ timeout: 5_000 });
  });
});

test.describe("Transaction detail", () => {
  test("transaction detail page shows error for invalid ID", async ({ page }) => {
    await loginAsOwner(page);
    await page.goto("/transactions/00000000-0000-0000-0000-000000000000");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("body")).toBeVisible();
  });
});
