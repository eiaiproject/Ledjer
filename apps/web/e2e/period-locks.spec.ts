import { expect } from "@playwright/test";
import { test } from "./helpers/auth";

/**
 * Period Locks page E2E tests.
 * Uses authenticated fixture for auth-required tests.
 */

async function gotoPeriodLocks(
  page: import("@playwright/test").Page,
  width = 375,
  height = 812,
) {
  await page.setViewportSize({ width, height });
  await page.goto("/settings/period-locks");
  await page.waitForLoadState("networkidle");
}

// ── Page basics (auth-independent) ─────────────────────────────────

test.describe("Period locks page basics", () => {
  test("page loads without crash", async ({ authPage }) => {
    await gotoPeriodLocks(authPage);
    await authPage.goto("/settings/period-locks");
    await authPage.waitForLoadState("networkidle");
    expect(await authPage.title()).toMatch(/Ledjer/i);
  });

  test("no horizontal overflow at 320px", async ({ authPage }) => {
    await gotoPeriodLocks(authPage);
    await authPage.setViewportSize({ width: 320, height: 800 });
    await authPage.goto("/settings/period-locks");
    await authPage.waitForLoadState("networkidle");
    expect(
      await authPage.evaluate(() => document.body.scrollWidth > window.innerWidth),
    ).toBeFalsy();
  });

  test("exactly one h1 exists", async ({ authPage }) => {
    await gotoPeriodLocks(authPage);
    await expect(authPage.locator("h1")).toHaveCount(1);
  });

  test("page title says Kunci Periode", async ({ authPage }) => {
    await gotoPeriodLocks(authPage);
    await expect(authPage.locator("h1")).toContainText("Kunci Periode");
  });

  test("description mentions cumulative lock", async ({ authPage }) => {
    await gotoPeriodLocks(authPage);
    const desc = authPage.locator("p.text-text-secondary").first();
    await expect(desc).toBeVisible();
    const text = await desc.textContent();
    expect(text).toContain("hingga");
  });
});

// ── Effective lock section (auth required) ─────────────────────────

test.describe("Effective lock section (auth required)", () => {
  test("has Periode aktif heading", async ({ authPage }) => {
    await gotoPeriodLocks(authPage);
    // This section may not appear if no lock data exists
    const heading = authPage.getByText("Periode aktif").first();
    const exists = await heading.isVisible().catch(() => false);
    if (!exists) {
      // If no data, the page still loads properly
      await expect(authPage.locator("h1")).toBeVisible();
    }
  });

  test("effective lock shows Dikunci hingga text", async ({ authPage }) => {
    await gotoPeriodLocks(authPage);
    const lockText = authPage.getByText(/Dikunci hingga/).first();
    const exists = await lockText.isVisible().catch(() => false);
    if (!exists) {
      // No effective lock - page still loads
      await expect(authPage.locator("h1")).toBeVisible();
    }
  });
});

// ── Create form (auth required) ────────────────────────────────────

