-- ============================================================
-- LEDJER — P0 Critical Fixes
-- P0.1: Fix pay_payable journal direction (was REVERSED)
-- P0.2: Fix onboarding flow (in_progress → completed after balances)
-- ============================================================


-- ═══════════════════════════════════════════════════════════════════
--  P0.1: Fix pay_payable direction in canonical post_transaction
--
--  CURRENT (WRONG):
--    Debit:  Kas/Bank (cash increases)
--    Credit: Utang Usaha (liability increases)
--
--  CORRECT:
--    Debit:  Utang Usaha (liability DECREASES)
--    Credit: Kas/Bank (cash DECREASES)
-- ═══════════════════════════════════════════════════════════════════

-- We patch ONLY the pay_payable branch inside the canonical function.
-- Approach: recreate the full canonical function with the fix applied,
-- since PostgreSQL doesn't support partial function body edits.

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
    'expense_payment', 'owner_capital', 'owner_draw', 'cash_transfer',
    'opening_cash_balance'
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
    WHEN 'opening_cash_balance' THEN
      v_debit_account_id  := p_cash_account_id;
      v_credit_account_id := public.get_account_by_code(p_organization_id, 3200);
      v_debit_account_name  := 'Kas/Bank';
      v_credit_account_name := 'Saldo Awal';

    WHEN 'opening_receivable_balance' THEN
      v_debit_account_id  := public.get_account_by_code(p_organization_id, 1200);
      v_credit_account_id := public.get_account_by_code(p_organization_id, 3200);
      v_debit_account_name  := 'Piutang Usaha';
      v_credit_account_name := 'Saldo Awal';

    WHEN 'opening_payable_balance' THEN
      v_debit_account_id  := public.get_account_by_code(p_organization_id, 3200);
      v_credit_account_id := public.get_account_by_code(p_organization_id, 2100);
      v_debit_account_name  := 'Saldo Awal';
      v_credit_account_name := 'Utang Usaha';

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

    -- ═══════════════════════════════════════════════════════════════
    -- P0.1 FIX: pay_payable — Debit Utang, Credit Kas
    -- Paying a payable DECREASES liability (debit) and DECREASES cash (credit)
    -- ═══════════════════════════════════════════════════════════════
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
    CASE WHEN p_transaction_type LIKE 'opening_%'
         THEN 'opening_balance'::public.journal_entry_type
         ELSE 'normal'::public.journal_entry_type
    END,
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


-- ═══════════════════════════════════════════════════════════════════
--  P0.2: Fix onboarding flow
--  - create_organization_with_template: set onboarding_status = 'in_progress'
--  - create_organization_with_opening_balances: set 'completed' after all balances
-- ═══════════════════════════════════════════════════════════════════

