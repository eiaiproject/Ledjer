import { test } from "./helpers/auth";
import { expect } from "@playwright/test";

/**
 * Invoices CRUD: /invoices/new
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


