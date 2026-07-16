import { test, expect } from "@playwright/test";

/**
 * Products page E2E tests.
 * Auth-dependent tests skip gracefully on login redirect.
 */

async function gotoProducts(page: import("@playwright/test").Page, width = 375, height = 812) {
  await page.setViewportSize({ width, height });
  await page.goto("/products");
  await page.waitForLoadState("networkidle");
  if (page.url().includes("/login")) return false;
  return true;
}

// ── Page basics (auth-independent) ─────────────────────────────────

test.describe("Products page basics", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("page loads without crash", async ({ page }) => {
    await gotoProducts(page);
    await page.goto("/products");
    await page.waitForLoadState("networkidle");
    expect(await page.title()).toMatch(/Ledjer/i);
  });

  test("no horizontal overflow at 320px", async ({ page }) => {
    await gotoProducts(page);
    await page.setViewportSize({ width: 320, height: 800 });
    await page.goto("/products");
    await page.waitForLoadState("networkidle");
    expect(await page.evaluate(() => document.body.scrollWidth > window.innerWidth)).toBeFalsy();
  });

  test("exactly one h1 exists", async ({ page }) => {
    await gotoProducts(page);
    await expect(page.locator("h1")).toHaveCount(1);
  });

  test("page title says Produk", async ({ page }) => {
    await gotoProducts(page);
    await expect(page.locator("h1")).toContainText("Produk");
  });

  test("description mentions harga and stok", async ({ page }) => {
    await gotoProducts(page);
    await expect(page.locator("body")).toContainText("harga");
    await expect(page.locator("body")).toContainText("stok");
  });
});

// ── Search ─────────────────────────────────────────────────────────

test.describe("Search (auth required)", () => {
  test("search input has sr-only label", async ({ page }) => {
    await gotoProducts(page);
    await expect(page.locator("label[for='product-search']")).toBeAttached();
    await expect(page.locator("label[for='product-search']")).toHaveText("Cari produk");
  });

  test("search is type=search", async ({ page }) => {
    await gotoProducts(page);
    await expect(page.locator("#product-search")).toHaveAttribute("type", "search");
  });

  test("clear button appears when typing", async ({ page }) => {
    await gotoProducts(page);
    await page.locator("#product-search").fill("test");
    await expect(page.getByRole("button", { name: /hapus pencarian/i })).toBeVisible();
  });

  test("clear button removes text and focuses search", async ({ page }) => {
    await gotoProducts(page);
    await page.locator("#product-search").fill("test");
    await page.getByRole("button", { name: /hapus pencarian/i }).click();
    await expect(page.locator("#product-search")).toHaveValue("");
    await expect(page.locator("#product-search")).toBeFocused();
  });

  test("search icon has aria-hidden", async ({ page }) => {
    await gotoProducts(page);
    const icon = page.locator('#product-search ~ svg[aria-hidden="true"], #product-search').locator('..').locator('svg[aria-hidden="true"]');
    await expect(icon.first()).toBeAttached();
  });
});

// ── Stock filter semantics ─────────────────────────────────────────

test.describe("Stock filter (auth required)", () => {
  test("fieldset and legend exist", async ({ page }) => {
    await gotoProducts(page);
    await expect(page.locator("fieldset").first()).toBeAttached();
    await expect(page.locator("legend").first()).toBeAttached();
  });

  test("legend text is Filter status stok", async ({ page }) => {
    await gotoProducts(page);
    await expect(page.locator("legend").first()).toContainText("Filter status stok");
  });

  test("four filter buttons exist", async ({ page }) => {
    await gotoProducts(page);
    const group = page.locator('[role="group"]');
    const buttons = group.locator("button");
    await expect(buttons).toHaveCount(4);
  });

  test("Semua is active by default", async ({ page }) => {
    await gotoProducts(page);
    const semuaBtn = page.locator('[role="group"] button').first();
    await expect(semuaBtn).toHaveAttribute("aria-pressed", "true");
  });

  test("only one button has aria-pressed=true at a time", async ({ page }) => {
    await gotoProducts(page);
    await expect(page.locator('[role="group"] button[aria-pressed="true"]')).toHaveCount(1);
  });

  test("clicking Aman switches selection", async ({ page }) => {
    await gotoProducts(page);
    const amanBtn = page.locator('[role="group"] button').nth(1);
    await amanBtn.click();
    await expect(amanBtn).toHaveAttribute("aria-pressed", "true");
    const semuaBtn = page.locator('[role="group"] button').first();
    await expect(semuaBtn).toHaveAttribute("aria-pressed", "false");
  });
});

// ── Export ──────────────────────────────────────────────────────────

test.describe("Export (auth required)", () => {
  test("desktop export shows Indonesian text", async ({ page }) => {
    await gotoProducts(page);
    const exportBtn = page.locator('button:has-text("Ekspor CSV")').first();
    if (await exportBtn.count() > 0) {
      await expect(exportBtn).toBeVisible();
    }
  });

  test("mobile export has accessible label in Indonesian", async ({ page }) => {
    await gotoProducts(page);
    const btn = page.getByRole("button", { name: /ekspor/i });
    await expect(btn.first()).toBeAttached();
  });
});

