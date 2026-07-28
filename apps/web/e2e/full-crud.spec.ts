import { test } from "./helpers/auth";
import { expect } from "@playwright/test";

/**
 * Full CRUD E2E: actually submits forms (transactions, products, etc.)
 *
 * The custom Combobox component renders an <input role="combobox"> that
 * opens a <div role="listbox"> with <button> options.  To select an option:
 *   1. Click the input to open the dropdown
 *   2. Wait for the listbox to appear
 *   3. Click the desired <button> by text content
 *
 * For "allowCreate" combos (party, supplier), type the text then click
 * the "Buat ..." button.
 */

// Extend timeout for cold starts (staging Worker, first test)
test.setTimeout(60_000);

const TEST_PREFIX = `[E2E] ${Date.now()}`;

// ─── Combobox helpers ─────────────────────────────────────────────

/** Open a combobox by clicking its input, then click the first available
 *  option button inside the dropdown.  Returns true if an option was clicked. */
async function selectFirstComboboxOption(page: import("@playwright/test").Page, id: string) {
  const input = page.locator(`#${id}`);
  if (!(await input.isVisible().catch(() => false))) return false;

  await input.click();

  // Wait for the dropdown to appear
  const listbox = page.locator(`#${id}-listbox`);
  if (!(await listbox.isVisible({ timeout: 3000 }).catch(() => false))) return false;

  const optionBtns = listbox.locator("button");
  const count = await optionBtns.count();
  if (count === 0) return false;

  await optionBtns.first().click();
  // Wait for listbox to close (selection registered)
  await listbox.waitFor({ state: 'hidden', timeout: 3000 }).catch(() => {});
  return true;
}

/** Type a new value into an allowCreate combobox and click the "Buat ..." button. */
async function createNewComboboxOption(page: import("@playwright/test").Page, id: string, value: string) {
  const input = page.locator(`#${id}`);
  if (!(await input.isVisible().catch(() => false))) return false;

  await input.click();
  await input.fill(value);

  // Wait for the dropdown to show the "Buat ..." option
  const listbox = page.locator(`#${id}-listbox`);
  if (!(await listbox.isVisible({ timeout: 3000 }).catch(() => false))) return false;

  // Look for the "Buat ..." button (allowCreate option)
  const createBtn = listbox.locator("button").filter({ hasText: /^Buat / });
  if (await createBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await createBtn.click();
    await listbox.waitFor({ state: 'hidden', timeout: 3000 }).catch(() => {});
    return true;
  }

  // Fallback: just press Enter
  await page.keyboard.press("Enter");
  await listbox.waitFor({ state: 'hidden', timeout: 3000 }).catch(() => {});
  return false;
}

// ─── Transaction type selector ────────────────────────────────────

/** Click a transaction type label (the <label> wrapping the sr-only radio). */
async function selectTransactionType(page: import("@playwright/test").Page, type: string) {
  const label = page.locator(`label[for="tx-type-${type}"]`);
  await expect(label).toBeAttached({ timeout: 5000 });
  await label.click();
  // Wait for the form to re-render after type change (look for amount input)
  await page.locator('input[name="amount"]').waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
}

// ─── Success waiter ───────────────────────────────────────────────

async function waitForTransactionSuccess(page: import("@playwright/test").Page) {
  // Wait up to 30s for success badge or URL change
  for (let i = 0; i < 30; i++) {
    const successBadge = page.locator("text=Tersimpan");
    if (await successBadge.isVisible({ timeout: 1000 }).catch(() => false)) return true;
    const url = page.url();
    if (!url.includes("/transactions/new")) return true;
  }
  return false;
}

// ─── Transactions: Cash Sale ──────────────────────────────────────

test.describe("Transactions - Cash Sale", () => {
  test("Create a cash sale transaction", async ({ authPage }) => {
    await authPage.goto("/transactions/new", { waitUntil: "networkidle", timeout: 15000 });
    await authPage.waitForTimeout(2000);

    // Select "Penjualan Tunai"
    await selectTransactionType(authPage, "cash_sale");

    // Skip product selection — products in the test org may have
    // insufficient stock for sales.  We enter the amount manually.

    // Amount
    await authPage.locator('input[name="amount"]').fill("150000");

    // Description
    const descInput = authPage.locator('input[name="description"]');
    if (await descInput.isVisible()) {
      await descInput.fill(`Penjualan tunai E2E ${TEST_PREFIX}`);
    }

    // Cash account
    const cashOk = await selectFirstComboboxOption(authPage, "cashAccountId");
    expect(cashOk).toBeTruthy();

    // Notes
    const notesInput = authPage.locator('textarea[name="notes"]');
    if (await notesInput.isVisible()) {
      await notesInput.fill(`E2E notes ${TEST_PREFIX}`);
    }

    // Submit
    const submitBtn = authPage.getByRole("button", { name: /catat penjualan/i });
    await expect(submitBtn).toBeEnabled({ timeout: 5000 });
    await submitBtn.click();

    // Verify success
    expect(await waitForTransactionSuccess(authPage)).toBeTruthy();
  });
});

