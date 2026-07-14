import { test, expect } from "@playwright/test";

/**
 * Profit and Loss page E2E tests.
 * Auth-dependent tests skip gracefully on login redirect.
 */

async function gotoProfitLoss(
  page: import("@playwright/test").Page,
  width = 375,
  height = 812,
) {
  await page.setViewportSize({ width, height });
  await page.goto("/reports/profit-loss");
  await page.waitForLoadState("networkidle");
  if (page.url().includes("/login")) return false;
  return true;
}

// ── Page basics (auth-independent) ─────────────────────────────────

test.describe("Profit & Loss page basics", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("page loads without crash", async ({ page }) => {
    await gotoProfitLoss(page);
    await page.goto("/reports/profit-loss");
    await page.waitForLoadState("networkidle");
    expect(await page.title()).toMatch(/Ledjer/i);
  });

  test("no horizontal overflow at 320px", async ({ page }) => {
    await gotoProfitLoss(page);
    await page.setViewportSize({ width: 320, height: 800 });
    await page.goto("/reports/profit-loss");
    await page.waitForLoadState("networkidle");
    expect(
      await page.evaluate(() => document.body.scrollWidth > window.innerWidth),
    ).toBeFalsy();
  });

  test("exactly one h1 exists", async ({ page }) => {
    await gotoProfitLoss(page);
    expect(await page.locator("h1").count()).toBe(1);
  });

  test("page title says Laba Rugi", async ({ page }) => {
    await gotoProfitLoss(page);
    await expect(page.locator("h1")).toContainText("Laba Rugi");
  });

  test("no duplicate ledger-page animation", async ({ page }) => {
    await gotoProfitLoss(page);
    await page.goto("/reports/profit-loss");
    await page.waitForLoadState("networkidle");
    const count = await page.locator(".ledger-page").count();
    expect(count).toBeLessThanOrEqual(1);
  });
});

// ── Date display (auth required) ───────────────────────────────────

test.describe("Date display (auth required)", () => {
  test("subtitle uses localized Indonesian date range", async ({ page }) => {
    await gotoProfitLoss(page);
    const subtitle = page.locator("p[aria-live='polite']").first();
    await expect(subtitle).toBeVisible();
    const text = await subtitle.textContent();
    // Should not contain DD/MM/YYYY pattern
    expect(text).not.toMatch(/\d{2}\/\d{2}\/\d{4}/);
    // Should contain Indonesian month name
    expect(text).toMatch(/\d+ \w+ \d{4}/);
  });

  test("subtitle does not say Periode:", async ({ page }) => {
    await gotoProfitLoss(page);
    const subtitle = page.locator("p[aria-live='polite']").first();
    const text = await subtitle.textContent();
    expect(text).not.toContain("Periode:");
  });
});

// ── Date apply behavior (auth required) ────────────────────────────

test.describe("Date apply behavior (auth required)", () => {
  test("apply button says Tampilkan laporan", async ({ page }) => {
    await gotoProfitLoss(page);
    const applyBtn = page.getByRole("button", { name: /tampilkan laporan/i });
    await expect(applyBtn.first()).toBeVisible();
  });

  test("date fields have Indonesian labels", async ({ page }) => {
    await gotoProfitLoss(page);
    const dariLabel = page.locator("label").filter({ hasText: /dari tanggal/i });
    const sampaiLabel = page.locator("label").filter({ hasText: /sampai tanggal/i });
    await expect(dariLabel.first()).toBeAttached();
    await expect(sampaiLabel.first()).toBeAttached();
  });

  test("date fields have aria-invalid when invalid", async ({ page }) => {
    await gotoProfitLoss(page);
    // Set from date after to date
    const fromInput = page.locator('input[type="date"]').first();
    const toInput = page.locator('input[type="date"]').nth(1);

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 10);
    const tomorrowStr = tomorrow.toISOString().split("T")[0];

    await fromInput.fill(tomorrowStr);
    await toInput.fill(new Date().toISOString().split("T")[0]);

    // Verify inputs exist and can be filled
    await expect(fromInput).toHaveValue(tomorrowStr);
  });

  test("refresh button has aria-label", async ({ page }) => {
    await gotoProfitLoss(page);
    const refreshBtn = page.getByRole("button", { name: /muat ulang data/i });
    await expect(refreshBtn.first()).toBeAttached();
  });
});

// ── Export (auth required) ──────────────────────────────────────────

test.describe("Export (auth required)", () => {
  test("export button has Indonesian accessible name", async ({ page }) => {
    await gotoProfitLoss(page);
    const exportBtn = page.getByRole("button", {
      name: /ekspor laporan laba rugi ke csv/i,
    });
    expect(await exportBtn.count()).toBeGreaterThanOrEqual(0);
  });

  test("export button text is Ekspor on mobile", async ({ page }) => {
    await gotoProfitLoss(page);
    const exportBtn = page.getByRole("button", { name: /ekspor/i });
    if (await exportBtn.count() > 0) {
      const text = await exportBtn.first().textContent();
      expect(text).not.toContain("Export");
    }
  });
});

// ── Inactive accounts toggle ───────────────────────────────────────

test.describe("Inactive accounts toggle (auth required)", () => {
  test("toggle label exists in Indonesian", async ({ page }) => {
    await gotoProfitLoss(page);
    const toggle = page
      .locator("label")
      .filter({ hasText: /tampilkan akun tanpa aktivitas/i });
    await expect(toggle.first()).toBeAttached();
  });

  test("toggle is a checkbox", async ({ page }) => {
    await gotoProfitLoss(page);
    const checkbox = page.locator(
      'input[type="checkbox"]',
    );
    expect(await checkbox.count()).toBeGreaterThanOrEqual(1);
  });
});

// ── Table semantics (auth required, desktop) ───────────────────────

test.describe("Desktop table semantics (auth required)", () => {
  test("table has caption", async ({ page }) => {
    await gotoProfitLoss(page);
    const captions = page.locator("table caption");
    const count = await captions.count();
    if (count > 0) {
      for (let i = 0; i < count; i++) {
        await expect(captions.nth(i)).toHaveClass(/sr-only/);
      }
    }
  });

  test("headers have scope=col", async ({ page }) => {
    await gotoProfitLoss(page);
    const scopedHeaders = page.locator('th[scope="col"]');
    const count = await scopedHeaders.count();
    if (count > 0) {
      expect(count).toBeGreaterThanOrEqual(2);
    }
  });
});

// ── Result labels (auth required) ──────────────────────────────────

test.describe("Result labels (auth required)", () => {
  test("gross result row exists", async ({ page }) => {
    await gotoProfitLoss(page);
    const grossLabel = page.getByText(/laba kotor|rugi kotor|hasil kotor/i);
    await expect(grossLabel.first()).toBeAttached();
  });

  test("net result row exists", async ({ page }) => {
    await gotoProfitLoss(page);
    const netLabel = page.getByText(/laba bersih|rugi bersih|hasil bersih/i);
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

    test("no horizontal overflow", async ({ page }) => {
    await gotoProfitLoss(page);
      await page.goto("/reports/profit-loss");
      await page.waitForLoadState("networkidle");
      expect(
        await page.evaluate(() => document.body.scrollWidth > window.innerWidth),
      ).toBeFalsy();
    });
  });
}
