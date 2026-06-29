import { test, expect } from "@playwright/test";
import { loginViaUI } from "./fixtures/auth";

/**
 * Golden transaction flow E2E — tests all 10 general transaction types.
 * Each test submits a real transaction via the UI and verifies:
 *   - form completes without error
 *   - transaction is saved (redirect to detail page)
 *   - transaction appears in transaction list
 */

type TxnType = {
  type: string;
  label: string;
  /** Regex for the submit button text */
  submitBtn: RegExp;
  /** Extra fields to fill beyond amount + description + cash account */
  extra?: (page: import("@playwright/test").Page) => Promise<void>;
};

const TXN_TYPES: TxnType[] = [
  {
    type: "cash_sale",
    label: "Penjualan Tunai",
    submitBtn: /Catat Penjualan|Catat Transaksi/,
  },
  {
    type: "credit_sale",
    label: "Penjualan Kredit",
    submitBtn: /Catat Penjualan|Catat Transaksi/,
    extra: async (page) => {
      // Credit sale requires party name
      const partyInput = page.locator('input[placeholder*="pelanggan" i]').first();
      if (await partyInput.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await partyInput.fill("[E2E] Customer");
      }
    },
  },
  {
    type: "receive_receivable",
    label: "Terima Piutang",
    submitBtn: /Catat Penerimaan|Catat Transaksi/,
    extra: async (page) => {
      const partyInput = page.locator('input[placeholder*="pelanggan" i]').first();
      if (await partyInput.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await partyInput.fill("[E2E] Customer");
      }
    },
  },
  {
    type: "cash_purchase",
    label: "Pembelian Tunai",
    submitBtn: /Catat Pembelian|Catat Transaksi/,
  },
  {
    type: "credit_purchase",
    label: "Pembelian Kredit",
    submitBtn: /Catat Pembelian|Catat Transaksi/,
    extra: async (page) => {
      const partyInput = page.locator('input[placeholder*="supplier" i]').first();
      if (await partyInput.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await partyInput.fill("[E2E] Supplier");
      }
    },
  },
  {
    type: "pay_payable",
    label: "Bayar Utang",
    submitBtn: /Catat Pembayaran|Catat Transaksi/,
    extra: async (page) => {
      const partyInput = page.locator('input[placeholder*="supplier" i]').first();
      if (await partyInput.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await partyInput.fill("[E2E] Supplier");
      }
    },
  },
  {
    type: "expense_payment",
    label: "Bayar Beban",
    submitBtn: /Catat Beban|Catat Transaksi/,
  },
  {
    type: "owner_capital",
    label: "Modal Pemilik",
    submitBtn: /Catat Modal|Catat Transaksi/,
  },
  {
    type: "owner_draw",
    label: "Penarikan Tunai",
    submitBtn: /Catat Penarikan|Catat Transaksi/,
  },
  {
    type: "cash_transfer",
    label: "Transfer Antar Rekening Bank",
    submitBtn: /Catat Transfer|Catat Transaksi/,
    extra: async (page) => {
      // Transfer needs a destination account
      const destCombobox = page.locator('input[role="combobox"][name="destinationCashAccountId"]');
      if (await destCombobox.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await destCombobox.click();
        const listbox = page.locator('[role="listbox"]');
        await expect(listbox).toBeVisible({ timeout: 3_000 });
        const option = listbox.locator('[role="option"]').nth(1);
        if (await option.isVisible({ timeout: 2_000 }).catch(() => false)) {
          await option.click();
        }
      }
    },
  },
];

