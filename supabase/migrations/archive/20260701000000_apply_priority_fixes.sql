-- ============================================================
-- LEDJER MVP — Priority fixes follow-up
-- Applies final overrides for accounting correctness, inventory
-- tenant integrity, historical reporting, and internal RPC exposure.
-- ============================================================
-- Chronology note: This and subsequent migrations (20260701-20260729)
-- were authored during a continuous hardening session. The dates in
-- filenames reflect the session timeline for ordering consistency,
-- not calendar dates. Migration ordering within the sequence is what
-- matters; absolute dates have no effect on Supabase apply order.

-- Count plan usage by when the transaction was created, not by the
-- user-editable accounting transaction date.
CREATE OR REPLACE FUNCTION public.get_monthly_transaction_count(
  p_org_id UUID
)
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER;
BEGIN
  IF NOT public.is_org_member(p_org_id) THEN
    RAISE EXCEPTION 'You are not a member of this organization';
  END IF;

  SELECT COUNT(*)::INTEGER
  INTO v_count
  FROM public.transactions
  WHERE organization_id = p_org_id
    AND status IN ('posted', 'voided')
    AND original_transaction_id IS NULL
    AND transaction_type NOT LIKE 'opening_%'
    AND created_at >= date_trunc('month', now())
    AND created_at < date_trunc('month', now()) + INTERVAL '1 month';

  RETURN v_count;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

