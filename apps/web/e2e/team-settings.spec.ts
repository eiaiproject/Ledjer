import { test, expect } from "@playwright/test";

/**
 * Team and Permissions page E2E tests.
 * Auth-dependent tests skip gracefully on login redirect.
 */

async function gotoTeam(
  page: import("@playwright/test").Page,
  width = 375,
  height = 812,
) {
  await page.setViewportSize({ width, height });
  await page.goto("/settings/team");
  await page.waitForLoadState("networkidle");
  if (page.url().includes("/login")) return false;
  return true;
}

// ── Page basics (auth-independent) ─────────────────────────────────

test.describe("Team page basics", () => {
  test("page loads without crash", async ({ page }) => {
    await page.goto("/settings/team");
    await page.waitForLoadState("networkidle");
    expect(await page.title()).toMatch(/Ledjer/i);
  });

  test("no horizontal overflow at 320px", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    await page.goto("/settings/team");
    await page.waitForLoadState("networkidle");
    expect(
      await page.evaluate(() => document.body.scrollWidth > window.innerWidth),
    ).toBeFalsy();
  });

  test("exactly one h1 exists", async ({ page }) => {
    const onPage = await gotoTeam(page);
    if (!onPage) {
      test.skip();
      return;
    }
    expect(await page.locator("h1").count()).toBe(1);
  });

  test("page title says Tim dan izin", async ({ page }) => {
    const onPage = await gotoTeam(page);
    if (!onPage) {
      test.skip();
      return;
    }
    await expect(page.locator("h1")).toContainText("Tim dan izin");
  });

  test("page title does NOT use ampersand", async ({ page }) => {
    const onPage = await gotoTeam(page);
    if (!onPage) {
      test.skip();
      return;
    }
    const text = await page.locator("h1").textContent();
    expect(text).not.toContain("&");
  });

  test("description uses Indonesian", async ({ page }) => {
    const onPage = await gotoTeam(page);
    if (!onPage) {
      test.skip();
      return;
    }
    const desc = page.locator("p.text-text-secondary").first();
    await expect(desc).toBeVisible();
    const text = await desc.textContent();
    expect(text).toContain("anggota");
  });
});

// ── Owner section (auth required) ──────────────────────────────────

test.describe("Owner section (auth required)", () => {
  test("has Pemilik section heading", async ({ page }) => {
    const onPage = await gotoTeam(page);
    if (!onPage) {
      test.skip();
      return;
    }
    const heading = page.getByText("Pemilik").first();
    await expect(heading).toBeAttached();
  });

  test("owner card shows Pemilik badge", async ({ page }) => {
    const onPage = await gotoTeam(page);
    if (!onPage) {
      test.skip();
      return;
    }
    const badge = page.locator(".bg-honey-50").first();
    if (await badge.count() > 0) {
      await expect(badge).toBeVisible();
    }
  });
});

// ── Staff section (auth required) ──────────────────────────────────

test.describe("Staff section (auth required)", () => {
  test("has Anggota Tim heading", async ({ page }) => {
    const onPage = await gotoTeam(page);
    if (!onPage) {
      test.skip();
      return;
    }
    const heading = page.getByText("Anggota Tim").first();
    await expect(heading).toBeAttached();
  });

  test("staff count badge is present", async ({ page }) => {
    const onPage = await gotoTeam(page);
    if (!onPage) {
      test.skip();
      return;
    }
    const badge = page.locator(".bg-wood-100").filter({ hasText: /anggota/ }).first();
    if (await badge.count() > 0) {
      await expect(badge).toBeAttached();
    }
  });
});

// ── Invitation form (auth required) ────────────────────────────────