for (const txn of TXN_TYPES) {
  test.describe(`Transaction: ${txn.label}`, () => {
    test(`submit ${txn.type} via UI`, async ({ page }) => {
      await loginViaUI(page);
      await expect(page).toHaveURL(/\/dashboard|\/onboarding/);

      // Navigate to new transaction
      await page.goto("/transactions/new");
      await page.waitForLoadState("networkidle");

      // Select transaction type
      const typeBtn = page.getByRole("button", { name: new RegExp(txn.label, "i") });
      await expect(typeBtn).toBeVisible({ timeout: 10_000 });
      await typeBtn.click();

      // Fill amount
      const amountField = page.locator('input[name="amount"], input[name*="amount"]').first();
      await expect(amountField).toBeVisible({ timeout: 5_000 });
      await amountField.click();
      await amountField.fill("100000");
      await amountField.press("Tab");

      // Fill description
      const descField = page.locator('input[name="description"], textarea[name="description"]').first();
      if (await descField.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await descField.fill(`[E2E] ${txn.label} test`);
      }

      // Fill extra fields (party, destination, etc.)
      if (txn.extra) {
        await txn.extra(page);
      }

      // Select cash account (for types that use it)
      const cashAccountCombobox = page.locator('input[role="combobox"][name="cashAccountId"]');
      if (await cashAccountCombobox.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await cashAccountCombobox.click();
        const listbox = page.locator('[role="listbox"]');
        await expect(listbox).toBeVisible({ timeout: 3_000 });
        const firstOption = listbox.locator('[role="option"]').first();
        await expect(firstOption).toBeVisible({ timeout: 3_000 });
        await firstOption.click();
      }

      // Submit
      const submitBtn = page.getByRole("button", { name: txn.submitBtn }).first();
      await expect(submitBtn).toBeVisible({ timeout: 5_000 });
      await expect(submitBtn).toBeEnabled({ timeout: 5_000 });
      await submitBtn.click();

      // Assert success
      await expect(
        page.getByText(/Transaksi tersimpan|berhasil/i).first(),
      ).toBeVisible({ timeout: 15_000 });

      // Should redirect to transaction detail
      await page.waitForURL(/\/transactions\/[0-9a-f-]+/i, { timeout: 15_000 });

      // Verify in transaction list
      await page.goto("/transactions");
      await page.waitForLoadState("networkidle");
      await expect(
        page.getByText(new RegExp(`\\[E2E\\] ${txn.label}`, "i")).first(),
      ).toBeVisible({ timeout: 10_000 });
    });
  });
}

test.describe("Transaction validation", () => {
  test("empty amount is rejected for cash sale", async ({ page }) => {
    await loginViaUI(page);
    await page.goto("/transactions/new");
    await page.waitForLoadState("networkidle");

    const cashSaleBtn = page.getByRole("button", { name: /Penjualan Tunai/i });
    await expect(cashSaleBtn).toBeVisible({ timeout: 5_000 });
    await cashSaleBtn.click();

    const submitBtn = page.getByRole("button", { name: /Catat Penjualan|Catat Transaksi/i }).first();
    await expect(submitBtn).toBeVisible({ timeout: 3_000 });
    await submitBtn.click();

    await expect(page.locator("text=/lebih dari 0|wajib/i").first()).toBeVisible({ timeout: 5_000 });
  });

  test("zero amount is rejected", async ({ page }) => {
    await loginViaUI(page);
    await page.goto("/transactions/new");
    await page.waitForLoadState("networkidle");

    const cashSaleBtn = page.getByRole("button", { name: /Penjualan Tunai/i });
    await expect(cashSaleBtn).toBeVisible({ timeout: 5_000 });
    await cashSaleBtn.click();

    const amountField = page.locator('input[name="amount"], input[name*="amount"]').first();
    await expect(amountField).toBeVisible({ timeout: 5_000 });
    await amountField.fill("0");
    await amountField.press("Tab");

    const submitBtn = page.getByRole("button", { name: /Catat Penjualan|Catat Transaksi/i }).first();
    await submitBtn.click();

    await expect(page.locator("text=/lebih dari 0|wajib/i").first()).toBeVisible({ timeout: 5_000 });
  });

  test("empty description is rejected", async ({ page }) => {
    await loginViaUI(page);
    await page.goto("/transactions/new");
    await page.waitForLoadState("networkidle");

    const cashSaleBtn = page.getByRole("button", { name: /Penjualan Tunai/i });
    await expect(cashSaleBtn).toBeVisible({ timeout: 5_000 });
    await cashSaleBtn.click();

    const amountField = page.locator('input[name="amount"], input[name*="amount"]').first();
    await expect(amountField).toBeVisible({ timeout: 5_000 });
    await amountField.fill("100000");
    await amountField.press("Tab");

    // Don't fill description
    const submitBtn = page.getByRole("button", { name: /Catat Penjualan|Catat Transaksi/i }).first();
    await submitBtn.click();

    await expect(page.locator("text=/wajib/i").first()).toBeVisible({ timeout: 5_000 });
  });
});
