-- =============================================================================
-- LEDJER — Account Code Generation Regression Tests
-- =============================================================================
-- Verifies that create_cash_bank_account produces correct sequential codes
-- and avoids duplicating default chart of accounts codes (1110, 1120).
--
-- Run via: supabase/tests/run_all.sql or individually via psql.
-- =============================================================================

\i supabase/tests/_test_helpers.sql

-- =========================================================================
-- Test: First cash account after onboarding gets code 1111 (not 1110)
-- Test: First bank account after onboarding gets code 1121 (not 1120)
-- Test: Sequential creation produces unique codes
-- Test: Staff without permission cannot create accounts
-- Test: Cross-org account mutation is rejected
-- =========================================================================
DO $$
DECLARE
  v_owner UUID;
  v_staff UUID;
  v_org_id UUID;
  v_result JSONB;
  v_code INTEGER;
  v_cash1_id UUID;
  v_cash2_id UUID;
  v_bank1_id UUID;
  v_bank2_id UUID;
  v_staff_org_id UUID;
  v_cross_org_id UUID;
  v_cross_owner UUID;
  v_p0001 TEXT := 'P0001';  -- PL/pgSQL raise_exception SQLSTATE
  v_should_raise_exception CONSTANT TEXT := 'should have raised exception';
  -- Helper: builds a standard error-check message for expected rejections
  v_err_msg TEXT;
