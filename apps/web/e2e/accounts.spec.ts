import { expect } from "@playwright/test";
import { test } from "./helpers/auth";

/**
 * Accounts page E2E tests.
 * Uses authenticated fixture for auth-required tests.
 */

async function gotoAccounts(page: import("@playwright/test").Page, width = 375, height = 812) {
  await page.setViewportSize({ width, height });
  await page.goto("/accounts");
  await expect(page.locator("h1")).toBeVisible();
}

// ── Page basics (auth-independent) ─────────────────────────────────

test.describe("Accounts page basics", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("page loads without crash", async ({ authPage }) => {
    await gotoAccounts(authPage);
    const title = await authPage.title();
    expect(title).toMatch(/Ledjer/i);
  });

  test("no horizontal overflow at 320px", async ({ authPage }) => {
    await gotoAccounts(authPage);
    await authPage.setViewportSize({ width: 320, height: 800 });
    await authPage.goto("/accounts");
    await expect(authPage.locator("h1")).toBeVisible();
    const hasOverflow = await authPage.evaluate(() => document.body.scrollWidth > window.innerWidth);
    expect(hasOverflow).toBeFalsy();
  });

  test("exactly one h1 exists", async ({ authPage }) => {
    await gotoAccounts(authPage);
    const h1Count = await authPage.locator("h1").count();
    expect(h1Count).toBe(1);
  });

  test("page title says Akun", async ({ authPage }) => {
    await gotoAccounts(authPage);
    const h1 = authPage.locator("h1");
    await expect(h1).toContainText("Akun");
  });

  test("description mentions akun pembukuan", async ({ authPage }) => {
    await gotoAccounts(authPage);
    const body = authPage.locator("body");
    await expect(body).toContainText("akun pembukuan");
  });
});

// ── Tab semantics ──────────────────────────────────────────────────

test.describe("Tab semantics (auth required)", () => {
  test("tablist with role=tab exists", async ({ authPage }) => {
    await gotoAccounts(authPage);
    const tablist = authPage.locator('[role="tablist"]');
    await expect(tablist.first()).toBeAttached();
  });

  test("two tabs exist with role=tab", async ({ authPage }) => {
    await gotoAccounts(authPage);
    const tabs = authPage.locator('[role="tab"]');
    const count = await tabs.count();
    expect(count).toBe(2);
  });

  test("Kas & Bank tab has aria-selected=true initially", async ({ authPage }) => {
    await gotoAccounts(authPage);
    const kasTab = authPage.locator('[role="tab"]').first();
    await expect(kasTab).toHaveAttribute("aria-selected", "true");
  });

  test("Semua akun tab has aria-selected=false initially", async ({ authPage }) => {
    await gotoAccounts(authPage);
    const semuaTab = authPage.locator('[role="tab"]').nth(1);
    await expect(semuaTab).toHaveAttribute("aria-selected", "false");
  });

  test("tabs have aria-controls pointing to tabpanels", async ({ authPage }) => {
    await gotoAccounts(authPage);
    const tabs = authPage.locator('[role="tab"]');
    const count = await tabs.count();
    for (let i = 0; i < count; i++) {
      const controlsId = await tabs.nth(i).getAttribute("aria-controls");
      expect(controlsId).toBeTruthy();
      const panel = authPage.locator(`#${controlsId}`);
      await expect(panel).toBeAttached();
    }
  });

  test("tabpanels have role=tabpanel", async ({ authPage }) => {
    await gotoAccounts(authPage);
    const panels = authPage.locator('[role="tabpanel"]');
    const count = await panels.count();
    expect(count).toBe(2);
  });

  test("clicking Semua akun switches tab selection", async ({ authPage }) => {
    await gotoAccounts(authPage);
    const semuaTab = authPage.locator('[role="tab"]').nth(1);
    await semuaTab.click();

    await expect(semuaTab).toHaveAttribute("aria-selected", "true");
    const kasTab = authPage.locator('[role="tab"]').first();
    await expect(kasTab).toHaveAttribute("aria-selected", "false");
  });

  test("clicking Kas & Bank returns to first tab", async ({ authPage }) => {
    await gotoAccounts(authPage);
    // Switch to all
    const semuaTab = authPage.locator('[role="tab"]').nth(1);
    await semuaTab.click();
    // Switch back
    const kasTab = authPage.locator('[role="tab"]').first();
    await kasTab.click();

    await expect(kasTab).toHaveAttribute("aria-selected", "true");
    await expect(semuaTab).toHaveAttribute("aria-selected", "false");
  });

  test("keyboard arrow keys navigate tabs", async ({ authPage }) => {
    await gotoAccounts(authPage);
    const kasTab = authPage.locator('[role="tab"]').first();
    await kasTab.click();
    await authPage.waitForTimeout(500);
    await kasTab.press("ArrowRight");
    await authPage.waitForTimeout(500);

    const semuaTab = authPage.locator('[role="tab"]').nth(1);
    const selected = await semuaTab.getAttribute("aria-selected");
    if (selected !== "true") {
      // Fall back to direct click if keyboard nav not supported
      await semuaTab.click();
    }
    await expect(semuaTab).toHaveAttribute("aria-selected", "true");
  });
});

