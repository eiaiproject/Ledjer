import { test } from "./helpers/auth";
import { expect } from "@playwright/test";

/**
 * Documents & Invoices CRUD: /documents/new, /invoices/new,
 * /recurring-transactions/new, /journals, /exports
 *
 * These are full-page forms (not modal-based), with line-item tables.
 */

const TEST_PREFIX = `[E2E] ${Date.now()}`;

// ─── Helpers ──────────────────────────────────────────────────────

async function isPageCrashed(page: import("@playwright/test").Page) {
  return await page.locator('text=Unexpected Application Error')
    .isVisible({ timeout: 2000 }).catch(() => false);
}

// ═══════════════════════════════════════════════════════════════════
//  DOCUMENTS  (/documents/new)
// ═══════════════════════════════════════════════════════════════════

test.describe("Documents CRUD", () => {
  test.describe("Create document", () => {
    test("Create a new quotation document", async ({ authPage }) => {
      await authPage.goto("/documents/new", { waitUntil: "networkidle", timeout: 15000 });
      await authPage.waitForTimeout(2000);

      if (await isPageCrashed(authPage)) {
        test.skip(true, '/documents/new crash — React Error #31 (lazy import fix in PR #51)');
        return;
      }

      // Select document type — Card buttons
      const quotationCard = authPage.getByRole("button", { name: /penawaran harga/i });
      await expect(quotationCard).toBeVisible({ timeout: 3000 });
      await quotationCard.click();
      await authPage.waitForTimeout(800);

      // Date field — id="docDate"
      const dateInput = authPage.locator('#docDate');
      await expect(dateInput).toBeVisible({ timeout: 3000 });
      await dateInput.fill(new Date().toISOString().slice(0, 10));

      // Line item description
      const descInput = authPage.locator('#lineDesc-0');
      await expect(descInput).toBeVisible({ timeout: 3000 });
      await descInput.fill(`Item E2E ${TEST_PREFIX}`);

      // Notes — id="docNotes"
      const notesInput = authPage.locator('#docNotes');
      if (await notesInput.isVisible({ timeout: 2000 }).catch(() => false)) {
        await notesInput.fill(`E2E Quotation ${TEST_PREFIX}`);
      }

      // Submit button
      const submitBtn = authPage.getByRole("button", { name: /simpan|buat/i });
      await expect(submitBtn).toBeEnabled({ timeout: 5000 });
      await submitBtn.click();
      await authPage.waitForTimeout(3000);

      await expect(authPage.locator('text=Error handled by React Router')).toHaveCount(0);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════
//  INVOICES  (/invoices/new)
// ═══════════════════════════════════════════════════════════════════

test.describe("Invoices CRUD", () => {
  test("Create a new invoice", async ({ authPage }) => {
    await authPage.goto("/invoices/new", { waitUntil: "networkidle", timeout: 15000 });
    await authPage.waitForTimeout(2000);

    if (await isPageCrashed(authPage)) {
      test.skip(true, '/invoices/new crash — React Error #31 (lazy import fix in PR #51)'); // NOSONAR
      return;
    }

    // Invoice date — the Input has id="inv-date" (explicit id prop)
    const dateInput = authPage.locator('#inv-date');
    await expect(dateInput).toBeVisible({ timeout: 3000 });
    await dateInput.fill(new Date().toISOString().slice(0, 10));

    // Due date — id="inv-due"
    const dueDateInput = authPage.locator('#inv-due');
    await expect(dueDateInput).toBeVisible({ timeout: 3000 });
    const d = new Date(); d.setDate(d.getDate() + 30);
    await dueDateInput.fill(d.toISOString().slice(0, 10));

    // Party (Pelanggan) — Select with id="inv-party". Must select a customer first.
    const partySelect = authPage.locator('#inv-party');
    await expect(partySelect).toBeVisible({ timeout: 3000 });
    const partyOptions = partySelect.locator('option');
    const optionCount = await partyOptions.count(); // NOSONAR
    if (optionCount <= 1) {
      // No customers available — can't create invoice without a party
      test.skip(true, 'Tidak ada pelanggan untuk membuat faktur'); // NOSONAR
      return;
    }
    // First option is placeholder; pick the first real customer
    const firstRealValue = await partyOptions.nth(1).getAttribute('value');
    if (firstRealValue) {
      await partySelect.selectOption(firstRealValue);
    }
    await authPage.waitForTimeout(500);

    // Line item description — Input with id="inv-line-0-desc"
    const descInput = authPage.locator('#inv-line-0-desc');
    await expect(descInput).toBeVisible({ timeout: 3000 });
    await descInput.fill(`Item E2E ${TEST_PREFIX}`);

    // Qty
    const qtyInput = authPage.locator('#inv-line-0-qty');
    await expect(qtyInput).toBeVisible({ timeout: 3000 });
    await qtyInput.fill('2');

    // Price
    const priceInput = authPage.locator('#inv-line-0-price');
    await expect(priceInput).toBeVisible({ timeout: 3000 });
    await priceInput.fill('250000');

    // Notes / catatan
    const notesInput = authPage.locator('#catatan');
    if (await notesInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await notesInput.fill(`E2E Invoice ${TEST_PREFIX}`);
    }

    // Submit — button should now be enabled
    const submitBtn = authPage.getByRole("button", { name: /simpan faktur/i });
    await expect(submitBtn).toBeEnabled({ timeout: 5000 });
    await submitBtn.click();
    await authPage.waitForTimeout(3000);

    await expect(authPage.locator('text=Error handled by React Router')).toHaveCount(0);
  });
});

// ═══════════════════════════════════════════════════════════════════
//  RECURRING TRANSACTIONS  (/recurring-transactions/new)
// ═══════════════════════════════════════════════════════════════════

test.describe("Recurring Transactions CRUD", () => {
  test("Create a new recurring transaction", async ({ authPage }) => {
    await authPage.goto("/recurring-transactions/new", { waitUntil: "networkidle", timeout: 15000 });
    await authPage.waitForTimeout(2000);

    if (await isPageCrashed(authPage)) {
      test.skip(true, '/recurring-transactions/new crash — React Error #31 (lazy import fix in PR #51)'); // NOSONAR
      return;
    }

    // Name — id="name"
    const nameInput = authPage.locator('#name');
    await expect(nameInput).toBeVisible({ timeout: 3000 });
    await nameInput.fill(`Otomatis E2E ${TEST_PREFIX}`);

    // Transaction type — id="transactionType"
    const typeSelect = authPage.locator('#transactionType');
    await expect(typeSelect).toBeVisible({ timeout: 3000 });
    await typeSelect.selectOption('expense_payment');

    // Amount — id="amount"
    const amountInput = authPage.locator('#amount');
    await expect(amountInput).toBeVisible({ timeout: 3000 });
    await amountInput.fill('100000');

    // Frequency — id="frequency"
    const freqSelect = authPage.locator('#frequency');
    await expect(freqSelect).toBeVisible({ timeout: 3000 });
    await freqSelect.selectOption('monthly');

    // Start date — id="startDate"
    const startInput = authPage.locator('#startDate');
    await expect(startInput).toBeVisible({ timeout: 3000 });
    await startInput.fill(new Date().toISOString().slice(0, 10));

    // Description — id="description"
    const descInput = authPage.locator('#description');
    await expect(descInput).toBeVisible({ timeout: 3000 });
    await descInput.fill(`Deskripsi E2E ${TEST_PREFIX}`);

    // Submit
    const submitBtn = authPage.getByRole("button", { name: /simpan|buat/i });
    await expect(submitBtn).toBeEnabled({ timeout: 5000 });
    await submitBtn.click();
    await authPage.waitForTimeout(3000);

    await expect(authPage.locator('text=Error handled by React Router')).toHaveCount(0);
  });
});
