/**
 * Report DTOs shared between the Worker services and the client API layer.
 * Kept in one leaf module (no imports) so both sides reference a single
 * definition instead of mirroring the interfaces.
 */

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
