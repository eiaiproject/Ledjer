import { supabase } from "@/lib/supabase";

export const FREE_PLAN_TRANSACTION_LIMIT = 50;

export interface MonthlyTransactionUsage {
  count: number;
  limit: number;
  remaining: number;
  periodStart: string;
  periodEnd: string;
}

/**
 * Fetch monthly usage from the server-owned RPC to avoid client timezone
 * drift. The RPC uses `date_trunc('month', now())` consistently with
 * backend enforcement.
 */
export async function fetchMonthlyTransactionUsage(
  organizationId: string
): Promise<MonthlyTransactionUsage> {
  const { data, error } = await supabase.rpc("get_monthly_usage", {
    p_org_id: organizationId,
  });

  if (error) throw error;

  const row = data as Record<string, unknown> | null;
  if (
    !row ||
    typeof row.count !== 'number' ||
    typeof row.limit !== 'number' ||
    typeof row.remaining !== 'number' ||
    typeof row.period_start !== 'string' ||
    typeof row.period_end !== 'string'
  ) {
    throw new Error('Respons pemakaian bulanan tidak valid dari server. Silakan coba lagi.');
  }

  return {
    count: row.count,
    limit: row.limit,
    remaining: row.remaining,
    periodStart: row.period_start,
    periodEnd: row.period_end,
  };
}
