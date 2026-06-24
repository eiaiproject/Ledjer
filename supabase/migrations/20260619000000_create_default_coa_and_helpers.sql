-- ============================================================
-- LEDJER MVP — Default Chart of Accounts & Helper Functions
-- ============================================================

-- SEED: Default Chart of Accounts template
-- ------------------------------------------------------------
-- This is a template. The create_organization_with_template function
-- copies these rows into the new organization.

CREATE OR REPLACE FUNCTION public.create_default_accounts(
  p_org_id UUID,
  p_org_name TEXT
)
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER := 0;
BEGIN
  INSERT INTO accounts (organization_id, code, name, account_type, normal_balance, is_system, is_locked, report_group) VALUES
    -- Assets (1000-1999)
    (p_org_id, 1110, 'Kas', 'asset', 'debit', true, true, 'Kas'),
    (p_org_id, 1120, 'Bank', 'asset', 'debit', true, true, 'Bank'),
    (p_org_id, 1130, 'E-Wallet / QRIS', 'asset', 'debit', true, true, 'E-Wallet'),
    (p_org_id, 1200, 'Piutang Usaha', 'asset', 'debit', true, true, 'Piutang Usaha'),
    (p_org_id, 1300, 'Persediaan Sederhana', 'asset', 'debit', true, false, 'Persediaan'),

    -- Liabilities (2000-2999)
    (p_org_id, 2100, 'Utang Usaha', 'liability', 'credit', true, true, 'Utang Usaha'),
    (p_org_id, 2200, 'Beban Masih Harus Dibayar', 'liability', 'credit', true, false, 'Beban Belum Dibayar'),

    -- Equity (3000-3999)
    (p_org_id, 3100, 'Modal Pemilik', 'equity', 'credit', true, true, 'Modal'),
    (p_org_id, 3200, 'Saldo Awal', 'equity', 'credit', true, true, 'Saldo Awal'),
    (p_org_id, 3300, 'Prive / Pengambilan Pemilik', 'equity', 'debit', true, true, 'Prive'),
    (p_org_id, 3400, 'Saldo Laba', 'equity', 'credit', true, false, 'Saldo Laba'),
    (p_org_id, 3500, 'Laba Tahun Berjalan', 'equity', 'credit', true, false, 'Laba Berjalan'),

    -- Revenue (4000-4999)
    (p_org_id, 4100, 'Pendapatan Penjualan Barang', 'revenue', 'credit', true, false, 'Pendapatan'),
    (p_org_id, 4200, 'Pendapatan Jasa', 'revenue', 'credit', true, false, 'Pendapatan'),

    -- COGS / Direct Expense (5000-5999)
    (p_org_id, 5100, 'HPP / Beban Langsung', 'cogs', 'debit', true, false, 'Beban Langsung'),

    -- Operating Expenses (6000-6999)
    (p_org_id, 6110, 'Beban Gaji', 'expense', 'debit', true, false, 'Beban Usaha'),
    (p_org_id, 6120, 'Beban Sewa', 'expense', 'debit', true, false, 'Beban Usaha'),
    (p_org_id, 6130, 'Beban Listrik dan Air', 'expense', 'debit', true, false, 'Beban Usaha'),
    (p_org_id, 6140, 'Beban Internet dan Telepon', 'expense', 'debit', true, false, 'Beban Usaha'),
    (p_org_id, 6150, 'Beban Transportasi', 'expense', 'debit', true, false, 'Beban Usaha'),
    (p_org_id, 6160, 'Beban Iklan dan Promosi', 'expense', 'debit', true, false, 'Beban Usaha'),
    (p_org_id, 6170, 'Beban Perlengkapan', 'expense', 'debit', true, false, 'Beban Usaha'),
    (p_org_id, 6180, 'Beban Software / Langganan', 'expense', 'debit', true, false, 'Beban Usaha'),
    (p_org_id, 6190, 'Beban Lain-lain', 'expense', 'debit', true, false, 'Beban Usaha'),

    -- Other Income (7000-7999)
    (p_org_id, 7100, 'Pendapatan Lain-lain', 'other_income', 'credit', true, false, 'Pendapatan Lain'),

    -- Other Expense (8000-8999)
    (p_org_id, 8100, 'Beban Lain-lain', 'other_expense', 'debit', true, false, 'Beban Lain'),
    (p_org_id, 8300, 'Beban Pajak Penghasilan', 'other_expense', 'debit', true, false, 'Pajak');

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- HELPER: Generate next transaction number
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.generate_transaction_number(
  p_org_id UUID
)
RETURNS TEXT AS $$
DECLARE
  v_next INTEGER;
  v_number TEXT;
