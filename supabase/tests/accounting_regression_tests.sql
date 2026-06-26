-- =============================================================================
-- LEDJER — Accounting Regression Tests (STRICT)
-- =============================================================================
-- Validates invariants the golden scenario also covers, but in a way that
-- works on databases seeded by the golden scenario (or any seeded DB).
--
-- STRICT MODE: every assertion uses _test_assert (RAISE EXCEPTION on FAIL).
-- If no organization exists yet, run golden_scenario_tests.sql first.
-- ============================================================================

\i supabase/tests/_test_helpers.sql

-- ═══════════════════════════════════════════════════════════════════
-- TEST 1: post_transaction rejects opening_* types
-- (Requires at least one organization; uses request.jwt.claims spoofing.)
-- ═══════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_org_id   UUID;
  v_user_id  UUID;
  v_cash_id  UUID;
  v_error    TEXT;
BEGIN
  SELECT o.id, o.created_by INTO v_org_id, v_user_id
  FROM public.organizations o LIMIT 1;

  IF v_org_id IS NULL THEN
    PERFORM public._test_fail('T1 setup', 'no organization found; run golden_scenario_tests.sql first');
  END IF;

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_user_id, 'role', 'authenticated')::text, true);

  SELECT id INTO v_cash_id FROM public.accounts
  WHERE organization_id = v_org_id AND code = 1110 AND is_active = true LIMIT 1;

  IF v_cash_id IS NULL THEN
    PERFORM public._test_fail('T1 setup', 'cash account (1110) missing');
  END IF;

  BEGIN
    PERFORM public.post_transaction(
      v_org_id, CURRENT_DATE, 'opening_cash_balance', 1000000,
      NULL, NULL, v_cash_id, NULL, 'paid', NULL, NULL,
      'should fail', NULL, NULL, NULL, NULL
    );
    PERFORM public._test_fail('T1', 'post_transaction did not raise for opening_cash_balance');
  EXCEPTION WHEN OTHERS THEN
    v_error := SQLERRM;
    PERFORM public._test_assert(
      'T1: post_transaction rejects opening_cash_balance',
      v_error ILIKE '%saldo awal%' OR v_error ILIKE '%opening%',
      'Unexpected error: ' || v_error
    );
  END;
END $$;

-- ═══════════════════════════════════════════════════════════════════
-- TEST 2: All posted journal entries are balanced (D = C per entry)
-- ═══════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_org_id UUID;
  v_unbalanced_count INTEGER;
BEGIN
  SELECT id INTO v_org_id FROM public.organizations LIMIT 1;
  IF v_org_id IS NULL THEN
    PERFORM public._test_fail('T2 setup', 'no organization');
  END IF;

  SELECT COUNT(*) INTO v_unbalanced_count
  FROM (
    SELECT je.id
    FROM public.journal_entries je
    JOIN public.journal_lines jl ON jl.journal_entry_id = je.id
    WHERE je.organization_id = v_org_id AND je.status = 'posted'
    GROUP BY je.id
    HAVING ABS(COALESCE(SUM(jl.debit), 0) - COALESCE(SUM(jl.credit), 0)) > 0.01
  ) unbalanced;

  PERFORM public._test_assert(
    'T2: All posted journal entries are balanced',
    v_unbalanced_count = 0,
    'Unbalanced journals: ' || v_unbalanced_count
  );
END $$;

-- ═══════════════════════════════════════════════════════════════════
-- TEST 3: All reversal journals are balanced
-- ═══════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_org_id UUID;
  v_unbalanced_reversals INTEGER;
BEGIN
  SELECT id INTO v_org_id FROM public.organizations LIMIT 1;
  IF v_org_id IS NULL THEN PERFORM public._test_fail('T3 setup', 'no org'); END IF;

  SELECT COUNT(*) INTO v_unbalanced_reversals
  FROM (
    SELECT je.id
    FROM public.journal_entries je
    JOIN public.journal_lines jl ON jl.journal_entry_id = je.id
    WHERE je.organization_id = v_org_id
      AND je.entry_type = 'reversal'
      AND je.status = 'posted'
    GROUP BY je.id
    HAVING ABS(COALESCE(SUM(jl.debit), 0) - COALESCE(SUM(jl.credit), 0)) > 0.01
  ) u;

  PERFORM public._test_assert(
    'T3: All reversal journals are balanced',
    v_unbalanced_reversals = 0,
    'Unbalanced reversals: ' || v_unbalanced_reversals
  );
