-- Improve recalculate_product_average_cost for void purchases
-- P1.7: Ensure voided purchases correctly reduce cost basis

BEGIN;

CREATE OR REPLACE FUNCTION public.recalculate_product_average_cost(
  p_product_id UUID
)
RETURNS NUMERIC AS $$
DECLARE
  v_average_cost NUMERIC := 0;
  v_total_quantity NUMERIC := 0;
  v_total_cost NUMERIC := 0;
  v_net_quantity NUMERIC := 0;
BEGIN
  -- Calculate weighted average from all stock movements
  -- For purchases: positive quantity * unit_cost adds to cost basis
  -- For voids of purchases: negative quantity * unit_cost reduces cost basis
  -- For opening_balance: adds initial cost basis
  SELECT
    COALESCE(SUM(quantity), 0),
    COALESCE(SUM(CASE 
      WHEN unit_cost IS NOT NULL THEN quantity * unit_cost 
      ELSE 0 
    END), 0)
  INTO v_net_quantity, v_total_cost
  FROM public.stock_movements
  WHERE product_id = p_product_id
    AND movement_type IN ('opening_balance', 'purchase', 'void');

  -- Only calculate average if we have positive net quantity
  -- This prevents division by zero or negative average costs
  IF v_net_quantity > 0 AND v_total_cost > 0 THEN
    v_average_cost := v_total_cost / v_net_quantity;
  END IF;

  -- Ensure non-negative
  v_average_cost := GREATEST(v_average_cost, 0);

  UPDATE public.products
  SET purchase_price = v_average_cost,
      updated_at = now()
  WHERE id = p_product_id;

  RETURN v_average_cost;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Only system can execute (called by post_transaction and void_transaction)
REVOKE EXECUTE ON FUNCTION public.recalculate_product_average_cost(UUID) FROM PUBLIC, anon, authenticated;

COMMIT;