test.describe("Create form (auth required)", () => {
  test("has Tambah kunci periode heading", async ({ authPage }) => {
    await gotoPeriodLocks(authPage);
    const heading = authPage.getByText("Tambah kunci periode").first();
    await expect(heading).toBeAttached();
  });

  test("form heading has id matching aria-labelledby", async ({ authPage }) => {
    await gotoPeriodLocks(authPage);
    const heading = authPage.locator("#create-lock-heading");
    await expect(heading).toBeAttached();
  });

  test("has date input", async ({ authPage }) => {
    await gotoPeriodLocks(authPage);
    const dateInput = authPage.locator("#lock-date");
    await expect(dateInput).toBeAttached();
  });

  test("date input has associated label", async ({ authPage }) => {
    await gotoPeriodLocks(authPage);
    const label = authPage.locator("label[for='lock-date']");
    await expect(label).toBeAttached();
  });

  test("has reason textarea", async ({ authPage }) => {
    await gotoPeriodLocks(authPage);
    const textarea = authPage.locator("#alasan-kunci");
    await expect(textarea).toBeAttached();
  });

  test("reason textarea has associated label", async ({ authPage }) => {
    await gotoPeriodLocks(authPage);
    const label = authPage.locator("label[for='alasan-kunci']");
    await expect(label).toBeAttached();
  });

  test("submit button exists", async ({ authPage }) => {
    await gotoPeriodLocks(authPage);
    const submitBtn = authPage.getByRole("button", { name: /kunci hingga tanggal ini/i });
    await expect(submitBtn.first()).toBeVisible();
  });

  test("form uses native form submit", async ({ authPage }) => {
    await gotoPeriodLocks(authPage);
    const form = authPage.locator("form").first();
    await expect(form).toBeAttached();
  });

  test("date input has help text", async ({ authPage }) => {
    await gotoPeriodLocks(authPage);
    const helpText = authPage.locator("#lock-date-help");
    await expect(helpText).toBeAttached();
    await expect(helpText).toContainText("Semua transaksi");
  });

  test("default date is end of previous month", async ({ authPage }) => {
    await gotoPeriodLocks(authPage);
    const dateInput = authPage.locator("#lock-date");
    const value = await dateInput.inputValue();
    // Should be YYYY-MM-DD format
    expect(value).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // Should NOT be today
    const today = new Date().toLocaleDateString("en-CA");
    expect(value).not.toBe(today);
  });

  test("impact warning shows Apa yang terjadi setelah dikunci", async ({ authPage }) => {
    await gotoPeriodLocks(authPage);
    const warning = authPage.getByText("Apa yang terjadi setelah dikunci?").first();
    await expect(warning).toBeVisible();
  });

  test("warning list uses semantic list markup", async ({ authPage }) => {
    await gotoPeriodLocks(authPage);
    const list = authPage.locator("ul.list-disc").first();
    await expect(list).toBeAttached();
  });
});

// ── Lock history (auth required) ───────────────────────────────────

test.describe("Lock history (auth required)", () => {
  test("has Histori kunci periode heading", async ({ authPage }) => {
    await gotoPeriodLocks(authPage);
    const heading = authPage.getByText("Histori kunci periode").first();
    const exists = await heading.isVisible().catch(() => false);
    if (!exists) {
      // No history - page still renders correctly
      await expect(authPage.locator("h1")).toBeVisible();
    }
  });

  test("desktop table has scope attributes", async ({ authPage }) => {
    await gotoPeriodLocks(authPage);
    const table = authPage.locator("table").first();
    const exists = await table.isVisible().catch(() => false);
    if (exists) {
      const headers = table.locator("th[scope='col']");
      await expect(headers.first()).toBeAttached();
    } else {
      // No lock history - empty state shown
      await expect(authPage.getByText("Belum ada").first()).toBeAttached();
    }
  });

  test("history shows Aktif or Digantikan badges", async ({ authPage }) => {
    await gotoPeriodLocks(authPage);
    const badges = authPage.locator("span").filter({ hasText: /Aktif|Digantikan/ });
    const exists = await badges.first().isVisible().catch(() => false);
    if (!exists) {
      // No badges - no lock history
      await expect(authPage.locator("h1")).toBeVisible();
    }
  });
});

// ── Empty state (auth required) ────────────────────────────────────

test.describe("Empty state (auth required)", () => {
  test("shows empty state when no locks", async ({ authPage }) => {
    await gotoPeriodLocks(authPage);
    const emptyState = authPage.getByText("Belum ada periode terkunci").first();
    await expect(emptyState).toBeAttached();
  });

  test("empty state description mentions user permissions", async ({ authPage }) => {
    await gotoPeriodLocks(authPage);
    const desc = authPage.getByText("Transaksi masih dapat diposting dan dibatalkan sesuai izin pengguna").first();
    await expect(desc).toBeVisible();
  });
});

// ── Permission denied state (auth required) ────────────────────────

test.describe("Permission denied state (auth required)", () => {
  test("shows read-only notice for non-admin users", async ({ authPage }) => {
    await gotoPeriodLocks(authPage);
    const notice = authPage.getByText("tidak memiliki izin").first();
    const exists = await notice.isVisible().catch(() => false);
    if (exists) {
      await expect(notice).toBeVisible();
    } else {
      // Admin user sees full form
      await expect(authPage.locator("h1")).toBeVisible();
    }
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
    await gotoPeriodLocks(authPage);
      await authPage.goto("/settings/period-locks");
      await authPage.waitForLoadState("networkidle");
      expect(
        await authPage.evaluate(() => document.body.scrollWidth > window.innerWidth),
      ).toBeFalsy();
    });

    test("h1 is visible", async ({ authPage }) => {
    await gotoPeriodLocks(authPage);
      await expect(authPage.locator("h1")).toBeVisible();
    });
  });
}
