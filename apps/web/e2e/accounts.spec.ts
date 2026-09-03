import { test } from "./helpers/auth";
import { expect } from "@playwright/test";

/**
 * Accounts (Kas & Bank) E2E for the MVP: list groups, create cash/bank
 * accounts, duplicate-name rejection, protected system accounts, toggle.
 */

const TS = Date.now();
const NEW_CASH_NAME = `Kas E2E ${TS}`;
const NEW_BANK_NAME = `Bank E2E ${TS}`;

test.describe("Accounts page", () => {
  test("shows Kas and Bank groups with balances", async ({ authPage }) => {
    await authPage.goto("/accounts", { waitUntil: "load", timeout: 15000 });
    await expect(authPage.getByRole("heading", { name: /Kas & Bank/ })).toBeVisible({ timeout: 15000 });
    // Seed org has a Kas (system) account.
    await expect(authPage.getByText("1110").first()).toBeVisible({ timeout: 15000 });
  });

  test("creates a new cash account", async ({ authPage }) => {
    await authPage.goto("/accounts", { waitUntil: "load", timeout: 15000 });
    await authPage.getByLabel("Nama Akun").fill(NEW_CASH_NAME);
    await authPage.getByRole("button", { name: /Tambah Akun/ }).click();

    await expect(authPage.getByText("Akun berhasil dibuat.")).toBeVisible({ timeout: 10000 });
    await expect(authPage.getByText(NEW_CASH_NAME)).toBeVisible({ timeout: 10000 });
  });

  test("creates a new bank account", async ({ authPage }) => {
    await authPage.goto("/accounts", { waitUntil: "load", timeout: 15000 });
    await authPage.getByLabel("Jenis").selectOption("bank");
    await authPage.getByLabel("Nama Akun").fill(NEW_BANK_NAME);
    await authPage.getByRole("button", { name: /Tambah Akun/ }).click();

    await expect(authPage.getByText("Akun berhasil dibuat.")).toBeVisible({ timeout: 10000 });
    await expect(authPage.getByText(NEW_BANK_NAME)).toBeVisible({ timeout: 10000 });
  });

  test("rejects a duplicate account name", async ({ authPage }) => {
    await authPage.goto("/accounts", { waitUntil: "load", timeout: 15000 });
    // "Kas" is the seeded system account - creating it again must fail.
    await authPage.getByLabel("Nama Akun").fill("Kas");
    await authPage.getByRole("button", { name: /Tambah Akun/ }).click();

    await expect(authPage.locator("[role='alert']")).toContainText(/sudah dipakai/i, { timeout: 10000 });
  });

  test("cannot deactivate a system account", async ({ authPage }) => {
    await authPage.goto("/accounts", { waitUntil: "load", timeout: 15000 });
    // First "Nonaktifkan" button belongs to the Kas system account (sorted by code).
    await authPage.getByRole("button", { name: /Nonaktifkan/ }).first().click();

    await expect(authPage.locator("[role='alert']")).toContainText(/tidak dapat dinonaktifkan/i, { timeout: 10000 });
  });

  test("deactivates and reactivates a non-system account", async ({ authPage }) => {
    await authPage.goto("/accounts", { waitUntil: "load", timeout: 15000 });
    // Create a fresh account first so the toggle targets it deterministically.
    await authPage.getByLabel("Nama Akun").fill(NEW_CASH_NAME);
    await authPage.getByRole("button", { name: /Tambah Akun/ }).click();
    await expect(authPage.getByText(NEW_CASH_NAME)).toBeVisible({ timeout: 10000 });

    const row = authPage.locator("li", { hasText: NEW_CASH_NAME });
    await row.getByRole("button", { name: /Nonaktifkan/ }).click();
    await expect(authPage.getByText("Akun dinonaktifkan.")).toBeVisible({ timeout: 10000 });
    await expect(row.getByText("Nonaktif")).toBeVisible({ timeout: 10000 });

    await row.getByRole("button", { name: /Aktifkan/ }).click();
    await expect(authPage.getByText("Akun diaktifkan.")).toBeVisible({ timeout: 10000 });
    await expect(row.getByText("Nonaktif")).toHaveCount(0);
  });
});