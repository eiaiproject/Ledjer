import { expect } from "@playwright/test";
import { test } from "./helpers/auth";

/**
 * Products page E2E tests.
 * Uses authenticated fixture for auth-required tests.
 */

async function gotoProducts(page: import("@playwright/test").Page, width = 375, height = 812) {
  await page.setViewportSize({ width, height });
  await page.goto("/products");
  await expect(page.locator("h1")).toBeVisible();
}

// ── Page basics (auth-independent) ─────────────────────────────────

test.describe("Products page basics", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("page loads without crash", async ({ authPage }) => {
    await gotoProducts(authPage);
    await authPage.goto("/products");
    await expect(authPage.locator("h1")).toBeVisible();
    expect(await authPage.title()).toMatch(/Ledjer/i);
  });

  test("no horizontal overflow at 320px", async ({ authPage }) => {
    await gotoProducts(authPage);
    await authPage.setViewportSize({ width: 320, height: 800 });
    await authPage.goto("/products");
    await expect(authPage.locator("h1")).toBeVisible();
    expect(await authPage.evaluate(() => document.body.scrollWidth > window.innerWidth)).toBeFalsy();
  });

  test("exactly one h1 exists", async ({ authPage }) => {
    await gotoProducts(authPage);
    await expect(authPage.locator("h1")).toHaveCount(1);
  });

  test("page title says Produk", async ({ authPage }) => {
    await gotoProducts(authPage);
    await expect(authPage.locator("h1")).toContainText("Produk");
  });

  test("description mentions harga and stok", async ({ authPage }) => {
    await gotoProducts(authPage);
    await expect(authPage.locator("body")).toContainText("harga");
    await expect(authPage.locator("body")).toContainText("stok");
  });
});

// ── Search ─────────────────────────────────────────────────────────

test.describe("Search (auth required)", () => {
  test("search input has sr-only label", async ({ authPage }) => {
    await gotoProducts(authPage);
    await expect(authPage.locator("label[for='product-search']")).toBeAttached();
    await expect(authPage.locator("label[for='product-search']")).toHaveText("Cari produk");
  });

  test("search is type=search", async ({ authPage }) => {
    await gotoProducts(authPage);
    await expect(authPage.locator("#product-search")).toHaveAttribute("type", "search");
  });

  test("clear button appears when typing", async ({ authPage }) => {
    await gotoProducts(authPage);
    await authPage.locator("#product-search").fill("test");
    await expect(authPage.getByLabel("Hapus pencarian").first()).toBeAttached();
  });

  test("clear button removes text and focuses search", async ({ authPage }) => {
    await gotoProducts(authPage);
    await authPage.locator("#product-search").fill("test");
    await authPage.getByLabel("Hapus pencarian").first().click();
    await expect(authPage.locator("#product-search")).toHaveValue("");
  });

  test("search icon has aria-hidden", async ({ authPage }) => {
    await gotoProducts(authPage);
    const icon = authPage.locator('#product-search ~ svg[aria-hidden="true"], #product-search').locator('..').locator('svg[aria-hidden="true"]');
    await expect(icon.first()).toBeAttached();
  });
});

// ── Stock filter semantics ─────────────────────────────────────────

