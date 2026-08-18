import { downloadExport, exportPath } from "@/lib/download";

export async function exportTrialBalancePdf(asOfDate?: string): Promise<void> {
  const params = new URLSearchParams();
  if (asOfDate) params.set("asOfDate", asOfDate);
  await downloadExport(exportPath("/api/exports/reports/trial-balance.pdf", params), "neraca_saldo", "pdf");
}

export async function exportProfitLossPdf(fromDate?: string, toDate?: string): Promise<void> {
  const params = new URLSearchParams();
  if (fromDate) params.set("fromDate", fromDate);
  if (toDate) params.set("toDate", toDate);
  await downloadExport(exportPath("/api/exports/reports/profit-loss.pdf", params), "laba_rugi", "pdf");
}

export async function exportBalanceSheetPdf(asOfDate?: string): Promise<void> {
  const params = new URLSearchParams();
  if (asOfDate) params.set("asOfDate", asOfDate);
  await downloadExport(exportPath("/api/exports/reports/balance-sheet.pdf", params), "neraca", "pdf");
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
  await downloadExport(exportPath("/api/exports/reports/general-ledger.pdf", params), "buku_besar", "pdf");
}
