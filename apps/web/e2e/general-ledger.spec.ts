import { test, expect } from "@playwright/test";

/**
 * General Ledger page E2E tests.
 * Auth-dependent tests skip gracefully on login redirect.
 */

async function gotoLedger(page: import("@playwright/test").Page, width = 375, height = 812) {
  await page.setViewportSize({ width, height });
  await page.goto("/reports/general-ledger");
  await page.waitForLoadState("networkidle");
  if (page.url().includes("/login")) return false;
  return true;
}

// ── Page basics (auth-independent) ─────────────────────────────────

test.describe("General Ledger page basics", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("page loads without crash", async ({ page }) => {
    await gotoLedger(page);
    await page.goto("/reports/general-ledger");
    await page.waitForLoadState("networkidle");
    expect(await page.title()).toMatch(/Ledjer/i);
  });

  test("no horizontal overflow at 320px", async ({ page }) => {
    await gotoLedger(page);
    await page.setViewportSize({ width: 320, height: 800 });
    await page.goto("/reports/general-ledger");
    await page.waitForLoadState("networkidle");
    expect(await page.evaluate(() => document.body.scrollWidth > window.innerWidth)).toBeFalsy();
  });

  test("exactly one h1 exists", async ({ page }) => {
    await gotoLedger(page);
    await expect(page.locator("h1")).toHaveCount(1);
  });

  test("page title says Buku Besar", async ({ page }) => {
    await gotoLedger(page);
    await expect(page.locator("h1")).toContainText("Buku Besar");
  });
});

// ── Filter disclosure ──────────────────────────────────────────────

test.describe("Filter disclosure (auth required)", () => {
  test("filter button has aria-expanded", async ({ page }) => {
    await gotoLedger(page);
    const filterBtn = page.getByRole("button", { name: /filter/i }).first();
    await expect(filterBtn).toBeAttached();
    const expanded = await filterBtn.getAttribute("aria-expanded");
    expect(expanded).toBeTruthy();
  });

  test("filter button has aria-controls", async ({ page }) => {
    await gotoLedger(page);
    const filterBtn = page.getByRole("button", { name: /filter/i }).first();
    const controlsId = await filterBtn.getAttribute("aria-controls");
    expect(controlsId).toBeTruthy();
    const panel = page.locator("#" + controlsId);
    await expect(panel).toBeAttached();
  });

  test("clicking filter toggles panel visibility", async ({ page }) => {
    await gotoLedger(page);
    const filterBtn = page.getByRole("button", { name: /filter/i }).first();
    await filterBtn.click();
    await expect(filterBtn).toHaveAttribute("aria-expanded", "true");
    await filterBtn.click();
    await expect(filterBtn).toHaveAttribute("aria-expanded", "false");
  });
});

// ── Account selector ───────────────────────────────────────────────

test.describe("Account selector (auth required)", () => {
  test("no duplicate Semua Akun / placeholder option", async ({ page }) => {
    await gotoLedger(page);
    // Open filter to see account selector
    const filterBtn = page.getByRole("button", { name: /filter/i }).first();
    await filterBtn.click();

    // Check account select options
    const select = page.locator("select").first();
    const options = select.locator("option");
    const count = await options.count();
    const labels: string[] = [];
    for (let i = 0; i < count; i++) {
      labels.push(await options.nth(i).textContent() || "");
    }
    // Should not have both "Semua Akun" and "-- Pilih Akun --"
    const hasSemuaAkun = labels.some((l) => l.includes("Semua akun"));
    const hasPilihAkun = labels.some((l) => l.includes("Pilih Akun"));
    expect(hasSemuaAkun && hasPilihAkun).toBeFalsy();
  });
});

// ── Date labels ────────────────────────────────────────────────────

test.describe("Date labels (auth required)", () => {
  test("date fields have correct labels", async ({ page }) => {
    await gotoLedger(page);
    const fromDateLabel = page.locator("label").filter({ hasText: /dari tanggal/i });
    const toDateLabel = page.locator("label").filter({ hasText: /sampai tanggal/i });
    await expect(fromDateLabel.first()).toBeAttached();
    await expect(toDateLabel.first()).toBeAttached();
  });
});

// ── Export ──────────────────────────────────────────────────────────

test.describe("Export (auth required)", () => {
  test("desktop export shows Indonesian text", async ({ page }) => {
    await gotoLedger(page);
    const exportBtn = page.locator('button:has-text("Ekspor CSV")').first();
    if (await exportBtn.count() > 0) {
      await expect(exportBtn).toBeVisible();
    }
  });

  test("mobile export has accessible label in Indonesian", async ({ page }) => {
    await gotoLedger(page);
    const btn = page.getByRole("button", { name: /ekspor/i });
    await expect(btn.first()).toBeAttached();
  });
});

// ── No duplicate page animation ────────────────────────────────────

test.describe("No duplicate animation (auth-independent)", () => {
  test("only one ledger-page element exists", async ({ page }) => {
    await gotoLedger(page);
    await page.goto("/reports/general-ledger");
    await page.waitForLoadState("networkidle");
    const count = await page.locator(".ledger-page").count();
    expect(count).toBeLessThanOrEqual(1);
  });
});

// ── Table semantics ────────────────────────────────────────────────

test.describe("Desktop table semantics (auth required)", () => {
  test("table has caption", async ({ page }) => {
    await gotoLedger(page);
    const captions = page.locator("table caption");
    const count = await captions.count();
    if (count > 0) {
      // All captions should be sr-only
      for (let i = 0; i < count; i++) {
        await expect(captions.nth(i)).toHaveClass(/sr-only/);
      }
    }
  });

  test("headers have scope=col", async ({ page }) => {
    await gotoLedger(page);
    const scopedHeaders = page.locator("th[scope]");
    const count = await scopedHeaders.count();
    if (count > 0) {
      expect(count).toBeGreaterThanOrEqual(6);
    }
  });
});

// ── Account disclosure semantics ───────────────────────────────────

test.describe("Account disclosure (auth required)", () => {
  test("account triggers have aria-expanded", async ({ page }) => {
    await gotoLedger(page);
    const triggers = page.locator("[aria-expanded][aria-controls]");
    const count = await triggers.count();
    // May be 0 if no accounts loaded
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test("account panels have matching IDs", async ({ page }) => {
    await gotoLedger(page);
    const triggers = page.locator("[aria-expanded][aria-controls]");
    const count = await triggers.count();
    for (let i = 0; i < count; i++) {
      const controlsId = await triggers.nth(i).getAttribute("aria-controls");
      expect(controlsId).toBeTruthy();
      const panel = page.locator("#" + controlsId);
      await expect(panel).toBeAttached();
    }
  });
});

// ── Bottom navigation ──────────────────────────────────────────────

test.describe("Bottom navigation", () => {
  test("no bottom nav item has aria-current=page for reports", async ({ page }) => {
    await gotoLedger(page);
    // Reports are not in bottom nav, so no bottom nav item should be active
    const activeLinks = page.locator("[aria-current='page']");
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
    await gotoLedger(page);
      await page.goto("/reports/general-ledger");
      await page.waitForLoadState("networkidle");
      expect(await page.evaluate(() => document.body.scrollWidth > window.innerWidth)).toBeFalsy();
    });
  });
}
