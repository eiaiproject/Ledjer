-- =============================================================================
-- LEDJER — Fix Initial Product Stock Date + Block Post-Onboarding Initial Stock
-- =============================================================================
-- Phase 6:
--   1. record_initial_product_stock must use organizations.books_start_date
--      instead of CURRENT_DATE so opening stock lands on the correct period.
--   2. For organizations with onboarding_status = 'completed', refuse to create
--      a product with current_stock > 0 (forces use of the formal stock
--      adjustment / purchase flow instead of an implicit opening-balance JE).
-- =============================================================================


-- ---------------------------------------------------------------------------
-- 1. record_initial_product_stock: use books_start_date
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_initial_product_stock()
RETURNS TRIGGER AS $$
DECLARE
  v_inventory_account_id UUID;
  v_opening_account_id UUID;
  v_entry_id UUID;
  v_entry_number TEXT;
  v_initial_value NUMERIC;
  v_actor UUID;
  v_stock_date   DATE;
  v_onboarding   TEXT;
BEGIN
  -- Determine the effective date for the opening stock movement + journal entry.
  -- Prefer organizations.books_start_date so opening inventory falls into the
  -- correct accounting period. CURRENT_DATE is intentionally NOT used here.
  SELECT onboarding_status::TEXT, books_start_date
    INTO v_onboarding, v_stock_date
  FROM public.organizations
  WHERE id = NEW.organization_id;

  IF v_stock_date IS NULL THEN
    v_stock_date := CURRENT_DATE;
  END IF;

  -- Block creation of a product with positive initial stock once onboarding is
  -- complete. This prevents silent opening-balance journal entries after the
  -- books are open. Use the normal purchase flow for new stock.
  IF COALESCE(NEW.current_stock, 0) > 0
     AND v_onboarding = 'completed' THEN
    RAISE EXCEPTION 'Produk dengan stok awal > 0 tidak dapat dibuat setelah onboarding selesai. Catat pembelian atau gunakan alur penyesuaian stok resmi.';
  END IF;

  IF COALESCE(NEW.current_stock, 0) <= 0 THEN
    RETURN NEW;
  END IF;

  v_actor := COALESCE(NEW.created_by, auth.uid());
  v_initial_value := COALESCE(NEW.current_stock, 0) * COALESCE(NEW.purchase_price, 0);

  INSERT INTO public.stock_movements (
    organization_id, product_id, movement_date, movement_type,
    quantity, unit_cost, transaction_id, stock_after, notes, created_by
  ) VALUES (
    NEW.organization_id, NEW.id, v_stock_date, 'opening_balance',
    NEW.current_stock, NEW.purchase_price, NULL, NEW.current_stock,
    'Stok awal produk', v_actor
  );

  IF v_initial_value > 0 THEN
    v_inventory_account_id := NEW.inventory_account_id;
    IF v_inventory_account_id IS NULL THEN
      SELECT id INTO v_inventory_account_id
      FROM public.accounts
      WHERE organization_id = NEW.organization_id AND code = 1300
      LIMIT 1;
    END IF;

    SELECT id INTO v_opening_account_id
    FROM public.accounts
    WHERE organization_id = NEW.organization_id AND code = 3200
    LIMIT 1;

    IF v_inventory_account_id IS NULL OR v_opening_account_id IS NULL THEN
      RAISE EXCEPTION 'Inventory and opening balance accounts are required for initial stock value';
    END IF;

    v_entry_number := public.generate_entry_number(NEW.organization_id);

    INSERT INTO public.journal_entries (
      organization_id, entry_number, entry_date, entry_type,
      description, status, posted_at, posted_by
    ) VALUES (
      NEW.organization_id, v_entry_number, v_stock_date, 'opening_balance',
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

-- Drop & recreate trigger to ensure it points at the new function body.
DROP TRIGGER IF EXISTS record_initial_product_stock_trigger ON public.products;
CREATE TRIGGER record_initial_product_stock_trigger
  AFTER INSERT ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION public.record_initial_product_stock();

NOTIFY pgrst, 'reload schema';
