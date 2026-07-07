-- =============================================================================
-- LEDJER — Grant INSERT/UPDATE on products to authenticated
-- =============================================================================
-- The privilege hardening migration (20260625200000) revoked ALL DML from
-- anon/authenticated and only re-granted SELECT on products. However, the
-- frontend creates and edits products via direct Supabase client INSERT/UPDATE
-- (not through an RPC). This is safe because:
--
--   1. RLS is enabled on the products table.
--   2. The RLS policy "Members with product permission can create products"
--      (FOR INSERT WITH CHECK) gates who can insert.
--   3. The RLS policy "Members with product permission can update products"
--      (FOR UPDATE USING/WITH CHECK) gates who can update.
--   4. These policies check has_permission(organization_id, 'can_manage_products'),
--      which is only true for owners and staff with explicit permission.
-- =============================================================================

GRANT INSERT ON TABLE public.products TO authenticated;
GRANT UPDATE ON TABLE public.products TO authenticated;
