import { expect } from "@playwright/test";
import { test } from "./helpers/auth";

/**
 * Balance Sheet page E2E tests.
 * Uses authenticated fixture for auth-required tests.
 */

async function gotoBalanceSheet(
  page: import("@playwright/test").Page,
  width = 375,
  height = 812,
) {
  await page.setViewportSize({ width, height });
  await page.goto("/reports/balance-sheet");
  await page.waitForLoadState("networkidle");
}

// ── Page basics (auth-independent) ─────────────────────────────────

test.describe("Balance Sheet page basics", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("page loads without crash", async ({ authPage }) => {
    await gotoBalanceSheet(authPage);
    await authPage.goto("/reports/balance-sheet");
    await authPage.waitForLoadState("networkidle");
    expect(await authPage.title()).toMatch(/Ledjer/i);
  });

  test("no horizontal overflow at 320px", async ({ authPage }) => {
    await gotoBalanceSheet(authPage);
    await authPage.setViewportSize({ width: 320, height: 800 });
    await authPage.goto("/reports/balance-sheet");
    await authPage.waitForLoadState("networkidle");
    expect(
      await authPage.evaluate(() => document.body.scrollWidth > window.innerWidth),
    ).toBeFalsy();
  });

  test("exactly one h1 exists", async ({ authPage }) => {
    await gotoBalanceSheet(authPage);
    await expect(authPage.locator("h1")).toHaveCount(1);
  });

  test("page title says Neraca", async ({ authPage }) => {
    await gotoBalanceSheet(authPage);
    await expect(authPage.locator("h1")).toContainText("Neraca");
  });

  test("page title does NOT contain (Balance Sheet)", async ({ authPage }) => {
  await gotoBalanceSheet(authPage);
    const text = await authPage.locator("h1").textContent();
    expect(text).not.toContain("(Balance Sheet)");
  });

  test("no duplicate ledger-page animation", async ({ authPage }) => {
    await gotoBalanceSheet(authPage);
    await authPage.goto("/reports/balance-sheet");
    await authPage.waitForLoadState("networkidle");
    const count = await authPage.locator(".ledger-page").count();
    expect(count).toBeLessThanOrEqual(1);
  });
});

// ── Date display (auth required) ───────────────────────────────────

test.describe("Date display (auth required)", () => {
  test("subtitle uses localized Indonesian date", async ({ authPage }) => {
    await gotoBalanceSheet(authPage);
    const subtitle = authPage.locator("p[aria-live='polite']").first();
    await expect(subtitle).toBeVisible();
    const text = await subtitle.textContent();
    // Should contain Indonesian month name and year
    expect(text).toMatch(/\d+ \w+ \d{4}/);
    // Should not use DD/MM/YYYY format
    expect(text).not.toMatch(/\d{2}\/\d{2}\/\d{4}/);
  });

  test("subtitle describes the report purpose", async ({ authPage }) => {
    await gotoBalanceSheet(authPage);
    const subtitle = authPage.locator("p[aria-live='polite']").first();
    const text = await subtitle.textContent();
    expect(text).toContain("aset");
  });
});

// ── Date apply behavior (auth required) ────────────────────────────

test.describe("Date apply behavior (auth required)", () => {
  test("apply button says Tampilkan laporan", async ({ authPage }) => {
    await gotoBalanceSheet(authPage);
    await expect(authPage.getByRole("button", { name: /tampilkan laporan/i })).toBeVisible();
  });

  test("apply button does NOT say Muat Ulang", async ({ authPage }) => {
    await gotoBalanceSheet(authPage);
    await expect(authPage.getByRole("button", { name: /muat ulang/i })).toHaveCount(0);
  });

  test("date field has Indonesian label", async ({ authPage }) => {
    await gotoBalanceSheet(authPage);
    const label = authPage.locator("label").filter({ hasText: /per tanggal/i });
    await expect(label.first()).toBeAttached();
  });

  test("refresh button has aria-label", async ({ authPage }) => {
    await gotoBalanceSheet(authPage);
    await expect(authPage.locator("button[aria-label*='refresh' i]").first()).toBeAttached();
  });
});

// ── Export (auth required) ──────────────────────────────────────────

test.describe("Export (auth required)", () => {
  test("export button has Indonesian accessible name", async ({ authPage }) => {
    await gotoBalanceSheet(authPage);
    const btn = authPage.getByRole("button", { name: /ekspor/i });
    await expect(btn.first()).toBeAttached();
  });

  test("export button text is Ekspor on mobile", async ({ authPage }) => {
    await gotoBalanceSheet(authPage);
    const eksporBtn = authPage.getByRole("button", { name: /ekspor/i });
    await expect(eksporBtn.first()).toBeAttached();
    const text = await eksporBtn.first().textContent();
    expect(text).not.toContain("Export");
  });
});

