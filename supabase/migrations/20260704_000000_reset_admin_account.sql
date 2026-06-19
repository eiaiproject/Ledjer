-- Reset admin@ledjer.id to fresh registration state
-- Run this in Supabase SQL Editor

DO $$
DECLARE
  v_user_id UUID;
  v_org_id UUID;
BEGIN
  -- Find user by email
  SELECT id INTO v_user_id
  FROM auth.users
  WHERE email = 'admin@ledjer.id';

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'User admin@ledjer.id not found';
  END IF;

  -- Find user's organizations
  FOR v_org_id IN
    SELECT DISTINCT organization_id
    FROM organization_members
    WHERE user_id = v_user_id
  LOOP
    -- Delete in correct order (respect foreign keys)
    DELETE FROM audit_logs WHERE organization_id = v_org_id;
    DELETE FROM stock_movements WHERE organization_id = v_org_id;
    DELETE FROM journal_lines WHERE organization_id = v_org_id;
    DELETE FROM journal_entries WHERE organization_id = v_org_id;
    DELETE FROM transactions WHERE organization_id = v_org_id;
    DELETE FROM products WHERE organization_id = v_org_id;
    DELETE FROM parties WHERE organization_id = v_org_id;
    DELETE FROM accounts WHERE organization_id = v_org_id;
    DELETE FROM account_mappings WHERE organization_id = v_org_id;
    DELETE FROM organization_document_counters WHERE organization_id = v_org_id;
    DELETE FROM organization_members WHERE organization_id = v_org_id;
    DELETE FROM organizations WHERE id = v_org_id;

    RAISE NOTICE 'Organization % deleted', v_org_id;
  END LOOP;

  -- Delete profile
  DELETE FROM profiles WHERE user_id = v_user_id;

  -- Delete login attempts
  DELETE FROM login_attempts WHERE email = 'admin@ledjer.id';

  -- Delete rate limits
  DELETE FROM rate_limits WHERE identifier = 'admin@ledjer.id';

  RAISE NOTICE 'Account reset complete for user %', v_user_id;
END $$;
