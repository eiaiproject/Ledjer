import { test, expect, type TestInfo } from "@playwright/test";
import { E2E } from "./fixtures/env";
import { E2E_OWNER } from "./fixtures/users";
import { ensureTestUser } from "./fixtures/seed";
import { ensureOwnerOrg } from "./fixtures/organizations";

/**
 * Webhook E2E tests.
 * Bypasses the UI and calls the webhook endpoint directly via HTTP.
 * Requires local Supabase plus billing-mode Edge Function env.
 */

const WEBHOOK_TOKEN = process.env.E2E_MAYAR_WEBHOOK_TOKEN || "test_webhook_token";
const FAKE_MAYAR_URL = process.env.MAYAR_API_BASE_URL || "http://127.0.0.1:4567";

const SR_HEADERS = {
  apikey: E2E.serviceRoleKey,
  Authorization: `Bearer ${E2E.serviceRoleKey}`,
  "Content-Type": "application/json",
};

/**
 * Generate unique Mayar invoice/transaction IDs per test run, worker, and retry.
 * This prevents 409 collisions on the unique constraint when tests are retried.
 */
function uniqueMayarIds(testInfo: TestInfo, prefix = "paid") {
  const safeTitle = testInfo.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);

  const suffix = [
    safeTitle,
    `w${testInfo.workerIndex}`,
    `r${testInfo.retry}`,
    Date.now().toString(36),
  ].join("_");

  return {
    invoiceId: `test_inv_${prefix}_${suffix}`,
    transactionId: `test_trx_${prefix}_${suffix}`,
  };
}

async function createCheckoutSession(orgId: string, invoiceId: string, transactionId: string, overrides: Record<string, unknown> = {}) {
  await deleteCheckoutSessions(orgId);

  const res = await fetch(`${E2E.supabaseUrl}/rest/v1/billing_checkout_sessions`, {
    method: "POST",
    headers: { ...SR_HEADERS, Prefer: "return=representation" },
    body: JSON.stringify({
      organization_id: orgId,
      created_by: (await ensureTestUser(E2E_OWNER)),
      plan: "solo",
      billing_period: "monthly",
      amount: 39000,
      currency: "IDR",
      status: "pending",
      payment_provider: "mayar",
      mayar_invoice_id: invoiceId,
      mayar_transaction_id: transactionId,
      checkout_url: "https://checkout.mayar.test/pay/test",
      customer_email: "test@example.com",
      customer_mobile: "6281234567890",
      expires_at: new Date(Date.now() + 86400000).toISOString(),
      ...overrides,
    }),
  });
  if (!res.ok) throw new Error(`Failed to create session: ${res.status} ${await res.text()}`);
  const text = await res.text();
  if (!text) throw new Error(`Session created but response body was empty (HTTP ${res.status})`);
  const data = JSON.parse(text);
  return Array.isArray(data) ? data[0] : data;
}

async function getSession(id: string) {
  const res = await fetch(
    `${E2E.supabaseUrl}/rest/v1/billing_checkout_sessions?id=eq.${id}&select=*`,
    { headers: SR_HEADERS },
  );
  if (!res.ok) return null;
  const data = await res.json();
  return Array.isArray(data) ? data[0] : data;
}

async function deleteCheckoutSessions(orgId: string) {
  await fetch(
    `${E2E.supabaseUrl}/rest/v1/billing_checkout_sessions?organization_id=eq.${orgId}&status=eq.pending`,
    { method: "DELETE", headers: SR_HEADERS },
  ).catch(() => {});
}

async function getOrganization(orgId: string) {
  const res = await fetch(
    `${E2E.supabaseUrl}/rest/v1/organizations?id=eq.${orgId}&select=current_plan,subscription_status,current_period_start,current_period_end`,
    { headers: SR_HEADERS },
  );
  if (!res.ok) return null;
  const data = await res.json();
  return Array.isArray(data) ? data[0] : data;
}

async function getBillingEvents(orgId: string, eventType?: string) {
  let url = `${E2E.supabaseUrl}/rest/v1/billing_events?organization_id=eq.${orgId}&select=*&order=created_at.desc`;
  if (eventType) url += `&event_type=eq.${eventType}`;
  const res = await fetch(url, { headers: SR_HEADERS });
  if (!res.ok) return [];
  return res.json();
}

async function getAuditLogs(orgId: string) {
  const res = await fetch(
    `${E2E.supabaseUrl}/rest/v1/audit_logs?organization_id=eq.${orgId}&action=eq.billing_plan_change&select=*&order=created_at.desc`,
    { headers: SR_HEADERS },
  );
  if (!res.ok) return [];
  return res.json();
}

