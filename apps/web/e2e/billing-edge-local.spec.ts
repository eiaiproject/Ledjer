import { test, expect } from "@playwright/test";
import { E2E } from "./fixtures/env";
import { E2E_OWNER } from "./fixtures/users";
import { ensureTestUser, loginUser } from "./fixtures/seed";
import { ensureOwnerOrg } from "./fixtures/organizations";
import {
  getOrganization,
  deleteCheckoutSessions,
  resetOrgBillingState,
  setFakeMayarScenario,
  resetFakeMayarScenario,
} from "./fixtures/billing";

/**
 * Checkout Edge Function hardening regression tests.
 *
 * Covers: malicious checkout URL rejection, provider timeout/500/malformed,
 * oversized request body, and verifies session/org state after each failure.
 */

const SR_HEADERS = {
  apikey: E2E.serviceRoleKey,
  Authorization: `Bearer ${E2E.serviceRoleKey}`,
  "Content-Type": "application/json",
};

async function callCheckout(
  token: string,
  orgId: string,
  overrides: Record<string, unknown> = {},
) {
  const res = await fetch(`${E2E.supabaseUrl}/functions/v1/mayar-create-checkout`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      organizationId: orgId,
      plan: "solo",
      billingPeriod: "monthly",
      customerMobile: "081234567890",
      ...overrides,
    }),
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

async function getLatestSession(orgId: string) {
  const res = await fetch(
    `${E2E.supabaseUrl}/rest/v1/billing_checkout_sessions?organization_id=eq.${orgId}&select=*&order=created_at.desc&limit=1`,
    { headers: SR_HEADERS },
  );
  if (!res.ok) return null;
  const data = await res.json();
  return Array.isArray(data) && data.length > 0 ? data[0] : null;
}

async function getSessionCount(orgId: string): Promise<number> {
  const res = await fetch(
    `${E2E.supabaseUrl}/rest/v1/billing_checkout_sessions?organization_id=eq.${orgId}&select=id&limit=100`,
    { headers: SR_HEADERS },
  );
  if (!res.ok) return 0;
  const data = await res.json();
  return Array.isArray(data) ? data.length : 0;
}

// Legacy Mayar coverage is intentionally excluded from normal full-local runs.
if (E2E.isFullLocal && process.env.E2E_MAYAR_LEGACY === "1") {
  test.describe("Legacy Checkout Edge Function Hardening", () => {
    let orgId: string;
    let ownerToken: string;

    test.beforeAll(async () => {
      await ensureTestUser(E2E_OWNER);
      const org = await ensureOwnerOrg();
      orgId = org.id;
      ownerToken = await loginUser(E2E_OWNER);
    });

    test.beforeEach(async () => {
      await deleteCheckoutSessions(orgId);
      await resetOrgBillingState(orgId);
      await resetFakeMayarScenario();
    });

    // ── Malicious URL tests (table-driven) ─────────────────────────────

    const maliciousUrls = [
      { label: "javascript scheme", url: "javascript:alert(1)" },
      { label: "data scheme", url: "data:text/html;base64,PHNjcmlwdD4=" },
      { label: "protocol-relative", url: "//evil.example/pay" },
      { label: "off-domain https", url: "https://evil.example/phish" },
    ];

    for (const { label, url } of maliciousUrls) {
      test(`rejects malicious checkout URL: ${label}`, async () => {
        await setFakeMayarScenario({ nextCreate: { checkoutUrl: url } });

        const result = await callCheckout(ownerToken, orgId);
        expect(result.status).toBe(502);
        expect(result.body.error).toBe("Link pembayaran tidak valid.");

        // Session should be marked failed
        const session = await getLatestSession(orgId);
        expect(session).toBeTruthy();
        expect(session!.status).toBe("failed");
        expect(session!.checkout_url).toBeFalsy();

        // Org plan unchanged
        const org = await getOrganization(orgId);
        expect(org!.current_plan).toBe("free");
        expect(org!.subscription_status).not.toBe("active");
      });
    }

    // ── Provider timeout ───────────────────────────────────────────────

    test("checkout provider timeout returns 502 and does not upgrade plan", async () => {
      // Set a 16s delay on the fake Mayar create endpoint (exceeds 15s timeout)
      await setFakeMayarScenario({ nextCreate: { delayMs: 16_000 } });

      const start = Date.now();
      const result = await callCheckout(ownerToken, orgId);
      const elapsed = Date.now() - start;

      expect(result.status).toBe(502);
      expect(result.body.error).toBe("Gagal terhubung ke penyedia pembayaran.");

      // Should have taken roughly 15s (timeout), not much longer
      expect(elapsed).toBeGreaterThanOrEqual(14_000);
      expect(elapsed).toBeLessThanOrEqual(25_000);

      // Session should be failed
      const session = await getLatestSession(orgId);
      expect(session).toBeTruthy();
      expect(session!.status).toBe("failed");
      expect(session!.checkout_url).toBeFalsy();

      // Org unchanged
      const org = await getOrganization(orgId);
      expect(org!.current_plan).toBe("free");
    });

    // ── Provider 500 ──────────────────────────────────────────────────

    test("checkout provider 500 returns 502 and does not upgrade plan", async () => {
      await setFakeMayarScenario({
        nextCreate: { status: 500, body: { statusCode: 500, message: "boom" } },
      });

      const result = await callCheckout(ownerToken, orgId);
      expect(result.status).toBe(502);
      expect(result.body.error).toBe("Gagal membuat invoice pembayaran.");

      const session = await getLatestSession(orgId);
      expect(session).toBeTruthy();
      expect(session!.status).toBe("failed");

      const org = await getOrganization(orgId);
      expect(org!.current_plan).toBe("free");
      expect(org!.subscription_status).not.toBe("active");
    });

    // ── Provider malformed JSON ────────────────────────────────────────

    test("checkout provider malformed JSON returns 502 and does not upgrade plan", async () => {
      await setFakeMayarScenario({ nextCreate: { malformedJson: true } });

      const result = await callCheckout(ownerToken, orgId);
      expect(result.status).toBe(502);
      expect(result.body.error).toBe("Gagal mendapatkan link pembayaran.");

      const session = await getLatestSession(orgId);
      expect(session).toBeTruthy();
      expect(session!.status).toBe("failed");
      expect(session!.checkout_url).toBeFalsy();

      const org = await getOrganization(orgId);
      expect(org!.current_plan).toBe("free");
    });

    // ── Oversized body ─────────────────────────────────────────────────

    test("checkout oversized request body over 8KB returns 413", async () => {
      const sessionCountBefore = await getSessionCount(orgId);

      // Build a payload larger than 8KB
      const oversizedPayload = {
        organizationId: orgId,
        plan: "solo",
        billingPeriod: "monthly",
        customerMobile: "081234567890",
        notes: "x".repeat(9_000),
      };

      const res = await fetch(
        `${E2E.supabaseUrl}/functions/v1/mayar-create-checkout`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${ownerToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(oversizedPayload),
        },
      );
      const body = await res.json().catch(() => ({}));

      expect(res.status).toBe(413);
      expect(body.error).toBe("Request body too large");

      // No session created
      const sessionCountAfter = await getSessionCount(orgId);
      expect(sessionCountAfter).toBe(sessionCountBefore);

      // Org unchanged
      const org = await getOrganization(orgId);
      expect(org!.current_plan).toBe("free");
    });
  });
}
