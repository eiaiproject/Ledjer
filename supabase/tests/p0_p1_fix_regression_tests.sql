-- =============================================================================
-- LEDJER — P0/P1 Fix Regression Tests (T-1 through T-6)
-- =============================================================================
-- Run AFTER all migrations are applied.
-- Uses _test_assert for strict pass/fail.
-- =============================================================================

\i supabase/tests/_test_helpers.sql

-- ═══════════════════════════════════════════════════════════════════
-- T-1: log_security_event — non-member call is rejected (P0-2)
-- ═══════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_owner UUID;
  v_staff UUID;
  v_oid UUID;
  v_intruder UUID;
  v_error TEXT;
BEGIN
  SELECT out_owner_user_id, out_staff_user_id, out_organization_id
  INTO v_owner, v_staff, v_oid
  FROM public._test_create_org_with_users('T1_org', CURRENT_DATE);

  -- Create a user NOT in this org
  v_intruder := gen_random_uuid();
  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password,
                          email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                          created_at, updated_at, confirmation_token,
                          email_change, email_change_token_new, recovery_token)
  VALUES (v_intruder, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          'intruder-' || v_intruder::TEXT || '@test.local', '', now(),
          '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
          now(), now(), '', '', '', '')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.profiles (user_id, full_name, email)
  VALUES (v_intruder, 'Intruder', 'intruder-' || v_intruder::TEXT || '@test.local')
  ON CONFLICT (user_id) DO NOTHING;

  -- Impersonate the intruder — log_security_event should raise
  PERFORM public._test_impersonate(v_intruder);

  BEGIN
    PERFORM public.log_security_event(v_oid, v_intruder, 'test_action');
    PERFORM public._test_fail('T-1', 'log_security_event did not raise for non-member');
  EXCEPTION WHEN OTHERS THEN
    v_error := SQLERRM;
    PERFORM public._test_assert(
      'T-1: log_security_event rejects non-member',
      v_error ILIKE '%anggota%' OR v_error ILIKE '%autentikasi%',
      'Unexpected: ' || v_error
    );
  END;
END $$;

-- ═══════════════════════════════════════════════════════════════════
-- T-2: protect_account_fields — member cannot set is_system/is_locked (P1-3)
-- ═══════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_owner UUID;
  v_oid UUID;
  v_acct_id UUID;
  v_error TEXT;
BEGIN
  SELECT out_owner_user_id, out_organization_id
  INTO v_owner, v_oid
  FROM public._test_create_org_with_users('T2_org', CURRENT_DATE);

  SELECT id INTO v_acct_id FROM public.accounts
  WHERE organization_id = v_oid AND code = 1110 LIMIT 1;

  IF v_acct_id IS NULL THEN
    PERFORM public._test_fail('T-2 setup', 'cash account 1110 not found');
  END IF;

  -- Impersonate owner (has can_manage_accounts)
  PERFORM public._test_impersonate(v_owner);

  -- Try to flip is_system on an account (must be false → test blocks it)
  BEGIN
    UPDATE public.accounts SET is_system = false WHERE id = v_acct_id;
    PERFORM public._test_fail('T-2', 'UPDATE is_system should have been blocked by trigger');
  EXCEPTION WHEN OTHERS THEN
    v_error := SQLERRM;
    PERFORM public._test_assert(
      'T-2a: member cannot set is_system',
      v_error ILIKE '%sistem%' OR v_error ILIKE '%trigger%',
      'Unexpected: ' || v_error
    );
  END;

  -- Try to flip is_locked
  BEGIN
    UPDATE public.accounts SET is_locked = true WHERE id = v_acct_id;
    PERFORM public._test_fail('T-2', 'UPDATE is_locked should have been blocked by trigger');
  EXCEPTION WHEN OTHERS THEN
    v_error := SQLERRM;
    PERFORM public._test_assert(
      'T-2b: member cannot set is_locked',
      v_error ILIKE '%kunci%' OR v_error ILIKE '%trigger%',
      'Unexpected: ' || v_error
    );
  END;

  -- Verify rename still works
  BEGIN
    UPDATE public.accounts SET name = 'Kas/Bank Rename Test' WHERE id = v_acct_id;
    PERFORM public._test_assert('T-2c: rename still works', true);
  EXCEPTION WHEN OTHERS THEN
    PERFORM public._test_fail('T-2c', 'Rename should succeed: ' || SQLERRM);
  END;

  -- Cleanup (is_system already true, is_locked already false from setup)
  UPDATE public.accounts SET name = 'Kas' WHERE id = v_acct_id;
END $$;

