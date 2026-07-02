import { createClient } from "https://esm.sh/@supabase/supabase-js@2.108.2";
import { corsHeaders, jsonResponse, mayarBaseUrl, requireEnv } from "../_shared/http.ts";

/**
 * Constant-time string comparison to prevent timing attacks on webhook token.
 */
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= (a.codePointAt(i) ?? 0) ^ (b.codePointAt(i) ?? 0);
  }
  return result === 0;
}

// ─── Security constants ─────────────────────────────────────────────────
const MAX_BODY_SIZE = 64 * 1024; // 64 KB — generous for webhook payloads
const MAYAR_VERIFY_TIMEOUT_MS = 15_000;

function addPeriod(start: Date, period: "monthly" | "yearly") {
  const end = new Date(start);
  if (period === "yearly") {
    end.setFullYear(end.getFullYear() + 1);
  } else {
    end.setMonth(end.getMonth() + 1);
  }
  return end;
}

function stringValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

function nullableStringValue(value: unknown): string | null {
  const text = stringValue(value).trim();
  return text || null;
}

function recordValue(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function paidStatus(value: unknown) {
  const status = stringValue(value).toLowerCase();
  return status === "paid" || status === "success" || status === "settled";
}

/**
 * Extract invoice status from Mayar's verify-invoice response.
 */
function extractInvoiceStatus(verifyJson: Record<string, unknown>): string {
  const data = recordValue(verifyJson.data);
  const status = stringValue(data?.status) || stringValue(verifyJson.status);
  return status.toLowerCase();
}

/**
 * Extract invoice amount from Mayar's verify-invoice response.
 */
function extractInvoiceAmount(verifyJson: Record<string, unknown>): number {
  const data = recordValue(verifyJson.data);
  const raw = data?.amount ?? verifyJson.amount ?? 0;
  const amount = Number(raw);
  return Number.isFinite(amount) ? amount : 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    // ── Step 1: Validate webhook token (mandatory, constant-time) ──────────
    const webhookToken = Deno.env.get("MAYAR_WEBHOOK_TOKEN");
    if (!webhookToken) {
      console.error("[webhook] MAYAR_WEBHOOK_TOKEN not configured");
      return jsonResponse({ error: "Server configuration error" }, 500);
    }

    const url = new URL(req.url);
    const tokenParam = url.searchParams.get("token") ?? "";
    if (!tokenParam) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }
    if (!constantTimeEqual(tokenParam, webhookToken)) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    // ── Step 2: Parse payload (before loading non-token envs) ──────────────
    const rawPayload = await req.text();

    // Enforce size limit on actual body (defense-in-depth)
    if (rawPayload.length > MAX_BODY_SIZE) {
      return jsonResponse({ error: "Payload too large" }, 413);
    }

    // Enforce size limit on actual body (defense-in-depth, after reading)
    if (rawPayload.length > MAX_BODY_SIZE) {
      return jsonResponse({ error: "Payload too large" }, 413);
    }

    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(rawPayload);
    } catch {
      return jsonResponse({ error: "Bad request" }, 400);
    }

    const event = stringValue(payload.event) || stringValue(payload.type) || "mayar.webhook";
    const data = recordValue(payload.data) ?? payload;
    const transactionId = nullableStringValue(data.transactionId) ?? nullableStringValue(data.id);
    const invoiceId =
      nullableStringValue(data.paymentLinkId) ??
      nullableStringValue(data.productId) ??
      nullableStringValue(data.invoiceId);

    // Sanitized log: only event type and IDs, no PII or raw payload
    console.log(`[webhook] event=${event} txn=${transactionId ?? "none"} inv=${invoiceId ?? "none"}`);

    // ── Step 3: Load envs for further processing ────────────────────────────
    const supabaseUrl = requireEnv("SUPABASE_URL");
    const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
    const mayarApiKey = requireEnv("MAYAR_API_KEY");
    const admin = createClient(supabaseUrl, serviceRoleKey);

    // ── Step 4: Find the checkout session ──────────────────────────────────
    let session: Record<string, unknown> | null = null;

    if (transactionId) {
      const result = await admin
        .from("billing_checkout_sessions")
        .select("*")
        .eq("mayar_transaction_id", transactionId)
        .maybeSingle();
      if (result.error) {
        console.error("[webhook] session_lookup_error txn");
        return jsonResponse({ error: "Internal error" }, 500);
      }
      session = result.data;
    }

    if (!session && invoiceId) {
      const result = await admin
        .from("billing_checkout_sessions")
        .select("*")
        .eq("mayar_invoice_id", invoiceId)
        .maybeSingle();
      if (result.error) {
        console.error("[webhook] session_lookup_error inv");
        return jsonResponse({ error: "Internal error" }, 500);
      }
      session = result.data;
    }

    // ── Step 4: Unknown session — safely ignore ────────────────────────────
    if (!session) {
      console.log(`[webhook] ignored: no session txn=${transactionId ?? "none"} inv=${invoiceId ?? "none"}`);
      return jsonResponse({ ok: true, ignored: true });
    }

    const sessionId = stringValue(session.id);
    const orgId = stringValue(session.organization_id);
    const createdBy = stringValue(session.created_by);
    const sessionPlan = stringValue(session.plan);
    const sessionBillingPeriod = stringValue(session.billing_period);
    const sessionAmount = Number(session.amount);
    const sessionStatus = stringValue(session.status) || "pending";
    const sessionInvoiceId = nullableStringValue(session.mayar_invoice_id);

    // ── Step 5: Log webhook received event (sanitized) ─────────────────────
    await admin.from("billing_events").insert({
      organization_id: orgId,
      actor_user_id: createdBy,
      event_type: "webhook_received",
      payment_provider: "mayar",
      provider_event_id: transactionId ?? invoiceId ?? sessionId,
      metadata: {
        event,
        checkout_session_id: sessionId,
      },
    }).throwOnError();

    // ── Step 6: Idempotency — already processed ────────────────────────────
    if (sessionStatus === "paid") {
      return jsonResponse({ ok: true, idempotent: true });
    }

    // ── Step 7: If no Mayar invoice ID yet, record payload and acknowledge ──
    if (!sessionInvoiceId) {
      await admin
        .from("billing_checkout_sessions")
        .update({
          webhook_payload: payload,
          updated_at: new Date().toISOString(),
        })
        .eq("id", sessionId);
      return jsonResponse({ ok: true, pending: true });
    }

    // ── Step 8: Verify invoice with Mayar API (with timeout) ──────────────
    let verifyResponse: Response;
    let verifyJson: Record<string, unknown>;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), MAYAR_VERIFY_TIMEOUT_MS);
      try {
        verifyResponse = await fetch(`${mayarBaseUrl()}/hl/v1/invoice/${sessionInvoiceId}`, {
          headers: { Authorization: `Bearer ${mayarApiKey}` },
          signal: controller.signal,
        });
        verifyJson = await verifyResponse.json().catch(() => ({}));
      } finally {
        clearTimeout(timeoutId);
      }
    } catch (fetchError) {
      const isAbort = fetchError instanceof DOMException && fetchError.name === "AbortError";
      console.error(`[webhook] provider_verify_${isAbort ? "timeout" : "error"}`);
      return jsonResponse({ error: "Internal error" }, 502);
    }

    // ── Step 9: Validate invoice status via Mayar API ──────────────────────
    if (!verifyResponse.ok) {
      console.error(`[webhook] verify_failed status=${verifyResponse.status} inv=${sessionInvoiceId}`);
      await admin
        .from("billing_checkout_sessions")
        .update({
          webhook_payload: payload,
          provider_response: verifyJson,
          updated_at: new Date().toISOString(),
        })
        .eq("id", sessionId);
      return jsonResponse({ ok: true, paid: false, reason: "verification_failed" });
    }

    const verifiedStatus = extractInvoiceStatus(verifyJson);
    const verifiedAmount = extractInvoiceAmount(verifyJson);

    if (!paidStatus(verifiedStatus)) {
      console.log(`[webhook] inv=${sessionInvoiceId} status=${verifiedStatus} — no upgrade`);
      await admin
        .from("billing_checkout_sessions")
        .update({
          webhook_payload: payload,
          provider_response: verifyJson,
          updated_at: new Date().toISOString(),
        })
        .eq("id", sessionId);
      return jsonResponse({ ok: true, paid: false, status: verifiedStatus });
    }

    // ── Step 10: Validate amount matches ──────────────────────────────────
    if (verifiedAmount < sessionAmount) {
      console.error(`[webhook] amount_mismatch verified=${verifiedAmount} expected=${sessionAmount}`);
      await admin
        .from("billing_checkout_sessions")
        .update({
          status: "failed",
          webhook_payload: payload,
          provider_response: verifyJson,
          updated_at: new Date().toISOString(),
        })
        .eq("id", sessionId);
      return jsonResponse({ error: "Payment verification failed" }, 400);
    }

    // ── Step 11: Idempotent, race-safe finalization via RPC ────────────────
    const periodStart = new Date();
    const periodEnd = addPeriod(periodStart, sessionBillingPeriod as "monthly" | "yearly");
    const providerTransactionId = transactionId ?? sessionInvoiceId;
    const verifyData = recordValue(verifyJson.data);
    const verifyCustomer = recordValue(verifyData?.customer);
    const providerCustomerId = stringValue(verifyData?.customerId) || stringValue(verifyCustomer?.id);

    const { data: updatedSession, error: updateError } = await admin.rpc("finalize_mayar_payment", {
      p_session_id: sessionId,
      p_organization_id: orgId,
      p_actor_user_id: createdBy,
      p_plan: sessionPlan,
      p_billing_period: sessionBillingPeriod,
      p_amount: sessionAmount,
      p_period_start: periodStart.toISOString(),
      p_period_end: periodEnd.toISOString(),
      p_provider_transaction_id: providerTransactionId,
      p_provider_customer_id: providerCustomerId,
      p_webhook_payload: payload,
      p_provider_response: verifyJson,
    }).maybeSingle();

    if (updateError) {
      console.error("[webhook] finalize_rpc_error");
      return jsonResponse({ error: "Internal error" }, 500);
    }

    if (updatedSession) {
      return jsonResponse({ ok: true, paid: true, idempotent: false });
    }

    const { data: currentSession } = await admin
      .from("billing_checkout_sessions")
      .select("status")
      .eq("id", sessionId)
      .single();

    if (currentSession?.status === "paid") {
      return jsonResponse({ ok: true, paid: true, idempotent: true });
    }

    return jsonResponse({ ok: true, paid: false, reason: "finalization_failed" });
  } catch (error) {
    console.error("[webhook] internal_error");
    return jsonResponse({ error: "Internal error" }, 500);
  }
});
