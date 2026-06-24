-- Migration: Fix Balance Sheet to include Saldo Laba (Account 3400) (T2.10)
-- Date: 2026-07-19
-- Purpose:
--   The Balance Sheet excludes account 3400 (Saldo Laba / Retained Earnings)
--   from the equity section. If a user posts opening balances or closing entries
--   to 3400, the Balance Sheet will be out of balance.
--   Fix: Only exclude 3500 (Laba Tahun Berjalan) which is represented by the
--   synthetic v_net_income row. Account 3400 should be included in equity.
--
-- Changes:
--   - CREATE OR REPLACE get_balance_sheet with correct account filtering
--
-- Constraints: Additive only (C1).

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
  v_net_income NUMERIC;
BEGIN
  -- Calculate net income for the period up to as_of_date
  SELECT COALESCE(
    SUM(CASE WHEN a.account_type = 'revenue' THEN jl.credit - jl.debit ELSE 0 END) -
    SUM(CASE WHEN a.account_type = 'cogs' THEN jl.debit - jl.credit ELSE 0 END) -
    SUM(CASE WHEN a.account_type = 'expense' THEN jl.debit - jl.credit ELSE 0 END) +
    SUM(CASE WHEN a.account_type = 'other_income' THEN jl.credit - jl.debit ELSE 0 END) -
    SUM(CASE WHEN a.account_type = 'other_expense' THEN jl.debit - jl.credit ELSE 0 END),
    0
  ) INTO v_net_income
  FROM journal_lines jl
  JOIN accounts a ON a.id = jl.account_id
  JOIN journal_entries je ON je.id = jl.journal_entry_id
  WHERE jl.organization_id = p_organization_id
    AND je.status = 'posted'
    AND je.entry_date <= p_as_of_date;

  RETURN QUERY
  -- Assets
  SELECT
    'asset' AS section,
    a.code AS account_code,
    a.name AS account_name,
    COALESCE(SUM(jl.debit - jl.credit), 0) AS amount
  FROM accounts a
  LEFT JOIN journal_lines jl ON jl.account_id = a.id
  LEFT JOIN journal_entries je ON je.id = jl.journal_entry_id
    AND je.status = 'posted'
    AND je.entry_date <= p_as_of_date
  WHERE a.organization_id = p_organization_id
    AND a.account_type = 'asset'
    AND a.is_active = true
  GROUP BY a.id, a.code, a.name
  HAVING COALESCE(SUM(jl.debit - jl.credit), 0) != 0

  UNION ALL

  -- Liabilities
  SELECT
    'liability' AS section,
    a.code AS account_code,
    a.name AS account_name,
    COALESCE(SUM(jl.credit - jl.debit), 0) AS amount
  FROM accounts a
  LEFT JOIN journal_lines jl ON jl.account_id = a.id
  LEFT JOIN journal_entries je ON je.id = jl.journal_entry_id
    AND je.status = 'posted'
    AND je.entry_date <= p_as_of_date
  WHERE a.organization_id = p_organization_id
    AND a.account_type = 'liability'
    AND a.is_active = true
  GROUP BY a.id, a.code, a.name
  HAVING COALESCE(SUM(jl.credit - jl.debit), 0) != 0

  UNION ALL

  -- Equity (excluding ONLY 3500 — Laba Tahun Berjalan is synthetic)
  -- Account 3400 (Saldo Laba) is now INCLUDED
  SELECT
    'equity' AS section,
    a.code AS account_code,
    a.name AS account_name,
    COALESCE(SUM(jl.credit - jl.debit), 0) AS amount
  FROM accounts a
  LEFT JOIN journal_lines jl ON jl.account_id = a.id
  LEFT JOIN journal_entries je ON je.id = jl.journal_entry_id
    AND je.status = 'posted'
    AND je.entry_date <= p_as_of_date
  WHERE a.organization_id = p_organization_id
    AND a.account_type = 'equity'
    AND a.is_active = true
    AND a.code != 3500  -- Only exclude Laba Tahun Berjalan (synthetic row below)
  GROUP BY a.id, a.code, a.name
  HAVING COALESCE(SUM(jl.credit - jl.debit), 0) != 0

  UNION ALL

  -- Net Income (Laba Tahun Berjalan) — synthetic row
  SELECT
    'equity' AS section,
    3500 AS account_code,
    'Laba Tahun Berjalan' AS account_name,
    v_net_income AS amount
  WHERE v_net_income != 0  -- Only show if non-zero

  ORDER BY section, account_code;
END;
$$ LANGUAGE plpgsql STABLE;

GRANT EXECUTE ON FUNCTION public.get_balance_sheet(UUID, DATE) TO authenticated;

COMMIT;
