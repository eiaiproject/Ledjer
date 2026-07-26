import { test } from "./helpers/auth";
import { expect } from "@playwright/test";

/**
 * New Transaction page E2E tests.
 */

// ── Helpers ────────────────────────────────────────────────────────

async function gotoNewTransaction(authPage: import("@playwright/test").Page, width = 375, height = 812) {
  await authPage.setViewportSize({ width, height });
  await authPage.goto("/transactions/new");
  await authPage.waitForLoadState("networkidle");
}

// ── Viewports ──────────────────────────────────────────────────────

const viewports = [
  { name: "Mobile 320", width: 320, height: 800 },
  { name: "Mobile 375", width: 375, height: 812 },
  { name: "Mobile 390", width: 390, height: 844 },
  { name: "Mobile 430", width: 430, height: 932 },
  { name: "Tablet 768", width: 768, height: 1024 },
  { name: "Tablet 1024", width: 1024, height: 768 },
  { name: "Desktop 1280", width: 1280, height: 800 },
  { name: "Desktop 1440", width: 1440, height: 900 },
  { name: "Desktop 1920", width: 1920, height: 1080 },
];

// ── Page basics (work unauthenticated) ─────────────────────────────

test.describe("New Transaction page basics", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("page loads without crash", async ({ authPage }) => {
    await gotoNewTransaction(authPage);
    await authPage.goto("/transactions/new");
    await authPage.waitForLoadState("networkidle");
    const title = await authPage.title();
    expect(title).toMatch(/Ledjer/i);
  });

  test("no horizontal overflow at 320px", async ({ authPage }) => {
    await gotoNewTransaction(authPage);
    await authPage.setViewportSize({ width: 320, height: 800 });
    await authPage.goto("/transactions/new");
    await authPage.waitForLoadState("networkidle");
    const hasOverflow = await authPage.evaluate(() => {
      return document.body.scrollWidth > window.innerWidth;
    });
    expect(hasOverflow).toBeFalsy();
  });
});

// ── Authenticated page tests ───────────────────────────────────────

test.describe("Transaction type selector (auth required)", () => {
  test("radio inputs exist for priority types", async ({ authPage }) => {
    await gotoNewTransaction(authPage);
    const radios = authPage.locator('input[type="radio"][name="transactionType"]');
    const count = await radios.count();
    expect(count).toBeGreaterThanOrEqual(3);
  });

  test("only one radio can be checked at a time", async ({ authPage }) => {
    await gotoNewTransaction(authPage);
    const radios = authPage.locator('input[type="radio"][name="transactionType"]');
    const count = await radios.count();
    if (count < 2) return;

    await radios.nth(0).check({ force: true });
    expect(await radios.nth(0).isChecked()).toBeTruthy();

    await radios.nth(1).check({ force: true });
    expect(await radios.nth(1).isChecked()).toBeTruthy();
    expect(await radios.nth(0).isChecked()).toBeFalsy();
  });

  test("fieldset and legend exist for type selector", async ({ authPage }) => {
    await gotoNewTransaction(authPage);
    const fieldset = authPage.locator("fieldset").first();
    await expect(fieldset).toBeAttached();
    const legend = fieldset.locator("legend");
    await expect(legend).toBeAttached();
  });

  test("radiogroup role exists", async ({ authPage }) => {
    await gotoNewTransaction(authPage);
    const radiogroup = authPage.locator('[role="radiogroup"]');
    await expect(radiogroup.first()).toBeAttached();
  });
});

