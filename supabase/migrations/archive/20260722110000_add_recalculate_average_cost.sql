-- ============================================================
-- Migration: Add recalculate_product_average_cost function
-- Called by post_transaction after purchase to update product cost
-- ============================================================

-- Drop existing if present (may have wrong signature)
DROP FUNCTION IF EXISTS public.recalculate_product_average_cost(uuid);
DROP FUNCTION IF EXISTS public.recalculate_product_average_cost(uuid, uuid);

CREATE OR REPLACE FUNCTION public.recalculate_product_average_cost(
  p_product_id uuid
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid;
  v_total_cost numeric := 0;
  v_total_qty numeric := 0;
  v_avg_cost numeric := 0;
BEGIN
  -- Validate product exists and get organization
  SELECT organization_id
  INTO v_org_id
  FROM public.products
  WHERE id = p_product_id AND is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Produk tidak ditemukan atau tidak aktif';
  END IF;

  -- Calculate weighted average cost from incoming stock movements
  -- Include: opening_balance, purchase, and voided sales (which return stock)
  -- Exclude: sales (negative qty, no cost to average in)
  SELECT
    COALESCE(SUM(ABS(sm.quantity) * sm.unit_cost), 0),
    COALESCE(SUM(ABS(sm.quantity)), 0)
  INTO v_total_cost, v_total_qty
  FROM public.stock_movements sm
  WHERE sm.product_id = p_product_id
    AND sm.organization_id = v_org_id
    AND sm.movement_type IN ('opening_balance', 'purchase', 'void')
    AND sm.unit_cost IS NOT NULL
    AND sm.unit_cost > 0;

  -- Calculate average
  IF v_total_qty > 0 THEN
    v_avg_cost := v_total_cost / v_total_qty;
  ELSE
    -- No costed movements; keep current purchase_price
    SELECT purchase_price INTO v_avg_cost
    FROM public.products
    WHERE id = p_product_id;
  END IF;

  -- Update product's purchase price
  UPDATE public.products
  SET purchase_price = v_avg_cost,
      updated_at = now()
  WHERE id = p_product_id;

  RETURN v_avg_cost;
END;
$$;

-- Revoke direct execute from common roles (consistent with security style)
REVOKE EXECUTE ON FUNCTION public.recalculate_product_average_cost(uuid) FROM public;
REVOKE EXECUTE ON FUNCTION public.recalculate_product_average_cost(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.recalculate_product_average_cost(uuid) FROM authenticated;

-- Grant to service role (used by post_transaction which is SECURITY DEFINER)
GRANT EXECUTE ON FUNCTION public.recalculate_product_average_cost(uuid) TO service_role;
