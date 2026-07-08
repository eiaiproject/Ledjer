import { apiDownload } from "@/lib/api/client";
import type { TransactionStatus } from "@/lib/api/transactions";

// ponytail: was 7 functions each accepting unused _organizationId. Params removed.

function downloadBlob(blob: Blob, filename: string): void {
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
  const date = new Date();
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${prefix}_${yyyy}${mm}${dd}.csv`;
}

async function downloadCsv(path: string, fallbackFilename: string): Promise<void> {
  const { blob, filename } = await apiDownload(path);
  downloadBlob(blob, filename || fallbackFilename);
}

function withQuery(path: string, query: string): string {
  return query ? `${path}?${query}` : path;
}

export async function exportTransactionsCsv(
  filters: {
    fromDate?: string;
    search?: string;
    status?: TransactionStatus | "";
    toDate?: string;
    transactionType?: string;
  } = {},
): Promise<void> {
  const params = new URLSearchParams();
  if (filters.fromDate) params.set("fromDate", filters.fromDate);
  if (filters.search) params.set("search", filters.search);
  if (filters.status) params.set("status", filters.status);
  if (filters.toDate) params.set("toDate", filters.toDate);
  if (filters.transactionType) params.set("transactionType", filters.transactionType);
  const query = params.toString();
  await downloadCsv(withQuery("/api/exports/transactions.csv", query), todayFilename("transaksi"));
}

export async function exportAccountsCsv(): Promise<void> {
  await downloadCsv("/api/exports/accounts.csv", todayFilename("akun"));
}

export async function exportProductsCsv(): Promise<void> {
  await downloadCsv("/api/exports/products.csv", todayFilename("produk"));
}

export async function exportTrialBalanceCsv(asOfDate?: string): Promise<void> {
  const params = new URLSearchParams();
  if (asOfDate) params.set("asOfDate", asOfDate);
  const query = params.toString();
  await downloadCsv(withQuery("/api/exports/reports/trial-balance.csv", query), todayFilename("neraca_saldo"));
}

export async function exportProfitLossCsv(fromDate?: string, toDate?: string): Promise<void> {
  const params = new URLSearchParams();
  if (fromDate) params.set("fromDate", fromDate);
  if (toDate) params.set("toDate", toDate);
  const query = params.toString();
  await downloadCsv(withQuery("/api/exports/reports/profit-loss.csv", query), todayFilename("laba_rugi"));
}

export async function exportBalanceSheetCsv(asOfDate?: string): Promise<void> {
  const params = new URLSearchParams();
  if (asOfDate) params.set("asOfDate", asOfDate);
  const query = params.toString();
  await downloadCsv(withQuery("/api/exports/reports/balance-sheet.csv", query), todayFilename("neraca"));
}

export async function exportGeneralLedgerCsv(
  accountId?: string,
  fromDate?: string,
  toDate?: string,
): Promise<void> {
  const params = new URLSearchParams();
  if (accountId && accountId !== "all") params.set("accountId", accountId);
  if (fromDate) params.set("fromDate", fromDate);
  if (toDate) params.set("toDate", toDate);
  const query = params.toString();
  await downloadCsv(withQuery("/api/exports/reports/general-ledger.csv", query), todayFilename("buku_besar"));
}