BEGIN
  SELECT COALESCE(MAX(
    CAST(SUBSTRING(transaction_number FROM 5 FOR 10) AS INTEGER)
  ), 0) + 1
  INTO v_next
  FROM transactions
  WHERE organization_id = p_org_id;

  v_number := 'TRX-' || LPAD(v_next::TEXT, 6, '0');
  RETURN v_number;
END;
$$ LANGUAGE plpgsql;

-- HELPER: Generate next journal entry number
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.generate_entry_number(
  p_org_id UUID
)
RETURNS TEXT AS $$
DECLARE
  v_next INTEGER;
  v_number TEXT;
BEGIN
  SELECT COALESCE(MAX(
    CAST(SUBSTRING(entry_number FROM 4 FOR 10) AS INTEGER)
  ), 0) + 1
  INTO v_next
  FROM journal_entries
  WHERE organization_id = p_org_id;

  v_number := 'JE-' || LPAD(v_next::TEXT, 6, '0');
  RETURN v_number;
END;
$$ LANGUAGE plpgsql;

-- HELPER: Calculate account balance (debit - credit)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_account_balance(
  p_account_id UUID,
  p_as_of_date DATE DEFAULT NULL
)
RETURNS NUMERIC AS $$
DECLARE
  v_balance NUMERIC;
  v_normal TEXT;
  v_account_type TEXT;
BEGIN
  SELECT a.normal_balance, a.account_type::TEXT
  INTO v_normal, v_account_type
  FROM accounts a
  WHERE a.id = p_account_id;

  SELECT COALESCE(SUM(jl.debit - jl.credit), 0)
  INTO v_balance
  FROM journal_lines jl
  JOIN journal_entries je ON je.id = jl.journal_entry_id
  WHERE jl.account_id = p_account_id
    AND je.status = 'posted'
    AND (p_as_of_date IS NULL OR je.entry_date <= p_as_of_date);

  -- For credit-normal accounts (liability, equity, revenue), flip the sign
  IF v_normal = 'credit' THEN
    v_balance := -v_balance;
  END IF;

  RETURN v_balance;
END;
$$ LANGUAGE plpgsql STABLE;

-- HELPER: Get transaction count for current month (for plan limits)
-- ------------------------------------------------------------
-- Counts all transactions (posted and voided) except reversal transactions
-- to accurately track user activity against plan limits
CREATE OR REPLACE FUNCTION public.get_monthly_transaction_count(
  p_org_id UUID
)
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*)::INTEGER
  INTO v_count
  FROM transactions
  WHERE organization_id = p_org_id
    AND status IN ('posted', 'voided')
    AND original_transaction_id IS NULL  -- Exclude reversal transactions
    AND transaction_date >= date_trunc('month', CURRENT_DATE)
    AND transaction_date < date_trunc('month', CURRENT_DATE) + INTERVAL '1 month';

  RETURN v_count;
END;
$$ LANGUAGE plpgsql STABLE;

-- HELPER: Check if user has permission in org
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.has_permission(
  p_org_id UUID,
  p_permission TEXT
)
RETURNS BOOLEAN AS $$
DECLARE
  v_role TEXT;
  v_perm_value BOOLEAN;
BEGIN
  SELECT role::TEXT INTO v_role
  FROM organization_members
  WHERE organization_id = p_org_id
    AND user_id = auth.uid()
    AND status = 'active';

  IF v_role IS NULL THEN
    RETURN false;
  END IF;

  IF v_role = 'owner' THEN
    RETURN true;
  END IF;

  EXECUTE format(
    'SELECT %I FROM organization_members WHERE organization_id = $1 AND user_id = auth.uid() AND status = ''active''',
    p_permission
  ) INTO v_perm_value
  USING p_org_id;

  RETURN COALESCE(v_perm_value, false);
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;
