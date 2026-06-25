-- ============================================================
-- LEDJER MVP — Accounting Engine: post_transaction
-- ============================================================

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
  v_txn_limit INTEGER;
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
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- Check membership
  SELECT role::TEXT INTO v_role
  FROM organization_members
  WHERE organization_id = p_organization_id
    AND user_id = v_user_id
    AND status = 'active';

  IF v_role IS NULL THEN
    RAISE EXCEPTION 'You are not a member of this organization';
  END IF;

  -- Check staff permission
  IF v_role = 'staff' THEN
    IF NOT public.has_permission(p_organization_id, 'can_create_transaction') THEN
      RAISE EXCEPTION 'You do not have permission to create transactions';
    END IF;
  END IF;

  -- Check plan limit
  SELECT current_plan INTO v_plan
  FROM organizations WHERE id = p_organization_id;

  IF v_plan = 'free' THEN
    v_txn_count := public.get_monthly_transaction_count(p_organization_id);
    IF v_txn_count >= 50 THEN
      RAISE EXCEPTION 'Free plan limit reached (50 transactions/month). Please upgrade.';
    END IF;
  END IF;

  -- Validate amount
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be positive';
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
      -- Find revenue account based on category
      SELECT id INTO v_credit_account_id
      FROM accounts
      WHERE organization_id = p_organization_id
        AND account_type = 'revenue'
        AND is_active = true
        AND (
          (p_category_name IS NOT NULL AND name ILIKE '%' || replace(replace(replace(p_category_name, '\', '\\'), '%', '\%'), '_', '\_') || '%' ESCAPE '\')
          OR code = 4100
        )
      LIMIT 1;
      SELECT name INTO v_credit_account_name
      FROM accounts WHERE id = v_credit_account_id;

    WHEN 'credit_sale' THEN
      -- Check if partial payment
      IF p_payment_status = 'partial' AND p_partial_amount IS NOT NULL AND p_partial_amount > 0 THEN
        -- Split: Debit Kas (partial), Debit Piutang (remaining)
        v_debit_account_id := p_cash_account_id;
        v_debit_account_name := 'Kas/Bank';
        -- Create additional debit line for receivable after main entry
      ELSE
        -- Full credit: Debit Piutang
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
          (p_category_name IS NOT NULL AND name ILIKE '%' || replace(replace(replace(p_category_name, '\', '\\'), '%', '\%'), '_', '\_') || '%' ESCAPE '\')
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
      -- Debit: expense/inventory account, Credit: cash/bank
      IF p_product_id IS NOT NULL THEN
        -- Purchase for inventory: Debit Inventory
        SELECT id INTO v_debit_account_id
        FROM accounts
        WHERE organization_id = p_organization_id AND code = 1300;
        v_debit_account_name := 'Persediaan';
      ELSE
        -- Purchase as expense
        SELECT id INTO v_debit_account_id
        FROM accounts
        WHERE organization_id = p_organization_id
          AND account_type IN ('expense', 'cogs', 'asset')
          AND is_active = true
          AND (
            (p_category_name IS NOT NULL AND name ILIKE '%' || replace(replace(replace(p_category_name, '\', '\\'), '%', '\%'), '_', '\_') || '%' ESCAPE '\')
            OR code = 5100
          )
        LIMIT 1;
        v_debit_account_name := 'Beban/Persediaan';
      END IF;
      v_credit_account_id := p_cash_account_id;
      v_credit_account_name := 'Kas/Bank';

    WHEN 'credit_purchase' THEN
      -- Expense/Inventory debit
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
            (p_category_name IS NOT NULL AND name ILIKE '%' || replace(replace(replace(p_category_name, '\', '\\'), '%', '\%'), '_', '\_') || '%' ESCAPE '\')
            OR code = 5100
          )
        LIMIT 1;
        v_debit_account_name := 'Beban/Persediaan';
      END IF;
      -- Check if partial payment
      IF p_payment_status = 'partial' AND p_partial_amount IS NOT NULL AND p_partial_amount > 0 THEN
        -- Split: Credit Kas (partial), Credit Utang (remaining)
        v_credit_account_id := p_cash_account_id;
        v_credit_account_name := 'Kas/Bank';
      ELSE
        -- Full credit: Credit Utang
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
      -- Debit: expense account, Credit: cash/bank
      SELECT id INTO v_debit_account_id
      FROM accounts
      WHERE organization_id = p_organization_id
        AND account_type = 'expense'
        AND is_active = true
        AND (
          (p_category_name IS NOT NULL AND name ILIKE '%' || replace(replace(replace(p_category_name, '\', '\\'), '%', '\%'), '_', '\_') || '%' ESCAPE '\')
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
      IF v_role != 'owner' THEN
        RAISE EXCEPTION 'Only owners can create manual adjustments';
      END IF;
      v_debit_account_id := p_cash_account_id;
      v_debit_account_name := 'Rekening Debit';
      v_credit_account_id := p_destination_cash_account_id;
      v_credit_account_name := 'Rekening Kredit';

    ELSE
      RAISE EXCEPTION 'Unknown transaction type: %', p_transaction_type;
  END CASE;

  -- Validate required accounts exist
  IF v_debit_account_id IS NULL THEN
    RAISE EXCEPTION 'Debit account not found for transaction type %', p_transaction_type;
  END IF;
  IF v_credit_account_id IS NULL THEN
    RAISE EXCEPTION 'Credit account not found for transaction type %', p_transaction_type;
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
    RAISE EXCEPTION 'Journal is not balanced';
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
      v_cogs_account_id UUID;
      v_inventory_account_id UUID;
      v_cogs_amount NUMERIC;
    BEGIN
      -- Determine movement type and quantity direction
      CASE p_transaction_type
        WHEN 'cash_purchase', 'credit_purchase' THEN
          v_movement_type := 'purchase';
          v_quantity_delta := p_quantity; -- positive = increase stock
          v_unit_cost := p_unit_price;
        WHEN 'cash_sale', 'credit_sale' THEN
          v_movement_type := 'sale';
          v_quantity_delta := -p_quantity; -- negative = decrease stock
          v_unit_cost := NULL;
          
          -- Get product purchase price for COGS calculation
          SELECT purchase_price INTO v_product_purchase_price
          FROM products WHERE id = p_product_id;
          
          IF v_product_purchase_price IS NULL THEN
            v_product_purchase_price := 0;
          END IF;
          
          v_cogs_amount := v_product_purchase_price * p_quantity;
          
          -- Create COGS journal entry (Debit HPP, Credit Inventory)
          IF v_cogs_amount > 0 THEN
            -- Get COGS and Inventory accounts
            SELECT id INTO v_cogs_account_id
            FROM accounts WHERE organization_id = p_organization_id AND code = 5100;
            
            SELECT id INTO v_inventory_account_id
            FROM accounts WHERE organization_id = p_organization_id AND code = 1300;
            
            IF v_cogs_account_id IS NOT NULL AND v_inventory_account_id IS NOT NULL THEN
              -- Create separate journal entry for COGS
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
                
                -- Debit: HPP
                INSERT INTO journal_lines (
                  organization_id, journal_entry_id, account_id,
                  debit, credit, description, line_order
                ) VALUES (
                  p_organization_id, v_cogs_journal_id, v_cogs_account_id,
                  v_cogs_amount, 0, 'HPP: ' || p_description, 1
                );
                
                -- Credit: Inventory
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

  -- Build impact summary
  v_impact := jsonb_build_object(
    'debit_account', v_debit_account_name,
    'credit_account', v_credit_account_name,
    'debit_change', CASE
      WHEN v_debit_account_name = 'Kas/Bank' OR v_debit_account_name LIKE '%Kas%' THEN 'increase'
      WHEN v_debit_account_name = 'Piutang Usaha' THEN 'increase'
      WHEN v_debit_account_name = 'Utang Usaha' THEN 'increase'
      WHEN v_debit_account_name = 'Prive' THEN 'increase'
      ELSE 'increase'
    END,
    'credit_change', CASE
      WHEN v_credit_account_name = 'Kas/Bank' OR v_credit_account_name LIKE '%Kas%' THEN 'decrease'
      WHEN v_credit_account_name = 'Piutang Usaha' THEN 'decrease'
      WHEN v_credit_account_name = 'Utang Usaha' THEN 'increase'
      WHEN v_credit_account_name = 'Modal Pemilik' THEN 'increase'
      WHEN v_credit_account_name = 'Saldo Awal' THEN 'increase'
      ELSE 'increase'
    END
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