// ── Zero-balance toggle (auth required) ────────────────────────────

test.describe("Zero-balance toggle (auth required)", () => {
  test("toggle label exists in Indonesian", async ({ authPage }) => {
    await gotoBalanceSheet(authPage);
    const toggle = authPage
      .locator("label")
      .filter({ hasText: /tampilkan akun saldo nol/i });
    await expect(toggle.first()).toBeAttached();
  });

  test("toggle is a checkbox", async ({ authPage }) => {
    await gotoBalanceSheet(authPage);
    await expect(authPage.locator("input[type='checkbox']").first()).toBeAttached();
  });
});

// ── Table semantics (auth required, desktop) ───────────────────────

test.describe("Desktop table semantics (auth required)", () => {
  test("table has caption", async ({ authPage }) => {
    await gotoBalanceSheet(authPage);
    const captions = authPage.locator("table caption");
    await expect(captions.first()).toBeAttached();
    const count = await captions.count();
    for (let i = 0; i < count; i++) {
      await expect(captions.nth(i)).toHaveClass(/sr-only/);
    }
  });

  test("headers have scope=col", async ({ authPage }) => {
    await gotoBalanceSheet(authPage);
    const scopedHeaders = authPage.locator("th[scope]");
    await expect(scopedHeaders.first()).toBeAttached();
    const count = await scopedHeaders.count();
    expect(count).toBeGreaterThanOrEqual(2);
  });
});

// ── Section structure (auth required) ──────────────────────────────

test.describe("Section structure (auth required)", () => {
  test("has Aset section", async ({ authPage }) => {
    await gotoBalanceSheet(authPage);
    const aset = authPage.getByText("Aset").first();
    await expect(aset).toBeAttached();
  });

  test("has Kewajiban section", async ({ authPage }) => {
    await gotoBalanceSheet(authPage);
    const kewajiban = authPage.getByText("Kewajiban").first();
    await expect(kewajiban).toBeAttached();
  });

  test("has Ekuitas section", async ({ authPage }) => {
    await gotoBalanceSheet(authPage);
    const ekuitas = authPage.getByText("Ekuitas").first();
    await expect(ekuitas).toBeAttached();
  });

  test("shows Total Aset", async ({ authPage }) => {
    await gotoBalanceSheet(authPage);
    const totalAset = authPage.getByText("Total Aset").first();
    await expect(totalAset).toBeAttached();
  });

  test("shows Total Kewajiban", async ({ authPage }) => {
    await gotoBalanceSheet(authPage);
    const totalKewajiban = authPage.getByText("Total Kewajiban").first();
    await expect(totalKewajiban).toBeAttached();
  });

  test("shows Total Ekuitas", async ({ authPage }) => {
    await gotoBalanceSheet(authPage);
    const totalEkuitas = authPage.getByText("Total Ekuitas").first();
    await expect(totalEkuitas).toBeAttached();
  });
});

// ── Equation status (auth required) ────────────────────────────────

test.describe("Equation status (auth required)", () => {
  test("shows balance equation", async ({ authPage }) => {
    await gotoBalanceSheet(authPage);
    const balanced = authPage.getByText(/neraca seimbang|neraca tidak seimbang/i).first();
    await expect(balanced).toBeAttached();
  });
});

// ── Responsive viewports ───────────────────────────────────────────

const viewports = [
  { name: "Mobile 320", width: 320, height: 800 },
  { name: "Mobile 375", width: 375, height: 812 },
  { name: "Mobile 430", width: 430, height: 932 },
  { name: "Tablet 768", width: 768, height: 1024 },
  { name: "Desktop 1280", width: 1280, height: 800 },
  { name: "Desktop 1440", width: 1440, height: 900 },
  { name: "Desktop 1920", width: 1920, height: 1080 },
];

for (const vp of viewports) {
  test.describe(`Responsive: ${vp.name} (${vp.width}px)`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    test("no horizontal overflow", async ({ authPage }) => {
    await gotoBalanceSheet(authPage);
      await authPage.goto("/reports/balance-sheet");
      await authPage.waitForLoadState("networkidle");
      expect(
        await authPage.evaluate(() => document.body.scrollWidth > window.innerWidth),
      ).toBeFalsy();
    });
  });
}
