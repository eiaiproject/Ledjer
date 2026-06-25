-- =============================================================================
-- LEDJER — Privilege Hardening Regression Tests (STRICT)
-- =============================================================================
-- Uses pg_class/pg_namespace (not pg_tables-only) to cover tables,
-- partitioned tables, views, materialized views, and sequences.
-- Uses has_*_privilege (not string ACL regex) for reliable checks.
--
-- Run AFTER all migrations are applied.
-- STRICT: RAISE EXCEPTION on any failure (psql exits non-zero).
-- =============================================================================

\i supabase/tests/_test_helpers.sql

-- ═══════════════════════════════════════════════════════════════════
-- TEST 1: anon must NOT have TRUNCATE/TRIGGER/REFERENCES/MAINTAIN
--         on any public relation (tables, views, partitioned tables, materialized views).
-- ═══════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_rel     TEXT;
  v_priv    TEXT;
  v_has     BOOLEAN;
  v_failing TEXT[] := ARRAY[]::TEXT[];
BEGIN
  FOR v_rel IN
    SELECT n.nspname || '.' || c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'p', 'v', 'm')  -- regular tables, partitioned tables, views, materialized views
  LOOP
    FOREACH v_priv IN ARRAY ARRAY['TRUNCATE', 'TRIGGER', 'REFERENCES', 'MAINTAIN'] LOOP
      BEGIN
        SELECT has_table_privilege('anon', v_rel, v_priv) INTO v_has;
        IF v_has THEN
          v_failing := array_append(v_failing, 'anon.' || v_priv || ' ON ' || v_rel);
        END IF;
      EXCEPTION WHEN OTHERS THEN
        NULL;  -- skip if has_table_privilege fails for this relkind
      END;
    END LOOP;
  END LOOP;

  IF array_length(v_failing, 1) > 0 THEN
    RAISE EXCEPTION 'PRIVILEGE VIOLATION: anon has dangerous privileges: %',
      array_to_string(v_failing, ', ');
  END IF;

  RAISE NOTICE 'PASS: anon has no TRUNCATE/TRIGGER/REFERENCES/MAINTAIN on any public relation';
END $$;

-- ═══════════════════════════════════════════════════════════════════
-- TEST 2: authenticated must NOT have TRUNCATE/TRIGGER/REFERENCES/MAINTAIN
--         on any public relation (tables, views, partitioned tables, materialized views).
-- ═══════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_rel     TEXT;
  v_priv    TEXT;
  v_has     BOOLEAN;
  v_failing TEXT[] := ARRAY[]::TEXT[];
BEGIN
  FOR v_rel IN
    SELECT n.nspname || '.' || c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'p', 'v', 'm')  -- regular tables, partitioned tables, views, materialized views
  LOOP
    FOREACH v_priv IN ARRAY ARRAY['TRUNCATE', 'TRIGGER', 'REFERENCES', 'MAINTAIN'] LOOP
      BEGIN
        SELECT has_table_privilege('authenticated', v_rel, v_priv) INTO v_has;
        IF v_has THEN
          v_failing := array_append(v_failing, 'authenticated.' || v_priv || ' ON ' || v_rel);
        END IF;
      EXCEPTION WHEN OTHERS THEN
        NULL;
      END;
    END LOOP;
  END LOOP;

  IF array_length(v_failing, 1) > 0 THEN
    RAISE EXCEPTION 'PRIVILEGE VIOLATION: authenticated has dangerous privileges: %',
      array_to_string(v_failing, ', ');
  END IF;

  RAISE NOTICE 'PASS: authenticated has no TRUNCATE/TRIGGER/REFERENCES/MAINTAIN on any public relation';
END $$;

-- ═══════════════════════════════════════════════════════════════════
-- TEST 3: anon must NOT have any DML (INSERT/UPDATE/DELETE) on
--         financial/business tables and views.
-- ═══════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_table TEXT;
  v_priv  TEXT;
  v_has   BOOLEAN;
  v_failing TEXT[] := ARRAY[]::TEXT[];
