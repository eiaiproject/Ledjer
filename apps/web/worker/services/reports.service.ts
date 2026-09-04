import { queryAll } from "../db/client";
import { badRequest } from "../http/errors";
import type {
  BalanceSheetReport,
  GeneralLedgerEntry,
  GeneralLedgerReport,
  ProfitLossReport,
  ReportAccountLine,
} from "./report-types";

export type {
  BalanceSheetReport,
  GeneralLedgerEntry,
  GeneralLedgerReport,
  ProfitLossReport,
  ReportAccountLine,
} from "./report-types";

/** Batas baris buku besar per request - mencegah Worker OOM pada org besar. */
export const MAX_GL_ROWS = 5000;

interface AccountTotalRow {
  id: string;
  code: string;
  name: string;
  account_class: string;
  debit: number;
  credit: number;
}

function assertDateRange(fromDate: string, toDate: string): void {
  if (!fromDate || !toDate) {
    throw badRequest("invalid_date_range", "Periode tanggal harus diisi.");
  }
  if (fromDate > toDate) {
    throw badRequest("invalid_date_range", "Tanggal awal tidak boleh melewati tanggal akhir.");
  }
}

/** Account totals from journal lines of posted transactions within a date range. */
async function accountTotals(
  db: D1Database,
  organizationId: string,
  fromDate: string | null,
  toDate: string,
): Promise<AccountTotalRow[]> {
  const conditions = ["jl.organization_id = ?", "t.status = 'posted'", "t.transaction_date <= ?"];
  const values: (string | number)[] = [organizationId, toDate];
  if (fromDate) {
    conditions.push("t.transaction_date >= ?");
    values.push(fromDate);
  }

  return queryAll<AccountTotalRow>(
    db,
    `SELECT a.id, a.code, a.name, a.account_class,
            SUM(jl.debit_idr) AS debit, SUM(jl.credit_idr) AS credit
     FROM journal_lines jl
     JOIN journal_entries je ON je.id = jl.journal_entry_id
     JOIN transactions t ON t.id = je.transaction_id
     JOIN accounts a ON a.id = jl.account_id
     WHERE ${conditions.join(" AND ")}
     GROUP BY a.id
     ORDER BY a.code ASC`,
    values,
  );
}

export async function getProfitLoss(
  db: D1Database,
  organizationId: string,
  fromDate: string,
  toDate: string,
): Promise<ProfitLossReport> {
  assertDateRange(fromDate, toDate);
  const rows = await accountTotals(db, organizationId, fromDate, toDate);

  const incomeAccounts: ReportAccountLine[] = [];
  const expenseAccounts: ReportAccountLine[] = [];
  let income = 0;
  let expense = 0;

  for (const row of rows) {
    const net = (row.credit ?? 0) - (row.debit ?? 0);
    if (row.account_class === "income") {
      incomeAccounts.push({ code: row.code, name: row.name, amount: net });
      income += net;
    } else if (row.account_class === "expense") {
      expenseAccounts.push({ code: row.code, name: row.name, amount: -net });
      expense += -net;
    }
  }

  return {
    fromDate,
    toDate,
    income: { total: income, accounts: incomeAccounts },
    expense: { total: expense, accounts: expenseAccounts },
    netIncome: income - expense,
  };
}

export async function getBalanceSheet(
  db: D1Database,
  organizationId: string,
  asOfDate: string,
): Promise<BalanceSheetReport> {
  if (!asOfDate) throw badRequest("invalid_date", "Tanggal laporan harus diisi.");
  const rows = await accountTotals(db, organizationId, null, asOfDate);

  const assets: ReportAccountLine[] = [];
  const liabilities: ReportAccountLine[] = [];
  const equity: ReportAccountLine[] = [];
  let income = 0;
  let expense = 0;

  for (const row of rows) {
    const debit = row.debit ?? 0;
    const credit = row.credit ?? 0;
    switch (row.account_class) {
      case "asset":
        assets.push({ code: row.code, name: row.name, amount: debit - credit });
        break;
      case "liability":
        liabilities.push({ code: row.code, name: row.name, amount: credit - debit });
        break;
      case "equity":
        equity.push({ code: row.code, name: row.name, amount: credit - debit });
        break;
      case "income":
        income += credit - debit;
        break;
      case "expense":
        expense += debit - credit;
        break;
    }
  }

  const totalAssets = assets.reduce((s, a) => s + a.amount, 0);
  const totalLiabilities = liabilities.reduce((s, a) => s + a.amount, 0);
  const labaBerjalan = income - expense;
  if (labaBerjalan !== 0) {
    equity.push({ code: "NET", name: "Laba Berjalan", amount: labaBerjalan });
  }
  const totalEquity = equity.reduce((s, a) => s + a.amount, 0);

  const balanced = totalAssets === totalLiabilities + totalEquity;
  if (!balanced) {
    // PRD REP-02: log ke error monitoring bila laporan tidak seimbang.
    // Log only computed magnitudes - request-derived identifiers are
    // intentionally omitted (no user-controlled data in logs, tssecurity:S5145).
    console.error("balance_sheet_imbalance", JSON.stringify({ totalAssets, totalLiabilities, totalEquity }));
  }

  return {
    asOfDate,
    assets,
    totalAssets,
    liabilities,
    totalLiabilities,
    equity,
    totalEquity,
    balanced,
  };
}

