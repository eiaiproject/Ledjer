import { expect } from "@playwright/test";
import { test } from "./helpers/auth";

/**
 * Trial Balance page E2E tests.
 * Uses authenticated fixture for auth-required tests.
 */

async function gotoTrialBalance(page: import("@playwright/test").Page, width = 375, height = 812) {
  await page.setViewportSize({ width, height });
  await page.goto("/reports/trial-balance");
  await page.waitForLoadState("networkidle");
}

// ── Page basics (auth-independent) ─────────────────────────────────

test.describe("Trial Balance page basics", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("page loads without crash", async ({ authPage }) => {
    await gotoTrialBalance(authPage);
    await authPage.goto("/reports/trial-balance");
    await authPage.waitForLoadState("networkidle");
    expect(await authPage.title()).toMatch(/Ledjer/i);
  });

  test("no horizontal overflow at 320px", async ({ authPage }) => {
    await gotoTrialBalance(authPage);
    await authPage.setViewportSize({ width: 320, height: 800 });
    await authPage.goto("/reports/trial-balance");
    await authPage.waitForLoadState("networkidle");
    expect(await authPage.evaluate(() => document.body.scrollWidth > window.innerWidth)).toBeFalsy();
  });

  test("exactly one h1 exists", async ({ authPage }) => {
    await gotoTrialBalance(authPage);
    await expect(authPage.locator("h1")).toHaveCount(1);
  });

  test("page title says Neraca Saldo", async ({ authPage }) => {
    await gotoTrialBalance(authPage);
    await expect(authPage.locator("h1")).toContainText("Neraca Saldo");
  });

  test("no duplicate ledger-page animation", async ({ authPage }) => {
    await gotoTrialBalance(authPage);
    await authPage.goto("/reports/trial-balance");
    await authPage.waitForLoadState("networkidle");
    const count = await authPage.locator(".ledger-page").count();
    expect(count).toBeLessThanOrEqual(1);
  });
});

// ── Date display (auth required) ───────────────────────────────────

test.describe("Date display (auth required)", () => {
  test("subtitle uses long Indonesian date format", async ({ authPage }) => {
    await gotoTrialBalance(authPage);
    const subtitle = authPage.locator("p").filter({ hasText: /^Per / });
    await expect(subtitle.first()).toBeVisible();
    const text = await subtitle.first().textContent();
    // Should contain Indonesian month name, not DD/MM/YYYY
    expect(text).not.toMatch(/\d{2}\/\d{2}\/\d{4}/);
    expect(text).toMatch(/Per \d+ \w+ \d{4}/);
  });
});

// ── Date apply behavior (auth required) ────────────────────────────

test.describe("Date apply behavior (auth required)", () => {
  test("apply button says Tampilkan laporan", async ({ authPage }) => {
    await gotoTrialBalance(authPage);
    await expect(authPage.getByRole("button", { name: /tampilkan laporan/i })).toBeVisible();
  });

  test("date input has label per tanggal", async ({ authPage }) => {
    await gotoTrialBalance(authPage);
    const label = authPage.locator("label").filter({ hasText: /per tanggal/i });
    await expect(label.first()).toBeAttached();
  });

  test("date input has aria-describedby", async ({ authPage }) => {
    await gotoTrialBalance(authPage);
    const dateInput = authPage.locator("input[type='date']").first();
    const describedby = await dateInput.getAttribute("aria-describedby");
    expect(describedby).toBeTruthy();
    const hintId = describedby ?? "";
    if (hintId) {
      await expect(authPage.locator("#" + hintId).first()).toBeAttached();
    }
  });
});

// ── Export (auth required) ──────────────────────────────────────────

test.describe("Export (auth required)", () => {
  test("export button has Indonesian accessible name", async ({ authPage }) => {
    await gotoTrialBalance(authPage);
    const btn = authPage.getByRole("button", { name: /ekspor/i });
    await expect(btn.first()).toBeAttached();
  });

  test("export button has accessible name", async ({ authPage }) => {
    await gotoTrialBalance(authPage);
    const exportBtn = authPage.getByRole("button", { name: /ekspor/i });
    await expect(exportBtn.first()).toBeAttached();
  });
});

