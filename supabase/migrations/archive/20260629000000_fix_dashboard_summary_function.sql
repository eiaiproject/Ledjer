-- Fix: Hapus duplikasi fungsi get_dashboard_summary
-- Terdapat 2 versi dari migration berbeda (20260623 dan 20260626)
-- Hapus semua versi lama, lalu buat versi final yang benar

-- Drop semua versi get_dashboard_summary
DROP FUNCTION IF EXISTS public.get_dashboard_summary(UUID);
DROP FUNCTION IF EXISTS public.get_dashboard_summary(UUID, DATE, DATE);

-- Buat versi final dengan parameter optional
CREATE OR REPLACE FUNCTION public.get_dashboard_summary(
  p_organization_id UUID,
  p_from_date DATE DEFAULT NULL,
  p_to_date DATE DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_cash_balance NUMERIC;
  v_receivables NUMERIC;
  v_payables NUMERIC;
  v_revenue NUMERIC;
  v_expenses NUMERIC;
  v_net_income NUMERIC;
BEGIN
  -- Require report permission
  IF NOT public.has_permission(p_organization_id, 'can_view_reports') THEN
    RAISE EXCEPTION 'You do not have permission to view reports';
  END IF;

  -- Calculate cash balance (asset accounts with 'Kas' or 'Bank' in name)
  SELECT COALESCE(SUM(jl.debit - jl.credit), 0)
  INTO v_cash_balance
  FROM public.journal_lines jl
  JOIN public.accounts a ON a.id = jl.account_id
  JOIN public.journal_entries je ON je.id = jl.journal_entry_id
  WHERE jl.organization_id = p_organization_id
    AND a.account_type = 'asset'
    AND (a.name ILIKE '%kas%' OR a.name ILIKE '%bank%')
    AND je.status = 'posted'
    AND (p_to_date IS NULL OR je.entry_date <= p_to_date);

  -- Calculate receivables (account code 1200)
  SELECT COALESCE(SUM(jl.debit - jl.credit), 0)
  INTO v_receivables
  FROM public.journal_lines jl
  JOIN public.accounts a ON a.id = jl.account_id
  JOIN public.journal_entries je ON je.id = jl.journal_entry_id
  WHERE jl.organization_id = p_organization_id
    AND a.code = 1200
    AND je.status = 'posted'
    AND (p_to_date IS NULL OR je.entry_date <= p_to_date);

  -- Calculate payables (account code 2100)
  SELECT COALESCE(SUM(jl.credit - jl.debit), 0)
  INTO v_payables
  FROM public.journal_lines jl
  JOIN public.accounts a ON a.id = jl.account_id
  JOIN public.journal_entries je ON je.id = jl.journal_entry_id
  WHERE jl.organization_id = p_organization_id
    AND a.code = 2100
    AND je.status = 'posted'
    AND (p_to_date IS NULL OR je.entry_date <= p_to_date);

  -- Calculate revenue for period
  SELECT COALESCE(SUM(jl.credit - jl.debit), 0)
  INTO v_revenue
  FROM public.journal_lines jl
  JOIN public.accounts a ON a.id = jl.account_id
  JOIN public.journal_entries je ON je.id = jl.journal_entry_id
  WHERE jl.organization_id = p_organization_id
    AND a.account_type = 'revenue'
    AND je.status = 'posted'
    AND je.entry_type != 'opening_balance'
    AND (p_from_date IS NULL OR je.entry_date >= p_from_date)
    AND (p_to_date IS NULL OR je.entry_date <= p_to_date);

  -- Calculate expenses for period
  SELECT COALESCE(
    SUM(CASE WHEN a.account_type IN ('expense', 'cogs') THEN jl.debit - jl.credit ELSE 0 END),
    0
  ) INTO v_expenses
  FROM public.journal_lines jl
  JOIN public.accounts a ON a.id = jl.account_id
  JOIN public.journal_entries je ON je.id = jl.journal_entry_id
  WHERE jl.organization_id = p_organization_id
    AND a.account_type IN ('expense', 'cogs')
    AND je.status = 'posted'
    AND je.entry_type != 'opening_balance'
    AND (p_from_date IS NULL OR je.entry_date >= p_from_date)
    AND (p_to_date IS NULL OR je.entry_date <= p_to_date);

  v_net_income := v_revenue - v_expenses;

  RETURN jsonb_build_object(
    'cash_balance', v_cash_balance,
    'receivables', v_receivables,
    'payables', v_payables,
    'revenue', v_revenue,
    'expenses', v_expenses,
    'net_income', v_net_income
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;
