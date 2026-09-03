import { queryAll } from "../db/client";
import { badRequest } from "../http/errors";

interface AccountTotalRow {
  id: string;
  code: string;
  name: string;
  account_class: string;
  debit: number;
  credit: number;
}

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