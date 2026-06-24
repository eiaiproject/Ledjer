-- Migration: Fix accounting wrappers, inventory voiding, and SECURITY DEFINER search_path
-- Date: 2026-06-19
-- Purpose:
--   1. Restore the validated transaction posting implementation saved in 20260702.
--   2. Re-apply weighted-average inventory cost without regressing partial-payment journals.
--   3. Preserve product metadata and reverse stock movements when voiding transactions.
--   4. Harden SECURITY DEFINER functions with explicit search_path.

BEGIN;

CREATE OR REPLACE FUNCTION public.recalculate_product_average_cost(
  p_product_id UUID
)
RETURNS NUMERIC AS $$
DECLARE
  v_average_cost NUMERIC := 0;
  v_total_quantity NUMERIC := 0;
  v_total_cost NUMERIC := 0;
BEGIN
  SELECT
    COALESCE(SUM(quantity), 0),
    COALESCE(SUM(quantity * unit_cost), 0)
  INTO v_total_quantity, v_total_cost
  FROM public.stock_movements
  WHERE product_id = p_product_id
    AND movement_type IN ('opening_balance', 'purchase', 'void')
    AND unit_cost IS NOT NULL;

  IF v_total_quantity > 0 THEN
    v_average_cost := v_total_cost / v_total_quantity;
  END IF;

  UPDATE public.products
  SET purchase_price = v_average_cost,
      updated_at = now()
  WHERE id = p_product_id;

  RETURN v_average_cost;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.recalculate_product_average_cost(UUID) FROM PUBLIC, anon, authenticated;

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
  v_result JSONB;
  v_transaction_id UUID;
  v_transaction_number TEXT;
  v_books_start_date DATE;
  v_account_type TEXT;
  v_is_cash_account BOOLEAN;
BEGIN
  SELECT books_start_date
  INTO v_books_start_date
  FROM public.organizations
  WHERE id = p_organization_id;

  IF v_books_start_date IS NOT NULL AND p_transaction_date < v_books_start_date THEN
    RAISE EXCEPTION 'Tanggal transaksi % sebelum tanggal mulai pembukuan %',
      p_transaction_date, v_books_start_date;
  END IF;

  IF p_cash_account_id IS NOT NULL AND p_transaction_type != 'simple_adjustment' THEN
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

  IF p_destination_cash_account_id IS NOT NULL AND p_transaction_type = 'cash_transfer' THEN
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

GRANT EXECUTE ON FUNCTION public.post_transaction(
  UUID, DATE, TEXT, NUMERIC, UUID, TEXT, UUID, UUID,
  TEXT, NUMERIC, DATE, TEXT, TEXT, UUID, NUMERIC, NUMERIC
) TO authenticated;