interface GeneralLedgerRow {
  account_id: string;
  account_code: string;
  account_name: string;
  account_class: GeneralLedgerEntry["account_class"];
  entry_date: string;
  transaction_id: string;
  transaction_number: string;
  description: string;
  debit: number;
  credit: number;
  running_balance_idr: number;
}

export interface GetGeneralLedgerInput {
  /** Batasi ke satu akun (opsional); tanpa ini semua akun ditampilkan. */
  accountId?: string;
  fromDate: string;
  toDate: string;
  limit?: number;
  offset?: number;
}

/**
 * Buku besar (general ledger): journal lines per akun dari transaksi posted,
 * diurutkan kronologis dengan saldo berjalan dalam arah normal akun.
 *
 * Window running balance dihitung atas SEMUA baris sampai `toDate` (jadi baris
 * pertama yang tampil sudah membawa saldo awal akun), lalu hasilnya dipotong
 * dari `fromDate` ke atas - konsisten dengan pola laporan MVP.
 */
export async function getGeneralLedger(
  db: D1Database,
  organizationId: string,
  input: GetGeneralLedgerInput,
): Promise<GeneralLedgerReport> {
  assertDateRange(input.fromDate, input.toDate);
  const accountFilter = input.accountId ? "AND jl.account_id = ?" : "";
  const limit = Math.min(Math.max(input.limit ?? MAX_GL_ROWS, 1), MAX_GL_ROWS);
  const offset = Math.max(input.offset ?? 0, 0);

  const values: (string | number)[] = [organizationId, input.toDate];
  if (input.accountId) values.push(input.accountId);
  values.push(input.fromDate, limit, offset);

  const rows = await queryAll<GeneralLedgerRow>(
    db,
    `WITH ledger_base AS (
       SELECT
         jl.organization_id,
         jl.account_id,
         a.code AS account_code,
         a.name AS account_name,
         a.account_class,
         t.transaction_date AS entry_date,
         t.created_at AS entry_created_at,
         t.id AS transaction_id,
         t.transaction_number,
         t.description,
         jl.debit_idr AS debit,
         jl.credit_idr AS credit,
         CASE
           WHEN a.account_class IN ('asset', 'expense')
             THEN jl.debit_idr - jl.credit_idr
           ELSE jl.credit_idr - jl.debit_idr
         END AS signed_amount
       FROM journal_lines jl
       JOIN journal_entries je ON je.id = jl.journal_entry_id AND je.organization_id = jl.organization_id
       JOIN transactions t ON t.id = je.transaction_id AND t.organization_id = jl.organization_id
       JOIN accounts a ON a.id = jl.account_id AND a.organization_id = jl.organization_id
       WHERE jl.organization_id = ?
         AND t.status = 'posted'
         AND t.transaction_date <= ?
         ${accountFilter}
     ),
     ledger_running AS (
       SELECT *,
         SUM(signed_amount) OVER (
           PARTITION BY account_id
           ORDER BY entry_date, entry_created_at, transaction_id
           ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
         ) AS running_balance_idr
       FROM ledger_base
     )
     SELECT
       account_id,
       account_code,
       account_name,
       account_class,
       entry_date,
       transaction_id,
       transaction_number,
       description,
       debit,
       credit,
       running_balance_idr
     FROM ledger_running
     WHERE entry_date >= ?
     ORDER BY CAST(account_code AS INTEGER) ASC, entry_date ASC, entry_created_at ASC, transaction_id ASC
     LIMIT ? OFFSET ?`,
    values,
  );

  return {
    fromDate: input.fromDate,
    toDate: input.toDate,
    accountId: input.accountId ?? null,
    entries: rows.map((row) => ({
      account_id: row.account_id,
      account_code: row.account_code,
      account_name: row.account_name,
      account_class: row.account_class,
      entry_date: row.entry_date,
      transaction_id: row.transaction_id,
      transaction_number: row.transaction_number,
      description: row.description,
      debit_idr: row.debit,
      credit_idr: row.credit,
      running_balance_idr: row.running_balance_idr,
    })),
    truncated: rows.length >= limit,
  };
}