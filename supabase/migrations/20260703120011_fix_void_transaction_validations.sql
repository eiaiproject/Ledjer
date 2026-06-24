-- Migration: Fix void_transaction (T2.11 race condition, T2.12 partial credit block)
-- Date: 2026-07-19
-- Purpose:
--   T2.11: Add SELECT FOR UPDATE to prevent double-void race condition
--   T2.12: Block voiding partial credit_sale/credit_purchase (needs explicit refund flow)
--
-- Changes:
--   - CREATE OR REPLACE void_transaction with FOR UPDATE lock
--   - Add validation blocking partial credit voids
--   - Use Indonesian error messages
--
-- Constraints: Additive only (C1).

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
  v_books_start_date DATE;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Autentikasi diperlukan';
  END IF;

  -- Check membership and permission
  SELECT role::TEXT INTO v_role
  FROM organization_members
  WHERE organization_id = p_organization_id
    AND user_id = v_user_id
    AND status = 'active';

  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Anda bukan anggota organisasi ini';
  END IF;

  IF v_role != 'owner' THEN
    IF NOT public.has_permission(p_organization_id, 'can_void_transaction') THEN
      RAISE EXCEPTION 'Anda tidak memiliki izin untuk membatalkan transaksi';
    END IF;
  END IF;

  -- T2.11: Get the transaction with FOR UPDATE to prevent race condition
  SELECT * INTO v_txn
  FROM transactions
  WHERE id = p_transaction_id
    AND organization_id = p_organization_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transaksi tidak ditemukan';
  END IF;

  IF v_txn.status != 'posted' THEN
    RAISE EXCEPTION 'Hanya transaksi berstatus posted yang dapat dibatalkan';
  END IF;

  -- T2.12: Block voiding partial credit transactions
  IF v_txn.transaction_type IN ('credit_sale', 'credit_purchase')
     AND v_txn.payment_status = 'partial' THEN
    RAISE EXCEPTION 'Transaksi kredit dengan pembayaran parsial tidak dapat dibatalkan langsung. '
      'Selesaikan pelunasan terlebih dahulu (receive_receivable/pay_payable), atau '
      'catat refund terpisah untuk pembayaran yang sudah diterima, lalu batalkan.';
  END IF;

  -- Validate void_date is not before books_start_date
  IF p_void_date IS NOT NULL THEN
    SELECT books_start_date INTO v_books_start_date
    FROM organizations WHERE id = p_organization_id;
    
    IF v_books_start_date IS NOT NULL AND p_void_date < v_books_start_date THEN
      RAISE EXCEPTION 'Tanggal pembatalan % sebelum tanggal mulai pembukuan %',
        p_void_date, v_books_start_date;
    END IF;
  END IF;

  -- Get the original journal entry
  SELECT je.* INTO v_orig_je
  FROM journal_entries je
  WHERE je.transaction_id = p_transaction_id
    AND je.organization_id = p_organization_id
    AND je.status = 'posted'
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Jurnal yang diposting tidak ditemukan untuk transaksi ini';
  END IF;

  -- Create reversal journal entry
  INSERT INTO journal_entries (
    organization_id, entry_number, entry_date, entry_type,
    transaction_id, description, status,
    reversed_entry_id, reversal_reason,
    posted_at, posted_by
  ) VALUES (
    p_organization_id,
    public.generate_entry_number(p_organization_id),
    COALESCE(p_void_date, CURRENT_DATE),
    'reversal',
    p_transaction_id,
    'Pembatalan: ' || v_txn.description,
    'posted',
    v_orig_je.id,
    p_void_reason,
    now(),
    v_user_id
  ) RETURNING id INTO v_reversal_je_id;

  -- Create reversal journal lines (swap debit/credit)
  FOR v_line IN
    SELECT * FROM journal_lines
    WHERE journal_entry_id = v_orig_je.id
    ORDER BY line_order
  LOOP
    v_line_order := v_line_order + 1;
    INSERT INTO journal_lines (
      organization_id, journal_entry_id, account_id, party_id,
      debit, credit, description, line_order
    ) VALUES (
      p_organization_id, v_reversal_je_id, v_line.account_id, v_line.party_id,
      v_line.credit, v_line.debit,
      'Reversal: ' || v_line.description, v_line_order
    );
  END LOOP;

  -- Also reverse COGS journal entry if exists (for sales with products)
  DECLARE
    v_cogs_je RECORD;
    v_cogs_line RECORD;
  BEGIN
    FOR v_cogs_je IN
      SELECT je.* FROM journal_entries je
      WHERE je.transaction_id = p_transaction_id
        AND je.organization_id = p_organization_id
        AND je.status = 'posted'
        AND je.id != v_orig_je.id
    LOOP
      -- Create reversal for COGS entry
      DECLARE
        v_cogs_reversal_id UUID;
      BEGIN
        INSERT INTO journal_entries (
          organization_id, entry_number, entry_date, entry_type,
          transaction_id, description, status,
          reversed_entry_id, reversal_reason,
          posted_at, posted_by
        ) VALUES (
          p_organization_id,
          public.generate_entry_number(p_organization_id),
          COALESCE(p_void_date, CURRENT_DATE),
          'reversal',
          p_transaction_id,
          'Reversal: ' || COALESCE(v_cogs_je.description, ''),
          'posted',
          v_cogs_je.id,
          p_void_reason,
          now(),
          v_user_id
        ) RETURNING id INTO v_cogs_reversal_id;

        FOR v_cogs_line IN
          SELECT * FROM journal_lines
          WHERE journal_entry_id = v_cogs_je.id
          ORDER BY line_order
        LOOP
          v_line_order := v_line_order + 1;
          INSERT INTO journal_lines (
            organization_id, journal_entry_id, account_id, party_id,
            debit, credit, description, line_order
          ) VALUES (
            p_organization_id, v_cogs_reversal_id, v_cogs_line.account_id, v_cogs_line.party_id,
            v_cogs_line.credit, v_cogs_line.debit,
            'Reversal: ' || v_cogs_line.description, v_line_order
          );
        END LOOP;

        -- Mark COGS entry as voided
        UPDATE journal_entries SET status = 'voided' WHERE id = v_cogs_je.id;
      END;
    END LOOP;
  END;

  -- Validate reversal journal is balanced
  IF (
    SELECT ABS(SUM(debit) - SUM(credit))
    FROM journal_lines
    WHERE journal_entry_id = v_reversal_je_id
  ) > 0.01 THEN
    RAISE EXCEPTION 'Jurnal reversal tidak seimbang';
  END IF;

  -- Create reversal transaction
  INSERT INTO transactions (
    organization_id, transaction_number, transaction_date,
    transaction_type, amount, party_id, category_name,
    cash_account_id, destination_cash_account_id,
    payment_status, due_date, description, notes,
    status, posted_at, posted_by, created_by,
    original_transaction_id
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
    p_transaction_id
  ) RETURNING id INTO v_reversal_txn_id;

  -- Link reversal journal to reversal transaction
  UPDATE journal_entries SET transaction_id = v_reversal_txn_id WHERE id = v_reversal_je_id;

  -- Mark original transaction as voided
  UPDATE transactions
  SET status = 'voided',
      voided_at = now(),
      voided_by = v_user_id,
      void_reason = p_void_reason,
      reversal_transaction_id = v_reversal_txn_id
  WHERE id = p_transaction_id;

  -- Mark original journal entry as voided
  UPDATE journal_entries
  SET status = 'voided'
  WHERE id = v_orig_je.id;

  -- Create audit log
  INSERT INTO audit_logs (
    organization_id, actor_user_id, entity_type, entity_id,
    action, before_data, reason
  ) VALUES (
    p_organization_id, v_user_id, 'transaction', p_transaction_id,
    'void',
    jsonb_build_object(
      'transaction_number', v_txn.transaction_number,
      'amount', v_txn.amount,
      'transaction_type', v_txn.transaction_type
    ),
    p_void_reason
  );

  RETURN jsonb_build_object(
    'original_transaction_id', p_transaction_id,
    'reversal_transaction_id', v_reversal_txn_id,
    'reversal_journal_entry_id', v_reversal_je_id,
    'status', 'voided'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.void_transaction(UUID, UUID, TEXT, DATE) TO authenticated;

COMMIT;
