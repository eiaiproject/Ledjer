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
 * Handles both `data.status` and nested structure.
 */
function extractInvoiceStatus(verifyJson: Record<string, unknown>): string {
  const data = recordValue(verifyJson.data);
  const status = stringValue(data?.status) || stringValue(verifyJson.status);
  return status.toLowerCase();
}

/**
 * Extract invoice amount from Mayar's verify-invoice response.
 * Handles both `data.amount` and nested structures.
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
      console.error("MAYAR_WEBHOOK_TOKEN is not set — cannot process webhook.");
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
    // JSON parsing comes before env loading so malformed payloads get 400
    // even if non-essential env vars are missing.
    const rawPayload = await req.text();
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

    console.log(`Webhook received: event=${event} transactionId=${transactionId} invoiceId=${invoiceId}`);

    // ── Step 3: Load envs for further processing ───────────────────────────-
    // These are required only after token + payload validation passes.
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
        console.error("Error looking up session by transactionId:", result.error);
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
        console.error("Error looking up session by invoiceId:", result.error);
        return jsonResponse({ error: "Internal error" }, 500);
      }
      session = result.data;
    }

    // ── Step 4: Unknown session — safely ignore ────────────────────────────
    if (!session) {
      console.log(`Webhook ignored: no session found for transactionId=${transactionId} invoiceId=${invoiceId}`);
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

    // ── Step 5: Log webhook received event ─────────────────────────────────
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

    // ── Step 8: Verify invoice with Mayar API (don't trust webhook alone) ──
    let verifyResponse: Response;
    let verifyJson: Record<string, unknown>;
    try {
      verifyResponse = await fetch(`${mayarBaseUrl()}/hl/v1/invoice/${sessionInvoiceId}`, {
        headers: { Authorization: `Bearer ${mayarApiKey}` },
      });
      verifyJson = await verifyResponse.json().catch(() => ({}));
    } catch (fetchError) {
      console.error("Mayar API fetch failed for invoice verification:", fetchError);
      return jsonResponse({ error: "Internal error" }, 502);
    }

    // ── Step 9: Validate invoice status via Mayar API ──────────────────────
    if (!verifyResponse.ok) {
      console.error(`Mayar invoice verification failed: status=${verifyResponse.status} invoiceId=${sessionInvoiceId}`);
      // Mark session as potentially failed but don't change the org plan
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
      console.log(`Invoice ${sessionInvoiceId} status is ${verifiedStatus} — not upgrading plan`);
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

    // ── Step 10: Validate amount matches — prevent partial/incorrect payment ──
    if (verifiedAmount < sessionAmount) {
      console.error(`Amount mismatch: verified=${verifiedAmount} expected=${sessionAmount}`);
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
    // Use conditional update semantics: only update if session is still pending.
    // This prevents double-processing in case of parallel webhook deliveries.
    const periodStart = new Date();
    const periodEnd = addPeriod(periodStart, sessionBillingPeriod as "monthly" | "yearly");
    const providerTransactionId = transactionId ?? sessionInvoiceId;
    const verifyData = recordValue(verifyJson.data);
    const verifyCustomer = recordValue(verifyData?.customer);
    const providerCustomerId = stringValue(verifyData?.customerId) || stringValue(verifyCustomer?.id);

    // Atomic update: mark session as paid only if currently pending
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
      console.error("finalize_mayar_payment RPC error:", updateError);
      return jsonResponse({ error: "Internal error" }, 500);
    }

    // If the RPC returned a result, it means payment was finalized successfully
    if (updatedSession) {
      return jsonResponse({ ok: true, paid: true, idempotent: false });
    }

    // If no rows affected, either session was already paid or something else is wrong
    // Check current session status
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
    console.error("Webhook processing error:", error);
    return jsonResponse({ error: "Internal error" }, 500);
  }
});
