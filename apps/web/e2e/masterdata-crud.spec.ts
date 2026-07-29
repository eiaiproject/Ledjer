import { test } from "./helpers/auth";
import { expect } from "@playwright/test";

/**
 * Masterdata CRUD: Accounts, Products, Budgets, Dimensions, Fixed Assets
 *
 */

const TEST_PREFIX = `[E2E] ${Date.now()}`;

// ─── Helpers ──────────────────────────────────────────────────────

/** Click the submit button inside a dialog (button with text Simpan/Tambah) */
async function clickDialogSubmit(page: import("@playwright/test").Page, dialogName: RegExp) {
  // First try to find dialog by ARIA name; fall back to text content
  const dlg = page.getByRole('dialog', { name: dialogName }).or(
    page.locator('dialog[open]').filter({ hasText: dialogName })
  );
  // The footer buttons are div children, not <footer> — use role button last()
  await dlg.getByRole('button', { name: /simpan|tambah/i }).last().click();
  // Wait for dialog to close (form submission processed)
  await dlg.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
}

// ═══════════════════════════════════════════════════════════════════
//  ACCOUNTS
// ═══════════════════════════════════════════════════════════════════

test.describe("Accounts CRUD", () => {
  test("Create a new kas account", async ({ authPage }) => {
    await authPage.goto("/accounts", { waitUntil: "networkidle", timeout: 15000 });
    await authPage.waitForTimeout(2000);

    await expect(authPage.getByRole("button", { name: /tambah kas\/bank/i })).toBeVisible({ timeout: 5000 });
    await authPage.getByRole("button", { name: /tambah kas\/bank/i }).click();
    await authPage.waitForTimeout(1000);

    const dlg = authPage.getByRole('dialog', { name: /tambah kas\/bank/i });
    await expect(dlg).toBeVisible({ timeout: 5000 });

    // Select "Kas" kind button
    await dlg.getByRole('button', { name: 'Kas' }).click();
    await authPage.waitForTimeout(300);

    // Fill account name
    await expect(authPage.locator('#account-name')).toBeVisible({ timeout: 3000 });
    await authPage.locator('#account-name').fill(`Kas Toko ${TEST_PREFIX}`);

    // Click Simpan
    await clickDialogSubmit(authPage, /tambah kas\/bank/i);

    await authPage.waitForTimeout(3000);
    await expect(authPage.locator('text=Error handled by React Router')).toHaveCount(0);
  });

  test("Edit an existing account name", async ({ authPage }) => {
    await authPage.goto("/accounts", { waitUntil: "networkidle", timeout: 15000 });
    await authPage.waitForTimeout(3000);

    const editBtn = authPage.getByRole("button", { name: /edit nama akun/i }).first();
    await expect(editBtn).toBeVisible({ timeout: 5000 });
    await editBtn.click();
    await authPage.waitForTimeout(1000);

    const dlg = authPage.getByRole('dialog', { name: /edit nama akun/i });
    await expect(dlg).toBeVisible({ timeout: 5000 });

    const editInput = authPage.locator('#edit-name');
    await expect(editInput).toBeVisible({ timeout: 3000 });
    const currentName = await editInput.inputValue();
    await editInput.fill(`${currentName} [E2E ${TEST_PREFIX}]`);

    await clickDialogSubmit(authPage, /edit nama akun/i);

    await authPage.waitForTimeout(2000);
    await expect(authPage.locator('text=Error handled by React Router')).toHaveCount(0);
  });
});

// ═══════════════════════════════════════════════════════════════════
//  PRODUCTS
// ═══════════════════════════════════════════════════════════════════

