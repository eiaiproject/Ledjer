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

const PENDING_EXPIRY_HOURS = 24;

// ─── Security constants ─────────────────────────────────────────────────
const MAX_BODY_SIZE = 8 * 1024; // 8 KB — generous for checkout payload
const MAYAR_FETCH_TIMEOUT_MS = 15_000;

/** Allowed hosts for Mayar checkout redirect URLs. Only HTTPS is accepted. */
const ALLOWED_CHECKOUT_HOSTS = new Set([
  "checkout.mayar.club",   // sandbox
  "checkout.mayar.id",     // production
  "web.mayar.club",        // sandbox fallback
  "web.mayar.id",          // production fallback
  "checkout.mayar.test",   // E2E testing only (IANA-reserved .test TLD)
]);

function isPaidPlan(value: unknown): value is PaidPlan {
  return value === "solo" || value === "business";
}

function isBillingPeriod(value: unknown): value is BillingPeriod {
  return value === "monthly" || value === "yearly";
}

/**
 * Validate a checkout URL returned by the payment provider.
 * Only HTTPS URLs from known Mayar hosts are accepted.
 * Rejects javascript:, protocol-relative, data:, and off-domain URLs.
 */
function validateCheckoutUrl(url: string): { ok: boolean; error?: string } {
  if (!url || typeof url !== "string") {
    return { ok: false, error: "Checkout URL is empty" };
  }

  // Reject protocol-relative, javascript:, data: schemes
  if (url.startsWith("//") || /^[a-z][a-z0-9+.-]*:/i.test(url)) {
    const lower = url.toLowerCase();
    if (!lower.startsWith("https://")) {
      return { ok: false, error: "Checkout URL must use HTTPS" };
    }
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, error: "Checkout URL is malformed" };
  }

  if (parsed.protocol !== "https:") {
    return { ok: false, error: "Checkout URL must use HTTPS" };
  }

  if (!ALLOWED_CHECKOUT_HOSTS.has(parsed.hostname)) {
    return { ok: false, error: "Checkout URL host not allowed" };
  }

  return { ok: true };
}

