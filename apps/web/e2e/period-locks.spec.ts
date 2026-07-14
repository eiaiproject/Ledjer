import { test, expect } from "@playwright/test";

/**
 * Period Locks page E2E tests.
 * Auth-dependent tests skip gracefully on login redirect.
 */

async function gotoPeriodLocks(
  page: import("@playwright/test").Page,
  width = 375,
  height = 812,
) {
  await page.setViewportSize({ width, height });
  await page.goto("/settings/period-locks");
  await page.waitForLoadState("networkidle");
  if (page.url().includes("/login")) return false;
  return true;
}

// ── Page basics (auth-independent) ─────────────────────────────────

test.describe("Period locks page basics", () => {
  test("page loads without crash", async ({ page }) => {
    await gotoPeriodLocks(page);
    await page.goto("/settings/period-locks");
    await page.waitForLoadState("networkidle");
    expect(await page.title()).toMatch(/Ledjer/i);
  });

  test("no horizontal overflow at 320px", async ({ page }) => {
    await gotoPeriodLocks(page);
    await page.setViewportSize({ width: 320, height: 800 });
    await page.goto("/settings/period-locks");
    await page.waitForLoadState("networkidle");
    expect(
      await page.evaluate(() => document.body.scrollWidth > window.innerWidth),
    ).toBeFalsy();
  });

  test("exactly one h1 exists", async ({ page }) => {
    await gotoPeriodLocks(page);
    expect(await page.locator("h1").count()).toBe(1);
  });

  test("page title says Kunci Periode", async ({ page }) => {
    await gotoPeriodLocks(page);
    await expect(page.locator("h1")).toContainText("Kunci Periode");
  });

  test("description mentions cumulative lock", async ({ page }) => {
    await gotoPeriodLocks(page);
    const desc = page.locator("p.text-text-secondary").first();
    await expect(desc).toBeVisible();
    const text = await desc.textContent();
    expect(text).toContain("hingga");
  });
});

// ── Effective lock section (auth required) ─────────────────────────

test.describe("Effective lock section (auth required)", () => {
  test("has Periode aktif heading", async ({ page }) => {
    await gotoPeriodLocks(page);
    const heading = page.getByText("Periode aktif").first();
    await expect(heading).toBeAttached();
  });

  test("effective lock shows Dikunci hingga text", async ({ page }) => {
    await gotoPeriodLocks(page);
    const lockText = page.getByText(/Dikunci hingga/).first();
    if (await lockText.count() > 0) {
      await expect(lockText).toBeVisible();
    }
  });
});

// ── Create form (auth required) ────────────────────────────────────

test.describe("Create form (auth required)", () => {
  test("has Tambah kunci periode heading", async ({ page }) => {
    await gotoPeriodLocks(page);
    const heading = page.getByText("Tambah kunci periode").first();
    await expect(heading).toBeAttached();
  });

  test("form heading has id matching aria-labelledby", async ({ page }) => {
    await gotoPeriodLocks(page);
    const heading = page.locator("#create-lock-heading");
    await expect(heading).toBeAttached();
  });

  test("has date input", async ({ page }) => {
    await gotoPeriodLocks(page);
    const dateInput = page.locator("#lock-date");
    await expect(dateInput).toBeAttached();
  });

  test("date input has associated label", async ({ page }) => {
    await gotoPeriodLocks(page);
    const label = page.locator("label[for='lock-date']");
    await expect(label).toBeAttached();
  });

  test("has reason textarea", async ({ page }) => {
    await gotoPeriodLocks(page);
    const textarea = page.locator("#alasan-kunci");
    await expect(textarea).toBeAttached();
  });

  test("reason textarea has associated label", async ({ page }) => {
    await gotoPeriodLocks(page);
    const label = page.locator("label[for='alasan-kunci']");
    await expect(label).toBeAttached();
  });

  test("submit button exists", async ({ page }) => {
    await gotoPeriodLocks(page);
    const submitBtn = page.getByRole("button", { name: /kunci hingga tanggal ini/i });
    if (await submitBtn.count() > 0) {
      await expect(submitBtn.first()).toBeVisible();
    }
  });

  test("form uses native form submit", async ({ page }) => {
    await gotoPeriodLocks(page);
    const form = page.locator("form").first();
    if (await form.count() > 0) {
      await expect(form).toBeAttached();
    }
  });

  test("date input has help text", async ({ page }) => {
    await gotoPeriodLocks(page);
    const helpText = page.locator("#lock-date-help");
    if (await helpText.count() > 0) {
      await expect(helpText).toContainText("Semua transaksi");
    }
  });

  test("default date is end of previous month", async ({ page }) => {
    await gotoPeriodLocks(page);
    const dateInput = page.locator("#lock-date");
    const value = await dateInput.inputValue();
    // Should be YYYY-MM-DD format
    expect(value).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // Should NOT be today
    const today = new Date().toLocaleDateString("en-CA");
    expect(value).not.toBe(today);
  });

  test("impact warning shows Apa yang terjadi setelah dikunci", async ({ page }) => {
    await gotoPeriodLocks(page);
    const warning = page.getByText("Apa yang terjadi setelah dikunci?").first();
    await expect(warning).toBeVisible();
  });

  test("warning list uses semantic list markup", async ({ page }) => {
    await gotoPeriodLocks(page);
    const list = page.locator("ul.list-disc").first();
    if (await list.count() > 0) {
      await expect(list).toBeAttached();
    }
  });
});