END $$;

-- ═══════════════════════════════════════════════════════════════════
-- TEST 4: Trial balance balances (Σdebits = Σcredits across the org)
-- ═══════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_org_id      UUID;
  v_total_debit NUMERIC;
  v_total_credit NUMERIC;
  v_diff        NUMERIC;
BEGIN
  SELECT id INTO v_org_id FROM public.organizations LIMIT 1;
  IF v_org_id IS NULL THEN PERFORM public._test_fail('T4 setup', 'no org'); END IF;

  SELECT COALESCE(SUM(jl.debit), 0), COALESCE(SUM(jl.credit), 0)
  INTO v_total_debit, v_total_credit
  FROM public.journal_lines jl
  JOIN public.journal_entries je ON je.id = jl.journal_entry_id
  WHERE jl.organization_id = v_org_id AND je.status = 'posted';

  v_diff := ABS(v_total_debit - v_total_credit);

  PERFORM public._test_assert(
    'T4: Trial balance balances',
    v_diff < 0.01,
    'Diff=' || v_diff || ' D=' || v_total_debit || ' C=' || v_total_credit
  );
END $$;

-- ═══════════════════════════════════════════════════════════════════
-- TEST 5: Balance sheet equation holds (A = L + E + R - X)
-- ═══════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_org_id UUID;
  v_assets NUMERIC := 0; v_liab NUMERIC := 0; v_equity NUMERIC := 0;
  v_revenue NUMERIC := 0; v_expense NUMERIC := 0; v_diff NUMERIC;
BEGIN
  SELECT id INTO v_org_id FROM public.organizations LIMIT 1;
  IF v_org_id IS NULL THEN PERFORM public._test_fail('T5 setup', 'no org'); END IF;

  SELECT COALESCE(SUM(jl.debit - jl.credit), 0) INTO v_assets
  FROM public.journal_lines jl JOIN public.accounts a ON a.id = jl.account_id
  JOIN public.journal_entries je ON je.id = jl.journal_entry_id
  WHERE jl.organization_id = v_org_id AND a.account_type = 'asset' AND je.status = 'posted';

  SELECT COALESCE(SUM(jl.credit - jl.debit), 0) INTO v_liab
  FROM public.journal_lines jl JOIN public.accounts a ON a.id = jl.account_id
  JOIN public.journal_entries je ON je.id = jl.journal_entry_id
  WHERE jl.organization_id = v_org_id AND a.account_type = 'liability' AND je.status = 'posted';

  SELECT COALESCE(SUM(jl.credit - jl.debit), 0) INTO v_equity
  FROM public.journal_lines jl JOIN public.accounts a ON a.id = jl.account_id
  JOIN public.journal_entries je ON je.id = jl.journal_entry_id
  WHERE jl.organization_id = v_org_id AND a.account_type = 'equity' AND je.status = 'posted';

  SELECT COALESCE(SUM(jl.credit - jl.debit), 0) INTO v_revenue
  FROM public.journal_lines jl JOIN public.accounts a ON a.id = jl.account_id
  JOIN public.journal_entries je ON je.id = jl.journal_entry_id
  WHERE jl.organization_id = v_org_id AND a.account_type = 'revenue' AND je.status = 'posted';

  SELECT COALESCE(SUM(jl.debit - jl.credit), 0) INTO v_expense
  FROM public.journal_lines jl JOIN public.accounts a ON a.id = jl.account_id
  JOIN public.journal_entries je ON je.id = jl.journal_entry_id
  WHERE jl.organization_id = v_org_id
    AND a.account_type IN ('expense', 'cogs', 'other_expense')
    AND je.status = 'posted';

  v_diff := ABS(v_assets - (v_liab + v_equity + v_revenue - v_expense));

  PERFORM public._test_assert(
    'T5: Balance sheet equation (A = L + E + R - X)',
    v_diff < 0.01,
    'Diff=' || v_diff || ' A=' || v_assets || ' L=' || v_liab || ' E=' || v_equity || ' R=' || v_revenue || ' X=' || v_expense
  );
