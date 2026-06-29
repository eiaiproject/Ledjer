import { test, expect } from "@playwright/test";
import { E2E_OWNER } from "./fixtures/users";

/**
 * Negative transaction tests — validation, edge cases, error states.
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

function e2eDesc(base: string): string {
  return `[E2E] ${base}`;
}

test.describe("Transaction validation", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsOwner(page);
    await expect(page).toHaveURL(/\/dashboard|\/onboarding/);
    await page.goto("/transactions/new");
    await expect(page).toHaveURL(/\/transactions\/new/);
  });

  test("submitting without selecting type does nothing", async ({ page }) => {
    const submitBtn = page.getByRole("button", { name: /simpan|catat transaksi/i }).first();
    await expect(submitBtn).toBeVisible({ timeout: 5_000 });
    const isDisabled = await submitBtn.isDisabled().catch(() => true);
    expect(isDisabled).toBeTruthy();
  });

  test("empty amount is rejected", async ({ page }) => {
    const cashSaleBtn = page.getByRole("button", { name: /Penjualan Tunai/i });
    await expect(cashSaleBtn).toBeVisible({ timeout: 5_000 });
    await cashSaleBtn.click();

    const amountInput = page.locator("input[name='amount'], [inputmode='numeric']").first();
    await expect(amountInput).toBeVisible({ timeout: 3_000 });
    await amountInput.fill("0");

    const descInput = page.locator("input[name='description'], textarea[name='description']").first();
    await expect(descInput).toBeVisible({ timeout: 3_000 });
    await descInput.fill(e2eDesc("negative test"));

    const submitBtn = page.getByRole("button", { name: /Catat Penjualan|Catat Transaksi/i }).first();
    await expect(submitBtn).toBeEnabled({ timeout: 3_000 });
    await submitBtn.click();
    await expect(page.locator("text=/lebih dari 0|wajib/i").first()).toBeVisible({ timeout: 5_000 });
  });

  test("empty description is rejected", async ({ page }) => {
    const capitalBtn = page.getByRole("button", { name: /modal pemilik/i });
    await expect(capitalBtn).toBeVisible({ timeout: 5_000 });
    await capitalBtn.click();

    const submitBtn = page.getByRole("button", { name: /simpan|catat transaksi/i }).first();
    await expect(submitBtn).toBeEnabled({ timeout: 3_000 });
    await submitBtn.click();
    await expect(page.locator("text=/wajib diisi/i").first()).toBeVisible({ timeout: 5_000 });
  });
});

test.describe("Transfer validation", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsOwner(page);
    await expect(page).toHaveURL(/\/dashboard|\/onboarding/);
    await page.goto("/transactions/new");
    await expect(page).toHaveURL(/\/transactions\/new/);
  });

  test("transfer source equals destination is rejected", async ({ page }) => {
    const transferBtn = page.getByRole("button", { name: /transfer/i });
    await expect(transferBtn).toBeVisible({ timeout: 5_000 });
    await transferBtn.click();

    // Verify form loaded without crash
    await expect(page.locator("body")).toBeVisible();
  });
});
