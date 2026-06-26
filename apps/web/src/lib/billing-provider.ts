/**
 * Billing Provider Abstraction
 *
 * Provider-agnostic interface for payment processing.
 * ⚠️ No real payment provider is integrated yet. This is a scaffold.
 * Manual billing via admin SQL console is the current fallback.
 *
 * When a provider is selected (e.g. Midtrans, Stripe), implement
 * the BillingProvider interface and wire it into checkout/webhook flows.
 *
 * SECURITY: Provider secrets (API keys, webhook secrets) must NEVER
 * reach the frontend. All provider interactions happen server-side
 * (Edge Functions or server-side RPCs).
 */

export type PlanKey = "free" | "solo" | "business" | "trial" | "past_due" | "canceled" | "expired";

export type SubscriptionStatus =
  | "active"
  | "trialing"
  | "past_due"
  | "canceled"
  | "expired"
  | "suspended";

export interface PlanDefinition {
  id: PlanKey;
  name: string;
  displayName: string;
  monthlyPrice: number;   // in IDR
  yearlyPrice: number;    // in IDR
  staffLimit: number;
  transactionLimit: number | null; // null = unlimited
  features: string[];
}

export interface Subscription {
  plan: PlanKey;
  status: SubscriptionStatus;
  trialEndsAt: string | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAt: string | null;
  canceledAt: string | null;
}

export interface CheckoutSession {
  sessionId: string;
  checkoutUrl: string;
}

export interface WebhookEvent {
  type: string;             // e.g. 'payment.success', 'subscription.activated'
  providerEventId: string;
  payload: Record<string, unknown>;
}

/**
 * Implement this interface for a real payment provider.
 * All methods are server-side only.
 */
export interface BillingProvider {
  /** Human-readable provider name */
  readonly name: string;

  /** Create a checkout session for upgrading to a plan */
  createCheckoutSession(params: {
    organizationId: string;
    planId: PlanKey;
    customerEmail: string;
    successUrl: string;
    cancelUrl: string;
  }): Promise<CheckoutSession>;

  /** Verify and parse a webhook event from the provider */
  verifyWebhookEvent(params: {
    headers: Record<string, string>;
    body: string;
  }): Promise<WebhookEvent | null>;

  /** Handle a verified webhook event */
  handleWebhookEvent(event: WebhookEvent): Promise<void>;

  /** Cancel a subscription */
  cancelSubscription(params: {
    subscriptionId: string;
    immediately?: boolean;
  }): Promise<void>;

  /** Get current subscription status from provider */
  getSubscriptionStatus(params: {
    customerId: string;
  }): Promise<Subscription>;
}

/**
 * Plan catalog — single source of truth for plan definitions.
 */
export const PLAN_CATALOG: Record<PlanKey, PlanDefinition> = {
  free: {
    id: "free",
    name: "Gratis",
    displayName: "Gratis",
    monthlyPrice: 0,
    yearlyPrice: 0,
    staffLimit: 0,
    transactionLimit: 50,
    features: [
      "1 pemilik",
      "50 transaksi/bulan",
      "Laporan dasar",
      "Bagan akun default",
    ],
  },
  solo: {
    id: "solo",
    name: "Solo",
    displayName: "Solo",
    monthlyPrice: 39000,
    yearlyPrice: 390000,
    staffLimit: 0,
    transactionLimit: null,
    features: [
      "1 pemilik",
      "Transaksi unlimited",
      "Semua laporan keuangan",
      "Buku besar",
      "Neraca saldo",
      "Laba rugi",
      "Neraca",
      "Audit log",
    ],
  },
  business: {
    id: "business",
    name: "Business",
    displayName: "Business",
    monthlyPrice: 49000,
    yearlyPrice: 490000,
    staffLimit: 1,
    transactionLimit: null,
    features: [
      "1 pemilik + 1 staf",
      "Transaksi unlimited",
      "Semua fitur Solo",
      "Kelola izin staf",
      "Audit aktivitas staf",
      "Cocok untuk kasir/admin",
    ],
  },
  trial: {
    id: "trial",
    name: "Trial",
    displayName: "Uji Coba",
    monthlyPrice: 0,
    yearlyPrice: 0,
    staffLimit: 0,
    transactionLimit: null,
    features: ["Fitur lengkap selama masa uji coba"],
  },
  past_due: {
    id: "past_due",
    name: "Past Due",
    displayName: "Pembayaran Tertunggak",
    monthlyPrice: 0,
    yearlyPrice: 0,
    staffLimit: 0,
    transactionLimit: null,
    features: [],
  },
  canceled: {
    id: "canceled",
    name: "Canceled",
    displayName: "Dibatalkan",
    monthlyPrice: 0,
    yearlyPrice: 0,
    staffLimit: 0,
    transactionLimit: null,
    features: [],
  },
  expired: {
    id: "expired",
    name: "Expired",
    displayName: "Kedaluwarsa",
    monthlyPrice: 0,
    yearlyPrice: 0,
    staffLimit: 0,
    transactionLimit: null,
    features: [],
  },
};

/**
 * Check if a plan allows creating transactions.
 */
export function canCreateTransactions(_plan: PlanKey, status: SubscriptionStatus): boolean {
  if (status === "suspended" || status === "canceled" || status === "expired") return false;
  return true; // free plan has usage limit, not plan-level block
}

/**
 * Check if plan limits staff invitations.
 */
export function canInviteStaff(plan: PlanKey): boolean {
  return plan === "business";
}

/**
 * Get the display status for a subscription.
 */
export function getSubscriptionDisplayStatus(
  _plan: PlanKey,
  status: SubscriptionStatus
): { label: string; variant: "success" | "warning" | "error" | "info" | "neutral" } {
  if (status === "suspended") return { label: "Ditangguhkan", variant: "error" };
  if (status === "canceled") return { label: "Dibatalkan", variant: "error" };
  if (status === "expired") return { label: "Kedaluwarsa", variant: "error" };
  if (status === "past_due") return { label: "Pembayaran Tertunggak", variant: "warning" };
  if (status === "trialing") return { label: "Uji Coba", variant: "info" };
  if (_plan === "free") return { label: "Gratis", variant: "neutral" };
  return { label: "Aktif", variant: "success" };
}

// ponytail: When a real payment provider is selected, create
// src/lib/billing-providers/<provider>.ts implementing BillingProvider.
// Add provider initialization in a server-side context (Edge Function).
// Current ceiling: manual billing via admin SQL console.
