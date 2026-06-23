-- =============================================================================
-- LEDJER — Harden RLS + Reject Opening Balances from General Transaction RPC
-- =============================================================================
-- Phase 3: Drop direct INSERT/UPDATE/DELETE on financial tables for clients
-- Phase 4: Reject opening_* transaction types from post_transaction
-- =============================================================================

BEGIN;

-- ═══════════════════════════════════════════════════════════════════
--  PHASE 3: HARDEN RLS ON FINANCIAL TABLES
-- ═══════════════════════════════════════════════════════════════════

-- 3.1: transactions — DROP direct INSERT/UPDATE/DELETE for clients
-- All financial mutations must go through SECURITY DEFINER RPCs.
-- Members can SELECT transactions for their organization only.

DROP POLICY IF EXISTS "Members can insert transactions" ON public.transactions;
DROP POLICY IF EXISTS "Owner can update transactions" ON public.transactions;

-- Keep SELECT policy (members can read their org's transactions)
-- No INSERT policy → direct INSERT rejected
-- No UPDATE policy → direct UPDATE rejected
-- No DELETE policy → direct DELETE rejected

-- 3.2: journal_entries — already read-only (SELECT only), verify no INSERT policy
DROP POLICY IF EXISTS "Members can insert journal entries" ON public.journal_entries;
DROP POLICY IF EXISTS "Owner can update journal entries" ON public.journal_entries;

-- 3.3: journal_lines — already read-only (SELECT only), verify no INSERT policy
DROP POLICY IF EXISTS "Members can insert journal lines" ON public.journal_lines;
DROP POLICY IF EXISTS "Owner can update journal lines" ON public.journal_lines;

-- 3.4: stock_movements — DROP direct INSERT for clients
-- Stock movements are created only by SECURITY DEFINER functions (record_stock_movement)
DROP POLICY IF EXISTS "System can insert stock movements" ON public.stock_movements;
DROP POLICY IF EXISTS "Members can insert stock movements" ON public.stock_movements;
DROP POLICY IF EXISTS "Members can update stock movements" ON public.stock_movements;

-- Keep SELECT policy for members

-- 3.5: audit_logs — DROP direct INSERT for clients
-- Audit logs are created only by SECURITY DEFINER functions
DROP POLICY IF EXISTS "Members can insert audit logs" ON public.audit_logs;
DROP POLICY IF EXISTS "Owner can insert audit logs" ON public.audit_logs;

-- Keep SELECT policy (owner only)

-- ═══════════════════════════════════════════════════════════════════
--  PHASE 4: REJECT OPENING BALANCE TYPES FROM GENERAL post_transaction
-- ═══════════════════════════════════════════════════════════════════

-- Update the canonical post_transaction to add early guard rejecting opening_* types.
-- We recreate the full function since PostgreSQL doesn't support partial body edits.

DROP FUNCTION IF EXISTS public.post_transaction(
  UUID, DATE, TEXT, NUMERIC, UUID, TEXT, UUID, UUID,
  TEXT, NUMERIC, DATE, TEXT, TEXT, UUID, NUMERIC, NUMERIC, UUID
);

CREATE OR REPLACE FUNCTION public.post_transaction(
  p_organization_id              UUID,
  p_transaction_date             DATE,
  p_transaction_type             TEXT,
  p_amount                       NUMERIC,
  p_party_id                     UUID     DEFAULT NULL,
  p_category_name                TEXT     DEFAULT NULL,
  p_cash_account_id              UUID     DEFAULT NULL,
  p_destination_cash_account_id  UUID     DEFAULT NULL,
  p_payment_status               TEXT     DEFAULT 'paid',
  p_partial_amount               NUMERIC  DEFAULT NULL,
  p_due_date                     DATE     DEFAULT NULL,
  p_description                  TEXT     DEFAULT '',
  p_notes                        TEXT     DEFAULT NULL,
  p_product_id                   UUID     DEFAULT NULL,
  p_quantity                     NUMERIC  DEFAULT NULL,
  p_unit_price                   NUMERIC  DEFAULT NULL,
  p_debit_account_id             UUID     DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id            UUID;
  v_role               TEXT;
  v_plan               TEXT;
  v_txn_count          INTEGER;
  v_books_start_date   DATE;
  v_account_type       TEXT;
  v_is_cash_account    BOOLEAN;
  v_debit_account_id   UUID;
  v_credit_account_id  UUID;
  v_receivable_acct_id UUID;
  v_payable_acct_id    UUID;
  v_debit_account_name TEXT;
  v_credit_account_name TEXT;
  v_debit_normal       TEXT;
  v_credit_normal      TEXT;
  v_journal_id         UUID;
  v_transaction_id     UUID;
  v_txn_number         TEXT;
  v_entry_number       TEXT;
  v_impact             JSONB := '{}'::JSONB;
  v_line_order         INTEGER := 0;
  v_remaining_amount   NUMERIC;
  v_product_org_id     UUID;
  v_product_purchase_price NUMERIC;
  v_cogs_account_id    UUID;
  v_inventory_account_id UUID;
  v_cogs_amount        NUMERIC;
BEGIN
  -- ── Auth ──
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Autentikasi diperlukan';
  END IF;

  -- ── Membership ──
  SELECT role::TEXT INTO v_role
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

  -- ═══════════════════════════════════════════════════════════════════
  --  PHASE 4 GUARD: Reject opening balance types
  --  Opening balances must go through post_opening_balance or
  --  create_organization_with_opening_balances only.
  -- ═══════════════════════════════════════════════════════════════════
  IF p_transaction_type IN (
    'opening_cash_balance',
    'opening_receivable_balance',
    'opening_payable_balance'
  ) THEN
    RAISE EXCEPTION 'Saldo awal tidak dapat dicatat melalui transaksi umum. Gunakan alur pemasangan saldo awal.';
  END IF;

  -- ── Org metadata ──
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

  -- ── Plan limits ──
  IF v_plan = 'free' THEN
    v_txn_count := public.get_monthly_transaction_count(p_organization_id);
    IF v_txn_count >= 50 THEN
      RAISE EXCEPTION 'Batas transaksi paket Gratis tercapai (50 transaksi/bulan). Silakan upgrade.';
    END IF;
  END IF;

  -- ── Basic validation ──
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

  -- ── Party validation ──
  IF p_transaction_type IN ('credit_sale', 'credit_purchase', 'receive_receivable', 'pay_payable')
     AND p_party_id IS NULL THEN
    RAISE EXCEPTION 'Pihak wajib dipilih untuk transaksi tipe %', p_transaction_type;
  END IF;

  IF p_party_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.parties
    WHERE id = p_party_id
      AND organization_id = p_organization_id
      AND is_active = true
  ) THEN
    RAISE EXCEPTION 'Pihak tidak ditemukan atau tidak aktif';
  END IF;

  -- ── Product validation ──
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

    -- Validate COGS/inventory accounts for product sales BEFORE posting anything
    IF p_transaction_type IN ('cash_sale', 'credit_sale') THEN
      PERFORM public.validate_product_sale_accounts(p_organization_id, p_product_id);
    END IF;
  END IF;

  -- ── Cash account required for certain types ──
  IF p_transaction_type IN (
    'cash_sale', 'receive_receivable', 'cash_purchase', 'pay_payable',
    'expense_payment', 'owner_capital', 'owner_draw', 'cash_transfer'
  ) AND p_cash_account_id IS NULL THEN
    RAISE EXCEPTION 'Akun kas/bank wajib diisi untuk transaksi tipe %', p_transaction_type;
  END IF;

  -- ── Cash account validation ──
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

  -- ── Destination account validation ──
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
  END IF;

  -- ═══════════════════════════════════════════════════════════════════
  --  ACCOUNT RESOLUTION PER TRANSACTION TYPE
  --  P0.1 FIX: pay_payable direction corrected
  -- ═══════════════════════════════════════════════════════════════════

  CASE p_transaction_type
    WHEN 'cash_sale' THEN
      v_debit_account_id   := p_cash_account_id;
      v_debit_account_name := 'Kas/Bank';
      SELECT id, name INTO v_credit_account_id, v_credit_account_name
      FROM public.accounts
      WHERE organization_id = p_organization_id
        AND account_type = 'revenue'
        AND is_active = true
        AND ((p_category_name IS NOT NULL AND name ILIKE '%' || p_category_name || '%') OR code = 4100)
      ORDER BY CASE WHEN p_category_name IS NOT NULL AND name ILIKE '%' || p_category_name || '%' THEN 0 ELSE 1 END, code
      LIMIT 1;

    WHEN 'credit_sale' THEN
      SELECT id INTO v_receivable_acct_id
      FROM public.accounts
      WHERE organization_id = p_organization_id AND code = 1200 AND is_active = true;

      IF p_payment_status = 'partial' THEN
        v_debit_account_id   := p_cash_account_id;
        v_debit_account_name := 'Kas/Bank + Piutang Usaha';
      ELSE
        v_debit_account_id   := v_receivable_acct_id;
        v_debit_account_name := 'Piutang Usaha';
      END IF;

      SELECT id, name INTO v_credit_account_id, v_credit_account_name
      FROM public.accounts
      WHERE organization_id = p_organization_id
        AND account_type = 'revenue'
        AND is_active = true
        AND ((p_category_name IS NOT NULL AND name ILIKE '%' || p_category_name || '%') OR code = 4100)
      ORDER BY CASE WHEN p_category_name IS NOT NULL AND name ILIKE '%' || p_category_name || '%' THEN 0 ELSE 1 END, code
      LIMIT 1;

    WHEN 'receive_receivable' THEN
      v_debit_account_id   := p_cash_account_id;
      v_debit_account_name := 'Kas/Bank';
      SELECT id INTO v_credit_account_id
      FROM public.accounts
      WHERE organization_id = p_organization_id AND code = 1200 AND is_active = true;
      v_credit_account_name := 'Piutang Usaha';

    WHEN 'cash_purchase' THEN
      IF p_product_id IS NOT NULL THEN
        SELECT id, name INTO v_debit_account_id, v_debit_account_name
        FROM public.accounts
        WHERE organization_id = p_organization_id AND code = 1300 AND is_active = true;
      ELSIF p_debit_account_id IS NOT NULL THEN
        SELECT id, name INTO v_debit_account_id, v_debit_account_name
        FROM public.accounts
        WHERE id = p_debit_account_id
          AND organization_id = p_organization_id
          AND account_type IN ('expense', 'cogs', 'asset')
          AND is_active = true;
      ELSE
        SELECT id, name INTO v_debit_account_id, v_debit_account_name
        FROM public.accounts
        WHERE organization_id = p_organization_id
          AND account_type IN ('expense', 'cogs', 'asset')
          AND is_active = true
          AND ((p_category_name IS NOT NULL AND name ILIKE '%' || p_category_name || '%') OR code = 5100)
        ORDER BY CASE WHEN p_category_name IS NOT NULL AND name ILIKE '%' || p_category_name || '%' THEN 0 ELSE 1 END, code
        LIMIT 1;
      END IF;
      v_credit_account_id   := p_cash_account_id;
      v_credit_account_name := 'Kas/Bank';

    WHEN 'credit_purchase' THEN
      IF p_product_id IS NOT NULL THEN
        SELECT id, name INTO v_debit_account_id, v_debit_account_name
        FROM public.accounts
        WHERE organization_id = p_organization_id AND code = 1300 AND is_active = true;
      ELSIF p_debit_account_id IS NOT NULL THEN
        SELECT id, name INTO v_debit_account_id, v_debit_account_name
        FROM public.accounts
        WHERE id = p_debit_account_id
          AND organization_id = p_organization_id
          AND account_type IN ('expense', 'cogs', 'asset')
          AND is_active = true;
      ELSE
        SELECT id, name INTO v_debit_account_id, v_debit_account_name
        FROM public.accounts
        WHERE organization_id = p_organization_id
          AND account_type IN ('expense', 'cogs', 'asset')
          AND is_active = true
          AND ((p_category_name IS NOT NULL AND name ILIKE '%' || p_category_name || '%') OR code = 5100)
        ORDER BY CASE WHEN p_category_name IS NOT NULL AND name ILIKE '%' || p_category_name || '%' THEN 0 ELSE 1 END, code
        LIMIT 1;
      END IF;

      SELECT id INTO v_payable_acct_id
      FROM public.accounts
      WHERE organization_id = p_organization_id AND code = 2100 AND is_active = true;

      IF p_payment_status = 'partial' THEN
        v_credit_account_id   := p_cash_account_id;
        v_credit_account_name := 'Kas/Bank + Utang Usaha';
      ELSE
        v_credit_account_id   := v_payable_acct_id;
        v_credit_account_name := 'Utang Usaha';
      END IF;

    -- P0.1 FIX: pay_payable — Debit Utang, Credit Kas
    WHEN 'pay_payable' THEN
      SELECT id INTO v_debit_account_id
      FROM public.accounts
      WHERE organization_id = p_organization_id AND code = 2100 AND is_active = true;
      v_debit_account_name  := 'Utang Usaha';
      v_credit_account_id   := p_cash_account_id;
      v_credit_account_name := 'Kas/Bank';

    WHEN 'expense_payment' THEN
      IF p_debit_account_id IS NOT NULL THEN
        SELECT id, name INTO v_debit_account_id, v_debit_account_name
        FROM public.accounts
        WHERE id = p_debit_account_id
          AND organization_id = p_organization_id
          AND account_type = 'expense'
          AND is_active = true;
      ELSE
        SELECT id, name INTO v_debit_account_id, v_debit_account_name
        FROM public.accounts
        WHERE organization_id = p_organization_id
          AND account_type = 'expense'
          AND is_active = true
          AND ((p_category_name IS NOT NULL AND name ILIKE '%' || p_category_name || '%') OR code = 6190)
        ORDER BY CASE WHEN p_category_name IS NOT NULL AND name ILIKE '%' || p_category_name || '%' THEN 0 ELSE 1 END, code
        LIMIT 1;
      END IF;
      v_credit_account_id   := p_cash_account_id;
      v_credit_account_name := 'Kas/Bank';

    WHEN 'owner_capital' THEN
      v_debit_account_id   := p_cash_account_id;
      v_debit_account_name := 'Kas/Bank';
      SELECT id INTO v_credit_account_id
      FROM public.accounts
      WHERE organization_id = p_organization_id AND code = 3100 AND is_active = true;
      v_credit_account_name := 'Modal Pemilik';

    WHEN 'owner_draw' THEN
      SELECT id INTO v_debit_account_id
      FROM public.accounts
      WHERE organization_id = p_organization_id AND code = 3300 AND is_active = true;
      v_debit_account_name  := 'Prive';
      v_credit_account_id   := p_cash_account_id;
      v_credit_account_name := 'Kas/Bank';

    WHEN 'cash_transfer' THEN
      v_debit_account_id   := p_destination_cash_account_id;
      v_debit_account_name := 'Tujuan Transfer';
      v_credit_account_id   := p_cash_account_id;
      v_credit_account_name := 'Sumber Transfer';

    WHEN 'simple_adjustment' THEN
      v_debit_account_id   := p_cash_account_id;
      v_debit_account_name := 'Rekening Debit';
      v_credit_account_id   := p_destination_cash_account_id;
      v_credit_account_name := 'Rekening Kredit';

    ELSE
      RAISE EXCEPTION 'Jenis transaksi tidak dikenal: %', p_transaction_type;
  END CASE;

  -- ── Account existence check ──
  IF v_debit_account_id IS NULL THEN
    RAISE EXCEPTION 'Akun debit tidak ditemukan untuk jenis transaksi %', p_transaction_type;
  END IF;
  IF v_credit_account_id IS NULL THEN
    RAISE EXCEPTION 'Akun kredit tidak ditemukan untuk jenis transaksi %', p_transaction_type;
  END IF;

  -- ═══════════════════════════════════════════════════════════════════
  --  JOURNAL ENTRY + LINES (inserted atomically)
  -- ═══════════════════════════════════════════════════════════════════

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

  -- ── Credit-sale partial: split into cash + receivable ──
  IF p_transaction_type = 'credit_sale' AND p_payment_status = 'partial' THEN
    v_remaining_amount := p_amount - p_partial_amount;
    v_line_order := v_line_order + 1;
    INSERT INTO public.journal_lines (organization_id, journal_entry_id, account_id, party_id, debit, credit, description, line_order)
    VALUES (p_organization_id, v_journal_id, p_cash_account_id, p_party_id, p_partial_amount, 0, p_description, v_line_order);
    v_line_order := v_line_order + 1;
    INSERT INTO public.journal_lines (organization_id, journal_entry_id, account_id, party_id, debit, credit, description, line_order)
    VALUES (p_organization_id, v_journal_id, v_receivable_acct_id, p_party_id, v_remaining_amount, 0, 'Sisa piutang: ' || p_description, v_line_order);
  ELSE
    v_line_order := v_line_order + 1;
    INSERT INTO public.journal_lines (organization_id, journal_entry_id, account_id, party_id, debit, credit, description, line_order)
    VALUES (p_organization_id, v_journal_id, v_debit_account_id, p_party_id, p_amount, 0, p_description, v_line_order);
  END IF;

  -- ── Credit-purchase partial: split into cash + payable ──
  IF p_transaction_type = 'credit_purchase' AND p_payment_status = 'partial' THEN
    v_remaining_amount := p_amount - p_partial_amount;
    v_line_order := v_line_order + 1;
    INSERT INTO public.journal_lines (organization_id, journal_entry_id, account_id, party_id, debit, credit, description, line_order)
    VALUES (p_organization_id, v_journal_id, p_cash_account_id, p_party_id, 0, p_partial_amount, p_description, v_line_order);
    v_line_order := v_line_order + 1;
    INSERT INTO public.journal_lines (organization_id, journal_entry_id, account_id, party_id, debit, credit, description, line_order)
    VALUES (p_organization_id, v_journal_id, v_payable_acct_id, p_party_id, 0, v_remaining_amount, 'Sisa utang: ' || p_description, v_line_order);
  ELSE
    v_line_order := v_line_order + 1;
    INSERT INTO public.journal_lines (organization_id, journal_entry_id, account_id, party_id, debit, credit, description, line_order)
    VALUES (p_organization_id, v_journal_id, v_credit_account_id, p_party_id, 0, p_amount, p_description, v_line_order);
  END IF;

  -- ── Journal balance check ──
  IF (
    SELECT ABS(COALESCE(SUM(debit), 0) - COALESCE(SUM(credit), 0))
    FROM public.journal_lines
    WHERE journal_entry_id = v_journal_id
  ) > 0.01 THEN
    RAISE EXCEPTION 'Jurnal tidak seimbang';
  END IF;

  -- ═══════════════════════════════════════════════════════════════════
  --  TRANSACTION RECORD
  -- ═══════════════════════════════════════════════════════════════════

  v_txn_number := public.generate_transaction_number(p_organization_id, p_transaction_date);

  INSERT INTO public.transactions (
    organization_id, transaction_number, transaction_date,
    transaction_type, amount, party_id, category_name,
    cash_account_id, destination_cash_account_id,
    payment_status, due_date, description, notes,
    status, posted_at, posted_by, created_by,
    product_id, quantity, unit_price
  ) VALUES (
    p_organization_id, v_txn_number, p_transaction_date,
    p_transaction_type, p_amount, p_party_id, p_category_name,
    p_cash_account_id, p_destination_cash_account_id,
    p_payment_status::public.payment_status, p_due_date,
    p_description,
    CASE
      WHEN p_partial_amount IS NOT NULL AND p_payment_status = 'partial' THEN
        COALESCE(p_notes, '') ||
        (CASE WHEN p_notes IS NOT NULL AND p_notes != '' THEN E'\n' ELSE '' END) ||
        'Dibayar sebagian: ' || p_partial_amount::TEXT
      ELSE p_notes
    END,
    'posted', now(), v_user_id, v_user_id,
    p_product_id, p_quantity, p_unit_price
  ) RETURNING id, transaction_number INTO v_transaction_id, v_txn_number;

  -- Link journal to transaction
  UPDATE public.journal_entries
  SET transaction_id = v_transaction_id
  WHERE id = v_journal_id;

  -- ═══════════════════════════════════════════════════════════════════
  --  PRODUCT: STOCK MOVEMENTS + COGS
  -- ═══════════════════════════════════════════════════════════════════

  IF p_product_id IS NOT NULL THEN
    IF p_transaction_type IN ('cash_purchase', 'credit_purchase') THEN
      -- Product purchase → stock in
      PERFORM public.record_stock_movement(
        p_organization_id, p_product_id, p_transaction_date,
        'purchase', p_quantity, p_unit_price,
        v_transaction_id,
        p_description
      );
      PERFORM public.recalculate_product_average_cost(p_product_id);

    ELSIF p_transaction_type IN ('cash_sale', 'credit_sale') THEN
      v_cogs_amount := COALESCE(v_product_purchase_price, 0) * p_quantity;

      IF v_cogs_amount > 0 THEN
        v_cogs_account_id    := public.get_account_by_code(p_organization_id, 5100);
        v_inventory_account_id := public.get_account_by_code(p_organization_id, 1300);

        DECLARE
          v_cogs_entry_number TEXT;
          v_cogs_journal_id   UUID;
        BEGIN
          v_cogs_entry_number := public.generate_entry_number(p_organization_id);
          INSERT INTO public.journal_entries (
            organization_id, entry_number, entry_date, entry_type,
            transaction_id, description, status, posted_at, posted_by
          ) VALUES (
            p_organization_id, v_cogs_entry_number, p_transaction_date, 'normal',
            v_transaction_id, 'HPP: ' || p_description, 'posted', now(), v_user_id
          ) RETURNING id INTO v_cogs_journal_id;

          INSERT INTO public.journal_lines (
            organization_id, journal_entry_id, account_id,
            debit, credit, description, line_order
          ) VALUES
            (p_organization_id, v_cogs_journal_id, v_cogs_account_id,
             v_cogs_amount, 0, 'HPP: ' || p_description, 1),
            (p_organization_id, v_cogs_journal_id, v_inventory_account_id,
             0, v_cogs_amount, 'HPP: ' || p_description, 2);
        END;
      END IF;

      -- Product sale → stock out
      PERFORM public.record_stock_movement(
        p_organization_id, p_product_id, p_transaction_date,
        'sale', -p_quantity, NULL,
        v_transaction_id,
        p_description
      );
    END IF;
  END IF;

  -- ═══════════════════════════════════════════════════════════════════
  --  IMPACT + AUDIT + RETURN
  -- ═══════════════════════════════════════════════════════════════════

  SELECT normal_balance::TEXT INTO v_debit_normal
  FROM public.accounts WHERE id = v_debit_account_id;
  SELECT normal_balance::TEXT INTO v_credit_normal
  FROM public.accounts WHERE id = v_credit_account_id;

  v_impact := jsonb_build_object(
    'debit_account_id',  v_debit_account_id,
    'debit_account',     COALESCE(v_debit_account_name, 'Debit'),
    'debit_change',      CASE WHEN v_debit_normal = 'debit' THEN 'increase' ELSE 'decrease' END,
    'credit_account_id', v_credit_account_id,
    'credit_account',    COALESCE(v_credit_account_name, 'Credit'),
    'credit_change',     CASE WHEN v_credit_normal = 'credit' THEN 'increase' ELSE 'decrease' END,
    'amount',            p_amount
  );

  INSERT INTO public.audit_logs (
    organization_id, actor_user_id, entity_type, entity_id,
    action, after_data
  ) VALUES (
    p_organization_id, v_user_id, 'transaction', v_transaction_id,
    'post', jsonb_build_object(
      'transaction_type', p_transaction_type,
      'amount',           p_amount,
      'journal_entry_id', v_journal_id,
      'product_id',       p_product_id
    )
  );

  RETURN jsonb_build_object(
    'transaction_id',     v_transaction_id,
    'transaction_number', v_txn_number,
    'journal_entry_id',   v_journal_id,
    'entry_number',       v_entry_number,
    'impact',             v_impact
  );
END;
$$;

-- Permissions
REVOKE EXECUTE ON FUNCTION public.post_transaction(
  UUID, DATE, TEXT, NUMERIC, UUID, TEXT, UUID, UUID,
  TEXT, NUMERIC, DATE, TEXT, TEXT, UUID, NUMERIC, NUMERIC, UUID
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.post_transaction(
  UUID, DATE, TEXT, NUMERIC, UUID, TEXT, UUID, UUID,
  TEXT, NUMERIC, DATE, TEXT, TEXT, UUID, NUMERIC, NUMERIC, UUID
) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
