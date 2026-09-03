import { test } from "./helpers/auth";
import { expect, type Page } from "@playwright/test";

/**
 * Transaction creation E2E - MVP 5 types + void flow.
 *
 * Creates real transactions against the staging Worker via the UI, so a
 * unique description marks each run's data.
 */

const TS = Date.now();

const DETAIL_URL = /\/transactions\/[0-9a-f-]{36}$/;

interface SubmitTransactionOptions {
  type: string;
  /** Label of the kas/bank select, e.g. "Akun Kas/Bank Sumber". */
  cashAccountLabel: string;
  /** Label of the counter-account select, e.g. "Kategori Pendapatan". */
  counterLabel: string;
  /** Exact option label ("<code> · <name>") for the counter account. */
  counterAccount: string;
  amount: string;
  description: string;
}

/**
 * Full UI flow from /transactions/new to a created transaction:
 * fills the common form, submits, and waits for the UUID detail route
 * (deliberately NOT /[^/]+$ which would also match /transactions/new).
 */
async function submitTransaction(page: Page, opts: SubmitTransactionOptions) {
  await page.goto("/transactions/new", { waitUntil: "load", timeout: 15000 });
  // Date: fixed past date so the future-date guard never trips.
  await page.getByLabel("Tanggal").fill("2026-08-01");
  await page.getByLabel("Jenis Transaksi").selectOption(opts.type);
  // Exact label ("<code> · <name>") - selectOption only accepts plain strings.
  await page.getByLabel(opts.cashAccountLabel).selectOption({ label: "1110 · Kas" });
  await page.getByLabel(opts.counterLabel).selectOption({ label: opts.counterAccount });
  await page.getByLabel(/Nominal/i).fill(opts.amount);
  await page.getByLabel("Keterangan").fill(opts.description);
  await page.getByRole("button", { name: "Simpan Transaksi" }).click();
  await expect(page).toHaveURL(DETAIL_URL, { timeout: 15000 });
}

interface CreationCase {
  name: string;
  descPrefix: string;
  type: string;
  cashAccountLabel: string;
  counterLabel: string;
  counterAccount: string;
  amount: string;
  /** Header line rendered on the detail page as "<type> · 1 Agustus 2026". */
  header: string;
  /** Extra detail-page texts to assert (account names, status badges). */
  extraLabels: string[];
}

const CREATION_CASES: CreationCase[] = [
  {
    name: "creates a cash_in (uang masuk) transaction",
    descPrefix: "Uang Masuk",
    type: "cash_in",
    cashAccountLabel: "Akun Kas/Bank Tujuan",
    counterLabel: "Kategori Pendapatan",
    counterAccount: "4110 · Pendapatan Usaha",
    amount: "500000",
    header: "Uang Masuk · 1 Agustus 2026",
    extraLabels: ["Posted", "Pendapatan Usaha"],
  },
  {
    name: "creates a cash_out (uang keluar) transaction",
    descPrefix: "Uang Keluar",
    type: "cash_out",
    cashAccountLabel: "Akun Kas/Bank Sumber",
    counterLabel: "Kategori Beban",
    counterAccount: "6180 · Beban Lain-lain",
    amount: "75000",
    header: "Uang Keluar · 1 Agustus 2026",
    extraLabels: ["Beban Lain-lain"],
  },
  {
    name: "creates a transfer between kas and bank",
    descPrefix: "Transfer",
    type: "transfer",
    cashAccountLabel: "Akun Sumber",
    counterLabel: "Akun Tujuan",
    counterAccount: "1120 · Bank",
    amount: "200000",
    header: "Transfer · 1 Agustus 2026",
    extraLabels: [],
  },
  {
    name: "creates an owner_deposit (modal masuk)",
    descPrefix: "Modal Masuk",
    type: "owner_deposit",
    cashAccountLabel: "Akun Kas/Bank Tujuan",
    counterLabel: "Modal Pemilik",
    counterAccount: "3110 · Modal Pemilik",
    amount: "1000000",
    header: "Modal Masuk · 1 Agustus 2026",
    extraLabels: [],
  },
  {
    name: "creates an owner_withdrawal (pengambilan pemilik)",
    descPrefix: "Pengambilan",
    type: "owner_withdrawal",
    cashAccountLabel: "Akun Kas/Bank Sumber",
    counterLabel: "Pengambilan Pemilik",
    counterAccount: "3120 · Pengambilan Pemilik",
    amount: "250000",
    header: "Pengambilan Pemilik · 1 Agustus 2026",
    extraLabels: [],
  },
];

test.describe("New Transaction", () => {
  for (const c of CREATION_CASES) {
    test(c.name, async ({ authPage }) => {
      const desc = `[E2E] ${c.descPrefix} ${TS}`;
      await submitTransaction(authPage, {
        type: c.type,
        cashAccountLabel: c.cashAccountLabel,
        counterLabel: c.counterLabel,
        counterAccount: c.counterAccount,
        amount: c.amount,
        description: desc,
      });

      await expect(authPage.getByText(desc)).toBeVisible();
      await expect(authPage.getByText(c.header)).toBeVisible();
      for (const label of c.extraLabels) {
        await expect(authPage.getByText(label)).toBeVisible();
      }
    });
  }

  test("voids a posted transaction", async ({ authPage }) => {
    const desc = `[E2E] Void ${TS}`;
    await submitTransaction(authPage, {
      type: "cash_out",
      cashAccountLabel: "Akun Kas/Bank Sumber",
      counterLabel: "Kategori Beban",
      counterAccount: "6180 · Beban Lain-lain",
      amount: "50000",
      description: desc,
    });

    await authPage.getByRole("button", { name: /Batalkan Transaksi/ }).click();
    await authPage.getByRole("button", { name: /Ya, Batalkan/ }).click();

    await expect(authPage.getByText("Dibatalkan")).toBeVisible({ timeout: 10000 });
    await expect(authPage.getByText("Transaksi berhasil dibatalkan.")).toBeVisible();
  });

  test("empty form cannot be submitted (stays on the form)", async ({ authPage }) => {
    await authPage.goto("/transactions/new", { waitUntil: "load", timeout: 15000 });
    await authPage.getByLabel("Tanggal").fill("2026-08-01");
    await authPage.getByRole("button", { name: "Simpan Transaksi" }).click();
    await expect(authPage).toHaveURL(/\/transactions\/new/, { timeout: 5000 });
  });

  test("new transaction appears in the transactions list", async ({ authPage }) => {
    const desc = `[E2E] List Check ${TS}`;
    await submitTransaction(authPage, {
      type: "cash_in",
      cashAccountLabel: "Akun Kas/Bank Tujuan",
      counterLabel: "Kategori Pendapatan",
      counterAccount: "4110 · Pendapatan Usaha",
      amount: "100000",
      description: desc,
    });

    await authPage.goto("/transactions", { waitUntil: "load", timeout: 15000 });
    await expect(authPage.getByText(desc)).toBeVisible({ timeout: 15000 });
  });
});
