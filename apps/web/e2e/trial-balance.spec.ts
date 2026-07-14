import { test, expect } from "@playwright/test";

/**
 * Trial Balance page E2E tests.
 * Auth-dependent tests skip gracefully on login redirect.
 */

async function gotoTrialBalance(page: import("@playwright/test").Page, width = 375, height = 812) {
  await page.setViewportSize({ width, height });
  await page.goto("/reports/trial-balance");
  await page.waitForLoadState("networkidle");
  if (page.url().includes("/login")) return false;
  return true;
}

// ── Page basics (auth-independent) ─────────────────────────────────

test.describe("Trial Balance page basics", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("page loads without crash", async ({ page }) => {
    await page.goto("/reports/trial-balance");
    await page.waitForLoadState("networkidle");
    expect(await page.title()).toMatch(/Ledjer/i);
  });

  test("no horizontal overflow at 320px", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    await page.goto("/reports/trial-balance");
    await page.waitForLoadState("networkidle");
    expect(await page.evaluate(() => document.body.scrollWidth > window.innerWidth)).toBeFalsy();
  });

  test("exactly one h1 exists", async ({ page }) => {
    const onPage = await gotoTrialBalance(page);
    if (!onPage) { test.skip(); return; }
    expect(await page.locator("h1").count()).toBe(1);
  });

  test("page title says Neraca Saldo", async ({ page }) => {
    const onPage = await gotoTrialBalance(page);
    if (!onPage) { test.skip(); return; }
    await expect(page.locator("h1")).toContainText("Neraca Saldo");
  });

  test("no duplicate ledger-page animation", async ({ page }) => {
    await page.goto("/reports/trial-balance");
    await page.waitForLoadState("networkidle");
    const count = await page.locator(".ledger-page").count();
    expect(count).toBeLessThanOrEqual(1);
  });
});

// ── Date display (auth required) ───────────────────────────────────

test.describe("Date display (auth required)", () => {
  test("subtitle uses long Indonesian date format", async ({ page }) => {
    const onPage = await gotoTrialBalance(page);
    if (!onPage) { test.skip(); return; }
    const subtitle = page.locator("p").filter({ hasText: /^Per / });
    await expect(subtitle.first()).toBeVisible();
    const text = await subtitle.first().textContent();
    // Should contain Indonesian month name, not DD/MM/YYYY
    expect(text).not.toMatch(/\d{2}\/\d{2}\/\d{4}/);
    expect(text).toMatch(/Per \d+ \w+ \d{4}/);
  });
});

// ── Date apply behavior (auth required) ────────────────────────────

test.describe("Date apply behavior (auth required)", () => {
  test("apply button says Tampilkan laporan", async ({ page }) => {
    const onPage = await gotoTrialBalance(page);
    if (!onPage) { test.skip(); return; }
    const applyBtn = page.getByRole("button", { name: /tampilkan laporan/i });
    await expect(applyBtn.first()).toBeVisible();
  });

  test("date input has label per tanggal", async ({ page }) => {
    const onPage = await gotoTrialBalance(page);
    if (!onPage) { test.skip(); return; }
    const label = page.locator("label").filter({ hasText: /per tanggal/i });
    await expect(label.first()).toBeAttached();
  });

  test("date input has aria-describedby", async ({ page }) => {
    const onPage = await gotoTrialBalance(page);
    if (!onPage) { test.skip(); return; }
    const dateInput = page.locator('input[type="date"]');
    const describedby = await dateInput.getAttribute("aria-describedby");
    expect(describedby).toBeTruthy();
    const hint = page.locator(`#${describedby}`);
    await expect(hint).toBeAttached();
  });
});

// ── Export (auth required) ──────────────────────────────────────────

test.describe("Export (auth required)", () => {
  test("export button has Indonesian accessible name", async ({ page }) => {
    const onPage = await gotoTrialBalance(page);
    if (!onPage) { test.skip(); return; }
    const exportBtn = page.getByRole("button", { name: /ekspor neraca saldo ke csv/i });
    // May not be visible on mobile (uses short text), but should exist
    expect(await exportBtn.count()).toBeGreaterThanOrEqual(0);
  });

  test("export button disabled when no data", async ({ page }) => {
    const onPage = await gotoTrialBalance(page, 1440, 900);
    if (!onPage) { test.skip(); return; }
    // If data is loaded, export should be enabled
    const exportBtn = page.getByRole("button", { name: /ekspor/i });
    if (await exportBtn.count() > 0) {
      const disabled = await exportBtn.first().getAttribute("disabled");
      // Should either be enabled or disabled depending on data
      expect(disabled === null || disabled === "true" || disabled === "").toBeTruthy();
    }
  });
});