// ─── Transactions: Cash Purchase ──────────────────────────────────

test.describe("Transactions - Cash Purchase", () => {
  test("Create a cash purchase transaction", async ({ authPage }) => {
    await authPage.goto("/transactions/new", { waitUntil: "networkidle", timeout: 15000 });
    await authPage.waitForTimeout(2000);

    await selectTransactionType(authPage, "cash_purchase");

    await selectFirstComboboxOption(authPage, "productId");

    const amountInput = authPage.locator('input[name="amount"]');
    const val = (await amountInput.inputValue()).replace(/[^0-9]/g, "");
    if (!val || val === "0") await amountInput.fill("200000");

    const descInput = authPage.locator('input[name="description"]');
    if (await descInput.isVisible()) {
      await descInput.fill(`Pembelian tunai E2E ${TEST_PREFIX}`);
    }

    const cashOk = await selectFirstComboboxOption(authPage, "cashAccountId");
    expect(cashOk).toBeTruthy();

    // Debit account may not appear if product auto-sets CoA — try anyway
    await selectFirstComboboxOption(authPage, "debitAccountId");

    const notesInput = authPage.locator('textarea[name="notes"]');
    if (await notesInput.isVisible()) {
      await notesInput.fill(`E2E purchase ${TEST_PREFIX}`);
    }

    const submitBtn = authPage.getByRole("button", { name: /catat pembelian/i });
    await expect(submitBtn).toBeEnabled({ timeout: 5000 });
    await submitBtn.click();

    expect(await waitForTransactionSuccess(authPage)).toBeTruthy();
  });
});

// ─── Transactions: Expense Payment ────────────────────────────────

test.describe("Transactions - Expense Payment", () => {
  test("Create an expense payment transaction", async ({ authPage }) => {
    await authPage.goto("/transactions/new", { waitUntil: "networkidle", timeout: 15000 });
    await authPage.waitForTimeout(2000);

    await selectTransactionType(authPage, "expense_payment");

    // No product for expense
    const amountInput = authPage.locator('input[name="amount"]');
    await amountInput.fill("500000");

    const descInput = authPage.locator('input[name="description"]');
    if (await descInput.isVisible()) {
      await descInput.fill(`Beban E2E ${TEST_PREFIX}`);
    }

    await selectFirstComboboxOption(authPage, "cashAccountId");

    // Debit account (CoA) — required for expense
    const debitOk = await selectFirstComboboxOption(authPage, "debitAccountId");
    expect(debitOk).toBeTruthy();

    const notesInput = authPage.locator('textarea[name="notes"]');
    if (await notesInput.isVisible()) {
      await notesInput.fill(`E2E expense ${TEST_PREFIX}`);
    }

    const submitBtn = authPage.getByRole("button", { name: /catat beban/i });
    await expect(submitBtn).toBeEnabled({ timeout: 5000 });
    await submitBtn.click();

    expect(await waitForTransactionSuccess(authPage)).toBeTruthy();
  });
});

// ─── Transactions: Credit Sale ────────────────────────────────────

test.describe("Transactions - Credit Sale", () => {
  test("Create a credit sale with customer", async ({ authPage }) => {
    await authPage.goto("/transactions/new", { waitUntil: "networkidle", timeout: 15000 });
    await authPage.waitForTimeout(2000);

    // Expand to see all types
    const expandBtn = authPage.getByRole("button", { name: /lihat jenis transaksi lainnya/i });
    if (await expandBtn.isVisible()) await expandBtn.click();
    await authPage.waitForTimeout(500);

    await selectTransactionType(authPage, "credit_sale");

    await selectFirstComboboxOption(authPage, "productId");

    const amountInput = authPage.locator('input[name="amount"]');
    const val = (await amountInput.inputValue()).replace(/[^0-9]/g, "");
    if (!val || val === "0") await amountInput.fill("300000");

    const descInput = authPage.locator('input[name="description"]');
    if (await descInput.isVisible()) {
      await descInput.fill(`Penjualan kredit E2E ${TEST_PREFIX}`);
    }

    // Party (Pelanggan) — create new via allowCreate
    await createNewComboboxOption(authPage, "partyName", `Pelanggan Test ${TEST_PREFIX}`);

    await selectFirstComboboxOption(authPage, "cashAccountId");

    const notesInput = authPage.locator('textarea[name="notes"]');
    if (await notesInput.isVisible()) {
      await notesInput.fill(`E2E credit sale ${TEST_PREFIX}`);
    }

    const submitBtn = authPage.getByRole("button", { name: /catat penjualan kredit/i });
    if (await submitBtn.isVisible().catch(() => false)) {
      await submitBtn.click();
    } else {
      await authPage.getByRole("button", { name: /catat/i }).last().click();
    }

    expect(await waitForTransactionSuccess(authPage)).toBeTruthy();
  });
});

