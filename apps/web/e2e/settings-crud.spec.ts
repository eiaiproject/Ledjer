import { test } from "./helpers/auth";
import { expect } from "@playwright/test";

/**
 * Settings CRUD: Period Locks, Team Settings
 */

const TEST_PREFIX = `[E2E] ${Date.now()}`;

// ═══════════════════════════════════════════════════════════════════
//  PERIOD LOCKS (/settings/period-locks)
// ═══════════════════════════════════════════════════════════════════

test.describe("Period Locks CRUD", () => {
  test("Create a period lock", async ({ authPage }) => {
    await authPage.goto("/settings/period-locks", { waitUntil: "networkidle", timeout: 15000 });
    await authPage.waitForTimeout(2000);

    // Inline form — look for date input and submit button
    const formHeading = authPage.getByRole("heading", { name: /tambah kunci periode/i });
    await expect(formHeading).toBeVisible({ timeout: 5000 });

    // Date input — use the first date input on the page
    const dateInput = authPage.locator('input[type="date"]').first();
    if (await dateInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await dateInput.fill(new Date().toISOString().slice(0, 10));
    }

    // Reason textarea
    const reasonInput = authPage.locator('#alasan');
    if (await reasonInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await reasonInput.fill(`E2E lock ${TEST_PREFIX}`);
    }

    // Submit button
    const submitBtn = authPage.getByRole("button", { name: /kunci/i });
    if (await submitBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await submitBtn.click();
      await authPage.waitForTimeout(3000);
    }

    await expect(authPage.locator('text=Error handled by React Router')).toHaveCount(0);
  });
});

// ═══════════════════════════════════════════════════════════════════
//  TEAM SETTINGS (/settings/team)
// ═══════════════════════════════════════════════════════════════════

test.describe("Team Settings CRUD", () => {
  test("Create an invitation link", async ({ authPage }) => {
    await authPage.goto("/settings/team", { waitUntil: "networkidle", timeout: 15000 });
    await authPage.waitForTimeout(2000);

    // Email field — Input uses label "Email anggota" → id="email-anggota"
    const emailInput = authPage.locator('#email-anggota');
    await expect(emailInput).toBeVisible({ timeout: 5000 });
    await emailInput.fill(`e2e-${TEST_PREFIX}@yopmail.com`);

    // Role select — id="invite-role"
    const roleSelect = authPage.locator('#invite-role');
    await expect(roleSelect).toBeVisible({ timeout: 3000 });
    await roleSelect.selectOption('member');

    // Submit button
    const submitBtn = authPage.getByRole("button", { name: /buat link undangan/i });
    await expect(submitBtn).toBeVisible({ timeout: 3000 });
    await submitBtn.click();
    await authPage.waitForTimeout(3000);

    await expect(authPage.locator('text=Error handled by React Router')).toHaveCount(0);
  });
});