// ─── Indonesian phone number normalization ──────────────────────────────
function normalizeMobile(value: unknown): string {
  const raw = String(value ?? "").trim();
  const cleaned = raw.replace(/[^\d+]/g, "");
  const withPlus = cleaned.startsWith("+") ? cleaned.slice(1) : cleaned;
  const digits = withPlus.replace(/\D/g, "");

  if (digits.length < 10) {
    if (digits.length === 0) {
      throw new Error("Nomor WhatsApp harus diisi.");
    }
    throw new Error("Nomor WhatsApp minimal 10 digit setelah kode negara.");
  }

  let normalized: string;
  if (digits.startsWith("0")) {
    normalized = "62" + digits.slice(1);
  } else if (digits.startsWith("62")) {
    normalized = digits;
  } else {
    normalized = "62" + digits;
  }

  if (normalized.length > 15) {
    throw new Error("Nomor WhatsApp terlalu panjang.");
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
    // ── Body size limit ──────────────────────────────────────────────────
    const contentLength = Number(req.headers.get("content-length") ?? 0);
    if (contentLength > MAX_BODY_SIZE) {
      return jsonResponse({ error: "Request body too large" }, 413);
    }

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

    if (!organizationId) {
      return jsonResponse({ error: "Organisasi tidak ditemukan." }, 400);
    }
    if (!isPaidPlan(plan)) {
      return jsonResponse({ error: "Paket tidak valid." }, 400);
    }
    if (!isBillingPeriod(billingPeriod)) {
      return jsonResponse({ error: "Periode billing tidak valid." }, 400);
    }

    // Validate mobile before any DB writes
    let customerMobile: string;
    try {
      customerMobile = normalizeMobile(body.customerMobile);
    } catch (validationError) {
      const message = validationError instanceof Error ? validationError.message : "Nomor WhatsApp tidak valid.";
      return jsonResponse({ error: message }, 400);
    }

    const customerEmail = userData.user.email;
    if (!customerEmail) {
      return jsonResponse({ error: "Email akun tidak ditemukan." }, 400);
    }

    // ── Enforce owner-only billing changes (server-side) ──────────────────
    const { data: member, error: memberError } = await admin
      .from("organization_members")
      .select("role,status")
      .eq("organization_id", organizationId)
      .eq("user_id", userData.user.id)
      .eq("status", "active")
      .maybeSingle();
    if (memberError) {
      console.error("[checkout] member_lookup_error");
      return jsonResponse({ error: "Terjadi kesalahan." }, 500);
    }
    if (member?.role !== "owner") {
      return jsonResponse({ error: "Hanya owner yang dapat mengubah paket." }, 403);
    }

    const { data: organization, error: orgError } = await admin
      .from("organizations")
      .select("id,name,current_plan")
      .eq("id", organizationId)
      .single();
    if (orgError) {
      console.error("[checkout] org_lookup_error");
      return jsonResponse({ error: "Organisasi tidak ditemukan." }, 404);
    }

    const amount = PLAN_PRICES[plan][billingPeriod];
    const now = new Date();
    const expiresAt = new Date(now.getTime() + PENDING_EXPIRY_HOURS * 60 * 60 * 1000);

    // ── Cancel existing pending sessions ────────────────────────────────────
    const { error: cancelError } = await admin
      .from("billing_checkout_sessions")
      .update({ status: "canceled", updated_at: new Date().toISOString() })
      .eq("organization_id", organizationId)
      .eq("status", "pending");
    if (cancelError) {
      console.error("[checkout] cancel_pending_error");
      // Non-fatal — proceed to create new session
    }

    // ── Create checkout session ────────────────────────────────────────────
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
    if (sessionError) {
      console.error("[checkout] session_create_error");
      return jsonResponse({ error: "Gagal membuat sesi checkout." }, 500);
    }

    // ── Create Mayar invoice ──────────────────────────────────────────────
    const appUrl = (Deno.env.get("APP_URL") || "https://ledjer.id").replace(/\/$/, "");
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

    let mayarResponse: Response;
    let mayarJson: Record<string, unknown>;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), MAYAR_FETCH_TIMEOUT_MS);
      try {
        mayarResponse = await fetch(`${mayarBaseUrl()}/hl/v1/invoice/create`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${mayarApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(invoicePayload),
          signal: controller.signal,
        });
        mayarJson = await mayarResponse.json().catch(() => ({}));
      } finally {
        clearTimeout(timeoutId);
      }
    } catch (fetchError) {
      const isAbort = fetchError instanceof DOMException && fetchError.name === "AbortError";
      console.error(`[checkout] provider_fetch_${isAbort ? "timeout" : "error"}`);
      await admin
        .from("billing_checkout_sessions")
        .update({
          status: "failed",
          updated_at: new Date().toISOString(),
        })
        .eq("id", checkoutSession.id);
      return jsonResponse({ error: "Gagal terhubung ke penyedia pembayaran." }, 502);
    }

    if (!mayarResponse.ok) {
      const statusCode = Number(mayarJson.statusCode ?? mayarResponse.status);
      if (statusCode >= 400) {
        console.error(`[checkout] provider_error status=${mayarResponse.status}`);
        await admin
          .from("billing_checkout_sessions")
          .update({
            status: "failed",
            updated_at: new Date().toISOString(),
          })
          .eq("id", checkoutSession.id);
        return jsonResponse({ error: "Gagal membuat invoice pembayaran." }, 502);
      }
    }

    const invoice = Array.isArray(mayarJson.data) ? mayarJson.data[0] : mayarJson.data;
    const checkoutUrl = invoice?.link || invoice?.paymentUrl;

    if (!checkoutUrl) {
      console.error("[checkout] provider_no_checkout_url");
      await admin
        .from("billing_checkout_sessions")
        .update({
          status: "failed",
          updated_at: new Date().toISOString(),
        })
        .eq("id", checkoutSession.id);
      return jsonResponse({ error: "Gagal mendapatkan link pembayaran." }, 502);
    }

    // ── Validate checkout URL (security: only allow known Mayar HTTPS hosts) ──
    const urlCheck = validateCheckoutUrl(checkoutUrl);
    if (!urlCheck.ok) {
      console.error(`[checkout] invalid_checkout_url: ${urlCheck.error}`);
      await admin
        .from("billing_checkout_sessions")
        .update({
          status: "failed",
          updated_at: new Date().toISOString(),
        })
        .eq("id", checkoutSession.id);
      return jsonResponse({ error: "Link pembayaran tidak valid." }, 502);
    }

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

    // Log checkout created event (non-critical — fire and forget)
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
    }).throwOnError();

    return jsonResponse({
      checkoutUrl,
      sessionId: checkoutSession.id,
      invoiceId: invoice.id ?? null,
      transactionId: invoice.transactionId ?? null,
    });
  } catch (error) {
    console.error("[checkout] internal_error", error instanceof Error ? error.message : error);
    return jsonResponse({ error: "Terjadi kesalahan internal." }, 500);
  }
});
