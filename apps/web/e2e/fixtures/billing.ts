/**
 * Billing test helpers shared across billing E2E test files.
 *
 * Extracted from billing-webhook.spec.ts to avoid duplication in
 * billing-edge-local.spec.ts and webhook-hardening-local.spec.ts.
 */
import { type TestInfo } from "@playwright/test";
import { E2E } from "./env";
import { E2E_OWNER } from "./users";
import { ensureTestUser } from "./seed";

export const WEBHOOK_TOKEN =
  process.env.E2E_MAYAR_WEBHOOK_TOKEN || "test_webhook_token";
export const FAKE_MAYAR_URL =
  process.env.MAYAR_API_BASE_URL || "http://127.0.0.1:4567";

const SR_HEADERS = {
  apikey: E2E.serviceRoleKey,
  Authorization: `Bearer ${E2E.serviceRoleKey}`,
  "Content-Type": "application/json",
};

// ── Unique IDs ───────────────────────────────────────────────────────────

/**
 * Generate unique Mayar invoice/transaction IDs per test run, worker, and retry.
 * Prevents 409 collisions on unique constraints when tests are retried.
 */
export function uniqueMayarIds(
  testInfo: TestInfo,
  prefix = "paid",
): { invoiceId: string; transactionId: string } {
  // Deterministic slug: lower-case, map any non-[a-z0-9] to '_' (no quantifier
  // on a negated class — keeps the regex linear and static-analysis friendly).
  const raw = testInfo.title
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "_");
  const safeTitle = raw.replace(/^_+|_+$/g, "").slice(0, 40);
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

// ── Session helpers ──────────────────────────────────────────────────────

export async function createCheckoutSession(
  orgId: string,
  invoiceId: string,
  transactionId: string,
  overrides: Record<string, unknown> = {},
) {
  await deleteCheckoutSessions(orgId);

  const res = await fetch(`${E2E.supabaseUrl}/rest/v1/billing_checkout_sessions`, {
    method: "POST",
    headers: { ...SR_HEADERS, Prefer: "return=representation" },
    body: JSON.stringify({
      organization_id: orgId,
      created_by: await ensureTestUser(E2E_OWNER),
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
  if (!res.ok)
    throw new Error(`Failed to create session: ${res.status} ${await res.text()}`);
  const text = await res.text();
  if (!text)
    throw new Error(`Session created but response body was empty (HTTP ${res.status})`);
  const data = JSON.parse(text);
  return Array.isArray(data) ? data[0] : data;
}

export async function getSession(id: string) {
  const res = await fetch(
    `${E2E.supabaseUrl}/rest/v1/billing_checkout_sessions?id=eq.${id}&select=*`,
    { headers: SR_HEADERS },
  );
  if (!res.ok) return null;
  const data = await res.json();
  return Array.isArray(data) ? data[0] : data;
}

export async function deleteCheckoutSessions(orgId: string) {
  await fetch(
    `${E2E.supabaseUrl}/rest/v1/billing_checkout_sessions?organization_id=eq.${orgId}&status=eq.pending`,
    { method: "DELETE", headers: SR_HEADERS },
  ).catch(() => {});
}

// ── Organization helpers ─────────────────────────────────────────────────

export async function getOrganization(orgId: string) {
  const res = await fetch(
    `${E2E.supabaseUrl}/rest/v1/organizations?id=eq.${orgId}&select=current_plan,subscription_status,current_period_start,current_period_end`,
    { headers: SR_HEADERS },
  );
  if (!res.ok) return null;
  const data = await res.json();
  return Array.isArray(data) ? data[0] : data;
}

export async function resetOrgBillingState(orgId: string) {
  await fetch(
    `${E2E.supabaseUrl}/rest/v1/organizations?id=eq.${orgId}`,
    {
      method: "PATCH",
      headers: SR_HEADERS,
      body: JSON.stringify({
        current_plan: "free",
        subscription_status: null,
        current_period_start: null,
        current_period_end: null,
      }),
    },
  ).catch(() => {});
}

// ── Event helpers ────────────────────────────────────────────────────────

export async function getBillingEvents(orgId: string, eventType?: string) {
  let url = `${E2E.supabaseUrl}/rest/v1/billing_events?organization_id=eq.${orgId}&select=*&order=created_at.desc`;
  if (eventType) url += `&event_type=eq.${eventType}`;
  const res = await fetch(url, { headers: SR_HEADERS });
  if (!res.ok) return [];
  return res.json();
}

export async function getAuditLogs(orgId: string) {
  const res = await fetch(
    `${E2E.supabaseUrl}/rest/v1/audit_logs?organization_id=eq.${orgId}&action=eq.billing_plan_change&select=*&order=created_at.desc`,
    { headers: SR_HEADERS },
  );
  if (!res.ok) return [];
  return res.json();
}

// ── Webhook helper ───────────────────────────────────────────────────────

export async function sendWebhook(
  payload: Record<string, unknown>,
  token: string = WEBHOOK_TOKEN,
) {
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

// ── Fake Mayar control ───────────────────────────────────────────────────

export interface FakeMayarScenario {
  nextCreate?: {
    delayMs?: number;
    status?: number;
    checkoutUrl?: string;
    malformedJson?: boolean;
    body?: Record<string, unknown>;
  };
  nextVerify?: {
    delayMs?: number;
    status?: number;
    malformedJson?: boolean;
    body?: Record<string, unknown>;
  };
}

export async function setFakeMayarScenario(config: FakeMayarScenario) {
  await fetch(`${FAKE_MAYAR_URL}/__control`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(config),
  });
}

export async function resetFakeMayarScenario() {
  await fetch(`${FAKE_MAYAR_URL}/__reset`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  }).catch(() => {});
}
