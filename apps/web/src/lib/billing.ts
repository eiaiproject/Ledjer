import { supabase } from "@/lib/supabase";

export type BillingPeriod = "monthly" | "yearly";
export type PaidPlan = "solo" | "business";

interface CreateMayarCheckoutInput {
  organizationId: string;
  plan: PaidPlan;
  billingPeriod: BillingPeriod;
  customerMobile: string;
}

interface MayarCheckoutResponse {
  checkoutUrl: string;
  sessionId: string;
  invoiceId?: string | null;
  transactionId?: string | null;
}

export async function createMayarCheckout({
  organizationId,
  plan,
  billingPeriod,
  customerMobile,
}: CreateMayarCheckoutInput): Promise<MayarCheckoutResponse> {
  const { data, error } = await supabase.functions.invoke<MayarCheckoutResponse>(
    "mayar-create-checkout",
    {
      body: {
        organizationId,
        plan,
        billingPeriod,
        customerMobile,
      },
    },
  );

  if (error) throw error;
  if (!data?.checkoutUrl) {
    throw new Error("Mayar tidak mengembalikan link pembayaran.");
  }
  return data;
}
