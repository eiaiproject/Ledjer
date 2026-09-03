import { test } from "./helpers/auth";
import { expect, type Page } from "@playwright/test";

/**
 * Transaction creation E2E - MVP 5 types + void flow.
 *
 * Creates real transactions against the staging Worker via the UI, so a
 * unique description marks each run's data.
 */

const TS = Date.now();
const DESCRIPTION = `[E2E] Uang Masuk ${TS}`;

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

test.describe("New Transaction", () => {
  test("creates a cash_in (uang masuk) transaction", async ({ authPage }) => {
    await submitTransaction(authPage, {
      type: "cash_in",
      cashAccountLabel: "Akun Kas/Bank Tujuan",
      counterLabel: "Kategori Pendapatan",
      counterAccount: "4110 · Pendapatan Usaha",
      amount: "500000",
      description: DESCRIPTION,
    });

    await expect(authPage.getByText(DESCRIPTION)).toBeVisible();
    // The type is rendered in the page header as "<type> · <date>".
    await expect(authPage.getByText("Uang Masuk · 1 Agustus 2026")).toBeVisible();
    await expect(authPage.getByText("Posted")).toBeVisible();
    await expect(authPage.getByText("Pendapatan Usaha")).toBeVisible();
  });

  test("creates a cash_out (uang keluar) transaction", async ({ authPage }) => {
    const desc = `[E2E] Uang Keluar ${TS}`;
    await submitTransaction(authPage, {
      type: "cash_out",
      cashAccountLabel: "Akun Kas/Bank Sumber",
      counterLabel: "Kategori Beban",
      counterAccount: "6180 · Beban Lain-lain",
      amount: "75000",
      description: desc,
    });

    await expect(authPage.getByText(desc)).toBeVisible();
    await expect(authPage.getByText("Uang Keluar · 1 Agustus 2026")).toBeVisible();
    await expect(authPage.getByText("Beban Lain-lain")).toBeVisible();
  });

  test("creates a transfer between kas and bank", async ({ authPage }) => {
    const desc = `[E2E] Transfer ${TS}`;
    await submitTransaction(authPage, {
      type: "transfer",
      cashAccountLabel: "Akun Sumber",
      counterLabel: "Akun Tujuan",
      counterAccount: "1120 · Bank",
      amount: "200000",
      description: desc,
    });

    await expect(authPage.getByText(desc)).toBeVisible();
    await expect(authPage.getByText("Transfer · 1 Agustus 2026")).toBeVisible();
  });

  test("creates an owner_deposit (modal masuk)", async ({ authPage }) => {
    const desc = `[E2E] Modal Masuk ${TS}`;
    await submitTransaction(authPage, {
      type: "owner_deposit",
      cashAccountLabel: "Akun Kas/Bank Tujuan",
      counterLabel: "Modal Pemilik",
      counterAccount: "3110 · Modal Pemilik",
      amount: "1000000",
      description: desc,
    });

    await expect(authPage.getByText(desc)).toBeVisible();
    await expect(authPage.getByText("Modal Masuk · 1 Agustus 2026")).toBeVisible();
  });

  test("creates an owner_withdrawal (pengambilan pemilik)", async ({ authPage }) => {
    const desc = `[E2E] Pengambilan ${TS}`;
    await submitTransaction(authPage, {
      type: "owner_withdrawal",
      cashAccountLabel: "Akun Kas/Bank Sumber",
      counterLabel: "Pengambilan Pemilik",
      counterAccount: "3120 · Pengambilan Pemilik",
      amount: "250000",
      description: desc,
    });

    await expect(authPage.getByText(desc)).toBeVisible();
    await expect(authPage.getByText("Pengambilan Pemilik · 1 Agustus 2026")).toBeVisible();
  });

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