END $$;

-- ═══════════════════════════════════════════════════════════════════
-- TEST 6: Transaction number uniqueness per organization
-- ═══════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_org_id UUID;
  v_dup_count INTEGER;
BEGIN
  SELECT id INTO v_org_id FROM public.organizations LIMIT 1;
  IF v_org_id IS NULL THEN PERFORM public._test_fail('T6 setup', 'no org'); END IF;

  SELECT COUNT(*) INTO v_dup_count
  FROM (
    SELECT transaction_number
    FROM public.transactions
    WHERE organization_id = v_org_id AND transaction_number IS NOT NULL
    GROUP BY transaction_number HAVING COUNT(*) > 1
  ) d;
  PERFORM public._test_assert('T6: No duplicate transaction numbers',
    v_dup_count = 0, 'duplicates: ' || v_dup_count);
END $$;

-- ═══════════════════════════════════════════════════════════════════
-- TEST 7: Journal entry number uniqueness per organization
-- ═══════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_org_id UUID;
  v_dup_count INTEGER;
BEGIN
  SELECT id INTO v_org_id FROM public.organizations LIMIT 1;
  IF v_org_id IS NULL THEN PERFORM public._test_fail('T7 setup', 'no org'); END IF;

  SELECT COUNT(*) INTO v_dup_count
  FROM (
    SELECT entry_number
    FROM public.journal_entries
    WHERE organization_id = v_org_id AND entry_number IS NOT NULL
    GROUP BY entry_number HAVING COUNT(*) > 1
  ) d;
  PERFORM public._test_assert('T7: No duplicate entry numbers',
    v_dup_count = 0, 'duplicates: ' || v_dup_count);
END $$;

-- ═══════════════════════════════════════════════════════════════════
-- TEST 8: Direct INSERT into financial tables is blocked by RLS
-- Uses a fully-valid row shape and verifies the failure reason is RLS,
-- not a NOT NULL / FK / check violation. This catches regressions where
-- someone accidentally re-adds a permissive INSERT policy.
--
-- Run as authenticated user with request.jwt.claims set to a real org member.
-- ═══════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_user_id   UUID;
  v_org_id    UUID;
  v_cash_id   UUID;

  v_inserted      BOOLEAN := false;
  v_sqlstate      TEXT;
  v_sqlerrm       TEXT;
  v_txn_no        TEXT;
