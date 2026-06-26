import { supabase } from "@/lib/supabase";

/**
 * Download CSV data as a file.
 * ponytail: No server-side streaming yet; adequate for <10k rows.
 * Add streaming/chunked download for large exports.
 */
function downloadCsv(csvContent: string, filename: string): void {
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function todayFilename(prefix: string): string {
  const d = new Date();
  const date = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  return `${prefix}_${date}.csv`;
}

// ponytail: RPC names are cast to `any` because the new export RPCs are not
// yet in the generated database types. After `supabase gen types`, remove casts.
const rpc = supabase.rpc as (name: string, params?: Record<string, unknown>) => ReturnType<typeof supabase.rpc>;

export async function exportTransactionsCsv(
  organizationId: string,
  fromDate?: string,
  toDate?: string
): Promise<void> {
  const { data, error } = await rpc("export_transactions_csv", {
    p_organization_id: organizationId,
    p_from_date: fromDate || null,
    p_to_date: toDate || null,
  });
  if (error) throw error;
  downloadCsv((data as string) || "", todayFilename("transaksi"));
}

export async function exportAccountsCsv(
  organizationId: string
): Promise<void> {
  const { data, error } = await rpc("export_accounts_csv", {
    p_organization_id: organizationId,
  });
  if (error) throw error;
  downloadCsv((data as string) || "", todayFilename("akun"));
}

export async function exportProductsCsv(
  organizationId: string
): Promise<void> {
  const { data, error } = await rpc("export_products_csv", {
    p_organization_id: organizationId,
  });
  if (error) throw error;
  downloadCsv((data as string) || "", todayFilename("produk"));
}

export async function exportTrialBalanceCsv(
  organizationId: string,
  asOfDate?: string
): Promise<void> {
  const { data, error } = await rpc("export_trial_balance_csv", {
    p_organization_id: organizationId,
    p_as_of_date: asOfDate || null,
  });
  if (error) throw error;
  downloadCsv((data as string) || "", todayFilename("neraca_saldo"));
}

export async function exportProfitLossCsv(
  organizationId: string,
  fromDate?: string,
  toDate?: string
): Promise<void> {
  const { data, error } = await rpc("export_profit_loss_csv", {
    p_organization_id: organizationId,
    p_from_date: fromDate || null,
    p_to_date: toDate || null,
  });
  if (error) throw error;
  downloadCsv((data as string) || "", todayFilename("laba_rugi"));
}

export async function exportBalanceSheetCsv(
  organizationId: string,
  asOfDate?: string
): Promise<void> {
  const { data, error } = await rpc("export_balance_sheet_csv", {
    p_organization_id: organizationId,
    p_as_of_date: asOfDate || null,
  });
  if (error) throw error;
  downloadCsv((data as string) || "", todayFilename("neraca"));
}

export async function exportGeneralLedgerCsv(
  organizationId: string,
  accountId?: string,
  fromDate?: string,
  toDate?: string
): Promise<void> {
  const { data, error } = await rpc("export_general_ledger_csv", {
    p_organization_id: organizationId,
    p_account_id: accountId || null,
    p_from_date: fromDate || null,
    p_to_date: toDate || null,
  });
  if (error) throw error;
  downloadCsv((data as string) || "", todayFilename("buku_besar"));
}
