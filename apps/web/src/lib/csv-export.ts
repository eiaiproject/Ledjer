import { downloadExport, exportPath } from "@/lib/download";
import type { TransactionStatus } from "@/lib/api/transactions";

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
  await downloadExport(exportPath("/api/exports/transactions.csv", params), "transaksi", "csv");
}

export async function exportAccountsCsv(): Promise<void> {
  await downloadExport("/api/exports/accounts.csv", "akun", "csv");
}

export async function exportProductsCsv(): Promise<void> {
  await downloadExport("/api/exports/products.csv", "produk", "csv");
}

export async function exportTrialBalanceCsv(asOfDate?: string): Promise<void> {
  const params = new URLSearchParams();
  if (asOfDate) params.set("asOfDate", asOfDate);
  await downloadExport(exportPath("/api/exports/reports/trial-balance.csv", params), "neraca_saldo", "csv");
}

export async function exportProfitLossCsv(fromDate?: string, toDate?: string): Promise<void> {
  const params = new URLSearchParams();
  if (fromDate) params.set("fromDate", fromDate);
  if (toDate) params.set("toDate", toDate);
  await downloadExport(exportPath("/api/exports/reports/profit-loss.csv", params), "laba_rugi", "csv");
}

export async function exportBalanceSheetCsv(asOfDate?: string): Promise<void> {
  const params = new URLSearchParams();
  if (asOfDate) params.set("asOfDate", asOfDate);
  await downloadExport(exportPath("/api/exports/reports/balance-sheet.csv", params), "neraca", "csv");
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
  await downloadExport(exportPath("/api/exports/reports/general-ledger.csv", params), "buku_besar", "csv");
}
