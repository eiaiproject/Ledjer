import { apiRequest } from "./client";

export interface ReportAccountLine {
  code: string;
  name: string;
  amount: number;
}

export interface ProfitLossReport {
  fromDate: string;
  toDate: string;
  income: { total: number; accounts: ReportAccountLine[] };
  expense: { total: number; accounts: ReportAccountLine[] };
  netIncome: number;
}

export interface BalanceSheetReport {
  asOfDate: string;
  assets: ReportAccountLine[];
  totalAssets: number;
  liabilities: ReportAccountLine[];
  totalLiabilities: number;
  equity: ReportAccountLine[];
  totalEquity: number;
  balanced: boolean;
}

interface ProfitLossResponse {
  report: ProfitLossReport;
}

interface BalanceSheetResponse {
  report: BalanceSheetReport;
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