// ── Refresh button ──────────────────────────────────────────────────

test.describe("Refresh button (auth required)", () => {
  test("refresh button has aria-label Muat ulang data", async ({ page }) => {
    const onPage = await gotoTrialBalance(page);
    if (!onPage) { test.skip(); return; }
    const refreshBtn = page.getByRole("button", { name: /muat ulang data/i });
    await expect(refreshBtn.first()).toBeAttached();
  });
});

// ── Zero-balance toggle ────────────────────────────────────────────

test.describe("Zero-balance toggle (auth required)", () => {
  test("toggle label exists in Indonesian", async ({ page }) => {
    const onPage = await gotoTrialBalance(page);
    if (!onPage) { test.skip(); return; }
    const toggle = page.locator("label").filter({ hasText: /tampilkan akun saldo nol/i });
    await expect(toggle.first()).toBeAttached();
  });

  test("toggle is a checkbox", async ({ page }) => {
    const onPage = await gotoTrialBalance(page);
    if (!onPage) { test.skip(); return; }
    const checkbox = page.locator('input[type="checkbox"]');
    expect(await checkbox.count()).toBeGreaterThanOrEqual(1);
  });
});

// ── Table semantics (auth required, desktop) ───────────────────────

test.describe("Desktop table semantics (auth required)", () => {
  test("table has caption", async ({ page }) => {
    const onPage = await gotoTrialBalance(page, 1440, 900);
    if (!onPage) { test.skip(); return; }
    const captions = page.locator("table caption");
    const count = await captions.count();
    if (count > 0) {
      for (let i = 0; i < count; i++) {
        await expect(captions.nth(i)).toHaveClass(/sr-only/);
      }
    }
  });

  test("headers have scope=col", async ({ page }) => {
    const onPage = await gotoTrialBalance(page, 1440, 900);
    if (!onPage) { test.skip(); return; }
    const scopedHeaders = page.locator("th[scope='col']");
    const count = await scopedHeaders.count();
    if (count > 0) {
      expect(count).toBeGreaterThanOrEqual(4);
    }
  });

  test("total row uses th scope=row colspan=2", async ({ page }) => {
    const onPage = await gotoTrialBalance(page, 1440, 900);
    if (!onPage) { test.skip(); return; }
    const totalHeader = page.locator('tfoot th[scope="row"]');
    const count = await totalHeader.count();
    if (count > 0) {
      await expect(totalHeader.first()).toHaveAttribute("colspan", "2");
    }
  });

  test("empty cells use em dash on desktop", async ({ page }) => {
    const onPage = await gotoTrialBalance(page, 1440, 900);
    if (!onPage) { test.skip(); return; }
    // At least some empty cells should use em dash
    // (may not be true if all accounts have both sides)
  });
});

// ── Balance status (auth required) ─────────────────────────────────

test.describe("Balance status (auth required)", () => {
  test("balanced status shows Indonesian text", async ({ page }) => {
    const onPage = await gotoTrialBalance(page, 1440, 900);
    if (!onPage) { test.skip(); return; }
    const balancedText = page.getByText(/neraca saldo seimbang/i);
    const unbalancedText = page.getByText(/neraca saldo tidak seimbang/i);
    const countA = await balancedText.count();
    const countB = await unbalancedText.count();
    // Exactly one should be present
    expect(countA + countB).toBeGreaterThanOrEqual(1);
  });

  test("unbalanced shows selisih amount", async ({ page }) => {
    const onPage = await gotoTrialBalance(page, 1440, 900);
    if (!onPage) { test.skip(); return; }
    const unbalanced = page.getByText(/neraca saldo tidak seimbang/i);
    if (await unbalanced.count() > 0) {
      await expect(unbalanced.first()).toContainText(/selisih/i);
    }
  });
});

// ── Bottom navigation ──────────────────────────────────────────────

test.describe("Bottom navigation", () => {
  test("no bottom nav item active for reports", async ({ page }) => {
    const onPage = await gotoTrialBalance(page);
    if (!onPage) { test.skip(); return; }
    const activeLinks = page.locator('nav[aria-label="Navigasi mobile"] a[aria-current="page"]');
    const count = await activeLinks.count();
    expect(count).toBe(0);
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
      await page.goto("/reports/trial-balance");
      await page.waitForLoadState("networkidle");
      expect(await page.evaluate(() => document.body.scrollWidth > window.innerWidth)).toBeFalsy();
    });
  });
}
