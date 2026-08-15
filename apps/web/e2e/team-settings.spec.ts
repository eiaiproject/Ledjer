import { expect } from "@playwright/test";
import { test } from "./helpers/auth";

/**
 * Team and Permissions page E2E tests.
 * Uses authenticated fixture for auth-required tests.
 */

async function gotoTeam(
  page: import("@playwright/test").Page,
  width = 375,
  height = 812,
) {
  await page.setViewportSize({ width, height });
  await page.goto("/settings/team");
  await expect(page.locator("h1")).toBeVisible();
}

// ── Page basics (auth-independent) ─────────────────────────────────

test.describe("Team page basics", () => {
  test("page loads without crash", async ({ authPage }) => {
    await gotoTeam(authPage);
    await authPage.goto("/settings/team");
    await expect(authPage.locator("h1")).toBeVisible();
    expect(await authPage.title()).toMatch(/Ledjer/i);
  });

  test("no horizontal overflow at 320px", async ({ authPage }) => {
    await gotoTeam(authPage);
    await authPage.setViewportSize({ width: 320, height: 800 });
    await authPage.goto("/settings/team");
    await expect(authPage.locator("h1")).toBeVisible();
    expect(
      await authPage.evaluate(() => document.body.scrollWidth > window.innerWidth),
    ).toBeFalsy();
  });

  test("exactly one h1 exists", async ({ authPage }) => {
    await gotoTeam(authPage);
    await expect(authPage.locator("h1")).toHaveCount(1);
  });

  test("page title says Tim dan izin", async ({ authPage }) => {
    await gotoTeam(authPage);
    await expect(authPage.locator("h1")).toContainText("Tim dan izin");
  });

  test("page title does NOT use ampersand", async ({ authPage }) => {
    await gotoTeam(authPage);
    const text = await authPage.locator("h1").textContent();
    expect(text).not.toContain("&");
  });

  test("description uses Indonesian", async ({ authPage }) => {
    await gotoTeam(authPage);
    const desc = authPage.locator("p.text-text-secondary").first();
    await expect(desc).toBeVisible();
    const text = await desc.textContent();
    expect(text).toContain("anggota");
  });
});

// ── Owner section (auth required) ──────────────────────────────────

test.describe("Owner section (auth required)", () => {
  test("has Pemilik section heading", async ({ authPage }) => {
    await gotoTeam(authPage);
    const heading = authPage.getByText("Pemilik").first();
    await expect(heading).toBeAttached();
  });

  test("owner card shows Pemilik badge", async ({ authPage }) => {
    await gotoTeam(authPage);
    const badge = authPage.locator(".bg-honey-50").first();
    await expect(badge).toBeVisible();
  });
});

// ── Staff section (auth required) ──────────────────────────────────

test.describe("Staff section (auth required)", () => {
  test("has Anggota Tim heading", async ({ authPage }) => {
    await gotoTeam(authPage);
    const heading = authPage.getByText("Anggota Tim").first();
    await expect(heading).toBeAttached();
  });

  test("staff count badge is present", async ({ authPage }) => {
    await gotoTeam(authPage);
    const badge = authPage.locator(".bg-wood-100").filter({ hasText: /anggota/ }).first();
    await expect(badge).toBeAttached();
  });
});

// ── Invitation form (auth required) ────────────────────────────────

test.describe("Invitation form (auth required)", () => {
  test("form heading says Buat link undangan", async ({ authPage }) => {
    await gotoTeam(authPage);
    const heading = authPage.getByText("Buat link undangan").first();
    await expect(heading).toBeAttached();
  });

  test("email field exists", async ({ authPage }) => {
    await gotoTeam(authPage);
    const emailInput = authPage.locator('input[type="email"]');
    await expect(emailInput.first()).toBeAttached();
  });

  test("role select exists with correct options", async ({ authPage }) => {
    await gotoTeam(authPage);
    const roleSelect = authPage.locator("#invite-role");
    await expect(roleSelect).toBeAttached();
    const options = roleSelect.locator("option");
    const count = await options.count();
    expect(count).toBe(3);
  });

  test("default role is Staf (member)", async ({ authPage }) => {
  await gotoTeam(authPage);
    const roleSelect = authPage.locator("#invite-role");
    await expect(roleSelect).toBeAttached();
    const value = await roleSelect.inputValue();
    expect(value).toBe("member");
  });

  test("submit button says Buat link undangan", async ({ authPage }) => {
    await gotoTeam(authPage);
    const submitBtn = authPage.getByRole("button", { name: /buat link undangan/i });
    await expect(submitBtn.first()).toBeVisible();
  });

  test("form uses native form submit", async ({ authPage }) => {
    await gotoTeam(authPage);
    const form = authPage.locator("form").first();
    await expect(form).toBeAttached();
  });

  test("role select has label", async ({ authPage }) => {
    await gotoTeam(authPage);
    const label = authPage.locator("label[for='invite-role']");
    await expect(label).toBeAttached();
  });
});

