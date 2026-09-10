import { apiRequest } from "./client";
import type {
  BalanceSheetReport,
  GeneralLedgerReport,
  ProfitLossReport,
  StockMovementReport,
} from "../../../worker/services/report-types";

export type {
  BalanceSheetReport,
  GeneralLedgerEntry,
  GeneralLedgerReport,
  ProfitLossReport,
  ReportAccountLine,
  StockMovementReport,
  StockMovementReportLine,
} from "../../../worker/services/report-types";

interface ProfitLossResponse {
  report: ProfitLossReport;
}

interface BalanceSheetResponse {
  report: BalanceSheetReport;
}

interface GeneralLedgerResponse {
  report: GeneralLedgerReport;
}

interface StockMovementResponse {
  report: StockMovementReport;
}

/** Fetch a report endpoint and unwrap its `report` payload. */
function getReport<TResponse extends { report: unknown }>(
  path: string,
): Promise<TResponse["report"]> {
  return apiRequest<TResponse>(path).then((data) => data.report);
}

export function getProfitLoss(fromDate: string, toDate: string): Promise<ProfitLossReport> {
  const params = new URLSearchParams({ fromDate, toDate });
  return getReport<ProfitLossResponse>(`/api/reports/profit-loss?${params}`);
}

export function getBalanceSheet(asOfDate: string): Promise<BalanceSheetReport> {
  const params = new URLSearchParams({ asOfDate });
  return getReport<BalanceSheetResponse>(`/api/reports/balance-sheet?${params}`);
}

export function getGeneralLedger(
  fromDate: string,
  toDate: string,
  accountId?: string,
): Promise<GeneralLedgerReport> {
  const params = new URLSearchParams({ fromDate, toDate });
  if (accountId) params.set("accountId", accountId);
  return getReport<GeneralLedgerResponse>(`/api/reports/general-ledger?${params}`);
}

export function getStockMovementReport(
  fromDate: string,
  toDate: string,
  productId?: string,
): Promise<StockMovementReport> {
  const params = new URLSearchParams({ fromDate, toDate });
  if (productId) params.set("productId", productId);
  return getReport<StockMovementResponse>(`/api/reports/stock-movements?${params}`);
}