CREATE OR REPLACE FUNCTION public.void_transaction(
  p_organization_id UUID,
  p_transaction_id UUID,
  p_void_reason TEXT,
  p_void_date DATE DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_user_id UUID;
  v_role TEXT;
  v_txn RECORD;
  v_orig_je RECORD;
  v_reversal_je_id UUID;
  v_reversal_txn_id UUID;
  v_line RECORD;
  v_line_order INTEGER := 0;
  v_reversed_count INTEGER := 0;
  v_reversal_journal_ids JSONB := '[]'::JSONB;
  v_stock_delta NUMERIC;
  v_books_start_date DATE;
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

  IF v_role != 'owner'
     AND NOT public.has_permission(p_organization_id, 'can_void_transaction') THEN
    RAISE EXCEPTION 'Anda tidak memiliki izin untuk membatalkan transaksi';
  END IF;

  IF NULLIF(TRIM(p_void_reason), '') IS NULL THEN
    RAISE EXCEPTION 'Alasan pembatalan wajib diisi';
  END IF;

  IF p_void_date IS NOT NULL THEN
    SELECT books_start_date
    INTO v_books_start_date
    FROM public.organizations
    WHERE id = p_organization_id;

    IF v_books_start_date IS NOT NULL AND p_void_date < v_books_start_date THEN
      RAISE EXCEPTION 'Tanggal pembatalan % sebelum tanggal mulai pembukuan %',
        p_void_date, v_books_start_date;
    END IF;
  END IF;

  SELECT *
  INTO v_txn
  FROM public.transactions
  WHERE id = p_transaction_id
    AND organization_id = p_organization_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transaksi tidak ditemukan';
  END IF;

  IF v_txn.status != 'posted' THEN
    RAISE EXCEPTION 'Hanya transaksi berstatus posted yang dapat dibatalkan';
  END IF;

  IF v_txn.transaction_type IN ('credit_sale', 'credit_purchase')
     AND v_txn.payment_status = 'partial' THEN
    RAISE EXCEPTION 'Transaksi kredit dengan pembayaran parsial tidak dapat dibatalkan langsung. Selesaikan pelunasan atau catat refund terpisah terlebih dahulu.';
  END IF;

  SELECT COUNT(*)
  INTO v_reversed_count
  FROM public.journal_entries
  WHERE transaction_id = p_transaction_id
    AND organization_id = p_organization_id
    AND status = 'posted';

  IF v_reversed_count = 0 THEN
    RAISE EXCEPTION 'Jurnal posted tidak ditemukan untuk transaksi ini';
  END IF;

  INSERT INTO public.transactions (
    organization_id, transaction_number, transaction_date,
    transaction_type, amount, party_id, category_name,
    cash_account_id, destination_cash_account_id,
    payment_status, due_date, description, notes,
    status, posted_at, posted_by, created_by,
    original_transaction_id,
    product_id, quantity, unit_price
  ) VALUES (
    p_organization_id,
    public.generate_transaction_number(p_organization_id),
    COALESCE(p_void_date, CURRENT_DATE),
    v_txn.transaction_type,
    v_txn.amount,
    v_txn.party_id,
    v_txn.category_name,
    v_txn.cash_account_id,
    v_txn.destination_cash_account_id,
    v_txn.payment_status,
    v_txn.due_date,
    'Pembatalan: ' || v_txn.description,
    p_void_reason,
    'posted',
    now(),
    v_user_id,
    v_user_id,
    p_transaction_id,
    v_txn.product_id,
    v_txn.quantity,
    v_txn.unit_price
  ) RETURNING id INTO v_reversal_txn_id;

  v_reversed_count := 0;

  FOR v_orig_je IN
    SELECT *
    FROM public.journal_entries
    WHERE transaction_id = p_transaction_id
      AND organization_id = p_organization_id
      AND status = 'posted'
    ORDER BY created_at, id
  LOOP
    v_line_order := 0;

    INSERT INTO public.journal_entries (
      organization_id, entry_number, entry_date, entry_type,
      transaction_id, description, status,
      reversed_entry_id, reversal_reason,
      posted_at, posted_by
    ) VALUES (
      p_organization_id,
      public.generate_entry_number(p_organization_id),
      COALESCE(p_void_date, CURRENT_DATE),
      'reversal',
      v_reversal_txn_id,
      'Pembatalan: ' || v_orig_je.description,
      'posted',
      v_orig_je.id,
      p_void_reason,
      now(),
      v_user_id
    ) RETURNING id INTO v_reversal_je_id;

    FOR v_line IN
      SELECT *
      FROM public.journal_lines
      WHERE journal_entry_id = v_orig_je.id
      ORDER BY line_order, id
    LOOP
      v_line_order := v_line_order + 1;
      INSERT INTO public.journal_lines (
        organization_id, journal_entry_id, account_id, party_id,
        debit, credit, description, line_order
      ) VALUES (
        p_organization_id, v_reversal_je_id, v_line.account_id, v_line.party_id,
        v_line.credit, v_line.debit,
        'Reversal: ' || v_line.description, v_line_order
      );
    END LOOP;

    IF (
      SELECT ABS(COALESCE(SUM(debit), 0) - COALESCE(SUM(credit), 0))
      FROM public.journal_lines
      WHERE journal_entry_id = v_reversal_je_id
    ) > 0.01 THEN
      RAISE EXCEPTION 'Jurnal reversal tidak seimbang';
    END IF;

    v_reversal_journal_ids := v_reversal_journal_ids || jsonb_build_array(v_reversal_je_id);
    v_reversed_count := v_reversed_count + 1;
  END LOOP;

  IF v_txn.product_id IS NOT NULL AND v_txn.quantity IS NOT NULL THEN
    v_stock_delta := CASE
      WHEN v_txn.transaction_type IN ('cash_sale', 'credit_sale') THEN v_txn.quantity
      WHEN v_txn.transaction_type IN ('cash_purchase', 'credit_purchase') THEN -v_txn.quantity
      ELSE NULL
    END;

    IF v_stock_delta IS NOT NULL AND v_stock_delta != 0 THEN
      PERFORM public.record_stock_movement(
        p_organization_id,
        v_txn.product_id,
        COALESCE(p_void_date, CURRENT_DATE),
        'void',
        v_stock_delta,
        CASE
          WHEN v_txn.transaction_type IN ('cash_purchase', 'credit_purchase') THEN v_txn.unit_price
          ELSE NULL
        END,
        v_reversal_txn_id,
        p_void_reason
      );

      IF v_txn.transaction_type IN ('cash_purchase', 'credit_purchase') THEN
        PERFORM public.recalculate_product_average_cost(v_txn.product_id);
      END IF;
    END IF;
  END IF;

  UPDATE public.transactions
  SET status = 'voided',
      voided_at = now(),
      voided_by = v_user_id,
      void_reason = p_void_reason,
      reversal_transaction_id = v_reversal_txn_id
  WHERE id = p_transaction_id;

  INSERT INTO public.audit_logs (
    organization_id, actor_user_id, entity_type, entity_id,
    action, before_data, reason
  ) VALUES (
    p_organization_id, v_user_id, 'transaction', p_transaction_id,
    'void',
    jsonb_build_object(
      'transaction_number', v_txn.transaction_number,
      'amount', v_txn.amount,
      'transaction_type', v_txn.transaction_type,
      'reversed_journal_count', v_reversed_count
    ),
    p_void_reason
  );

  RETURN jsonb_build_object(
    'original_transaction_id', p_transaction_id,
    'reversal_transaction_id', v_reversal_txn_id,
    'reversal_journal_entry_ids', v_reversal_journal_ids,
    'status', 'voided'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.void_transaction(UUID, UUID, TEXT, DATE) TO authenticated;

CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_identifier TEXT,
  p_action TEXT,
  p_max_attempts INTEGER DEFAULT 5,
  p_window_seconds INTEGER DEFAULT 300
)
RETURNS BOOLEAN AS $$
DECLARE
  v_attempts INTEGER;
  v_window_start TIMESTAMPTZ;
BEGIN
  IF NULLIF(TRIM(p_identifier), '') IS NULL THEN
    RAISE EXCEPTION 'Rate-limit identifier is required';
  END IF;

  IF p_window_seconds <= 0 OR p_max_attempts <= 0 THEN
    RAISE EXCEPTION 'Invalid rate-limit configuration';
  END IF;

  DELETE FROM public.rate_limits
  WHERE created_at < now() - INTERVAL '24 hours';

  v_window_start := to_timestamp(
    floor(extract(epoch FROM now()) / p_window_seconds) * p_window_seconds
  );

  SELECT COALESCE(SUM(attempts), 0)
  INTO v_attempts
  FROM public.rate_limits
  WHERE identifier = lower(p_identifier)
    AND action = p_action
    AND window_start >= now() - (p_window_seconds || ' seconds')::INTERVAL;

  IF v_attempts >= p_max_attempts THEN
    RETURN false;
  END IF;

  INSERT INTO public.rate_limits (identifier, action, attempts, window_start)
  VALUES (lower(p_identifier), p_action, 1, v_window_start)
  ON CONFLICT (identifier, action, window_start)
  DO UPDATE SET attempts = public.rate_limits.attempts + 1;

  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.record_login_attempt(
  p_email TEXT,
  p_success BOOLEAN,
  p_ip_address INET DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL,
  p_error_message TEXT DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
  INSERT INTO public.login_attempts (email, success, ip_address, user_agent, error_message)
  VALUES (lower(p_email), p_success, p_ip_address, p_user_agent, p_error_message);

  DELETE FROM public.login_attempts
  WHERE created_at < now() - INTERVAL '24 hours';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.is_email_rate_limited(
  p_email TEXT,
  p_max_attempts INTEGER DEFAULT 5,
  p_lockout_minutes INTEGER DEFAULT 15
)
RETURNS BOOLEAN AS $$
DECLARE
  v_failed_count INTEGER;
BEGIN
  SELECT COUNT(*)
  INTO v_failed_count
  FROM public.login_attempts
  WHERE email = lower(p_email)
    AND success = false
    AND created_at > now() - (p_lockout_minutes || ' minutes')::INTERVAL;

  RETURN v_failed_count >= p_max_attempts;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.log_security_event(
  p_organization_id UUID,
  p_user_id UUID,
  p_action TEXT,
  p_resource_type TEXT DEFAULT NULL,
  p_resource_id TEXT DEFAULT NULL,
  p_details JSONB DEFAULT NULL,
  p_ip_address INET DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_log_id UUID;
BEGIN
  INSERT INTO public.audit_logs (
    organization_id, actor_user_id, action, entity_type, entity_id,
    after_data
  ) VALUES (
    p_organization_id,
    p_user_id,
    p_action,
    COALESCE(p_resource_type, 'security'),
    CASE
      WHEN p_resource_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        THEN p_resource_id::UUID
      ELSE gen_random_uuid()
    END,
    jsonb_build_object(
      'details', p_details,
      'ip_address', p_ip_address::TEXT,
      'user_agent', p_user_agent
    )
  ) RETURNING id INTO v_log_id;

  RETURN v_log_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.check_rate_limit(TEXT, TEXT, INTEGER, INTEGER) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_login_attempt(TEXT, BOOLEAN, INET, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_email_rate_limited(TEXT, INTEGER, INTEGER) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.log_security_event(UUID, UUID, TEXT, TEXT, TEXT, JSONB, INET, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.invite_staff(
  p_organization_id UUID,
  p_email TEXT
)
RETURNS JSONB AS $$
DECLARE
  v_inviter_id UUID;
  v_inviter_role TEXT;
  v_target_user_id UUID;
  v_target_email_verified_at TIMESTAMPTZ;
  v_current_plan TEXT;
  v_staff_count INTEGER;
  v_member_id UUID;
BEGIN
  v_inviter_id := auth.uid();
  IF v_inviter_id IS NULL THEN
    RAISE EXCEPTION 'Autentikasi diperlukan';
  END IF;

  IF p_email IS NULL OR p_email !~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$' THEN
    RAISE EXCEPTION 'Email tidak valid';
  END IF;

  SELECT role::TEXT
  INTO v_inviter_role
  FROM public.organization_members
  WHERE organization_id = p_organization_id
    AND user_id = v_inviter_id
    AND status = 'active';

  IF v_inviter_role IS NULL THEN
    RAISE EXCEPTION 'Anda bukan anggota organisasi ini';
  END IF;

  IF v_inviter_role != 'owner' THEN
    RAISE EXCEPTION 'Hanya owner yang dapat mengundang staf';
  END IF;

  SELECT current_plan
  INTO v_current_plan
  FROM public.organizations
  WHERE id = p_organization_id;

  IF v_current_plan != 'business' THEN
    RAISE EXCEPTION 'Invite staf memerlukan paket Business';
  END IF;

  SELECT COUNT(*)
  INTO v_staff_count
  FROM public.organization_members
  WHERE organization_id = p_organization_id
    AND role = 'staff'
    AND status = 'active';

  IF v_staff_count >= 1 THEN
    RAISE EXCEPTION 'Paket Business saat ini mendukung maksimal 1 staf';
  END IF;

  SELECT id, email_confirmed_at
  INTO v_target_user_id, v_target_email_verified_at
  FROM auth.users
  WHERE lower(email) = lower(p_email)
  LIMIT 1;

  IF v_target_user_id IS NULL THEN
    RAISE EXCEPTION 'User dengan email % belum terdaftar', p_email;
  END IF;

  IF v_target_email_verified_at IS NULL THEN
    RAISE EXCEPTION 'Email user belum terverifikasi';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.organization_members
    WHERE organization_id = p_organization_id
      AND user_id = v_target_user_id
      AND status != 'removed'
  ) THEN
    RAISE EXCEPTION 'User sudah menjadi anggota organisasi ini';
  END IF;

  INSERT INTO public.organization_members (
    organization_id,
    user_id,
    role,
    status,
    invited_by,
    joined_at,
    can_create_transaction,
    can_view_reports,
    can_manage_accounts,
    can_void_transaction,
    can_manage_products,
    can_view_audit_log
  ) VALUES (
    p_organization_id,
    v_target_user_id,
    'staff',
    'active',
    v_inviter_id,
    now(),
    false,
    false,
    false,
    false,
    false,
    false
  ) RETURNING id INTO v_member_id;

  INSERT INTO public.audit_logs (
    organization_id, actor_user_id, entity_type, entity_id,
    action, after_data
  ) VALUES (
    p_organization_id, v_inviter_id, 'organization_member', v_member_id,
    'invite_staff',
    jsonb_build_object(
      'invited_user_id', v_target_user_id,
      'email', lower(p_email),
      'role', 'staff'
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'member_id', v_member_id,
    'user_id', v_target_user_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.invite_staff(UUID, TEXT) TO authenticated;

COMMIT;
