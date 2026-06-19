-- ============================================================
-- LEDJER MVP — Reporting Views & Functions
-- ============================================================

-- GENERAL LEDGER VIEW
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW public.general_ledger AS
SELECT
  jl.organization_id,
  jl.account_id,
  a.code AS account_code,
  a.name AS account_name,
  a.account_type,
  a.normal_balance,
  je.entry_date,
  je.id AS journal_entry_id,
  je.entry_number,
  t.id AS transaction_id,
  t.transaction_number,
  jl.description,
  p.name AS party_name,
  jl.debit,
  jl.credit,
  CASE
    WHEN a.normal_balance = 'debit' THEN jl.debit - jl.credit
    ELSE jl.credit - jl.debit
  END AS signed_amount,
  SUM(
    CASE
      WHEN a.normal_balance = 'debit' THEN jl.debit - jl.credit
      ELSE jl.credit - jl.debit
    END
  ) OVER (
    PARTITION BY jl.account_id, jl.organization_id
    ORDER BY je.entry_date, je.created_at, jl.line_order
    ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
  ) AS running_balance
FROM journal_lines jl
JOIN accounts a ON a.id = jl.account_id
JOIN journal_entries je ON je.id = jl.journal_entry_id
LEFT JOIN transactions t ON t.id = je.transaction_id
LEFT JOIN parties p ON p.id = jl.party_id
WHERE je.status = 'posted';

