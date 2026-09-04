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

/** Satu baris buku besar (general ledger): satu posisi journal line per akun. */
export interface GeneralLedgerEntry {
  account_id: string;
  /** Kode akun asli dari tabel accounts (mis. "1110"). */
  account_code: string;
  account_name: string;
  account_class: "asset" | "liability" | "equity" | "income" | "expense";
  entry_date: string;
  transaction_id: string;
  transaction_number: string;
  description: string;
  debit_idr: number;
  credit_idr: number;
  /** Saldo berjalan dalam arah normal akun (debit-normal vs credit-normal). */
  running_balance_idr: number;
}

export interface GeneralLedgerReport {
  fromDate: string;
  toDate: string;
  accountId: string | null;
  entries: GeneralLedgerEntry[];
  /** true bila jumlah baris dipotong batas internal (LIMIT). */
  truncated: boolean;
}
