-- P0-4: Balance Sheet includes inactive accounts with non-zero posted balance
-- Ensures Assets = Liabilities + Equity even when accounts are deactivated
-- (e.g. after migration 20260720_000000 removed E-Wallet/QRIS account 1130)


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
BEGIN
  IF NOT public.is_org_member(p_organization_id) THEN
    RAISE EXCEPTION 'Anda bukan anggota organisasi ini';
  END IF;

  IF NOT public.has_permission(p_organization_id, 'can_view_reports') THEN
    RAISE EXCEPTION 'Anda tidak memiliki izin untuk melihat laporan neraca';
  END IF;

  RETURN QUERY
  WITH posted_lines AS (
    SELECT
      jl.account_id,
      jl.debit,
      jl.credit
    FROM public.journal_lines jl
    JOIN public.journal_entries je
      ON je.id = jl.journal_entry_id
     AND je.organization_id = jl.organization_id
    WHERE jl.organization_id = p_organization_id
      AND je.status = 'posted'
      AND je.entry_date <= p_as_of_date
  ),
  account_balances AS (
    SELECT
      a.id,
      a.code,
      a.name,
      a.account_type,
      a.is_active,
      COALESCE(SUM(pl.debit - pl.credit), 0) AS balance
    FROM public.accounts a
    LEFT JOIN posted_lines pl ON pl.account_id = a.id
    WHERE a.organization_id = p_organization_id
      -- P0-4 FIX: include active accounts OR accounts with non-zero balance
      AND (a.is_active = true OR EXISTS (
        SELECT 1 FROM posted_lines pl2 WHERE pl2.account_id = a.id
      ))
    GROUP BY a.id, a.code, a.name, a.account_type, a.is_active
  ),
  net_income AS (
    SELECT -COALESCE(SUM(balance), 0) AS net
    FROM account_balances
    WHERE account_type IN ('revenue', 'cogs', 'expense', 'other_income', 'other_expense')
  )
  SELECT
    'asset'::TEXT      AS section,
    ab.code::INTEGER   AS account_code,
    ab.name::TEXT      AS account_name,
    ab.balance::NUMERIC AS amount
  FROM account_balances ab
  WHERE ab.account_type = 'asset' AND ab.balance != 0

  UNION ALL

  SELECT
    'liability'::TEXT,
    ab.code::INTEGER,
    ab.name::TEXT,
    (-ab.balance)::NUMERIC
  FROM account_balances ab
  WHERE ab.account_type = 'liability' AND ab.balance != 0

  UNION ALL

  SELECT
    'equity'::TEXT,
    ab.code::INTEGER,
    ab.name::TEXT,
    (-ab.balance)::NUMERIC
  FROM account_balances ab
  WHERE ab.account_type = 'equity'
    AND ab.code != 3500
    AND ab.balance != 0

  UNION ALL

  SELECT
    'equity'::TEXT,
    3500::INTEGER,
    'Laba Tahun Berjalan'::TEXT,
    ni.net::NUMERIC
  FROM net_income ni
  WHERE ni.net != 0

  ORDER BY section, account_code;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.get_balance_sheet(UUID, DATE) TO authenticated;

NOTIFY pgrst, 'reload schema';