-- ═══════════════════════════════════════════════════════════════════
-- T-3: get_balance_sheet — Assets = Liabilities + Equity with inactive acct (P0-4)
-- ═══════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_owner UUID;
  v_oid UUID;
  v_cash_id UUID;
  v_rev_id UUID;
  v_asset_sum NUMERIC;
  v_liab_sum NUMERIC;
  v_eq_sum NUMERIC;
  v_inactive_acct UUID;
BEGIN
  SELECT out_owner_user_id, out_organization_id, out_cash_account_id, out_revenue_account_id
  INTO v_owner, v_oid, v_cash_id, v_rev_id
  FROM public._test_create_org_with_users('T3_org', CURRENT_DATE);

  -- Post a cash sale to create balances
  PERFORM public._test_impersonate(v_owner);
  PERFORM public.post_transaction(
    v_oid, CURRENT_DATE, 'cash_sale', 500000,
    NULL, NULL, v_cash_id, NULL, 'paid', NULL, NULL,
    'T3 sale', NULL, NULL, NULL, NULL
  );

  -- Create an inactive account with a non-zero balance by posting then deactivating
  -- Use a simple_adjustment to move money to a custom account
  DECLARE
    v_custom_acct UUID;
  BEGIN
    INSERT INTO public.accounts (organization_id, code, name, account_type, normal_balance, is_active, is_system, is_cash_account)
    VALUES (v_oid, 9999, 'T3 Test Asset', 'asset', 'debit', true, false, false)
    RETURNING id INTO v_custom_acct;

    PERFORM public.post_transaction(
      v_oid, CURRENT_DATE, 'simple_adjustment', 100000,
      NULL, NULL, v_cash_id, NULL, 'paid', NULL, NULL,
      'T3 adjustment', NULL, NULL, NULL, NULL, v_custom_acct
    );

    -- Deactivate the custom account
    UPDATE public.accounts SET is_active = false WHERE id = v_custom_acct;

    -- Now check balance sheet
    SELECT SUM(amount) INTO v_asset_sum
    FROM public.get_balance_sheet(v_oid, CURRENT_DATE)
    WHERE section = 'asset';

    SELECT SUM(amount) INTO v_liab_sum
    FROM public.get_balance_sheet(v_oid, CURRENT_DATE)
    WHERE section = 'liability';

    SELECT SUM(amount) INTO v_eq_sum
    FROM public.get_balance_sheet(v_oid, CURRENT_DATE)
    WHERE section = 'equity';

    -- Assets should include the deactivated 9999 account with 100000 balance
    PERFORM public._test_assert(
      'T-3: Assets = Liabilities + Equity (with inactive account)',
      ABS(COALESCE(v_asset_sum, 0) - (COALESCE(v_liab_sum, 0) + COALESCE(v_eq_sum, 0))) < 0.01,
      'asset=' || v_asset_sum || ', liab=' || v_liab_sum || ', eq=' || v_eq_sum
    );
  END;
END $$;

-- ═══════════════════════════════════════════════════════════════════
-- T-4: Zero-cost product sale — BLOCKED by P1-2a (harga pokok check)
-- ═══════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_owner UUID;
  v_oid UUID;
  v_cash_id UUID;
  v_product_id UUID;
  v_error TEXT;
BEGIN
  SELECT out_owner_user_id, out_organization_id, out_cash_account_id
  INTO v_owner, v_oid, v_cash_id
  FROM public._test_create_org_with_users('T4_org', CURRENT_DATE);

  PERFORM public._test_impersonate(v_owner);

  -- Create a product with zero purchase_price
  INSERT INTO public.products (organization_id, name, code, unit, purchase_price, selling_price, current_stock, is_active)
  VALUES (v_oid, 'T4 Zero Cost Item', 'T4-ZC', 'pcs', 0, 10000, 10, true)
  RETURNING id INTO v_product_id;

  -- Record opening stock at zero cost
  PERFORM public.record_stock_movement(
    v_oid, v_product_id, CURRENT_DATE,
    'opening_balance', 10, 0,
    NULL, 'T4 opening stock'
  );

  -- Attempt to sell — should be blocked because purchase_price = 0
  BEGIN
    PERFORM public.post_transaction(
      v_oid, CURRENT_DATE, 'cash_sale', 100000,
      NULL, NULL, v_cash_id, NULL, 'paid', NULL, NULL,
      'T4 zero cost sale attempt', NULL, v_product_id, 10, 10000
    );
    PERFORM public._test_fail('T-4', 'Zero-cost sale should have been blocked by harga pokok check');
  EXCEPTION WHEN OTHERS THEN
    v_error := SQLERRM;
    PERFORM public._test_assert(
      'T-4: zero-cost product sale is blocked',
      v_error ILIKE '%harga pokok%' OR v_error ILIKE '%purchase_price%' OR v_error ILIKE '%belum diatur%',
      'Unexpected: ' || v_error
    );
  END;

  -- Verify no journal was created for the failed sale
  PERFORM public._test_assert(
    'T-4b: no journal entries created for blocked zero-cost sale',
    NOT EXISTS (
      SELECT 1 FROM public.journal_entries
      WHERE organization_id = v_oid
        AND description ILIKE '%T4 zero cost sale%'
        AND status = 'posted'
    ),
    'Journal entries should not exist for a blocked sale'
  );
