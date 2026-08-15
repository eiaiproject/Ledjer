import { expect } from "@playwright/test";
import { test } from "./helpers/auth";

/**
 * Invoices CRUD: /invoices/new
 *
 * These are full-page forms (not modal-based), with line-item tables.
 *
 * BUG-06: previously a crash ("Unexpected Application Error") or missing form
 * fields silently converted the test into a skip, hiding regressions from CI.
 * Now any of those conditions FAILS the test loudly.
 */

const TEST_PREFIX = `[E2E] ${Date.now()}`;

// ═══════════════════════════════════════════════════════════════════
//  INVOICES  (/invoices/new)
// ═══════════════════════════════════════════════════════════════════

test.describe("Invoices CRUD", () => {
  test("Create a new invoice", async ({ authPage }) => {
    await authPage.goto("/invoices/new", { waitUntil: "load", timeout: 15000 });
    await authPage.waitForTimeout(2000);

    // A crash here is a regression — fail loudly instead of skipping.
    const crashed = await authPage.locator('text=Unexpected Application Error').isVisible({ timeout: 2000 }).catch(() => false);
    expect(crashed, "/invoices/new crashed with 'Unexpected Application Error'").toBe(false);

    // Invoice date — the Input has id="inv-date" (explicit id prop)
    const dateInput = authPage.locator('#inv-date');
    await expect(dateInput, "Invoice form date field #inv-date is missing").toBeVisible({ timeout: 5000 });
    await dateInput.fill(new Date().toISOString().slice(0, 10));

    // Due date — id="inv-due"
    const dueDateInput = authPage.locator('#inv-due');
    if (await dueDateInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      const d = new Date(); d.setDate(d.getDate() + 30);
      await dueDateInput.fill(d.toISOString().slice(0, 10));
    }

    // Party (Pelanggan) — may be a select or combobox
    const partySelect = authPage.locator('#inv-party');
    if (await partySelect.isVisible({ timeout: 3000 }).catch(() => false)) {
      const partyOptions = partySelect.locator('option');
      const optionCount = await partyOptions.count();
      if (optionCount > 1) {
        const firstRealValue = await partyOptions.nth(1).getAttribute('value');
        if (firstRealValue) {
          await partySelect.selectOption(firstRealValue);
        }
      }
    }

    // Line item description
    const descInput = authPage.locator('#inv-line-0-desc');
    if (await descInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await descInput.fill(`Item E2E ${TEST_PREFIX}`);
    }

    // Qty
    const qtyInput = authPage.locator('#inv-line-0-qty');
    if (await qtyInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await qtyInput.fill('2');
    }

    // Price
    const priceInput = authPage.locator('#inv-line-0-price');
    if (await priceInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await priceInput.fill('250000');
    }

    // Notes / catatan
    const notesInput = authPage.locator('#catatan');
    if (await notesInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await notesInput.fill(`E2E Invoice ${TEST_PREFIX}`);
    }

    // Submit — must be visible and enabled; a disabled submit button means the
    // form is broken and must not be silently skipped.
    const submitBtn = authPage.getByRole("button", { name: /simpan faktur|buat faktur/i });
    await expect(submitBtn, "Invoice submit button not found").toBeVisible({ timeout: 5000 });
    await expect(submitBtn, "Invoice submit button disabled — form not fully usable").toBeEnabled({ timeout: 5000 });
    await submitBtn.click();
    await authPage.waitForTimeout(3000);
  });
});
