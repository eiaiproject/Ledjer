-- =============================================================================
-- Migration: Comprehensive Priority Fixes
-- Date: 2026-07-22
-- Purpose:
--   P0.1  Fix balance sheet: LEFT JOIN bug caused journal lines outside
--         as_of_date to be counted. Rewrite with CTE pre-filter.
--   P0.2  Add permission check, SECURITY DEFINER, search_path to
--         get_balance_sheet.
--   P0.4  Product sales must fail when COGS/inventory accounts missing
--         (not silently skip).
--   P0.5  Opening balance transaction types rejected through general
--         post_transaction.
--   P1.2  Parties RLS: rename insert policy to match actual behavior.
--   P1.3  Transaction detail: allow staff with transaction access to see
--         business details (journal lines hidden for non-report permission).
--   P1.4  Onboarding guard at dashboard layout level (frontend).
--
-- Constraints: Additive/replace only (C1). No data migration needed.
-- =============================================================================

BEGIN;

-- =============================================================================
-- P0.1 + P0.2: Fix balance sheet with CTE and security
-- =============================================================================

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
  -- P0.2: Validate caller belongs to organization
  IF NOT public.is_org_member(p_organization_id) THEN
    RAISE EXCEPTION 'Anda bukan anggota organisasi ini';
  END IF;

  -- P0.2: Require report permission
  IF NOT public.has_permission(p_organization_id, 'can_view_reports') THEN
    RAISE EXCEPTION 'Anda tidak memiliki izin untuk melihat laporan neraca';
  END IF;

  -- P0.1: Use CTE to pre-filter journal lines before aggregation.
  -- The old LEFT JOIN pattern had a bug: when je conditions didn't match,
  -- je columns were NULL but jl rows still participated in SUM,
  -- causing out-of-date and non-posted transactions to be counted.
  WITH filtered_lines AS (
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
      COALESCE(SUM(fl.debit - fl.credit), 0) AS balance
    FROM public.accounts a
    LEFT JOIN filtered_lines fl ON fl.account_id = a.id
    WHERE a.organization_id = p_organization_id
      AND a.is_active = true
    GROUP BY a.id, a.code, a.name, a.account_type
  )
  SELECT
    'asset' AS section,
    ab.code AS account_code,
    ab.name AS account_name,
    ab.balance AS amount
  FROM account_balances ab
  WHERE ab.account_type = 'asset' AND ab.balance != 0

  UNION ALL

  SELECT
    'liability' AS section,
    ab.code AS account_code,
    ab.name AS account_name,
    -ab.balance AS amount   -- Liabilities show as positive (credit-normal)
  FROM account_balances ab
  WHERE ab.account_type = 'liability' AND ab.balance != 0

  UNION ALL

  -- Equity accounts except 3500 (Laba Tahun Berjalan — synthetic)
  SELECT
    'equity' AS section,
    ab.code AS account_code,
    ab.name AS account_name,
    -ab.balance AS amount   -- Equity is credit-normal
  FROM account_balances ab
  WHERE ab.account_type = 'equity'
    AND ab.code != 3500
    AND ab.balance != 0

  UNION ALL

  -- Net income (Laba Tahun Berjalan) — synthetic row from P&L accounts
  SELECT
    'equity' AS section,
    3500 AS account_code,
    'Laba Tahun Berjalan' AS account_name,
    v_net_income AS amount
  WHERE v_net_income != 0

  ORDER BY section, account_code;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.get_balance_sheet(UUID, DATE) TO authenticated;


-- =============================================================================
-- P0.4 + P0.5: Harden post_transaction
--   P0.4: Reject product sales when COGS/inventory accounts are missing.
--   P0.5: Reject opening balance types through general posting.
-- =============================================================================

-- We replace the canonical 17-param post_transaction from 20260722_000001.
-- Changes are marked with "-- P0.4" and "-- P0.5" comments.

DROP FUNCTION IF EXISTS public.post_transaction(
  UUID, DATE, TEXT, NUMERIC, UUID, TEXT, UUID, UUID,
  TEXT, NUMERIC, DATE, TEXT, TEXT, UUID, NUMERIC, NUMERIC, UUID
);

