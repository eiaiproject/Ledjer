-- P1-2: void_transaction — block voiding reversal rows
-- A reversal row itself is posted; voiding it would re-apply the original effects

BEGIN;

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

  -- P1-2: Block voiding reversal rows
  IF v_txn.original_transaction_id IS NOT NULL THEN
    RAISE EXCEPTION 'Transaksi pembatalan tidak dapat dibatalkan';
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

NOTIFY pgrst, 'reload schema';

COMMIT;
