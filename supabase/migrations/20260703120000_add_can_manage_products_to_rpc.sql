-- Migration: Add p_can_manage_products parameter to update_staff_permissions RPC
-- Date: 2026-07-19
-- Purpose:
--   The organization_members table has can_manage_products column (from 20260628)
--   but the update_staff_permissions RPC doesn't accept this parameter,
--   so owners cannot toggle it through the UI.
--
-- Changes:
--   - CREATE OR REPLACE update_staff_permissions with p_can_manage_products param
--
-- Constraints: Additive only (C1). CREATE OR REPLACE FUNCTION.


CREATE OR REPLACE FUNCTION public.update_staff_permissions(
  p_organization_id UUID,
  p_member_id UUID,
  p_can_create_transaction BOOLEAN DEFAULT NULL,
  p_can_view_reports BOOLEAN DEFAULT NULL,
  p_can_manage_accounts BOOLEAN DEFAULT NULL,
  p_can_void_transaction BOOLEAN DEFAULT NULL,
  p_can_manage_products BOOLEAN DEFAULT NULL,
  p_can_view_audit_log BOOLEAN DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_user_id UUID;
  v_role TEXT;
  v_member RECORD;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- Check membership and owner role
  SELECT role::TEXT INTO v_role
  FROM organization_members
  WHERE organization_id = p_organization_id
    AND user_id = v_user_id
    AND status = 'active';

  IF v_role IS NULL OR v_role != 'owner' THEN
    RAISE EXCEPTION 'Hanya owner yang dapat mengubah izin staff';
  END IF;

  -- Get the member to update
  SELECT * INTO v_member
  FROM organization_members
  WHERE id = p_member_id
    AND organization_id = p_organization_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Member tidak ditemukan';
  END IF;

  IF v_member.role != 'staff' THEN
    RAISE EXCEPTION 'Hanya staff yang dapat diubah izinnya';
  END IF;

  -- Update permissions (only non-NULL values)
  UPDATE organization_members
  SET
    can_create_transaction = COALESCE(p_can_create_transaction, can_create_transaction),
    can_view_reports = COALESCE(p_can_view_reports, can_view_reports),
    can_manage_accounts = COALESCE(p_can_manage_accounts, can_manage_accounts),
    can_void_transaction = COALESCE(p_can_void_transaction, can_void_transaction),
    can_manage_products = COALESCE(p_can_manage_products, can_manage_products),
    can_view_audit_log = COALESCE(p_can_view_audit_log, can_view_audit_log),
    updated_at = now()
  WHERE id = p_member_id;

  -- Audit log
  INSERT INTO audit_logs (
    organization_id, actor_user_id, entity_type, entity_id,
    action, after_data
  ) VALUES (
    p_organization_id,
    v_user_id,
    'staff_permissions',
    p_member_id,
    'update_permissions',
    jsonb_build_object(
      'can_create_transaction', COALESCE(p_can_create_transaction, v_member.can_create_transaction),
      'can_view_reports', COALESCE(p_can_view_reports, v_member.can_view_reports),
      'can_manage_accounts', COALESCE(p_can_manage_accounts, v_member.can_manage_accounts),
      'can_void_transaction', COALESCE(p_can_void_transaction, v_member.can_void_transaction),
      'can_manage_products', COALESCE(p_can_manage_products, v_member.can_manage_products),
      'can_view_audit_log', COALESCE(p_can_view_audit_log, v_member.can_view_audit_log)
    )
  );

  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.update_staff_permissions(
  UUID, UUID, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN
) TO authenticated;
