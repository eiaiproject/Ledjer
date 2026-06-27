import { supabase } from "@/lib/supabase";
import type { Enums } from "@ledjer/database-types";

type TransactionStatus = Enums<"transaction_status">;

interface TransactionExportFilters {
  fromDate?: string;
  search?: string;
  status?: TransactionStatus | "";
  toDate?: string;
  transactionType?: string;
}

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

export async function exportTransactionsCsv(
  organizationId: string,
  filters: TransactionExportFilters = {}
): Promise<void> {
  const { data, error } = await supabase.rpc("export_transactions_csv", {
    p_organization_id: organizationId,
    p_from_date: filters.fromDate || undefined,
    p_search: filters.search || undefined,
    p_status: filters.status || undefined,
    p_to_date: filters.toDate || undefined,
    p_transaction_type: filters.transactionType || undefined,
  });
  if (error) throw error;
  downloadCsv((data as string) || "", todayFilename("transaksi"));
}

export async function exportAccountsCsv(
  organizationId: string
): Promise<void> {
  const { data, error } = await supabase.rpc("export_accounts_csv", {
    p_organization_id: organizationId,
  });
  if (error) throw error;
  downloadCsv((data as string) || "", todayFilename("akun"));
}

export async function exportProductsCsv(
  organizationId: string
): Promise<void> {
  const { data, error } = await supabase.rpc("export_products_csv", {
    p_organization_id: organizationId,
  });
  if (error) throw error;
  downloadCsv((data as string) || "", todayFilename("produk"));
}

export async function exportTrialBalanceCsv(
  organizationId: string,
  asOfDate?: string
): Promise<void> {
  const { data, error } = await supabase.rpc("export_trial_balance_csv", {
    p_organization_id: organizationId,
    p_as_of_date: asOfDate || undefined,
  });
  if (error) throw error;
  downloadCsv((data as string) || "", todayFilename("neraca_saldo"));
}

export async function exportProfitLossCsv(
  organizationId: string,
  fromDate?: string,
  toDate?: string
): Promise<void> {
  const { data, error } = await supabase.rpc("export_profit_loss_csv", {
    p_organization_id: organizationId,
    p_from_date: fromDate || undefined,
    p_to_date: toDate || undefined,
  });
  if (error) throw error;
  downloadCsv((data as string) || "", todayFilename("laba_rugi"));
}

export async function exportBalanceSheetCsv(
  organizationId: string,
  asOfDate?: string
): Promise<void> {
  const { data, error } = await supabase.rpc("export_balance_sheet_csv", {
    p_organization_id: organizationId,
    p_as_of_date: asOfDate || undefined,
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
  const { data, error } = await supabase.rpc("export_general_ledger_csv", {
    p_organization_id: organizationId,
    p_account_id: accountId || undefined,
    p_from_date: fromDate || undefined,
    p_to_date: toDate || undefined,
  });
  if (error) throw error;
  downloadCsv((data as string) || "", todayFilename("buku_besar"));
}