test.describe("Products CRUD", () => {
  test("Create a new product", async ({ authPage }) => {
    await authPage.goto("/products", { waitUntil: "networkidle", timeout: 15000 });
    await authPage.waitForTimeout(2000);

    // There may be 2 buttons: "Tambah Produk" (header) and "Tambah Produk Pertama" (empty state).
    // Use .first() to click either one.
    const addBtn = authPage.getByRole("button", { name: /tambah produk/i }).first();
    await expect(addBtn).toBeVisible({ timeout: 5000 });
    await addBtn.click();
    await authPage.waitForTimeout(1000);

    const dlg = authPage.getByRole('dialog', { name: /tambah produk/i });
    await expect(dlg).toBeVisible({ timeout: 5000 });

    // Fill form fields
    await authPage.locator('#kode-produk').fill(`PRD-${TEST_PREFIX}`);
    await authPage.locator('#nama-produk').fill(`Produk E2E ${TEST_PREFIX}`);
    await authPage.locator('#deskripsi').fill(`Deskripsi E2E ${TEST_PREFIX}`);
    await authPage.locator('#satuan').selectOption('pcs');
    await authPage.locator('#harga-beli').fill('50000');
    await authPage.locator('#harga-jual').fill('75000');

    // Initial stock (may not be visible depending on onboarding state)
    const stockInput = authPage.locator('#stok-awal');
    if (await stockInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await stockInput.fill('100');
    }

    await authPage.locator('#stok-minimum').fill('10');

    await clickDialogSubmit(authPage, /tambah produk/i);

    await authPage.waitForTimeout(3000);
    await expect(authPage.locator('text=Error handled by React Router')).toHaveCount(0);
  });
});

// ═══════════════════════════════════════════════════════════════════
//  BUDGETS  (broken on production — React Error #31 not yet deployed)
// ═══════════════════════════════════════════════════════════════════

test.describe("Budgets CRUD", () => {
  test("Create a new budget", async ({ authPage }) => {
    // Navigate to dashboard first to initialize org context
    await authPage.goto("/dashboard", { waitUntil: "networkidle", timeout: 15000 });
    await authPage.waitForTimeout(2000);

    await authPage.goto("/budgets", { waitUntil: "networkidle", timeout: 15000 });
    await authPage.waitForTimeout(5000);

    // Try both EmptyState action button and PageShell header button
    const budgetBtn = authPage.getByRole("button", { name: /buat anggaran/i })
      .or(authPage.getByRole("button", { name: /anggaran baru/i }));
    await expect(budgetBtn.first()).toBeVisible({ timeout: 5000 });
    await budgetBtn.first().click();
    await authPage.waitForTimeout(1000);

    // Dialog accessible from text content (Modal used without title prop)
    const dlg = authPage.locator('dialog[open]').filter({ hasText: /buat anggaran baru/i });
    await expect(dlg).toBeVisible({ timeout: 5000 });

    // Select an account (required — submit disabled without accountId)
    const accountSelect = dlg.locator('#budgetAccount');
    await expect(accountSelect).toBeVisible({ timeout: 3000 });
    const firstOption = accountSelect.locator('option:not([value=""])').first();
    const accountValue = await firstOption.getAttribute('value');
    if (accountValue) {
      await accountSelect.selectOption(accountValue);
    }

    // Fill amount (required for meaningful budget)
    await dlg.locator('#budgetAmount').fill('1000000');

    // Notes (optional)
    const notes = dlg.locator('#budgetNotes');
    if (await notes.isVisible({ timeout: 2000 }).catch(() => false)) {
      await notes.fill(`E2E Budget ${TEST_PREFIX}`);
    }

    await clickDialogSubmit(authPage, /buat anggaran baru/i);
    await authPage.waitForTimeout(3000);
    await expect(authPage.locator('text=Error handled by React Router')).toHaveCount(0);
  });
});

// ═══════════════════════════════════════════════════════════════════
//  DIMENSIONS  (broken on production — React Error #31 not yet deployed)
// ═══════════════════════════════════════════════════════════════════

