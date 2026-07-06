-- =============================================================================
-- FIX: post_transaction — restore can_create_transaction check
-- =============================================================================
-- Bug 1 (CRITICAL SECURITY): post_transaction in 20260625184100_master_induk_fixes.sql
--   removed the has_permission('can_create_transaction') check that existed in the
--   baseline. Any active org member could post transactions regardless of their
--   staff permission flags — bypassing the UI permission gate via direct RPC.
--
-- Fix:
--   Restore can_create_transaction check after membership validation.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.post_transaction(
  p_organization_id uuid,
  p_transaction_date date,
  p_transaction_type text,
  p_amount numeric,
  p_party_id uuid DEFAULT NULL,
  p_category_name text DEFAULT NULL,
  p_cash_account_id uuid DEFAULT NULL,
  p_destination_cash_account_id uuid DEFAULT NULL,
  p_payment_status text DEFAULT 'paid',
  p_partial_amount numeric DEFAULT NULL,
  p_due_date date DEFAULT NULL,
  p_description text DEFAULT '',
  p_notes text DEFAULT NULL,
  p_product_id uuid DEFAULT NULL,
  p_quantity numeric DEFAULT NULL,
  p_unit_price numeric DEFAULT NULL,
  p_debit_account_id uuid DEFAULT NULL,
  p_client_token uuid DEFAULT NULL,
  p_party_name text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user_id            UUID;
  v_role               TEXT;
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
  v_party_name          TEXT;
  v_party_type          public.party_type;

  -- Idempotency check variables
  v_existing_txn_id UUID;
  v_existing_txn_number TEXT;
  v_existing_amount NUMERIC;
  v_existing_je_id UUID;
  v_existing_je_number TEXT;
  v_existing_impact JSONB;

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
    RAISE EXCEPTION 'Anda bukan anggota dari organisasi ini';
  END IF;

  -- ── FIX #1: Permission check (was missing since 20260625184100) ──
  IF NOT public.has_permission(p_organization_id, 'can_create_transaction') THEN
    RAISE EXCEPTION 'Anda tidak memiliki izin untuk membuat transaksi';
  END IF;

  -- ── Idempotency Check ──
  IF p_client_token IS NOT NULL THEN
    SELECT t.id, t.transaction_number, t.amount, je.id, je.entry_number
    INTO v_existing_txn_id, v_existing_txn_number, v_existing_amount, v_existing_je_id, v_existing_je_number
    FROM public.transactions t
    LEFT JOIN public.journal_entries je ON je.transaction_id = t.id
    WHERE t.organization_id = p_organization_id AND t.client_token = p_client_token
    LIMIT 1;

    IF v_existing_txn_id IS NOT NULL THEN
      SELECT jsonb_build_object(
        'debit_account_id',  d.account_id,
        'debit_account',     d.name,
        'debit_change',      CASE WHEN d.normal_balance = 'debit' THEN 'increase' ELSE 'decrease' END,
        'credit_account_id', c.account_id,
        'credit_account',    c.name,
        'credit_change',     CASE WHEN c.normal_balance = 'credit' THEN 'increase' ELSE 'decrease' END,
        'amount',            v_existing_amount
      ) INTO v_existing_impact
      FROM
        (SELECT jl.account_id, a.name, a.normal_balance::text AS normal_balance
           FROM public.journal_lines jl
           JOIN public.accounts a ON a.id = jl.account_id
          WHERE jl.journal_entry_id = v_existing_je_id AND jl.debit > 0
          ORDER BY jl.line_order, jl.id LIMIT 1) d,
        (SELECT jl.account_id, a.name, a.normal_balance::text AS normal_balance
           FROM public.journal_lines jl
           JOIN public.accounts a ON a.id = jl.account_id
          WHERE jl.journal_entry_id = v_existing_je_id AND jl.credit > 0
          ORDER BY jl.line_order, jl.id LIMIT 1) c;

      RETURN jsonb_build_object(
        'transaction_id',     v_existing_txn_id,
        'transaction_number', v_existing_txn_number,
        'journal_entry_id',   v_existing_je_id,
        'entry_number',       v_existing_je_number,
        'impact',             v_existing_impact
      );
    END IF;
  END IF;

  -- ── Phase 4 Guard: Reject opening balance types ──
  IF p_transaction_type IN (
    'opening_cash_balance',
    'opening_receivable_balance',
    'opening_payable_balance',
    'opening_equity_balance'
  ) THEN
    RAISE EXCEPTION 'Saldo awal tidak dapat dicatat melalui transaksi umum. Gunakan alur pemasangan saldo awal.';
  END IF;

  -- ── Books Start Date Guard ──
  SELECT books_start_date INTO v_books_start_date
  FROM public.organizations WHERE id = p_organization_id;

  IF v_books_start_date IS NULL THEN
    RAISE EXCEPTION 'Organisasi tidak ditemukan';
  END IF;

  IF p_transaction_date < v_books_start_date THEN
    RAISE EXCEPTION 'Tanggal transaksi % sebelum tanggal mulai pembukuan %',
      p_transaction_date, v_books_start_date;
  END IF;

  -- ── Product Validation ──
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

    -- P1-2 (a): Zero-cost sale block
    IF p_transaction_type IN ('cash_sale', 'credit_sale') THEN
      IF COALESCE(v_product_purchase_price, 0) = 0 THEN
        RAISE EXCEPTION 'Harga pokok produk belum diatur. Harap atur harga pokok (purchase_price) sebelum mencatat penjualan.';
      END IF;
      PERFORM public.validate_product_sale_accounts(p_organization_id, p_product_id);
    END IF;
  END IF;

  -- ── Server-side party resolution (atomic with transaction posting) ──
  IF p_party_id IS NULL AND p_party_name IS NOT NULL AND btrim(p_party_name) != '' THEN
    v_party_name := btrim(p_party_name);
    v_party_type := CASE
      WHEN p_transaction_type IN ('credit_sale', 'receive_receivable') THEN 'customer'::public.party_type
      WHEN p_transaction_type IN ('credit_purchase', 'pay_payable') THEN 'supplier'::public.party_type
      ELSE 'other'::public.party_type
    END;

    INSERT INTO public.parties (organization_id, name, party_type, is_active)
    VALUES (p_organization_id, v_party_name, v_party_type, true)
    ON CONFLICT (organization_id, lower(TRIM(BOTH FROM name))) WHERE is_active = true
    DO UPDATE SET name = public.parties.name
    RETURNING id INTO p_party_id;
  END IF;

  -- ── Cash account required for certain types ──
  IF p_transaction_type IN (
    'cash_sale', 'receive_receivable', 'cash_purchase', 'pay_payable',
    'expense_payment', 'owner_capital', 'owner_draw', 'cash_transfer'
  ) THEN
    IF p_cash_account_id IS NULL THEN
      RAISE EXCEPTION 'Akun kas diperlukan untuk tipe transaksi ini';
    END IF;

    SELECT account_type::TEXT, is_cash_account
    INTO v_account_type, v_is_cash_account
    FROM public.accounts
    WHERE id = p_cash_account_id
      AND organization_id = p_organization_id
      AND is_active = true;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Akun kas tidak ditemukan';
    END IF;
    IF v_account_type != 'asset' OR v_is_cash_account != true THEN
      RAISE EXCEPTION 'Akun kas tidak valid';
    END IF;
  END IF;

  -- ── Destination cash account required for transfers ──
  IF p_transaction_type = 'cash_transfer' THEN
    IF p_destination_cash_account_id IS NULL THEN
      RAISE EXCEPTION 'Akun kas tujuan diperlukan untuk transfer';
    END IF;
    IF p_cash_account_id = p_destination_cash_account_id THEN
      RAISE EXCEPTION 'Akun kas sumber dan tujuan tidak boleh sama';
    END IF;

    SELECT account_type::TEXT, is_cash_account
    INTO v_account_type, v_is_cash_account
    FROM public.accounts
    WHERE id = p_destination_cash_account_id
      AND organization_id = p_organization_id
      AND is_active = true;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Akun kas tujuan tidak ditemukan';
    END IF;
    IF v_account_type != 'asset' OR v_is_cash_account != true THEN
      RAISE EXCEPTION 'Akun kas tujuan tidak valid';
    END IF;
  END IF;

  -- ── Party required for credit / receivables / payables ──
  IF p_transaction_type IN (
    'credit_sale', 'receive_receivable', 'credit_purchase', 'pay_payable'
  ) THEN
    IF p_party_id IS NULL THEN
      RAISE EXCEPTION 'Kontak / party diperlukan untuk tipe transaksi ini';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.parties
      WHERE id = p_party_id AND organization_id = p_organization_id AND is_active = true
    ) THEN
      RAISE EXCEPTION 'Kontak / party tidak aktif atau tidak ditemukan';
    END IF;
  END IF;

  -- ── Resolve accounts based on transaction type ──
  IF p_transaction_type = 'cash_sale' THEN
    v_debit_account_id := p_cash_account_id;
    SELECT id INTO v_credit_account_id
    FROM public.accounts
    WHERE organization_id = p_organization_id AND code = 4100 AND is_active = true;
    IF v_credit_account_id IS NULL THEN
      RAISE EXCEPTION 'Akun Pendapatan Penjualan (4100) tidak ditemukan atau tidak aktif';
    END IF;

  ELSIF p_transaction_type = 'credit_sale' THEN
    SELECT id INTO v_debit_account_id
    FROM public.accounts
    WHERE organization_id = p_organization_id AND code = 1200 AND is_active = true;
    IF v_debit_account_id IS NULL THEN
      RAISE EXCEPTION 'Akun Piutang Usaha (1200) tidak ditemukan atau tidak aktif';
    END IF;

    SELECT id INTO v_credit_account_id
    FROM public.accounts
    WHERE organization_id = p_organization_id AND code = 4100 AND is_active = true;
    IF v_credit_account_id IS NULL THEN
      RAISE EXCEPTION 'Akun Pendapatan Penjualan (4100) tidak ditemukan atau tidak aktif';
    END IF;

  ELSIF p_transaction_type = 'receive_receivable' THEN
    v_debit_account_id := p_cash_account_id;
    SELECT id INTO v_credit_account_id
    FROM public.accounts
    WHERE organization_id = p_organization_id AND code = 1200 AND is_active = true;
    IF v_credit_account_id IS NULL THEN
      RAISE EXCEPTION 'Akun Piutang Usaha (1200) tidak ditemukan atau tidak aktif';
    END IF;

  ELSIF p_transaction_type = 'cash_purchase' THEN
    IF p_product_id IS NOT NULL THEN
      SELECT id INTO v_debit_account_id
      FROM public.accounts
      WHERE organization_id = p_organization_id AND code = 1300 AND is_active = true;
      IF v_debit_account_id IS NULL THEN
        RAISE EXCEPTION 'Akun Persediaan (1300) tidak ditemukan atau tidak aktif';
      END IF;
    ELSE
      IF p_debit_account_id IS NULL THEN
        RAISE EXCEPTION 'Akun debit diperlukan jika membeli non-barang';
      END IF;
      v_debit_account_id := p_debit_account_id;
    END IF;
    v_credit_account_id := p_cash_account_id;

  ELSIF p_transaction_type = 'credit_purchase' THEN
    IF p_product_id IS NOT NULL THEN
      SELECT id INTO v_debit_account_id
      FROM public.accounts
      WHERE organization_id = p_organization_id AND code = 1300 AND is_active = true;
      IF v_debit_account_id IS NULL THEN
        RAISE EXCEPTION 'Akun Persediaan (1300) tidak ditemukan atau tidak aktif';
      END IF;
    ELSE
      IF p_debit_account_id IS NULL THEN
        RAISE EXCEPTION 'Akun debit diperlukan jika membeli kredit non-barang';
      END IF;
      v_debit_account_id := p_debit_account_id;
    END IF;
    SELECT id INTO v_credit_account_id
    FROM public.accounts
    WHERE organization_id = p_organization_id AND code = 2100 AND is_active = true;
    IF v_credit_account_id IS NULL THEN
      RAISE EXCEPTION 'Akun Utang Usaha (2100) tidak ditemukan atau tidak aktif';
    END IF;

  ELSIF p_transaction_type = 'pay_payable' THEN
    SELECT id INTO v_debit_account_id
    FROM public.accounts
    WHERE organization_id = p_organization_id AND code = 2100 AND is_active = true;
    IF v_debit_account_id IS NULL THEN
      RAISE EXCEPTION 'Akun Utang Usaha (2100) tidak ditemukan atau tidak aktif';
    END IF;
    v_credit_account_id := p_cash_account_id;

  ELSIF p_transaction_type = 'expense_payment' THEN
    IF p_debit_account_id IS NULL THEN
      SELECT id INTO v_debit_account_id
      FROM public.accounts
      WHERE organization_id = p_organization_id AND code = 6190 AND is_active = true;
      IF v_debit_account_id IS NULL THEN
        RAISE EXCEPTION 'Akun Beban Lain-lain (6190) tidak ditemukan atau tidak aktif';
      END IF;
    ELSE
      v_debit_account_id := p_debit_account_id;
    END IF;
    v_credit_account_id := p_cash_account_id;

  ELSIF p_transaction_type = 'owner_capital' THEN
    v_debit_account_id := p_cash_account_id;
    SELECT id INTO v_credit_account_id
    FROM public.accounts
    WHERE organization_id = p_organization_id AND code = 3100 AND is_active = true;
    IF v_credit_account_id IS NULL THEN
      RAISE EXCEPTION 'Akun Modal Pemilik (3100) tidak ditemukan atau tidak aktif';
    END IF;

  ELSIF p_transaction_type = 'owner_draw' THEN
    SELECT id INTO v_debit_account_id
    FROM public.accounts
    WHERE organization_id = p_organization_id AND code = 3300 AND is_active = true;
    IF v_debit_account_id IS NULL THEN
      RAISE EXCEPTION 'Akun Prive Pemilik (3300) tidak ditemukan atau tidak aktif';
    END IF;
    v_credit_account_id := p_cash_account_id;

  ELSIF p_transaction_type = 'cash_transfer' THEN
    v_debit_account_id := p_destination_cash_account_id;
    v_credit_account_id := p_cash_account_id;

  ELSIF p_transaction_type = 'simple_adjustment' THEN
    IF p_debit_account_id IS NULL OR p_cash_account_id IS NULL THEN
      RAISE EXCEPTION 'Akun debit dan kredit diperlukan untuk penyesuaian sederhana';
    END IF;
    v_debit_account_id := p_debit_account_id;
    v_credit_account_id := p_cash_account_id;
  ELSE
    RAISE EXCEPTION 'Tipe transaksi tidak didukung';
  END IF;

  -- ── Check accounts validity ──
  SELECT name INTO v_debit_account_name FROM public.accounts WHERE id = v_debit_account_id AND organization_id = p_organization_id;
  IF v_debit_account_name IS NULL THEN
    RAISE EXCEPTION 'Akun debit tidak valid';
  END IF;

  SELECT name INTO v_credit_account_name FROM public.accounts WHERE id = v_credit_account_id AND organization_id = p_organization_id;
  IF v_credit_account_name IS NULL THEN
    RAISE EXCEPTION 'Akun kredit tidak valid';
  END IF;

  -- ── Generate Numbers ──
  v_entry_number := public.generate_entry_number(p_organization_id);

  -- ── Insert Journal Entry ──
  INSERT INTO public.journal_entries (
    organization_id, entry_number, entry_date, entry_type,
    description, status, posted_at, posted_by
  ) VALUES (
    p_organization_id, v_entry_number, p_transaction_date, 'normal',
    p_description, 'posted', now(), v_user_id
  ) RETURNING id INTO v_journal_id;

  -- Credit & Debit lines insertion
  IF p_transaction_type = 'credit_sale' AND p_payment_status = 'partial' THEN
    IF p_partial_amount IS NULL OR p_partial_amount <= 0 OR p_partial_amount >= p_amount THEN
      RAISE EXCEPTION 'Jumlah bayar sebagian tidak valid';
    END IF;
    v_remaining_amount := p_amount - p_partial_amount;

    INSERT INTO public.journal_lines (organization_id, journal_entry_id, account_id, debit, credit, description, line_order) VALUES
      (p_organization_id, v_journal_id, v_cash_account_id, p_partial_amount, 0, p_description, 1),
      (p_organization_id, v_journal_id, v_debit_account_id, v_remaining_amount, 0, p_description, 2),
      (p_organization_id, v_journal_id, v_credit_account_id, 0, p_amount, p_description, 3);
  ELSIF p_transaction_type = 'credit_purchase' AND p_payment_status = 'partial' THEN
    IF p_partial_amount IS NULL OR p_partial_amount <= 0 OR p_partial_amount >= p_amount THEN
      RAISE EXCEPTION 'Jumlah bayar sebagian tidak valid';
    END IF;
    v_remaining_amount := p_amount - p_partial_amount;

    INSERT INTO public.journal_lines (organization_id, journal_entry_id, account_id, debit, credit, description, line_order) VALUES
      (p_organization_id, v_journal_id, v_debit_account_id, p_amount, 0, p_description, 1),
      (p_organization_id, v_journal_id, v_cash_account_id, 0, p_partial_amount, p_description, 2),
      (p_organization_id, v_journal_id, v_credit_account_id, 0, v_remaining_amount, p_description, 3);
  ELSE
    INSERT INTO public.journal_lines (organization_id, journal_entry_id, account_id, debit, credit, description, line_order) VALUES
      (p_organization_id, v_journal_id, v_debit_account_id, p_amount, 0, p_description, 1),
      (p_organization_id, v_journal_id, v_credit_account_id, 0, p_amount, p_description, 2);
  END IF;

  -- ── Balance Verification ──
  IF (
    SELECT ABS(COALESCE(SUM(debit), 0) - COALESCE(SUM(credit), 0))
    FROM public.journal_lines
    WHERE journal_entry_id = v_journal_id
  ) <> 0 THEN
    RAISE EXCEPTION 'Jurnal tidak seimbang';
  END IF;

  -- ── TRANSACTION RECORD ──
  v_txn_number := public.generate_transaction_number(p_organization_id, p_transaction_date);

  INSERT INTO public.transactions (
    organization_id, transaction_number, transaction_date,
    transaction_type, amount, party_id, category_name,
    cash_account_id, destination_cash_account_id,
    payment_status, due_date, description, notes,
    status, posted_at, posted_by, created_by,
    product_id, quantity, unit_price, client_token
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
    p_product_id, p_quantity, p_unit_price, p_client_token
  ) RETURNING id, transaction_number INTO v_transaction_id, v_txn_number;

  UPDATE public.journal_entries
  SET transaction_id = v_transaction_id
  WHERE id = v_journal_id;

  -- ── PRODUCT: STOCK MOVEMENTS + COGS ──
  IF p_product_id IS NOT NULL THEN
    IF p_transaction_type IN ('cash_purchase', 'credit_purchase') THEN
      PERFORM public.record_stock_movement(
        p_organization_id, p_product_id, p_transaction_date,
        'purchase', p_quantity, p_unit_price, v_transaction_id
      );
      PERFORM public.recalculate_product_average_cost(p_product_id);
    ELSIF p_transaction_type IN ('cash_sale', 'credit_sale') THEN
      v_cogs_amount := COALESCE(v_product_purchase_price, 0) * p_quantity;

      SELECT id INTO v_cogs_account_id FROM public.accounts WHERE organization_id = p_organization_id AND code = 5100 AND is_active = true;
      SELECT id INTO v_inventory_account_id FROM public.accounts WHERE organization_id = p_organization_id AND code = 1300 AND is_active = true;

      INSERT INTO public.journal_lines (organization_id, journal_entry_id, account_id, debit, credit, description, line_order) VALUES
        (p_organization_id, v_journal_id, v_cogs_account_id, v_cogs_amount, 0, 'HPP: ' || p_description, 3),
        (p_organization_id, v_journal_id, v_inventory_account_id, 0, v_cogs_amount, 'HPP: ' || p_description, 4);

      PERFORM public.record_stock_movement(
        p_organization_id, p_product_id, p_transaction_date,
        'sale', -p_quantity, COALESCE(v_product_purchase_price, 0), v_transaction_id
      );
    END IF;
  END IF;

  -- ── IMPACT + AUDIT + RETURN ──
  SELECT normal_balance::TEXT INTO v_debit_normal FROM public.accounts WHERE id = v_debit_account_id;
  SELECT normal_balance::TEXT INTO v_credit_normal FROM public.accounts WHERE id = v_credit_account_id;

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

ALTER FUNCTION public.post_transaction(uuid, date, text, numeric, uuid, text, uuid, uuid, text, numeric, date, text, text, uuid, numeric, numeric, uuid, uuid, text) OWNER TO postgres;
REVOKE EXECUTE ON FUNCTION public.post_transaction(uuid, date, text, numeric, uuid, text, uuid, uuid, text, numeric, date, text, text, uuid, numeric, numeric, uuid, uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.post_transaction(uuid, date, text, numeric, uuid, text, uuid, uuid, text, numeric, date, text, text, uuid, numeric, numeric, uuid, uuid, text) TO authenticated;
