import { supabase } from "@/lib/supabase";

export interface MonthlyTransactionUsage {
  count: number;
  limit: number | null;
  remaining: number | null;
  isUnlimited: boolean;
  periodStart: string;
  periodEnd: string;
}

/**
 * Fetch monthly usage from the server-owned RPC to avoid client timezone
 * drift. The RPC uses `date_trunc('month', now())` for reporting.
 */
export async function fetchMonthlyTransactionUsage(
  organizationId: string
): Promise<MonthlyTransactionUsage> {
  const { data, error } = await supabase.rpc("get_monthly_usage", {
    p_org_id: organizationId,
  });

  if (error) throw error;

  const row = data as Record<string, unknown> | null;
  const count = row?.count;
  const limit = row?.limit;
  const remaining = row?.remaining;
  const periodStart = row?.period_start;
  const periodEnd = row?.period_end;
  const isUnlimited = row?.is_unlimited;

  if (
    !row ||
    typeof count !== 'number' ||
    (typeof limit !== 'number' && limit !== null) ||
    (typeof remaining !== 'number' && remaining !== null) ||
    typeof periodStart !== 'string' ||
    typeof periodEnd !== 'string'
  ) {
    throw new Error('Respons pemakaian bulanan tidak valid dari server. Silakan coba lagi.');
  }

  return {
    count,
    limit,
    remaining,
    isUnlimited: isUnlimited === true || limit === null,
    periodStart,
    periodEnd,
  };
}
