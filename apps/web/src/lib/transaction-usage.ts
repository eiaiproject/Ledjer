import { supabase } from "@/lib/supabase";

export const FREE_PLAN_TRANSACTION_LIMIT = 50;

export interface MonthlyTransactionUsage {
  count: number;
  limit: number;
  remaining: number;
  periodStart: string;
  periodEnd: string;
}

export function getCurrentUsagePeriod(now = new Date()) {
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  return {
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString(),
  };
}

export async function fetchMonthlyTransactionUsage(
  organizationId: string
): Promise<MonthlyTransactionUsage> {
  const { periodStart, periodEnd } = getCurrentUsagePeriod();

  const { count, error } = await supabase
    .from("transactions")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .in("status", ["posted", "voided"])
    .is("original_transaction_id", null)
    .not("transaction_type", "like", "opening_%")
    .gte("created_at", periodStart)
    .lt("created_at", periodEnd);

  if (error) throw error;

  const usageCount = count ?? 0;

  return {
    count: usageCount,
    limit: FREE_PLAN_TRANSACTION_LIMIT,
    remaining: Math.max(FREE_PLAN_TRANSACTION_LIMIT - usageCount, 0),
    periodStart,
    periodEnd,
  };
}