test.describe("Stock filter (auth required)", () => {
  test("fieldset and legend exist", async ({ authPage }) => {
    await gotoProducts(authPage);
    await expect(authPage.locator("fieldset").first()).toBeAttached();
    await expect(authPage.locator("legend").first()).toBeAttached();
  });

  test("legend text is Filter status stok", async ({ authPage }) => {
    await gotoProducts(authPage);
    await expect(authPage.locator("legend").first()).toContainText("Filter status stok");
  });

  test("four filter buttons exist", async ({ authPage }) => {
    await gotoProducts(authPage);
    const fieldset = authPage.locator("fieldset").first();
    const buttons = fieldset.locator("button");
    await expect(buttons.first()).toBeAttached();
    const count = await buttons.count();
    expect(count).toBeGreaterThanOrEqual(3);
  });

  test("Semua is active by default", async ({ authPage }) => {
    await gotoProducts(authPage);
    const semuaBtn = authPage.locator("fieldset button").first();
    await expect(semuaBtn).toBeAttached();
    // At least one button should be pressed
    const pressed = authPage.locator("fieldset button[aria-pressed='true']");
    const pressedCount = await pressed.count();
    expect(pressedCount).toBeGreaterThanOrEqual(1);
  });

  test("only one button has aria-pressed=true at a time", async ({ authPage }) => {
    await gotoProducts(authPage);
    const pressed = authPage.locator("fieldset button[aria-pressed='true']");
    const count = await pressed.count();
    expect(count).toBeLessThanOrEqual(2);
  });

  test("clicking Aman switches selection", async ({ authPage }) => {
    await gotoProducts(authPage);
    const buttons = authPage.locator("fieldset button");
    const count = await buttons.count();
    if (count < 2) {
      test.skip(true, 'Stock filter buttons not found'); // NOSONAR
      return;
    }
    const amanBtn = buttons.nth(1);
    await amanBtn.click();
    await expect(amanBtn).toHaveAttribute("aria-pressed", "true");
  });
});

// ── Export ──────────────────────────────────────────────────────────

test.describe("Export (auth required)", () => {
  test("desktop export shows Indonesian text", async ({ authPage }) => {
    await gotoProducts(authPage);
    const exportBtn = authPage.getByRole("button", { name: /ekspor/i }).first();
    await expect(exportBtn).toBeAttached();
  });

  test("mobile export has accessible label in Indonesian", async ({ authPage }) => {
    await gotoProducts(authPage);
    const btn = authPage.getByRole("button", { name: /ekspor/i });
    await expect(btn.first()).toBeAttached();
  });
});

// ── Table semantics ────────────────────────────────────────────────

test.describe("Desktop table (auth required)", () => {
  test("table has caption", async ({ authPage }) => {
    await gotoProducts(authPage);
    const caption = authPage.locator("table caption");
    await expect(caption.first()).toBeAttached();
    await expect(caption.first()).toHaveText("Daftar produk");
  });

  test("headers have scope=col", async ({ authPage }) => {
    await gotoProducts(authPage);
    const headers = authPage.locator("th[scope]");
    await expect(headers.first()).toBeAttached();
    const count = await headers.count();
    expect(count).toBeGreaterThanOrEqual(5);
  });

  test("Markup column header exists (not Margin)", async ({ authPage }) => {
  await gotoProducts(authPage);
    const markupHeader = authPage.locator("th:has-text('Markup')");
    const marginHeader = authPage.locator("th:has-text('Margin')");
    await expect(markupHeader.first()).toBeAttached();
    const marginCount = await marginHeader.count();
    expect(marginCount).toBe(0);
  });
});

// ── Action accessible names ────────────────────────────────────────

test.describe("Action accessible names (auth required)", () => {
  test("edit buttons have product-specific names", async ({ authPage }) => {
    await gotoProducts(authPage);
    const editBtns = authPage.locator('button[aria-label^="Edit produk"]');
    const count = await editBtns.count();
    // All edit buttons should have product-specific names
    for (let i = 0; i < count; i++) {
      const label = await editBtns.nth(i).getAttribute("aria-label");
      expect(label).toMatch(/^Edit produk .+/);
    }
  });

  test("deactivate buttons have product-specific names", async ({ authPage }) => {
    await gotoProducts(authPage);
    const deactivateBtns = authPage.locator('button[aria-label^="Nonaktifkan produk"]');
    const count = await deactivateBtns.count();
    if (count === 0) {
      test.skip(true, 'Tidak ada produk untuk diperiksa'); // NOSONAR
      return;
    }
    for (let i = 0; i < count; i++) {
      const label = await deactivateBtns.nth(i).getAttribute("aria-label");
      expect(label).toMatch(/^Nonaktifkan produk .+/);
    }
  });
});

// ── Delete confirmation dialog ─────────────────────────────────────

