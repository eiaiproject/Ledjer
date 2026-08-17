import { apiDownload } from "@/lib/api/client";

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function todayFilename(prefix: string): string {
  const date = new Date();
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${prefix}_${yyyy}${mm}${dd}.pdf`;
}

async function downloadPdf(path: string, fallbackFilename: string): Promise<void> {
  const { blob, filename } = await apiDownload(path);
  downloadBlob(blob, filename || fallbackFilename);
}

function withQuery(path: string, query: string): string {
  return query ? `${path}?${query}` : path;
}

export async function exportTrialBalancePdf(asOfDate?: string): Promise<void> {
  const params = new URLSearchParams();
  if (asOfDate) params.set("asOfDate", asOfDate);
  const query = params.toString();
  await downloadPdf(withQuery("/api/exports/reports/trial-balance.pdf", query), todayFilename("neraca_saldo"));
}

export async function exportProfitLossPdf(fromDate?: string, toDate?: string): Promise<void> {
  const params = new URLSearchParams();
  if (fromDate) params.set("fromDate", fromDate);
  if (toDate) params.set("toDate", toDate);
  const query = params.toString();
  await downloadPdf(withQuery("/api/exports/reports/profit-loss.pdf", query), todayFilename("laba_rugi"));
}

export async function exportBalanceSheetPdf(asOfDate?: string): Promise<void> {
  const params = new URLSearchParams();
  if (asOfDate) params.set("asOfDate", asOfDate);
  const query = params.toString();
  await downloadPdf(withQuery("/api/exports/reports/balance-sheet.pdf", query), todayFilename("neraca"));
}

export async function exportGeneralLedgerPdf(
  accountId?: string,
  fromDate?: string,
  toDate?: string,
): Promise<void> {
  const params = new URLSearchParams();
  if (accountId && accountId !== "all") params.set("accountId", accountId);
  if (fromDate) params.set("fromDate", fromDate);
  if (toDate) params.set("toDate", toDate);
  const query = params.toString();
  await downloadPdf(withQuery("/api/exports/reports/general-ledger.pdf", query), todayFilename("buku_besar"));
}