-- P0.2a: create_organization_with_template → set in_progress
CREATE OR REPLACE FUNCTION public.create_organization_with_template(
  p_organization_name TEXT,
  p_business_type public.business_type,
  p_books_start_date DATE,
  p_default_cash_account_name TEXT DEFAULT 'Kas',
  p_opening_cash_balance NUMERIC DEFAULT 0
)
RETURNS JSONB AS $$
DECLARE
  v_org_id UUID;
  v_user_id UUID;
  v_accounts_created INTEGER;
  v_cash_account_id UUID;
  v_saldo_awal_id UUID;
  v_journal_id UUID;
  v_line_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- P0.2 FIX: Set onboarding_status = 'in_progress' (not 'completed')
  -- Will be set to 'completed' by create_organization_with_opening_balances
  INSERT INTO organizations (
    name, business_type, base_currency, books_start_date,
    onboarding_status, created_by
  ) VALUES (
    p_organization_name,
    p_business_type,
    'IDR',
    p_books_start_date,
    'in_progress',
    v_user_id
  ) RETURNING id INTO v_org_id;

  -- Create owner membership
  INSERT INTO organization_members (
    organization_id, user_id, role, status,
    can_create_transaction, can_view_reports, can_manage_accounts,
    can_void_transaction, can_view_audit_log,
    invited_by, joined_at
  ) VALUES (
    v_org_id, v_user_id, 'owner', 'active',
    true, true, true, true, true,
    v_user_id, now()
  );

  -- Create default chart of accounts
  v_accounts_created := public.create_default_accounts(v_org_id, p_organization_name);

  -- Find the selected cash/bank account
  SELECT id INTO v_cash_account_id
  FROM accounts
  WHERE organization_id = v_org_id
    AND name = p_default_cash_account_name
    AND account_type = 'asset'
  LIMIT 1;

  IF v_cash_account_id IS NULL THEN
    SELECT id INTO v_cash_account_id
    FROM accounts
    WHERE organization_id = v_org_id
      AND code = 1110
    LIMIT 1;
  END IF;

  -- Find Saldo Awal account
  SELECT id INTO v_saldo_awal_id
  FROM accounts
  WHERE organization_id = v_org_id
    AND code = 3200
  LIMIT 1;

  -- Post opening cash balance if > 0
  IF p_opening_cash_balance > 0 AND v_cash_account_id IS NOT NULL AND v_saldo_awal_id IS NOT NULL THEN
    INSERT INTO journal_entries (
      organization_id, entry_number, entry_date, entry_type,
      description, status, posted_at, posted_by
    ) VALUES (
      v_org_id,
      public.generate_entry_number(v_org_id),
      p_books_start_date,
      'opening_balance',
      'Saldo awal ' || p_default_cash_account_name,
      'posted',
      now(),
      v_user_id
    ) RETURNING id INTO v_journal_id;

    INSERT INTO journal_lines (
      organization_id, journal_entry_id, account_id,
      debit, credit, description, line_order
    ) VALUES (
      v_org_id, v_journal_id, v_cash_account_id,
      p_opening_cash_balance, 0,
      'Saldo awal ' || p_default_cash_account_name, 1
    );

    INSERT INTO journal_lines (
      organization_id, journal_entry_id, account_id,
      debit, credit, description, line_order
    ) VALUES (
      v_org_id, v_journal_id, v_saldo_awal_id,
      0, p_opening_cash_balance,
      'Saldo awal ' || p_default_cash_account_name, 2
    );

    INSERT INTO transactions (
      organization_id, transaction_number, transaction_date,
      transaction_type, amount, cash_account_id,
      description, status, posted_at, posted_by, created_by
    ) VALUES (
      v_org_id,
      public.generate_transaction_number(v_org_id),
      p_books_start_date,
      'opening_cash_balance',
      p_opening_cash_balance,
      v_cash_account_id,
      'Saldo awal ' || p_default_cash_account_name,
      'posted',
      now(),
      v_user_id,
      v_user_id
    ) RETURNING id INTO v_line_id;

    UPDATE journal_entries
    SET transaction_id = v_line_id
    WHERE id = v_journal_id;

    INSERT INTO audit_logs (
      organization_id, actor_user_id, entity_type, entity_id,
      action, after_data
    ) VALUES (
      v_org_id, v_user_id, 'transaction', v_line_id,
      'create', jsonb_build_object(
        'transaction_type', 'opening_cash_balance',
        'amount', p_opening_cash_balance
      )
    );
  END IF;

  -- Create profile if not exists
  INSERT INTO profiles (user_id, full_name, email)
  VALUES (
    v_user_id,
    COALESCE(
      (SELECT raw_user_meta_data->>'full_name' FROM auth.users WHERE id = v_user_id),
      ''
    ),
    COALESCE(
      (SELECT email FROM auth.users WHERE id = v_user_id),
      ''
    )
  )
  ON CONFLICT (user_id) DO NOTHING;

  RETURN jsonb_build_object(
    'organization_id', v_org_id,
    'onboarding_status', 'in_progress',
    'accounts_created', v_accounts_created,
    'cash_account_id', v_cash_account_id,
    'opening_balance_posted', (p_opening_cash_balance > 0)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- P0.2b: create_organization_with_opening_balances → set completed after all balances
CREATE OR REPLACE FUNCTION public.create_organization_with_opening_balances(
  p_organization_name TEXT,
  p_business_type public.business_type,
  p_books_start_date DATE,
  p_default_cash_account_name TEXT DEFAULT 'Kas',
  p_opening_cash_balance NUMERIC DEFAULT 0,
  p_extra_opening_balances JSONB DEFAULT '[]'::JSONB
)
RETURNS JSONB AS $$
DECLARE
  v_result JSONB;
  v_org_id UUID;
  v_item JSONB;
  v_account_id UUID;
  v_amount NUMERIC;
  v_account_code INTEGER;
  v_create_bank BOOLEAN;
  v_bank_number INTEGER;
  v_bank_name TEXT;
  v_next_code INTEGER;
  v_description TEXT;
  v_posted_count INTEGER := 0;
BEGIN
  IF jsonb_typeof(COALESCE(p_extra_opening_balances, '[]'::JSONB)) != 'array' THEN
    RAISE EXCEPTION 'Extra opening balances must be a JSON array';
  END IF;

  -- This creates org with onboarding_status = 'in_progress'
  v_result := public.create_organization_with_template(
    p_organization_name,
    p_business_type,
    p_books_start_date,
    p_default_cash_account_name,
    p_opening_cash_balance
  );

  v_org_id := (v_result ->> 'organization_id')::UUID;

  -- Post all extra opening balances (org is still in_progress, so post_opening_balance allows it)
  FOR v_item IN
    SELECT value FROM jsonb_array_elements(COALESCE(p_extra_opening_balances, '[]'::JSONB))
  LOOP
    v_amount := NULLIF(v_item ->> 'openingBalance', '')::NUMERIC;
    IF COALESCE(v_amount, 0) <= 0 THEN
      CONTINUE;
    END IF;

    v_create_bank := COALESCE((v_item ->> 'createBank')::BOOLEAN, false);
    v_description := COALESCE(NULLIF(v_item ->> 'description', ''), 'Saldo awal');

    IF v_create_bank THEN
      v_bank_number := COALESCE(NULLIF(v_item ->> 'bankNumber', '')::INTEGER, 2);
      v_bank_name := COALESCE(NULLIF(v_item ->> 'accountName', ''), 'Bank ' || v_bank_number::TEXT);

      SELECT COALESCE(MAX(code), 1120) + 1
      INTO v_next_code
      FROM public.accounts
      WHERE organization_id = v_org_id
        AND code >= 1120
        AND code < 1200;

      INSERT INTO public.accounts (
        organization_id, code, name, account_type, normal_balance,
        is_cash_account, is_active, is_locked, is_system, report_group
      ) VALUES (
        v_org_id, v_next_code, v_bank_name, 'asset', 'debit',
        true, true, false, false, 'cash_and_bank'
      ) RETURNING id INTO v_account_id;
    ELSE
      v_account_code := NULLIF(v_item ->> 'accountCode', '')::INTEGER;

      SELECT id
      INTO v_account_id
      FROM public.accounts
      WHERE organization_id = v_org_id
        AND code = v_account_code
        AND is_active = true
      LIMIT 1;

      IF v_account_id IS NULL THEN
        RAISE EXCEPTION 'Opening balance account % not found', v_account_code;
      END IF;
    END IF;

    PERFORM public.post_opening_balance(
      v_org_id,
      v_account_id,
      v_amount,
      v_description,
      p_books_start_date
    );

    v_posted_count := v_posted_count + 1;
  END LOOP;

  -- P0.2 FIX: Mark onboarding as completed AFTER all balances are posted
  UPDATE public.organizations
  SET onboarding_status = 'completed',
      updated_at = now()
  WHERE id = v_org_id;

  RETURN v_result || jsonb_build_object(
    'extra_opening_balances_posted', v_posted_count,
    'onboarding_status', 'completed'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.create_organization_with_opening_balances(
  TEXT, public.business_type, DATE, TEXT, NUMERIC, JSONB
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_organization_with_opening_balances(
  TEXT, public.business_type, DATE, TEXT, NUMERIC, JSONB
) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════
--  END OF P0 FIXES
--  NOTE: Regression tests for pay_payable direction and onboarding flow
--  live in supabase/tests/ (p0_critical_fix_tests.sql, golden_scenario_tests.sql).
--  Test-only helper functions are intentionally NOT defined here so that
--  a clean `supabase db reset` from an empty database succeeds.
-- ═══════════════════════════════════════════════════════════════════

NOTIFY pgrst, 'reload schema';
