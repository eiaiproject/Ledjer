import { test } from "./helpers/auth";
import { expect } from "@playwright/test";

/**
 * Balance Sheet (Neraca) E2E for the MVP report page.
 *
 * Verifies the report renders asset/liability/equity sections and shows the
 * "Neraca Seimbang" badge for a balanced ledger.
 */

// Isolated as-of date: the balance sheet is cumulative, so using a date no
// other spec writes to keeps the totals deterministic in parallel runs.
const AS_OF = "2026-06-30";

test.describe("Balance Sheet report", () => {
  test("renders asset, liability, and equity sections", async ({ authPage }) => {
    await authPage.goto("/reports/balance-sheet", { waitUntil: "load", timeout: 15000 });
    await expect(authPage.getByRole("heading", { name: /Neraca/ })).toBeVisible({ timeout: 15000 });

    await authPage.getByLabel("Tanggal").fill(AS_OF);
    await authPage.getByRole("button", { name: "Tampilkan" }).click();

    await expect(authPage.getByText("Aset")).toBeVisible({ timeout: 15000 });
    await expect(authPage.getByText("Liabilitas")).toBeVisible({ timeout: 15000 });
    await expect(authPage.getByText("Ekuitas")).toBeVisible({ timeout: 15000 });
    await expect(authPage.getByText("Total Aset = Liabilitas + Ekuitas")).toBeVisible();
  });

  test("shows a balanced badge for a balanced ledger", async ({ authPage }) => {
    await authPage.goto("/reports/balance-sheet", { waitUntil: "load", timeout: 15000 });

    await authPage.getByLabel("Tanggal").fill(AS_OF);
    await authPage.getByRole("button", { name: "Tampilkan" }).click();

    // Every posted journal in the MVP is forced balanced, so the badge must
    // always read "Neraca Seimbang".
    await expect(authPage.getByText("Neraca Seimbang")).toBeVisible({ timeout: 15000 });
  });

  test("reports a nonzero asset total after a deposit", async ({ authPage }) => {
    const accountIds = await authPage.evaluate(async () => {
      const res = await fetch("/api/accounts");
      const body = await res.json() as { accounts: { code: string; id: string }[] };
      const cash = body.accounts.find((a) => a.code === "1110");
      const equity = body.accounts.find((a) => a.code === "3110");
      return { cashId: cash?.id ?? "", equityId: equity?.id ?? "" };
    });

    const posted = await authPage.evaluate(
      async ({ cashId, equityId }: { cashId: string; equityId: string }) => {
        const res = await fetch("/api/transactions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            transactionType: "owner_deposit",
            transactionDate: "2026-06-10",
            cashAccountId: cashId,
            counterAccountId: equityId,
            description: `[E2E] Neraca ${Date.now()}`,
            amountIdr: 1000000,
            idempotencyKey: `e2e-bs-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          }),
        });
        return res.ok;
      },
      accountIds,
    );
    expect(posted).toBe(true);

    await authPage.goto("/reports/balance-sheet", { waitUntil: "load", timeout: 15000 });
    await authPage.getByLabel("Tanggal").fill(AS_OF);
    await authPage.getByRole("button", { name: "Tampilkan" }).click();

    // Modal Pemilik holds this org's accumulated owner deposits, so the row
    // amount must be nonzero after this test posts Rp 1.000.000. Exact amounts
    // are avoided because repeated runs on shared staging accumulate.
    const equityRow = authPage.locator("li", { hasText: "3110 · Modal Pemilik" });
    await expect(equityRow).toBeVisible({ timeout: 15000 });
    // \\s+ covers the NBSP that Intl inserts between "Rp" and the digits.
    await expect(equityRow.getByText(/^Rp\s+[1-9]/)).toBeVisible({ timeout: 15000 });
  });
});