BEGIN
  SELECT o.id, o.created_by INTO v_org_id, v_user_id
  FROM public.organizations o LIMIT 1;
  IF v_org_id IS NULL THEN PERFORM public._test_fail('T8 setup', 'no org'); END IF;

  SELECT id INTO v_cash_id FROM public.accounts
  WHERE organization_id = v_org_id AND code = 1110 AND is_active = true LIMIT 1;
  IF v_cash_id IS NULL THEN PERFORM public._test_fail('T8 setup', 'cash account missing'); END IF;

  v_txn_no := 'TX-DIRECT-' || substr(md5(random()::text), 1, 12);

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_user_id, 'role', 'authenticated')::text, true);

  -- ── T8.1: direct INSERT into transactions — fully-valid row shape
  BEGIN
    SET LOCAL ROLE authenticated;
    INSERT INTO public.transactions (
      organization_id, transaction_number, transaction_date,
      transaction_type, amount, description, status,
      posted_at, posted_by, created_by
    )
    VALUES (
      v_org_id, v_txn_no, CURRENT_DATE,
      'cash_sale', 100, 'T8 direct insert (should fail with RLS)', 'posted',
      now(), v_user_id, v_user_id
    );
    v_inserted := true;
    RESET ROLE;
  EXCEPTION WHEN OTHERS THEN
    v_sqlstate := SQLSTATE;
    v_sqlerrm  := SQLERRM;
    RESET ROLE;
    v_inserted := false;
  END;

  PERFORM public._test_assert(
    'T8.1: direct INSERT into transactions is blocked by RLS (not NOT NULL/FK)',
    NOT v_inserted,
    format('insert unexpectedly succeeded; SQLSTATE=%s, SQLERRM=%s',
           COALESCE(v_sqlstate, 'NULL'), COALESCE(v_sqlerrm, 'NULL'))
  );

  PERFORM public._test_assert(
    'T8.2: failure reason is RLS / permission, not NOT NULL or FK or check',
    v_sqlstate IN ('42501', 'P0001')
      OR v_sqlerrm ILIKE '%row-level security%'
      OR v_sqlerrm ILIKE '%policy%',
    format('unexpected SQLSTATE=%s SQLERRM=%s',
           COALESCE(v_sqlstate, 'NULL'), COALESCE(v_sqlerrm, 'NULL'))
  );

  PERFORM public._test_assert(
    'T8.3: no transaction row leaked from the failed direct insert',
    NOT EXISTS (SELECT 1 FROM public.transactions WHERE transaction_number = v_txn_no),
    'unexpected row with transaction_number=' || v_txn_no
  );

  -- ── T8.4: journal_entries direct insert — also blocked
  v_inserted := false;
  v_sqlstate := NULL;
  v_sqlerrm  := NULL;
  BEGIN
    SET LOCAL ROLE authenticated;
    INSERT INTO public.journal_entries (
      organization_id, entry_number, entry_date, entry_type,
      description, status, posted_at, posted_by
    )
    VALUES (
      v_org_id, 'JE-DIRECT-' || substr(md5(random()::text),1,8),
      CURRENT_DATE, 'normal', 'T8.4 direct', 'posted', now(), v_user_id
    );
    v_inserted := true;
    RESET ROLE;
  EXCEPTION WHEN OTHERS THEN
    v_sqlstate := SQLSTATE;
    v_sqlerrm  := SQLERRM;
    RESET ROLE;
  END;

  PERFORM public._test_assert(
    'T8.4: direct INSERT into journal_entries is blocked by RLS',
    NOT v_inserted,
    format('SQLSTATE=%s SQLERRM=%s', COALESCE(v_sqlstate,'NULL'), COALESCE(v_sqlerrm,'NULL'))
  );

  -- ── T8.5: audit_logs direct insert — also blocked
  v_inserted := false;
  BEGIN
    SET LOCAL ROLE authenticated;
    INSERT INTO public.audit_logs (
      organization_id, actor_user_id, entity_type, entity_id, action
    )
    VALUES (v_org_id, v_user_id, 'transaction', gen_random_uuid(), 'create');
    v_inserted := true;
    RESET ROLE;
  EXCEPTION WHEN OTHERS THEN
    v_sqlstate := SQLSTATE;
    v_sqlerrm  := SQLERRM;
    RESET ROLE;
  END;

  PERFORM public._test_assert(
    'T8.5: direct INSERT into audit_logs is blocked by RLS',
    NOT v_inserted,
    format('SQLSTATE=%s SQLERRM=%s', COALESCE(v_sqlstate,'NULL'), COALESCE(v_sqlerrm,'NULL'))
  );
END $$;

-- ═══════════════════════════════════════════════════════════════════
-- TEST 9: Weighted average cost — purchase 10@100 then 10@200 → 150
-- Runs the deterministic recalculation; expects exact value.
-- ═══════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_org_id    UUID;
  v_user_id   UUID;
  v_staff_id  UUID;
  v_cash_id   UUID;
  v_product_id UUID;
  v_txn1_id   UUID;
  v_txn2_id   UUID;
  v_avg       NUMERIC;
