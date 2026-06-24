-- Fix: Align get_dashboard_summary return keys with frontend expectations
-- Frontend expects: revenue_current_period, expense_current_period, net_profit_current_period,
--                   accounts_receivable, accounts_payable
-- Old function returned: revenue, expenses, net_income, receivables, payables

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
  IF NOT public.has_permission(p_organization_id, 'can_view_reports') THEN
    RAISE EXCEPTION 'You do not have permission to view reports';
  END IF;

  SELECT COALESCE(SUM(jl.debit - jl.credit), 0) INTO v_cash_balance
  FROM public.journal_lines jl
  JOIN public.accounts a ON a.id = jl.account_id
  JOIN public.journal_entries je ON je.id = jl.journal_entry_id
  WHERE jl.organization_id = p_organization_id
    AND a.account_type = 'asset'
    AND (a.name ILIKE '%kas%' OR a.name ILIKE '%bank%')
    AND je.status = 'posted'
    AND (p_to_date IS NULL OR je.entry_date <= p_to_date);

  SELECT COALESCE(SUM(jl.debit - jl.credit), 0) INTO v_receivables
  FROM public.journal_lines jl
  JOIN public.accounts a ON a.id = jl.account_id
  JOIN public.journal_entries je ON je.id = jl.journal_entry_id
  WHERE jl.organization_id = p_organization_id
    AND a.code = 1200
    AND je.status = 'posted'
    AND (p_to_date IS NULL OR je.entry_date <= p_to_date);

  SELECT COALESCE(SUM(jl.credit - jl.debit), 0) INTO v_payables
  FROM public.journal_lines jl
  JOIN public.accounts a ON a.id = jl.account_id
  JOIN public.journal_entries je ON je.id = jl.journal_entry_id
  WHERE jl.organization_id = p_organization_id
    AND a.code = 2100
    AND je.status = 'posted'
    AND (p_to_date IS NULL OR je.entry_date <= p_to_date);

  SELECT COALESCE(SUM(jl.credit - jl.debit), 0) INTO v_revenue
  FROM public.journal_lines jl
  JOIN public.accounts a ON a.id = jl.account_id
  JOIN public.journal_entries je ON je.id = jl.journal_entry_id
  WHERE jl.organization_id = p_organization_id
    AND a.account_type = 'revenue'
    AND je.status = 'posted'
    AND je.entry_type != 'opening_balance'
    AND (p_from_date IS NULL OR je.entry_date >= p_from_date)
    AND (p_to_date IS NULL OR je.entry_date <= p_to_date);

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
    'accounts_receivable', v_receivables,
    'accounts_payable', v_payables,
    'revenue_current_period', v_revenue,
    'expense_current_period', v_expenses,
    'net_profit_current_period', v_net_income
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public';
