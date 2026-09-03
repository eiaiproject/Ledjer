import { downloadExport, exportPath } from "@/lib/download";

export interface TransactionExportParams {
  fromDate?: string;
  toDate?: string;
  search?: string;
  transactionType?: string;
  status?: string;
}

export function downloadTransactionsCsv(params: TransactionExportParams = {}): Promise<void> {
  const searchParams = new URLSearchParams();
  if (params.fromDate) searchParams.set("fromDate", params.fromDate);
  if (params.toDate) searchParams.set("toDate", params.toDate);
  if (params.search) searchParams.set("search", params.search);
  if (params.transactionType) searchParams.set("transactionType", params.transactionType);
  if (params.status) searchParams.set("status", params.status);
  return downloadExport(exportPath("/api/exports/transactions.csv", searchParams), "transaksi", "csv");
}