BEGIN
  SELECT t.out_owner_user_id, t.out_staff_user_id, t.out_organization_id,
         t.out_cash_account_id, t.out_payable_account_id, t.out_revenue_account_id
  INTO v_user_id, v_staff_id, v_org_id, v_cash_id
  FROM public._test_create_org_with_users('T9 WAC ORG', CURRENT_DATE) AS t;
  IF v_org_id IS NULL THEN PERFORM public._test_fail('T9 setup', 'no org'); END IF;

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_user_id, 'role', 'authenticated')::text, true);

  -- Create a fresh product so we control cost basis
  INSERT INTO public.products (organization_id, code, name, unit, purchase_price, selling_price, current_stock, min_stock, is_active, created_by)
  VALUES (v_org_id, 'T9-' || substr(md5(random()::text),1,8), 'T9 Product', 'pcs', 0, 0, 0, 0, true, v_user_id)
  RETURNING id INTO v_product_id;

  v_txn1_id := (public.post_transaction(
    v_org_id, CURRENT_DATE, 'cash_purchase', 1000,
    NULL, NULL,
    v_cash_id,
    NULL, 'paid', NULL, NULL, 'T9 buy 1', NULL, v_product_id, 10, 100, NULL
  ) ->> 'transaction_id')::UUID;

  v_txn2_id := (public.post_transaction(
    v_org_id, CURRENT_DATE, 'cash_purchase', 2000,
    NULL, NULL,
    v_cash_id,
    NULL, 'paid', NULL, NULL, 'T9 buy 2', NULL, v_product_id, 10, 200, NULL
  ) ->> 'transaction_id')::UUID;

  SELECT purchase_price INTO v_avg FROM public.products WHERE id = v_product_id;

  PERFORM public._test_assert_eq_numeric(
    'T9: Weighted average after two purchases (10@100 + 10@200 → 150)',
    v_avg, 150);
END $$;

-- ═══════════════════════════════════════════════════════════════════
-- TEST 10: Weighted average — void second purchase → 100
-- ═══════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_user_id   UUID;
  v_staff_id  UUID;
  v_avg       NUMERIC;
  v_product_id UUID;
  v_cash_id   UUID;
  v_txn2_id   UUID;
  v_org_id    UUID;
BEGIN
  SELECT t.out_owner_user_id, t.out_staff_user_id, t.out_organization_id,
         t.out_cash_account_id
  INTO v_user_id, v_staff_id, v_org_id, v_cash_id
  FROM public._test_create_org_with_users('T10 VOID ORG', CURRENT_DATE) AS t;
  IF v_org_id IS NULL THEN PERFORM public._test_fail('T10 setup', 'no org'); END IF;

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_user_id, 'role', 'authenticated')::text, true);

  -- Fresh product
  INSERT INTO public.products (organization_id, code, name, unit, purchase_price, selling_price, current_stock, min_stock, is_active, created_by)
  VALUES (v_org_id, 'T10-' || substr(md5(random()::text),1,8), 'T10 Product', 'pcs', 0, 0, 0, 0, true, v_user_id)
  RETURNING id INTO v_product_id;

  PERFORM public.post_transaction(v_org_id, CURRENT_DATE, 'cash_purchase', 1000, NULL, NULL, v_cash_id, NULL, 'paid', NULL, NULL, 'T10 buy 1', NULL, v_product_id, 10, 100, NULL);
  v_txn2_id := (public.post_transaction(v_org_id, CURRENT_DATE, 'cash_purchase', 2000, NULL, NULL, v_cash_id, NULL, 'paid', NULL, NULL, 'T10 buy 2', NULL, v_product_id, 10, 200, NULL) ->> 'transaction_id')::UUID;

  PERFORM public.void_transaction(v_org_id, v_txn2_id, 'T10 void second', CURRENT_DATE);

  SELECT purchase_price INTO v_avg FROM public.products WHERE id = v_product_id;

  PERFORM public._test_assert_eq_numeric(
    'T10: Weighted average after voiding second purchase (10@100 only → 100)',
    v_avg, 100);
END $$;

-- ═══════════════════════════════════════════════════════════════════
-- TEST 11: Weighted average — sale then sale void → unchanged
-- (Cost-basis from purchases must remain stable when only sales/voids move.)
-- ═══════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_user_id    UUID;
  v_staff_id   UUID;
  v_org_id     UUID;
  v_product_id UUID;
  v_cash_id    UUID;
  v_avg_before NUMERIC;
  v_avg_after  NUMERIC;
  v_sale_id    UUID;