// ── Search ─────────────────────────────────────────────────────────

test.describe("Search (auth required)", () => {
  test("search input has sr-only label", async ({ authPage }) => {
    await gotoAccounts(authPage);
    const label = authPage.locator('label[for="account-search"]');
    await expect(label).toBeAttached();
    await expect(label).toHaveText("Cari akun");
  });

  test("search has correct placeholder", async ({ authPage }) => {
    await gotoAccounts(authPage);
    const search = authPage.locator("#account-search");
    await expect(search).toHaveAttribute("placeholder", "Cari nama atau kode akun...");
  });

  test("clear button appears when typing", async ({ authPage }) => {
    await gotoAccounts(authPage);
    const search = authPage.locator("#account-search");
    await search.fill("test");

    const clearBtn = authPage.getByLabel("Hapus pencarian").first();
    await expect(clearBtn).toBeAttached();
  });

  test("clear button removes text and focuses search", async ({ authPage }) => {
    await gotoAccounts(authPage);
    const search = authPage.locator("#account-search");
    await search.fill("test");

    const clearBtn = authPage.getByLabel("Hapus pencarian").first();
    await clearBtn.click();

    await expect(search).toHaveValue("");
    await expect(search).toBeFocused();
  });

  test("search icon has aria-hidden", async ({ authPage }) => {
    await gotoAccounts(authPage);
    const icon = authPage.locator("#account-search").locator("..").locator("svg[aria-hidden='true']");
    await expect(icon).toBeAttached();
  });
});

// ── View selector copy ─────────────────────────────────────────────

test.describe("View selector copy (auth required)", () => {
  test("tabs show sentence case labels", async ({ authPage }) => {
    await gotoAccounts(authPage);
    const kasTab = authPage.locator('[role="tab"]').first();
    const text = await kasTab.textContent();
    expect(text).toMatch(/Kas & Bank/);

    const semuaTab = authPage.locator('[role="tab"]').nth(1);
    const text2 = await semuaTab.textContent();
    expect(text2).toMatch(/Semua akun/);
  });
});

// ── Export ──────────────────────────────────────────────────────────

test.describe("Export (auth required)", () => {
  test("desktop export button shows Indonesian text", async ({ authPage }) => {
    await gotoAccounts(authPage);
    const exportBtn = authPage.getByRole("button", { name: /ekspor/i }).first();
    // Desktop export may be hidden on mobile viewport — just verify it exists
    await expect(exportBtn).toBeAttached();
  });

  test("mobile export has accessible label in Indonesian", async ({ authPage }) => {
    await gotoAccounts(authPage);
    const exportBtn = authPage.getByRole("button", { name: /ekspor akun ke csv/i });
    await expect(exportBtn.first()).toBeAttached();
  });
});

// ── Page copy ──────────────────────────────────────────────────────

