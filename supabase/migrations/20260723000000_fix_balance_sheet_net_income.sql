-- Migration: Fix Balance Sheet — v_net_income never calculated + CTE scope fix
-- Date: 2026-07-23
-- Purpose:
--   1. The CTE-based get_balance_sheet (20260722) fixed the LEFT JOIN bug but
--      declared v_net_income without ever assigning it, so "Laba Tahun Berjalan"
--      (account 3500) never appeared.
--   2. CTEs can't be reused across multiple statements in PL/pgSQL — switched
--      to a temp table for account_balances.
--   3. Account 3400 (Saldo Laba) included in real equity rows.
--   4. Only 3500 excluded from real equity; synthetic 3500 added if non-zero.
--   5. SECURITY DEFINER SET search_path = public.
--   6. Grants execute to authenticated.

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
  SELECT COALESCE(
    SUM(CASE WHEN account_type = 'revenue' THEN -balance ELSE 0 END) +
    SUM(CASE WHEN account_type = 'cogs' THEN balance ELSE 0 END) +
    SUM(CASE WHEN account_type = 'expense' THEN balance ELSE 0 END) +
    SUM(CASE WHEN account_type = 'other_income' THEN -balance ELSE 0 END) +
    SUM(CASE WHEN account_type = 'other_expense' THEN balance ELSE 0 END),
    0
  ) INTO v_net_income
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
