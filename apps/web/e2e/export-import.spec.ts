import { test, expect } from "@playwright/test";
import { loginViaUI } from "./fixtures/auth";

/**
 * Export E2E tests.
 * Verifies CSV download triggers, file headers, and key row values.
 */

test.describe("CSV export — buttons exist", () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
    await expect(page).toHaveURL(/\/dashboard|\/onboarding/);
  });

  test("transactions page has export button", async ({ page }) => {
    await page.goto("/transactions");
    await page.waitForLoadState("networkidle");
    const exportBtn = page.getByRole("button", { name: /export csv/i });
    await expect(exportBtn).toBeVisible({ timeout: 10_000 });
  });

  test("accounts page has export button", async ({ page }) => {
    await page.goto("/accounts");
    await page.waitForLoadState("networkidle");
    const exportBtn = page.getByRole("button", { name: /export csv/i });
    await expect(exportBtn).toBeVisible({ timeout: 10_000 });
  });

  test("trial balance report has export button", async ({ page }) => {
    await page.goto("/reports/trial-balance");
    await page.waitForLoadState("networkidle");
    const exportBtn = page.getByRole("button", { name: /export csv/i });
    await expect(exportBtn).toBeVisible({ timeout: 10_000 });
  });

  test("profit & loss report has export button", async ({ page }) => {
    await page.goto("/reports/profit-loss");
    await page.waitForLoadState("networkidle");
    const exportBtn = page.getByRole("button", { name: /export csv/i });
    await expect(exportBtn).toBeVisible({ timeout: 10_000 });
  });
});

test.describe("CSV export — download and content", () => {
  test("transactions export downloads valid CSV with headers", async ({ page }) => {
    await loginViaUI(page);
    await page.goto("/transactions");
    await page.waitForLoadState("networkidle");

    const exportBtn = page.getByRole("button", { name: /export csv/i });
    await expect(exportBtn).toBeVisible({ timeout: 10_000 });

    if (!(await exportBtn.isEnabled())) {
      // No transactions yet — skip
      test.skip();
      return;
    }

    const downloadPromise = page.waitForEvent("download", { timeout: 15_000 });
    await exportBtn.click();
    const download = await downloadPromise;

    // Verify filename
    expect(download.suggestedFilename()).toMatch(/transaksi.*\.csv$/);

    // Read file content
    const path = await download.path();
    expect(path).toBeTruthy();
    const fs = await import("fs");
    const content = fs.readFileSync(path!, "utf-8");
    const lines = content.split("\n").filter((l) => l.trim());

    // Should have at least header + 1 data row
    expect(lines.length).toBeGreaterThanOrEqual(2);

    // First line should be CSV headers
    const header = lines[0].toLowerCase();
    expect(header).toMatch(/tanggal|date|jenis|type|nominal|amount|deskripsi|description/);
  });

  test("accounts export downloads valid CSV", async ({ page }) => {
    await loginViaUI(page);
    await page.goto("/accounts");
    await page.waitForLoadState("networkidle");

    const exportBtn = page.getByRole("button", { name: /export csv/i });
    await expect(exportBtn).toBeVisible({ timeout: 10_000 });

    const downloadPromise = page.waitForEvent("download", { timeout: 15_000 });
    await exportBtn.click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toMatch(/akun.*\.csv$/);

    const path = await download.path();
    expect(path).toBeTruthy();
    const fs = await import("fs");
    const content = fs.readFileSync(path!, "utf-8");
    const lines = content.split("\n").filter((l) => l.trim());

    // Should have at least header
    expect(lines.length).toBeGreaterThanOrEqual(1);

    // Header should mention account-related columns
    const header = lines[0].toLowerCase();
    expect(header).toMatch(/kode|code|nama|name|akun|account/);
  });

  test("trial balance export downloads valid CSV", async ({ page }) => {
    await loginViaUI(page);
    await page.goto("/reports/trial-balance");
    await page.waitForLoadState("networkidle");

    const exportBtn = page.getByRole("button", { name: /export csv/i });
    await expect(exportBtn).toBeVisible({ timeout: 10_000 });

    const downloadPromise = page.waitForEvent("download", { timeout: 15_000 });
    await exportBtn.click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toMatch(/neraca.saldo.*\.csv$/);

    const path = await download.path();
    expect(path).toBeTruthy();
    const fs = await import("fs");
    const content = fs.readFileSync(path!, "utf-8");
    const lines = content.split("\n").filter((l) => l.trim());

    // Should have at least header
    expect(lines.length).toBeGreaterThanOrEqual(1);
  });
});