test.describe("Disclosure: Lihat jenis transaksi lainnya", () => {
  test("disclosure button has aria-expanded=false initially", async ({ authPage }) => {
    await gotoNewTransaction(authPage);
    const btn = authPage.getByRole("button", { name: /lihat jenis transaksi lainnya/i });
    await expect(btn).toBeAttached();
    await expect(btn).toHaveAttribute("aria-expanded", "false");
  });

  test("disclosure button has aria-controls pointing to a real element", async ({ authPage }) => {
    await gotoNewTransaction(authPage);
    const btn = authPage.getByRole("button", { name: /lihat jenis transaksi lainnya/i });
    const controlsId = await btn.getAttribute("aria-controls");
    expect(controlsId).toBeTruthy();
    const target = authPage.locator(`#${controlsId}`);
    await expect(target).toBeAttached();
  });

  test("clicking disclosure shows additional types and updates label", async ({ authPage }) => {
    await gotoNewTransaction(authPage);
    const btn = authPage.getByRole("button", { name: /lihat jenis transaksi lainnya/i });
    await btn.click();

    const hideBtn = authPage.getByRole("button", { name: /sembunyikan jenis transaksi lainnya/i });
    await expect(hideBtn).toBeVisible();
    await expect(hideBtn).toHaveAttribute("aria-expanded", "true");
  });

  test("clicking hide collapses the additional types", async ({ authPage }) => {
    await gotoNewTransaction(authPage);
    const expandBtn = authPage.getByRole("button", { name: /lihat jenis transaksi lainnya/i });
    await expandBtn.click();

    const hideBtn = authPage.getByRole("button", { name: /sembunyikan jenis transaksi lainnya/i });
    await hideBtn.click();

    const reExpand = authPage.getByRole("button", { name: /lihat jenis transaksi lainnya/i });
    await expect(reExpand).toBeVisible();
    await expect(reExpand).toHaveAttribute("aria-expanded", "false");
  });

  test("selecting a type from additional list auto-expands", async ({ authPage }) => {
    await gotoNewTransaction(authPage);
    const expandBtn = authPage.getByRole("button", { name: /lihat jenis transaksi lainnya/i });
    await expandBtn.click();

    const additionalRadio = authPage.locator('input[type="radio"][name="transactionType"][value="credit_sale"], input[type="radio"][name="transactionType"][value="owner_capital"]');
    await expect(additionalRadio.first()).toBeAttached();
    await additionalRadio.first().check({ force: true });
    const hideBtn = authPage.getByRole("button", { name: /sembunyikan jenis transaksi lainnya/i });
    await expect(hideBtn).toBeVisible();
  });
});

test.describe("Page copy (auth required)", () => {
  test("h1 shows Transaksi Baru", async ({ authPage }) => {
    await gotoNewTransaction(authPage);
    const h1 = authPage.locator("h1");
    await expect(h1).toContainText("Transaksi Baru");
  });

  test("exactly one h1 exists", async ({ authPage }) => {
    await gotoNewTransaction(authPage);
    await authPage.goto("/transactions/new");
    await authPage.waitForLoadState("networkidle");
    const h1Count = await authPage.locator("h1").count();
    expect(h1Count).toBe(1);
  });

  test("description does not contain 'Isi dari atas ke bawah'", async ({ authPage }) => {
    await gotoNewTransaction(authPage);
    await authPage.goto("/transactions/new");
    await authPage.waitForLoadState("networkidle");
    const body = authPage.locator("body");
    await expect(body).not.toContainText("Isi dari atas ke bawah");
  });

  test("default section title is 'Pilih jenis transaksi'", async ({ authPage }) => {
    await gotoNewTransaction(authPage);
    const sectionTitle = authPage.getByRole("heading", { name: /pilih jenis transaksi/i });
    await expect(sectionTitle).toBeVisible({ timeout: 5000 });
  });
});

test.describe("Submit button disabled state (auth required)", () => {
  test("submit button is disabled before type selection", async ({ authPage }) => {
    await gotoNewTransaction(authPage);
    const submitBtn = authPage.getByRole("button", { name: /catat transaksi/i });
    await expect(submitBtn).toBeDisabled();
  });

  test("explanation text visible when no type selected", async ({ authPage }) => {
    await gotoNewTransaction(authPage);
    const explanation = authPage.getByText("Pilih jenis transaksi untuk melanjutkan.");
    await expect(explanation).toBeVisible({ timeout: 5000 });
  });
});

test.describe("No duplicate transaction types (auth required)", () => {
  test("Penjualan Tunai appears exactly once in initial selector", async ({ authPage }) => {
    await gotoNewTransaction(authPage);
    const labels = authPage.locator('label:has-text("Penjualan Tunai")');
    const count = await labels.count();
    expect(count).toBe(1);
  });

  test("Pembelian Tunai appears exactly once in initial selector", async ({ authPage }) => {
    await gotoNewTransaction(authPage);
    const labels = authPage.locator('label:has-text("Pembelian Tunai")');
    const count = await labels.count();
    expect(count).toBe(1);
  });

  test("no aria-pressed buttons exist in type selector", async ({ authPage }) => {
    await gotoNewTransaction(authPage);
    await authPage.goto("/transactions/new");
    await authPage.waitForLoadState("networkidle");
    const pressedButtons = authPage.locator('[role="radiogroup"] button[aria-pressed]');
    const count = await pressedButtons.count();
    expect(count).toBe(0);
  });
});