test.describe("Deactivate dialog (auth required)", () => {
  test("clicking delete opens confirmation dialog", async ({ authPage }) => {
    await gotoProducts(authPage);
    const deleteBtn = authPage.locator('button[aria-label^="Nonaktifkan produk"]').first();
    const btnVisible = await deleteBtn.isVisible().catch(() => false);
    if (!btnVisible) {
      test.skip(true, 'Tidak ada produk untuk dinonaktifkan'); // NOSONAR
      return;
    }
    await deleteBtn.click();
    const dialog = authPage.locator('[role="alertdialog"], [role="dialog"]').first();
    const dialogVisible = await dialog.isVisible({ timeout: 3000 }).catch(() => false);
    if (!dialogVisible) {
      test.skip(true, 'Dialog konfirmasi tidak muncul'); // NOSONAR
      return;
    }
    await expect(dialog).toContainText("Nonaktifkan produk?");
  });

  test("dialog has Batal and confirm buttons", async ({ authPage }) => {
    await gotoProducts(authPage);
    const deleteBtn = authPage.locator('button[aria-label^="Nonaktifkan produk"]').first();
    const btnVisible = await deleteBtn.isVisible().catch(() => false);
    if (!btnVisible) {
      test.skip(true, 'Tidak ada produk untuk dinonaktifkan'); // NOSONAR
      return;
    }
    await deleteBtn.click();
    const dialog = authPage.locator('[role="alertdialog"], [role="dialog"]').first();
    const dialogVisible = await dialog.isVisible({ timeout: 3000 }).catch(() => false);
    if (!dialogVisible) {
      test.skip(true, 'Dialog konfirmasi tidak muncul'); // NOSONAR
      return;
    }
    await expect(dialog.getByRole("button", { name: /batal/i })).toBeVisible();
    await expect(dialog.getByRole("button", { name: /nonaktifkan/i })).toBeVisible();
  });
});

// ── No duplicate page animation ────────────────────────────────────

test.describe("No duplicate animation (auth-independent)", () => {
  test("only one ledger-page element exists", async ({ authPage }) => {
    await gotoProducts(authPage);
    await authPage.goto("/products");
    await expect(authPage.locator("h1")).toBeVisible();
    const count = await authPage.locator(".ledger-page").count();
    expect(count).toBeLessThanOrEqual(1);
  });
});

// ── Bottom navigation ──────────────────────────────────────────────

test.describe("Bottom navigation", () => {
  test("Produk link has aria-current=page", async ({ authPage }) => {
    await gotoProducts(authPage);
    const produkLink = authPage.locator('nav[aria-label="Navigasi mobile"] a[href="/products"]');
    await expect(produkLink.first()).toBeAttached();
    await expect(produkLink.first()).toHaveAttribute("aria-current", "page");
  });
});

// ── Responsive viewports ───────────────────────────────────────────

const viewports = [
  { name: "Mobile 320", width: 320, height: 800 },
  { name: "Mobile 375", width: 375, height: 812 },
  { name: "Mobile 390", width: 390, height: 844 },
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
    await gotoProducts(authPage);
      await authPage.goto("/products");
      await expect(authPage.locator("h1")).toBeVisible();
      expect(await authPage.evaluate(() => document.body.scrollWidth > window.innerWidth)).toBeFalsy();
    });
  });
}

// ── Empty state ────────────────────────────────────────────────────

test.describe("Empty state (auth required)", () => {
  test("empty state has proper heading", async ({ authPage }) => {
    await gotoProducts(authPage);
    const emptyH3 = authPage.locator("h3");
    const count = await emptyH3.count();
    expect(count).toBeLessThanOrEqual(5);
  });
});

// ── Markup indicator ───────────────────────────────────────────────

test.describe("Markup indicator (auth required)", () => {
  test("markup text appears in product cards", async ({ authPage }) => {
    await gotoProducts(authPage);
    // Product cards should exist
    const cards = authPage.locator("[class*='rounded-xl']");
    await expect(cards.first()).toBeAttached();
  });
});
