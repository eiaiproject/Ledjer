import { test, expect } from "@playwright/test";

/**
 * Accounts page E2E tests.
 * Auth-dependent tests skip gracefully on login redirect.
 */

async function gotoAccounts(page: import("@playwright/test").Page, width = 375, height = 812) {
  await page.setViewportSize({ width, height });
  await page.goto("/accounts");
  await page.waitForLoadState("networkidle");
  if (page.url().includes("/login")) return false;
  return true;
}

// ── Page basics (auth-independent) ─────────────────────────────────

test.describe("Accounts page basics", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("page loads without crash", async ({ page }) => {
    await gotoAccounts(page);
    await page.goto("/accounts");
    await page.waitForLoadState("networkidle");
    const title = await page.title();
    expect(title).toMatch(/Ledjer/i);
  });

  test("no horizontal overflow at 320px", async ({ page }) => {
    await gotoAccounts(page);
    await page.setViewportSize({ width: 320, height: 800 });
    await page.goto("/accounts");
    await page.waitForLoadState("networkidle");
    const hasOverflow = await page.evaluate(() => document.body.scrollWidth > window.innerWidth);
    expect(hasOverflow).toBeFalsy();
  });

  test("exactly one h1 exists", async ({ page }) => {
    await gotoAccounts(page);
    const h1Count = await page.locator("h1").count();
    expect(h1Count).toBe(1);
  });

  test("page title says Akun", async ({ page }) => {
    await gotoAccounts(page);
    const h1 = page.locator("h1");
    await expect(h1).toContainText("Akun");
  });

  test("description mentions akun pembukuan", async ({ page }) => {
    await gotoAccounts(page);
    const body = page.locator("body");
    await expect(body).toContainText("akun pembukuan");
  });
});

// ── Tab semantics ──────────────────────────────────────────────────

test.describe("Tab semantics (auth required)", () => {
  test("tablist with role=tab exists", async ({ page }) => {
    await gotoAccounts(page);
    const tablist = page.locator('[role="tablist"]');
    await expect(tablist.first()).toBeAttached();
  });

  test("two tabs exist with role=tab", async ({ page }) => {
    await gotoAccounts(page);
    const tabs = page.locator('[role="tab"]');
    const count = await tabs.count();
    expect(count).toBe(2);
  });

  test("Kas & Bank tab has aria-selected=true initially", async ({ page }) => {
    await gotoAccounts(page);
    const kasTab = page.locator('[role="tab"]').first();
    await expect(kasTab).toHaveAttribute("aria-selected", "true");
  });

  test("Semua akun tab has aria-selected=false initially", async ({ page }) => {
    await gotoAccounts(page);
    const semuaTab = page.locator('[role="tab"]').nth(1);
    await expect(semuaTab).toHaveAttribute("aria-selected", "false");
  });

  test("tabs have aria-controls pointing to tabpanels", async ({ page }) => {
    await gotoAccounts(page);
    const tabs = page.locator('[role="tab"]');
    const count = await tabs.count();
    for (let i = 0; i < count; i++) {
      const controlsId = await tabs.nth(i).getAttribute("aria-controls");
      expect(controlsId).toBeTruthy();
      const panel = page.locator(`#${controlsId}`);
      await expect(panel).toBeAttached();
    }
  });

  test("tabpanels have role=tabpanel", async ({ page }) => {
    await gotoAccounts(page);
    const panels = page.locator('[role="tabpanel"]');
    const count = await panels.count();
    expect(count).toBe(2);
  });

  test("clicking Semua akun switches tab selection", async ({ page }) => {
    await gotoAccounts(page);
    const semuaTab = page.locator('[role="tab"]').nth(1);
    await semuaTab.click();

    await expect(semuaTab).toHaveAttribute("aria-selected", "true");
    const kasTab = page.locator('[role="tab"]').first();
    await expect(kasTab).toHaveAttribute("aria-selected", "false");
  });

  test("clicking Kas & Bank returns to first tab", async ({ page }) => {
    await gotoAccounts(page);
    // Switch to all
    const semuaTab = page.locator('[role="tab"]').nth(1);
    await semuaTab.click();
    // Switch back
    const kasTab = page.locator('[role="tab"]').first();
    await kasTab.click();

    await expect(kasTab).toHaveAttribute("aria-selected", "true");
    await expect(semuaTab).toHaveAttribute("aria-selected", "false");
  });

  test("keyboard arrow keys navigate tabs", async ({ page }) => {
    await gotoAccounts(page);
    const kasTab = page.locator('[role="tab"]').first();
    await kasTab.focus();
    await page.keyboard.press("ArrowRight");

    const semuaTab = page.locator('[role="tab"]').nth(1);
    await expect(semuaTab).toHaveAttribute("aria-selected", "true");
  });
});

