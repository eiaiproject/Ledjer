-- Migration: Fix dashboard period defaults and cash account detection
-- Date: 2026-07-19
-- Purpose:
--   1. get_dashboard_summary must default to current month for P&L metrics when NULL
--   2. Add is_cash_account flag to accounts table for reliable cash detection
--   3. Replace fragile ILIKE '%kas%' OR '%bank%' with boolean flag
--
-- Changes:
--   - ALTER TABLE accounts ADD COLUMN is_cash_account BOOLEAN DEFAULT false
--   - Backfill is_cash_account for codes 1110, 1120, 1130
--   - CREATE OR REPLACE get_dashboard_summary with period defaults
--   - CREATE OR REPLACE create_default_accounts to include is_cash_account
--
-- Constraints: Additive only (C1). No destructive changes.


-- 1. Add is_cash_account column to accounts
ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS is_cash_account BOOLEAN NOT NULL DEFAULT false;

-- 2. Backfill existing cash/bank/e-wallet accounts
UPDATE public.accounts
SET is_cash_account = true
WHERE code IN (1110, 1120, 1130)
  AND is_cash_account = false;

-- 3. Fix get_dashboard_summary to default to current month for P&L
CREATE OR REPLACE FUNCTION public.get_dashboard_summary(
  p_organization_id UUID,
  p_from_date DATE DEFAULT NULL,
  p_to_date DATE DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- P&L defaults: current calendar month
  v_effective_from DATE := COALESCE(p_from_date, date_trunc('month', CURRENT_DATE)::DATE);
  v_effective_to   DATE := COALESCE(p_to_date, (date_trunc('month', CURRENT_DATE) + INTERVAL '1 month - 1 day')::DATE);
  -- Balance sheet: point-in-time (use p_to_date or today)
  v_point_in_time DATE := COALESCE(p_to_date, CURRENT_DATE);

  v_cash_balance NUMERIC;
  v_receivables NUMERIC;
  v_payables NUMERIC;
  v_revenue NUMERIC;
  v_expenses NUMERIC;
  v_net_income NUMERIC;
BEGIN
  IF NOT public.has_permission(p_organization_id, 'can_view_reports') THEN
    RAISE EXCEPTION 'Anda tidak memiliki izin untuk melihat laporan';
  END IF;

  WITH posted_lines AS (
    SELECT
      jl.debit,
      jl.credit,
      a.code,
      a.name,
      a.account_type,
      a.is_cash_account,
      je.entry_type,
      je.entry_date
    FROM public.journal_lines jl
    JOIN public.accounts a ON a.id = jl.account_id
    JOIN public.journal_entries je ON je.id = jl.journal_entry_id
    WHERE jl.organization_id = p_organization_id
      AND je.status = 'posted'
  ),
  -- Cash balance: point-in-time (all posted lines up to v_point_in_time)
  cash_lines AS (
    SELECT * FROM posted_lines
    WHERE is_cash_account = true
      AND entry_date <= v_point_in_time
  ),
  -- AR: point-in-time
  ar_lines AS (
    SELECT * FROM posted_lines
    WHERE code = 1200
      AND entry_date <= v_point_in_time
  ),
  -- AP: point-in-time
  ap_lines AS (
    SELECT * FROM posted_lines
    WHERE code = 2100
      AND entry_date <= v_point_in_time
  ),
  -- Revenue: period-scoped
  revenue_lines AS (
    SELECT * FROM posted_lines
    WHERE account_type = 'revenue'
      AND entry_type != 'opening_balance'
      AND entry_date BETWEEN v_effective_from AND v_effective_to
  ),
  -- Expenses (including COGS): period-scoped
  expense_lines AS (
    SELECT * FROM posted_lines
    WHERE account_type IN ('expense', 'cogs')
      AND entry_type != 'opening_balance'
      AND entry_date BETWEEN v_effective_from AND v_effective_to
  )
  SELECT
    COALESCE((SELECT SUM(debit - credit) FROM cash_lines), 0),
    COALESCE((SELECT SUM(debit - credit) FROM ar_lines), 0),
    COALESCE((SELECT SUM(credit - debit) FROM ap_lines), 0),
    COALESCE((SELECT SUM(credit - debit) FROM revenue_lines), 0),
    COALESCE((SELECT SUM(debit - credit) FROM expense_lines), 0)
  INTO v_cash_balance, v_receivables, v_payables, v_revenue, v_expenses;

  v_net_income := v_revenue - v_expenses;

  RETURN jsonb_build_object(
    'cash_balance', v_cash_balance,
    'accounts_receivable', v_receivables,
    'accounts_payable', v_payables,
    'revenue_current_period', v_revenue,
    'expense_current_period', v_expenses,
    'net_profit_current_period', v_net_income,
    'period_from', v_effective_from,
    'period_to', v_effective_to
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_dashboard_summary(UUID, DATE, DATE) TO authenticated;

-- 4. Update create_default_accounts to set is_cash_account for new orgs
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
    (p_org_id, 1130, 'E-Wallet / QRIS', 'asset', 'debit', true, true, 'E-Wallet', true),
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
