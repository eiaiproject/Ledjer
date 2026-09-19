/**
 * Types for the isomorphic accounting engine.
 *
 * Tipe-tipe ini dipakai di kedua sisi: client (SQLite-WASM) dan server (D1).
 * Tidak ada dependensi runtime — murni TypeScript types.
 */

// ── Transaction ─────────────────────────────────────────────────

export type TransactionType =
  | "cash_in"
  | "cash_out"
  | "transfer"
  | "owner_deposit"
  | "owner_withdrawal"
  | "purchase";

export type TransactionStatus = "posted" | "voided";

export interface Transaction {
  id: string;
  user_id: string;
  op_id: string;
  transaction_type: TransactionType;
  transaction_date: string;
  description: string;
  party_id: string | null;
  product_id: string | null;
  cash_account_id: string;
  counter_account_id: string | null;
  amount_idr: number;
  status: TransactionStatus;
  void_of_id: string | null;
  rule_version: number;
  created_at: number;
  updated_at: number;
}

// ── Journal ─────────────────────────────────────────────────────

/**
 * Satu baris jurnal — diturunkan dari transaksi, bukan disimpan.
 * Ini yang dulu ada di tabel journal_lines, sekarang di-compute on-the-fly.
 */
export interface JournalLine {
  accountId: string;
  debitIdr: number;
  creditIdr: number;
}

/**
 * Jurnal lengkap untuk satu transaksi — diturunkan secara deterministik.
 */
export interface JournalEntry {
  transactionId: string;
  transactionDate: string;
  lines: JournalLine[];
}

// ── Account ─────────────────────────────────────────────────────

export type AccountClass = "asset" | "liability" | "equity" | "income" | "expense";

export interface Account {
  id: string;
  user_id: string;
  code: string;
  name: string;
  account_class: AccountClass;
  account_subtype: string | null;
  account_kind: string | null;
  is_system: number;
  is_active: number;
}

// ── Stock / WAC ─────────────────────────────────────────────────

export interface StockMovement {
  id: string;
  user_id: string;
  transaction_id: string;
  product_id: string;
  movement_type: "in" | "out" | "loss";
  quantity_milli: number;
  unit_cost_minor: number;
  total_value_minor: number;
  stock_after_milli: number;
  created_at: number;
}

export interface Product {
  id: string;
  user_id: string;
  code: string;
  name: string;
  unit: string;
  selling_price_idr: number;
  current_stock_milli: number;
  average_cost_minor: number;
  is_active: number;
}

// ── Reports ─────────────────────────────────────────────────────

export interface ReportAccountLine {
  code: string;
  name: string;
  amount: number;
}

export interface ReportSection {
  total: number;
  accounts: ReportAccountLine[];
}

export interface ProfitLossReport {
  fromDate: string;
  toDate: string;
  income: ReportSection;
  expense: ReportSection;
  netIncome: number;
}

export interface BalanceSheetReport {
  asOfDate: string;
  assets: ReportSection;
  liabilities: ReportSection;
  equity: ReportSection;
  netIncome: number;
}

export interface GeneralLedgerEntry {
  transactionDate: string;
  transactionType: TransactionType;
  transactionId: string;
  accountId: string;
  accountCode: string;
  accountName: string;
  debitIdr: number;
  creditIdr: number;
  balanceAfter: number;
}

export interface GeneralLedgerReport {
  fromDate: string;
  toDate: string;
  accountId: string;
  accountCode: string;
  accountName: string;
  entries: GeneralLedgerEntry[];
}