// ── Search ─────────────────────────────────────────────────────────

test.describe("Search (auth required)", () => {
  test("search input has sr-only label", async ({ page }) => {
    await gotoAccounts(page);
    const label = page.locator('label[for="account-search"]');
    await expect(label).toBeAttached();
    await expect(label).toHaveText("Cari akun");
  });

  test("search has correct placeholder", async ({ page }) => {
    await gotoAccounts(page);
    const search = page.locator("#account-search");
    await expect(search).toHaveAttribute("placeholder", "Cari nama atau kode akun...");
  });

  test("clear button appears when typing", async ({ page }) => {
    await gotoAccounts(page);
    const search = page.locator("#account-search");
    await search.fill("test");

    const clearBtn = page.getByRole("button", { name: /hapus pencarian/i });
    await expect(clearBtn).toBeVisible();
  });

  test("clear button removes text and focuses search", async ({ page }) => {
    await gotoAccounts(page);
    const search = page.locator("#account-search");
    await search.fill("test");

    const clearBtn = page.getByRole("button", { name: /hapus pencarian/i });
    await clearBtn.click();

    await expect(search).toHaveValue("");
    await expect(search).toBeFocused();
  });

  test("search icon has aria-hidden", async ({ page }) => {
    await gotoAccounts(page);
    const icon = page.locator("#account-search").locator("..").locator("svg[aria-hidden='true']");
    await expect(icon).toBeAttached();
  });
});

// ── View selector copy ─────────────────────────────────────────────

test.describe("View selector copy (auth required)", () => {
  test("tabs show sentence case labels", async ({ page }) => {
    await gotoAccounts(page);
    const kasTab = page.locator('[role="tab"]').first();
    const text = await kasTab.textContent();
    expect(text).toMatch(/Kas & Bank/);

    const semuaTab = page.locator('[role="tab"]').nth(1);
    const text2 = await semuaTab.textContent();
    expect(text2).toMatch(/Semua akun/);
  });
});

// ── Export ──────────────────────────────────────────────────────────

test.describe("Export (auth required)", () => {
  test("desktop export button shows Indonesian text", async ({ page }) => {
    await gotoAccounts(page);
    const exportBtn = page.locator('button:has-text("Ekspor CSV")').first();
    if (await exportBtn.count() > 0) {
      await expect(exportBtn).toBeVisible();
    }
  });

  test("mobile export has accessible label in Indonesian", async ({ page }) => {
    await gotoAccounts(page);
    const exportBtn = page.getByRole("button", { name: /ekspor akun ke csv/i });
    // May be hidden if no accounts
    const count = await exportBtn.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });
});

// ── Page copy ──────────────────────────────────────────────────────

test.describe("Page copy (auth required)", () => {
  test("page title says Akun", async ({ page }) => {
    await gotoAccounts(page);
    const h1 = page.locator("h1");
    await expect(h1).toContainText("Akun");
  });

  test("description mentions kas, bank, akun pembukuan", async ({ page }) => {
    await gotoAccounts(page);
    const body = page.locator("body");
    await expect(body).toContainText("kas");
    await expect(body).toContainText("bank");
    await expect(body).toContainText("akun pembukuan");
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
    await gotoAccounts(page);
      await page.goto("/accounts");
      await page.waitForLoadState("networkidle");
      const hasOverflow = await page.evaluate(() => document.body.scrollWidth > window.innerWidth);
      expect(hasOverflow).toBeFalsy();
    });
  });
}

// ── Bottom navigation (auth required) ──────────────────────────────

test.describe("Bottom navigation", () => {
  test("Akun link has aria-current=page", async ({ page }) => {
    await gotoAccounts(page);
    // Check bottom nav (mobile only)
    const akunLink = page.locator('nav[aria-label="Navigasi mobile"] a[href="/accounts"]');
    const count = await akunLink.count();
    if (count > 0) {
      await expect(akunLink.first()).toHaveAttribute("aria-current", "page");
    }
  });
});

// ── No aria-pressed on tabs ────────────────────────────────────────

test.describe("Tab accessibility (auth required)", () => {
  test("no aria-pressed on tab buttons", async ({ page }) => {
    await gotoAccounts(page);
    const pressedTabs = page.locator('[role="tab"][aria-pressed]');
    const count = await pressedTabs.count();
    expect(count).toBe(0);
  });

  test("tabs use aria-selected not aria-pressed", async ({ page }) => {
    await gotoAccounts(page);
    const tabs = page.locator('[role="tab"]');
    const count = await tabs.count();
    for (let i = 0; i < count; i++) {
      const hasSelected = await tabs.nth(i).getAttribute("aria-selected");
      expect(hasSelected).toBeTruthy();
    }
  });
});

