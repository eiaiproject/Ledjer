import { test, expect, type Page } from "@playwright/test";
import { E2E } from "./fixtures/env";
import { E2E_OWNER2, E2E_STAFF } from "./fixtures/users";
import { ensureTestUser, seedOrganization } from "./fixtures/seed";

const SR_HEADERS = {
  apikey: E2E.serviceRoleKey,
  Authorization: `Bearer ${E2E.serviceRoleKey}`,
  "Content-Type": "application/json",
};

async function loginAs(page: Page, email: string, password: string): Promise<void> {
  await page.goto("/login");
  await page.getByRole("textbox", { name: /email/i }).fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole("button", { name: /^Masuk$/ }).click();
  await page.waitForURL((url) =>
    url.pathname.includes("/dashboard") || url.pathname.includes("/onboarding"),
    { timeout: 15_000 },
  );
}

async function removeOwner2Memberships(ownerId: string): Promise<void> {
  const res = await fetch(
    `${E2E.supabaseUrl}/rest/v1/organization_members?user_id=eq.${ownerId}`,
    {
      method: "PATCH",
      headers: { ...SR_HEADERS, Prefer: "return=minimal" },
      body: JSON.stringify({ status: "removed" }),
    },
  );
  if (!res.ok) {
    throw new Error(`Failed to reset owner2 memberships: ${res.status} ${await res.text()}`);
  }
}

async function setBusinessPlan(orgId: string): Promise<void> {
  const res = await fetch(
    `${E2E.supabaseUrl}/rest/v1/organizations?id=eq.${orgId}`,
    {
      method: "PATCH",
      headers: { ...SR_HEADERS, Prefer: "return=minimal" },
      body: JSON.stringify({ current_plan: "business" }),
    },
  );
  if (!res.ok) {
    throw new Error(`Failed to set business plan: ${res.status} ${await res.text()}`);
  }
}

test.describe("Invitation flow", () => {
  test.skip(!E2E.isFullLocal, "requires local Supabase service role");

  test("owner creates invite link and invited staff accepts it", async ({ browser, page }) => {
    const ownerId = await ensureTestUser(E2E_OWNER2);
    await ensureTestUser(E2E_STAFF);
    await removeOwner2Memberships(ownerId);
    const orgId = await seedOrganization(
      ownerId,
      `[E2E] Invite Flow ${Date.now()}`,
      E2E_OWNER2,
    );
    await setBusinessPlan(orgId);

    await loginAs(page, E2E_OWNER2.email, E2E_OWNER2.password);
    await page.goto("/settings/team");
    await expect(page.getByRole("heading", { name: /tim & izin/i })).toBeVisible();

    await page.getByRole("textbox", { name: /email staf/i }).fill(E2E_STAFF.email);
    await page.getByRole("button", { name: /buat link/i }).click();

    await expect(page.getByText(/link undangan siap dikirim/i)).toBeVisible({
      timeout: 10_000,
    });
    const inviteLink = await page.getByLabel(/link undangan terbaru/i).inputValue();
    expect(inviteLink).toContain("/invitations/accept?token=");
    await expect(page.getByText(E2E_STAFF.email)).toBeVisible();

    const inviteeContext = await browser.newContext();
    const inviteePage = await inviteeContext.newPage();
    try {
      await inviteePage.goto(inviteLink);
      await expect(
        inviteePage.getByRole("heading", { name: /masuk untuk menerima undangan/i }),
      ).toBeVisible();
      await inviteePage.getByRole("link", { name: /^Masuk$/ }).click();
      await inviteePage.getByRole("textbox", { name: /email/i }).fill(E2E_STAFF.email);
      await inviteePage.locator('input[type="password"]').fill(E2E_STAFF.password);
      await inviteePage.getByRole("button", { name: /^Masuk$/ }).click();
      await inviteePage.waitForURL(/\/invitations\/accept\?token=/, { timeout: 15_000 });
      await inviteePage.getByRole("button", { name: /terima undangan/i }).click();
      await expect(
        inviteePage.getByRole("heading", { name: /undangan diterima/i }),
      ).toBeVisible({ timeout: 10_000 });
    } finally {
      await inviteeContext.close();
    }
  });
});
