-- P0.2: Fix post_opening_balance boolean/integer type mismatch + onboarding check
-- P0.3: Revoke validate_product_sale_accounts from authenticated (internal only)

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════
--  P0.2: Fix post_opening_balance
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.post_opening_balance(
  p_organization_id UUID,
  p_account_id      UUID,
  p_amount          NUMERIC,
  p_description     TEXT,
  p_entry_date      DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id           UUID;
  v_role              TEXT;
  v_saldo_awal_id     UUID;
  v_journal_id        UUID;
  v_txn_id            UUID;
  v_entry_number      TEXT;
  v_txn_number        TEXT;
  v_books_start_date  DATE;
  v_account_type      TEXT;
  v_is_cash_account   BOOLEAN;
  v_has_normal_txn    BOOLEAN;   -- ← was INTEGER, now BOOLEAN
  v_onboarding_status TEXT;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- Only owner
  SELECT role::TEXT INTO v_role
  FROM public.organization_members
  WHERE organization_id = p_organization_id
    AND user_id = v_user_id
    AND status = 'active';

  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Anda bukan anggota organisasi ini';
  END IF;
  IF v_role != 'owner' THEN
    RAISE EXCEPTION 'Hanya pemilik yang dapat memposting saldo awal';
  END IF;

  -- Check onboarding status
  SELECT onboarding_status::TEXT INTO v_onboarding_status
  FROM public.organizations WHERE id = p_organization_id;

  -- Reject if already completed (owner-only setup mode can override if needed in future)
  IF v_onboarding_status = 'completed' THEN
    RAISE EXCEPTION 'Saldo awal hanya dapat diisi selama onboarding. Hubungi dukungan jika perlu penyesuaikan.';
  END IF;

  -- Check if normal (non-opening) transactions exist
  SELECT EXISTS (
    SELECT 1
    FROM public.transactions
    WHERE organization_id = p_organization_id
      AND status = 'posted'
      AND transaction_type NOT LIKE 'opening_%'
  ) INTO v_has_normal_txn;   -- ← SELECT EXISTS ... INTO BOOLEAN

  IF v_has_normal_txn THEN   -- ← compare BOOLEAN, not integer
    RAISE EXCEPTION 'Saldo awal tidak dapat diposting setelah ada transaksi normal. Hubungi dukungan untuk menyesuaikan saldo.';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be greater than 0';
  END IF;

  SELECT books_start_date INTO v_books_start_date
  FROM public.organizations WHERE id = p_organization_id;

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

  SELECT id INTO v_saldo_awal_id
  FROM public.accounts
  WHERE organization_id = p_organization_id
    AND code = 3200 AND is_active = true
  LIMIT 1;

  IF v_saldo_awal_id IS NULL THEN
    RAISE EXCEPTION 'Saldo Awal account not found';
  END IF;

  v_entry_number := public.generate_entry_number(p_organization_id);
  v_txn_number   := public.generate_transaction_number(p_organization_id, p_entry_date);

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
    'journal_entry_id',   v_journal_id,
    'transaction_id',     v_txn_id,
    'transaction_number', v_txn_number,
    'success',            true
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.post_opening_balance(UUID, UUID, NUMERIC, TEXT, DATE)
  FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.post_opening_balance(UUID, UUID, NUMERIC, TEXT, DATE)
  TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════
--  P0.3: Revoke validate_product_sale_accounts from authenticated
--  (called only internally from post_transaction, which is SECURITY DEFINER)
-- ═══════════════════════════════════════════════════════════════════════

REVOKE EXECUTE ON FUNCTION public.validate_product_sale_accounts(UUID, UUID)
  FROM authenticated, anon, PUBLIC;

NOTIFY pgrst, 'reload schema';

COMMIT;
