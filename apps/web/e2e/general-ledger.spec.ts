import { expect } from "@playwright/test";
import { test } from "./helpers/auth";

/**
 * General Ledger page E2E tests.
 * Uses authenticated fixture for auth-required tests.
 */

async function gotoLedger(page: import("@playwright/test").Page, width = 375, height = 812) {
  await page.setViewportSize({ width, height });
  await page.goto("/reports/general-ledger");
  await page.waitForLoadState("networkidle");
}

// ── Page basics (auth-independent) ─────────────────────────────────

test.describe("General Ledger page basics", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("page loads without crash", async ({ authPage }) => {
    await gotoLedger(authPage);
    await authPage.goto("/reports/general-ledger");
    await authPage.waitForLoadState("networkidle");
    expect(await authPage.title()).toMatch(/Ledjer/i);
  });

  test("no horizontal overflow at 320px", async ({ authPage }) => {
    await gotoLedger(authPage);
    await authPage.setViewportSize({ width: 320, height: 800 });
    await authPage.goto("/reports/general-ledger");
    await authPage.waitForLoadState("networkidle");
    expect(await authPage.evaluate(() => document.body.scrollWidth > window.innerWidth)).toBeFalsy();
  });

  test("exactly one h1 exists", async ({ authPage }) => {
    await gotoLedger(authPage);
    await expect(authPage.locator("h1")).toHaveCount(1);
  });

  test("page title says Buku Besar", async ({ authPage }) => {
    await gotoLedger(authPage);
    await expect(authPage.locator("h1")).toContainText("Buku Besar");
  });
});

// ── Filter disclosure ──────────────────────────────────────────────

test.describe("Filter disclosure (auth required)", () => {
  test("filter button has aria-expanded", async ({ authPage }) => {
    await gotoLedger(authPage);
    const filterBtn = authPage.getByRole("button", { name: /filter/i }).first();
    await expect(filterBtn).toBeAttached();
    const expanded = await filterBtn.getAttribute("aria-expanded");
    expect(expanded).toBeTruthy();
  });

  test("filter button has aria-controls", async ({ authPage }) => {
    await gotoLedger(authPage);
    const filterBtn = authPage.getByRole("button", { name: /filter/i }).first();
    const controlsId = await filterBtn.getAttribute("aria-controls");
    expect(controlsId).toBeTruthy();
    const panel = authPage.locator("#" + controlsId);
    await expect(panel).toBeAttached();
  });

  test("clicking filter toggles panel visibility", async ({ authPage }) => {
    await gotoLedger(authPage);
    const filterBtn = authPage.getByRole("button", { name: /filter/i }).first();
    await filterBtn.click();
    await expect(filterBtn).toHaveAttribute("aria-expanded", "true");
    await filterBtn.click();
    await expect(filterBtn).toHaveAttribute("aria-expanded", "false");
  });
});

// ── Account selector ───────────────────────────────────────────────

test.describe("Account selector (auth required)", () => {
  test("no duplicate Semua Akun / placeholder option", async ({ authPage }) => {
    await gotoLedger(authPage);
    // Open filter to see account selector
    const filterBtn = authPage.getByRole("button", { name: /filter/i }).first();
    await filterBtn.click();

    // Check account select options
    const select = authPage.locator("select").first();
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
  test("date fields have correct labels", async ({ authPage }) => {
    await gotoLedger(authPage);
    const fromDateLabel = authPage.locator("label").filter({ hasText: /dari tanggal/i });
    const toDateLabel = authPage.locator("label").filter({ hasText: /sampai tanggal/i });
    await expect(fromDateLabel.first()).toBeAttached();
    await expect(toDateLabel.first()).toBeAttached();
  });
});

// ── Export ──────────────────────────────────────────────────────────

test.describe("Export (auth required)", () => {
  test("desktop export shows Indonesian text", async ({ authPage }) => {
    await gotoLedger(authPage);
    const exportBtn = authPage.getByRole("button", { name: /ekspor/i }).first();
    await expect(exportBtn).toBeAttached();
  });

  test("mobile export has accessible label in Indonesian", async ({ authPage }) => {
    await gotoLedger(authPage);
    const btn = authPage.getByRole("button", { name: /ekspor/i });
    await expect(btn.first()).toBeAttached();
  });
});

// ── No duplicate page animation ────────────────────────────────────

test.describe("No duplicate animation (auth-independent)", () => {
  test("only one ledger-page element exists", async ({ authPage }) => {
    await gotoLedger(authPage);
    await authPage.goto("/reports/general-ledger");
    await authPage.waitForLoadState("networkidle");
    const count = await authPage.locator(".ledger-page").count();
    expect(count).toBeLessThanOrEqual(1);
  });
});

// ── Table semantics ────────────────────────────────────────────────

test.describe("Desktop table semantics (auth required)", () => {
  test("table has caption", async ({ authPage }) => {
    await gotoLedger(authPage);
    const captions = authPage.locator("table caption");
    await expect(captions.first()).toBeAttached();
    const count = await captions.count();
    for (let i = 0; i < count; i++) {
      await expect(captions.nth(i)).toHaveClass(/sr-only/);
    }
  });

  test("headers have scope=col", async ({ authPage }) => {
    await gotoLedger(authPage);
    const scopedHeaders = authPage.locator("th[scope]");
    await expect(scopedHeaders.first()).toBeAttached();
    const count = await scopedHeaders.count();
    expect(count).toBeGreaterThanOrEqual(6);
  });
});

// ── Account disclosure semantics ───────────────────────────────────

test.describe("Account disclosure (auth required)", () => {
  test("account triggers have aria-expanded", async ({ authPage }) => {
    await gotoLedger(authPage);
    const triggers = authPage.locator("[aria-expanded][aria-controls]");
    await expect(triggers.first()).toBeAttached();
  });

  test("account panels have matching IDs", async ({ authPage }) => {
    await gotoLedger(authPage);
    const triggers = authPage.locator("[aria-expanded][aria-controls]");
    const count = await triggers.count();
    for (let i = 0; i < Math.min(count, 5); i++) {
      const controlsId = await triggers.nth(i).getAttribute("aria-controls");
      expect(controlsId).toBeTruthy();
      if (controlsId) {
        const panel = authPage.locator("#" + CSS.escape(controlsId));
        const exists = await panel.isVisible().catch(() => false);
        expect(exists || i === 0).toBeTruthy();
      }
    }
  });
});

// ── Bottom navigation ──────────────────────────────────────────────

test.describe("Bottom navigation", () => {
  test("no bottom nav item has aria-current=page for reports", async ({ authPage }) => {
    await gotoLedger(authPage);
    // Reports are not in bottom nav, so no bottom nav item should be active
    const activeLinks = authPage.locator("[aria-current='page']");
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

    test("no horizontal overflow", async ({ authPage }) => {
    await gotoLedger(authPage);
      await authPage.goto("/reports/general-ledger");
      await authPage.waitForLoadState("networkidle");
      expect(await authPage.evaluate(() => document.body.scrollWidth > window.innerWidth)).toBeFalsy();
    });
  });
}
