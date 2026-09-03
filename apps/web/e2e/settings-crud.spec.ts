import { test } from "./helpers/auth";
import { expect } from "@playwright/test";

/**
 * Settings (Pengaturan) E2E for the MVP: rename the business profile.
 */

const TS = Date.now();
const RENAMED = `Toko E2E ${TS}`;

test.describe("Settings page", () => {
  test("shows the business profile and account info", async ({ authPage }) => {
    await authPage.goto("/settings", { waitUntil: "load", timeout: 15000 });
    await expect(authPage.getByRole("heading", { name: /Pengaturan/ })).toBeVisible({ timeout: 15000 });
    await expect(authPage.getByText("Profil Usaha")).toBeVisible();
    await expect(authPage.getByText("Email")).toBeVisible();
  });

  test("renames the organization", async ({ authPage }) => {
    await authPage.goto("/settings", { waitUntil: "load", timeout: 15000 });

    const nameInput = authPage.getByLabel("Nama Usaha");
    await expect(nameInput).toBeVisible({ timeout: 15000 });
    await nameInput.fill(RENAMED);
    await authPage.getByRole("button", { name: "Simpan" }).click();

    await expect(authPage.getByText("Profil usaha diperbarui.")).toBeVisible({ timeout: 10000 });

    // The new name persists after reload.
    await authPage.goto("/settings", { waitUntil: "load", timeout: 15000 });
    await expect(authPage.getByLabel("Nama Usaha")).toHaveValue(RENAMED, { timeout: 15000 });
  });
});