BEGIN
  SELECT t.out_owner_user_id, t.out_staff_user_id, t.out_organization_id,
         t.out_cash_account_id
  INTO v_user_id, v_staff_id, v_org_id, v_cash_id
  FROM public._test_create_org_with_users('T11 SALE VOID ORG', CURRENT_DATE) AS t;
  IF v_org_id IS NULL THEN PERFORM public._test_fail('T11 setup', 'no org'); END IF;

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_user_id, 'role', 'authenticated')::text, true);

  INSERT INTO public.products (organization_id, code, name, unit, purchase_price, selling_price, current_stock, min_stock, is_active, created_by)
  VALUES (v_org_id, 'T11-' || substr(md5(random()::text),1,8), 'T11 Product', 'pcs', 0, 0, 0, 0, true, v_user_id)
  RETURNING id INTO v_product_id;

  PERFORM public.post_transaction(v_org_id, CURRENT_DATE, 'cash_purchase', 1000, NULL, NULL, v_cash_id, NULL, 'paid', NULL, NULL, 'T11 buy', NULL, v_product_id, 10, 100, NULL);

  SELECT purchase_price INTO v_avg_before FROM public.products WHERE id = v_product_id;

  v_sale_id := (public.post_transaction(v_org_id, CURRENT_DATE, 'cash_sale', 750, NULL, NULL, v_cash_id, NULL, 'paid', NULL, NULL, 'T11 sale', NULL, v_product_id, 5, 150, NULL) ->> 'transaction_id')::UUID;

  PERFORM public.void_transaction(v_org_id, v_sale_id, 'T11 void sale', CURRENT_DATE);

  SELECT purchase_price INTO v_avg_after FROM public.products WHERE id = v_product_id;

  PERFORM public._test_assert_eq_numeric(
    'T11: Sale + sale void must not change weighted average',
    v_avg_after, v_avg_before);
END $$;

-- ═══════════════════════════════════════════════════════════════════
-- TEST 12: Category LIKE metacharacters are escaped before account matching
-- p_category_name='%' must not wildcard-match every revenue account.
-- ═══════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_owner_user_id UUID;
  v_staff_user_id UUID;
  v_org_id        UUID;
  v_cash_id       UUID;
  v_payable_id    UUID;
  v_default_rev_id UUID;
  v_decoy_rev_id  UUID;
  v_txn_id        UUID;
  v_posted_rev_id UUID;
BEGIN
  SELECT out_owner_user_id, out_staff_user_id, out_organization_id,
         out_cash_account_id, out_payable_account_id, out_revenue_account_id
  INTO v_owner_user_id, v_staff_user_id, v_org_id,
       v_cash_id, v_payable_id, v_default_rev_id
  FROM public._test_create_org_with_users(
    'P1 LIKE Escape Test ' || substr(md5(random()::text), 1, 8),
    CURRENT_DATE
  );

  INSERT INTO public.accounts (
    organization_id, code, name, account_type, normal_balance,
    is_system, is_locked, report_group, is_cash_account
  )
  VALUES (
    v_org_id, 4000, 'Arbitrary Revenue Decoy', 'revenue', 'credit',
    false, false, 'Pendapatan', false
  )
  RETURNING id INTO v_decoy_rev_id;

  PERFORM public._test_impersonate(v_owner_user_id);

  v_txn_id := (
    public.post_transaction(
      v_org_id, CURRENT_DATE, 'cash_sale', 12345,
      NULL, '%', v_cash_id, NULL, 'paid', NULL, NULL,
      'T12 wildcard category sale', NULL, NULL, NULL, NULL, NULL
    ) ->> 'transaction_id'
  )::UUID;

  SELECT jl.account_id INTO v_posted_rev_id
  FROM public.journal_lines jl
  JOIN public.journal_entries je ON je.id = jl.journal_entry_id
  JOIN public.accounts a ON a.id = jl.account_id
  WHERE je.transaction_id = v_txn_id
    AND jl.organization_id = v_org_id
    AND a.account_type = 'revenue'
    AND jl.credit = 12345
  LIMIT 1;

  PERFORM public._test_assert(
    'T12: p_category_name=% resolves to default revenue account 4100',
    v_posted_rev_id = v_default_rev_id AND v_posted_rev_id != v_decoy_rev_id,
    format('posted_rev=%s default_rev=%s decoy_rev=%s',
      COALESCE(v_posted_rev_id::TEXT, 'NULL'),
      COALESCE(v_default_rev_id::TEXT, 'NULL'),
      COALESCE(v_decoy_rev_id::TEXT, 'NULL'))
  );
END $$;

-- Cleanup

DO $$ BEGIN RAISE NOTICE '=== Accounting Regression Tests Complete ==='; END $$;
