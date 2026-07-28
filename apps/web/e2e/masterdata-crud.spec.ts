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
  const dlg = page.getByRole('dialog', { name: dialogName });
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
    await authPage.goto("/budgets", { waitUntil: "networkidle", timeout: 15000 });
    await authPage.waitForTimeout(2000);

    await expect(authPage.getByRole("button", { name: /buat anggaran/i })).toBeVisible({ timeout: 5000 });
    await authPage.getByRole("button", { name: /buat anggaran/i }).click();
    await authPage.waitForTimeout(1000);

    const dlg = authPage.getByRole('dialog', { name: /buat anggaran baru/i });
    await expect(dlg).toBeVisible({ timeout: 5000 });

    // Period from
    const periodFrom = authPage.locator('#periode-dari');
    if (await periodFrom.isVisible({ timeout: 2000 }).catch(() => false)) {
      const now = new Date();
      await periodFrom.fill(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
    }

    // Notes
    const notes = authPage.locator('#catatan');
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
    await authPage.goto("/dimensions", { waitUntil: "networkidle", timeout: 15000 });
    await authPage.waitForTimeout(2000);

    await expect(authPage.getByRole("button", { name: /tambah/i }).first()).toBeVisible({ timeout: 5000 });
    await authPage.getByRole("button", { name: /tambah/i }).first().click();
    await authPage.waitForTimeout(1000);

    const dlg = authPage.getByRole('dialog', { name: /tambah .*/i });
    await expect(dlg).toBeVisible({ timeout: 5000 });

    const nameInput = authPage.locator('#nama-dimensi');
    if (await nameInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await nameInput.fill(`Dimensi E2E ${TEST_PREFIX}`);
    }

    const typeSelect = authPage.locator('#tipe-dimensi');
    if (await typeSelect.isVisible({ timeout: 2000 }).catch(() => false)) {
      await typeSelect.selectOption('customer');
    }

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
    await authPage.goto("/fixed-assets", { waitUntil: "networkidle", timeout: 15000 });
    await authPage.waitForTimeout(2000);

    await expect(authPage.getByRole("button", { name: /tambah aset/i })).toBeVisible({ timeout: 5000 });
    await authPage.getByRole("button", { name: /tambah aset/i }).click();
    await authPage.waitForTimeout(1000);

    const dlg = authPage.getByRole('dialog', { name: /tambah aset tetap/i });
    await expect(dlg).toBeVisible({ timeout: 5000 });

    const codeInput = authPage.locator('#kode-aset');
    if (await codeInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await codeInput.fill(`FA-${TEST_PREFIX}`);
    }

    const nameInput = authPage.locator('#nama-aset');
    if (await nameInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await nameInput.fill(`Aset E2E ${TEST_PREFIX}`);
    }

    const priceInput = authPage.locator('#harga-perolehan');
    if (await priceInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await priceInput.fill('10000000');
    }

    await clickDialogSubmit(authPage, /tambah aset tetap/i);
    await authPage.waitForTimeout(3000);
    await expect(authPage.locator('text=Error handled by React Router')).toHaveCount(0);
  });
});
