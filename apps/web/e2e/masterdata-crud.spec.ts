import { test } from "./helpers/auth";
import { expect } from "@playwright/test";

/**
 * Masterdata CRUD: Accounts and Products
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
  await dlg.getByRole('button', { name: /simpan|tambah/i }).last().click();
  await dlg.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
}

// ═══════════════════════════════════════════════════════════════════
//  ACCOUNTS
// ═══════════════════════════════════════════════════════════════════

test.describe("Accounts CRUD", () => {
  test("Create a new kas account", async ({ authPage }) => {
    await authPage.goto("/accounts", { waitUntil: "load", timeout: 15000 });
    await authPage.waitForTimeout(2000);

    await expect(authPage.getByRole("button", { name: /tambah kas\/bank/i })).toBeVisible({ timeout: 5000 });
    await authPage.getByRole("button", { name: /tambah kas\/bank/i }).click();
    await authPage.waitForTimeout(1000);

    const dlg = authPage.getByRole('dialog', { name: /tambah kas\/bank/i });
    await expect(dlg).toBeVisible({ timeout: 5000 });

    await dlg.getByRole('button', { name: 'Kas' }).click();
    await authPage.waitForTimeout(300);

    await expect(authPage.locator('#account-name')).toBeVisible({ timeout: 3000 });
    await authPage.locator('#account-name').fill(`Kas Toko ${TEST_PREFIX}`);

    await clickDialogSubmit(authPage, /tambah kas\/bank/i);
    await authPage.waitForTimeout(3000);
    await expect(authPage.locator('text=Error handled by React Router')).toHaveCount(0);
  });

  test("Edit an existing account name", async ({ authPage }) => {
    await authPage.goto("/accounts", { waitUntil: "load", timeout: 15000 });
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
    await authPage.goto("/products", { waitUntil: "load", timeout: 15000 });
    await authPage.waitForTimeout(2000);

    const addBtn = authPage.getByRole("button", { name: /tambah produk/i }).first();
    await expect(addBtn).toBeVisible({ timeout: 5000 });
    await addBtn.click();
    await authPage.waitForTimeout(1000);

    const dlg = authPage.getByRole('dialog', { name: /tambah produk/i });
    await expect(dlg).toBeVisible({ timeout: 5000 });

    await authPage.locator('#kode-produk').fill(`PRD-${TEST_PREFIX}`);
    await authPage.locator('#nama-produk').fill(`Produk E2E ${TEST_PREFIX}`);
    await authPage.locator('#deskripsi').fill(`Deskripsi E2E ${TEST_PREFIX}`);
    await authPage.locator('#satuan').selectOption('pcs');
    await authPage.locator('#harga-beli').fill('50000');
    await authPage.locator('#harga-jual').fill('75000');

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