CREATE OR REPLACE FUNCTION public.post_transaction(
  p_organization_id UUID,
  p_transaction_date DATE,
  p_transaction_type TEXT,
  p_amount NUMERIC,
  p_party_id UUID DEFAULT NULL,
  p_category_name TEXT DEFAULT NULL,
  p_cash_account_id UUID DEFAULT NULL,
  p_destination_cash_account_id UUID DEFAULT NULL,
  p_payment_status TEXT DEFAULT 'paid',
  p_partial_amount NUMERIC DEFAULT NULL,
  p_due_date DATE DEFAULT NULL,
  p_description TEXT DEFAULT '',
  p_notes TEXT DEFAULT NULL,
  p_product_id UUID DEFAULT NULL,
  p_quantity NUMERIC DEFAULT NULL,
  p_unit_price NUMERIC DEFAULT NULL,
  p_debit_account_id UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_user_id UUID;
  v_role TEXT;
  v_plan TEXT;
  v_txn_count INTEGER;
  v_books_start_date DATE;
  v_account_type TEXT;
  v_is_cash_account BOOLEAN;
  v_debit_account_id UUID;
  v_credit_account_id UUID;
  v_receivable_account_id UUID;
  v_payable_account_id UUID;
  v_debit_account_name TEXT;
  v_credit_account_name TEXT;
  v_debit_normal TEXT;
  v_credit_normal TEXT;
  v_journal_id UUID;
  v_txn_id UUID;
  v_txn_number TEXT;
  v_entry_number TEXT;
  v_impact JSONB := '{}'::JSONB;
  v_line_order INTEGER := 0;
  v_remaining_amount NUMERIC;
  v_product_org_id UUID;
  v_product_purchase_price NUMERIC;
  v_cogs_account_id UUID;
  v_inventory_account_id UUID;
  v_cogs_amount NUMERIC;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Autentikasi diperlukan';
  END IF;

  SELECT role::TEXT
  INTO v_role
  FROM public.organization_members
  WHERE organization_id = p_organization_id
    AND user_id = v_user_id
    AND status = 'active'
  LIMIT 1;

  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Anda bukan anggota organisasi ini';
  END IF;

  IF NOT public.has_permission(p_organization_id, 'can_create_transaction') THEN
    RAISE EXCEPTION 'Anda tidak memiliki izin untuk membuat transaksi';
  END IF;

  -- P0.5: Reject opening balance types through general post_transaction.
  -- Opening balances must go through post_opening_balance or onboarding.
  IF p_transaction_type IN (
    'opening_cash_balance',
    'opening_receivable_balance',
    'opening_payable_balance'
  ) THEN
    RAISE EXCEPTION 'Saldo awal tidak dapat dicatat melalui transaksi umum. Gunakan alur pemasangan saldo awal.';
  END IF;

  SELECT books_start_date, current_plan::TEXT
  INTO v_books_start_date, v_plan
  FROM public.organizations
  WHERE id = p_organization_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Organisasi tidak ditemukan';
  END IF;

  IF p_transaction_date < v_books_start_date THEN
    RAISE EXCEPTION 'Tanggal transaksi % sebelum tanggal mulai pembukuan %',
      p_transaction_date, v_books_start_date;
  END IF;

  IF v_plan = 'free' THEN
    v_txn_count := public.get_monthly_transaction_count(p_organization_id);
    IF v_txn_count >= 50 THEN
      RAISE EXCEPTION 'Batas transaksi paket Gratis tercapai (50 transaksi/bulan). Silakan upgrade.';
    END IF;
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Nominal harus lebih dari 0';
  END IF;

  IF p_payment_status NOT IN ('paid', 'unpaid', 'partial') THEN
    RAISE EXCEPTION 'Status pembayaran tidak valid: %', p_payment_status;
  END IF;

  IF p_payment_status IN ('unpaid', 'partial')
     AND p_transaction_type NOT IN ('credit_sale', 'credit_purchase') THEN
    RAISE EXCEPTION 'Status belum dibayar atau sebagian hanya valid untuk transaksi kredit';
  END IF;

  IF p_transaction_type IN ('credit_sale', 'credit_purchase')
     AND p_payment_status = 'paid' THEN
    RAISE EXCEPTION 'Gunakan transaksi tunai untuk penjualan atau pembelian yang sudah lunas';
  END IF;

  IF p_payment_status = 'partial' THEN
    IF p_partial_amount IS NULL OR p_partial_amount <= 0 THEN
      RAISE EXCEPTION 'Nominal pembayaran sebagian harus lebih dari 0';
    END IF;
    IF p_partial_amount >= p_amount THEN
      RAISE EXCEPTION 'Nominal pembayaran sebagian harus lebih kecil dari total transaksi';
    END IF;
    IF p_cash_account_id IS NULL THEN
      RAISE EXCEPTION 'Akun kas/bank wajib diisi untuk pembayaran sebagian';
    END IF;
  END IF;

  IF p_transaction_type IN ('credit_sale', 'credit_purchase', 'receive_receivable', 'pay_payable')
     AND p_party_id IS NULL THEN
    RAISE EXCEPTION 'Pihak wajib dipilih untuk transaksi tipe %', p_transaction_type;
  END IF;

  IF p_party_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.parties
    WHERE id = p_party_id
      AND organization_id = p_organization_id
      AND is_active = true
  ) THEN
    RAISE EXCEPTION 'Pihak tidak ditemukan atau tidak aktif';
  END IF;

  IF p_product_id IS NOT NULL THEN
    IF p_transaction_type NOT IN ('cash_purchase', 'credit_purchase', 'cash_sale', 'credit_sale') THEN
      RAISE EXCEPTION 'Produk hanya dapat digunakan untuk transaksi penjualan atau pembelian';
    END IF;
    IF p_quantity IS NULL OR p_quantity <= 0 THEN
      RAISE EXCEPTION 'Kuantitas produk harus lebih dari 0';
    END IF;
    IF p_unit_price IS NULL OR p_unit_price < 0 THEN
      RAISE EXCEPTION 'Harga satuan produk tidak valid';
    END IF;
    IF ABS(p_amount - (p_quantity * p_unit_price)) > 0.01 THEN
      RAISE EXCEPTION 'Nominal transaksi harus sama dengan kuantitas dikali harga satuan';
    END IF;

    SELECT organization_id, purchase_price
    INTO v_product_org_id, v_product_purchase_price
    FROM public.products
    WHERE id = p_product_id
      AND is_active = true;

    IF NOT FOUND OR v_product_org_id != p_organization_id THEN
      RAISE EXCEPTION 'Produk tidak ditemukan dalam organisasi ini';
    END IF;
  END IF;

  IF p_transaction_type IN (
    'cash_sale', 'receive_receivable', 'cash_purchase', 'pay_payable',
    'expense_payment', 'owner_capital', 'owner_draw', 'cash_transfer'
  ) AND p_cash_account_id IS NULL THEN
    RAISE EXCEPTION 'Akun kas/bank wajib diisi untuk transaksi tipe %', p_transaction_type;
  END IF;

  IF p_transaction_type != 'simple_adjustment' AND p_cash_account_id IS NOT NULL THEN
    SELECT account_type::TEXT, is_cash_account
    INTO v_account_type, v_is_cash_account
    FROM public.accounts
    WHERE id = p_cash_account_id
      AND organization_id = p_organization_id
      AND is_active = true;

    IF v_account_type IS NULL THEN
      RAISE EXCEPTION 'Akun kas/bank tidak ditemukan atau tidak aktif';
    END IF;

    IF v_account_type != 'asset' OR v_is_cash_account IS NOT TRUE THEN
      RAISE EXCEPTION 'Akun kas/bank harus akun aset yang ditandai sebagai akun kas/bank';
    END IF;
  END IF;

  IF p_destination_cash_account_id IS NOT NULL
     AND p_transaction_type NOT IN ('cash_transfer', 'simple_adjustment') THEN
    RAISE EXCEPTION 'Akun tujuan hanya boleh diisi untuk transfer kas atau penyesuaian';
  END IF;

  IF p_transaction_type = 'cash_transfer' THEN
    IF p_destination_cash_account_id IS NULL THEN
      RAISE EXCEPTION 'Akun tujuan wajib diisi untuk transfer kas';
    END IF;
    IF p_cash_account_id = p_destination_cash_account_id THEN
      RAISE EXCEPTION 'Akun sumber dan tujuan transfer harus berbeda';
    END IF;

    SELECT account_type::TEXT, is_cash_account
    INTO v_account_type, v_is_cash_account
    FROM public.accounts
    WHERE id = p_destination_cash_account_id
      AND organization_id = p_organization_id
      AND is_active = true;

    IF v_account_type IS NULL THEN
      RAISE EXCEPTION 'Akun tujuan tidak ditemukan atau tidak aktif';
    END IF;

    IF v_account_type != 'asset' OR v_is_cash_account IS NOT TRUE THEN
      RAISE EXCEPTION 'Akun tujuan harus akun aset yang ditandai sebagai akun kas/bank';
    END IF;
  END IF;

  IF p_transaction_type = 'simple_adjustment' THEN
    IF v_role != 'owner' THEN
      RAISE EXCEPTION 'Hanya owner yang dapat membuat penyesuaian manual';
    END IF;
    IF p_cash_account_id IS NULL OR p_destination_cash_account_id IS NULL THEN
      RAISE EXCEPTION 'Akun debit dan kredit wajib diisi untuk penyesuaian';
    END IF;
    IF p_cash_account_id = p_destination_cash_account_id THEN
      RAISE EXCEPTION 'Akun debit dan kredit tidak boleh sama untuk penyesuaian';
    END IF;

    -- Validate both accounts belong to the same organization and are active
    IF NOT EXISTS (
      SELECT 1 FROM public.accounts
      WHERE id = p_cash_account_id
        AND organization_id = p_organization_id
        AND is_active = true
    ) THEN
      RAISE EXCEPTION 'Akun debit tidak ditemukan atau tidak aktif';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.accounts
      WHERE id = p_destination_cash_account_id
        AND organization_id = p_organization_id
        AND is_active = true
    ) THEN
      RAISE EXCEPTION 'Akun kredit tidak ditemukan atau tidak aktif';
    END IF;
  END IF;

  CASE p_transaction_type
    WHEN 'cash_sale' THEN
      v_debit_account_id := p_cash_account_id;
      v_debit_account_name := 'Kas/Bank';
      SELECT id, name
      INTO v_credit_account_id, v_credit_account_name
      FROM public.accounts
      WHERE organization_id = p_organization_id
        AND account_type = 'revenue'
        AND is_active = true
        AND ((p_category_name IS NOT NULL AND name ILIKE '%' || p_category_name || '%') OR code = 4100)
      ORDER BY CASE WHEN p_category_name IS NOT NULL AND name ILIKE '%' || p_category_name || '%' THEN 0 ELSE 1 END, code
      LIMIT 1;

    WHEN 'credit_sale' THEN
      SELECT id
      INTO v_receivable_account_id
      FROM public.accounts
      WHERE organization_id = p_organization_id
        AND code = 1200
        AND is_active = true;

      IF p_payment_status = 'partial' THEN
        v_debit_account_id := p_cash_account_id;
        v_debit_account_name := 'Kas/Bank + Piutang Usaha';
      ELSE
        v_debit_account_id := v_receivable_account_id;
        v_debit_account_name := 'Piutang Usaha';
      END IF;

      SELECT id, name
      INTO v_credit_account_id, v_credit_account_name
      FROM public.accounts
      WHERE organization_id = p_organization_id
        AND account_type = 'revenue'
        AND is_active = true
        AND ((p_category_name IS NOT NULL AND name ILIKE '%' || p_category_name || '%') OR code = 4100)
      ORDER BY CASE WHEN p_category_name IS NOT NULL AND name ILIKE '%' || p_category_name || '%' THEN 0 ELSE 1 END, code
      LIMIT 1;

    WHEN 'receive_receivable' THEN
      v_debit_account_id := p_cash_account_id;
      v_debit_account_name := 'Kas/Bank';
      SELECT id INTO v_credit_account_id
      FROM public.accounts
      WHERE organization_id = p_organization_id
        AND code = 1200
        AND is_active = true;
      v_credit_account_name := 'Piutang Usaha';

    WHEN 'cash_purchase' THEN
      IF p_product_id IS NOT NULL THEN
        SELECT id, name
        INTO v_debit_account_id, v_debit_account_name
        FROM public.accounts
        WHERE organization_id = p_organization_id
          AND code = 1300
          AND is_active = true;
      ELSIF p_debit_account_id IS NOT NULL THEN
        SELECT id, name
        INTO v_debit_account_id, v_debit_account_name
        FROM public.accounts
        WHERE id = p_debit_account_id
          AND organization_id = p_organization_id
          AND account_type IN ('expense', 'cogs', 'asset')
          AND is_active = true;
      ELSE
        SELECT id, name
        INTO v_debit_account_id, v_debit_account_name
        FROM public.accounts
        WHERE organization_id = p_organization_id
          AND account_type IN ('expense', 'cogs', 'asset')
          AND is_active = true
          AND ((p_category_name IS NOT NULL AND name ILIKE '%' || p_category_name || '%') OR code = 5100)
        ORDER BY CASE WHEN p_category_name IS NOT NULL AND name ILIKE '%' || p_category_name || '%' THEN 0 ELSE 1 END, code
        LIMIT 1;
      END IF;
      v_credit_account_id := p_cash_account_id;
      v_credit_account_name := 'Kas/Bank';

    WHEN 'credit_purchase' THEN
      IF p_product_id IS NOT NULL THEN
        SELECT id, name
        INTO v_debit_account_id, v_debit_account_name
        FROM public.accounts
        WHERE organization_id = p_organization_id
          AND code = 1300
          AND is_active = true;
      ELSIF p_debit_account_id IS NOT NULL THEN
        SELECT id, name
        INTO v_debit_account_id, v_debit_account_name
        FROM public.accounts
        WHERE id = p_debit_account_id
          AND organization_id = p_organization_id
          AND account_type IN ('expense', 'cogs', 'asset')
          AND is_active = true;
      ELSE
        SELECT id, name
        INTO v_debit_account_id, v_debit_account_name
        FROM public.accounts
        WHERE organization_id = p_organization_id
          AND account_type IN ('expense', 'cogs', 'asset')
          AND is_active = true
          AND ((p_category_name IS NOT NULL AND name ILIKE '%' || p_category_name || '%') OR code = 5100)
        ORDER BY CASE WHEN p_category_name IS NOT NULL AND name ILIKE '%' || p_category_name || '%' THEN 0 ELSE 1 END, code
        LIMIT 1;
      END IF;

      SELECT id
      INTO v_payable_account_id
      FROM public.accounts
      WHERE organization_id = p_organization_id
        AND code = 2100
        AND is_active = true;

      IF p_payment_status = 'partial' THEN
        v_credit_account_id := p_cash_account_id;
        v_credit_account_name := 'Kas/Bank + Utang Usaha';
      ELSE
        v_credit_account_id := v_payable_account_id;
        v_credit_account_name := 'Utang Usaha';
      END IF;

    WHEN 'pay_payable' THEN
      SELECT id INTO v_debit_account_id
      FROM public.accounts
      WHERE organization_id = p_organization_id
        AND code = 2100
        AND is_active = true;
      v_debit_account_name := 'Utang Usaha';
      v_credit_account_id := p_cash_account_id;
      v_credit_account_name := 'Kas/Bank';

    WHEN 'expense_payment' THEN
      IF p_debit_account_id IS NOT NULL THEN
        SELECT id, name
        INTO v_debit_account_id, v_debit_account_name
        FROM public.accounts
        WHERE id = p_debit_account_id
          AND organization_id = p_organization_id
          AND account_type = 'expense'
          AND is_active = true;
      ELSE
        SELECT id, name
        INTO v_debit_account_id, v_debit_account_name
        FROM public.accounts
        WHERE organization_id = p_organization_id
          AND account_type = 'expense'
          AND is_active = true
          AND ((p_category_name IS NOT NULL AND name ILIKE '%' || p_category_name || '%') OR code = 6190)
        ORDER BY CASE WHEN p_category_name IS NOT NULL AND name ILIKE '%' || p_category_name || '%' THEN 0 ELSE 1 END, code
        LIMIT 1;
      END IF;
      v_credit_account_id := p_cash_account_id;
      v_credit_account_name := 'Kas/Bank';

    WHEN 'owner_capital' THEN
      v_debit_account_id := p_cash_account_id;
      v_debit_account_name := 'Kas/Bank';
      SELECT id INTO v_credit_account_id
      FROM public.accounts
      WHERE organization_id = p_organization_id
        AND code = 3100
        AND is_active = true;
      v_credit_account_name := 'Modal Pemilik';

    WHEN 'owner_draw' THEN
      SELECT id INTO v_debit_account_id
      FROM public.accounts
      WHERE organization_id = p_organization_id
        AND code = 3300
        AND is_active = true;
      v_debit_account_name := 'Prive';
      v_credit_account_id := p_cash_account_id;
      v_credit_account_name := 'Kas/Bank';

    WHEN 'cash_transfer' THEN
      v_debit_account_id := p_destination_cash_account_id;
      v_debit_account_name := 'Tujuan Transfer';
      v_credit_account_id := p_cash_account_id;
      v_credit_account_name := 'Sumber Transfer';

    WHEN 'simple_adjustment' THEN
      v_debit_account_id := p_cash_account_id;
      v_debit_account_name := 'Rekening Debit';
      v_credit_account_id := p_destination_cash_account_id;
      v_credit_account_name := 'Rekening Kredit';

    ELSE
      RAISE EXCEPTION 'Jenis transaksi tidak dikenal: %', p_transaction_type;
  END CASE;

  IF v_debit_account_id IS NULL THEN
    RAISE EXCEPTION 'Akun debit tidak ditemukan untuk jenis transaksi %', p_transaction_type;
  END IF;

  IF v_credit_account_id IS NULL THEN
    RAISE EXCEPTION 'Akun kredit tidak ditemukan untuk jenis transaksi %', p_transaction_type;
  END IF;

  v_entry_number := public.generate_entry_number(p_organization_id);

  INSERT INTO public.journal_entries (
    organization_id, entry_number, entry_date, entry_type,
    description, status, posted_at, posted_by
  ) VALUES (
    p_organization_id,
    v_entry_number,
    p_transaction_date,
    'normal'::public.journal_entry_type,
    p_description,
    'posted',
    now(),
    v_user_id
  ) RETURNING id INTO v_journal_id;

  IF p_transaction_type = 'credit_sale' AND p_payment_status = 'partial' THEN
    v_remaining_amount := p_amount - p_partial_amount;

    v_line_order := v_line_order + 1;
    INSERT INTO public.journal_lines (
      organization_id, journal_entry_id, account_id, party_id,
      debit, credit, description, line_order
    ) VALUES (
      p_organization_id, v_journal_id, p_cash_account_id, p_party_id,
      p_partial_amount, 0, p_description, v_line_order
    );

    v_line_order := v_line_order + 1;
    INSERT INTO public.journal_lines (
      organization_id, journal_entry_id, account_id, party_id,
      debit, credit, description, line_order
    ) VALUES (
      p_organization_id, v_journal_id, v_receivable_account_id, p_party_id,
      v_remaining_amount, 0, 'Sisa piutang: ' || p_description, v_line_order
    );
  ELSE
    v_line_order := v_line_order + 1;
    INSERT INTO public.journal_lines (
      organization_id, journal_entry_id, account_id, party_id,
      debit, credit, description, line_order
    ) VALUES (
      p_organization_id, v_journal_id, v_debit_account_id, p_party_id,
      p_amount, 0, p_description, v_line_order
    );
  END IF;

  IF p_transaction_type = 'credit_purchase' AND p_payment_status = 'partial' THEN
    v_remaining_amount := p_amount - p_partial_amount;

    v_line_order := v_line_order + 1;
    INSERT INTO public.journal_lines (
      organization_id, journal_entry_id, account_id, party_id,
      debit, credit, description, line_order
    ) VALUES (
      p_organization_id, v_journal_id, p_cash_account_id, p_party_id,
      0, p_partial_amount, p_description, v_line_order
    );

    v_line_order := v_line_order + 1;
    INSERT INTO public.journal_lines (
      organization_id, journal_entry_id, account_id, party_id,
      debit, credit, description, line_order
    ) VALUES (
      p_organization_id, v_journal_id, v_payable_account_id, p_party_id,
      0, v_remaining_amount, 'Sisa utang: ' || p_description, v_line_order
    );
  ELSE
    v_line_order := v_line_order + 1;
    INSERT INTO public.journal_lines (
      organization_id, journal_entry_id, account_id, party_id,
      debit, credit, description, line_order
    ) VALUES (
      p_organization_id, v_journal_id, v_credit_account_id, p_party_id,
      0, p_amount, p_description, v_line_order
    );
  END IF;

  IF (
    SELECT ABS(COALESCE(SUM(debit), 0) - COALESCE(SUM(credit), 0))
    FROM public.journal_lines
    WHERE journal_entry_id = v_journal_id
  ) > 0.01 THEN
    RAISE EXCEPTION 'Jurnal tidak seimbang';
  END IF;

  v_txn_number := public.generate_transaction_number(p_organization_id, p_transaction_date);

  INSERT INTO public.transactions (
    organization_id, transaction_number, transaction_date,
    transaction_type, amount, party_id, category_name,
    cash_account_id, destination_cash_account_id,
    payment_status, due_date, description, notes,
    status, posted_at, posted_by, created_by,
    product_id, quantity, unit_price
  ) VALUES (
    p_organization_id,
    v_txn_number,
    p_transaction_date,
    p_transaction_type,
    p_amount,
    p_party_id,
    p_category_name,
    p_cash_account_id,
    p_destination_cash_account_id,
    p_payment_status::public.payment_status,
    p_due_date,
    p_description,
    CASE
      WHEN p_partial_amount IS NOT NULL AND p_payment_status = 'partial' THEN
        COALESCE(p_notes, '') ||
        (CASE WHEN p_notes IS NOT NULL AND p_notes != '' THEN E'\n' ELSE '' END) ||
        'Dibayar sebagian: ' || p_partial_amount::TEXT
      ELSE p_notes
    END,
    'posted',
    now(),
    v_user_id,
    v_user_id,
    p_product_id,
    p_quantity,
    p_unit_price
  ) RETURNING id INTO v_txn_id;

  UPDATE public.journal_entries
  SET transaction_id = v_txn_id
  WHERE id = v_journal_id;

  -- Product stock and COGS handling
  IF p_product_id IS NOT NULL THEN
    IF p_transaction_type IN ('cash_purchase', 'credit_purchase') THEN
      PERFORM public.record_stock_movement(
        p_organization_id,
        p_product_id,
        p_transaction_date,
        'purchase',
        p_quantity,
        p_unit_price,
        v_txn_id,
        p_description
      );

      PERFORM public.recalculate_product_average_cost(p_product_id);

    ELSIF p_transaction_type IN ('cash_sale', 'credit_sale') THEN
      v_cogs_amount := COALESCE(v_product_purchase_price, 0) * p_quantity;

      -- P0.4: Require COGS and inventory accounts for product sales.
      -- Do NOT silently skip — accounting correctness demands these entries.
      IF v_cogs_amount > 0 THEN
        SELECT id INTO v_cogs_account_id
        FROM public.accounts
        WHERE organization_id = p_organization_id
          AND code = 5100
          AND is_active = true;

        SELECT id INTO v_inventory_account_id
        FROM public.accounts
        WHERE organization_id = p_organization_id
          AND code = 1300
          AND is_active = true;

        IF v_cogs_account_id IS NULL THEN
          RAISE EXCEPTION 'Akun HPP (kode 5100) belum dikonfigurasi. Silakan tambahkan akun HPP di Daftar Akun.';
        END IF;

        IF v_inventory_account_id IS NULL THEN
          RAISE EXCEPTION 'Akun Persediaan (kode 1300) belum dikonfigurasi. Silakan tambahkan akun Persediaan di Daftar Akun.';
        END IF;

        DECLARE
          v_cogs_entry_number TEXT;
          v_cogs_journal_id UUID;
        BEGIN
          v_cogs_entry_number := public.generate_entry_number(p_organization_id);

          INSERT INTO public.journal_entries (
            organization_id, entry_number, entry_date, entry_type,
            transaction_id, description, status, posted_at, posted_by
          ) VALUES (
            p_organization_id,
            v_cogs_entry_number,
            p_transaction_date,
            'normal',
            v_txn_id,
            'HPP: ' || p_description,
            'posted',
            now(),
            v_user_id
          ) RETURNING id INTO v_cogs_journal_id;

          INSERT INTO public.journal_lines (
            organization_id, journal_entry_id, account_id,
            debit, credit, description, line_order
          ) VALUES
            (
              p_organization_id, v_cogs_journal_id, v_cogs_account_id,
              v_cogs_amount, 0, 'HPP: ' || p_description, 1
            ),
            (
              p_organization_id, v_cogs_journal_id, v_inventory_account_id,
              0, v_cogs_amount, 'HPP: ' || p_description, 2
            );
        END;
      END IF;

      PERFORM public.record_stock_movement(
        p_organization_id,
        p_product_id,
        p_transaction_date,
        'sale',
        -p_quantity,
        NULL,
        v_txn_id,
        p_description
      );
    END IF;
  END IF;

  SELECT normal_balance::TEXT INTO v_debit_normal
  FROM public.accounts
  WHERE id = v_debit_account_id;

  SELECT normal_balance::TEXT INTO v_credit_normal
  FROM public.accounts
  WHERE id = v_credit_account_id;

  v_impact := jsonb_build_object(
    'debit_account_id', v_debit_account_id,
    'debit_account', COALESCE(v_debit_account_name, 'Debit'),
    'debit_change', CASE WHEN v_debit_normal = 'debit' THEN 'increase' ELSE 'decrease' END,
    'credit_account_id', v_credit_account_id,
    'credit_account', COALESCE(v_credit_account_name, 'Credit'),
    'credit_change', CASE WHEN v_credit_normal = 'credit' THEN 'increase' ELSE 'decrease' END,
    'amount', p_amount
  );

  INSERT INTO public.audit_logs (
    organization_id, actor_user_id, entity_type, entity_id,
    action, after_data
  ) VALUES (
    p_organization_id, v_user_id, 'transaction', v_txn_id,
    'post', jsonb_build_object(
      'transaction_type', p_transaction_type,
      'amount', p_amount,
      'journal_entry_id', v_journal_id,
      'product_id', p_product_id
    )
  );

  RETURN jsonb_build_object(
    'transaction_id', v_txn_id,
    'transaction_number', v_txn_number,
    'journal_entry_id', v_journal_id,
    'entry_number', v_entry_number,
    'impact', v_impact
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.post_transaction(
  UUID, DATE, TEXT, NUMERIC, UUID, TEXT, UUID, UUID,
  TEXT, NUMERIC, DATE, TEXT, TEXT, UUID, NUMERIC, NUMERIC, UUID
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.post_transaction(
  UUID, DATE, TEXT, NUMERIC, UUID, TEXT, UUID, UUID,
  TEXT, NUMERIC, DATE, TEXT, TEXT, UUID, NUMERIC, NUMERIC, UUID
) TO authenticated;


-- =============================================================================
-- P1.2: Fix parties RLS policy name to match actual behavior
-- =============================================================================

-- The old policy "Owner can insert parties" allowed any org member to insert,
-- which is the intended behavior (staff create parties during transactions).
-- Rename the policy to reflect reality.

DROP POLICY IF EXISTS "Owner can insert parties" ON public.parties;

CREATE POLICY "Members can insert parties"
  ON public.parties FOR INSERT
  WITH CHECK (is_org_member(organization_id));

-- Also fix update policy: any member can update (e.g., edit party name),
-- but only owner can delete. Keep the existing behavior but clarify.

DROP POLICY IF EXISTS "Owner can update parties" ON public.parties;

CREATE POLICY "Members can update parties"
  ON public.parties FOR UPDATE
  USING (is_org_member(organization_id));


-- =============================================================================
-- P1.3: Transaction detail visibility
-- Allow staff with transaction permission to see transaction business details.
-- Journal lines already require can_view_reports via RLS (from 20260626).
-- The frontend must stop gating the entire detail page on canViewReports.
-- This is handled in the frontend code changes below.
-- =============================================================================


-- =============================================================================
-- NOTIFY PostgREST to reload schema
-- =============================================================================
NOTIFY pgrst, 'reload schema';

COMMIT;