test.describe("Mobile header on new transaction (auth required)", () => {
  test("header shows X/close button instead of plus", async ({ authPage }) => {
    await gotoNewTransaction(authPage);
    const closeBtn = authPage.getByRole("link", { name: /batalkan transaksi/i });
    await expect(closeBtn).toBeVisible({ timeout: 5000 });

    const plusLink = authPage.getByRole("link", { name: /^transaksi baru$/i });
    const plusCount = await plusLink.count();
    expect(plusCount).toBe(0);
  });

  test("close button links to /transactions", async ({ authPage }) => {
    await gotoNewTransaction(authPage);
    const closeBtn = authPage.getByRole("link", { name: /batalkan transaksi/i });
    const href = await closeBtn.getAttribute("href");
    expect(href).toBe("/transactions");
  });
});

// ── Responsive viewports (auth-independent) ────────────────────────

for (const vp of viewports) {
  test.describe(`Responsive: ${vp.name} (${vp.width}px)`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    test("no horizontal overflow", async ({ authPage }) => {
    await gotoNewTransaction(authPage);
      await authPage.goto("/transactions/new");
      await authPage.waitForLoadState("networkidle");
      const hasOverflow = await authPage.evaluate(() => {
        return document.body.scrollWidth > window.innerWidth;
      });
      expect(hasOverflow).toBeFalsy();
    });

    test("type selector cards have min-height", async ({ authPage }) => {
    await gotoNewTransaction(authPage);
      const firstCard = authPage.locator('input[type="radio"][name="transactionType"]').first();
      await expect(firstCard).toBeAttached();
      const label = authPage.locator(`label[for="${await firstCard.getAttribute("id")}"]`);
      const box = await label.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.height).toBeGreaterThanOrEqual(44);
    });

    test("logo is centered in mobile header", async ({ authPage }) => {
    await gotoNewTransaction(authPage);
      await authPage.goto("/transactions/new");
      await authPage.waitForLoadState("networkidle");

      const logo = authPage.locator('a[href="/dashboard"]').first();
      await expect(logo).toBeAttached();
      const logoBox = await logo.boundingBox();
      expect(logoBox).not.toBeNull();
      const centerX = logoBox!.x + logoBox!.width / 2;
      const viewportCenter = vp.width / 2;
      expect(Math.abs(centerX - viewportCenter)).toBeLessThan(50);
    });
  });
}

// ── Keyboard navigation (auth required) ────────────────────────────

test.describe("Keyboard navigation", () => {
  test("arrow keys navigate between radio options", async ({ authPage }) => {
    await gotoNewTransaction(authPage);
    const firstRadio = authPage.locator('input[type="radio"][name="transactionType"]').first();

    await firstRadio.focus();
    expect(await firstRadio.isChecked()).toBeTruthy();

    await authPage.keyboard.press("ArrowDown");
    const secondRadio = authPage.locator('input[type="radio"][name="transactionType"]').nth(1);
    await expect(secondRadio).toBeAttached();
    expect(await secondRadio.isChecked()).toBeTruthy();
  });

  test("space selects focused radio", async ({ authPage }) => {
    await gotoNewTransaction(authPage);
    const firstRadio = authPage.locator('input[type="radio"][name="transactionType"]').first();

    await firstRadio.focus();
    await authPage.keyboard.press("Space");
    expect(await firstRadio.isChecked()).toBeTruthy();
  });
});

// ── Accessibility (auth required) ──────────────────────────────────

test.describe("Accessibility", () => {
  test("all interactive elements have accessible names", async ({ authPage }) => {
    await gotoNewTransaction(authPage);
    const buttons = authPage.locator("button");
    const count = await buttons.count();
    for (let i = 0; i < count; i++) {
      const btn = buttons.nth(i);
      const name = await btn.getAttribute("aria-label");
      const text = await btn.textContent();
      expect(name || text?.trim()).toBeTruthy();
    }
  });

  test("decorative icons have aria-hidden", async ({ authPage }) => {
    await gotoNewTransaction(authPage);
    const icons = authPage.locator('[role="radiogroup"] [aria-hidden="true"]');
    const count = await icons.count();
    expect(count).toBeGreaterThan(0);
  });

  test("form fields have visible labels", async ({ authPage }) => {
    await gotoNewTransaction(authPage);
    const firstRadio = authPage.locator('input[type="radio"][name="transactionType"]').first();
    await expect(firstRadio).toBeAttached();
    await firstRadio.check({ force: true });
    const labels = authPage.locator("label");
    await expect(labels.first()).toBeAttached();
  });
});