-- Same-organization integrity constraints for inventory references.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_organization_id_id_key') THEN
    ALTER TABLE public.products
      ADD CONSTRAINT products_organization_id_id_key UNIQUE (organization_id, id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_inventory_account_same_org_fkey') THEN
    ALTER TABLE public.products
      ADD CONSTRAINT products_inventory_account_same_org_fkey
      FOREIGN KEY (organization_id, inventory_account_id)
      REFERENCES public.accounts (organization_id, id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_cogs_account_same_org_fkey') THEN
    ALTER TABLE public.products
      ADD CONSTRAINT products_cogs_account_same_org_fkey
      FOREIGN KEY (organization_id, cogs_account_id)
      REFERENCES public.accounts (organization_id, id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_revenue_account_same_org_fkey') THEN
    ALTER TABLE public.products
      ADD CONSTRAINT products_revenue_account_same_org_fkey
      FOREIGN KEY (organization_id, revenue_account_id)
      REFERENCES public.accounts (organization_id, id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stock_movements_product_same_org_fkey') THEN
    ALTER TABLE public.stock_movements
      ADD CONSTRAINT stock_movements_product_same_org_fkey
      FOREIGN KEY (organization_id, product_id)
      REFERENCES public.products (organization_id, id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stock_movements_transaction_same_org_fkey') THEN
    ALTER TABLE public.stock_movements
      ADD CONSTRAINT stock_movements_transaction_same_org_fkey
      FOREIGN KEY (organization_id, transaction_id)
      REFERENCES public.transactions (organization_id, id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'transactions_product_same_org_fkey') THEN
    ALTER TABLE public.transactions
      ADD CONSTRAINT transactions_product_same_org_fkey
      FOREIGN KEY (organization_id, product_id)
      REFERENCES public.products (organization_id, id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_journal_entries_org_status_date
  ON public.journal_entries (organization_id, status, entry_date);
CREATE INDEX IF NOT EXISTS idx_journal_lines_org_entry_account
  ON public.journal_lines (organization_id, journal_entry_id, account_id);
CREATE INDEX IF NOT EXISTS idx_journal_lines_org_account_entry
  ON public.journal_lines (organization_id, account_id, journal_entry_id);
CREATE INDEX IF NOT EXISTS idx_transactions_org_status_created
  ON public.transactions (organization_id, status, created_at)
  WHERE original_transaction_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_stock_movements_org_product_date
  ON public.stock_movements (organization_id, product_id, movement_date DESC, created_at DESC);

-- Product and stock writes must go through controlled paths.
DROP POLICY IF EXISTS "Members with permission can create products" ON public.products;
DROP POLICY IF EXISTS "Members with permission can update products" ON public.products;
DROP POLICY IF EXISTS "Members with permission can delete products" ON public.products;
DROP POLICY IF EXISTS "System can insert stock movements" ON public.stock_movements;
DROP POLICY IF EXISTS "No direct stock movement inserts" ON public.stock_movements;

CREATE POLICY "Members with product permission can create products"
  ON public.products FOR INSERT
  WITH CHECK (public.has_permission(organization_id, 'can_manage_products'));

CREATE POLICY "Members with product permission can update products"
  ON public.products FOR UPDATE
  USING (public.has_permission(organization_id, 'can_manage_products'))
  WITH CHECK (public.has_permission(organization_id, 'can_manage_products'));

CREATE POLICY "Owners can delete products"
  ON public.products FOR DELETE
  USING (public.get_org_role(organization_id) = 'owner');

CREATE POLICY "No direct stock movement inserts"
  ON public.stock_movements FOR INSERT
  WITH CHECK (false);

CREATE OR REPLACE FUNCTION public.protect_product_stock_update()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.current_stock IS DISTINCT FROM NEW.current_stock
     AND COALESCE(current_setting('ledjer.allow_stock_update', true), '') != 'on' THEN
    RAISE EXCEPTION 'Product stock cannot be changed directly. Use transaction or stock movement functions.';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS protect_product_stock_update_trigger ON public.products;
CREATE TRIGGER protect_product_stock_update_trigger
  BEFORE UPDATE ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_product_stock_update();

CREATE OR REPLACE FUNCTION public.update_product_stock(
  p_product_id UUID,
  p_quantity_delta NUMERIC
)
RETURNS NUMERIC AS $$
DECLARE
  v_org_id UUID;
  v_current_stock NUMERIC;
  v_new_stock NUMERIC;
BEGIN
  IF p_quantity_delta IS NULL OR p_quantity_delta = 0 THEN
    RAISE EXCEPTION 'Stock quantity delta must be non-zero';
  END IF;

  SELECT organization_id, current_stock
  INTO v_org_id, v_current_stock
  FROM public.products
  WHERE id = p_product_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Product not found';
  END IF;

  IF NOT (
    public.has_permission(v_org_id, 'can_manage_products')
    OR public.has_permission(v_org_id, 'can_create_transaction')
    OR public.has_permission(v_org_id, 'can_void_transaction')
  ) THEN
    RAISE EXCEPTION 'You do not have permission to update product stock';
  END IF;

  IF v_current_stock + p_quantity_delta < 0 THEN
    RAISE EXCEPTION 'Insufficient stock. Available: %, Required: %',
      v_current_stock, ABS(p_quantity_delta);
  END IF;

  PERFORM set_config('ledjer.allow_stock_update', 'on', true);

  UPDATE public.products
  SET current_stock = current_stock + p_quantity_delta,
      updated_at = now()
  WHERE id = p_product_id
  RETURNING current_stock INTO v_new_stock;

  RETURN v_new_stock;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.record_stock_movement(
  p_organization_id UUID,
  p_product_id UUID,
  p_movement_date DATE,
  p_movement_type TEXT,
  p_quantity NUMERIC,
  p_unit_cost NUMERIC DEFAULT NULL,
  p_transaction_id UUID DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_movement_id UUID;
  v_stock_after NUMERIC;
  v_product_org_id UUID;
BEGIN
  IF p_movement_type NOT IN ('purchase', 'sale', 'adjustment', 'void', 'opening_balance') THEN
    RAISE EXCEPTION 'Invalid stock movement type: %', p_movement_type;
  END IF;

  IF p_quantity IS NULL OR p_quantity = 0 THEN
    RAISE EXCEPTION 'Stock movement quantity must be non-zero';
  END IF;

  SELECT organization_id
  INTO v_product_org_id
  FROM public.products
  WHERE id = p_product_id;

  IF NOT FOUND OR v_product_org_id != p_organization_id THEN
    RAISE EXCEPTION 'Product does not belong to this organization';
  END IF;

  IF p_transaction_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.transactions
    WHERE id = p_transaction_id
      AND organization_id = p_organization_id
  ) THEN
    RAISE EXCEPTION 'Transaction does not belong to this organization';
  END IF;

  IF p_transaction_id IS NULL THEN
    IF NOT public.has_permission(p_organization_id, 'can_manage_products') THEN
      RAISE EXCEPTION 'You do not have permission to create manual stock movements';
    END IF;
  ELSE
    IF NOT (
      public.has_permission(p_organization_id, 'can_create_transaction')
      OR public.has_permission(p_organization_id, 'can_void_transaction')
      OR public.has_permission(p_organization_id, 'can_manage_products')
    ) THEN
      RAISE EXCEPTION 'You do not have permission to create stock movements';
    END IF;
  END IF;

  v_stock_after := public.update_product_stock(p_product_id, p_quantity);

  INSERT INTO public.stock_movements (
    organization_id, product_id, movement_date, movement_type,
    quantity, unit_cost, transaction_id, stock_after, notes, created_by
  ) VALUES (
    p_organization_id, p_product_id, p_movement_date, p_movement_type,
    p_quantity, p_unit_cost, p_transaction_id, v_stock_after, p_notes, auth.uid()
  ) RETURNING id INTO v_movement_id;

  RETURN v_movement_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.record_initial_product_stock()
RETURNS TRIGGER AS $$
DECLARE
  v_inventory_account_id UUID;
  v_opening_account_id UUID;
  v_entry_id UUID;
  v_entry_number TEXT;
  v_initial_value NUMERIC;
  v_actor UUID;
BEGIN
  IF COALESCE(NEW.current_stock, 0) <= 0 THEN
    RETURN NEW;
  END IF;

  v_actor := COALESCE(NEW.created_by, auth.uid());
  v_initial_value := COALESCE(NEW.current_stock, 0) * COALESCE(NEW.purchase_price, 0);

  INSERT INTO public.stock_movements (
    organization_id, product_id, movement_date, movement_type,
    quantity, unit_cost, transaction_id, stock_after, notes, created_by
  ) VALUES (
    NEW.organization_id, NEW.id, CURRENT_DATE, 'opening_balance',
    NEW.current_stock, NEW.purchase_price, NULL, NEW.current_stock,
    'Stok awal produk', v_actor
  );

  IF v_initial_value > 0 THEN
    v_inventory_account_id := NEW.inventory_account_id;
    IF v_inventory_account_id IS NULL THEN
      SELECT id
      INTO v_inventory_account_id
      FROM public.accounts
      WHERE organization_id = NEW.organization_id
        AND code = 1300
      LIMIT 1;
    END IF;

    SELECT id
    INTO v_opening_account_id
    FROM public.accounts
    WHERE organization_id = NEW.organization_id
      AND code = 3200
    LIMIT 1;

    IF v_inventory_account_id IS NULL OR v_opening_account_id IS NULL THEN
      RAISE EXCEPTION 'Inventory and opening balance accounts are required for initial stock value';
    END IF;

    v_entry_number := public.generate_entry_number(NEW.organization_id);

    INSERT INTO public.journal_entries (
      organization_id, entry_number, entry_date, entry_type,
      description, status, posted_at, posted_by
    ) VALUES (
      NEW.organization_id, v_entry_number, CURRENT_DATE, 'opening_balance',
      'Stok awal produk: ' || NEW.name, 'posted', now(), v_actor
    ) RETURNING id INTO v_entry_id;

    INSERT INTO public.journal_lines (
      organization_id, journal_entry_id, account_id,
      debit, credit, description, line_order
    ) VALUES
      (
        NEW.organization_id, v_entry_id, v_inventory_account_id,
        v_initial_value, 0, 'Stok awal produk: ' || NEW.name, 1
      ),
      (
        NEW.organization_id, v_entry_id, v_opening_account_id,
        0, v_initial_value, 'Stok awal produk: ' || NEW.name, 2
      );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS record_initial_product_stock_trigger ON public.products;
CREATE TRIGGER record_initial_product_stock_trigger
  AFTER INSERT ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION public.record_initial_product_stock();

CREATE OR REPLACE FUNCTION public.get_product_info(
  p_product_id UUID
)
RETURNS JSONB AS $$
DECLARE
  v_product RECORD;
BEGIN
  SELECT
    p.id, p.organization_id, p.code, p.name, p.description, p.unit,
    p.purchase_price, p.selling_price, p.current_stock, p.min_stock,
    p.is_active
  INTO v_product
  FROM public.products p
  WHERE p.id = p_product_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Product not found';
  END IF;

  IF NOT public.is_org_member(v_product.organization_id) THEN
    RAISE EXCEPTION 'Product not found';
  END IF;

  RETURN jsonb_build_object(
    'id', v_product.id,
    'code', v_product.code,
    'name', v_product.name,
    'description', v_product.description,
    'unit', v_product.unit,
    'purchase_price', v_product.purchase_price,
    'selling_price', v_product.selling_price,
    'current_stock', v_product.current_stock,
    'min_stock', v_product.min_stock,
    'is_active', v_product.is_active,
    'low_stock', v_product.current_stock <= v_product.min_stock
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

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
  v_receivable_account_id UUID;
  v_payable_account_id UUID;
  v_debit_account_name TEXT;
  v_credit_account_name TEXT;
  v_journal_id UUID;
  v_txn_id UUID;
  v_txn_number TEXT;
  v_entry_number TEXT;
  v_impact JSONB := '{}'::JSONB;
  v_line_order INTEGER := 0;
  v_remaining_amount NUMERIC;
  v_product_purchase_price NUMERIC;
  v_product_org_id UUID;
  v_cogs_account_id UUID;
  v_inventory_account_id UUID;
  v_cogs_amount NUMERIC;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT role::TEXT INTO v_role
  FROM public.organization_members
  WHERE organization_id = p_organization_id
    AND user_id = v_user_id
    AND status = 'active';

  IF v_role IS NULL THEN
    RAISE EXCEPTION 'You are not a member of this organization';
  END IF;

  IF v_role = 'staff'
     AND NOT public.has_permission(p_organization_id, 'can_create_transaction') THEN
    RAISE EXCEPTION 'You do not have permission to create transactions';
  END IF;

  SELECT current_plan INTO v_plan
  FROM public.organizations
  WHERE id = p_organization_id;

  IF v_plan = 'free' THEN
    v_txn_count := public.get_monthly_transaction_count(p_organization_id);
    IF v_txn_count >= 50 THEN
      RAISE EXCEPTION 'Free plan limit reached (50 transactions/month). Please upgrade.';
    END IF;
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be positive';
  END IF;

  IF p_payment_status NOT IN ('paid', 'unpaid', 'partial') THEN
    RAISE EXCEPTION 'Invalid payment status: %', p_payment_status;
  END IF;

  IF p_payment_status IN ('unpaid', 'partial')
     AND p_transaction_type NOT IN ('credit_sale', 'credit_purchase') THEN
    RAISE EXCEPTION 'Unpaid or partial payment status is only valid for credit sale or credit purchase transactions';
  END IF;

  IF p_transaction_type IN ('credit_sale', 'credit_purchase')
     AND p_payment_status = 'paid' THEN
    RAISE EXCEPTION 'Use cash sale or cash purchase for fully paid transactions';
  END IF;

  IF p_payment_status = 'partial' THEN
    IF p_partial_amount IS NULL OR p_partial_amount <= 0 THEN
      RAISE EXCEPTION 'Partial payment amount must be positive';
    END IF;
    IF p_partial_amount >= p_amount THEN
      RAISE EXCEPTION 'Partial payment amount must be less than total amount';
    END IF;
    IF p_cash_account_id IS NULL THEN
      RAISE EXCEPTION 'Cash/bank account is required for partial payments';
    END IF;
  END IF;

  IF p_cash_account_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.accounts
    WHERE id = p_cash_account_id
      AND organization_id = p_organization_id
      AND is_active = true
  ) THEN
    RAISE EXCEPTION 'Cash/bank account does not belong to this organization';
  END IF;

  IF p_destination_cash_account_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.accounts
    WHERE id = p_destination_cash_account_id
      AND organization_id = p_organization_id
      AND is_active = true
  ) THEN
    RAISE EXCEPTION 'Destination cash/bank account does not belong to this organization';
  END IF;

  IF p_transaction_type IN (
    'cash_sale', 'receive_receivable', 'cash_purchase', 'pay_payable',
    'expense_payment', 'owner_capital', 'owner_draw', 'cash_transfer',
    'opening_cash_balance'
  ) AND p_cash_account_id IS NULL THEN
    RAISE EXCEPTION 'Cash/bank account is required for transaction type %', p_transaction_type;
  END IF;

  IF p_transaction_type = 'cash_transfer' THEN
    IF p_destination_cash_account_id IS NULL THEN
      RAISE EXCEPTION 'Destination cash/bank account is required for cash transfers';
    END IF;
    IF p_cash_account_id = p_destination_cash_account_id THEN
      RAISE EXCEPTION 'Source and destination cash/bank accounts must be different';
    END IF;
  END IF;

  IF p_product_id IS NOT NULL THEN
    IF p_transaction_type NOT IN ('cash_purchase', 'credit_purchase', 'cash_sale', 'credit_sale') THEN
      RAISE EXCEPTION 'Products can only be used in sale or purchase transactions';
    END IF;
    IF p_quantity IS NULL OR p_quantity <= 0 THEN
      RAISE EXCEPTION 'Product quantity must be positive';
    END IF;
    IF p_unit_price IS NULL OR p_unit_price < 0 THEN
      RAISE EXCEPTION 'Product unit price must be zero or positive';
    END IF;
    IF ABS(p_amount - (p_quantity * p_unit_price)) > 0.01 THEN
      RAISE EXCEPTION 'Transaction amount must equal quantity times unit price';
    END IF;

    SELECT organization_id, purchase_price
    INTO v_product_org_id, v_product_purchase_price
    FROM public.products
    WHERE id = p_product_id
      AND is_active = true;

    IF NOT FOUND OR v_product_org_id != p_organization_id THEN
      RAISE EXCEPTION 'Product does not belong to this organization';
    END IF;
  END IF;

  CASE p_transaction_type
    WHEN 'opening_cash_balance' THEN
      v_debit_account_id := p_cash_account_id;
      SELECT id INTO v_credit_account_id
      FROM public.accounts WHERE organization_id = p_organization_id AND code = 3200;
      v_debit_account_name := 'Kas/Bank';
      v_credit_account_name := 'Saldo Awal';

    WHEN 'opening_receivable_balance' THEN
      SELECT id INTO v_debit_account_id
      FROM public.accounts WHERE organization_id = p_organization_id AND code = 1200;
      SELECT id INTO v_credit_account_id
      FROM public.accounts WHERE organization_id = p_organization_id AND code = 3200;
      v_debit_account_name := 'Piutang Usaha';
      v_credit_account_name := 'Saldo Awal';

    WHEN 'opening_payable_balance' THEN
      SELECT id INTO v_credit_account_id
      FROM public.accounts WHERE organization_id = p_organization_id AND code = 2100;
      SELECT id INTO v_debit_account_id
      FROM public.accounts WHERE organization_id = p_organization_id AND code = 3200;
      v_debit_account_name := 'Saldo Awal';
      v_credit_account_name := 'Utang Usaha';

    WHEN 'cash_sale' THEN
      v_debit_account_id := p_cash_account_id;
      v_debit_account_name := 'Kas/Bank';
      SELECT id, name INTO v_credit_account_id, v_credit_account_name
      FROM public.accounts
      WHERE organization_id = p_organization_id
        AND account_type = 'revenue'
        AND is_active = true
        AND ((p_category_name IS NOT NULL AND name ILIKE '%' || replace(replace(replace(p_category_name, '\', '\\'), '%', '\%'), '_', '\_') || '%' ESCAPE '\') OR code = 4100)
      ORDER BY CASE WHEN p_category_name IS NOT NULL AND name ILIKE '%' || replace(replace(replace(p_category_name, '\', '\\'), '%', '\%'), '_', '\_') || '%' ESCAPE '\' THEN 0 ELSE 1 END, code
      LIMIT 1;

    WHEN 'credit_sale' THEN
      SELECT id INTO v_receivable_account_id
      FROM public.accounts WHERE organization_id = p_organization_id AND code = 1200;
      IF p_payment_status = 'partial' THEN
        v_debit_account_id := p_cash_account_id;
        v_debit_account_name := 'Kas/Bank + Piutang Usaha';
      ELSE
        v_debit_account_id := v_receivable_account_id;
        v_debit_account_name := 'Piutang Usaha';
      END IF;
      SELECT id, name INTO v_credit_account_id, v_credit_account_name
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
      FROM public.accounts WHERE organization_id = p_organization_id AND code = 1200;
      v_credit_account_name := 'Piutang Usaha';

    WHEN 'cash_purchase' THEN
      IF p_product_id IS NOT NULL THEN
        SELECT id INTO v_debit_account_id
        FROM public.accounts WHERE organization_id = p_organization_id AND code = 1300;
        v_debit_account_name := 'Persediaan';
      ELSE
        SELECT id, name INTO v_debit_account_id, v_debit_account_name
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
        SELECT id INTO v_debit_account_id
        FROM public.accounts WHERE organization_id = p_organization_id AND code = 1300;
        v_debit_account_name := 'Persediaan';
      ELSE
        SELECT id, name INTO v_debit_account_id, v_debit_account_name
        FROM public.accounts
        WHERE organization_id = p_organization_id
          AND account_type IN ('expense', 'cogs', 'asset')
          AND is_active = true
          AND ((p_category_name IS NOT NULL AND name ILIKE '%' || replace(replace(replace(p_category_name, '\', '\\'), '%', '\%'), '_', '\_') || '%' ESCAPE '\') OR code = 5100)
        ORDER BY CASE WHEN p_category_name IS NOT NULL AND name ILIKE '%' || replace(replace(replace(p_category_name, '\', '\\'), '%', '\%'), '_', '\_') || '%' ESCAPE '\' THEN 0 ELSE 1 END, code
        LIMIT 1;
      END IF;
      SELECT id INTO v_payable_account_id
      FROM public.accounts WHERE organization_id = p_organization_id AND code = 2100;
      IF p_payment_status = 'partial' THEN
        v_credit_account_id := p_cash_account_id;
        v_credit_account_name := 'Kas/Bank + Utang Usaha';
      ELSE
        v_credit_account_id := v_payable_account_id;
        v_credit_account_name := 'Utang Usaha';
      END IF;

    WHEN 'pay_payable' THEN
      SELECT id INTO v_debit_account_id
      FROM public.accounts WHERE organization_id = p_organization_id AND code = 2100;
      v_debit_account_name := 'Utang Usaha';
      v_credit_account_id := p_cash_account_id;
      v_credit_account_name := 'Kas/Bank';

    WHEN 'expense_payment' THEN
      SELECT id, name INTO v_debit_account_id, v_debit_account_name
      FROM public.accounts
      WHERE organization_id = p_organization_id
        AND account_type = 'expense'
        AND is_active = true
        AND ((p_category_name IS NOT NULL AND name ILIKE '%' || replace(replace(replace(p_category_name, '\', '\\'), '%', '\%'), '_', '\_') || '%' ESCAPE '\') OR code = 6190)
      ORDER BY CASE WHEN p_category_name IS NOT NULL AND name ILIKE '%' || replace(replace(replace(p_category_name, '\', '\\'), '%', '\%'), '_', '\_') || '%' ESCAPE '\' THEN 0 ELSE 1 END, code
      LIMIT 1;
      v_credit_account_id := p_cash_account_id;
      v_credit_account_name := 'Kas/Bank';

    WHEN 'owner_capital' THEN
      v_debit_account_id := p_cash_account_id;
      v_debit_account_name := 'Kas/Bank';
      SELECT id INTO v_credit_account_id
      FROM public.accounts WHERE organization_id = p_organization_id AND code = 3100;
      v_credit_account_name := 'Modal Pemilik';

    WHEN 'owner_draw' THEN
      SELECT id INTO v_debit_account_id
      FROM public.accounts WHERE organization_id = p_organization_id AND code = 3300;
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

  IF v_debit_account_id IS NULL THEN
    RAISE EXCEPTION 'Debit account not found for transaction type %', p_transaction_type;
  END IF;
  IF v_credit_account_id IS NULL THEN
    RAISE EXCEPTION 'Credit account not found for transaction type %', p_transaction_type;
  END IF;

  v_entry_number := public.generate_entry_number(p_organization_id);

  INSERT INTO public.journal_entries (
    organization_id, entry_number, entry_date, entry_type,
    description, status, posted_at, posted_by
  ) VALUES (
    p_organization_id,
    v_entry_number,
    p_transaction_date,
    CASE
      WHEN p_transaction_type LIKE 'opening_%' THEN 'opening_balance'::public.journal_entry_type
      ELSE 'normal'::public.journal_entry_type
    END,
    p_description,
    'posted',
    now(),
    v_user_id
  ) RETURNING id INTO v_journal_id;

  IF p_transaction_type = 'credit_sale' AND p_payment_status = 'partial' THEN
    v_remaining_amount := p_amount - p_partial_amount;

    v_line_order := v_line_order + 1;
    INSERT INTO public.journal_lines (
      organization_id, journal_entry_id, account_id, party_id,
      debit, credit, description, line_order
    ) VALUES (
      p_organization_id, v_journal_id, p_cash_account_id, p_party_id,
      p_partial_amount, 0, p_description, v_line_order
    );

    v_line_order := v_line_order + 1;
    INSERT INTO public.journal_lines (
      organization_id, journal_entry_id, account_id, party_id,
      debit, credit, description, line_order
    ) VALUES (
      p_organization_id, v_journal_id, v_receivable_account_id, p_party_id,
      v_remaining_amount, 0, 'Sisa piutang: ' || p_description, v_line_order
    );
  ELSE
    v_line_order := v_line_order + 1;
    INSERT INTO public.journal_lines (
      organization_id, journal_entry_id, account_id, party_id,
      debit, credit, description, line_order
    ) VALUES (
      p_organization_id, v_journal_id, v_debit_account_id, p_party_id,
      p_amount, 0, p_description, v_line_order
    );
  END IF;

  IF p_transaction_type = 'credit_purchase' AND p_payment_status = 'partial' THEN
    v_remaining_amount := p_amount - p_partial_amount;

    v_line_order := v_line_order + 1;
    INSERT INTO public.journal_lines (
      organization_id, journal_entry_id, account_id, party_id,
      debit, credit, description, line_order
    ) VALUES (
      p_organization_id, v_journal_id, p_cash_account_id, p_party_id,
      0, p_partial_amount, p_description, v_line_order
    );

    v_line_order := v_line_order + 1;
    INSERT INTO public.journal_lines (
      organization_id, journal_entry_id, account_id, party_id,
      debit, credit, description, line_order
    ) VALUES (
      p_organization_id, v_journal_id, v_payable_account_id, p_party_id,
      0, v_remaining_amount, 'Sisa utang: ' || p_description, v_line_order
    );
  ELSE
    v_line_order := v_line_order + 1;
    INSERT INTO public.journal_lines (
      organization_id, journal_entry_id, account_id, party_id,
      debit, credit, description, line_order
    ) VALUES (
      p_organization_id, v_journal_id, v_credit_account_id, p_party_id,
      0, p_amount, p_description, v_line_order
    );
  END IF;

  IF (
    SELECT ABS(COALESCE(SUM(debit), 0) - COALESCE(SUM(credit), 0))
    FROM public.journal_lines
    WHERE journal_entry_id = v_journal_id
  ) > 0.01 THEN
    RAISE EXCEPTION 'Journal is not balanced';
  END IF;

  v_txn_number := public.generate_transaction_number(p_organization_id);

  INSERT INTO public.transactions (
    organization_id, transaction_number, transaction_date,
    transaction_type, amount, party_id, category_name,
    cash_account_id, destination_cash_account_id,
    payment_status, due_date, description, notes,
    status, posted_at, posted_by, created_by,
    product_id, quantity, unit_price
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
    p_payment_status::public.payment_status,
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
    v_user_id,
    p_product_id,
    p_quantity,
    p_unit_price
  ) RETURNING id INTO v_txn_id;

  UPDATE public.journal_entries
  SET transaction_id = v_txn_id
  WHERE id = v_journal_id;

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
    ELSIF p_transaction_type IN ('cash_sale', 'credit_sale') THEN
      v_cogs_amount := COALESCE(v_product_purchase_price, 0) * p_quantity;

      IF v_cogs_amount > 0 THEN
        SELECT id INTO v_cogs_account_id
        FROM public.accounts
        WHERE organization_id = p_organization_id
          AND code = 5100;

        SELECT id INTO v_inventory_account_id
        FROM public.accounts
        WHERE organization_id = p_organization_id
          AND code = 1300;

        IF v_cogs_account_id IS NOT NULL AND v_inventory_account_id IS NOT NULL THEN
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
              v_txn_id,
              'HPP: ' || p_description,
              'posted',
              now(),
              v_user_id
            ) RETURNING id INTO v_cogs_journal_id;

            INSERT INTO public.journal_lines (
              organization_id, journal_entry_id, account_id,
              debit, credit, description, line_order
            ) VALUES
              (
                p_organization_id, v_cogs_journal_id, v_cogs_account_id,
                v_cogs_amount, 0, 'HPP: ' || p_description, 1
              ),
              (
                p_organization_id, v_cogs_journal_id, v_inventory_account_id,
                0, v_cogs_amount, 'HPP: ' || p_description, 2
              );
          END;
        END IF;
      END IF;

      PERFORM public.record_stock_movement(
        p_organization_id,
        p_product_id,
        p_transaction_date,
        'sale',
        -p_quantity,
        NULL,
        v_txn_id,
        p_description
      );
    END IF;
  END IF;

  v_impact := jsonb_build_object(
    'debit_account', COALESCE(v_debit_account_name, 'Debit'),
    'credit_account', COALESCE(v_credit_account_name, 'Credit'),
    'debit_change', 'increase',
    'credit_change', CASE
      WHEN COALESCE(v_credit_account_name, '') ILIKE '%Kas%' THEN 'decrease'
      WHEN COALESCE(v_credit_account_name, '') ILIKE '%Piutang%' THEN 'decrease'
      ELSE 'increase'
    END
  );

  INSERT INTO public.audit_logs (
    organization_id, actor_user_id, entity_type, entity_id,
    action, after_data
  ) VALUES (
    p_organization_id, v_user_id, 'transaction', v_txn_id,
    'post', jsonb_build_object(
      'transaction_type', p_transaction_type,
      'amount', p_amount,
      'journal_entry_id', v_journal_id,
      'product_id', p_product_id
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

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
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT role::TEXT INTO v_role
  FROM public.organization_members
  WHERE organization_id = p_organization_id
    AND user_id = v_user_id
    AND status = 'active';

  IF v_role IS NULL THEN
    RAISE EXCEPTION 'You are not a member of this organization';
  END IF;

  IF v_role != 'owner'
     AND NOT public.has_permission(p_organization_id, 'can_void_transaction') THEN
    RAISE EXCEPTION 'You do not have permission to void transactions';
  END IF;

  IF NULLIF(TRIM(p_void_reason), '') IS NULL THEN
    RAISE EXCEPTION 'Void reason is required';
  END IF;

  SELECT * INTO v_txn
  FROM public.transactions
  WHERE id = p_transaction_id
    AND organization_id = p_organization_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transaction not found';
  END IF;

  IF v_txn.status != 'posted' THEN
    RAISE EXCEPTION 'Only posted transactions can be voided';
  END IF;

  SELECT COUNT(*)
  INTO v_reversed_count
  FROM public.journal_entries
  WHERE transaction_id = p_transaction_id
    AND organization_id = p_organization_id
    AND status = 'posted';

  IF v_reversed_count = 0 THEN
    RAISE EXCEPTION 'No posted journal entry found for this transaction';
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
      RAISE EXCEPTION 'Reversal journal is not balanced';
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
        v_txn.unit_price,
        v_reversal_txn_id,
        p_void_reason
      );
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

-- Staff RPC overrides for databases that already applied the broken hardening migration.
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
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_email IS NULL OR p_email !~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$' THEN
    RAISE EXCEPTION 'Invalid email address';
  END IF;

  SELECT role::TEXT INTO v_inviter_role
  FROM public.organization_members
  WHERE organization_id = p_organization_id
    AND user_id = v_inviter_id
    AND status = 'active';

  IF v_inviter_role IS NULL THEN
    RAISE EXCEPTION 'You are not a member of this organization';
  END IF;

  IF v_inviter_role != 'owner' THEN
    RAISE EXCEPTION 'Only owners can invite staff';
  END IF;

  SELECT id, email_confirmed_at
  INTO v_target_user_id, v_target_email_verified_at
  FROM auth.users
  WHERE LOWER(email) = LOWER(p_email)
  LIMIT 1;

  IF v_target_user_id IS NULL THEN
    RAISE EXCEPTION 'No user found with email: %. User must sign up first.', p_email;
  END IF;

  IF v_target_email_verified_at IS NULL THEN
    RAISE EXCEPTION 'Email address not verified. User must verify their email before being invited.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.organization_members
    WHERE organization_id = p_organization_id
      AND user_id = v_target_user_id
  ) THEN
    RAISE EXCEPTION 'User is already a member of this organization';
  END IF;

  SELECT current_plan INTO v_current_plan
  FROM public.organizations
  WHERE id = p_organization_id;

  SELECT COUNT(*)
  INTO v_staff_count
  FROM public.organization_members
  WHERE organization_id = p_organization_id
    AND role = 'staff'
    AND status = 'active';

  IF v_current_plan = 'free' AND v_staff_count >= 1 THEN
    RAISE EXCEPTION 'Free plan allows only 1 staff member. Please upgrade to Business plan.';
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
      'email', p_email,
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

CREATE OR REPLACE FUNCTION public.remove_staff(
  p_organization_id UUID,
  p_member_id UUID
)
RETURNS JSONB AS $$
DECLARE
  v_remover_id UUID;
  v_remover_role TEXT;
  v_target_member RECORD;
BEGIN
  v_remover_id := auth.uid();
  IF v_remover_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT role::TEXT INTO v_remover_role
  FROM public.organization_members
  WHERE organization_id = p_organization_id
    AND user_id = v_remover_id
    AND status = 'active';

  IF v_remover_role IS NULL THEN
    RAISE EXCEPTION 'You are not a member of this organization';
  END IF;

  IF v_remover_role != 'owner' THEN
    RAISE EXCEPTION 'Only owners can remove staff';
  END IF;

  SELECT * INTO v_target_member
  FROM public.organization_members
  WHERE id = p_member_id
    AND organization_id = p_organization_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Staff member not found in this organization';
  END IF;

  IF v_target_member.role = 'owner' THEN
    RAISE EXCEPTION 'Cannot remove owner through remove_staff. Owners must be removed through organization transfer or deletion.';
  END IF;

  IF v_target_member.user_id = v_remover_id THEN
    RAISE EXCEPTION 'Cannot remove yourself';
  END IF;

  UPDATE public.organization_members
  SET status = 'removed',
      updated_at = now()
  WHERE id = p_member_id;

  INSERT INTO public.audit_logs (
    organization_id, actor_user_id, entity_type, entity_id,
    action, before_data
  ) VALUES (
    p_organization_id, v_remover_id, 'organization_member', p_member_id,
    'remove_staff',
    jsonb_build_object(
      'user_id', v_target_member.user_id,
      'role', v_target_member.role,
      'status', v_target_member.status
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'member_id', p_member_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.get_account_balance(
  p_account_id UUID,
  p_as_of_date DATE DEFAULT NULL
)
RETURNS NUMERIC AS $$
DECLARE
  v_balance NUMERIC;
  v_normal TEXT;
  v_org_id UUID;
BEGIN
  SELECT a.normal_balance::TEXT, a.organization_id
  INTO v_normal, v_org_id
  FROM public.accounts a
  WHERE a.id = p_account_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Account not found';
  END IF;

  IF NOT public.has_permission(v_org_id, 'can_view_reports') THEN
    RAISE EXCEPTION 'You do not have permission to view reports';
  END IF;

  SELECT COALESCE(SUM(jl.debit - jl.credit), 0)
  INTO v_balance
  FROM public.journal_lines jl
  JOIN public.journal_entries je ON je.id = jl.journal_entry_id
  WHERE jl.organization_id = v_org_id
    AND jl.account_id = p_account_id
    AND je.status = 'posted'
    AND (p_as_of_date IS NULL OR je.entry_date <= p_as_of_date);

  IF v_normal = 'credit' THEN
    v_balance := -v_balance;
  END IF;

  RETURN v_balance;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.get_trial_balance(
  p_organization_id UUID,
  p_as_of_date DATE DEFAULT NULL
)
RETURNS TABLE(
  account_id UUID,
  account_code INTEGER,
  account_name TEXT,
  account_type TEXT,
  normal_balance TEXT,
  debit_total NUMERIC,
  credit_total NUMERIC,
  ending_debit NUMERIC,
  ending_credit NUMERIC
) AS $$
BEGIN
  IF NOT public.has_permission(p_organization_id, 'can_view_reports') THEN
    RAISE EXCEPTION 'You do not have permission to view reports';
  END IF;

  RETURN QUERY
  WITH filtered_lines AS (
    SELECT jl.account_id, jl.debit, jl.credit
    FROM public.journal_lines jl
    JOIN public.journal_entries je ON je.id = jl.journal_entry_id
    WHERE jl.organization_id = p_organization_id
      AND je.status = 'posted'
      AND (p_as_of_date IS NULL OR je.entry_date <= p_as_of_date)
  ),
  account_activity AS (
    SELECT
      a.id AS account_id,
      a.code AS account_code,
      a.name AS account_name,
      a.account_type::TEXT AS account_type,
      a.normal_balance::TEXT AS normal_balance,
      COALESCE(SUM(fl.debit), 0) AS debit_total,
      COALESCE(SUM(fl.credit), 0) AS credit_total,
      CASE
        WHEN a.normal_balance = 'debit' THEN COALESCE(SUM(fl.debit - fl.credit), 0)
        ELSE COALESCE(SUM(fl.credit - fl.debit), 0)
      END AS normal_amount
    FROM public.accounts a
    LEFT JOIN filtered_lines fl ON fl.account_id = a.id
    WHERE a.organization_id = p_organization_id
    GROUP BY a.id, a.code, a.name, a.account_type, a.normal_balance
  )
  SELECT
    aa.account_id,
    aa.account_code,
    aa.account_name,
    aa.account_type,
    aa.normal_balance,
    aa.debit_total,
    aa.credit_total,
    CASE
      WHEN aa.normal_balance = 'debit' AND aa.normal_amount >= 0 THEN aa.normal_amount
      WHEN aa.normal_balance = 'credit' AND aa.normal_amount < 0 THEN ABS(aa.normal_amount)
      ELSE 0
    END AS ending_debit,
    CASE
      WHEN aa.normal_balance = 'credit' AND aa.normal_amount >= 0 THEN aa.normal_amount
      WHEN aa.normal_balance = 'debit' AND aa.normal_amount < 0 THEN ABS(aa.normal_amount)
      ELSE 0
    END AS ending_credit
  FROM account_activity aa
  WHERE aa.debit_total != 0 OR aa.credit_total != 0
  ORDER BY aa.account_code;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.get_profit_loss(
  p_organization_id UUID,
  p_from_date DATE,
  p_to_date DATE
)
RETURNS TABLE(
  section TEXT,
  account_code INTEGER,
  account_name TEXT,
  amount NUMERIC
) AS $$
BEGIN
  IF NOT public.has_permission(p_organization_id, 'can_view_reports') THEN
    RAISE EXCEPTION 'You do not have permission to view reports';
  END IF;

  RETURN QUERY
  WITH filtered_lines AS (
    SELECT jl.account_id, jl.debit, jl.credit
    FROM public.journal_lines jl
    JOIN public.journal_entries je ON je.id = jl.journal_entry_id
    WHERE jl.organization_id = p_organization_id
      AND je.status = 'posted'
      AND je.entry_type != 'opening_balance'
      AND je.entry_date BETWEEN p_from_date AND p_to_date
  )
  SELECT
    'revenue' AS section,
    a.code AS account_code,
    a.name AS account_name,
    COALESCE(SUM(fl.credit - fl.debit), 0) AS amount
  FROM public.accounts a
  LEFT JOIN filtered_lines fl ON fl.account_id = a.id
  WHERE a.organization_id = p_organization_id
    AND a.account_type = 'revenue'
  GROUP BY a.id, a.code, a.name

  UNION ALL

  SELECT
    'cogs' AS section,
    a.code AS account_code,
    a.name AS account_name,
    COALESCE(SUM(fl.debit - fl.credit), 0) AS amount
  FROM public.accounts a
  LEFT JOIN filtered_lines fl ON fl.account_id = a.id
  WHERE a.organization_id = p_organization_id
    AND a.account_type = 'cogs'
  GROUP BY a.id, a.code, a.name

  UNION ALL

  SELECT
    'expense' AS section,
    a.code AS account_code,
    a.name AS account_name,
    COALESCE(SUM(fl.debit - fl.credit), 0) AS amount
  FROM public.accounts a
  LEFT JOIN filtered_lines fl ON fl.account_id = a.id
  WHERE a.organization_id = p_organization_id
    AND a.account_type = 'expense'
  GROUP BY a.id, a.code, a.name

  UNION ALL

  SELECT
    'other_income' AS section,
    a.code AS account_code,
    a.name AS account_name,
    COALESCE(SUM(fl.credit - fl.debit), 0) AS amount
  FROM public.accounts a
  LEFT JOIN filtered_lines fl ON fl.account_id = a.id
  WHERE a.organization_id = p_organization_id
    AND a.account_type = 'other_income'
  GROUP BY a.id, a.code, a.name

  UNION ALL

  SELECT
    'other_expense' AS section,
    a.code AS account_code,
    a.name AS account_name,
    COALESCE(SUM(fl.debit - fl.credit), 0) AS amount
  FROM public.accounts a
  LEFT JOIN filtered_lines fl ON fl.account_id = a.id
  WHERE a.organization_id = p_organization_id
    AND a.account_type = 'other_expense'
  GROUP BY a.id, a.code, a.name

  ORDER BY section, account_code;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.get_balance_sheet(
  p_organization_id UUID,
  p_as_of_date DATE
)
RETURNS TABLE(
  section TEXT,
  account_code INTEGER,
  account_name TEXT,
  amount NUMERIC
) AS $$
DECLARE
  v_net_income NUMERIC;
BEGIN
  IF NOT public.has_permission(p_organization_id, 'can_view_reports') THEN
    RAISE EXCEPTION 'You do not have permission to view reports';
  END IF;

  SELECT COALESCE(
    SUM(CASE WHEN a.account_type = 'revenue' THEN jl.credit - jl.debit ELSE 0 END) -
    SUM(CASE WHEN a.account_type = 'cogs' THEN jl.debit - jl.credit ELSE 0 END) -
    SUM(CASE WHEN a.account_type = 'expense' THEN jl.debit - jl.credit ELSE 0 END) +
    SUM(CASE WHEN a.account_type = 'other_income' THEN jl.credit - jl.debit ELSE 0 END) -
    SUM(CASE WHEN a.account_type = 'other_expense' THEN jl.debit - jl.credit ELSE 0 END),
    0
  ) INTO v_net_income
  FROM public.journal_lines jl
  JOIN public.accounts a ON a.id = jl.account_id
  JOIN public.journal_entries je ON je.id = jl.journal_entry_id
  WHERE jl.organization_id = p_organization_id
    AND je.status = 'posted'
    AND je.entry_type != 'opening_balance'
    AND je.entry_date <= p_as_of_date;

  RETURN QUERY
  WITH filtered_lines AS (
    SELECT jl.account_id, jl.debit, jl.credit
    FROM public.journal_lines jl
    JOIN public.journal_entries je ON je.id = jl.journal_entry_id
    WHERE jl.organization_id = p_organization_id
      AND je.status = 'posted'
      AND je.entry_date <= p_as_of_date
  )
  SELECT
    'asset' AS section,
    a.code AS account_code,
    a.name AS account_name,
    COALESCE(SUM(fl.debit - fl.credit), 0) AS amount
  FROM public.accounts a
  LEFT JOIN filtered_lines fl ON fl.account_id = a.id
  WHERE a.organization_id = p_organization_id
    AND a.account_type = 'asset'
  GROUP BY a.id, a.code, a.name

  UNION ALL

  SELECT
    'liability' AS section,
    a.code AS account_code,
    a.name AS account_name,
    COALESCE(SUM(fl.credit - fl.debit), 0) AS amount
  FROM public.accounts a
  LEFT JOIN filtered_lines fl ON fl.account_id = a.id
  WHERE a.organization_id = p_organization_id
    AND a.account_type = 'liability'
  GROUP BY a.id, a.code, a.name

  UNION ALL

  SELECT
    'equity' AS section,
    a.code AS account_code,
    a.name AS account_name,
    COALESCE(SUM(fl.credit - fl.debit), 0) AS amount
  FROM public.accounts a
  LEFT JOIN filtered_lines fl ON fl.account_id = a.id
  WHERE a.organization_id = p_organization_id
    AND a.account_type = 'equity'
    AND a.code NOT IN (3400, 3500)
  GROUP BY a.id, a.code, a.name

  UNION ALL

  SELECT
    'equity' AS section,
    3500 AS account_code,
    'Laba Tahun Berjalan' AS account_name,
    v_net_income AS amount

  ORDER BY section, account_code;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.get_dashboard_summary(
  p_organization_id UUID,
  p_from_date DATE DEFAULT NULL,
  p_to_date DATE DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_cash_balance NUMERIC;
  v_receivables NUMERIC;
  v_payables NUMERIC;
  v_revenue NUMERIC;
  v_expenses NUMERIC;
  v_net_income NUMERIC;
BEGIN
  IF NOT public.has_permission(p_organization_id, 'can_view_reports') THEN
    RAISE EXCEPTION 'You do not have permission to view reports';
  END IF;

  WITH filtered AS (
    SELECT
      jl.debit,
      jl.credit,
      a.code,
      a.name,
      a.account_type,
      je.entry_type,
      je.entry_date
    FROM public.journal_lines jl
    JOIN public.accounts a ON a.id = jl.account_id
    JOIN public.journal_entries je ON je.id = jl.journal_entry_id
    WHERE jl.organization_id = p_organization_id
      AND je.status = 'posted'
      AND (p_to_date IS NULL OR je.entry_date <= p_to_date)
  )
  SELECT
    COALESCE(SUM(debit - credit) FILTER (
      WHERE account_type = 'asset'
        AND (name ILIKE '%kas%' OR name ILIKE '%bank%')
    ), 0),
    COALESCE(SUM(debit - credit) FILTER (WHERE code = 1200), 0),
    COALESCE(SUM(credit - debit) FILTER (WHERE code = 2100), 0),
    COALESCE(SUM(credit - debit) FILTER (
      WHERE account_type = 'revenue'
        AND entry_type != 'opening_balance'
        AND (p_from_date IS NULL OR entry_date >= p_from_date)
    ), 0),
    COALESCE(SUM(debit - credit) FILTER (
      WHERE account_type IN ('expense', 'cogs')
        AND entry_type != 'opening_balance'
        AND (p_from_date IS NULL OR entry_date >= p_from_date)
    ), 0)
  INTO v_cash_balance, v_receivables, v_payables, v_revenue, v_expenses
  FROM filtered;

  v_net_income := v_revenue - v_expenses;

  RETURN jsonb_build_object(
    'cash_balance', v_cash_balance,
    'accounts_receivable', v_receivables,
    'accounts_payable', v_payables,
    'revenue_current_period', v_revenue,
    'expense_current_period', v_expenses,
    'net_profit_current_period', v_net_income
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

-- Internal helpers should not be callable as public RPC endpoints.
REVOKE EXECUTE ON FUNCTION public.update_product_stock(UUID, NUMERIC) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.record_stock_movement(UUID, UUID, DATE, TEXT, NUMERIC, NUMERIC, UUID, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.record_initial_product_stock() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.protect_product_stock_update() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_next_counter(UUID, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.generate_transaction_number(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.generate_entry_number(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_default_accounts(UUID, TEXT) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.post_transaction(UUID, DATE, TEXT, NUMERIC, UUID, TEXT, UUID, UUID, TEXT, NUMERIC, DATE, TEXT, TEXT, UUID, NUMERIC, NUMERIC) TO authenticated;
GRANT EXECUTE ON FUNCTION public.void_transaction(UUID, UUID, TEXT, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.invite_staff(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_staff(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_monthly_transaction_count(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_account_balance(UUID, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_product_info(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_trial_balance(UUID, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_profit_loss(UUID, DATE, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_balance_sheet(UUID, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_dashboard_summary(UUID, DATE, DATE) TO authenticated;
