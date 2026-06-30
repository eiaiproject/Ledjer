import { createClient } from "https://esm.sh/@supabase/supabase-js@2.108.2";
import { corsHeaders, jsonResponse, mayarBaseUrl, requireEnv } from "../_shared/http.ts";

function addPeriod(start: Date, period: "monthly" | "yearly") {
  const end = new Date(start);
  if (period === "yearly") {
    end.setFullYear(end.getFullYear() + 1);
  } else {
    end.setMonth(end.getMonth() + 1);
  }
  return end;
}

function paidStatus(value: unknown) {
  const status = String(value ?? "").toLowerCase();
  return status === "paid" || status === "success" || status === "settled";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const webhookToken = Deno.env.get("MAYAR_WEBHOOK_TOKEN");
    if (webhookToken) {
      const url = new URL(req.url);
      if (url.searchParams.get("token") !== webhookToken) {
        return jsonResponse({ error: "Unauthorized" }, 401);
      }
    }

    const supabaseUrl = requireEnv("SUPABASE_URL");
    const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
    const mayarApiKey = requireEnv("MAYAR_API_KEY");
    const admin = createClient(supabaseUrl, serviceRoleKey);

    const payload = await req.json().catch(() => ({}));
    const event = String(payload.event ?? payload.type ?? "mayar.webhook");
    const data = payload.data ?? payload;
    const transactionId = data?.transactionId ?? data?.id ?? null;
    const invoiceId = data?.paymentLinkId ?? data?.productId ?? data?.invoiceId ?? null;

    let session = null;
    if (transactionId) {
      const result = await admin
        .from("billing_checkout_sessions")
        .select("*")
        .eq("mayar_transaction_id", transactionId)
        .maybeSingle();
      if (result.error) throw result.error;
      session = result.data;
    }

    if (!session && invoiceId) {
      const result = await admin
        .from("billing_checkout_sessions")
        .select("*")
        .eq("mayar_invoice_id", invoiceId)
        .maybeSingle();
      if (result.error) throw result.error;
      session = result.data;
    }

    if (!session) {
      return jsonResponse({ ok: true, ignored: true });
    }

    await admin.from("billing_events").insert({
      organization_id: session.organization_id,
      actor_user_id: session.created_by,
      event_type: "webhook_received",
      payment_provider: "mayar",
      provider_event_id: transactionId ?? invoiceId ?? null,
      metadata: { event, payload },
    });

    if (session.status === "paid") {
      return jsonResponse({ ok: true, idempotent: true });
    }

    if (!session.mayar_invoice_id) {
      await admin
        .from("billing_checkout_sessions")
        .update({
          webhook_payload: payload,
          updated_at: new Date().toISOString(),
        })
        .eq("id", session.id);
      return jsonResponse({ ok: true, pending: true });
    }

    const verifyResponse = await fetch(`${mayarBaseUrl()}/hl/v1/invoice/${session.mayar_invoice_id}`, {
      headers: { Authorization: `Bearer ${mayarApiKey}` },
    });
    const verifyJson = await verifyResponse.json().catch(() => ({}));
    const invoice = verifyJson.data ?? {};

    if (!verifyResponse.ok || !paidStatus(invoice.status)) {
      await admin
        .from("billing_checkout_sessions")
        .update({
          webhook_payload: payload,
          provider_response: verifyJson,
          updated_at: new Date().toISOString(),
        })
        .eq("id", session.id);
      return jsonResponse({ ok: true, paid: false });
    }

    const verifiedAmount = Number(invoice.amount ?? data?.amount ?? 0);
    if (!Number.isFinite(verifiedAmount) || verifiedAmount < Number(session.amount)) {
      await admin
        .from("billing_checkout_sessions")
        .update({
          status: "failed",
          webhook_payload: payload,
          provider_response: verifyJson,
          updated_at: new Date().toISOString(),
        })
        .eq("id", session.id);
      return jsonResponse({ error: "Invalid Mayar amount" }, 400);
    }

    const { data: organization, error: orgError } = await admin
      .from("organizations")
      .select("current_plan,subscription_status")
      .eq("id", session.organization_id)
      .single();
    if (orgError) throw orgError;

    const periodStart = new Date();
    const periodEnd = addPeriod(periodStart, session.billing_period);
    const providerCustomerId = invoice.customerId ?? invoice.customer?.id ?? null;
    const providerTransactionId = invoice.transactionId ?? transactionId ?? session.mayar_transaction_id;

    const { error: orgUpdateError } = await admin
      .from("organizations")
      .update({
        current_plan: session.plan,
        subscription_status: "active",
        current_period_start: periodStart.toISOString(),
        current_period_end: periodEnd.toISOString(),
        payment_provider: "mayar",
        payment_provider_customer_id: providerCustomerId,
        payment_provider_subscription_id: providerTransactionId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", session.organization_id);
    if (orgUpdateError) throw orgUpdateError;

    await admin
      .from("billing_checkout_sessions")
      .update({
        status: "paid",
        paid_at: periodStart.toISOString(),
        mayar_transaction_id: providerTransactionId,
        webhook_payload: payload,
        provider_response: verifyJson,
        updated_at: new Date().toISOString(),
      })
      .eq("id", session.id);

    await admin.from("billing_events").insert({
      organization_id: session.organization_id,
      actor_user_id: session.created_by,
      event_type: "payment_succeeded",
      from_plan: organization.current_plan,
      to_plan: session.plan,
      from_status: organization.subscription_status,
      to_status: "active",
      payment_provider: "mayar",
      provider_event_id: providerTransactionId,
      metadata: {
        checkout_session_id: session.id,
        invoice_id: session.mayar_invoice_id,
        billing_period: session.billing_period,
        amount: session.amount,
        current_period_start: periodStart.toISOString(),
        current_period_end: periodEnd.toISOString(),
      },
    });

    await admin.from("audit_logs").insert({
      organization_id: session.organization_id,
      actor_user_id: session.created_by,
      entity_type: "organization",
      entity_id: session.organization_id,
      action: "billing_plan_change",
      before_data: {
        plan: organization.current_plan,
        subscription_status: organization.subscription_status,
      },
      after_data: {
        plan: session.plan,
        subscription_status: "active",
        payment_provider: "mayar",
      },
      reason: "mayar_payment_succeeded",
    });

    return jsonResponse({ ok: true, paid: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Terjadi kesalahan.";
    return jsonResponse({ error: message }, 400);
  }
});
