-- ============================================================
-- LEDJER MVP — Staff Invite & Permissions
-- ============================================================

-- INVITE STAFF
-- Owner invites a staff member by email
-- ============================================================
CREATE OR REPLACE FUNCTION public.invite_staff(
  p_organization_id UUID,
  p_email TEXT
)
RETURNS JSONB AS $$
DECLARE
  v_user_id UUID;
  v_role TEXT;
  v_plan TEXT;
  v_target_user_id UUID;
  v_member_count INTEGER;
  v_new_member_id UUID;
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
    RAISE EXCEPTION 'Only the owner can invite staff';
  END IF;

  -- Check plan
  SELECT current_plan INTO v_plan
  FROM organizations WHERE id = p_organization_id;

  IF v_plan != 'business' THEN
    RAISE EXCEPTION 'Staff invite requires Business plan. Please upgrade.';
  END IF;

  -- Check existing staff count (max 1)
  SELECT COUNT(*)::INTEGER INTO v_member_count
  FROM organization_members
  WHERE organization_id = p_organization_id
    AND role = 'staff'
    AND status IN ('active', 'invited');

  IF v_member_count >= 1 THEN
    RAISE EXCEPTION 'Business plan allows maximum 1 staff member';
  END IF;

  -- Find the target user by email
  SELECT id INTO v_target_user_id
  FROM auth.users
  WHERE email = p_email;

  IF v_target_user_id IS NULL THEN
    RAISE EXCEPTION 'User with email % not found. They must register first.', p_email;
  END IF;

  -- Check if already a member
  IF EXISTS (
    SELECT 1 FROM organization_members
    WHERE organization_id = p_organization_id
      AND user_id = v_target_user_id
  ) THEN
    RAISE EXCEPTION 'User is already a member of this organization';
  END IF;

  -- Create membership
  INSERT INTO organization_members (
    organization_id, user_id, role, status,
    can_create_transaction, can_view_reports, can_manage_accounts,
    can_void_transaction, can_view_audit_log,
    invited_by, joined_at
  ) VALUES (
    p_organization_id, v_target_user_id, 'staff', 'active',
    true, true, false, false, false,
    v_user_id, now()
  ) RETURNING id INTO v_new_member_id;

  -- Audit log
  INSERT INTO audit_logs (
    organization_id, actor_user_id, entity_type, entity_id,
    action, after_data
  ) VALUES (
    p_organization_id, v_user_id, 'member', v_new_member_id,
    'invite', jsonb_build_object(
      'email', p_email,
      'role', 'staff'
    )
  );

  RETURN jsonb_build_object(
    'member_id', v_new_member_id,
    'email', p_email,
    'role', 'staff',
    'status', 'active'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- UPDATE STAFF PERMISSIONS
-- Owner updates staff permission booleans
-- ============================================================
CREATE OR REPLACE FUNCTION public.update_staff_permissions(
  p_organization_id UUID,
  p_member_id UUID,
  p_can_create_transaction BOOLEAN DEFAULT NULL,
  p_can_view_reports BOOLEAN DEFAULT NULL,
  p_can_manage_accounts BOOLEAN DEFAULT NULL,
  p_can_void_transaction BOOLEAN DEFAULT NULL,
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
    RAISE EXCEPTION 'Only the owner can update staff permissions';
  END IF;

  -- Get the member to update
  SELECT * INTO v_member
  FROM organization_members
  WHERE id = p_member_id
    AND organization_id = p_organization_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Member not found';
  END IF;

  IF v_member.role != 'staff' THEN
    RAISE EXCEPTION 'Can only update permissions for staff members';
  END IF;

  -- Update permissions (only non-NULL values)
  UPDATE organization_members
  SET
    can_create_transaction = COALESCE(p_can_create_transaction, can_create_transaction),
    can_view_reports = COALESCE(p_can_view_reports, can_view_reports),
    can_manage_accounts = COALESCE(p_can_manage_accounts, can_manage_accounts),
    can_void_transaction = COALESCE(p_can_void_transaction, can_void_transaction),
    can_view_audit_log = COALESCE(p_can_view_audit_log, can_view_audit_log),
    updated_at = now()
  WHERE id = p_member_id;

  -- Audit log
  INSERT INTO audit_logs (
    organization_id, actor_user_id, entity_type, entity_id,
    action, after_data
  ) VALUES (
    p_organization_id, v_user_id, 'member', p_member_id,
    'update_permissions', jsonb_build_object(
      'can_create_transaction', COALESCE(p_can_create_transaction, v_member.can_create_transaction),
      'can_view_reports', COALESCE(p_can_view_reports, v_member.can_view_reports),
      'can_manage_accounts', COALESCE(p_can_manage_accounts, v_member.can_manage_accounts),
      'can_void_transaction', COALESCE(p_can_void_transaction, v_member.can_void_transaction),
      'can_view_audit_log', COALESCE(p_can_view_audit_log, v_member.can_view_audit_log)
    )
  );

  -- Return updated member
  SELECT to_jsonb(om.*) INTO v_member
  FROM organization_members om
  WHERE id = p_member_id;

  RETURN v_member::jsonb;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- REMOVE STAFF
-- Owner removes a staff member
-- ============================================================
CREATE OR REPLACE FUNCTION public.remove_staff(
  p_organization_id UUID,
  p_member_id UUID
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

  SELECT role::TEXT INTO v_role
  FROM organization_members
  WHERE organization_id = p_organization_id
    AND user_id = v_user_id
    AND status = 'active';

  IF v_role IS NULL OR v_role != 'owner' THEN
    RAISE EXCEPTION 'Only the owner can remove staff';
  END IF;

  SELECT * INTO v_member
  FROM organization_members
  WHERE id = p_member_id
    AND organization_id = p_organization_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Member not found';
  END IF;

  -- Set status to removed
  UPDATE organization_members
  SET status = 'removed', updated_at = now()
  WHERE id = p_member_id;

  -- Audit log
  INSERT INTO audit_logs (
    organization_id, actor_user_id, entity_type, entity_id,
    action, before_data
  ) VALUES (
    p_organization_id, v_user_id, 'member', p_member_id,
    'remove', jsonb_build_object(
      'user_id', v_member.user_id,
      'role', v_member.role
    )
  );

  RETURN jsonb_build_object(
    'member_id', p_member_id,
    'status', 'removed'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