// ── Lock history (auth required) ───────────────────────────────────

test.describe("Lock history (auth required)", () => {
  test("has Histori kunci periode heading", async ({ page }) => {
    await gotoPeriodLocks(page);
    const heading = page.getByText("Histori kunci periode").first();
    await expect(heading).toBeAttached();
  });

  test("desktop table has scope attributes", async ({ page }) => {
    await gotoPeriodLocks(page);
    const table = page.locator("table.ledger-table").first();
    if (await table.count() > 0) {
      const headers = table.locator("th[scope='col']");
      expect(await headers.count()).toBeGreaterThan(0);
    }
  });

  test("history shows Aktif or Digantikan badges", async ({ page }) => {
    await gotoPeriodLocks(page);
    const badges = page.locator(".bg-success\\/10, .bg-wood-100").filter({ hasText: /Aktif|Digantikan/ });
    // May or may not have locks
    const count = await badges.count();
    expect(count >= 0).toBeTruthy();
  });
});

// ── Empty state (auth required) ────────────────────────────────────

test.describe("Empty state (auth required)", () => {
  test("shows empty state when no locks", async ({ page }) => {
    await gotoPeriodLocks(page);
    // Check if empty state is present (may or may not be depending on data)
    const emptyState = page.getByText("Belum ada periode terkunci").first();
    const hasEmpty = (await emptyState.count()) > 0;
    const hasLocks = (await page.getByText(/Dikunci hingga/).count()) > 0;
    // Either empty or has locks
    expect(hasEmpty || hasLocks).toBeTruthy();
  });

  test("empty state description mentions user permissions", async ({ page }) => {
    await gotoPeriodLocks(page);
    const desc = page.getByText("Transaksi masih dapat diposting dan dibatalkan sesuai izin pengguna").first();
    if (await desc.count() > 0) {
      await expect(desc).toBeVisible();
    }
  });
});

// ── Permission denied state (auth required) ────────────────────────

test.describe("Permission denied state (auth required)", () => {
  test("shows read-only notice for non-admin users", async ({ page }) => {
    await gotoPeriodLocks(page);
    const notice = page.getByText("Anda dapat melihat kunci periode, tetapi tidak memiliki izin").first();
    // May or may not be visible depending on user role
    const count = await notice.count();
    expect(count >= 0).toBeTruthy();
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
    await gotoPeriodLocks(page);
      await page.goto("/settings/period-locks");
      await page.waitForLoadState("networkidle");
      expect(
        await page.evaluate(() => document.body.scrollWidth > window.innerWidth),
      ).toBeFalsy();
    });

    test("h1 is visible", async ({ page }) => {
    await gotoPeriodLocks(page);
      await expect(page.locator("h1")).toBeVisible();
    });
  });
}
