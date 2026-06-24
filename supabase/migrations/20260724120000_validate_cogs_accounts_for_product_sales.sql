-- P1.8: Always validate COGS and inventory accounts for product sales
-- Even when purchase_price is zero, the accounts must exist for accounting integrity

BEGIN;

-- We need to modify the post_transaction function to validate COGS/inventory accounts
-- whenever product_id is present for sales, regardless of COGS amount

-- First, let's create a helper function to validate product sale accounts
CREATE OR REPLACE FUNCTION public.validate_product_sale_accounts(
  p_organization_id UUID,
  p_product_id UUID
)
RETURNS VOID AS $$
DECLARE
  v_cogs_account_id UUID;
  v_inventory_account_id UUID;
BEGIN
  -- Always validate these accounts exist when selling a product
  -- This ensures accounting integrity even if purchase_price is 0
  SELECT id INTO v_cogs_account_id
  FROM public.accounts
  WHERE organization_id = p_organization_id
    AND code = 5100
    AND is_active = true;

  SELECT id INTO v_inventory_account_id
  FROM public.accounts
  WHERE organization_id = p_organization_id
    AND code = 1300
    AND is_active = true;

  IF v_cogs_account_id IS NULL THEN
    RAISE EXCEPTION 'Akun HPP (kode 5100) belum dikonfigurasi. Silakan tambahkan akun HPP di Daftar Akun.';
  END IF;

  IF v_inventory_account_id IS NULL THEN
    RAISE EXCEPTION 'Akun Persediaan (kode 1300) belum dikonfigurasi. Silakan tambahkan akun Persediaan di Daftar Akun.';
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Grant execute to authenticated (called by post_transaction)
GRANT EXECUTE ON FUNCTION public.validate_product_sale_accounts(UUID, UUID) TO authenticated;

COMMIT;