-- GENERAL LEDGER FUNCTION (with filters)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_general_ledger(
  p_organization_id UUID,
  p_account_id UUID DEFAULT NULL,
  p_from_date DATE DEFAULT NULL,
  p_to_date DATE DEFAULT NULL
)
RETURNS TABLE(
  account_id UUID,
  account_code INTEGER,
  account_name TEXT,
  entry_date DATE,
  journal_entry_id UUID,
  entry_number TEXT,
  transaction_id UUID,
  transaction_number TEXT,
  description TEXT,
  party_name TEXT,
  debit NUMERIC,
  credit NUMERIC,
  running_balance NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    gl.account_id,
    gl.account_code,
    gl.account_name,
    gl.entry_date,
    gl.journal_entry_id,
    gl.entry_number,
    gl.transaction_id,
    gl.transaction_number,
    gl.description,
    gl.party_name,
    gl.debit,
    gl.credit,
    gl.running_balance
  FROM general_ledger gl
  WHERE gl.organization_id = p_organization_id
    AND (p_account_id IS NULL OR gl.account_id = p_account_id)
    AND (p_from_date IS NULL OR gl.entry_date >= p_from_date)
    AND (p_to_date IS NULL OR gl.entry_date <= p_to_date)
  ORDER BY gl.account_code, gl.entry_date, gl.journal_entry_id, gl.running_balance;
END;
$$ LANGUAGE plpgsql STABLE;

-- TRIAL BALANCE FUNCTION
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_trial_balance(
  p_organization_id UUID,
  p_as_of_date DATE DEFAULT NULL
)
RETURNS TABLE(
  account_id UUID,
  account_code INTEGER,
  account_name TEXT,
  account_type TEXT,
  normal_balance TEXT,
  debit_total NUMERIC,
  credit_total NUMERIC,
  ending_debit NUMERIC,
  ending_credit NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    a.id AS account_id,
    a.code AS account_code,
    a.name AS account_name,
    a.account_type::TEXT,
    a.normal_balance::TEXT,
    COALESCE(SUM(jl.debit), 0) AS debit_total,
    COALESCE(SUM(jl.credit), 0) AS credit_total,
    CASE
      WHEN a.normal_balance = 'debit' THEN
        GREATEST(COALESCE(SUM(jl.debit - jl.credit), 0), 0)
      ELSE 0
    END AS ending_debit,
    CASE
      WHEN a.normal_balance = 'credit' THEN
        GREATEST(COALESCE(SUM(jl.credit - jl.debit), 0), 0)
      ELSE 0
    END AS ending_credit
  FROM accounts a
  LEFT JOIN journal_lines jl ON jl.account_id = a.id
  LEFT JOIN journal_entries je ON je.id = jl.journal_entry_id
    AND je.status = 'posted'
    AND (p_as_of_date IS NULL OR je.entry_date <= p_as_of_date)
  WHERE a.organization_id = p_organization_id
    AND a.is_active = true
  GROUP BY a.id, a.code, a.name, a.account_type, a.normal_balance
  HAVING COALESCE(SUM(jl.debit), 0) != 0 OR COALESCE(SUM(jl.credit), 0) != 0
  ORDER BY a.code;
END;
$$ LANGUAGE plpgsql STABLE;

-- PROFIT AND LOSS FUNCTION
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_profit_loss(
  p_organization_id UUID,
  p_from_date DATE,
  p_to_date DATE
)
RETURNS TABLE(
  section TEXT,
  account_code INTEGER,
  account_name TEXT,
  amount NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  -- Revenue
  SELECT
    'revenue' AS section,
    a.code AS account_code,
    a.name AS account_name,
    COALESCE(SUM(jl.credit - jl.debit), 0) AS amount
  FROM accounts a
  LEFT JOIN journal_lines jl ON jl.account_id = a.id
  LEFT JOIN journal_entries je ON je.id = jl.journal_entry_id
    AND je.status = 'posted'
    AND je.entry_type != 'opening_balance'
    AND je.entry_date BETWEEN p_from_date AND p_to_date
  WHERE a.organization_id = p_organization_id
    AND a.account_type = 'revenue'
    AND a.is_active = true
  GROUP BY a.id, a.code, a.name

  UNION ALL

  -- COGS
  SELECT
    'cogs' AS section,
    a.code AS account_code,
    a.name AS account_name,
    COALESCE(SUM(jl.debit - jl.credit), 0) AS amount
  FROM accounts a
  LEFT JOIN journal_lines jl ON jl.account_id = a.id
  LEFT JOIN journal_entries je ON je.id = jl.journal_entry_id
    AND je.status = 'posted'
    AND je.entry_date BETWEEN p_from_date AND p_to_date
  WHERE a.organization_id = p_organization_id
    AND a.account_type = 'cogs'
    AND a.is_active = true
  GROUP BY a.id, a.code, a.name

  UNION ALL

  -- Operating Expenses
  SELECT
    'expense' AS section,
    a.code AS account_code,
    a.name AS account_name,
    COALESCE(SUM(jl.debit - jl.credit), 0) AS amount
  FROM accounts a
  LEFT JOIN journal_lines jl ON jl.account_id = a.id
  LEFT JOIN journal_entries je ON je.id = jl.journal_entry_id
    AND je.status = 'posted'
    AND je.entry_date BETWEEN p_from_date AND p_to_date
  WHERE a.organization_id = p_organization_id
    AND a.account_type = 'expense'
    AND a.is_active = true
  GROUP BY a.id, a.code, a.name

  UNION ALL

  -- Other Income
  SELECT
    'other_income' AS section,
    a.code AS account_code,
    a.name AS account_name,
    COALESCE(SUM(jl.credit - jl.debit), 0) AS amount
  FROM accounts a
  LEFT JOIN journal_lines jl ON jl.account_id = a.id
  LEFT JOIN journal_entries je ON je.id = jl.journal_entry_id
    AND je.status = 'posted'
    AND je.entry_date BETWEEN p_from_date AND p_to_date
  WHERE a.organization_id = p_organization_id
    AND a.account_type = 'other_income'
    AND a.is_active = true
  GROUP BY a.id, a.code, a.name

  UNION ALL

  -- Other Expense
  SELECT
    'other_expense' AS section,
    a.code AS account_code,
    a.name AS account_name,
    COALESCE(SUM(jl.debit - jl.credit), 0) AS amount
  FROM accounts a
  LEFT JOIN journal_lines jl ON jl.account_id = a.id
  LEFT JOIN journal_entries je ON je.id = jl.journal_entry_id
    AND je.status = 'posted'
    AND je.entry_date BETWEEN p_from_date AND p_to_date
  WHERE a.organization_id = p_organization_id
    AND a.account_type = 'other_expense'
    AND a.is_active = true
  GROUP BY a.id, a.code, a.name

  ORDER BY section, account_code;
END;
$$ LANGUAGE plpgsql STABLE;

-- BALANCE SHEET FUNCTION
-- ------------------------------------------------------------
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

  UNION ALL

  -- Equity (excluding net income accounts, adding net income)
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
    AND a.code NOT IN (3400, 3500) -- Exclude Saldo Laba and Laba Tahun Berjalan
  GROUP BY a.id, a.code, a.name

  UNION ALL

  -- Net Income (Laba Tahun Berjalan)
  SELECT
    'equity' AS section,
    3500 AS account_code,
    'Laba Tahun Berjalan' AS account_name,
    v_net_income AS amount

  ORDER BY section, account_code;
END;
$$ LANGUAGE plpgsql STABLE;

-- DASHBOARD SUMMARY FUNCTION
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_dashboard_summary(
  p_organization_id UUID
)
RETURNS JSONB AS $$
DECLARE
  v_result JSONB;
  v_cash_balance NUMERIC := 0;
  v_revenue NUMERIC := 0;
  v_expense NUMERIC := 0;
  v_ar NUMERIC := 0;
  v_ap NUMERIC := 0;
  v_from_date DATE;
  v_to_date DATE;
BEGIN
  v_from_date := date_trunc('month', CURRENT_DATE)::DATE;
  v_to_date := (date_trunc('month', CURRENT_DATE) + INTERVAL '1 month - 1 day')::DATE;

  -- Cash/Bank balance
  SELECT COALESCE(SUM(jl.debit - jl.credit), 0)
  INTO v_cash_balance
  FROM journal_lines jl
  JOIN accounts a ON a.id = jl.account_id
  JOIN journal_entries je ON je.id = jl.journal_entry_id
  WHERE jl.organization_id = p_organization_id
    AND a.account_type = 'asset'
    AND a.code IN (1110, 1120, 1130)
    AND je.status = 'posted';

  -- Revenue this month
  SELECT COALESCE(SUM(jl.credit - jl.debit), 0)
  INTO v_revenue
  FROM journal_lines jl
  JOIN accounts a ON a.id = jl.account_id
  JOIN journal_entries je ON je.id = jl.journal_entry_id
  WHERE jl.organization_id = p_organization_id
    AND a.account_type = 'revenue'
    AND je.status = 'posted'
    AND je.entry_date BETWEEN v_from_date AND v_to_date;

  -- Expenses this month
  SELECT COALESCE(SUM(jl.debit - jl.credit), 0)
  INTO v_expense
  FROM journal_lines jl
  JOIN accounts a ON a.id = jl.account_id
  JOIN journal_entries je ON je.id = jl.journal_entry_id
  WHERE jl.organization_id = p_organization_id
    AND a.account_type IN ('expense', 'cogs')
    AND je.status = 'posted'
    AND je.entry_date BETWEEN v_from_date AND v_to_date;

  -- Accounts Receivable
  SELECT COALESCE(SUM(jl.debit - jl.credit), 0)
  INTO v_ar
  FROM journal_lines jl
  JOIN accounts a ON a.id = jl.account_id
  JOIN journal_entries je ON je.id = jl.journal_entry_id
  WHERE jl.organization_id = p_organization_id
    AND a.code = 1200
    AND je.status = 'posted';

  -- Accounts Payable
  SELECT COALESCE(SUM(jl.credit - jl.debit), 0)
  INTO v_ap
  FROM journal_lines jl
  JOIN accounts a ON a.id = jl.account_id
  JOIN journal_entries je ON je.id = jl.journal_entry_id
  WHERE jl.organization_id = p_organization_id
    AND a.code = 2100
    AND je.status = 'posted';

  v_result := jsonb_build_object(
    'cash_balance', v_cash_balance,
    'revenue_current_period', v_revenue,
    'expense_current_period', v_expense,
    'net_profit_current_period', v_revenue - v_expense,
    'accounts_receivable', v_ar,
    'accounts_payable', v_ap
  );

  RETURN v_result;
END;
$$ LANGUAGE plpgsql STABLE;

-- AUTO-UPDATE PROFILE ON USER CREATE
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.email, '')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
