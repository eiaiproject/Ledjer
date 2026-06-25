-- Migration: Remove E-Wallet / QRIS account
-- Date: 2026-07-20
-- Purpose:
--   1. Deactivate E-Wallet / QRIS account (code 1130) for all organizations
--   2. Update create_default_accounts to exclude E-Wallet / QRIS
--   3. Update dashboard summary to not reference code 1130
--
-- Note: Existing organizations may have transactions linked to this account.
-- We deactivate rather than delete to preserve data integrity.


-- 1. Deactivate E-Wallet / QRIS account for all organizations
--    (set is_active = false, is_cash_account = false)
UPDATE public.accounts
SET is_active = false,
    is_cash_account = false
WHERE code = 1130
  AND (name ILIKE '%ewallet%'
       OR name ILIKE '%e-wallet%'
       OR name ILIKE '%qris%');

-- 2. Update create_default_accounts to exclude E-Wallet / QRIS
CREATE OR REPLACE FUNCTION public.create_default_accounts(
  p_org_id UUID,
  p_org_name TEXT
)
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER := 0;
BEGIN
  INSERT INTO accounts (organization_id, code, name, account_type, normal_balance, is_system, is_locked, report_group, is_cash_account) VALUES
    -- Assets (1000-1999)
    (p_org_id, 1110, 'Kas', 'asset', 'debit', true, true, 'Kas', true),
    (p_org_id, 1120, 'Bank', 'asset', 'debit', true, true, 'Bank', true),
    (p_org_id, 1200, 'Piutang Usaha', 'asset', 'debit', true, true, 'Piutang Usaha', false),
    (p_org_id, 1300, 'Persediaan Sederhana', 'asset', 'debit', true, false, 'Persediaan', false),

    -- Liabilities (2000-2999)
    (p_org_id, 2100, 'Utang Usaha', 'liability', 'credit', true, true, 'Utang Usaha', false),
    (p_org_id, 2200, 'Beban Masih Harus Dibayar', 'liability', 'credit', true, false, 'Beban Belum Dibayar', false),

    -- Equity (3000-3999)
    (p_org_id, 3100, 'Modal Pemilik', 'equity', 'credit', true, true, 'Modal', false),
    (p_org_id, 3200, 'Saldo Awal', 'equity', 'credit', true, true, 'Saldo Awal', false),
    (p_org_id, 3300, 'Prive / Pengambilan Pemilik', 'equity', 'debit', true, true, 'Prive', false),
    (p_org_id, 3400, 'Saldo Laba', 'equity', 'credit', true, false, 'Saldo Laba', false),
    (p_org_id, 3500, 'Laba Tahun Berjalan', 'equity', 'credit', true, false, 'Laba Berjalan', false),

    -- Revenue (4000-4999)
    (p_org_id, 4100, 'Pendapatan Penjualan Barang', 'revenue', 'credit', true, false, 'Pendapatan', false),
    (p_org_id, 4200, 'Pendapatan Jasa', 'revenue', 'credit', true, false, 'Pendapatan', false),

    -- COGS / Direct Expense (5000-5999)
    (p_org_id, 5100, 'HPP / Beban Langsung', 'cogs', 'debit', true, false, 'Beban Langsung', false),

    -- Operating Expenses (6000-6999)
    (p_org_id, 6110, 'Beban Gaji', 'expense', 'debit', true, false, 'Beban Usaha', false),
    (p_org_id, 6120, 'Beban Sewa', 'expense', 'debit', true, false, 'Beban Usaha', false),
    (p_org_id, 6130, 'Beban Listrik dan Air', 'expense', 'debit', true, false, 'Beban Usaha', false),
    (p_org_id, 6140, 'Beban Internet dan Telepon', 'expense', 'debit', true, false, 'Beban Usaha', false),
    (p_org_id, 6150, 'Beban Transportasi', 'expense', 'debit', true, false, 'Beban Usaha', false),
    (p_org_id, 6160, 'Beban Iklan dan Promosi', 'expense', 'debit', true, false, 'Beban Usaha', false),
    (p_org_id, 6170, 'Beban Perlengkapan', 'expense', 'debit', true, false, 'Beban Usaha', false),
    (p_org_id, 6180, 'Beban Software / Langganan', 'expense', 'debit', true, false, 'Beban Usaha', false),
    (p_org_id, 6190, 'Beban Lain-lain', 'expense', 'debit', true, false, 'Beban Usaha', false),

    -- Other Income (7000-7999)
    (p_org_id, 7100, 'Pendapatan Lain-lain', 'other_income', 'credit', true, false, 'Pendapatan Lain', false),

    -- Other Expense (8000-8999)
    (p_org_id, 8100, 'Beban Lain-lain', 'other_expense', 'debit', true, false, 'Beban Lain', false),
    (p_org_id, 8300, 'Beban Pajak Penghasilan', 'other_expense', 'debit', true, false, 'Pajak', false);

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- 3. Update get_dashboard_summary to only use is_cash_account flag (no code IN list)
--    This function already uses is_cash_account flag, so no change needed here.
--    But we update the backfill comment for clarity.