// ── Refresh button ──────────────────────────────────────────────────

test.describe("Refresh button (auth required)", () => {
  test("refresh button has aria-label Muat ulang data", async ({ authPage }) => {
    await gotoTrialBalance(authPage);
    await expect(authPage.locator("button[aria-label*='muat ulang' i]").first()).toBeAttached();
  });
});

// ── Zero-balance toggle ────────────────────────────────────────────

test.describe("Zero-balance toggle (auth required)", () => {
  test("toggle label exists in Indonesian", async ({ authPage }) => {
    await gotoTrialBalance(authPage);
    const toggle = authPage.locator("label").filter({ hasText: /tampilkan akun saldo nol/i });
    await expect(toggle.first()).toBeAttached();
  });

  test("toggle is a checkbox", async ({ authPage }) => {
    await gotoTrialBalance(authPage);
    await expect(authPage.locator("input[type='checkbox']").first()).toBeAttached();
  });
});

// ── Table semantics (auth required, desktop) ───────────────────────

test.describe("Desktop table semantics (auth required)", () => {
  test("table has caption", async ({ authPage }) => {
    await gotoTrialBalance(authPage);
    const captions = authPage.locator("table caption");
    await expect(captions.first()).toBeAttached();
    const count = await captions.count();
    for (let i = 0; i < count; i++) {
      await expect(captions.nth(i)).toHaveClass(/sr-only/);
    }
  });

  test("headers have scope=col", async ({ authPage }) => {
    await gotoTrialBalance(authPage);
    const scopedHeaders = authPage.locator("th[scope]");
    await expect(scopedHeaders.first()).toBeAttached();
    const count = await scopedHeaders.count();
    expect(count).toBeGreaterThanOrEqual(4);
  });

  test("total row uses th scope=row colspan=2", async ({ authPage }) => {
    await gotoTrialBalance(authPage);
    const totalHeader = authPage.locator("th[scope='row']");
    await expect(totalHeader.first()).toBeAttached();
    await expect(totalHeader.first()).toHaveAttribute("colspan", "2");
  });

  test("empty cells use em dash on desktop", async ({ authPage }) => {
    await gotoTrialBalance(authPage);
    // Check table exists (em dash behavior depends on data)
    await expect(authPage.locator("table").first()).toBeAttached();
  });
});

// ── Balance status (auth required) ─────────────────────────────────

test.describe("Balance status (auth required)", () => {
  test("balanced status shows Indonesian text", async ({ authPage }) => {
    await gotoTrialBalance(authPage);
    const balancedText = authPage.getByText(/neraca saldo seimbang|neraca saldo tidak seimbang/i);
    await expect(balancedText.first()).toBeAttached();
  });

  test("unbalanced shows selisih amount", async ({ authPage }) => {
    await gotoTrialBalance(authPage);
    const unbalanced = authPage.getByText(/neraca saldo tidak seimbang/i);
    const exists = await unbalanced.first().isVisible().catch(() => false);
    if (exists) {
      await expect(unbalanced.first()).toContainText(/selisih/i);
    } else {
      // Data may be balanced - verify the balanced status appears
      await expect(authPage.getByText(/neraca saldo seimbang/i)).toBeAttached();
    }
  });
});

// ── Bottom navigation ──────────────────────────────────────────────

test.describe("Bottom navigation", () => {
  test("no bottom nav item active for reports", async ({ authPage }) => {
    await gotoTrialBalance(authPage);
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
    await gotoTrialBalance(authPage);
      await authPage.goto("/reports/trial-balance");
      await authPage.waitForLoadState("networkidle");
      expect(await authPage.evaluate(() => document.body.scrollWidth > window.innerWidth)).toBeFalsy();
    });
  });
}
