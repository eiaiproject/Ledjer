import { queryFirst } from "../db/client";

export interface DashboardSummary {
  cash_balance: number;
  revenue_current_period: number;
  expense_current_period: number;
  net_profit_current_period: number;
  accounts_receivable: number;
  accounts_payable: number;
  period_from: string;
  period_to: string;
}

interface DashboardSummaryRow {
  cash_balance: number | null;
  revenue_current_period: number | null;
  expense_current_period: number | null;
  accounts_receivable: number | null;
  accounts_payable: number | null;
}

export async function getDashboardSummary(
  db: D1Database,
  organizationId: string,
  today = new Date(),
): Promise<DashboardSummary> {
  const { periodFrom, periodTo } = currentMonthPeriod(today);
  const row = await queryFirst<DashboardSummaryRow>(
    db,
    `WITH posted_lines AS (
       SELECT jl.account_id, jl.debit_minor, jl.credit_minor
       FROM journal_lines jl
       JOIN journal_entries je
         ON je.id = jl.journal_entry_id
        AND je.organization_id = jl.organization_id
       WHERE jl.organization_id = ?
         AND je.status = 'posted'
         AND je.entry_date <= ?
     ),
     posted_balances AS (
       SELECT
         account_id,
         SUM(debit_minor - credit_minor) AS debit_balance,
         SUM(credit_minor - debit_minor) AS credit_balance
       FROM posted_lines
       GROUP BY account_id
     ),
     period_lines AS (
       SELECT jl.account_id, jl.debit_minor, jl.credit_minor
       FROM journal_lines jl
       JOIN journal_entries je
         ON je.id = jl.journal_entry_id
        AND je.organization_id = jl.organization_id
       WHERE jl.organization_id = ?
         AND je.status = 'posted'
         AND je.entry_type != 'opening_balance'
         AND je.entry_date BETWEEN ? AND ?
     ),
     period_balances AS (
       SELECT
         account_id,
         SUM(debit_minor - credit_minor) AS debit_balance,
         SUM(credit_minor - debit_minor) AS credit_balance
       FROM period_lines
       GROUP BY account_id
     )
     SELECT
       COALESCE(SUM(CASE
         WHEN a.is_cash_account = 1 THEN pb.debit_balance
         ELSE 0
       END), 0) AS cash_balance,
       COALESCE(SUM(CASE
         WHEN a.account_type IN ('revenue', 'other_income')
           THEN pe.credit_balance
         ELSE 0
       END), 0) AS revenue_current_period,
       COALESCE(SUM(CASE
         WHEN a.account_type IN ('cogs', 'expense', 'other_expense')
           THEN pe.debit_balance
         ELSE 0
       END), 0) AS expense_current_period,
       COALESCE(SUM(CASE
         WHEN a.account_subtype = 'accounts_receivable'
           THEN pb.debit_balance
         ELSE 0
       END), 0) AS accounts_receivable,
       COALESCE(SUM(CASE
         WHEN a.account_subtype = 'accounts_payable'
           THEN pb.credit_balance
         ELSE 0
       END), 0) AS accounts_payable
     FROM accounts a
     LEFT JOIN posted_balances pb ON pb.account_id = a.id
     LEFT JOIN period_balances pe ON pe.account_id = a.id
     WHERE a.organization_id = ?`,
    [organizationId, periodTo, organizationId, periodFrom, periodTo, organizationId],
  );

  const revenue = row?.revenue_current_period ?? 0;
  const expense = row?.expense_current_period ?? 0;

  return {
    cash_balance: row?.cash_balance ?? 0,
    revenue_current_period: revenue,
    expense_current_period: expense,
    net_profit_current_period: revenue - expense,
    accounts_receivable: row?.accounts_receivable ?? 0,
    accounts_payable: row?.accounts_payable ?? 0,
    period_from: periodFrom,
    period_to: periodTo,
  };
}

export function currentMonthPeriod(date: Date): {
  periodFrom: string;
  periodTo: string;
} {
  // ponytail: Use local time instead of UTC to avoid timezone drift.
  const year = date.getFullYear();
  const month = date.getMonth();
  return {
    periodFrom: isoDate(new Date(year, month, 1)),
    periodTo: isoDate(date),
  };
}

function isoDate(date: Date): string {
  return orgDate(date);
}

/**
 * Format a Date as YYYY-MM-DD in the given timezone.
 * Defaults to 'Asia/Jakarta' (WIB) for server-side usage.
 */
function orgDate(date: Date, tz = 'Asia/Jakarta'): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(date);
}
