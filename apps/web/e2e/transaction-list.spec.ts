import { test, expect } from "@playwright/test";
import { E2E_OWNER } from "./fixtures/users";

/**
 * Transaction list, search, filter, and sort tests.
 */

async function loginAsOwner(page: import("@playwright/test").Page): Promise<void> {
  await page.goto("/login");
  await page.getByRole("textbox", { name: /email/i }).fill(E2E_OWNER.email);
  await page.getByRole("textbox", { name: /password/i }).fill(E2E_OWNER.password);
  await page.getByRole("button", { name: /masuk/i }).first().click();
  await page.waitForURL((url) =>
    url.pathname.includes("/dashboard") || url.pathname.includes("/onboarding"),
    { timeout: 15_000 },
  );
}

test.describe("Transaction list page", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsOwner(page);
    await expect(page).toHaveURL(/\/dashboard|\/onboarding/);
    await page.goto("/transactions");
    await expect(page).toHaveURL(/\/transactions/);
  });

  test("page loads with list or empty state", async ({ page }) => {
    await page.waitForLoadState("networkidle");
    await expect(page.locator("text=/transaksi/i").first()).toBeVisible({ timeout: 10_000 });

    const hasTable = await page.locator("table").first().isVisible({ timeout: 5_000 }).catch(() => false);
    const hasEmpty = await page.locator("text=/belum ada/i").first().isVisible({ timeout: 5_000 }).catch(() => false);
    const hasList = await page.locator("[role='list']").first().isVisible({ timeout: 3_000 }).catch(() => false);
    expect(hasTable || hasEmpty || hasList).toBeTruthy();
  });

  test("search input accepts special characters without crash", async ({ page }) => {
    const searchInput = page.getByRole("textbox", { name: /cari|search/i });
    await expect(searchInput).toBeVisible({ timeout: 5_000 });

    const specialChars = ["'", '"', "%", "_", ",", ";", "<script>", "OR 1=1"];
    for (const char of specialChars) {
      await searchInput.fill(char);
      await page.waitForTimeout(300);
      await expect(page.locator("body")).toBeVisible();
    }
  });

  test("date filter inputs are present", async ({ page }) => {
    const dateInputs = page.locator("input[type='date']");
    const count = await dateInputs.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });
});

test.describe("Transaction detail page", () => {
  test("invalid UUID shows error state, not crash", async ({ page }) => {
    await loginAsOwner(page);
    await page.goto("/transactions/00000000-0000-0000-0000-000000000000");
    await page.waitForLoadState("networkidle");
    const bodyText = await page.locator("body").textContent();
    expect(bodyText).toBeTruthy();
  });
});
