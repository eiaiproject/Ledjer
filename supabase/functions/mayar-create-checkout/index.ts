import { createClient } from "https://esm.sh/@supabase/supabase-js@2.108.2";
import { corsHeaders, jsonResponse, mayarBaseUrl, requireEnv } from "../_shared/http.ts";

type BillingPeriod = "monthly" | "yearly";
type PaidPlan = "solo" | "business";

const PLAN_PRICES: Record<PaidPlan, Record<BillingPeriod, number>> = {
  solo: { monthly: 39_000, yearly: 390_000 },
  business: { monthly: 49_000, yearly: 490_000 },
};

const PLAN_LABELS: Record<PaidPlan, string> = {
  solo: "Solo",
  business: "Business",
};

function isPaidPlan(value: unknown): value is PaidPlan {
  return value === "solo" || value === "business";
}

function isBillingPeriod(value: unknown): value is BillingPeriod {
  return value === "monthly" || value === "yearly";
}

function normalizeMobile(value: unknown) {
  const raw = String(value ?? "").trim();
  const normalized = raw.replace(/[^\d+]/g, "");
  const digits = normalized.replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 16) {
    throw new Error("Nomor WhatsApp pembayaran tidak valid.");
  }
  return normalized;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const supabaseUrl = requireEnv("SUPABASE_URL");
    const anonKey = requireEnv("SUPABASE_ANON_KEY");
    const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
    const mayarApiKey = requireEnv("MAYAR_API_KEY");
    const authHeader = req.headers.get("Authorization") ?? "";

    if (!authHeader.startsWith("Bearer ")) {
      return jsonResponse({ error: "Autentikasi diperlukan." }, 401);
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const admin = createClient(supabaseUrl, serviceRoleKey);

    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData.user) {
      return jsonResponse({ error: "Sesi tidak valid." }, 401);
    }

    const body = await req.json().catch(() => ({}));
    const organizationId = String(body.organizationId ?? "");
    const plan = body.plan;
    const billingPeriod = body.billingPeriod;

    if (!organizationId) throw new Error("Organisasi tidak ditemukan.");
    if (!isPaidPlan(plan)) throw new Error("Paket tidak valid.");
    if (!isBillingPeriod(billingPeriod)) throw new Error("Periode billing tidak valid.");

    const customerMobile = normalizeMobile(body.customerMobile);
    const customerEmail = userData.user.email;
    if (!customerEmail) throw new Error("Email akun tidak ditemukan.");

    const { data: member, error: memberError } = await admin
      .from("organization_members")
      .select("role,status")
      .eq("organization_id", organizationId)
      .eq("user_id", userData.user.id)
      .eq("status", "active")
      .maybeSingle();
    if (memberError) throw memberError;
    if (member?.role !== "owner") {
      return jsonResponse({ error: "Hanya owner yang dapat mengubah paket." }, 403);
    }

    const { data: organization, error: orgError } = await admin
      .from("organizations")
      .select("id,name,current_plan")
      .eq("id", organizationId)
      .single();
    if (orgError) throw orgError;

    const amount = PLAN_PRICES[plan][billingPeriod];
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    const { data: checkoutSession, error: sessionError } = await admin
      .from("billing_checkout_sessions")
      .insert({
        organization_id: organizationId,
        created_by: userData.user.id,
        plan,
        billing_period: billingPeriod,
        amount,
        currency: "IDR",
        status: "pending",
        payment_provider: "mayar",
        customer_email: customerEmail,
        customer_mobile: customerMobile,
        expires_at: expiresAt.toISOString(),
        metadata: {
          source: "settings_billing",
          previous_plan: organization.current_plan,
        },
      })
      .select("id")
      .single();
    if (sessionError) throw sessionError;

    const appUrl = (Deno.env.get("APP_URL") || "https://app.ledjer.id").replace(/\/$/, "");
    const redirectUrl = `${appUrl}/settings/billing?checkout=mayar`;
    const customerName =
      String(userData.user.user_metadata?.full_name ?? "").trim() ||
      customerEmail.split("@")[0] ||
      "Pelanggan Ledjer";

    const invoicePayload = {
      name: customerName,
      email: customerEmail,
      mobile: customerMobile,
      redirectUrl,
      description: `Langganan Ledjer ${PLAN_LABELS[plan]} ${billingPeriod === "yearly" ? "Tahunan" : "Bulanan"}`,
      expiredAt: expiresAt.toISOString(),
      items: [
        {
          quantity: 1,
          rate: amount,
          description: `Ledjer ${PLAN_LABELS[plan]} - ${billingPeriod}`,
        },
      ],
      extraData: {
        checkoutSessionId: checkoutSession.id,
        organizationId,
        plan,
        billingPeriod,
      },
    };

    const mayarResponse = await fetch(`${mayarBaseUrl()}/hl/v1/invoice/create`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${mayarApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(invoicePayload),
    });
    const mayarJson = await mayarResponse.json().catch(() => ({}));

    if (!mayarResponse.ok || mayarJson.statusCode >= 400) {
      await admin
        .from("billing_checkout_sessions")
        .update({
          status: "failed",
          provider_response: mayarJson,
          updated_at: new Date().toISOString(),
        })
        .eq("id", checkoutSession.id);
      return jsonResponse({ error: "Gagal membuat invoice Mayar." }, 502);
    }

    const invoice = Array.isArray(mayarJson.data) ? mayarJson.data[0] : mayarJson.data;
    const checkoutUrl = invoice?.link || invoice?.paymentUrl;
    if (!checkoutUrl) throw new Error("Mayar tidak mengembalikan checkout URL.");

    await admin
      .from("billing_checkout_sessions")
      .update({
        mayar_invoice_id: invoice.id ?? null,
        mayar_transaction_id: invoice.transactionId ?? null,
        checkout_url: checkoutUrl,
        provider_response: mayarJson,
        updated_at: new Date().toISOString(),
      })
      .eq("id", checkoutSession.id);

    await admin.from("billing_events").insert({
      organization_id: organizationId,
      actor_user_id: userData.user.id,
      event_type: "checkout_created",
      from_plan: organization.current_plan,
      to_plan: plan,
      payment_provider: "mayar",
      provider_event_id: invoice.transactionId ?? invoice.id ?? checkoutSession.id,
      metadata: {
        checkout_session_id: checkoutSession.id,
        billing_period: billingPeriod,
        amount,
      },
    });

    return jsonResponse({
      checkoutUrl,
      sessionId: checkoutSession.id,
      invoiceId: invoice.id ?? null,
      transactionId: invoice.transactionId ?? null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Terjadi kesalahan.";
    return jsonResponse({ error: message }, 400);
  }
});