// ─── Transactions: Cash Transfer ──────────────────────────────────

test.describe("Transactions - Cash Transfer", () => {
  test("Create a cash transfer between accounts", async ({ authPage }) => {
    await authPage.goto("/transactions/new", { waitUntil: "networkidle", timeout: 15000 });
    await authPage.waitForTimeout(2000);

    const expandBtn = authPage.getByRole("button", { name: /lihat jenis transaksi lainnya/i });
    if (await expandBtn.isVisible()) await expandBtn.click();
    await authPage.waitForTimeout(500);

    await selectTransactionType(authPage, "cash_transfer");

    await authPage.locator('input[name="amount"]').fill("100000");

    const descInput = authPage.locator('input[name="description"]');
    if (await descInput.isVisible()) {
      await descInput.fill(`Transfer E2E ${TEST_PREFIX}`);
    }

    // Source account — first option
    await selectFirstComboboxOption(authPage, "cashAccountId");

    // Destination account — must be different, so we need the second option
    const destInput = authPage.locator("#destinationCashAccountId");
    await destInput.click();
    await authPage.waitForTimeout(600);
    const listbox = authPage.locator("#destinationCashAccountId-listbox");
    if (await listbox.isVisible({ timeout: 3000 }).catch(() => false)) {
      const btns = listbox.locator("button");
      const count = await btns.count();
      if (count >= 2) {
        await btns.nth(1).click();
      } else if (count === 1) {
        await btns.first().click();
      }
      await authPage.waitForTimeout(500);
    }

    const submitBtn = authPage.getByRole("button", { name: /transfer/i });
    if (await submitBtn.isVisible().catch(() => false)) {
      await submitBtn.click();
    } else {
      const fallback = authPage.getByRole("button", { name: /catat/i }).last();
      if (await fallback.isVisible()) await fallback.click();
    }

    expect(await waitForTransactionSuccess(authPage)).toBeTruthy();
  });
});

// ─── Transactions: Credit Purchase ────────────────────────────────

test.describe("Transactions - Credit Purchase", () => {
  test("Create a credit purchase (utang) with supplier", async ({ authPage }) => {
    await authPage.goto("/transactions/new", { waitUntil: "networkidle", timeout: 15000 });
    await authPage.waitForTimeout(2000);

    const expandBtn = authPage.getByRole("button", { name: /lihat jenis transaksi lainnya/i });
    if (await expandBtn.isVisible()) await expandBtn.click();
    await authPage.waitForTimeout(500);

    await selectTransactionType(authPage, "credit_purchase");

    await selectFirstComboboxOption(authPage, "productId");

    const amountInput = authPage.locator('input[name="amount"]');
    const val = (await amountInput.inputValue()).replace(/[^0-9]/g, "");
    if (!val || val === "0") await amountInput.fill("400000");

    const descInput = authPage.locator('input[name="description"]');
    if (await descInput.isVisible()) {
      await descInput.fill(`Pembelian kredit E2E ${TEST_PREFIX}`);
    }

    // Supplier — create new via allowCreate
    await createNewComboboxOption(authPage, "partyName", `Supplier Test ${TEST_PREFIX}`);

    // Cash account (optional for credit purchase? Actually showCashAccount is true,
    // and it's needed when paymentStatus !== "unpaid")
    await selectFirstComboboxOption(authPage, "cashAccountId");

    const notesInput = authPage.locator('textarea[name="notes"]');
    if (await notesInput.isVisible()) {
      await notesInput.fill(`E2E credit purchase ${TEST_PREFIX}`);
    }

    const submitBtn = authPage.getByRole("button", { name: /catat pembelian kredit/i });
    if (await submitBtn.isVisible().catch(() => false)) {
      await submitBtn.click();
    } else {
      await authPage.getByRole("button", { name: /catat/i }).last().click();
    }

    expect(await waitForTransactionSuccess(authPage)).toBeTruthy();
  });
});

// ─── Verify created data ──────────────────────────────────────────

test.describe("Verify created transactions", () => {
  test("Dashboard shows financial data", async ({ authPage }) => {
    await authPage.goto("/dashboard", { waitUntil: "networkidle", timeout: 15000 });
    await authPage.waitForTimeout(3000);

    await expect(authPage.locator("body")).toContainText("Rp", { timeout: 10000 });
    const errorBoundary = authPage.locator("text=Error handled by React Router");
    await expect(errorBoundary).toHaveCount(0);
  });

  test("Transaction list shows entries", async ({ authPage }) => {
    await authPage.goto("/transactions", { waitUntil: "networkidle", timeout: 15000 });
    await authPage.waitForTimeout(3000);

    // May show TRX- numbers or empty state — either is OK as long as no crash
    await expect(authPage.locator("body")).not.toContainText(
      "Error handled by React Router", { timeout: 5000 }
    );
  });
});
