-- Final hardening for transaction validation, opening-balance numbering, and atomic onboarding.

BEGIN;

ALTER FUNCTION public.create_organization_with_template(
  TEXT, public.business_type, DATE, TEXT, NUMERIC
) SET search_path = public;

CREATE OR REPLACE FUNCTION public.post_opening_balance(
  p_organization_id UUID,
  p_account_id UUID,
  p_amount NUMERIC,
  p_description TEXT,
  p_entry_date DATE
)
RETURNS JSONB AS $$
DECLARE
  v_user_id UUID;
  v_saldo_awal_id UUID;
  v_journal_id UUID;
  v_txn_id UUID;
  v_entry_number TEXT;
  v_txn_number TEXT;
  v_books_start_date DATE;
  v_account_type TEXT;
  v_is_cash_account BOOLEAN;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF NOT public.has_permission(p_organization_id, 'can_create_transaction') THEN
    RAISE EXCEPTION 'You do not have permission to create transactions';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be greater than 0';
  END IF;

  SELECT books_start_date
  INTO v_books_start_date
  FROM public.organizations
  WHERE id = p_organization_id;

  IF v_books_start_date IS NULL THEN
    RAISE EXCEPTION 'Organization not found';
  END IF;

  IF p_entry_date < v_books_start_date THEN
    RAISE EXCEPTION 'Opening balance date % is before books start date %',
      p_entry_date, v_books_start_date;
  END IF;

  SELECT account_type::TEXT, is_cash_account
  INTO v_account_type, v_is_cash_account
  FROM public.accounts
  WHERE id = p_account_id
    AND organization_id = p_organization_id
    AND is_active = true;

  IF v_account_type IS NULL THEN
    RAISE EXCEPTION 'Opening balance account not found or inactive';
  END IF;

  IF v_account_type != 'asset' OR v_is_cash_account IS NOT TRUE THEN
    RAISE EXCEPTION 'Opening cash balance account must be an active cash/bank asset account';
  END IF;

  SELECT id
  INTO v_saldo_awal_id
  FROM public.accounts
  WHERE organization_id = p_organization_id
    AND code = 3200
    AND is_active = true
  LIMIT 1;

  IF v_saldo_awal_id IS NULL THEN
    RAISE EXCEPTION 'Saldo Awal account not found';
  END IF;

  v_entry_number := public.generate_entry_number(p_organization_id);
  v_txn_number := public.generate_transaction_number(p_organization_id, p_entry_date);

  INSERT INTO public.journal_entries (
    organization_id, entry_number, entry_date, entry_type,
    description, status, posted_at, posted_by
  ) VALUES (
    p_organization_id, v_entry_number, p_entry_date, 'opening_balance',
    p_description, 'posted', now(), v_user_id
  ) RETURNING id INTO v_journal_id;

  INSERT INTO public.journal_lines (
    organization_id, journal_entry_id, account_id,
    debit, credit, description, line_order
  ) VALUES
    (p_organization_id, v_journal_id, p_account_id, p_amount, 0, p_description, 1),
    (p_organization_id, v_journal_id, v_saldo_awal_id, 0, p_amount, p_description, 2);

  INSERT INTO public.transactions (
    organization_id, transaction_number, transaction_date,
    transaction_type, amount, cash_account_id,
    description, status, posted_at, posted_by, created_by
  ) VALUES (
    p_organization_id, v_txn_number, p_entry_date,
    'opening_cash_balance', p_amount, p_account_id,
    p_description, 'posted', now(), v_user_id, v_user_id
  ) RETURNING id INTO v_txn_id;

  UPDATE public.journal_entries
  SET transaction_id = v_txn_id
  WHERE id = v_journal_id;

  INSERT INTO public.audit_logs (
    organization_id, actor_user_id, entity_type, entity_id,
    action, after_data
  ) VALUES (
    p_organization_id, v_user_id, 'transaction', v_txn_id,
    'create', jsonb_build_object(
      'transaction_type', 'opening_cash_balance',
      'amount', p_amount
    )
  );

  RETURN jsonb_build_object(
    'journal_entry_id', v_journal_id,
    'transaction_id', v_txn_id,
    'transaction_number', v_txn_number,
    'success', true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.post_opening_balance(
  UUID, UUID, NUMERIC, TEXT, DATE
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.post_opening_balance(
  UUID, UUID, NUMERIC, TEXT, DATE
) TO authenticated;

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

  v_result := public.post_transaction_impl_20260702(
    p_organization_id,
    p_transaction_date,
    p_transaction_type,
    p_amount,
    p_party_id,
    p_category_name,
    p_cash_account_id,
    p_destination_cash_account_id,
    p_payment_status,
    p_partial_amount,
    p_due_date,
    p_description,
    p_notes,
    p_product_id,
    p_quantity,
    p_unit_price
  );

  v_transaction_id := (v_result ->> 'transaction_id')::UUID;

  IF p_product_id IS NOT NULL
     AND p_transaction_type IN ('cash_purchase', 'credit_purchase') THEN
    PERFORM public.recalculate_product_average_cost(p_product_id);
  END IF;

  SELECT transaction_number
  INTO v_transaction_number
  FROM public.transactions
  WHERE organization_id = p_organization_id
    AND id = v_transaction_id;

  IF v_transaction_number IS NOT NULL THEN
    v_result := jsonb_set(v_result, '{transaction_number}', to_jsonb(v_transaction_number), true);
  END IF;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.post_transaction(
  UUID, DATE, TEXT, NUMERIC, UUID, TEXT, UUID, UUID,
  TEXT, NUMERIC, DATE, TEXT, TEXT, UUID, NUMERIC, NUMERIC
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.post_transaction(
  UUID, DATE, TEXT, NUMERIC, UUID, TEXT, UUID, UUID,
  TEXT, NUMERIC, DATE, TEXT, TEXT, UUID, NUMERIC, NUMERIC
) TO authenticated;

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

  v_result := public.create_organization_with_template(
    p_organization_name,
    p_business_type,
    p_books_start_date,
    p_default_cash_account_name,
    p_opening_cash_balance
  );

  v_org_id := (v_result ->> 'organization_id')::UUID;

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

  RETURN v_result || jsonb_build_object('extra_opening_balances_posted', v_posted_count);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.create_organization_with_opening_balances(
  TEXT, public.business_type, DATE, TEXT, NUMERIC, JSONB
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_organization_with_opening_balances(
  TEXT, public.business_type, DATE, TEXT, NUMERIC, JSONB
) TO authenticated;

COMMIT;