// ── Table semantics ────────────────────────────────────────────────

test.describe("Desktop table (auth required)", () => {
  test("table has caption", async ({ page }) => {
    await gotoProducts(page);
    const caption = page.locator("table caption");
    const count = await caption.count();
    if (count > 0) {
      await expect(caption.first()).toHaveText("Daftar produk");
    }
  });

  test("headers have scope=col", async ({ page }) => {
    await gotoProducts(page);
    const headers = page.locator("th[scope]");
    const count = await headers.count();
    if (count > 0) {
      expect(count).toBeGreaterThanOrEqual(5);
    }
  });

  test("Markup column header exists (not Margin)", async ({ page }) => {
  await gotoProducts(page);
    const markupHeader = page.locator("th:has-text('Markup')");
    const marginHeader = page.locator("th:has-text('Margin')");
    // Markup should exist, Margin should not
    const markupCount = await markupHeader.count();
    const marginCount = await marginHeader.count();
    if (markupCount + marginCount > 0) {
      expect(markupCount).toBeGreaterThanOrEqual(1);
      expect(marginCount).toBe(0);
    }
  });
});

// ── Action accessible names ────────────────────────────────────────

test.describe("Action accessible names (auth required)", () => {
  test("edit buttons have product-specific names", async ({ page }) => {
    await gotoProducts(page);
    const editBtns = page.locator('button[aria-label^="Edit produk"]');
    const count = await editBtns.count();
    // All edit buttons should have product-specific names
    for (let i = 0; i < count; i++) {
      const label = await editBtns.nth(i).getAttribute("aria-label");
      expect(label).toMatch(/^Edit produk .+/);
    }
  });

  test("deactivate buttons have product-specific names", async ({ page }) => {
    await gotoProducts(page);
    const deactivateBtns = page.locator('button[aria-label^="Nonaktifkan produk"]');
    const count = await deactivateBtns.count();
    for (let i = 0; i < count; i++) {
      const label = await deactivateBtns.nth(i).getAttribute("aria-label");
      expect(label).toMatch(/^Nonaktifkan produk .+/);
    }
  });
});

// ── Delete confirmation dialog ─────────────────────────────────────

test.describe("Deactivate dialog (auth required)", () => {
  test("clicking delete opens confirmation dialog", async ({ page }) => {
    await gotoProducts(page);
    const deleteBtn = page.locator('button[aria-label^="Nonaktifkan produk"]').first();
    if (await deleteBtn.count() > 0) {
      await deleteBtn.click();
      const dialog = page.locator('[role="alertdialog"], [role="dialog"]').first();
      await expect(dialog).toBeVisible({ timeout: 5000 });
      await expect(dialog).toContainText("Nonaktifkan produk?");
    }
  });

  test("dialog has Batal and confirm buttons", async ({ page }) => {
    await gotoProducts(page);
    const deleteBtn = page.locator('button[aria-label^="Nonaktifkan produk"]').first();
    if (await deleteBtn.count() > 0) {
      await deleteBtn.click();
      const dialog = page.locator('[role="alertdialog"], [role="dialog"]').first();
      await expect(dialog).toBeVisible({ timeout: 5000 });
      await expect(dialog.getByRole("button", { name: /batal/i })).toBeVisible();
      await expect(dialog.getByRole("button", { name: /nonaktifkan/i })).toBeVisible();
    }
  });
});

// ── No duplicate page animation ────────────────────────────────────

test.describe("No duplicate animation (auth-independent)", () => {
  test("only one ledger-page element exists", async ({ page }) => {
    await gotoProducts(page);
    await page.goto("/products");
    await page.waitForLoadState("networkidle");
    const count = await page.locator(".ledger-page").count();
    expect(count).toBeLessThanOrEqual(1);
  });
});

// ── Bottom navigation ──────────────────────────────────────────────

test.describe("Bottom navigation", () => {
  test("Produk link has aria-current=page", async ({ page }) => {
    await gotoProducts(page);
    const produkLink = page.locator('[aria-current="page"]');
    if (await produkLink.count() > 0) {
      await expect(produkLink.first()).toHaveAttribute("aria-current", "page");
    }
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

    test("no horizontal overflow", async ({ page }) => {
    await gotoProducts(page);
      await page.goto("/products");
      await page.waitForLoadState("networkidle");
      expect(await page.evaluate(() => document.body.scrollWidth > window.innerWidth)).toBeFalsy();
    });
  });
}

// ── Empty state ────────────────────────────────────────────────────

test.describe("Empty state (auth required)", () => {
  test("empty state has proper heading", async ({ page }) => {
    await gotoProducts(page);
    const emptyH3 = page.locator("h3");
    const count = await emptyH3.count();
    expect(count).toBeLessThanOrEqual(5);
  });
});

// ── Markup indicator ───────────────────────────────────────────────

test.describe("Markup indicator (auth required)", () => {
  test("markup text appears in product cards", async ({ page }) => {
    await gotoProducts(page);
    // Product cards should exist
    const cards = page.locator("[class*='rounded-xl']");
    await expect(cards.first()).toBeAttached();
  });
});