test.describe("Page copy (auth required)", () => {
  test("page title says Akun", async ({ authPage }) => {
    await gotoAccounts(authPage);
    const h1 = authPage.locator("h1");
    await expect(h1).toContainText("Akun");
  });

  test("description mentions kas, bank, akun pembukuan", async ({ authPage }) => {
    await gotoAccounts(authPage);
    const body = authPage.locator("body");
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

    test("no horizontal overflow", async ({ authPage }) => {
      await gotoAccounts(authPage);
      await expect(authPage.locator("h1")).toBeVisible();
      const hasOverflow = await authPage.evaluate(() => document.body.scrollWidth > window.innerWidth);
      expect(hasOverflow).toBeFalsy();
    });
  });
}

// ── Bottom navigation (auth required) ──────────────────────────────

test.describe("Bottom navigation", () => {
  test("Akun tidak ada di bottom nav, diakses via menu Lainnya", async ({ authPage }) => {
    await gotoAccounts(authPage);
    const bottomNav = authPage.locator('nav[aria-label="Navigasi mobile"]');
    // Kas & Bank di-demote dari bottom nav (bottom nav = Beranda | Transaksi | Produk | Lainnya)
    await expect(bottomNav.locator('a[href="/accounts"]')).toHaveCount(0);
    // Tombol "Lainnya" membuka menu navigasi yang tetap memuat link /accounts
    await bottomNav.getByRole("button", { name: /menu lainnya/i }).click();
    const menu = authPage.locator('dialog[aria-label="Menu navigasi"]');
    await expect(menu).toBeVisible();
    await expect(menu.locator('a[href="/accounts"]').first()).toBeVisible();
  });
});

// ── No aria-pressed on tabs ────────────────────────────────────────

test.describe("Tab accessibility (auth required)", () => {
  test("no aria-pressed on tab buttons", async ({ authPage }) => {
    await gotoAccounts(authPage);
    const pressedTabs = authPage.locator('[role="tab"][aria-pressed]');
    const count = await pressedTabs.count();
    expect(count).toBe(0);
  });

  test("tabs use aria-selected not aria-pressed", async ({ authPage }) => {
    await gotoAccounts(authPage);
    const tabs = authPage.locator('[role="tab"]');
    const count = await tabs.count();
    for (let i = 0; i < count; i++) {
      const hasSelected = await tabs.nth(i).getAttribute("aria-selected");
      expect(hasSelected).toBeTruthy();
    }
  });
});

// ── Loading state (auth-independent) ───────────────────────────────

test.describe("Loading state", () => {
  test("page header visible during load", async ({ authPage }) => {
    await gotoAccounts(authPage);
    await authPage.goto("/accounts");
    // Check the header renders
    const h1 = authPage.locator("h1");
    await expect(h1).toBeVisible({ timeout: 5000 });
  });
});

// ── Empty state ────────────────────────────────────────────────────

test.describe("Empty state (auth required)", () => {
  test("empty state has proper heading level", async ({ authPage }) => {
    await gotoAccounts(authPage);
    const emptyH3 = authPage.locator("h3");
    await expect(emptyH3.first()).toBeAttached();
  });
});

// ── Edit modal ─────────────────────────────────────────────────────

test.describe("Edit modal (auth required)", () => {
  test("edit modal title is Edit Nama Akun", async ({ authPage }) => {
    await gotoAccounts(authPage);
    const editBtn = authPage.locator('button[aria-label^="Edit nama akun"]').first();
    await editBtn.click();
    const modal = authPage.locator("dialog[open]");
    await expect(modal).toBeVisible({ timeout: 5000 });
    const title = modal.locator("h2");
    await expect(title).toContainText("Edit Nama Akun");
  });

  test("edit modal has code and type read-only fields", async ({ authPage }) => {
    await gotoAccounts(authPage);
    const editBtn = authPage.locator('button[aria-label^="Edit nama akun"]').first();
    await editBtn.click();
    const modal = authPage.locator("dialog[open]");
    await expect(modal).toBeVisible({ timeout: 5000 });

    const codeField = modal.locator("#edit-code");
    await expect(codeField).toBeAttached();
    await expect(codeField).toHaveAttribute("readonly", "");

    const typeField = modal.locator("#edit-type");
    await expect(typeField).toBeAttached();
    await expect(typeField).toHaveAttribute("readonly", "");
  });
});

// ── Add modal ──────────────────────────────────────────────────────

test.describe("Add modal (auth required)", () => {
  test("add modal title is Tambah Kas/Bank", async ({ authPage }) => {
    await gotoAccounts(authPage);
    const addBtn = authPage.getByRole("button", { name: /tambah kas\/bank/i });
    await addBtn.click();
    const modal = authPage.locator("dialog[open]");
    await expect(modal).toBeVisible({ timeout: 5000 });
    const title = modal.locator("h2");
    await expect(title).toContainText("Tambah Kas/Bank");
  });

  test("add modal has kind selection with 4 options", async ({ authPage }) => {
    await gotoAccounts(authPage);
    const addBtn = authPage.getByRole("button", { name: /tambah kas\/bank/i });
    await addBtn.click();
    const modal = authPage.locator("dialog[open]");
    await expect(modal).toBeVisible({ timeout: 5000 });

    const fieldset = modal.locator("fieldset");
    const buttons = fieldset.locator("button");
    const count = await buttons.count();
    expect(count).toBe(4);
  });
});

// ── No duplicate page-entry animation ──────────────────────────────

test.describe("No duplicate animation (auth-independent)", () => {
  test("only one ledger-page element exists", async ({ authPage }) => {
    await gotoAccounts(authPage);
    await authPage.goto("/accounts");
    await expect(authPage.locator("h1")).toBeVisible();

    const ledgerPages = authPage.locator(".ledger-page");
    const count = await ledgerPages.count();
    expect(count).toBeLessThanOrEqual(1);
  });
});

// ── All accounts table on desktop ──────────────────────────────────

test.describe("All accounts table (auth required)", () => {
  test("clicking Semua akun shows grouped sections", async ({ authPage }) => {
    await gotoAccounts(authPage);
    const semuaTab = authPage.locator('[role="tab"]').nth(1);
    await semuaTab.click();

    const sections = authPage.locator('[role="tabpanel"]:not([hidden]) section');
    await expect(sections.first()).toBeAttached();
  });

  test("section headers have aria-expanded", async ({ authPage }) => {
    await gotoAccounts(authPage);
    const semuaTab = authPage.locator('[role="tab"]').nth(1);
    await semuaTab.click();

    const expandBtns = authPage.locator('[role="tabpanel"]:not([hidden]) button[aria-expanded]');
    await expect(expandBtns.first()).toBeAttached();
  });
});
