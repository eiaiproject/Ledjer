import { queryAll, queryFirst } from "../db/client";
import { normalizeDate } from "../http/date";
import { badRequest } from "../http/errors";

const NET_INCOME_ACCOUNT_CODE = 3500;

export interface TrialBalanceRow {
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

export interface ProfitLossRow {
  section: "revenue" | "cogs" | "expense" | "other_income" | "other_expense";
  account_code: number;
  account_name: string;
  amount: number;
}

export interface BalanceSheetRow {
  section: "asset" | "liability" | "equity";
  account_code: number;
  account_name: string;
  amount: number;
}

export interface GeneralLedgerRow {
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

export async function getTrialBalance(
  db: D1Database,
  organizationId: string,
  asOfDate: string,
): Promise<TrialBalanceRow[]> {
  const date = normalizeDate(asOfDate, "as_of_date_invalid");
  await validateReportDate(db, organizationId, date);
  return queryAll<TrialBalanceRow>(
    db,
    `WITH filtered_lines AS (
       SELECT jl.account_id, jl.debit_minor, jl.credit_minor
       FROM journal_lines jl
       JOIN journal_entries je
         ON je.id = jl.journal_entry_id
        AND je.organization_id = jl.organization_id
       WHERE jl.organization_id = ?
         AND je.status = 'posted'
         AND je.entry_date <= ?
     ),
     account_activity AS (
       SELECT
         a.id AS account_id,
         CAST(a.code AS INTEGER) AS account_code,
         a.name AS account_name,
         a.account_type AS account_type,
         a.normal_balance AS normal_balance,
         COALESCE(SUM(fl.debit_minor), 0) AS debit_total,
         COALESCE(SUM(fl.credit_minor), 0) AS credit_total,
         CASE
           WHEN a.normal_balance = 'debit'
             THEN COALESCE(SUM(fl.debit_minor - fl.credit_minor), 0)
           ELSE COALESCE(SUM(fl.credit_minor - fl.debit_minor), 0)
         END AS normal_amount
       FROM accounts a
       LEFT JOIN filtered_lines fl ON fl.account_id = a.id
       WHERE a.organization_id = ?
       GROUP BY a.id, a.code, a.name, a.account_type, a.normal_balance
     )
     SELECT
       account_id,
       account_code,
       account_name,
       account_type,
       normal_balance,
       debit_total,
       credit_total,
       CASE
         WHEN normal_balance = 'debit' AND normal_amount >= 0 THEN normal_amount
         WHEN normal_balance = 'credit' AND normal_amount < 0 THEN ABS(normal_amount)
         ELSE 0
       END AS ending_debit,
       CASE
         WHEN normal_balance = 'credit' AND normal_amount >= 0 THEN normal_amount
         WHEN normal_balance = 'debit' AND normal_amount < 0 THEN ABS(normal_amount)
         ELSE 0
       END AS ending_credit
     FROM account_activity
     WHERE debit_total != 0 OR credit_total != 0
     ORDER BY account_code`,
    [organizationId, date, organizationId],
  );
}

export async function getProfitLoss(
  db: D1Database,
  organizationId: string,
  fromDate: string,
  toDate: string,
): Promise<ProfitLossRow[]> {
  const from = normalizeDate(fromDate, "from_date_invalid");
  const to = normalizeDate(toDate, "to_date_invalid");
  assertDateRange(from, to);

  return queryAll<ProfitLossRow>(
    db,
    `WITH filtered_lines AS (
       SELECT jl.account_id, jl.debit_minor, jl.credit_minor
       FROM journal_lines jl
       JOIN journal_entries je
         ON je.id = jl.journal_entry_id
        AND je.organization_id = jl.organization_id
       WHERE jl.organization_id = ?
         AND je.status = 'posted'
         AND je.entry_type != 'opening_balance'
         AND je.entry_date BETWEEN ? AND ?
     )
     SELECT
       CASE a.account_type
         WHEN 'revenue' THEN 'revenue'
         WHEN 'cogs' THEN 'cogs'
         WHEN 'expense' THEN 'expense'
         WHEN 'other_income' THEN 'other_income'
         ELSE 'other_expense'
       END AS section,
       CAST(a.code AS INTEGER) AS account_code,
       a.name AS account_name,
       CASE
         WHEN a.account_type IN ('revenue', 'other_income')
           THEN COALESCE(SUM(fl.credit_minor - fl.debit_minor), 0)
         ELSE COALESCE(SUM(fl.debit_minor - fl.credit_minor), 0)
       END AS amount
     FROM accounts a
     LEFT JOIN filtered_lines fl ON fl.account_id = a.id
     WHERE a.organization_id = ?
       AND a.account_type IN ('revenue', 'cogs', 'expense', 'other_income', 'other_expense')
     GROUP BY a.id, a.code, a.name, a.account_type
     ORDER BY
       CASE a.account_type
         WHEN 'revenue' THEN 1
         WHEN 'cogs' THEN 2
         WHEN 'expense' THEN 3
         WHEN 'other_income' THEN 4
         ELSE 5
       END,
       CAST(a.code AS INTEGER)`,
    [organizationId, from, to, organizationId],
  );
}

export async function getBalanceSheet(
  db: D1Database,
  organizationId: string,
  asOfDate: string,
): Promise<BalanceSheetRow[]> {
  const date = normalizeDate(asOfDate, "as_of_date_invalid");
  await validateReportDate(db, organizationId, date);
  return queryAll<BalanceSheetRow>(
    db,
    `WITH posted_lines AS (
       SELECT jl.account_id, jl.debit_minor, jl.credit_minor, jl.party_id
       FROM journal_lines jl
       JOIN journal_entries je
         ON je.id = jl.journal_entry_id
        AND je.organization_id = jl.organization_id
       WHERE jl.organization_id = ?
         AND je.status = 'posted'
         AND je.entry_date <= ?
     ),
     account_balances AS (
       SELECT
         a.id,
         CAST(a.code AS INTEGER) AS code,
         a.name,
         a.account_type,
         a.is_active,
         COALESCE(SUM(pl.debit_minor - pl.credit_minor), 0) AS balance
       FROM accounts a
       LEFT JOIN posted_lines pl ON pl.account_id = a.id
       WHERE a.organization_id = ?
         AND (
           a.is_active = 1
           OR EXISTS (SELECT 1 FROM posted_lines pl2 WHERE pl2.account_id = a.id)
         )
       GROUP BY a.id, a.code, a.name, a.account_type, a.is_active
     ),
     -- ponytail: Per-party AR/AP netting. Split negative asset balances into
     -- liability and positive liability balances into asset.
     party_net AS (
       SELECT
         a.id, CAST(a.code AS INTEGER) AS code, a.name, a.account_type,
         pl.party_id,
         COALESCE(SUM(pl.debit_minor - pl.credit_minor), 0) AS party_balance
       FROM accounts a
       LEFT JOIN posted_lines pl ON pl.account_id = a.id
       WHERE a.organization_id = ?
         AND a.account_type IN ('asset', 'liability')
         AND pl.party_id IS NOT NULL
       GROUP BY a.id, a.code, a.name, a.account_type, pl.party_id
     ),
     reclassified AS (
       SELECT
         id, code, name, account_type,
         CASE
           WHEN account_type = 'asset' AND party_balance >= 0 THEN 'asset'
           WHEN account_type = 'asset' AND party_balance < 0 THEN 'liability'
           WHEN account_type = 'liability' AND party_balance <= 0 THEN 'liability'
           WHEN account_type = 'liability' AND party_balance > 0 THEN 'asset'
         END AS section,
         ABS(party_balance) AS amount
       FROM party_net
       WHERE party_balance != 0
     ),
     net_income AS (
       SELECT -COALESCE(SUM(balance), 0) AS net
       FROM account_balances
       WHERE account_type IN ('revenue', 'cogs', 'expense', 'other_income', 'other_expense')
     )
     SELECT
       'asset' AS section,
       code AS account_code,
       name AS account_name,
       balance AS amount
     FROM account_balances
     WHERE account_type = 'asset' AND balance != 0
       AND NOT EXISTS (SELECT 1 FROM party_net pn WHERE pn.id = account_balances.id)

     UNION ALL

     SELECT
       'liability',
       code,
       name,
       -balance
     FROM account_balances
     WHERE account_type = 'liability' AND balance != 0
       AND NOT EXISTS (SELECT 1 FROM party_net pn WHERE pn.id = account_balances.id)

     UNION ALL

     -- Per-party reclassified amounts
     SELECT section, code, name, SUM(amount)
     FROM reclassified
     GROUP BY section, code, name

     UNION ALL

     SELECT
       'equity',
       code,
       name,
       -balance
     FROM account_balances
     WHERE account_type = 'equity'
       AND code != ${NET_INCOME_ACCOUNT_CODE}
       AND balance != 0

     UNION ALL

     SELECT
       'equity',
       ${NET_INCOME_ACCOUNT_CODE},
       'Laba Tahun Berjalan',
       net
     FROM net_income
     WHERE net != 0

     ORDER BY section, account_code`,
    [organizationId, date, organizationId, organizationId],
  );
}

export async function getGeneralLedger(
  db: D1Database,
  organizationId: string,
  input: {
    accountId?: string;
    fromDate: string;
    toDate: string;
    limit?: number;
    offset?: number;
  },
): Promise<GeneralLedgerRow[]> {
  const from = normalizeDate(input.fromDate, "from_date_invalid");
  const to = normalizeDate(input.toDate, "to_date_invalid");
  assertDateRange(from, to);

  const accountFilter = input.accountId ? "AND jl.account_id = ?" : "";
  return queryAll<GeneralLedgerRow>(
    db,
    `WITH ledger_base AS (
       SELECT
         jl.organization_id,
         jl.account_id,
         CAST(a.code AS INTEGER) AS account_code,
         a.name AS account_name,
         a.normal_balance,
         je.entry_date,
         je.created_at AS entry_created_at,
         je.id AS journal_entry_id,
         je.entry_number,
         t.id AS transaction_id,
         t.transaction_number,
         jl.description,
         COALESCE(line_party.name, txn_party.name) AS party_name,
         jl.debit_minor AS debit,
         jl.credit_minor AS credit,
         jl.line_order,
         CASE
           WHEN a.normal_balance = 'debit'
             THEN jl.debit_minor - jl.credit_minor
           ELSE jl.credit_minor - jl.debit_minor
         END AS signed_amount
       FROM journal_lines jl
       JOIN accounts a
         ON a.id = jl.account_id
        AND a.organization_id = jl.organization_id
       JOIN journal_entries je
         ON je.id = jl.journal_entry_id
        AND je.organization_id = jl.organization_id
       LEFT JOIN transactions t
         ON t.id = je.transaction_id
        AND t.organization_id = jl.organization_id
       LEFT JOIN parties line_party
         ON line_party.id = jl.party_id
        AND line_party.organization_id = jl.organization_id
       LEFT JOIN parties txn_party
         ON txn_party.id = t.party_id
        AND txn_party.organization_id = jl.organization_id
       WHERE jl.organization_id = ?
         AND je.status = 'posted'
         AND je.entry_date <= ?
         ${accountFilter}
     ),
     ledger_running AS (
       SELECT
         *,
         SUM(signed_amount) OVER (
           PARTITION BY organization_id, account_id
           ORDER BY entry_date, entry_created_at, line_order, journal_entry_id
           ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
         ) AS running_balance
       FROM ledger_base
     )
     SELECT
       account_id,
       account_code,
       account_name,
       entry_date,
       journal_entry_id,
       entry_number,
       transaction_id,
       transaction_number,
       description,
       party_name,
       debit,
       credit,
       running_balance
     FROM ledger_running
     WHERE entry_date >= ?
     ORDER BY account_code, entry_date, entry_created_at, line_order, journal_entry_id
     LIMIT ? OFFSET ?`,
    input.accountId
      ? [organizationId, to, input.accountId, from, input.limit ?? 5000, input.offset ?? 0]
      : [organizationId, to, from, input.limit ?? 5000, input.offset ?? 0],
  );
}

export function assertTrialBalanceBalanced(rows: readonly TrialBalanceRow[]): boolean {
  const debit = rows.reduce((total, row) => total + row.ending_debit, 0);
  const credit = rows.reduce((total, row) => total + row.ending_credit, 0);
  return debit === credit;
}


async function validateReportDate(db: D1Database, organizationId: string, date: string): Promise<void> {
  // Check date is not too far in the future (catch obvious typos like year 2099)
  const oneYearFromNow = new Date();
  oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);
  const maxDate = oneYearFromNow.toISOString().slice(0, 10);
  if (date > maxDate) {
    throw badRequest("date_future", "Date cannot be more than 1 year in the future");
  }

  // Check date is not before books_start_date
  const org = await queryFirst<{ books_start_date: string }>(
    db,
    "SELECT books_start_date FROM organizations WHERE id = ?",
    [organizationId],
  );
  if (org && org.books_start_date && date < org.books_start_date) {
    throw badRequest("date_before_books_start", "Date cannot be before the organization's books start date");
  }
}

function assertDateRange(fromDate: string, toDate: string): void {
  if (fromDate > toDate) {
    throw badRequest("date_range_invalid", "Start date must not be after end date");
  }
}
