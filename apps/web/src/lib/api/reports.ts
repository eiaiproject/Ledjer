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

export function getProfitLoss(fromDate: string, toDate: string): Promise<ProfitLossReport> {
  const params = new URLSearchParams({ fromDate, toDate });
  return apiRequest<ProfitLossResponse>(`/api/reports/profit-loss?${params}`).then(
    (data) => data.report,
  );
}

export function getBalanceSheet(asOfDate: string): Promise<BalanceSheetReport> {
  const params = new URLSearchParams({ asOfDate });
  return apiRequest<BalanceSheetResponse>(`/api/reports/balance-sheet?${params}`).then(
    (data) => data.report,
  );
}