END $$;

-- ═══════════════════════════════════════════════════════════════════
-- T-5: Voiding a reversal raises (P1-2)
-- ═══════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_owner UUID;
  v_oid UUID;
  v_cash_id UUID;
  v_txn_id UUID;
  v_reversal_txn_id UUID;
  v_error TEXT;
BEGIN
  SELECT out_owner_user_id, out_organization_id, out_cash_account_id
  INTO v_owner, v_oid, v_cash_id
  FROM public._test_create_org_with_users('T5_org', CURRENT_DATE);

  PERFORM public._test_impersonate(v_owner);

  -- Post a simple transaction
  SELECT (public.post_transaction(
    v_oid, CURRENT_DATE, 'owner_capital', 1000000,
    NULL, NULL, v_cash_id, NULL, 'paid', NULL, NULL,
    'T5 capital', NULL, NULL, NULL, NULL
  ) ->> 'transaction_id')::UUID INTO v_txn_id;

  -- Void it (creates a reversal)
  SELECT (public.void_transaction(
    v_oid, v_txn_id, 'T5 void test', CURRENT_DATE
  ) ->> 'reversal_transaction_id')::UUID INTO v_reversal_txn_id;

  -- Try to void the reversal
  BEGIN
    PERFORM public.void_transaction(v_oid, v_reversal_txn_id, 'T5 double void', CURRENT_DATE);
    PERFORM public._test_fail('T-5', 'voiding reversal should have raised');
  EXCEPTION WHEN OTHERS THEN
    v_error := SQLERRM;
    PERFORM public._test_assert(
      'T-5: voiding a reversal raises',
      v_error ILIKE '%pembatalan% tidak dapat dibatalkan%' OR v_error ILIKE '%reversal%',
      'Unexpected: ' || v_error
    );
  END;
END $$;

-- ═══════════════════════════════════════════════════════════════════
-- T-6: All SECURITY DEFINER functions with org-id pin search_path
--      and reference auth.uid() + is_org_member (or are service_role-only)
-- ═══════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_fn RECORD;
  v_def TEXT;
  v_has_search_path BOOLEAN;
  v_has_auth_uid BOOLEAN;
  v_has_is_org_member BOOLEAN;
  v_is_service_role_only BOOLEAN;
  v_grant_count INTEGER;
  v_errors TEXT := '';
BEGIN
  FOR v_fn IN
    SELECT p.proname, pg_get_function_arguments(p.oid) AS args,
           pg_get_functiondef(p.oid) AS def,
           p.prosecdef
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef = true
      AND pg_get_function_identity_arguments(p.oid) LIKE '%UUID%'
  LOOP
    v_def := v_fn.def;
    v_has_search_path := v_def ILIKE '%SET search_path%';
    v_has_auth_uid := v_def ILIKE '%auth.uid()%';
    v_has_is_org_member := v_def ILIKE '%is_org_member%';

    -- Check if function is granted to anon or authenticated (non-service-role)
    SELECT COUNT(*) INTO v_grant_count
    FROM information_schema.role_routine_grants
    WHERE routine_schema = 'public'
      AND routine_name = v_fn.proname
      AND grantee IN ('anon', 'authenticated');

    v_is_service_role_only := (v_grant_count = 0);

    IF NOT v_has_search_path THEN
      v_errors := v_errors || E'\n  Missing search_path: ' || v_fn.proname;
    END IF;

    -- If granted to anon/authenticated, must have auth.uid() + is_org_member
    IF NOT v_is_service_role_only AND NOT (v_has_auth_uid AND v_has_is_org_member) THEN
      v_errors := v_errors || E'\n  Exposed to client but missing auth check: ' || v_fn.proname
        || ' (auth_uid=' || v_has_auth_uid || ', is_org_member=' || v_has_is_org_member || ')';
    END IF;
  END LOOP;

  IF v_errors = '' THEN
    PERFORM public._test_assert('T-6: all SECURITY DEFINER org-id functions hardened', true);
  ELSE
    PERFORM public._test_fail('T-6', 'Security violations found:' || v_errors);
  END IF;
END $$;

-- Cleanup deferred to run_all.sql
