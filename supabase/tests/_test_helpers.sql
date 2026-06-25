-- =============================================================================
-- LEDJER — Shared SQL Test Helpers
-- =============================================================================
-- Strict test harness used by every test file:
--   PASS → RAISE NOTICE (visible in CI logs)
--   FAIL → RAISE EXCEPTION (non-zero exit, fails the run)
--
-- This file is meant to be loaded by every test script that needs assertions.
-- It is intentionally NOT loaded by migration files (see p0 critical fix
-- migration for rationale).
--
-- SECURITY: All _test_* functions are created with EXECUTE revoked from
-- PUBLIC, anon, and authenticated.  They are only callable by the postgres
-- superuser (the role running the test suite).
--
-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  WARNING: NEVER run this file against production or any persistent      ║
-- ║  hosted database.  Tests create test users in auth.users, insert        ║
-- ║  disposable organizations, and may revoke/grant privileges.             ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝
-- =============================================================================

-- ---------------------------------------------------------------------------
-- _test_assert: Strict assertion
--
-- Pass:  RAISE NOTICE 'PASS: ...'
-- Fail:  RAISE EXCEPTION 'TEST FAILURE: ...'
--
-- Never emits WARNING only; WARNING can be silenced by clients and was the
-- root cause of false-green runs.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._test_assert(
  p_test_name TEXT,
  p_condition BOOLEAN,
  p_detail TEXT DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
  IF p_condition THEN
    RAISE NOTICE 'PASS: %', p_test_name;
  ELSE
    RAISE EXCEPTION
      'TEST FAILURE: % %. Run this test against the expected state.',
      p_test_name,
      CASE WHEN p_detail IS NOT NULL THEN ' [' || p_detail || ']' ELSE '' END;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------
-- _test_assert_eq_numeric: Strict numeric equality with tolerance.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._test_assert_eq_numeric(
  p_test_name TEXT,
  p_actual NUMERIC,
  p_expected NUMERIC,
  p_tolerance NUMERIC DEFAULT 0.01
)
RETURNS VOID AS $$
DECLARE
  v_diff NUMERIC;
BEGIN
  v_diff := ABS(COALESCE(p_actual, 0) - COALESCE(p_expected, 0));
  IF v_diff <= p_tolerance THEN
    RAISE NOTICE 'PASS: % (actual=%, expected=%)', p_test_name, p_actual, p_expected;
  ELSE
    RAISE EXCEPTION
      'TEST FAILURE: % — expected %, got % (diff=%)',
      p_test_name, p_expected, p_actual, v_diff;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------
-- _test_fail: Manually fail a test with a custom message.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._test_fail(
  p_test_name TEXT,
  p_detail TEXT
)
RETURNS VOID AS $$
BEGIN
  RAISE EXCEPTION 'TEST FAILURE: % — %', p_test_name, COALESCE(p_detail, '(no detail)');
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------
-- _test_cleanup: Drop helper functions when tests complete.
-- Each test file calls this at the end.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._test_cleanup()
RETURNS VOID AS $$
DECLARE
  fn RECORD;
BEGIN
  FOR fn IN
    SELECT p.proname || '(' ||
           pg_get_function_identity_arguments(p.oid) || ')' AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        '_test_assert', '_test_assert_eq_numeric', '_test_fail',
        '_test_cleanup', '_test_create_owner_and_org',
        '_test_create_org_with_users', '_test_impersonate'
      )
  LOOP
    BEGIN
      EXECUTE 'DROP FUNCTION IF EXISTS public.' || fn.sig || ' CASCADE';
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Cleanup warning for %: %', fn.sig, SQLERRM;
    END; END LOOP;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Cleanup warning: %', SQLERRM;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------
-- _test_impersonate: Set request.jwt.claims so SECURITY DEFINER RPCs
-- see auth.uid() as the supplied user within the current transaction.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._test_impersonate(p_user_id UUID)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', p_user_id, 'role', 'authenticated')::text,
    true);
END;
$$;

