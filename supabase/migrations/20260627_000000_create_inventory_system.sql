-- ============================================================
-- LEDJER MVP — Inventory/Stock Management System
-- ============================================================

-- ============================================================
-- TABLE: products
-- ============================================================
CREATE TABLE IF NOT EXISTS public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  
  -- Basic info
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  
  -- Unit & pricing
  unit TEXT DEFAULT 'pcs', -- pcs, kg, liter, box, etc.
  purchase_price NUMERIC(15,2) DEFAULT 0,
  selling_price NUMERIC(15,2) DEFAULT 0,
  
  -- Stock info
  current_stock NUMERIC(15,3) DEFAULT 0,
  min_stock NUMERIC(15,3) DEFAULT 0,
  
  -- Accounting
  inventory_account_id UUID REFERENCES public.accounts(id),
  cogs_account_id UUID REFERENCES public.accounts(id),
  revenue_account_id UUID REFERENCES public.accounts(id),
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  
  -- Constraints
  UNIQUE(organization_id, code),
  CHECK (current_stock >= 0),
  CHECK (purchase_price >= 0),
  CHECK (selling_price >= 0)
);

CREATE INDEX idx_products_org ON public.products(organization_id);
CREATE INDEX idx_products_code ON public.products(organization_id, code);
CREATE INDEX idx_products_active ON public.products(organization_id, is_active);

-- ============================================================
-- TABLE: stock_movements
-- ============================================================
CREATE TABLE IF NOT EXISTS public.stock_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  
  -- Product reference
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  
  -- Movement details
  movement_date DATE NOT NULL,
  movement_type TEXT NOT NULL, -- 'purchase', 'sale', 'adjustment', 'void'
  quantity NUMERIC(15,3) NOT NULL,
  unit_cost NUMERIC(15,2),
  
  -- Reference to transaction
  transaction_id UUID REFERENCES public.transactions(id) ON DELETE SET NULL,
  
  -- Stock after movement
  stock_after NUMERIC(15,3) NOT NULL,
  
  -- Notes
  notes TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  
  -- Constraints
  CHECK (quantity != 0)
);

CREATE INDEX idx_stock_movements_org ON public.stock_movements(organization_id);
CREATE INDEX idx_stock_movements_product ON public.stock_movements(product_id);
CREATE INDEX idx_stock_movements_date ON public.stock_movements(movement_date);
CREATE INDEX idx_stock_movements_transaction ON public.stock_movements(transaction_id);

-- ============================================================
-- ALTER: transactions table - add inventory fields
-- ============================================================
ALTER TABLE public.transactions 
  ADD COLUMN IF NOT EXISTS product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS quantity NUMERIC(15,3),
  ADD COLUMN IF NOT EXISTS unit_price NUMERIC(15,2);

CREATE INDEX IF NOT EXISTS idx_transactions_product ON public.transactions(product_id);

-- ============================================================
-- FUNCTION: Update product stock
-- ============================================================
CREATE OR REPLACE FUNCTION public.update_product_stock(
  p_product_id UUID,
  p_quantity_delta NUMERIC
)
RETURNS NUMERIC AS $$
DECLARE
  v_new_stock NUMERIC;
BEGIN
  UPDATE public.products
  SET current_stock = current_stock + p_quantity_delta,
      updated_at = now()
  WHERE id = p_product_id
  RETURNING current_stock INTO v_new_stock;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Product not found';
  END IF;
  
  IF v_new_stock < 0 THEN
    RAISE EXCEPTION 'Insufficient stock. Available: %, Required: %', 
      v_new_stock - p_quantity_delta, ABS(p_quantity_delta);
  END IF;
  
  RETURN v_new_stock;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- FUNCTION: Record stock movement
-- ============================================================
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
BEGIN
  -- Update product stock
  v_stock_after := public.update_product_stock(p_product_id, p_quantity);
  
  -- Record movement
  INSERT INTO public.stock_movements (
    organization_id, product_id, movement_date, movement_type,
    quantity, unit_cost, transaction_id, stock_after, notes, created_by
  ) VALUES (
    p_organization_id, p_product_id, p_movement_date, p_movement_type,
    p_quantity, p_unit_cost, p_transaction_id, v_stock_after, p_notes, auth.uid()
  ) RETURNING id INTO v_movement_id;
  
  RETURN v_movement_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- FUNCTION: Get product with current stock
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_product_info(
  p_product_id UUID
)
RETURNS JSONB AS $$
DECLARE
  v_product RECORD;
BEGIN
  SELECT 
    p.id, p.code, p.name, p.description, p.unit,
    p.purchase_price, p.selling_price, p.current_stock, p.min_stock,
    p.is_active
  INTO v_product
  FROM public.products p
  WHERE p.id = p_product_id;
  
  IF NOT FOUND THEN
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
$$ LANGUAGE plpgsql STABLE;

-- ============================================================
-- ADD PERMISSION: can_manage_products
-- ============================================================
ALTER TABLE public.organization_members 
  ADD COLUMN IF NOT EXISTS can_manage_products BOOLEAN DEFAULT false;

COMMENT ON COLUMN public.organization_members.can_manage_products IS 
  'Staff permission: can create, update, and delete products';

-- ============================================================
-- RLS POLICIES: products
-- ============================================================
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view products in their organization"
  ON public.products FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );

CREATE POLICY "Members with permission can create products"
  ON public.products FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT om.organization_id FROM public.organization_members om
      WHERE om.user_id = auth.uid() 
        AND om.status = 'active'
        AND (om.role = 'owner' OR om.can_manage_products = true)
    )
  );

CREATE POLICY "Members with permission can update products"
  ON public.products FOR UPDATE
  USING (
    organization_id IN (
      SELECT om.organization_id FROM public.organization_members om
      WHERE om.user_id = auth.uid() 
        AND om.status = 'active'
        AND (om.role = 'owner' OR om.can_manage_products = true)
    )
  );

CREATE POLICY "Members with permission can delete products"
  ON public.products FOR DELETE
  USING (
    organization_id IN (
      SELECT om.organization_id FROM public.organization_members om
      WHERE om.user_id = auth.uid() 
        AND om.status = 'active'
        AND om.role = 'owner'
    )
  );

-- ============================================================
-- RLS POLICIES: stock_movements
-- ============================================================
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view stock movements in their organization"
  ON public.stock_movements FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );

CREATE POLICY "System can insert stock movements"
  ON public.stock_movements FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );

-- ============================================================
-- ADD PERMISSION: can_manage_products
-- ============================================================
ALTER TABLE public.organization_members 
  ADD COLUMN IF NOT EXISTS can_manage_products BOOLEAN DEFAULT false;

COMMENT ON COLUMN public.organization_members.can_manage_products IS 
  'Staff permission: can create, update, and delete products';
