-- =============================================================================
-- LEDJER — Fix Weighted Average Cost Calculation for Void Movements
-- =============================================================================
-- Phase 5: Exclude non-cost-bearing void movements from weighted average.
-- Problem: Sale voids with positive quantity and NULL unit_cost distort the
-- weighted average if included in the denominator.
--
-- Solution: Only include cost-bearing movements:
--   - opening_balance (always has cost)
--   - purchase (always has cost)
--   - void WHERE unit_cost IS NOT NULL AND unit_cost > 0
-- =============================================================================


CREATE OR REPLACE FUNCTION public.recalculate_product_average_cost(
  p_product_id UUID
)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_total_cost NUMERIC := 0;
  v_total_qty NUMERIC := 0;
  v_avg_cost NUMERIC := 0;
BEGIN
  -- Validate product exists and get organization
  SELECT organization_id
  INTO v_org_id
  FROM public.products
  WHERE id = p_product_id AND is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Produk tidak ditemukan atau tidak aktif';
  END IF;

  -- Calculate weighted average cost from cost-bearing stock movements only.
  -- Use SIGNED quantities so that void movements correctly subtract quantity
  -- and cost basis (e.g., voiding a purchase reverses the original cost layer).
  --
  -- Include (cost-bearing movements only):
  --   - opening_balance: always has meaningful cost
  --   - purchase: always has meaningful cost
  --   - void WHERE unit_cost IS NOT NULL AND unit_cost > 0: cost-bearing reversal
  --     (e.g., voiding a purchase that originally had cost)
  --
  -- Exclude:
  --   - sale: reduces stock, no cost to average in
  --   - void WHERE unit_cost IS NULL OR unit_cost <= 0: non-cost-bearing reversal
  --     (e.g., voiding a sale that had no cost assigned)
  --   - adjustment: manual adjustments with no reliable cost basis
  SELECT
    COALESCE(SUM(sm.quantity * sm.unit_cost), 0),
    COALESCE(SUM(sm.quantity), 0)
  INTO v_total_cost, v_total_qty
  FROM public.stock_movements sm
  WHERE sm.product_id = p_product_id
    AND sm.organization_id = v_org_id
    AND (
      sm.movement_type IN ('opening_balance', 'purchase')
      OR (
        sm.movement_type = 'void'
        AND sm.unit_cost IS NOT NULL
        AND sm.unit_cost > 0
      )
    );

  -- Calculate average
  IF v_total_qty > 0 THEN
    v_avg_cost := v_total_cost / v_total_qty;
  ELSE
    -- No costed movements; keep current purchase_price
    SELECT purchase_price INTO v_avg_cost
    FROM public.products
    WHERE id = p_product_id;
  END IF;

  -- Ensure non-negative
  v_avg_cost := GREATEST(COALESCE(v_avg_cost, 0), 0);

  -- Update product's purchase price
  UPDATE public.products
  SET purchase_price = v_avg_cost,
      updated_at = now()
  WHERE id = p_product_id;

  RETURN v_avg_cost;
END;
$$;

-- Revoke direct execute from common roles (consistent with security style)
-- Called by post_transaction and void_transaction which are SECURITY DEFINER
REVOKE EXECUTE ON FUNCTION public.recalculate_product_average_cost(UUID) FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