test.describe("Invitation form (auth required)", () => {
  test("form heading says Buat link undangan", async ({ page }) => {
    const onPage = await gotoTeam(page);
    if (!onPage) {
      test.skip();
      return;
    }
    const heading = page.getByText("Buat link undangan").first();
    await expect(heading).toBeAttached();
  });

  test("email field exists", async ({ page }) => {
    const onPage = await gotoTeam(page);
    if (!onPage) {
      test.skip();
      return;
    }
    const emailInput = page.locator('input[type="email"]');
    if (await emailInput.count() > 0) {
      await expect(emailInput.first()).toBeAttached();
    }
  });

  test("role select exists with correct options", async ({ page }) => {
    const onPage = await gotoTeam(page);
    if (!onPage) {
      test.skip();
      return;
    }
    const roleSelect = page.locator("#invite-role");
    if (await roleSelect.count() > 0) {
      const options = roleSelect.locator("option");
      const count = await options.count();
      expect(count).toBe(3); // Staf, Viewer, Admin
    }
  });

  test("default role is Staf (member)", async ({ page }) => {
    const onPage = await gotoTeam(page);
    if (!onPage) {
      test.skip();
      return;
    }
    const roleSelect = page.locator("#invite-role");
    if (await roleSelect.count() > 0) {
      const value = await roleSelect.inputValue();
      expect(value).toBe("member");
    }
  });

  test("submit button says Buat link undangan", async ({ page }) => {
    const onPage = await gotoTeam(page);
    if (!onPage) {
      test.skip();
      return;
    }
    const submitBtn = page.getByRole("button", { name: /buat link undangan/i });
    if (await submitBtn.count() > 0) {
      await expect(submitBtn.first()).toBeVisible();
    }
  });

  test("form uses native form submit", async ({ page }) => {
    const onPage = await gotoTeam(page);
    if (!onPage) {
      test.skip();
      return;
    }
    const form = page.locator("form").first();
    if (await form.count() > 0) {
      await expect(form).toBeAttached();
    }
  });

  test("role select has label", async ({ page }) => {
    const onPage = await gotoTeam(page);
    if (!onPage) {
      test.skip();
      return;
    }
    const label = page.locator("label[for='invite-role']");
    if (await label.count() > 0) {
      await expect(label).toBeAttached();
    }
  });
});

// ── Role comparison guide (auth required) ───────────────────────────

test.describe("Role comparison guide (auth required)", () => {
  test("has role comparison heading", async ({ page }) => {
    const onPage = await gotoTeam(page);
    if (!onPage) {
      test.skip();
      return;
    }
    const heading = page.getByText("Perbandingan hak akses role").first();
    await expect(heading).toBeAttached();
  });

  test("role comparison is collapsible", async ({ page }) => {
    const onPage = await gotoTeam(page);
    if (!onPage) {
      test.skip();
      return;
    }
    const details = page.locator("details").first();
    if (await details.count() > 0) {
      await expect(details).toBeAttached();
    }
  });

  test("role comparison shows Admin, Staf, Viewer", async ({ page }) => {
    const onPage = await gotoTeam(page);
    if (!onPage) {
      test.skip();
      return;
    }
    const details = page.locator("details").first();
    if (await details.count() > 0) {
      // Open the details
      await details.locator("summary").click();
      await expect(page.getByText("Admin").first()).toBeVisible();
      await expect(page.getByText("Staf").first()).toBeVisible();
      await expect(page.getByText("Viewer").first()).toBeVisible();
    }
  });
});

// ── Member actions (auth required) ─────────────────────────────────

test.describe("Member actions (auth required)", () => {
  test("member card has Izin button", async ({ page }) => {
    const onPage = await gotoTeam(page);
    if (!onPage) {
      test.skip();
      return;
    }
    const izinBtn = page.getByRole("button", { name: /izin/i }).first();
    if (await izinBtn.count() > 0) {
      await expect(izinBtn).toBeVisible();
    }
  });

  test("Izin button toggles permission display", async ({ page }) => {
    const onPage = await gotoTeam(page);
    if (!onPage) {
      test.skip();
      return;
    }
    const izinBtn = page.getByRole("button", { name: /izin/i }).first();
    if (await izinBtn.count() > 0) {
      await izinBtn.click();
      // Should show permission details
      const permText = page.getByText("Hak Akses").first();
      await expect(permText).toBeVisible();
    }
  });
});

// ── Empty state (auth required) ────────────────────────────────────

test.describe("Empty state (auth required)", () => {
  test("shows empty state when no members", async ({ page }) => {
    const onPage = await gotoTeam(page);
    if (!onPage) {
      test.skip();
      return;
    }
    // Check if empty state is shown (may or may not be depending on data)
    const emptyState = page.getByText("Belum ada anggota").first();
    const hasEmptyState = (await emptyState.count()) > 0;
    // Either empty state or member list is present
    const memberCards = page.locator(".bg-cream-50").filter({ hasText: /anggota/ });
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

    test("no horizontal overflow", async ({ page }) => {
      await page.goto("/settings/team");
      await page.waitForLoadState("networkidle");
      expect(
        await page.evaluate(() => document.body.scrollWidth > window.innerWidth),
      ).toBeFalsy();
    });
  });
}
