import { test } from "./helpers/auth";
import { expect } from "@playwright/test";

/**
 * Transaction creation E2E - MVP 5 types + void flow.
 *
 * Creates real transactions against the staging Worker via the UI, so a
 * unique description marks each run's data.
 */

const TS = Date.now();
const DESCRIPTION = `[E2E] Uang Masuk ${TS}`;

async function fillCommonForm(page: import("@playwright/test").Page) {
  await page.goto("/transactions/new", { waitUntil: "load", timeout: 15000 });
  // Date: fixed past date so the future-date guard never trips.
  await page.getByLabel("Tanggal").fill("2026-08-01");
}

async function selectCashAccount(page: import("@playwright/test").Page, label: string) {
  await page.getByLabel(label).selectOption({ label: /^1110 · Kas/ });
}

test.describe("New Transaction", () => {
  test("creates a cash_in (uang masuk) transaction", async ({ authPage }) => {
    await fillCommonForm(authPage);
    await authPage.getByLabel("Jenis Transaksi").selectOption("cash_in");
    await selectCashAccount(authPage, "Akun Kas/Bank Tujuan");
    await authPage.getByLabel("Kategori Pendapatan").selectOption({ label: /Pendapatan Usaha/ });
    await authPage.getByLabel(/Nominal/i).fill("500000");
    await authPage.getByLabel("Keterangan").fill(DESCRIPTION);
    await authPage.getByRole("button", { name: "Simpan Transaksi" }).click();

    await expect(authPage).toHaveURL(/\/transactions\/[^/]+$/, { timeout: 15000 });
    await expect(authPage.getByText(DESCRIPTION)).toBeVisible();
    await expect(authPage.getByText("Uang Masuk")).toBeVisible();
    await expect(authPage.getByText("Posted")).toBeVisible();
    await expect(authPage.getByText("Pendapatan Usaha")).toBeVisible();
  });

  test("creates a cash_out (uang keluar) transaction", async ({ authPage }) => {
    const desc = `[E2E] Uang Keluar ${TS}`;
    await fillCommonForm(authPage);
    await authPage.getByLabel("Jenis Transaksi").selectOption("cash_out");
    await selectCashAccount(authPage, "Akun Kas/Bank Sumber");
    await authPage.getByLabel("Kategori Beban").selectOption({ label: /Beban Lain-lain/ });
    await authPage.getByLabel(/Nominal/i).fill("75000");
    await authPage.getByLabel("Keterangan").fill(desc);
    await authPage.getByRole("button", { name: "Simpan Transaksi" }).click();

    await expect(authPage).toHaveURL(/\/transactions\/[^/]+$/, { timeout: 15000 });
    await expect(authPage.getByText(desc)).toBeVisible();
    await expect(authPage.getByText("Uang Keluar")).toBeVisible();
    await expect(authPage.getByText("Beban Lain-lain")).toBeVisible();
  });

  test("creates a transfer between kas and bank", async ({ authPage }) => {
    const desc = `[E2E] Transfer ${TS}`;
    await fillCommonForm(authPage);
    await authPage.getByLabel("Jenis Transaksi").selectOption("transfer");
    await selectCashAccount(authPage, "Akun Sumber");
    await authPage.getByLabel("Akun Tujuan").selectOption({ label: /Bank/ });
    await authPage.getByLabel(/Nominal/i).fill("200000");
    await authPage.getByLabel("Keterangan").fill(desc);
    await authPage.getByRole("button", { name: "Simpan Transaksi" }).click();

    await expect(authPage).toHaveURL(/\/transactions\/[^/]+$/, { timeout: 15000 });
    await expect(authPage.getByText(desc)).toBeVisible();
    await expect(authPage.getByText("Transfer")).toBeVisible();
  });

  test("creates an owner_deposit (modal masuk)", async ({ authPage }) => {
    const desc = `[E2E] Modal Masuk ${TS}`;
    await fillCommonForm(authPage);
    await authPage.getByLabel("Jenis Transaksi").selectOption("owner_deposit");
    await selectCashAccount(authPage, "Akun Kas/Bank Tujuan");
    await authPage.getByLabel("Modal Pemilik").selectOption({ label: /Modal Pemilik/ });
    await authPage.getByLabel(/Nominal/i).fill("1000000");
    await authPage.getByLabel("Keterangan").fill(desc);
    await authPage.getByRole("button", { name: "Simpan Transaksi" }).click();

    await expect(authPage).toHaveURL(/\/transactions\/[^/]+$/, { timeout: 15000 });
    await expect(authPage.getByText(desc)).toBeVisible();
    await expect(authPage.getByText("Modal Masuk")).toBeVisible();
  });

  test("creates an owner_withdrawal (pengambilan pemilik)", async ({ authPage }) => {
    const desc = `[E2E] Pengambilan ${TS}`;
    await fillCommonForm(authPage);
    await authPage.getByLabel("Jenis Transaksi").selectOption("owner_withdrawal");
    await selectCashAccount(authPage, "Akun Kas/Bank Sumber");
    await authPage.getByLabel("Pengambilan Pemilik").selectOption({ label: /Pengambilan Pemilik/ });
    await authPage.getByLabel(/Nominal/i).fill("250000");
    await authPage.getByLabel("Keterangan").fill(desc);
    await authPage.getByRole("button", { name: "Simpan Transaksi" }).click();

    await expect(authPage).toHaveURL(/\/transactions\/[^/]+$/, { timeout: 15000 });
    await expect(authPage.getByText(desc)).toBeVisible();
    await expect(authPage.getByText("Pengambilan Pemilik")).toBeVisible();
  });

  test("voids a posted transaction", async ({ authPage }) => {
    const desc = `[E2E] Void ${TS}`;
    await fillCommonForm(authPage);
    await authPage.getByLabel("Jenis Transaksi").selectOption("cash_out");
    await selectCashAccount(authPage, "Akun Kas/Bank Sumber");
    await authPage.getByLabel("Kategori Beban").selectOption({ label: /Beban Lain-lain/ });
    await authPage.getByLabel(/Nominal/i).fill("50000");
    await authPage.getByLabel("Keterangan").fill(desc);
    await authPage.getByRole("button", { name: "Simpan Transaksi" }).click();
    await expect(authPage).toHaveURL(/\/transactions\/[^/]+$/, { timeout: 15000 });

    await authPage.getByRole("button", { name: /Batalkan Transaksi/ }).click();
    await authPage.getByRole("button", { name: /Ya, Batalkan/ }).click();

    await expect(authPage.getByText("Dibatalkan")).toBeVisible({ timeout: 10000 });
    await expect(authPage.getByText("Transaksi berhasil dibatalkan.")).toBeVisible();
  });

  test("empty form cannot be submitted (stays on the form)", async ({ authPage }) => {
    await fillCommonForm(authPage);
    await authPage.getByRole("button", { name: "Simpan Transaksi" }).click();
    await expect(authPage).toHaveURL(/\/transactions\/new/, { timeout: 5000 });
  });

  test("new transaction appears in the transactions list", async ({ authPage }) => {
    const desc = `[E2E] List Check ${TS}`;
    await fillCommonForm(authPage);
    await authPage.getByLabel("Jenis Transaksi").selectOption("cash_in");
    await selectCashAccount(authPage, "Akun Kas/Bank Tujuan");
    await authPage.getByLabel("Kategori Pendapatan").selectOption({ label: /Pendapatan Usaha/ });
    await authPage.getByLabel(/Nominal/i).fill("100000");
    await authPage.getByLabel("Keterangan").fill(desc);
    await authPage.getByRole("button", { name: "Simpan Transaksi" }).click();
    await expect(authPage).toHaveURL(/\/transactions\/[^/]+$/, { timeout: 15000 });

    await authPage.goto("/transactions", { waitUntil: "load", timeout: 15000 });
    await expect(authPage.getByText(desc)).toBeVisible({ timeout: 15000 });
  });
});