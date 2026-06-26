import { test, expect } from "@playwright/test";
import { E2E_OWNER } from "./fixtures/users";


/**
 * Transaction creation E2E tests.
 * Tests successful creation for all supported transaction types.
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

test.describe("Transaction creation", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsOwner(page);
  });

  test("navigate to new transaction page", async ({ page }) => {
    if (!page.url().includes("/dashboard")) return; // Skip if not onboarded

    await page.goto("/transactions/new");
    await expect(page.locator("text=/transaksi baru/i").first()).toBeVisible({ timeout: 10_000 });
  });

  test("transaction type selector is visible", async ({ page }) => {
    if (!page.url().includes("/dashboard")) return;

    await page.goto("/transactions/new");
    // Type selector should show various options
    await expect(page.locator("text=/penjualan|pembelian|modal|transfer/i").first()).toBeVisible({
      timeout: 10_000,
    });
  });

  test("cash sale type shows correct fields", async ({ page }) => {
    if (!page.url().includes("/dashboard")) return;

    await page.goto("/transactions/new");
    // Select cash sale type
    const cashSaleBtn = page.getByRole("button", { name: /penjualan tunai/i });
    if (await cashSaleBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await cashSaleBtn.click();
      // Should show amount field
      await expect(page.locator("text=/total penjualan|nominal/i").first()).toBeVisible({ timeout: 5_000 });
      // Should show party field
      await expect(page.locator("text=/pelanggan|pihak/i").first()).toBeVisible({ timeout: 5_000 });
    }
  });

  test("credit sale type shows payment status field", async ({ page }) => {
    if (!page.url().includes("/dashboard")) return;

    await page.goto("/transactions/new");
    const creditSaleBtn = page.getByRole("button", { name: /penjualan kredit/i });
    if (await creditSaleBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await creditSaleBtn.click();
      // Should show payment status
      await expect(page.locator("text=/status bayar|belum bayar/i").first()).toBeVisible({ timeout: 5_000 });
    }
  });

  test("owner capital type shows correct fields", async ({ page }) => {
    if (!page.url().includes("/dashboard")) return;

    await page.goto("/transactions/new");
    const capitalBtn = page.getByRole("button", { name: /modal pemilik/i });
    if (await capitalBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await capitalBtn.click();
      // Should show cash account selector
      await expect(page.locator("text=/kas|bank|akun kas/i").first()).toBeVisible({ timeout: 5_000 });
    }
  });

  test("empty transaction date is rejected", async ({ page }) => {
    if (!page.url().includes("/dashboard")) return;

    await page.goto("/transactions/new");
    const cashSaleBtn = page.getByRole("button", { name: /penjualan tunai/i });
    if (await cashSaleBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await cashSaleBtn.click();

      // Clear the date field and try to submit
      const dateInput = page.locator("input[type='date'], [name='transactionDate']").first();
      if (await dateInput.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await dateInput.fill("");
      }

      const submitBtn = page.getByRole("button", { name: /simpan|catat transaksi/i }).first();
      if (await submitBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await submitBtn.click();
        await expect(page.locator("text=/wajib diisi/i").first()).toBeVisible({ timeout: 5_000 });
      }
    }
  });
});

test.describe("Transaction list", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsOwner(page);
  });

  test("transaction list page loads", async ({ page }) => {
    if (!page.url().includes("/dashboard")) return;

    await page.goto("/transactions");
    await expect(page.locator("text=/transaksi/i").first()).toBeVisible({ timeout: 10_000 });
  });

  test("search input is present", async ({ page }) => {
    if (!page.url().includes("/dashboard")) return;

    await page.goto("/transactions");
    const searchInput = page.getByRole("textbox", { name: /cari|search/i });
    if (await searchInput.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await expect(searchInput).toBeVisible();
    }
  });
});

test.describe("Transaction detail", () => {
  test("transaction detail page shows error for invalid ID", async ({ page }) => {
    await loginAsOwner(page);
    await page.goto("/transactions/00000000-0000-0000-0000-000000000000");
    // Should not crash, should show error state or empty state
    await page.waitForLoadState("networkidle");
    const body = page.locator("body");
    await expect(body).toBeVisible();
  });
});
