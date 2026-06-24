-- Migration: Implement weighted-average COGS (T2.9)
-- Date: 2026-07-19
-- Purpose:
--   When posting a purchase, update products.purchase_price using weighted-average formula.
--   Currently purchase_price is never updated, so COGS always uses the original price.
--   PSAK ETAP allows weighted-average or FIFO; we use weighted-average for simplicity.
--
-- Changes:
--   - CREATE OR REPLACE post_transaction to update purchase_price on purchases
--
-- Constraints: Additive only (C1). Preserves per-type structure (C2).
-- Cost-flow assumption documented: WEIGHTED AVERAGE

BEGIN;

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
  v_plan TEXT;
  v_txn_count INTEGER;
  v_debit_account_id UUID;
  v_credit_account_id UUID;
  v_debit_account_name TEXT;
  v_credit_account_name TEXT;
  v_journal_id UUID;
  v_txn_id UUID;
  v_txn_number TEXT;
  v_entry_number TEXT;
  v_impact JSONB := '{}'::JSONB;
  v_line_order INTEGER := 0;
  v_books_start_date DATE;
  v_cash_account_type TEXT;
  v_debit_normal TEXT;
  v_credit_normal TEXT;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Autentikasi diperlukan';
  END IF;

  -- Check membership
  SELECT role::TEXT INTO v_role
  FROM organization_members
  WHERE organization_id = p_organization_id
    AND user_id = v_user_id
    AND status = 'active';

  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Anda bukan anggota organisasi ini';
  END IF;

  -- Check staff permission
  IF v_role = 'staff' THEN
    IF NOT public.has_permission(p_organization_id, 'can_create_transaction') THEN
      RAISE EXCEPTION 'Anda tidak memiliki izin untuk membuat transaksi';
    END IF;
  END IF;

  -- Check plan limit
  SELECT current_plan INTO v_plan
  FROM organizations WHERE id = p_organization_id;

  IF v_plan = 'free' THEN
    v_txn_count := public.get_monthly_transaction_count(p_organization_id);
    IF v_txn_count >= 50 THEN
      RAISE EXCEPTION 'Batas transaksi paket Gratis tercapai (50 transaksi/bulan). Silakan upgrade.';
    END IF;
  END IF;

  -- Validate amount
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Nominal harus lebih dari 0';
  END IF;

  -- T2.3: Validate transaction_date >= books_start_date
  SELECT books_start_date INTO v_books_start_date
  FROM organizations WHERE id = p_organization_id;

  IF v_books_start_date IS NOT NULL AND p_transaction_date < v_books_start_date THEN
    RAISE EXCEPTION 'Tanggal transaksi % sebelum tanggal mulai pembukuan %',
      p_transaction_date, v_books_start_date;
  END IF;

  -- T2.2: Validate cash_account_id is an asset account
  IF p_cash_account_id IS NOT NULL THEN
    SELECT account_type INTO v_cash_account_type
    FROM accounts
    WHERE id = p_cash_account_id
      AND organization_id = p_organization_id
      AND is_active = true;

    IF v_cash_account_type IS NULL THEN
      RAISE EXCEPTION 'Akun kas tidak ditemukan atau tidak aktif';
    END IF;

    IF v_cash_account_type != 'asset' THEN
      RAISE EXCEPTION 'Akun kas harus bertipe aset (bukan %)', v_cash_account_type;
    END IF;
  END IF;

  -- Validate destination account is asset (for transfers and adjustments)
  IF p_destination_cash_account_id IS NOT NULL THEN
    SELECT account_type INTO v_cash_account_type
    FROM accounts
    WHERE id = p_destination_cash_account_id
      AND organization_id = p_organization_id
      AND is_active = true;

    IF v_cash_account_type IS NULL THEN
      RAISE EXCEPTION 'Akun tujuan tidak ditemukan atau tidak aktif';
    END IF;

    IF v_cash_account_type != 'asset' THEN
      RAISE EXCEPTION 'Akun tujuan harus bertipe aset (bukan %)', v_cash_account_type;
    END IF;
  END IF;

  -- T2.1: Enforce party_id for credit transactions
  IF p_transaction_type IN ('credit_sale', 'credit_purchase', 'receive_receivable', 'pay_payable')
     AND p_party_id IS NULL THEN
    RAISE EXCEPTION 'Pihak (pelanggan/supplier) wajib dipilih untuk transaksi tipe %',
      p_transaction_type;
  END IF;

  -- T2.7: Tighten simple_adjustment validation
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

  -- Resolve accounts based on transaction type
  CASE p_transaction_type
    WHEN 'opening_cash_balance' THEN
      v_debit_account_id := p_cash_account_id;
      SELECT id INTO v_credit_account_id
      FROM accounts WHERE organization_id = p_organization_id AND code = 3200;
      v_debit_account_name := 'Kas/Bank';
      v_credit_account_name := 'Saldo Awal';

    WHEN 'opening_receivable_balance' THEN
      SELECT id INTO v_debit_account_id
      FROM accounts WHERE organization_id = p_organization_id AND code = 1200;
      SELECT id INTO v_credit_account_id
      FROM accounts WHERE organization_id = p_organization_id AND code = 3200;
      v_debit_account_name := 'Piutang Usaha';
      v_credit_account_name := 'Saldo Awal';

    WHEN 'opening_payable_balance' THEN
      SELECT id INTO v_credit_account_id
      FROM accounts WHERE organization_id = p_organization_id AND code = 2100;
      SELECT id INTO v_debit_account_id
      FROM accounts WHERE organization_id = p_organization_id AND code = 3200;
      v_debit_account_name := 'Saldo Awal';
      v_credit_account_name := 'Utang Usaha';

    WHEN 'cash_sale' THEN
      v_debit_account_id := p_cash_account_id;
      v_debit_account_name := 'Kas/Bank';
      SELECT id INTO v_credit_account_id
      FROM accounts
      WHERE organization_id = p_organization_id
        AND account_type = 'revenue'
        AND is_active = true
        AND (
          (p_category_name IS NOT NULL AND name ILIKE '%' || p_category_name || '%')
          OR code = 4100
        )
      LIMIT 1;
      SELECT name INTO v_credit_account_name
      FROM accounts WHERE id = v_credit_account_id;

    WHEN 'credit_sale' THEN
      IF p_payment_status = 'partial' AND p_partial_amount IS NOT NULL AND p_partial_amount > 0 THEN
        v_debit_account_id := p_cash_account_id;
        v_debit_account_name := 'Kas/Bank';
      ELSE
        SELECT id INTO v_debit_account_id
        FROM accounts WHERE organization_id = p_organization_id AND code = 1200;
        v_debit_account_name := 'Piutang Usaha';
      END IF;
      SELECT id INTO v_credit_account_id
      FROM accounts
      WHERE organization_id = p_organization_id
        AND account_type = 'revenue'
        AND is_active = true
        AND (
          (p_category_name IS NOT NULL AND name ILIKE '%' || p_category_name || '%')
          OR code = 4100
        )
      LIMIT 1;
      SELECT name INTO v_credit_account_name
      FROM accounts WHERE id = v_credit_account_id;

    WHEN 'receive_receivable' THEN
      v_debit_account_id := p_cash_account_id;
      v_debit_account_name := 'Kas/Bank';
      SELECT id INTO v_credit_account_id
      FROM accounts WHERE organization_id = p_organization_id AND code = 1200;
      v_credit_account_name := 'Piutang Usaha';

    WHEN 'cash_purchase' THEN
      IF p_product_id IS NOT NULL THEN
        SELECT id INTO v_debit_account_id
        FROM accounts WHERE organization_id = p_organization_id AND code = 1300;
        v_debit_account_name := 'Persediaan';
      ELSE
        SELECT id INTO v_debit_account_id
        FROM accounts
        WHERE organization_id = p_organization_id
          AND account_type IN ('expense', 'cogs', 'asset')
          AND is_active = true
          AND (
            (p_category_name IS NOT NULL AND name ILIKE '%' || p_category_name || '%')
            OR code = 5100
          )
        LIMIT 1;
        v_debit_account_name := 'Beban/Persediaan';
      END IF;
      v_credit_account_id := p_cash_account_id;
      v_credit_account_name := 'Kas/Bank';

    WHEN 'credit_purchase' THEN
      IF p_product_id IS NOT NULL THEN
        SELECT id INTO v_debit_account_id
        FROM accounts WHERE organization_id = p_organization_id AND code = 1300;
        v_debit_account_name := 'Persediaan';
      ELSE
        SELECT id INTO v_debit_account_id
        FROM accounts
        WHERE organization_id = p_organization_id
          AND account_type IN ('expense', 'cogs', 'asset')
          AND is_active = true
          AND (
            (p_category_name IS NOT NULL AND name ILIKE '%' || p_category_name || '%')
            OR code = 5100
          )
        LIMIT 1;
        v_debit_account_name := 'Beban/Persediaan';
      END IF;
      IF p_payment_status = 'partial' AND p_partial_amount IS NOT NULL AND p_partial_amount > 0 THEN
        v_credit_account_id := p_cash_account_id;
        v_credit_account_name := 'Kas/Bank';
      ELSE
        SELECT id INTO v_credit_account_id
        FROM accounts WHERE organization_id = p_organization_id AND code = 2100;
        v_credit_account_name := 'Utang Usaha';
      END IF;

    WHEN 'pay_payable' THEN
      SELECT id INTO v_debit_account_id
      FROM accounts WHERE organization_id = p_organization_id AND code = 2100;
      v_debit_account_name := 'Utang Usaha';
      v_credit_account_id := p_cash_account_id;
      v_credit_account_name := 'Kas/Bank';

    WHEN 'expense_payment' THEN
      SELECT id INTO v_debit_account_id
      FROM accounts
      WHERE organization_id = p_organization_id
        AND account_type = 'expense'
        AND is_active = true
        AND (
          (p_category_name IS NOT NULL AND name ILIKE '%' || p_category_name || '%')
          OR code = 6190
        )
      LIMIT 1;
      v_debit_account_name := 'Beban';
      v_credit_account_id := p_cash_account_id;
      v_credit_account_name := 'Kas/Bank';

    WHEN 'owner_capital' THEN
      v_debit_account_id := p_cash_account_id;
      v_debit_account_name := 'Kas/Bank';
      SELECT id INTO v_credit_account_id
      FROM accounts WHERE organization_id = p_organization_id AND code = 3100;
      v_credit_account_name := 'Modal Pemilik';

    WHEN 'owner_draw' THEN
      SELECT id INTO v_debit_account_id
      FROM accounts WHERE organization_id = p_organization_id AND code = 3300;
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

  -- Validate required accounts exist
  IF v_debit_account_id IS NULL THEN
    RAISE EXCEPTION 'Akun debit tidak ditemukan untuk jenis transaksi %', p_transaction_type;
  END IF;
  IF v_credit_account_id IS NULL THEN
    RAISE EXCEPTION 'Akun kredit tidak ditemukan untuk jenis transaksi %', p_transaction_type;
  END IF;

  -- Create journal entry
  v_entry_number := public.generate_entry_number(p_organization_id);

  INSERT INTO journal_entries (
    organization_id, entry_number, entry_date, entry_type,
    description, status, posted_at, posted_by
  ) VALUES (
    p_organization_id,
    v_entry_number,
    p_transaction_date,
    'normal',
    p_description,
    'posted',
    now(),
    v_user_id
  ) RETURNING id INTO v_journal_id;

  -- Create debit line
  v_line_order := v_line_order + 1;
  INSERT INTO journal_lines (
    organization_id, journal_entry_id, account_id, party_id,
    debit, credit, description, line_order
  ) VALUES (
    p_organization_id, v_journal_id, v_debit_account_id, p_party_id,
    p_amount, 0, p_description, v_line_order
  );

  -- For partial credit sale: Add additional debit line for remaining receivable
  IF p_transaction_type = 'credit_sale' 
     AND p_payment_status = 'partial' 
     AND p_partial_amount IS NOT NULL 
     AND p_partial_amount > 0 THEN
    DECLARE
      v_receivable_account_id UUID;
      v_remaining_amount NUMERIC;
    BEGIN
      v_remaining_amount := p_amount - p_partial_amount;
      IF v_remaining_amount > 0 THEN
        SELECT id INTO v_receivable_account_id
        FROM accounts WHERE organization_id = p_organization_id AND code = 1200;
        
        v_line_order := v_line_order + 1;
        INSERT INTO journal_lines (
          organization_id, journal_entry_id, account_id, party_id,
          debit, credit, description, line_order
        ) VALUES (
          p_organization_id, v_journal_id, v_receivable_account_id, p_party_id,
          v_remaining_amount, 0, 'Sisa piutang: ' || p_description, v_line_order
        );
      END IF;
    END;
  END IF;

  -- Create credit line
  v_line_order := v_line_order + 1;
  INSERT INTO journal_lines (
    organization_id, journal_entry_id, account_id, party_id,
    debit, credit, description, line_order
  ) VALUES (
    p_organization_id, v_journal_id, v_credit_account_id, p_party_id,
    0, p_amount, p_description, v_line_order
  );

  -- For partial credit purchase: Add additional credit line for remaining payable
  IF p_transaction_type = 'credit_purchase' 
     AND p_payment_status = 'partial' 
     AND p_partial_amount IS NOT NULL 
     AND p_partial_amount > 0 THEN
    DECLARE
      v_payable_account_id UUID;
      v_remaining_amount NUMERIC;
    BEGIN
      v_remaining_amount := p_amount - p_partial_amount;
      IF v_remaining_amount > 0 THEN
        SELECT id INTO v_payable_account_id
        FROM accounts WHERE organization_id = p_organization_id AND code = 2100;
        
        v_line_order := v_line_order + 1;
        INSERT INTO journal_lines (
          organization_id, journal_entry_id, account_id, party_id,
          debit, credit, description, line_order
        ) VALUES (
          p_organization_id, v_journal_id, v_payable_account_id, p_party_id,
          0, v_remaining_amount, 'Sisa utang: ' || p_description, v_line_order
        );
      END IF;
    END;
  END IF;

  -- Validate journal is balanced
  IF (
    SELECT ABS(SUM(debit) - SUM(credit))
    FROM journal_lines
    WHERE journal_entry_id = v_journal_id
  ) > 0.01 THEN
    RAISE EXCEPTION 'Jurnal tidak seimbang';
  END IF;

  -- Create transaction record
  v_txn_number := public.generate_transaction_number(p_organization_id);

  INSERT INTO transactions (
    organization_id, transaction_number, transaction_date,
    transaction_type, amount, party_id, category_name,
    cash_account_id, destination_cash_account_id,
    payment_status, due_date, description, notes,
    status, posted_at, posted_by, created_by
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
    p_payment_status::payment_status,
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
    v_user_id
  ) RETURNING id INTO v_txn_id;

  -- Link journal entry to transaction
  UPDATE journal_entries SET transaction_id = v_txn_id WHERE id = v_journal_id;

  -- Record stock movement if product is involved
  IF p_product_id IS NOT NULL AND p_quantity IS NOT NULL THEN
    DECLARE
      v_movement_type TEXT;
      v_quantity_delta NUMERIC;
      v_unit_cost NUMERIC;
      v_product_purchase_price NUMERIC;
      v_current_stock NUMERIC;
      v_cogs_account_id UUID;
      v_inventory_account_id UUID;
      v_cogs_amount NUMERIC;
    BEGIN
      CASE p_transaction_type
        WHEN 'cash_purchase', 'credit_purchase' THEN
          v_movement_type := 'purchase';
          v_quantity_delta := p_quantity;
          v_unit_cost := p_unit_price;
          
          -- T2.9: Update weighted-average purchase_price
          SELECT current_stock, purchase_price INTO v_current_stock, v_product_purchase_price
          FROM products WHERE id = p_product_id;
          
          IF v_current_stock IS NULL THEN v_current_stock := 0; END IF;
          IF v_product_purchase_price IS NULL THEN v_product_purchase_price := 0; END IF;
          
          -- Weighted average formula:
          -- new_price = ((old_stock * old_price) + (new_qty * new_price)) / (old_stock + new_qty)
          IF v_current_stock + p_quantity > 0 THEN
            UPDATE products
            SET purchase_price = CASE
              WHEN v_current_stock = 0 THEN p_unit_price  -- First purchase
              ELSE ((v_current_stock * v_product_purchase_price) + (p_quantity * p_unit_price)) 
                   / (v_current_stock + p_quantity)
            END,
            updated_at = now()
            WHERE id = p_product_id;
          END IF;
          
        WHEN 'cash_sale', 'credit_sale' THEN
          v_movement_type := 'sale';
          v_quantity_delta := -p_quantity;
          v_unit_cost := NULL;
          
          -- Get product purchase price for COGS calculation (now weighted average)
          SELECT purchase_price INTO v_product_purchase_price
          FROM products WHERE id = p_product_id;
          
          IF v_product_purchase_price IS NULL THEN
            v_product_purchase_price := 0;
          END IF;
          
          v_cogs_amount := v_product_purchase_price * p_quantity;
          
          IF v_cogs_amount > 0 THEN
            SELECT id INTO v_cogs_account_id
            FROM accounts WHERE organization_id = p_organization_id AND code = 5100;
            
            SELECT id INTO v_inventory_account_id
            FROM accounts WHERE organization_id = p_organization_id AND code = 1300;
            
            IF v_cogs_account_id IS NOT NULL AND v_inventory_account_id IS NOT NULL THEN
              DECLARE
                v_cogs_entry_number TEXT;
                v_cogs_journal_id UUID;
              BEGIN
                v_cogs_entry_number := public.generate_entry_number(p_organization_id);
                
                INSERT INTO journal_entries (
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
                
                INSERT INTO journal_lines (
                  organization_id, journal_entry_id, account_id,
                  debit, credit, description, line_order
                ) VALUES (
                  p_organization_id, v_cogs_journal_id, v_cogs_account_id,
                  v_cogs_amount, 0, 'HPP: ' || p_description, 1
                );
                
                INSERT INTO journal_lines (
                  organization_id, journal_entry_id, account_id,
                  debit, credit, description, line_order
                ) VALUES (
                  p_organization_id, v_cogs_journal_id, v_inventory_account_id,
                  0, v_cogs_amount, 'HPP: ' || p_description, 2
                );
              END;
            END IF;
          END IF;
        ELSE
          v_movement_type := NULL;
      END CASE;

      IF v_movement_type IS NOT NULL THEN
        PERFORM public.record_stock_movement(
          p_organization_id,
          p_product_id,
          p_transaction_date,
          v_movement_type,
          v_quantity_delta,
          v_unit_cost,
          v_txn_id,
          p_description
        );
      END IF;
    END;
  END IF;

  -- T2.14: Build impact summary using account's normal_balance
  SELECT normal_balance INTO v_debit_normal FROM accounts WHERE id = v_debit_account_id;
  SELECT normal_balance INTO v_credit_normal FROM accounts WHERE id = v_credit_account_id;

  v_impact := jsonb_build_object(
    'debit_account_id', v_debit_account_id,
    'debit_account', v_debit_account_name,
    'debit_change', CASE WHEN v_debit_normal = 'debit' THEN 'increase' ELSE 'decrease' END,
    'credit_account_id', v_credit_account_id,
    'credit_account', v_credit_account_name,
    'credit_change', CASE WHEN v_credit_normal = 'credit' THEN 'increase' ELSE 'decrease' END,
    'amount', p_amount
  );

  -- Create audit log
  INSERT INTO audit_logs (
    organization_id, actor_user_id, entity_type, entity_id,
    action, after_data
  ) VALUES (
    p_organization_id, v_user_id, 'transaction', v_txn_id,
    'post', jsonb_build_object(
      'transaction_type', p_transaction_type,
      'amount', p_amount,
      'journal_entry_id', v_journal_id
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.post_transaction(UUID, DATE, TEXT, NUMERIC, UUID, TEXT, UUID, UUID, TEXT, NUMERIC, DATE, TEXT, TEXT, UUID, NUMERIC, NUMERIC) TO authenticated;

COMMIT;