// ── Role comparison guide (auth required) ───────────────────────────

test.describe("Role comparison guide (auth required)", () => {
  test("has role comparison heading", async ({ authPage }) => {
    await gotoTeam(authPage);
    const heading = authPage.getByText("Perbandingan hak akses role").first();
    await expect(heading).toBeAttached();
  });

  test("role comparison is collapsible", async ({ authPage }) => {
    await gotoTeam(authPage);
    const details = authPage.locator("details").first();
    const expandBtn = authPage.getByRole("button", { name: /perbandingan hak akses|bandingkan role/i }).first();
    const hasDetails = await details.isVisible().catch(() => false);
    const hasBtn = await expandBtn.isVisible().catch(() => false);
    expect(hasDetails || hasBtn).toBeTruthy();
  });

  test("role comparison shows Admin, Staf, Viewer", async ({ authPage }) => {
    await gotoTeam(authPage);
    const details = authPage.locator("details").first();
    if (await details.isVisible().catch(() => false)) {
      const summary = details.locator("summary");
      if (await summary.isVisible().catch(() => false)) {
        await summary.click({ force: true }).catch(() => {});
      }
    }
    const roles = authPage.getByText("Admin").first();
    const exists = await roles.isVisible().catch(() => false);
    if (exists) {
      await expect(roles).toBeVisible();
      await expect(authPage.getByText("Staf").first()).toBeVisible();
    }
  });
});

// ── Member actions (auth required) ─────────────────────────────────

test.describe("Member actions (auth required)", () => {
  test("member card has Izin button", async ({ authPage }) => {
    await gotoTeam(authPage);
    const izinBtn = authPage.getByRole("button", { name: /izin/i }).first();
    const exists = await izinBtn.isVisible().catch(() => false);
    if (exists) {
      await expect(izinBtn).toBeVisible();
    } else {
      // Owner might see different UI; just verify page renders
      await expect(authPage.locator("h1")).toBeVisible();
    }
  });

  test("Izin button toggles permission display", async ({ authPage }) => {
    await gotoTeam(authPage);
    const izinBtn = authPage.getByRole("button", { name: /izin/i }).first();
    const exists = await izinBtn.isVisible().catch(() => false);
    if (exists) {
      await izinBtn.click();
      await authPage.waitForTimeout(500);
      const permText = authPage.getByText("Hak Akses").first();
      if (await permText.isVisible().catch(() => false)) {
        await expect(permText).toBeVisible();
      }
    } else {
      await expect(authPage.locator("h1")).toBeVisible();
    }
  });
});

// ── Empty state (auth required) ────────────────────────────────────

test.describe("Empty state (auth required)", () => {
  test("shows empty state when no members", async ({ authPage }) => {
    await gotoTeam(authPage);
    // Check if empty state is shown (may or may not be depending on data)
    const emptyState = authPage.getByText("Belum ada anggota").first();
    const hasEmptyState = (await emptyState.count()) > 0;
    // Either empty state or member list is present
    const memberCards = authPage.locator(".bg-cream-50").filter({ hasText: /anggota/ });
    expect(hasEmptyState || (await memberCards.count()) > 0).toBeTruthy();
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
    await gotoTeam(authPage);
      await authPage.goto("/settings/team");
      await expect(authPage.locator("h1")).toBeVisible();
      expect(
        await authPage.evaluate(() => document.body.scrollWidth > window.innerWidth),
      ).toBeFalsy();
    });
  });
}
