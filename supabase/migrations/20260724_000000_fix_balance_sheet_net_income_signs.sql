-- Migration: Fix Balance Sheet net income sign errors
-- Date: 2026-07-24
-- Bug: The formula used +balance for cogs/expense/other_expense, but these are
--      debit-normal accounts where positive balance = costs incurred.
--      Net income = Revenue + OtherIncome - COGS - Expense - OtherExpense
--      Since balance = debit - credit:
--        - Revenue (credit-normal): negative raw balance → -balance = positive
--        - COGS (debit-normal): positive raw balance → -balance = negative (subtracts)
--        - Expense (debit-normal): positive raw balance → -balance = negative (subtracts)
--        - OtherIncome (credit-normal): negative raw balance → -balance = positive
--        - OtherExpense (debit-normal): positive raw balance → -balance = negative (subtracts)
--      Simplified: v_net_income = -SUM(balance) for all P&L accounts

BEGIN;

CREATE OR REPLACE FUNCTION public.get_balance_sheet(
  p_organization_id UUID,
  p_as_of_date DATE
)
RETURNS TABLE(
  section TEXT,
  account_code INTEGER,
  account_name TEXT,
  amount NUMERIC
) AS $$
DECLARE
  v_net_income NUMERIC := 0;
BEGIN
  -- Permission checks
  IF NOT public.is_org_member(p_organization_id) THEN
    RAISE EXCEPTION 'Anda bukan anggota organisasi ini';
  END IF;

  IF NOT public.has_permission(p_organization_id, 'can_view_reports') THEN
    RAISE EXCEPTION 'Anda tidak memiliki izin untuk melihat laporan neraca';
  END IF;

  -- Temp table: pre-filter journal lines then aggregate per account.
  -- Avoids the LEFT JOIN bug where je conditions didn't match but
  -- jl rows still participated in SUM.
  DROP TABLE IF EXISTS _bs_account_balances;
  CREATE TEMPORARY TABLE _bs_account_balances AS
  SELECT
    a.id,
    a.code,
    a.name,
    a.account_type,
    COALESCE(SUM(fl.debit - fl.credit), 0) AS balance
  FROM public.accounts a
  LEFT JOIN (
    SELECT jl.account_id, jl.debit, jl.credit
    FROM public.journal_lines jl
    JOIN public.journal_entries je
      ON je.id = jl.journal_entry_id
     AND je.organization_id = jl.organization_id
    WHERE jl.organization_id = p_organization_id
      AND je.status = 'posted'
      AND je.entry_date <= p_as_of_date
  ) fl ON fl.account_id = a.id
  WHERE a.organization_id = p_organization_id
    AND a.is_active = true
  GROUP BY a.id, a.code, a.name, a.account_type;

  -- Calculate net income (Laba Tahun Berjalan) from P&L accounts
  -- Formula: v_net_income = -SUM(balance) for all P&L account types
  -- This works because:
  --   - Revenue (credit-normal): negative raw balance → negated = positive income
  --   - COGS/Expense/OtherExpense (debit-normal): positive raw balance → negated = costs subtracted
  --   - OtherIncome (credit-normal): negative raw balance → negated = positive income
  SELECT -COALESCE(SUM(balance), 0)
  INTO v_net_income
  FROM _bs_account_balances
  WHERE account_type IN ('revenue', 'cogs', 'expense', 'other_income', 'other_expense');

  -- Return the balance sheet rows
  RETURN QUERY
  -- Assets (debit-normal: balance = debits - credits)
  SELECT
    'asset'::TEXT AS section,
    ab.code::INTEGER AS account_code,
    ab.name::TEXT AS account_name,
    ab.balance::NUMERIC AS amount
  FROM _bs_account_balances ab
  WHERE ab.account_type = 'asset' AND ab.balance != 0

  UNION ALL

  -- Liabilities (credit-normal: flip sign)
  SELECT
    'liability'::TEXT,
    ab.code::INTEGER,
    ab.name::TEXT,
    (-ab.balance)::NUMERIC
  FROM _bs_account_balances ab
  WHERE ab.account_type = 'liability' AND ab.balance != 0

  UNION ALL

  -- Equity accounts except 3500 (synthetic Laba Tahun Berjalan)
  -- Account 3400 (Saldo Laba / Retained Earnings) IS included here
  SELECT
    'equity'::TEXT,
    ab.code::INTEGER,
    ab.name::TEXT,
    (-ab.balance)::NUMERIC
  FROM _bs_account_balances ab
  WHERE ab.account_type = 'equity'
    AND ab.code != 3500
    AND ab.balance != 0

  UNION ALL

  -- Synthetic "Laba Tahun Berjalan" (net income for the period)
  SELECT
    'equity'::TEXT,
    3500::INTEGER,
    'Laba Tahun Berjalan'::TEXT,
    v_net_income::NUMERIC
  WHERE v_net_income != 0

  ORDER BY section, account_code;

  DROP TABLE IF EXISTS _bs_account_balances;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.get_balance_sheet(UUID, DATE) TO authenticated;

COMMIT;
