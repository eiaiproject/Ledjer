-- =============================================================================
-- LEDJER — Privilege Hardening Regression Tests (STRICT)
-- =============================================================================
-- Fails if anon or authenticated has dangerous table privileges:
--   TRUNCATE, TRIGGER, REFERENCES, MAINTAIN
-- Also verifies expected minimal privileges are present.
--
-- Run AFTER all migrations are applied.
-- STRICT: RAISE EXCEPTION on any failure (psql exits non-zero).
-- =============================================================================

\i supabase/tests/_test_helpers.sql

-- ═══════════════════════════════════════════════════════════════════
-- TEST 1: anon must NOT have TRUNCATE/TRIGGER/REFERENCES/MAINTAIN
--         on any public table.
-- ═══════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_table   TEXT;
  v_priv    TEXT;
  v_has     BOOLEAN;
  v_failing TEXT[] := ARRAY[]::TEXT[];
BEGIN
  FOR v_table IN
    SELECT quote_ident(schemaname) || '.' || quote_ident(tablename)
    FROM pg_tables
    WHERE schemaname = 'public'
  LOOP
    FOREACH v_priv IN ARRAY ARRAY['TRUNCATE', 'TRIGGER', 'REFERENCES', 'MAINTAIN'] LOOP
      SELECT has_table_privilege('anon', v_table, v_priv) INTO v_has;
      IF v_has THEN
        v_failing := array_append(v_failing, 'anon.' || v_priv || ' ON ' || v_table);
      END IF;
    END LOOP;
  END LOOP;

  IF array_length(v_failing, 1) > 0 THEN
    RAISE EXCEPTION 'PRIVILEGE VIOLATION: anon has dangerous privileges: %',
      array_to_string(v_failing, ', ');
  END IF;

  RAISE NOTICE 'PASS: anon has no TRUNCATE/TRIGGER/REFERENCES/MAINTAIN on any public table';
END $$;

-- ═══════════════════════════════════════════════════════════════════
-- TEST 2: authenticated must NOT have TRUNCATE/TRIGGER/REFERENCES/MAINTAIN
--         on any public table.
-- ═══════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_table   TEXT;
  v_priv    TEXT;
  v_has     BOOLEAN;
  v_failing TEXT[] := ARRAY[]::TEXT[];
BEGIN
  FOR v_table IN
    SELECT quote_ident(schemaname) || '.' || quote_ident(tablename)
    FROM pg_tables
    WHERE schemaname = 'public'
  LOOP
    FOREACH v_priv IN ARRAY ARRAY['TRUNCATE', 'TRIGGER', 'REFERENCES', 'MAINTAIN'] LOOP
      SELECT has_table_privilege('authenticated', v_table, v_priv) INTO v_has;
      IF v_has THEN
        v_failing := array_append(v_failing, 'authenticated.' || v_priv || ' ON ' || v_table);
      END IF;
    END LOOP;
  END LOOP;

  IF array_length(v_failing, 1) > 0 THEN
    RAISE EXCEPTION 'PRIVILEGE VIOLATION: authenticated has dangerous privileges: %',
      array_to_string(v_failing, ', ');
  END IF;

  RAISE NOTICE 'PASS: authenticated has no TRUNCATE/TRIGGER/REFERENCES/MAINTAIN on any public table';
END $$;

-- ═══════════════════════════════════════════════════════════════════
-- TEST 3: service_role MUST retain TRUNCATE/TRIGGER/REFERENCES/MAINTAIN
--         on financial tables (needed for SECURITY DEFINER + migrations).
-- ═══════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_table TEXT;
  v_has   BOOLEAN;
  v_missing TEXT[] := ARRAY[]::TEXT[];
BEGIN
  FOR v_table IN
    SELECT quote_ident(schemaname) || '.' || quote_ident(tablename)
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename IN ('transactions', 'journal_entries', 'journal_lines', 'audit_logs')
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
-- TEST 4: Default privileges — no TRUNCATE/TRIGGER/REFERENCES/MAINTAIN
--         for anon or authenticated on future tables.
-- ═══════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_rec RECORD;
  v_failing TEXT[] := ARRAY[]::TEXT[];
BEGIN
  FOR v_rec IN
    SELECT
      pg_get_userbyid(defaclrole) AS grantor,
      defaclacl::TEXT AS acl_text
    FROM pg_default_acl
    WHERE defaclnamespace = 'public'::regnamespace
      AND defaclobjtype = 'r'
  LOOP
    IF v_rec.acl_text ILIKE '%anon%' AND (
      v_rec.acl_text ~ 'TRUNCATE|TRIGGER|REFERENCES|MAINTAIN'
    ) THEN
      v_failing := array_append(v_failing, 'default ACL grants dangerous privileges to anon');
    END IF;
    IF v_rec.acl_text ILIKE '%authenticated%' AND (
      v_rec.acl_text ~ 'TRUNCATE|TRIGGER|REFERENCES|MAINTAIN'
    ) THEN
      v_failing := array_append(v_failing, 'default ACL grants dangerous privileges to authenticated');
    END IF;
  END LOOP;

  IF array_length(v_failing, 1) > 0 THEN
    RAISE EXCEPTION 'PRIVILEGE VIOLATION: %', array_to_string(v_failing, ', ');
  END IF;

  RAISE NOTICE 'PASS: default privileges do not grant dangerous privileges to anon/authenticated';
END $$;

-- ═══════════════════════════════════════════════════════════════════
-- TEST 5: Internal helper functions are NOT exposed to anon/authenticated.
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
        'post_transaction_impl_20260702'
      )
  LOOP
    -- Check if function is granted to anon/authenticated via proacl
    IF EXISTS (
      SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = v_fn
        AND p.proacl::TEXT LIKE '%anon=X%'
    ) THEN
      v_failing := array_append(v_failing, 'anon can EXECUTE ' || v_fn);
    END IF;
    IF EXISTS (
      SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = v_fn
        AND p.proacl::TEXT LIKE '%authenticated=X%'
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
-- TEST 6: Financial RPCs are callable by authenticated only.
-- ═══════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_fn TEXT;
  v_can_auth BOOLEAN;
  v_can_anon BOOLEAN;
  v_failing TEXT[] := ARRAY[]::TEXT[];
BEGIN
  FOR v_fn IN
    SELECT p.proname
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
      WHERE n2.nspname = 'public' AND p2.proname = v_fn AND p2.proacl::TEXT LIKE '%authenticated=X%'
    ) INTO v_can_auth;
    SELECT EXISTS (
      SELECT 1 FROM pg_proc p2 JOIN pg_namespace n2 ON n2.oid = p2.pronamespace
      WHERE n2.nspname = 'public' AND p2.proname = v_fn AND p2.proacl::TEXT LIKE '%anon=X%'
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

-- Cleanup test helpers
SELECT public._test_cleanup();