-- 4. Update the reporting view's cash balance calculation
--    The old view used code IN (1110, 1120, 1130), now we use is_cash_account flag.
CREATE OR REPLACE FUNCTION public.get_monthly_summary(
  p_organization_id UUID,
  p_month DATE DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_month DATE := COALESCE(p_month, date_trunc('month', CURRENT_DATE)::DATE);
  v_next_month DATE := v_month + INTERVAL '1 month';
  v_cash_balance NUMERIC;
  v_revenue NUMERIC;
  v_expenses NUMERIC;
BEGIN
  IF NOT public.has_permission(p_organization_id, 'can_view_reports') THEN
    RAISE EXCEPTION 'Anda tidak memiliki izin untuk melihat laporan';
  END IF;

  -- Cash balance: use is_cash_account flag (all posted lines up to end of month)
  SELECT COALESCE(SUM(jl.debit - jl.credit), 0)
  INTO v_cash_balance
  FROM journal_lines jl
  JOIN accounts a ON a.id = jl.account_id
  JOIN journal_entries je ON je.id = jl.journal_entry_id
  WHERE jl.organization_id = p_organization_id
    AND a.account_type = 'asset'
    AND a.is_cash_account = true
    AND je.status = 'posted'
    AND je.entry_date < v_next_month;

  -- Revenue this month
  SELECT COALESCE(SUM(jl.credit - jl.debit), 0)
  INTO v_revenue
  FROM journal_lines jl
  JOIN accounts a ON a.id = jl.account_id
  JOIN journal_entries je ON je.id = jl.journal_entry_id
  WHERE jl.organization_id = p_organization_id
    AND a.account_type = 'revenue'
    AND je.entry_type != 'opening_balance'
    AND je.status = 'posted'
    AND je.entry_date >= v_month
    AND je.entry_date < v_next_month;

  -- Expenses this month (including COGS)
  SELECT COALESCE(SUM(jl.debit - jl.credit), 0)
  INTO v_expenses
  FROM journal_lines jl
  JOIN accounts a ON a.id = jl.account_id
  JOIN journal_entries je ON je.id = jl.journal_entry_id
  WHERE jl.organization_id = p_organization_id
    AND a.account_type IN ('expense', 'cogs')
    AND je.entry_type != 'opening_balance'
    AND je.status = 'posted'
    AND je.entry_date >= v_month
    AND je.entry_date < v_next_month;

  RETURN jsonb_build_object(
    'cash_balance', v_cash_balance,
    'revenue', v_revenue,
    'expenses', v_expenses,
    'net_profit', v_revenue - v_expenses,
    'month', v_month
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_monthly_summary(UUID, DATE) TO authenticated;