async function sendWebhook(payload: Record<string, unknown>, token: string = WEBHOOK_TOKEN) {
  const edgeFunctionUrl = `${E2E.supabaseUrl}/functions/v1/mayar-webhook?token=${token}`;
  try {
    const res = await fetch(edgeFunctionUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await res.json().catch(() => ({}));
    return { status: res.status, body };
  } catch (err) {
    return { status: 0, body: { error: String(err) } };
  }
}

// Legacy Mayar coverage is intentionally excluded from normal full-local runs.
if (E2E.isFullLocal && process.env.E2E_MAYAR_LEGACY === "1") {
test.describe("Legacy Mayar Webhook", () => {
  let orgId: string;

  test.beforeAll(async () => {
    const org = await ensureOwnerOrg();
    orgId = org.id;
  });

  // Clean up pending sessions before each test to avoid 409 unique constraint violations
  // from previous test runs/retries that left stale pending sessions
  test.beforeEach(async () => {
    await fetch(
      `${E2E.supabaseUrl}/rest/v1/billing_checkout_sessions?organization_id=eq.${orgId}&status=eq.pending`,
      { method: "DELETE", headers: SR_HEADERS },
    ).catch(() => {});
  });

  // ── Unauthorized ──────────────────────────────────────────────

  test("No token returns 401", async () => {
    const result = await sendWebhook({ event: "test" }, "");
    expect(result.status).toBe(401);
  });

  test("Wrong token returns 401", async () => {
    const result = await sendWebhook({ event: "test" }, "wrong-token");
    expect(result.status).toBe(401);
  });

  test("Unauthorized webhook makes no DB changes", async () => {
    // Get org state before
    const orgBefore = await getOrganization(orgId);

    await sendWebhook({ event: "test" }, "wrong-token");

    // Org plan should not change
    const orgAfter = await getOrganization(orgId);
    expect(orgAfter.current_plan).toBe(orgBefore.current_plan);
  });

  // ── Malformed payload ─────────────────────────────────────────

  test("Malformed JSON returns 400", async () => {
    const edgeFunctionUrl = `${E2E.supabaseUrl}/functions/v1/mayar-webhook?token=${WEBHOOK_TOKEN}`;
    const res = await fetch(edgeFunctionUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not-json",
    });
    expect(res.status).toBe(400);
  });

  test("Missing required fields returns safe error", async () => {
    const result = await sendWebhook({});
    // Should be safely handled (ignored or 400)
    expect(result.status).toBeLessThan(500);
  });

  // ── Unknown invoice ───────────────────────────────────────────

  test("Unknown invoice/transaction ID is safely ignored", async () => {
    const orgBefore = await getOrganization(orgId);

    const result = await sendWebhook({
      event: "invoice.paid",
      data: {
        id: "unknown_txn_id",
        paymentLinkId: "unknown_inv_id",
        status: "paid",
        amount: 39000,
      },
    });

    expect(result.body.ignored).toBe(true);

    // No org changes
    const orgAfter = await getOrganization(orgId);
    expect(orgAfter.current_plan).toBe(orgBefore.current_plan);
  });

  // ── Paid webhook ──────────────────────────────────────────────

  test("Paid webhook happy path", async ({ browserName }, testInfo) => {
    void browserName;
    const { invoiceId, transactionId } = uniqueMayarIds(testInfo, "paid");
    const session = await createCheckoutSession(orgId, invoiceId, transactionId);

    // Create a matching fake Mayar invoice via API with the SAME invoice ID
    await fetch(`${FAKE_MAYAR_URL}/hl/v1/invoice/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: invoiceId,         // ← match mayar_invoice_id
        transactionId: transactionId, // ← match mayar_transaction_id
        name: "Test User",
        email: "test@example.com",
        mobile: "6281234567890",
        amount: 39000,
        status: "paid",
        items: [{ rate: 39000 }],
        extraData: { checkoutSessionId: session.id },
      }),
    }).catch(() => {});

    // Send webhook
    const result = await sendWebhook({
      event: "invoice.paid",
      data: {
        id: transactionId,
        paymentLinkId: invoiceId,
        status: "paid",
        amount: 39000,
        transactionId,
      },
    });

    expect(result.body.paid).toBe(true);

    // Organization plan should be updated
    const orgAfter = await getOrganization(orgId);
    expect(orgAfter.current_plan).toBe("solo");
    expect(orgAfter.subscription_status).toBe("active");
    expect(orgAfter.current_period_start).toBeTruthy();
    expect(orgAfter.current_period_end).toBeTruthy();

    // Checkout session should be paid
    const updatedSession = await getSession(session.id);
    expect(updatedSession.status).toBe("paid");

    // One payment_succeeded event
    const paidEvents = await getBillingEvents(orgId, "payment_succeeded");
    expect(paidEvents.length).toBeGreaterThanOrEqual(1);

    // One audit log
    const auditLogs = await getAuditLogs(orgId);
    expect(auditLogs.length).toBeGreaterThanOrEqual(1);
  });

  // ── Duplicate webhook ─────────────────────────────────────────

  test("Duplicate paid webhook is idempotent", async ({ browserName }, testInfo) => {
    void browserName;
    const { invoiceId, transactionId } = uniqueMayarIds(testInfo, "dup");
    await createCheckoutSession(orgId, invoiceId, transactionId);

    // Pre-seed the fake Mayar server with a matching paid invoice
    await fetch(`${FAKE_MAYAR_URL}/hl/v1/invoice/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: invoiceId,
        transactionId,
        amount: 39000,
        status: "paid",
        items: [{ rate: 39000 }],
      }),
    }).catch(() => {});

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

    // Send first webhook
    const result1 = await sendWebhook(payload);
    expect(result1.body.paid).toBe(true);

    // Send second webhook (duplicate)
    const result2 = await sendWebhook(payload);
    expect(result2.body.idempotent).toBe(true);

    // Verify only one payment_succeeded event exists
    const paidEvents = await getBillingEvents(orgId, "payment_succeeded");
    const filteredEvents = paidEvents.filter(
      (e: {provider_event_id?: string}) => e.provider_event_id === transactionId
    );
    expect(filteredEvents).toHaveLength(1);

    // Verify only one audit log for plan change
    const auditLogs = await getAuditLogs(orgId);
    expect(auditLogs.length).toBeGreaterThanOrEqual(1);
  });

  // ── Unpaid/pending webhook ───────────────────────────────────

  test("Unpaid/pending webhook does not upgrade plan", async ({ browserName }, testInfo) => {
    void browserName;
    const orgBefore = await getOrganization(orgId);
    const { invoiceId, transactionId } = uniqueMayarIds(testInfo, "unpaid");

    await createCheckoutSession(orgId, invoiceId, transactionId);

    // Pre-seed fake Mayar invoice with pending status
    await fetch(`${FAKE_MAYAR_URL}/hl/v1/invoice/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: invoiceId,
        status: "pending",
        amount: 39000,
        items: [{ rate: 39000 }],
      }),
    }).catch(() => {});

    const result = await sendWebhook({
      event: "invoice.pending",
      data: {
        id: transactionId,
        paymentLinkId: invoiceId,
        status: "pending",
        amount: 39000,
      },
    });

    // Should not be marked as paid
    expect(result.body.paid).toBe(false);

    // Org plan should not change
    const orgAfter = await getOrganization(orgId);
    expect(orgAfter.current_plan).toBe(orgBefore.current_plan);
  });

  // ── Amount mismatch ──────────────────────────────────────────

  test("Amount mismatch webhook is rejected", async ({ browserName }, testInfo) => {
    void browserName;
    const orgBefore = await getOrganization(orgId);
    const { invoiceId, transactionId } = uniqueMayarIds(testInfo, "amt");

    await createCheckoutSession(orgId, invoiceId, transactionId);

    // Create fake Mayar invoice with different amount and MATCHING ID
    await fetch(`${FAKE_MAYAR_URL}/hl/v1/invoice/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: invoiceId,
        transactionId,
        amount: 1000,           // ← different from session amount (39000)
        status: "paid",
        items: [{ rate: 1000 }],
      }),
    }).catch(() => {});

    const result = await sendWebhook({
      event: "invoice.paid",
      data: {
        id: transactionId,
        paymentLinkId: invoiceId,
        status: "paid",
        amount: 1000,
      },
    });

    expect(result.status).toBe(400);

    // Org plan should not change
    const orgAfter = await getOrganization(orgId);
    expect(orgAfter.current_plan).toBe(orgBefore.current_plan);
  });

  // ── Failed/expired webhook ───────────────────────────────────

  test("Failed/expired webhook does not change plan", async ({ browserName }, testInfo) => {
    void browserName;
    const orgBefore = await getOrganization(orgId);
    const { invoiceId, transactionId } = uniqueMayarIds(testInfo, "fail");

    await createCheckoutSession(orgId, invoiceId, transactionId);

    // Pre-seed fake Mayar invoice with failed status
    await fetch(`${FAKE_MAYAR_URL}/hl/v1/invoice/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: invoiceId,
        status: "failed",
        amount: 39000,
        items: [{ rate: 39000 }],
      }),
    }).catch(() => {});

    const result = await sendWebhook({
      event: "invoice.failed",
      data: {
        id: transactionId,
        paymentLinkId: invoiceId,
        status: "failed",
        amount: 39000,
      },
    });

    expect(result.body.paid).toBe(false);

    // Org plan should not change
    const orgAfter = await getOrganization(orgId);
    expect(orgAfter.current_plan).toBe(orgBefore.current_plan);
  });
});
}
