import { test, expect } from "@playwright/test";
import { E2E } from "./fixtures/env";
import { E2E_OWNER } from "./fixtures/users";
import { ensureTestUser } from "./fixtures/seed";
import { ensureOwnerOrg } from "./fixtures/organizations";
import {
  createCheckoutSession,
  getOrganization,
  getBillingEvents,
  sendWebhook,
  uniqueMayarIds,
  FAKE_MAYAR_URL,
  WEBHOOK_TOKEN,
} from "./fixtures/billing";

/**
 * Webhook Edge Function hardening regression tests.
 *
 * Covers: oversized payload, malformed JSON, duplicate delivery idempotency,
 * parallel delivery race safety, and unknown invoice handling.
 */

const SR_HEADERS = {
  apikey: E2E.serviceRoleKey,
  Authorization: `Bearer ${E2E.serviceRoleKey}`,
  "Content-Type": "application/json",
};

async function preSeedFakeInvoice(invoiceId: string, transactionId: string, amount: number, status: string) {
  await fetch(`${FAKE_MAYAR_URL}/hl/v1/invoice/create`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: invoiceId,
      transactionId,
      amount,
      status,
      items: [{ rate: amount }],
    }),
  }).catch(() => {});
}

if (E2E.isFullLocal && process.env.E2E_BILLING === "1") {
  test.describe("Webhook Edge Function Hardening", () => {
    let orgId: string;

    test.beforeAll(async () => {
      await ensureTestUser(E2E_OWNER);
      const org = await ensureOwnerOrg();
      orgId = org.id;
    });

    // ── Oversized payload ──────────────────────────────────────────────

    test("oversized webhook payload over 64KB returns 413 and produces no billing side effects", async () => {
      const orgBefore = await getOrganization(orgId);
      const eventsBefore = await getBillingEvents(orgId);

      // Build payload larger than 64KB
      const oversizedPayload = {
        event: "invoice.paid",
        data: {
          id: "oversized_test",
          paymentLinkId: "oversized_inv",
          status: "paid",
          amount: 39000,
          filler: "x".repeat(70_000),
        },
      };

      const edgeFunctionUrl = `${E2E.supabaseUrl}/functions/v1/mayar-webhook?token=${WEBHOOK_TOKEN}`;
      const res = await fetch(edgeFunctionUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(oversizedPayload),
      });

      expect(res.status).toBe(413);

      // Org unchanged
      const orgAfter = await getOrganization(orgId);
      expect(orgAfter!.current_plan).toBe(orgBefore!.current_plan);

      // No new billing events
      const eventsAfter = await getBillingEvents(orgId);
      expect(eventsAfter).toHaveLength(eventsBefore.length);
    });

    // ── Malformed JSON ─────────────────────────────────────────────────

    test("malformed webhook JSON returns 400 and produces no billing side effects", async () => {
      const orgBefore = await getOrganization(orgId);
      const eventsBefore = await getBillingEvents(orgId);

      const edgeFunctionUrl = `${E2E.supabaseUrl}/functions/v1/mayar-webhook?token=${WEBHOOK_TOKEN}`;
      const res = await fetch(edgeFunctionUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not-json",
      });

      expect(res.status).toBe(400);

      const orgAfter = await getOrganization(orgId);
      expect(orgAfter!.current_plan).toBe(orgBefore!.current_plan);

      const eventsAfter = await getBillingEvents(orgId);
      expect(eventsAfter).toHaveLength(eventsBefore.length);
    });

    // ── Duplicate delivery ─────────────────────────────────────────────

    test("duplicate paid webhook delivery is idempotent", async ({ browserName }, testInfo) => {
      void browserName;
      const { invoiceId, transactionId } = uniqueMayarIds(testInfo, "dup");
      await createCheckoutSession(orgId, invoiceId, transactionId);
      await preSeedFakeInvoice(invoiceId, transactionId, 39000, "paid");

      const payload = {
        event: "invoice.paid",
        data: {
          id: transactionId,
          paymentLinkId: invoiceId,
          status: "paid",
          amount: 39000,
          transactionId,
        },
      };

      // First webhook
      const result1 = await sendWebhook(payload);
      expect(result1.body.paid).toBe(true);

      // Second webhook (duplicate)
      const result2 = await sendWebhook(payload);
      expect(result2.body.idempotent).toBe(true);

      // Only one payment_succeeded event for this transaction
      const paidEvents = await getBillingEvents(orgId, "payment_succeeded");
      const filtered = paidEvents.filter(
        (e: { provider_event_id?: string }) => e.provider_event_id === transactionId,
      );
      expect(filtered).toHaveLength(1);
    });

    // ── Parallel delivery ──────────────────────────────────────────────

    test("parallel paid webhook delivery is race-safe: session ends up paid and plan upgraded", async ({ browserName }, testInfo) => {
      void browserName;
      const { invoiceId, transactionId } = uniqueMayarIds(testInfo, "parallel");
      await createCheckoutSession(orgId, invoiceId, transactionId);
      await preSeedFakeInvoice(invoiceId, transactionId, 39000, "paid");

      const payload = {
        event: "invoice.paid",
        data: {
          id: transactionId,
          paymentLinkId: invoiceId,
          status: "paid",
          amount: 39000,
          transactionId,
        },
      };

      // Fire 5 parallel webhooks — no crash, no 500, all return 200
      const results = await Promise.all(
        Array.from({ length: 5 }, () => sendWebhook(payload)),
      );

      for (const r of results) {
        expect(r.status).toBe(200);
        expect(r.body.ok).toBe(true);
      }

      // At least one result should have paid=true
      const paidResults = results.filter((r) => r.body.paid === true);
      expect(paidResults.length).toBeGreaterThanOrEqual(1);

      // Session should end up paid (regardless of which parallel call finalized)
      const sessionRows = await (await fetch(
        `${E2E.supabaseUrl}/rest/v1/billing_checkout_sessions?organization_id=eq.${orgId}&mayar_transaction_id=eq.${transactionId}&select=id,status`,
        { headers: SR_HEADERS },
      )).json();
      const session = Array.isArray(sessionRows) && sessionRows.length > 0 ? sessionRows[0] : null;
      expect(session).toBeTruthy();
      expect(session!.status).toBe("paid");

      // Org plan updated to solo
      const org = await getOrganization(orgId);
      expect(org!.current_plan).toBe("solo");
    });

    // ── Unknown invoice ────────────────────────────────────────────────

    test("unknown invoice is safely ignored without organization or billing changes", async () => {
      const orgBefore = await getOrganization(orgId);
      const eventsBefore = await getBillingEvents(orgId);

      const result = await sendWebhook({
        event: "invoice.paid",
        data: {
          id: "unknown_txn_xyz",
          paymentLinkId: "unknown_inv_xyz",
          status: "paid",
          amount: 39000,
        },
      });

      expect(result.body.ignored).toBe(true);

      const orgAfter = await getOrganization(orgId);
      expect(orgAfter!.current_plan).toBe(orgBefore!.current_plan);

      const eventsAfter = await getBillingEvents(orgId);
      expect(eventsAfter).toHaveLength(eventsBefore.length);
    });
  });
}