-- ---------------------------------------------------------------------------
-- _test_create_org_with_users: Generic factory for permission / RLS tests.
--
-- Creates a fresh organization with two members:
--   - owner (User A) with all permissions
--   - staff (User B) with limited permissions
-- Optionally a second organization with its own owner (User C) for cross-org.
--
-- Returns the IDs needed to call RPCs and impersonate each user.
-- SECURITY DEFINER so the helper itself does not require RLS visibility.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._test_create_org_with_users(
  p_org_name TEXT,
  p_books_start DATE,
  p_staff_perm_create BOOLEAN DEFAULT false,
  p_staff_perm_reports BOOLEAN DEFAULT false,
  p_staff_perm_void BOOLEAN DEFAULT false
)
RETURNS TABLE (
  out_owner_user_id UUID,
  out_staff_user_id UUID,
  out_organization_id UUID,
  out_cash_account_id UUID,
  out_payable_account_id UUID,
  out_revenue_account_id UUID
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_owner UUID := gen_random_uuid();
  v_staff UUID := gen_random_uuid();
  v_oid  UUID := gen_random_uuid();
  v_cash_id UUID;
  v_pay_id UUID;
  v_rev_id UUID;
  v_books DATE := COALESCE(p_books_start, CURRENT_DATE);
BEGIN
  -- Two auth.users rows (one per member)
  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password,
                          email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                          created_at, updated_at, confirmation_token,
                          email_change, email_change_token_new, recovery_token)
  VALUES
    (v_owner, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'owner-' || v_owner::TEXT || '@test.local', '', now(),
     '{"provider":"email","providers":["email"]}'::jsonb,
     jsonb_build_object('full_name', 'Owner')::jsonb,
     now(), now(), '', '', '', ''),
    (v_staff, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'staff-' || v_staff::TEXT || '@test.local', '', now(),
     '{"provider":"email","providers":["email"]}'::jsonb,
     jsonb_build_object('full_name', 'Staff')::jsonb,
     now(), now(), '', '', '', '')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.profiles (user_id, full_name, email)
  VALUES
    (v_owner, 'Owner', 'owner-' || v_owner::TEXT || '@test.local'),
    (v_staff, 'Staff', 'staff-' || v_staff::TEXT || '@test.local')
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.organizations (id, name, business_type, base_currency, books_start_date, onboarding_status, created_by)
  VALUES (v_oid, p_org_name, 'simple_trading', 'IDR', v_books, 'in_progress', v_owner)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.organization_members (
    organization_id, user_id, role, status,
    can_create_transaction, can_view_reports, can_manage_accounts,
    can_void_transaction, can_view_audit_log, can_manage_products,
    invited_by, joined_at
  )
  VALUES
    (v_oid, v_owner, 'owner', 'active',
     true, true, true, true, true, true, v_owner, now()),
    (v_oid, v_staff, 'staff', 'active',
     p_staff_perm_create, p_staff_perm_reports, false,
     p_staff_perm_void, false, false,
     v_owner, now())
  ON CONFLICT DO NOTHING;

  PERFORM public.create_default_accounts(v_oid, p_org_name);

  SELECT id INTO v_cash_id FROM public.accounts WHERE organization_id = v_oid AND code = 1110 AND is_active = true LIMIT 1;
  SELECT id INTO v_pay_id FROM public.accounts WHERE organization_id = v_oid AND code = 2100 AND is_active = true LIMIT 1;
  SELECT id INTO v_rev_id FROM public.accounts WHERE organization_id = v_oid AND code = 4100 AND is_active = true LIMIT 1;

  RETURN QUERY SELECT v_owner, v_staff, v_oid, v_cash_id, v_pay_id, v_rev_id;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════
-- SECURITY: Revoke EXECUTE from PUBLIC, anon, and authenticated for
-- all _test_* functions.  Tests run as the postgres superuser.
-- ═══════════════════════════════════════════════════════════════════
DO $$
DECLARE
  fn RECORD;
BEGIN
  FOR fn IN
    SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname LIKE '_test_%'
  LOOP
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.' || quote_ident(fn.proname) || '(' || fn.args || ') FROM PUBLIC, anon, authenticated';
  END LOOP;
END $$;
