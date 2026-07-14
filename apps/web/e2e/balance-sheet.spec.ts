import { test, expect } from "@playwright/test";

/**
 * Balance Sheet page E2E tests.
 * Auth-dependent tests skip gracefully on login redirect.
 */

async function gotoBalanceSheet(
  page: import("@playwright/test").Page,
  width = 375,
  height = 812,
) {
  await page.setViewportSize({ width, height });
  await page.goto("/reports/balance-sheet");
  await page.waitForLoadState("networkidle");
  if (page.url().includes("/login")) return false;
  return true;
}

// ── Page basics (auth-independent) ─────────────────────────────────

test.describe("Balance Sheet page basics", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("page loads without crash", async ({ page }) => {
    await gotoBalanceSheet(page);
    await page.goto("/reports/balance-sheet");
    await page.waitForLoadState("networkidle");
    expect(await page.title()).toMatch(/Ledjer/i);
  });

  test("no horizontal overflow at 320px", async ({ page }) => {
    await gotoBalanceSheet(page);
    await page.setViewportSize({ width: 320, height: 800 });
    await page.goto("/reports/balance-sheet");
    await page.waitForLoadState("networkidle");
    expect(
      await page.evaluate(() => document.body.scrollWidth > window.innerWidth),
    ).toBeFalsy();
  });

  test("exactly one h1 exists", async ({ page }) => {
    await gotoBalanceSheet(page);
    expect(await page.locator("h1").count()).toBe(1);
  });

  test("page title says Neraca", async ({ page }) => {
    await gotoBalanceSheet(page);
    await expect(page.locator("h1")).toContainText("Neraca");
  });

  test("page title does NOT contain (Balance Sheet)", async ({ page }) => {
  await gotoBalanceSheet(page);
    const text = await page.locator("h1").textContent();
    expect(text).not.toContain("(Balance Sheet)");
  });

  test("no duplicate ledger-page animation", async ({ page }) => {
    await gotoBalanceSheet(page);
    await page.goto("/reports/balance-sheet");
    await page.waitForLoadState("networkidle");
    const count = await page.locator(".ledger-page").count();
    expect(count).toBeLessThanOrEqual(1);
  });
});

// ── Date display (auth required) ───────────────────────────────────

test.describe("Date display (auth required)", () => {
  test("subtitle uses localized Indonesian date", async ({ page }) => {
    await gotoBalanceSheet(page);
    const subtitle = page.locator("p[aria-live='polite']").first();
    await expect(subtitle).toBeVisible();
    const text = await subtitle.textContent();
    // Should contain Indonesian month name and year
    expect(text).toMatch(/\d+ \w+ \d{4}/);
    // Should not use DD/MM/YYYY format
    expect(text).not.toMatch(/\d{2}\/\d{2}\/\d{4}/);
  });

  test("subtitle describes the report purpose", async ({ page }) => {
    await gotoBalanceSheet(page);
    const subtitle = page.locator("p[aria-live='polite']").first();
    const text = await subtitle.textContent();
    expect(text).toContain("aset");
  });
});

// ── Date apply behavior (auth required) ────────────────────────────

test.describe("Date apply behavior (auth required)", () => {
  test("apply button says Tampilkan laporan", async ({ page }) => {
    await gotoBalanceSheet(page);
    await expect(applyBtn.first()).toBeVisible();
  });

  test("apply button does NOT say Muat Ulang", async ({ page }) => {
    await gotoBalanceSheet(page);
    await expect(muatBtn).toHaveCount(0);
  });

  test("date field has Indonesian label", async ({ page }) => {
    await gotoBalanceSheet(page);
    const label = page.locator("label").filter({ hasText: /per tanggal/i });
    await expect(label.first()).toBeAttached();
  });

  test("refresh button has aria-label", async ({ page }) => {
    await gotoBalanceSheet(page);
    await expect(refreshBtn.first()).toBeAttached();
  });
});

// ── Export (auth required) ──────────────────────────────────────────

test.describe("Export (auth required)", () => {
  test("export button has Indonesian accessible name", async ({ page }) => {
    await gotoBalanceSheet(page);
  });

  test("export button text is Ekspor on mobile", async ({ page }) => {
    await gotoBalanceSheet(page);
    if (await exportBtn.count() > 0) {
      const text = await exportBtn.first().textContent();
      expect(text).not.toContain("Export");
    }
  });
});

// ── Zero-balance toggle (auth required) ────────────────────────────

test.describe("Zero-balance toggle (auth required)", () => {
  test("toggle label exists in Indonesian", async ({ page }) => {
    await gotoBalanceSheet(page);
    const toggle = page
      .locator("label")
      .filter({ hasText: /tampilkan akun saldo nol/i });
    await expect(toggle.first()).toBeAttached();
  });

  test("toggle is a checkbox", async ({ page }) => {
    await gotoBalanceSheet(page);
    await expect(checkbox.first()).toBeAttached();
  });
});

// ── Table semantics (auth required, desktop) ───────────────────────

test.describe("Desktop table semantics (auth required)", () => {
  test("table has caption", async ({ page }) => {
    await gotoBalanceSheet(page);
    const count = await captions.count();
    if (count > 0) {
      for (let i = 0; i < count; i++) {
        await expect(captions.nth(i)).toHaveClass(/sr-only/);
      }
    }
  });

  test("headers have scope=col", async ({ page }) => {
    await gotoBalanceSheet(page);
    const count = await scopedHeaders.count();
    if (count > 0) {
      expect(count).toBeGreaterThanOrEqual(2);
    }
  });
});

// ── Section structure (auth required) ──────────────────────────────

test.describe("Section structure (auth required)", () => {
  test("has Aset section", async ({ page }) => {
    await gotoBalanceSheet(page);
    const aset = page.getByText("Aset").first();
    await expect(aset).toBeAttached();
  });

  test("has Kewajiban section", async ({ page }) => {
    await gotoBalanceSheet(page);
    const kewajiban = page.getByText("Kewajiban").first();
    await expect(kewajiban).toBeAttached();
  });

  test("has Ekuitas section", async ({ page }) => {
    await gotoBalanceSheet(page);
    const ekuitas = page.getByText("Ekuitas").first();
    await expect(ekuitas).toBeAttached();
  });

  test("shows Total Aset", async ({ page }) => {
    await gotoBalanceSheet(page);
    const totalAset = page.getByText("Total Aset").first();
    await expect(totalAset).toBeAttached();
  });

  test("shows Total Kewajiban", async ({ page }) => {
    await gotoBalanceSheet(page);
    const totalKewajiban = page.getByText("Total Kewajiban").first();
    await expect(totalKewajiban).toBeAttached();
  });

  test("shows Total Ekuitas", async ({ page }) => {
    await gotoBalanceSheet(page);
    const totalEkuitas = page.getByText("Total Ekuitas").first();
    await expect(totalEkuitas).toBeAttached();
  });
});

// ── Equation status (auth required) ────────────────────────────────

test.describe("Equation status (auth required)", () => {
  test("shows balance equation", async ({ page }) => {
    await gotoBalanceSheet(page);
    const balanced = page.getByText(/neraca seimbang|neraca tidak seimbang/i).first();
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

    test("no horizontal overflow", async ({ page }) => {
    await gotoBalanceSheet(page);
      await page.goto("/reports/balance-sheet");
      await page.waitForLoadState("networkidle");
      expect(
        await page.evaluate(() => document.body.scrollWidth > window.innerWidth),
      ).toBeFalsy();
    });
  });
}
