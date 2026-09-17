/**
 * Isomorphic accounting engine — public API.
 *
 * Modul ini jalan di kedua sisi (browser + worker) tanpa dependensi DB.
 * Semua fungsi pure — input data, output hasil.
 */

// Types
export type {
  Account,
  AccountClass,
  BalanceSheetReport,
  GeneralLedgerEntry,
  GeneralLedgerReport,
  JournalEntry,
  JournalLine,
  ProfitLossReport,
  Product,
  ReportAccountLine,
  ReportSection,
  StockMovement,
  Transaction,
  TransactionStatus,
  TransactionType,
} from "./types";

// Journal rules
export {
  ACCOUNT_KINDS,
  assertJournalBalanced,
  deriveCogsJournal,
  deriveJournal,
} from "./journal-rules";

// WAC / HPP
export {
  cogsFromMilliWac,
  computeMovementValue,
  computeNewWac,
  computeStockAfter,
  costTotalFromMilli,
  stockValueFromMilliWac,
} from "./wac";

// Reports
export {
  computeBalanceSheet,
  computeGeneralLedger,
  computeProfitLoss,
} from "./reports";