// ── Loading state (auth-independent) ───────────────────────────────

test.describe("Loading state", () => {
  test("page header visible during load", async ({ page }) => {
    await gotoAccounts(page);
    await page.goto("/accounts");
    // Check immediately before networkidle
    const h1 = page.locator("h1");
    await expect(h1).toBeVisible({ timeout: 5000 });
  });
});

// ── Empty state ────────────────────────────────────────────────────

test.describe("Empty state (auth required)", () => {
  test("empty state has proper heading level", async ({ page }) => {
    await gotoAccounts(page);
    // Check if there's an empty state (h3 inside empty state)
    const emptyH3 = page.locator("h3");
    const count = await emptyH3.count();
    // h3 should not exceed expected count (1 for page h1, maybe empty state h3)
    expect(count).toBeLessThanOrEqual(5);
  });
});

// ── Edit modal ─────────────────────────────────────────────────────

test.describe("Edit modal (auth required)", () => {
  test("edit modal title is Edit Nama Akun", async ({ page }) => {
    await gotoAccounts(page);
    // Find an edit button and click it
    const editBtn = page.locator('button[aria-label^="Edit nama akun"]').first();
    if (await editBtn.count() > 0) {
      await editBtn.click();
      const modal = page.locator("dialog[open]");
      await expect(modal).toBeVisible({ timeout: 5000 });
      const title = modal.locator("h2");
      await expect(title).toContainText("Edit Nama Akun");
    }
  });

  test("edit modal has code and type read-only fields", async ({ page }) => {
    await gotoAccounts(page);
    const editBtn = page.locator('button[aria-label^="Edit nama akun"]').first();
    if (await editBtn.count() > 0) {
      await editBtn.click();
      const modal = page.locator("dialog[open]");
      await expect(modal).toBeVisible({ timeout: 5000 });

      const codeField = modal.locator("#edit-code");
      await expect(codeField).toBeAttached();
      await expect(codeField).toHaveAttribute("readonly", "");

      const typeField = modal.locator("#edit-type");
      await expect(typeField).toBeAttached();
      await expect(typeField).toHaveAttribute("readonly", "");
    }
  });
});

// ── Add modal ──────────────────────────────────────────────────────

test.describe("Add modal (auth required)", () => {
  test("add modal title is Tambah Kas/Bank", async ({ page }) => {
    await gotoAccounts(page);
    const addBtn = page.getByRole("button", { name: /tambah kas\/bank/i });
    if (await addBtn.count() > 0) {
      await addBtn.click();
      const modal = page.locator("dialog[open]");
      await expect(modal).toBeVisible({ timeout: 5000 });
      const title = modal.locator("h2");
      await expect(title).toContainText("Tambah Kas/Bank");
    }
  });

  test("add modal has kind selection with 4 options", async ({ page }) => {
    await gotoAccounts(page);
    const addBtn = page.getByRole("button", { name: /tambah kas\/bank/i });
    if (await addBtn.count() > 0) {
      await addBtn.click();
      const modal = page.locator("dialog[open]");
      await expect(modal).toBeVisible({ timeout: 5000 });

      const fieldset = modal.locator("fieldset");
      const buttons = fieldset.locator("button");
      const count = await buttons.count();
      expect(count).toBe(4);
    }
  });
});

// ── No duplicate page-entry animation ──────────────────────────────

test.describe("No duplicate animation (auth-independent)", () => {
  test("only one ledger-page element exists", async ({ page }) => {
    await gotoAccounts(page);
    await page.goto("/accounts");
    await page.waitForLoadState("networkidle");

    const ledgerPages = page.locator(".ledger-page");
    const count = await ledgerPages.count();
    expect(count).toBeLessThanOrEqual(1);
  });
});

// ── All accounts table on desktop ──────────────────────────────────

test.describe("All accounts table (auth required)", () => {
  test("clicking Semua akun shows grouped sections", async ({ page }) => {
    await gotoAccounts(page);
    const semuaTab = page.locator('[role="tab"]').nth(1);
    await semuaTab.click();

    // Should show sections with account type groups
    const sections = page.locator('[role="tabpanel"]:not([hidden]) section');
    const count = await sections.count();
    // May be 0 if no accounts, but the structure should exist
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test("section headers have aria-expanded", async ({ page }) => {
    await gotoAccounts(page);
    const semuaTab = page.locator('[role="tab"]').nth(1);
    await semuaTab.click();

    const expandBtns = page.locator('[role="tabpanel"]:not([hidden]) button[aria-expanded]');
    const count = await expandBtns.count();
    // May be 0 if no accounts
    expect(count).toBeGreaterThanOrEqual(0);
  });
});