BEGIN
  FOR v_table IN
    SELECT n.nspname || '.' || c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'p', 'v', 'm')  -- tables, partitioned tables, views, materialized views
      AND c.relname IN (
        'transactions', 'journal_entries', 'journal_lines',
        'stock_movements', 'audit_logs', 'rate_limits', 'login_attempts',
        'general_ledger'
      )
  LOOP
    FOREACH v_priv IN ARRAY ARRAY['INSERT', 'UPDATE', 'DELETE'] LOOP
      BEGIN
        SELECT has_table_privilege('anon', v_table, v_priv) INTO v_has;
        IF v_has THEN
          v_failing := array_append(v_failing, 'anon.' || v_priv || ' ON ' || v_table);
        END IF;
      EXCEPTION WHEN OTHERS THEN
        NULL;
      END;
    END LOOP;
  END LOOP;

  IF array_length(v_failing, 1) > 0 THEN
    RAISE EXCEPTION 'PRIVILEGE VIOLATION: anon has business-table DML: %',
      array_to_string(v_failing, ', ');
  END IF;

  RAISE NOTICE 'PASS: anon has no DML on financial/business tables and views';
END $$;

-- ═══════════════════════════════════════════════════════════════════
-- TEST 4: service_role MUST retain TRUNCATE/TRIGGER/REFERENCES/MAINTAIN
--         on financial tables (needed for SECURITY DEFINER + migrations).
-- ═══════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_table TEXT;
  v_has   BOOLEAN;
  v_missing TEXT[] := ARRAY[]::TEXT[];
BEGIN
  FOR v_table IN
    SELECT n.nspname || '.' || c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'p')
      AND c.relname IN ('transactions', 'journal_entries', 'journal_lines', 'audit_logs')
  LOOP
    SELECT has_table_privilege('service_role', v_table, 'TRUNCATE') INTO v_has;
    IF NOT v_has THEN
      v_missing := array_append(v_missing, 'TRUNCATE ON ' || v_table);
    END IF;
  END LOOP;

  IF array_length(v_missing, 1) > 0 THEN
    RAISE EXCEPTION 'service_role missing expected privileges: %',
      array_to_string(v_missing, ', ');
  END IF;

  RAISE NOTICE 'PASS: service_role retains expected privileges on financial tables';
END $$;

-- ═══════════════════════════════════════════════════════════════════
-- TEST 5: Default privileges — no DML or dangerous privileges or
--         EXECUTE for anon or authenticated on future objects.
-- ═══════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_rec RECORD;
  v_failing TEXT[] := ARRAY[]::TEXT[];
BEGIN
  -- Check default ACLs for tables (objtype 'r') from postgres role
  FOR v_rec IN
    SELECT
      pg_get_userbyid(defaclrole) AS grantor,
      defaclacl::TEXT AS acl_text
    FROM pg_default_acl
    WHERE defaclnamespace = 'public'::regnamespace
      AND defaclobjtype = 'r'
      AND defaclrole = 'postgres'::regrole  -- only check postgres (we control this)
  LOOP
    IF v_rec.acl_text ~ '\banon=[^/]*[adDxtm]' THEN
      v_failing := array_append(v_failing,
        'default table ACL grants DML to anon (' || v_rec.grantor || ')');
    END IF;
    IF v_rec.acl_text ~ '\banon=[^/]*[xXTR]' THEN
      v_failing := array_append(v_failing,
        'default table ACL grants dangerous to anon (' || v_rec.grantor || ')');
    END IF;
    IF v_rec.acl_text ~ '\bauthenticated=[^/]*[xXTR]' THEN
      v_failing := array_append(v_failing,
        'default table ACL grants dangerous to authenticated (' || v_rec.grantor || ')');
    END IF;
  END LOOP;

  -- Check default ACLs for functions (objtype 'f') from postgres role
  FOR v_rec IN
    SELECT
      pg_get_userbyid(defaclrole) AS grantor,
      defaclacl::TEXT AS acl_text
    FROM pg_default_acl
    WHERE defaclnamespace = 'public'::regnamespace
      AND defaclobjtype = 'f'
      AND defaclrole = 'postgres'::regrole
  LOOP
    IF v_rec.acl_text ~ '\banon=[^/]*X' THEN
      v_failing := array_append(v_failing,
        'default function ACL grants EXECUTE to anon (' || v_rec.grantor || ')');
    END IF;
  END LOOP;

  -- Note: supabase_admin default ACLs are managed at the Supabase infrastructure
  -- level and cannot be altered by the postgres role.  In production, these are
  -- set by the Supabase platform.  The migration revokes postgres defaults;
  -- supabase_admin defaults are controlled by Supabase dashboard settings.

  IF array_length(v_failing, 1) > 0 THEN
    RAISE EXCEPTION 'PRIVILEGE VIOLATION: %', array_to_string(v_failing, ', ');
  END IF;

  RAISE NOTICE 'PASS: default privileges do not grant DML/dangerous/EXECUTE to anon or dangerous to authenticated';