BEGIN
  -- ── Setup: owner + staff + organization ──────────────────────────────────
  SELECT t.out_owner_user_id, t.out_staff_user_id, t.out_organization_id
    INTO v_owner, v_staff, v_org_id
  FROM public._test_create_org_with_users(
    'ACCT_CODE_TEST_ORG', CURRENT_DATE,
    false, false, false  -- staff has no permissions
  ) AS t;

  -- Impersonate owner
  PERFORM public._test_impersonate(v_owner);

  -- ══════════════════════════════════════════════════════════════════════════
  -- TEST 1: First cash account after onboarding should be 1111 (not 1110)
  -- Default chart already has code 1110 (Kas)
  -- ══════════════════════════════════════════════════════════════════════════
  v_result := public.create_cash_bank_account(v_org_id, 'Kas Tambahan', 'cash');
  v_code := (v_result ->> 'code')::INTEGER;
  v_cash1_id := (v_result ->> 'id')::UUID;

  PERFORM public._test_assert(
    'AC1: First additional cash account code is 1111',
    v_code = 1111,
    'got ' || v_code::TEXT || ' instead of 1111'
  );

  -- ══════════════════════════════════════════════════════════════════════════
  -- TEST 2: Second cash account should be 1112
  -- ══════════════════════════════════════════════════════════════════════════
  v_result := public.create_cash_bank_account(v_org_id, 'Kas Lain', 'cash');
  v_code := (v_result ->> 'code')::INTEGER;
  v_cash2_id := (v_result ->> 'id')::UUID;

  PERFORM public._test_assert(
    'AC2: Second additional cash account code is 1112',
    v_code = 1112,
    'got ' || v_code::TEXT || ' instead of 1112'
  );

  -- ══════════════════════════════════════════════════════════════════════════
  -- TEST 3: First bank account should be 1121 (not 1120)
  -- Default chart already has code 1120 (Bank)
  -- ══════════════════════════════════════════════════════════════════════════
  v_result := public.create_cash_bank_account(v_org_id, 'Bank Tambahan', 'bank');
  v_code := (v_result ->> 'code')::INTEGER;
  v_bank1_id := (v_result ->> 'id')::UUID;

  PERFORM public._test_assert(
    'AC3: First additional bank account code is 1121',
    v_code = 1121,
    'got ' || v_code::TEXT || ' instead of 1121'
  );

  -- ══════════════════════════════════════════════════════════════════════════
  -- TEST 4: Second bank account should be 1122
  -- ══════════════════════════════════════════════════════════════════════════
  v_result := public.create_cash_bank_account(v_org_id, 'Bank Kedua', 'bank');
  v_code := (v_result ->> 'code')::INTEGER;
  v_bank2_id := (v_result ->> 'id')::UUID;

  PERFORM public._test_assert(
    'AC4: Second additional bank account code is 1122',
    v_code = 1122,
    'got ' || v_code::TEXT || ' instead of 1122'
  );

  -- ══════════════════════════════════════════════════════════════════════════
  -- TEST 5: All account codes are unique within the org
  -- ══════════════════════════════════════════════════════════════════════════
  PERFORM public._test_assert(
    'AC5: No duplicate account codes in org',
    (SELECT COUNT(DISTINCT code) FROM public.accounts WHERE organization_id = v_org_id) =
    (SELECT COUNT(*) FROM public.accounts WHERE organization_id = v_org_id),
    'duplicate codes found'
  );

  -- ══════════════════════════════════════════════════════════════════════════
  -- TEST 6: Default Kas (1110) still exists and new cash accounts don't use it
  -- ══════════════════════════════════════════════════════════════════════════
  PERFORM public._test_assert(
    'AC6: Default Kas (1110) still exists',
    EXISTS (
      SELECT 1 FROM public.accounts
      WHERE organization_id = v_org_id AND code = 1110 AND is_system = true
    ),
    'default Kas 1110 is missing'
  );
  PERFORM public._test_assert(
    'AC6b: New cash account did not get code 1110',
    (SELECT code FROM public.accounts WHERE id = v_cash1_id) != 1110,
    'first cash account wrongly got code 1110'
  );

  -- ══════════════════════════════════════════════════════════════════════════
  -- TEST 7: Staff without can_manage_accounts cannot create accounts
  -- ══════════════════════════════════════════════════════════════════════════
  PERFORM public._test_impersonate(v_staff);
  BEGIN
    PERFORM public.create_cash_bank_account(v_org_id, 'Should Fail', 'cash');
    PERFORM public._test_fail('AC7: Staff without permission', v_should_raise_exception);
  EXCEPTION WHEN OTHERS THEN
    v_err_msg := 'got ' || SQLSTATE || ': ' || SQLERRM;
    PERFORM public._test_assert(
      'AC7: Staff without permission cannot create accounts',
      SQLSTATE = v_p0001,  -- raise_exception
      v_err_msg
    );
  END;

  -- ══════════════════════════════════════════════════════════════════════════
  -- TEST 8: Cross-org account creation is rejected
  -- ══════════════════════════════════════════════════════════════════════════
  -- Create a second org with a different owner
  SELECT t.out_owner_user_id, t.out_organization_id
    INTO v_cross_owner, v_cross_org_id
  FROM public._test_create_org_with_users(
    'CROSS_ORG_TEST', CURRENT_DATE
  ) AS t;

  -- Impersonate owner of first org, try to create account in second org
  PERFORM public._test_impersonate(v_owner);
  BEGIN
    PERFORM public.create_cash_bank_account(v_cross_org_id, 'Cross Org Hack', 'cash');
    PERFORM public._test_fail('AC8: Cross-org account creation', v_should_raise_exception);
  EXCEPTION WHEN OTHERS THEN
    v_err_msg := 'got ' || SQLSTATE || ': ' || SQLERRM;
    PERFORM public._test_assert(
      'AC8: Cross-org account creation is rejected',
      SQLSTATE = v_p0001,
      v_err_msg
    );
  END;

  -- ══════════════════════════════════════════════════════════════════════════
  -- TEST 9: QRIS/e-wallet accounts get codes in 1130-1139 range
  -- ══════════════════════════════════════════════════════════════════════════
  PERFORM public._test_impersonate(v_owner);
  v_result := public.create_cash_bank_account(v_org_id, 'QRIS Test', 'qris');
  v_code := (v_result ->> 'code')::INTEGER;

  PERFORM public._test_assert(
    'AC9: QRIS account code in 1130-1139 range',
    v_code >= 1130 AND v_code <= 1139,
    'got ' || v_code::TEXT
  );

  -- ══════════════════════════════════════════════════════════════════════════
  -- TEST 10: Duplicate account name is rejected
  -- ══════════════════════════════════════════════════════════════════════════
  BEGIN
    PERFORM public.create_cash_bank_account(v_org_id, 'Kas Tambahan', 'cash');
    PERFORM public._test_fail('AC10: Duplicate name rejected', v_should_raise_exception);
  EXCEPTION WHEN OTHERS THEN
    v_err_msg := 'got ' || SQLSTATE || ': ' || SQLERRM;
    PERFORM public._test_assert(
      'AC10: Duplicate account name is rejected',
      SQLSTATE = v_p0001,
      v_err_msg
    );
  END;

  RAISE NOTICE '=== Account Code Generation Tests Complete ===';
END $$;
