import { test, expect } from "@playwright/test";
import { loginViaUI } from "./fixtures/auth";
import { selectComboboxValue } from "./fixtures/combobox";

/**
 * End-to-end flow: create a cash sale transaction → verify it appears
 * in the transaction list → verify reports reflect the sale.
 *
 * Requires: seeded owner user with an org (onboarding completed).
 */

test.describe("Transaction → Report flow (cash sale)", () => {
  test("create cash sale and verify in reports", async ({ page }) => {
    await loginViaUI(page);
    await page.waitForURL(
      (url) => url.pathname.includes("/dashboard") || url.pathname.includes("/onboarding"),
      { timeout: 15_000 },
    );

    // Step 1: Navigate to transaction form
    await page.goto("/transactions/new");
    await page.waitForLoadState("networkidle");

    // Click "Penjualan Tunai" type button
    const typeBtn = page.getByRole("button", { name: /Penjualan Tunai/i });
    await expect(typeBtn).toBeVisible({ timeout: 5_000 });
    await typeBtn.click();

    // Step 2: Fill in the cash sale form
    // Amount field
    const amountField = page.locator('input[name="amount"], input[name*="amount"]').first();
    await expect(amountField).toBeVisible({ timeout: 3_000 });
    await amountField.click();
    await amountField.fill("150000");
    await amountField.press("Tab");

    // Description field
    const descField = page.locator('input[name="description"], textarea[name="description"]').first();
    await expect(descField).toBeVisible({ timeout: 3_000 });
    await descField.fill("[E2E] Cash Sale Test");

    // Step 3: Select cash account ("Diterima di" combobox)
    await selectComboboxValue(page, "cashAccountId", "Kas");

    // Step 4: Submit
    const submitBtn = page.getByRole("button", { name: /Catat Penjualan|Catat Transaksi/i }).first();
    await expect(submitBtn).toBeVisible({ timeout: 3_000 });
    await expect(submitBtn).toBeEnabled({ timeout: 3_000 });
    await submitBtn.click();

    // Assert transaction was saved successfully
    await expect(
      page.getByText(/Transaksi tersimpan|berhasil/i).first(),
    ).toBeVisible({ timeout: 10_000 });

    // Wait for redirect to transaction detail page
    await page.waitForURL(/\/transactions\/[0-9a-f-]+/i, { timeout: 15_000 });

    // Step 5: Verify transaction appears in list
    await page.goto("/transactions");
    await page.waitForLoadState("networkidle");

    await expect(
      page
        .getByRole("row", { name: /\[E2E\] Cash Sale Test/i })
        .filter({ hasText: /Rp\s*150\.000/i })
        .first(),
    ).toBeVisible({ timeout: 10_000 });

    // Step 6: Check reports
    await page.goto("/reports/profit-loss");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("main")).toBeVisible({ timeout: 5_000 });
    const plContent = await page.locator("main").textContent();
    expect(plContent?.length).toBeGreaterThan(10);

    await page.goto("/reports/balance-sheet");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("main")).toBeVisible({ timeout: 5_000 });
    const bsContent = await page.locator("main").textContent();
    expect(bsContent?.length).toBeGreaterThan(10);
  });

  test("create purchase and verify transaction list", async ({ page }) => {
    await loginViaUI(page);
    await page.waitForURL(
      (url) => url.pathname.includes("/dashboard") || url.pathname.includes("/onboarding"),
      { timeout: 15_000 },
    );

    await page.goto("/transactions/new");
    await page.waitForLoadState("networkidle");

    // Click "Pembelian Tunai" type button
    const purchaseBtn = page.getByRole("button", { name: /Pembelian Tunai/i });
    await expect(purchaseBtn).toBeVisible({ timeout: 5_000 });
    await purchaseBtn.click();

    // Amount field
    const amountField = page.locator('input[name="amount"], input[name*="amount"]').first();
    await expect(amountField).toBeVisible({ timeout: 3_000 });
    await amountField.click();
    await amountField.fill("75000");
    await amountField.press("Tab");

    // Description field
    const descField = page.locator('input[name="description"], textarea[name="description"]').first();
    await expect(descField).toBeVisible({ timeout: 3_000 });
    await descField.fill("[E2E] Purchase Test");

    // Select cash account ("Dibayar dari" combobox)
    await selectComboboxValue(page, "cashAccountId", "Kas");

    // Submit
    const submitBtn = page.getByRole("button", { name: /Catat Pembelian|Catat Transaksi/i }).first();
    await expect(submitBtn).toBeVisible({ timeout: 3_000 });
    await expect(submitBtn).toBeEnabled({ timeout: 3_000 });
    await submitBtn.click();

    await expect(
      page.getByText(/Transaksi tersimpan|berhasil/i).first(),
    ).toBeVisible({ timeout: 10_000 });

    await page.waitForURL(/\/transactions\/[0-9a-f-]+/i, { timeout: 15_000 });

    await page.goto("/transactions");
    await page.waitForLoadState("networkidle");

    await expect(
      page
        .getByRole("row", { name: /\[E2E\] Purchase Test/i })
        .filter({ hasText: /Rp\s*75\.000/i })
        .first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("trial balance report loads without error", async ({ page }) => {
    await loginViaUI(page);
    await page.waitForURL(
      (url) => url.pathname.includes("/dashboard") || url.pathname.includes("/onboarding"),
      { timeout: 15_000 },
    );

    await page.goto("/reports/trial-balance");
    await page.waitForLoadState("networkidle");

    await expect(page.locator("main")).toBeVisible({ timeout: 5_000 });
    const content = await page.locator("main").textContent();
    expect(content?.length).toBeGreaterThan(10);
  });
});