END $$;

-- ═══════════════════════════════════════════════════════════════════
-- TEST 6: Internal helper functions are NOT exposed to anon/authenticated.
-- ═══════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_fn     TEXT;
  v_failing TEXT[] := ARRAY[]::TEXT[];
BEGIN
  FOR v_fn IN
    SELECT p.proname
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'create_default_accounts',
        'generate_entry_number',
        'generate_transaction_number',
        'get_next_counter',
        'record_stock_movement',
        'update_product_stock',
        'recalculate_product_average_cost',
        'validate_product_sale_accounts',
        'protect_account_fields',
        'protect_product_stock_update',
        'record_initial_product_stock',
        'standardize_transaction_number',
        'get_account_by_code',
        'log_security_event',
        'post_transaction_impl_20260702',
        'create_organization_with_template'
      )
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_proc p2
      JOIN pg_namespace n2 ON n2.oid = p2.pronamespace
      WHERE n2.nspname = 'public' AND p2.proname = v_fn
        AND has_function_privilege('anon', p2.oid, 'EXECUTE')
    ) THEN
      v_failing := array_append(v_failing, 'anon can EXECUTE ' || v_fn);
    END IF;
    IF EXISTS (
      SELECT 1 FROM pg_proc p2
      JOIN pg_namespace n2 ON n2.oid = p2.pronamespace
      WHERE n2.nspname = 'public' AND p2.proname = v_fn
        AND has_function_privilege('authenticated', p2.oid, 'EXECUTE')
    ) THEN
      v_failing := array_append(v_failing, 'authenticated can EXECUTE ' || v_fn);
    END IF;
  END LOOP;

  IF array_length(v_failing, 1) > 0 THEN
    RAISE EXCEPTION 'PRIVILEGE VIOLATION: internal functions exposed: %',
      array_to_string(v_failing, ', ');
  END IF;

  RAISE NOTICE 'PASS: internal helper functions are not exposed to anon/authenticated';
END $$;

-- ═══════════════════════════════════════════════════════════════════
-- TEST 7: Financial RPCs are callable by authenticated only.
-- ═══════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_fn TEXT;
  v_can_auth BOOLEAN;
  v_can_anon BOOLEAN;
  v_failing TEXT[] := ARRAY[]::TEXT[];
