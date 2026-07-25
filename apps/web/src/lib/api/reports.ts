import { apiRequest } from "./client";

export interface TrialBalanceItem {
  account_id: string;
  account_code: number;
  account_name: string;
  account_type: string;
  normal_balance: string;
  debit_total: number;
  credit_total: number;
  ending_debit: number;
  ending_credit: number;
}

export interface ProfitLossItem {
  section: string;
  account_code: number;
  account_name: string;
  amount: number;
}

export interface BalanceSheetItem {
  section: string;
  account_code: number;
  account_name: string;
  amount: number;
}

export interface LedgerEntry {
  account_id: string;
  account_code: number;
  account_name: string;
  entry_date: string;
  journal_entry_id: string;
  entry_number: string;
  transaction_id: string | null;
  transaction_number: string | null;
  description: string;
  party_name: string | null;
  debit: number;
  credit: number;
  running_balance: number;
}

interface TrialBalanceResponse {
  trialBalance: TrialBalanceItem[];
}

interface ProfitLossResponse {
  profitLoss: ProfitLossItem[];
}

interface BalanceSheetResponse {
  balanceSheet: BalanceSheetItem[];
}

export interface CashFlowItem {
  section: "operating" | "investing" | "financing";
  transactionType: string;
  label: string;
  inflow: number;
  outflow: number;
  net: number;
}

export interface CashFlowReport {
  rows: CashFlowItem[];
  totals: {
    operating: number;
    investing: number;
    financing: number;
    netCashFlow: number;
    openingCash: number;
    closingCash: number;
  };
  period: { fromDate: string; toDate: string };
}

interface CashFlowResponse {
  cashFlow: CashFlowReport;
}

interface GeneralLedgerResponse {
  generalLedger: LedgerEntry[];
}

export function getCashFlowReport(fromDate: string, toDate: string): Promise<CashFlowReport> {
  const params = new URLSearchParams({ fromDate, toDate });
  return apiRequest<CashFlowResponse>(`/api/reports/cash-flow?${params}`).then(
    (data) => data.cashFlow,
  );
}

export function getTrialBalance(asOfDate: string): Promise<TrialBalanceItem[]> {
  return apiRequest<TrialBalanceResponse>(
    `/api/reports/trial-balance?asOfDate=${encodeURIComponent(asOfDate)}`,
  ).then((data) => data.trialBalance);
}

export function getProfitLoss(
  fromDate: string,
  toDate: string,
): Promise<ProfitLossItem[]> {
  const params = new URLSearchParams({ fromDate, toDate });
  return apiRequest<ProfitLossResponse>(`/api/reports/profit-loss?${params}`).then(
    (data) => data.profitLoss,
  );
}

export function getBalanceSheet(asOfDate: string): Promise<BalanceSheetItem[]> {
  return apiRequest<BalanceSheetResponse>(
    `/api/reports/balance-sheet?asOfDate=${encodeURIComponent(asOfDate)}`,
  ).then((data) => data.balanceSheet);
}

export function getGeneralLedger(input: {
  accountId?: string;
  fromDate: string;
  toDate: string;
}): Promise<LedgerEntry[]> {
  const params = new URLSearchParams({
    fromDate: input.fromDate,
    toDate: input.toDate,
  });
  if (input.accountId) params.set("accountId", input.accountId);
  return apiRequest<GeneralLedgerResponse>(`/api/reports/general-ledger?${params}`).then(
    (data) => data.generalLedger,
  );
}
