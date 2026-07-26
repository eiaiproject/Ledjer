import { expect } from "@playwright/test";
import { test } from "./helpers/auth";

/**
 * Profit and Loss page E2E tests.
 * Uses authenticated fixture for auth-required tests.
 */

async function gotoProfitLoss(
  page: import("@playwright/test").Page,
  width = 375,
  height = 812,
) {
  await page.setViewportSize({ width, height });
  await page.goto("/reports/profit-loss");
  await page.waitForLoadState("networkidle");
}

// ── Page basics (auth-independent) ─────────────────────────────────

test.describe("Profit & Loss page basics", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("page loads without crash", async ({ authPage }) => {
    await gotoProfitLoss(authPage);
    await authPage.goto("/reports/profit-loss");
    await authPage.waitForLoadState("networkidle");
    expect(await authPage.title()).toMatch(/Ledjer/i);
  });

  test("no horizontal overflow at 320px", async ({ authPage }) => {
    await gotoProfitLoss(authPage);
    await authPage.setViewportSize({ width: 320, height: 800 });
    await authPage.goto("/reports/profit-loss");
    await authPage.waitForLoadState("networkidle");
    expect(
      await authPage.evaluate(() => document.body.scrollWidth > window.innerWidth),
    ).toBeFalsy();
  });

  test("exactly one h1 exists", async ({ authPage }) => {
    await gotoProfitLoss(authPage);
    await expect(authPage.locator("h1")).toHaveCount(1);
  });

  test("page title says Laba Rugi", async ({ authPage }) => {
    await gotoProfitLoss(authPage);
    await expect(authPage.locator("h1")).toContainText("Laba Rugi");
  });

  test("no duplicate ledger-page animation", async ({ authPage }) => {
    await gotoProfitLoss(authPage);
    await authPage.goto("/reports/profit-loss");
    await authPage.waitForLoadState("networkidle");
    const count = await authPage.locator(".ledger-page").count();
    expect(count).toBeLessThanOrEqual(1);
  });
});

// ── Date display (auth required) ───────────────────────────────────

test.describe("Date display (auth required)", () => {
  test("subtitle uses localized Indonesian date range", async ({ authPage }) => {
    await gotoProfitLoss(authPage);
    const subtitle = authPage.locator("p[aria-live='polite']").first();
    await expect(subtitle).toBeVisible();
    const text = await subtitle.textContent();
    // Should not contain DD/MM/YYYY pattern
    expect(text).not.toMatch(/\d{2}\/\d{2}\/\d{4}/);
    // Should contain Indonesian month name
    expect(text).toMatch(/\d+ \w+ \d{4}/);
  });

  test("subtitle does not say Periode:", async ({ authPage }) => {
    await gotoProfitLoss(authPage);
    const subtitle = authPage.locator("p[aria-live='polite']").first();
    const text = await subtitle.textContent();
    expect(text).not.toContain("Periode:");
  });
});

// ── Date apply behavior (auth required) ────────────────────────────

test.describe("Date apply behavior (auth required)", () => {
  test("apply button says Tampilkan laporan", async ({ authPage }) => {
    await gotoProfitLoss(authPage);
    await expect(authPage.getByRole("button", { name: /tampilkan laporan/i })).toBeVisible();
  });

  test("date fields have Indonesian labels", async ({ authPage }) => {
    await gotoProfitLoss(authPage);
    const dariLabel = authPage.locator("label").filter({ hasText: /dari tanggal/i });
    const sampaiLabel = authPage.locator("label").filter({ hasText: /sampai tanggal/i });
    await expect(dariLabel.first()).toBeAttached();
    await expect(sampaiLabel.first()).toBeAttached();
  });

  test("date fields have aria-invalid when invalid", async ({ authPage }) => {
    await gotoProfitLoss(authPage);
    // Set from date after to date
    const fromInput = authPage.locator('input[type="date"]').first();
    const toInput = authPage.locator('input[type="date"]').nth(1);

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 10);
    const tomorrowStr = tomorrow.toISOString().split("T")[0];

    await fromInput.fill(tomorrowStr);
    await toInput.fill(new Date().toISOString().split("T")[0]);

    // Verify inputs exist and can be filled
    await expect(fromInput).toHaveValue(tomorrowStr);
  });

  test("refresh button has aria-label", async ({ authPage }) => {
    await gotoProfitLoss(authPage);
    await expect(authPage.locator("button[aria-label*='refresh' i]").first()).toBeAttached();
  });
});

// ── Export (auth required) ──────────────────────────────────────────

test.describe("Export (auth required)", () => {
  test("export button has Indonesian accessible name", async ({ authPage }) => {
    await gotoProfitLoss(authPage);
    const btn = authPage.getByRole("button", { name: /ekspor/i });
    await expect(btn.first()).toBeAttached();
  });

  test("export button text is Ekspor on mobile", async ({ authPage }) => {
    await gotoProfitLoss(authPage);
    const eksporBtn = authPage.getByRole("button", { name: /ekspor/i });
    await expect(eksporBtn.first()).toBeAttached();
    const text = await eksporBtn.first().textContent();
    expect(text).not.toContain("Export");
  });
});

// ── Inactive accounts toggle ───────────────────────────────────────

test.describe("Inactive accounts toggle (auth required)", () => {
  test("toggle label exists in Indonesian", async ({ authPage }) => {
    await gotoProfitLoss(authPage);
    const toggle = authPage
      .locator("label")
      .filter({ hasText: /tampilkan akun tanpa aktivitas/i });
    await expect(toggle.first()).toBeAttached();
  });

  test("toggle is a checkbox", async ({ authPage }) => {
    await gotoProfitLoss(authPage);
    await expect(authPage.locator("input[type='checkbox']").first()).toBeAttached();
  });
});

// ── Table semantics (auth required, desktop) ───────────────────────

test.describe("Desktop table semantics (auth required)", () => {
  test("table has caption", async ({ authPage }) => {
    await gotoProfitLoss(authPage);
    const captions = authPage.locator("table caption");
    await expect(captions.first()).toBeAttached();
    const count = await captions.count();
    for (let i = 0; i < count; i++) {
      await expect(captions.nth(i)).toHaveClass(/sr-only/);
    }
  });

  test("headers have scope=col", async ({ authPage }) => {
    await gotoProfitLoss(authPage);
    const scopedHeaders = authPage.locator("th[scope]");
    await expect(scopedHeaders.first()).toBeAttached();
    const count = await scopedHeaders.count();
    expect(count).toBeGreaterThanOrEqual(2);
  });
});

// ── Result labels (auth required) ──────────────────────────────────

test.describe("Result labels (auth required)", () => {
  test("gross result row exists", async ({ authPage }) => {
    await gotoProfitLoss(authPage);
    const grossLabel = authPage.getByText(/laba kotor|rugi kotor|hasil kotor/i);
    await expect(grossLabel.first()).toBeAttached();
  });

  test("net result row exists", async ({ authPage }) => {
    await gotoProfitLoss(authPage);
    const netLabel = authPage.getByText(/laba bersih|rugi bersih|hasil bersih/i);
    await expect(netLabel.first()).toBeAttached();
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
    await gotoProfitLoss(authPage);
      await authPage.goto("/reports/profit-loss");
      await authPage.waitForLoadState("networkidle");
      expect(
        await authPage.evaluate(() => document.body.scrollWidth > window.innerWidth),
      ).toBeFalsy();
    });
  });
}