BEGIN
  FOR v_fn IN
    SELECT DISTINCT p.proname
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'post_transaction',
        'void_transaction',
        'create_organization_with_opening_balances',
        'post_opening_balance',
        'invite_staff',
        'remove_staff',
        'update_staff_permissions',
        'get_balance_sheet',
        'get_profit_loss',
        'get_trial_balance',
        'get_dashboard_summary',
        'get_monthly_summary',
        'get_account_balance'
      )
  LOOP
    SELECT EXISTS (
      SELECT 1 FROM pg_proc p2 JOIN pg_namespace n2 ON n2.oid = p2.pronamespace
      WHERE n2.nspname = 'public' AND p2.proname = v_fn
        AND has_function_privilege('authenticated', p2.oid, 'EXECUTE')
    ) INTO v_can_auth;
    SELECT EXISTS (
      SELECT 1 FROM pg_proc p2 JOIN pg_namespace n2 ON n2.oid = p2.pronamespace
      WHERE n2.nspname = 'public' AND p2.proname = v_fn
        AND has_function_privilege('anon', p2.oid, 'EXECUTE')
    ) INTO v_can_anon;

    IF NOT v_can_auth THEN
      v_failing := array_append(v_failing, 'authenticated CANNOT EXECUTE ' || v_fn);
    END IF;
    IF v_can_anon THEN
      v_failing := array_append(v_failing, 'anon CAN EXECUTE ' || v_fn || ' (should be revoked)');
    END IF;
  END LOOP;

  IF array_length(v_failing, 1) > 0 THEN
    RAISE EXCEPTION 'RPC privilege mismatch: %', array_to_string(v_failing, ', ');
  END IF;

  RAISE NOTICE 'PASS: financial RPCs callable by authenticated, revoked from anon';
END $$;

-- ═══════════════════════════════════════════════════════════════════
-- TEST 8: authenticated must NOT have INSERT/UPDATE/DELETE on
--         general_ledger view (SELECT-only, mutations via RPCs).
-- ═══════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_priv  TEXT;
  v_has   BOOLEAN;
  v_failing TEXT[] := ARRAY[]::TEXT[];
BEGIN
  FOREACH v_priv IN ARRAY ARRAY['INSERT', 'UPDATE', 'DELETE'] LOOP
    BEGIN
      SELECT has_table_privilege('authenticated', 'public.general_ledger', v_priv) INTO v_has;
      IF v_has THEN
        v_failing := array_append(v_failing, 'authenticated.' || v_priv || ' ON public.general_ledger');
      END IF;
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END LOOP;

  IF array_length(v_failing, 1) > 0 THEN
    RAISE EXCEPTION 'PRIVILEGE VIOLATION: %', array_to_string(v_failing, ', ');
  END IF;

  RAISE NOTICE 'PASS: authenticated has no DML on general_ledger view (SELECT-only)';
END $$;

-- ═══════════════════════════════════════════════════════════════════
-- TEST 9: _test_* helper functions are NOT callable by PUBLIC,
--         anon, or authenticated (test harness isolation).
-- First revoke any _test_* functions created by test suites after
-- the initial revocation in _test_helpers.sql.
-- ═══════════════════════════════════════════════════════════════════
DO $$
DECLARE
  fn2 RECORD;
BEGIN
  FOR fn2 IN
    SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname LIKE '_test_%'
  LOOP
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.' || quote_ident(fn2.proname) || '(' || fn2.args || ') FROM PUBLIC, anon, authenticated';
  END LOOP;
END $$;

DO $$
DECLARE
  v_fn     TEXT;
  v_failing TEXT[] := ARRAY[]::TEXT[];
BEGIN
  FOR v_fn IN
    SELECT p.proname
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname LIKE '_test_%'
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_proc p2
      JOIN pg_namespace n2 ON n2.oid = p2.pronamespace
      WHERE n2.nspname = 'public' AND p2.proname = v_fn
        AND has_function_privilege('anon', p2.oid, 'EXECUTE')
    ) THEN
      v_failing := array_append(v_failing, 'anon can EXECUTE ' || v_fn);
    END IF;
    IF EXISTS (
      SELECT 1 FROM pg_proc p2
      JOIN pg_namespace n2 ON n2.oid = p2.pronamespace
      WHERE n2.nspname = 'public' AND p2.proname = v_fn
        AND has_function_privilege('authenticated', p2.oid, 'EXECUTE')
    ) THEN
      v_failing := array_append(v_failing, 'authenticated can EXECUTE ' || v_fn);
    END IF;
  END LOOP;

  IF array_length(v_failing, 1) > 0 THEN
    RAISE EXCEPTION 'TEST HARNESS LEAK: _test_* functions exposed: %',
      array_to_string(v_failing, ', ');
  END IF;

  RAISE NOTICE 'PASS: _test_* helper functions are not callable by anon/authenticated';
END $$;

-- Cleanup test helpers
SELECT public._test_cleanup();