test.describe("Dimensions CRUD", () => {
  test("Create a new dimension", async ({ authPage }) => {
    // Navigate to dashboard first to initialize org context
    await authPage.goto("/dashboard", { waitUntil: "networkidle", timeout: 15000 });
    await authPage.waitForTimeout(2000);

    await authPage.goto("/dimensions", { waitUntil: "networkidle", timeout: 15000 });
    await authPage.waitForTimeout(5000);

    await expect(authPage.getByRole("button", { name: /tambah/i }).first()).toBeVisible({ timeout: 5000 });
    await authPage.getByRole("button", { name: /tambah/i }).first().click();
    await authPage.waitForTimeout(1000);

    // Dialog accessible from text content (Modal used without title prop)
    const dlg = authPage.locator('dialog[open]').filter({ hasText: /tambah/i });
    await expect(dlg).toBeVisible({ timeout: 5000 });

    // Fill code (required — submit disabled without code && name)
    await dlg.locator('#dimCode').fill(`BR-${TEST_PREFIX}`);

    // Fill name (required)
    await dlg.locator('#dimName').fill(`Cabang E2E ${TEST_PREFIX}`);

    await clickDialogSubmit(authPage, /tambah .*/i);
    await authPage.waitForTimeout(3000);
    await expect(authPage.locator('text=Error handled by React Router')).toHaveCount(0);
  });
});

// ═══════════════════════════════════════════════════════════════════
//  FIXED ASSETS  (broken on production — React Error #31 not yet deployed)
// ═══════════════════════════════════════════════════════════════════

test.describe("Fixed Assets CRUD", () => {
  test("Create a new fixed asset", async ({ authPage }) => {
    // Navigate to dashboard first to initialize org context
    await authPage.goto("/dashboard", { waitUntil: "networkidle", timeout: 15000 });
    await authPage.waitForTimeout(2000);

    await authPage.goto("/fixed-assets", { waitUntil: "networkidle", timeout: 15000 });
    await authPage.waitForTimeout(5000);

    // Try both EmptyState action button and PageShell header button
    const assetBtn = authPage.getByRole("button", { name: /tambah aset/i })
      .or(authPage.getByRole("button", { name: /aset baru/i }));
    await expect(assetBtn.first()).toBeVisible({ timeout: 5000 });
    await assetBtn.first().click();
    await authPage.waitForTimeout(1000);

    // Dialog accessible from text content (Modal used without title prop)
    const dlg = authPage.locator('dialog[open]').filter({ hasText: /tambah aset tetap/i });
    await expect(dlg).toBeVisible({ timeout: 5000 });

    // Fill asset code (required)
    await dlg.locator('#assetCode').fill(`FA-${TEST_PREFIX}`);

    // Fill asset name (required)
    await dlg.locator('#assetName').fill(`Aset E2E ${TEST_PREFIX}`);

    // Select account asset (required)
    const assetSelect = dlg.locator('#accountAssetId');
    await expect(assetSelect).toBeVisible({ timeout: 3000 });
    const firstAssetOpt = assetSelect.locator('option:not([value=""])').first();
    const assetVal = await firstAssetOpt.getAttribute('value');
    if (assetVal) await assetSelect.selectOption(assetVal);

    // Select depreciation account (required)
    const deprSelect = dlg.locator('#accountDepreciationId');
    const firstDeprOpt = deprSelect.locator('option:not([value=""])').first();
    const deprVal = await firstDeprOpt.getAttribute('value');
    if (deprVal) await deprSelect.selectOption(deprVal);

    // Select expense account (required)
    const expenseSelect = dlg.locator('#accountExpenseId');
    const firstExpenseOpt = expenseSelect.locator('option:not([value=""])').first();
    const expenseVal = await firstExpenseOpt.getAttribute('value');
    if (expenseVal) await expenseSelect.selectOption(expenseVal);

    // Fill acquisition cost
    await dlg.locator('#acquisitionCostMinor').fill('10000000');

    await clickDialogSubmit(authPage, /tambah aset tetap/i);
    await authPage.waitForTimeout(3000);
    await expect(authPage.locator('text=Error handled by React Router')).toHaveCount(0);
  });
});
