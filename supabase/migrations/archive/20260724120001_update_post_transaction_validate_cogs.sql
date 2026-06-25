-- P1.8: Update post_transaction to always validate COGS/inventory accounts for product sales
-- This migration updates the product sales section to validate accounts even when COGS amount is 0


-- Drop the existing post_transaction function first
DROP FUNCTION IF EXISTS public.post_transaction(
  UUID, DATE, TEXT, NUMERIC, UUID, TEXT, UUID, UUID,
  TEXT, NUMERIC, DATE, TEXT, TEXT, UUID, NUMERIC, NUMERIC
);

-- Recreate with validation always called for product sales
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
  p_unit_price NUMERIC DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_user_id UUID;
  v_role TEXT;
  v_result JSONB;
  v_transaction_id UUID;
  v_transaction_number TEXT;
  v_books_start_date DATE;
  v_account_type TEXT;
  v_is_cash_account BOOLEAN;
  v_cogs_amount NUMERIC;
  v_product_purchase_price NUMERIC;
  v_cogs_account_id UUID;
  v_inventory_account_id UUID;
  v_debit_account_id UUID;
  v_debit_account_name TEXT;
  v_credit_account_id UUID;
  v_credit_account_name TEXT;
  v_receivable_account_id UUID;
  v_payable_account_id UUID;
  v_journal_id UUID;
  v_entry_number TEXT;
  v_line_order INTEGER;
  v_cogs_entry_number TEXT;
  v_cogs_journal_id UUID;
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
    AND status = 'active';

  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Anda bukan anggota organisasi ini';
  END IF;

  -- P0.5: Reject opening balance types
  IF p_transaction_type IN ('opening_cash_balance', 'opening_balance') THEN
    RAISE EXCEPTION 'Saldo awal harus diposting melalui post_opening_balance atau alur onboarding.';
  END IF;

  SELECT books_start_date
  INTO v_books_start_date
  FROM public.organizations
  WHERE id = p_organization_id;

  IF v_books_start_date IS NOT NULL AND p_transaction_date < v_books_start_date THEN
    RAISE EXCEPTION 'Tanggal transaksi % sebelum tanggal mulai pembukuan %',
      p_transaction_date, v_books_start_date;
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

  IF p_transaction_type IN ('credit_sale', 'credit_purchase', 'receive_receivable', 'pay_payable')
     AND p_party_id IS NULL THEN
    RAISE EXCEPTION 'Pihak wajib dipilih untuk transaksi tipe %', p_transaction_type;
  END IF;

  IF p_destination_cash_account_id IS NOT NULL
     AND p_transaction_type NOT IN ('cash_transfer', 'simple_adjustment') THEN
    RAISE EXCEPTION 'Akun tujuan hanya boleh diisi untuk transfer kas atau penyesuaian';
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
  ELSE
    IF p_cash_account_id IS NOT NULL THEN
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
  END IF;

  -- Get product purchase price for COGS calculation
  IF p_product_id IS NOT NULL THEN
    SELECT purchase_price INTO v_product_purchase_price
    FROM public.products
    WHERE id = p_product_id
      AND organization_id = p_organization_id;

    -- P1.8: Always validate COGS/inventory accounts for product sales
    IF p_transaction_type IN ('cash_sale', 'credit_sale') THEN
      PERFORM public.validate_product_sale_accounts(p_organization_id, p_product_id);
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
        AND ((p_category_name IS NOT NULL AND name ILIKE '%' || replace(replace(replace(p_category_name, '\', '\\'), '%', '\%'), '_', '\_') || '%' ESCAPE '\') OR code = 4100)
      ORDER BY CASE WHEN p_category_name IS NOT NULL AND name ILIKE '%' || replace(replace(replace(p_category_name, '\', '\\'), '%', '\%'), '_', '\_') || '%' ESCAPE '\' THEN 0 ELSE 1 END, code
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
        AND ((p_category_name IS NOT NULL AND name ILIKE '%' || replace(replace(replace(p_category_name, '\', '\\'), '%', '\%'), '_', '\_') || '%' ESCAPE '\') OR code = 4100)
      ORDER BY CASE WHEN p_category_name IS NOT NULL AND name ILIKE '%' || replace(replace(replace(p_category_name, '\', '\\'), '%', '\%'), '_', '\_') || '%' ESCAPE '\' THEN 0 ELSE 1 END, code
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
          AND ((p_category_name IS NOT NULL AND name ILIKE '%' || replace(replace(replace(p_category_name, '\', '\\'), '%', '\%'), '_', '\_') || '%' ESCAPE '\') OR code = 5100)
        ORDER BY CASE WHEN p_category_name IS NOT NULL AND name ILIKE '%' || replace(replace(replace(p_category_name, '\', '\\'), '%', '\%'), '_', '\_') || '%' ESCAPE '\' THEN 0 ELSE 1 END, code
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
          AND ((p_category_name IS NOT NULL AND name ILIKE '%' || replace(replace(replace(p_category_name, '\', '\\'), '%', '\%'), '_', '\_') || '%' ESCAPE '\') OR code = 5100)
        ORDER BY CASE WHEN p_category_name IS NOT NULL AND name ILIKE '%' || replace(replace(replace(p_category_name, '\', '\\'), '%', '\%'), '_', '\_') || '%' ESCAPE '\' THEN 0 ELSE 1 END, code
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
      v_debit_account_id := p_cash_account_id;
      v_debit_account_name := 'Kas/Bank';
      SELECT id INTO v_credit_account_id
      FROM public.accounts
      WHERE organization_id = p_organization_id
        AND code = 2100
        AND is_active = true;
      v_credit_account_name := 'Utang Usaha';

    WHEN 'cash_transfer' THEN
      v_debit_account_id := p_destination_cash_account_id;
      v_debit_account_name := 'Kas/Bank Tujuan';
      v_credit_account_id := p_cash_account_id;
      v_credit_account_name := 'Kas/Bank Sumber';

    WHEN 'simple_adjustment' THEN
      v_debit_account_id := p_cash_account_id;
      v_debit_account_name := 'Akun Debit';
      v_credit_account_id := p_destination_cash_account_id;
      v_credit_account_name := 'Akun Kredit';

    ELSE
      RAISE EXCEPTION 'Tipe transaksi tidak valid: %', p_transaction_type;
  END CASE;

  -- Validate accounts exist
  IF v_debit_account_id IS NULL THEN
    RAISE EXCEPTION 'Akun debit tidak ditemukan untuk transaksi ini';
  END IF;
  IF v_credit_account_id IS NULL THEN
    RAISE EXCEPTION 'Akun kredit tidak ditemukan untuk transaksi ini';
  END IF;

  -- Create journal entry
  v_entry_number := public.generate_entry_number(p_organization_id);

  INSERT INTO public.journal_entries (
    organization_id, entry_number, entry_date, entry_type,
    description, status, posted_at, posted_by
  ) VALUES (
    p_organization_id, v_entry_number, p_transaction_date, 'normal',
    p_description, 'posted', now(), v_user_id
  ) RETURNING id INTO v_journal_id;

  -- Create journal lines
  v_line_order := 1;

  INSERT INTO public.journal_lines (
    organization_id, journal_entry_id, account_id,
    debit, credit, description, line_order
  ) VALUES
    (p_organization_id, v_journal_id, v_debit_account_id, p_amount, 0, p_description, v_line_order),
    (p_organization_id, v_journal_id, v_credit_account_id, 0, p_amount, p_description, v_line_order + 1);

  -- Create transaction record
  v_transaction_number := public.generate_transaction_number(p_organization_id, p_transaction_date);

  INSERT INTO public.transactions (
    organization_id, transaction_number, transaction_date,
    transaction_type, amount, party_id, category_name,
    cash_account_id, destination_cash_account_id,
    payment_status, partial_amount, due_date,
    description, notes, status, posted_at, posted_by, created_by,
    product_id, quantity, unit_price
  ) VALUES (
    p_organization_id, v_transaction_number, p_transaction_date,
    p_transaction_type, p_amount, p_party_id, p_category_name,
    p_cash_account_id, p_destination_cash_account_id,
    p_payment_status, p_partial_amount, p_due_date,
    p_description, p_notes, 'posted', now(), v_user_id, v_user_id,
    p_product_id, p_quantity, p_unit_price
  ) RETURNING id INTO v_transaction_id;

  -- Update journal entry with transaction_id
  UPDATE public.journal_entries
  SET transaction_id = v_transaction_id
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

      -- P0.4 + P1.8: Always create COGS entries for product sales
      -- Accounts are already validated above
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
            v_transaction_id,
            'HPP: ' || p_description,
            'posted',
            now(),
            v_user_id
          ) RETURNING id INTO v_cogs_journal_id;

          INSERT INTO public.journal_lines (
            organization_id, journal_entry_id, account_id,
            debit, credit, description, line_order
          ) VALUES
            (p_organization_id, v_cogs_journal_id, v_cogs_account_id, v_cogs_amount, 0, 'HPP: ' || p_description, 1),
            (p_organization_id, v_cogs_journal_id, v_inventory_account_id, 0, v_cogs_amount, 'HPP: ' || p_description, 2);
        END;
      END IF;

      PERFORM public.record_stock_movement(
        p_organization_id,
        p_product_id,
        p_transaction_date,
        'sale',
        -p_quantity,
        v_product_purchase_price,
        v_transaction_id,
        p_description
      );
    END IF;
  END IF;

  -- Audit log
  INSERT INTO public.audit_logs (
    organization_id, actor_user_id, entity_type, entity_id,
    action, after_data
  ) VALUES (
    p_organization_id, v_user_id, 'transaction', v_transaction_id,
    'create', jsonb_build_object(
      'transaction_type', p_transaction_type,
      'amount', p_amount,
      'transaction_number', v_transaction_number
    )
  );

  RETURN jsonb_build_object(
    'transaction_id', v_transaction_id,
    'journal_entry_id', v_journal_id,
    'transaction_number', v_transaction_number,
    'success', true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Update permissions
REVOKE EXECUTE ON FUNCTION public.post_transaction(
  UUID, DATE, TEXT, NUMERIC, UUID, TEXT, UUID, UUID,
  TEXT, NUMERIC, DATE, TEXT, TEXT, UUID, NUMERIC, NUMERIC
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.post_transaction(
  UUID, DATE, TEXT, NUMERIC, UUID, TEXT, UUID, UUID,
  TEXT, NUMERIC, DATE, TEXT, TEXT, UUID, NUMERIC, NUMERIC
) TO authenticated;
