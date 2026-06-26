-- =============================================================================
-- LEDJER — Stage 4 Production Tests
-- =============================================================================
-- Tests: billing scaffold, period lock, invitations, admin ops, export RPCs.
-- WARNING: Run ONLY against disposable local Supabase stack.
-- =============================================================================

\echo '=== stage4_production_tests.sql ==='

DO $$
DECLARE
  v_org_id UUID;
  v_owner_id UUID;
  v_other_org_id UUID;
  v_other_owner_id UUID;
  v_test_count INTEGER := 0;
  v_pass_count INTEGER := 0;
  v_fail_count INTEGER := 0;
BEGIN
  -- ═══════ SETUP ═══════
  -- Use the existing helper to create orgs with users
  SELECT out_owner_user_id, out_organization_id
  INTO v_owner_id, v_org_id
  FROM public._test_create_org_with_users('Stage4 Test Org', CURRENT_DATE);

  SELECT out_owner_user_id, out_organization_id
  INTO v_other_owner_id, v_other_org_id
  FROM public._test_create_org_with_users('Stage4 Other Org', CURRENT_DATE);

  -- ═══════ TEST 1: Period lock fields exist ═══════
  v_test_count := v_test_count + 1;
  BEGIN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'organizations' AND column_name = 'locked_through_date'
    ) THEN
      v_pass_count := v_pass_count + 1;
      RAISE NOTICE 'TEST 1 PASS: locked_through_date column exists';
    ELSE
      v_fail_count := v_fail_count + 1;
      RAISE EXCEPTION 'TEST 1 FAIL: locked_through_date column missing';
    END IF;
  END;

  -- ═══════ TEST 2: Billing fields exist ═══════
  v_test_count := v_test_count + 1;
  BEGIN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'organizations' AND column_name = 'subscription_status'
    ) THEN
      v_pass_count := v_pass_count + 1;
      RAISE NOTICE 'TEST 2 PASS: subscription_status column exists';
    ELSE
      v_fail_count := v_fail_count + 1;
      RAISE EXCEPTION 'TEST 2 FAIL: subscription_status column missing';
    END IF;
  END;

  -- ═══════ TEST 3: billing_events table exists ═══════
  v_test_count := v_test_count + 1;
  BEGIN
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_name = 'billing_events'
    ) THEN
      v_pass_count := v_pass_count + 1;
      RAISE NOTICE 'TEST 3 PASS: billing_events table exists';
    ELSE
      v_fail_count := v_fail_count + 1;
      RAISE EXCEPTION 'TEST 3 FAIL: billing_events table missing';
    END IF;
  END;

  -- ═══════ TEST 4: organization_invitations table exists ═══════
  v_test_count := v_test_count + 1;
  BEGIN
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_name = 'organization_invitations'
    ) THEN
      v_pass_count := v_pass_count + 1;
      RAISE NOTICE 'TEST 4 PASS: organization_invitations table exists';
    ELSE
      v_fail_count := v_fail_count + 1;
      RAISE EXCEPTION 'TEST 4 FAIL: organization_invitations table missing';
    END IF;
  END;

  -- ═══════ TEST 5: billing_events RLS enabled ═══════
  v_test_count := v_test_count + 1;
  BEGIN
    IF EXISTS (
      SELECT 1 FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'billing_events' AND c.relrowsecurity = true
    ) THEN
      v_pass_count := v_pass_count + 1;
      RAISE NOTICE 'TEST 5 PASS: billing_events RLS enabled';
    ELSE
      v_fail_count := v_fail_count + 1;
      RAISE EXCEPTION 'TEST 5 FAIL: billing_events RLS not enabled';
    END IF;
  END;

  -- ═══════ TEST 6: organization_invitations RLS enabled ═══════
  v_test_count := v_test_count + 1;
  BEGIN
    IF EXISTS (
      SELECT 1 FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'organization_invitations' AND c.relrowsecurity = true
    ) THEN
      v_pass_count := v_pass_count + 1;
      RAISE NOTICE 'TEST 6 PASS: organization_invitations RLS enabled';
    ELSE
      v_fail_count := v_fail_count + 1;
      RAISE EXCEPTION 'TEST 6 FAIL: organization_invitations RLS not enabled';
    END IF;
  END;

  -- ═══════ TEST 7: set_period_lock function exists ═══════
  v_test_count := v_test_count + 1;
  BEGIN
    IF EXISTS (
      SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'set_period_lock'
    ) THEN
      v_pass_count := v_pass_count + 1;
      RAISE NOTICE 'TEST 7 PASS: set_period_lock function exists';
    ELSE
      v_fail_count := v_fail_count + 1;
      RAISE EXCEPTION 'TEST 7 FAIL: set_period_lock function missing';
    END IF;
  END;

  -- ═══════ TEST 8: create_invitation function exists ═══════
  v_test_count := v_test_count + 1;
  BEGIN
    IF EXISTS (
      SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'create_invitation'
    ) THEN
      v_pass_count := v_pass_count + 1;
      RAISE NOTICE 'TEST 8 PASS: create_invitation function exists';
    ELSE
      v_fail_count := v_fail_count + 1;
      RAISE EXCEPTION 'TEST 8 FAIL: create_invitation function missing';
    END IF;
  END;

  -- ═══════ TEST 9: accept_invitation function exists ═══════
  v_test_count := v_test_count + 1;
  BEGIN
    IF EXISTS (
      SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'accept_invitation'
    ) THEN
      v_pass_count := v_pass_count + 1;
      RAISE NOTICE 'TEST 9 PASS: accept_invitation function exists';
    ELSE
      v_fail_count := v_fail_count + 1;
      RAISE EXCEPTION 'TEST 9 FAIL: accept_invitation function missing';
    END IF;
  END;

  -- ═══════ TEST 10: revoke_invitation function exists ═══════
  v_test_count := v_test_count + 1;
  BEGIN
    IF EXISTS (
      SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'revoke_invitation'
    ) THEN
      v_pass_count := v_pass_count + 1;
      RAISE NOTICE 'TEST 10 PASS: revoke_invitation function exists';
    ELSE
      v_fail_count := v_fail_count + 1;
      RAISE EXCEPTION 'TEST 10 FAIL: revoke_invitation function missing';
    END IF;
  END;

  -- ═══════ TEST 11: admin functions not callable by anon ═══════
  v_test_count := v_test_count + 1;
  BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname IN ('admin_list_organizations', 'admin_update_plan', 'admin_set_suspension')
        AND p.proacl IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM unnest(p.proacl) AS acl
          WHERE acl::text LIKE '%anon%'
        )
    ) THEN
      v_pass_count := v_pass_count + 1;
      RAISE NOTICE 'TEST 11 PASS: admin functions not granted to anon';
    ELSE
      v_fail_count := v_fail_count + 1;
      RAISE EXCEPTION 'TEST 11 FAIL: admin functions leaked to anon';
    END IF;
  END;

  -- ═══════ TEST 12: export functions exist ═══════
  v_test_count := v_test_count + 1;
  BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = 'export_transactions_csv')
       AND EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = 'export_accounts_csv')
       AND EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = 'export_products_csv')
    THEN
      v_pass_count := v_pass_count + 1;
      RAISE NOTICE 'TEST 12 PASS: export RPC functions exist';
    ELSE
      v_fail_count := v_fail_count + 1;
      RAISE EXCEPTION 'TEST 12 FAIL: some export RPC functions missing';
    END IF;
  END;

  -- ═══════ TEST 13: period lock trigger exists ═══════
  v_test_count := v_test_count + 1;
  BEGIN
    IF EXISTS (
      SELECT 1 FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'transactions'
        AND t.tgname = 'enforce_period_lock_before_transaction'
    ) THEN
      v_pass_count := v_pass_count + 1;
      RAISE NOTICE 'TEST 13 PASS: period lock trigger exists on transactions';
    ELSE
      v_fail_count := v_fail_count + 1;
      RAISE EXCEPTION 'TEST 13 FAIL: period lock trigger missing';
    END IF;
  END;

  -- ═══════ TEST 14: subscription status trigger exists ═══════
  v_test_count := v_test_count + 1;
  BEGIN
    IF EXISTS (
      SELECT 1 FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'transactions'
        AND t.tgname = 'enforce_subscription_before_transaction'
    ) THEN
      v_pass_count := v_pass_count + 1;
      RAISE NOTICE 'TEST 14 PASS: subscription status trigger exists';
    ELSE
      v_fail_count := v_fail_count + 1;
      RAISE EXCEPTION 'TEST 14 FAIL: subscription status trigger missing';
    END IF;
  END;

  -- ═══════ TEST 15: billing_events has correct indexes ═══════
  v_test_count := v_test_count + 1;
  BEGIN
    IF EXISTS (
      SELECT 1 FROM pg_indexes
      WHERE tablename = 'billing_events' AND indexname = 'idx_billing_events_org_id'
    ) THEN
      v_pass_count := v_pass_count + 1;
      RAISE NOTICE 'TEST 15 PASS: billing_events org_id index exists';
    ELSE
      v_fail_count := v_fail_count + 1;
      RAISE EXCEPTION 'TEST 15 FAIL: billing_events org_id index missing';
    END IF;
  END;

  -- ═══════ TEST 16: organization_invitations has token index ═══════
  v_test_count := v_test_count + 1;
  BEGIN
    IF EXISTS (
      SELECT 1 FROM pg_indexes
      WHERE tablename = 'organization_invitations' AND indexname = 'idx_invitations_token'
    ) THEN
      v_pass_count := v_pass_count + 1;
      RAISE NOTICE 'TEST 16 PASS: invitation token index exists';
    ELSE
      v_fail_count := v_fail_count + 1;
      RAISE EXCEPTION 'TEST 16 FAIL: invitation token index missing';
    END IF;
  END;

  -- ═══════ SUMMARY ═══════
  RAISE NOTICE '';
  RAISE NOTICE '══════════════════════════════════════════';
  RAISE NOTICE 'Stage 4 Tests: % total, % passed, % failed', v_test_count, v_pass_count, v_fail_count;
  RAISE NOTICE '══════════════════════════════════════════';

  IF v_fail_count > 0 THEN
    RAISE EXCEPTION 'Stage 4 tests failed: % failures', v_fail_count;
  END IF;
END $$;

\echo 'Stage 4 tests complete'
