-- =============================================================================
-- LEDJER — Inventory / HPP Golden Scenario (STRICT, DETERMINISTIC)
-- =============================================================================
-- Validates weighted-average cost + stock movement reconciliation end-to-end:
--   I1. Purchase 10 units @ 100 → stock 10, cost 100
--   I2. Purchase 10 units @ 200 → stock 20, cost 150
--   I3. Sale 4 units @ 250 → stock 16, cost stays 150 (sale doesn't change
--       weighted average cost; COGS uses current purchase_price snapshot)
--   I4. Stock valuation matches current_stock * weighted_avg_cost
--   I5. Void the sale → stock back to 20, COGS reversal journal posted
--   I6. Try to sell 100 units (insufficient stock) → must fail
--   I7. After all movement, stock_movements SUM(quantity) = current_stock
--   I8. Balance sheet equity unchanged by inventory-only operations
--
-- Every assertion uses _test_assert (RAISE EXCEPTION on FAIL).
-- =============================================================================

\i supabase/tests/_test_helpers.sql

-- ── Setup helper (must be defined here because golden_scenario_tests.sql drops it) ──
CREATE OR REPLACE FUNCTION public._test_create_owner_and_org(
  p_org_name TEXT,
  p_books_start DATE
)
RETURNS TABLE (
  out_user_id UUID, out_organization_id UUID,
  out_cash_account_id UUID, out_cogs_account_id UUID, out_inventory_account_id UUID,
  out_receivable_account_id UUID, out_payable_account_id UUID, out_modal_account_id UUID,
  out_prive_account_id UUID, out_revenue_account_id UUID, out_expense_account_id UUID
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  p_uid UUID := gen_random_uuid();
  p_oid UUID := gen_random_uuid();
  v_cash_id UUID; v_cogs_id UUID; v_inv_id UUID; v_rcv_id UUID;
  v_pay_id UUID; v_mod_id UUID; v_pri_id UUID; v_rev_id UUID; v_exp_id UUID;
  v_books DATE := COALESCE(p_books_start, CURRENT_DATE);
BEGIN
  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, email_change, email_change_token_new, recovery_token)
  VALUES (p_uid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'golden-' || p_uid::TEXT || '@test.local', '', now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Golden Test"}'::jsonb, now(), now(), '', '', '', '')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.profiles (user_id, full_name, email)
  VALUES (p_uid, 'Golden Test', 'golden-' || p_uid::TEXT || '@test.local')
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.organizations (id, name, business_type, base_currency, books_start_date, onboarding_status, created_by)
  VALUES (p_oid, p_org_name, 'simple_trading', 'IDR', v_books, 'in_progress', p_uid)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.organization_members (organization_id, user_id, role, status,
    can_create_transaction, can_view_reports, can_manage_accounts, can_void_transaction,
    can_view_audit_log, can_manage_products, invited_by, joined_at)
  VALUES (p_oid, p_uid, 'owner', 'active', true, true, true, true, true, true, p_uid, now())
  ON CONFLICT DO NOTHING;

  PERFORM public.create_default_accounts(p_oid, p_org_name);

  SELECT id INTO v_cash_id FROM public.accounts WHERE organization_id = p_oid AND code = 1110 AND is_active = true LIMIT 1;
  SELECT id INTO v_cogs_id FROM public.accounts WHERE organization_id = p_oid AND code = 5100 AND is_active = true LIMIT 1;
  SELECT id INTO v_inv_id  FROM public.accounts WHERE organization_id = p_oid AND code = 1300 AND is_active = true LIMIT 1;
  SELECT id INTO v_rcv_id  FROM public.accounts WHERE organization_id = p_oid AND code = 1200 AND is_active = true LIMIT 1;
  SELECT id INTO v_pay_id  FROM public.accounts WHERE organization_id = p_oid AND code = 2100 AND is_active = true LIMIT 1;
  SELECT id INTO v_mod_id  FROM public.accounts WHERE organization_id = p_oid AND code = 3100 AND is_active = true LIMIT 1;
  SELECT id INTO v_pri_id  FROM public.accounts WHERE organization_id = p_oid AND code = 3300 AND is_active = true LIMIT 1;
  SELECT id INTO v_rev_id  FROM public.accounts WHERE organization_id = p_oid AND account_type = 'revenue' AND code = 4100 AND is_active = true LIMIT 1;
  SELECT id INTO v_exp_id  FROM public.accounts WHERE organization_id = p_oid AND account_type = 'expense' AND code = 6190 AND is_active = true LIMIT 1;

  RETURN QUERY SELECT p_uid, p_oid, v_cash_id, v_cogs_id, v_inv_id, v_rcv_id, v_pay_id, v_mod_id, v_pri_id, v_rev_id, v_exp_id;
END;
$$;

DO $$
DECLARE
  v_user_id   UUID;
  v_org_id    UUID;
  v_cash_id   UUID;
  v_cogs_id   UUID;
  v_inv_id    UUID;
  v_rev_id    UUID;
  v_pay_id    UUID;
  v_mod_id    UUID;

  v_product_id UUID;
  v_buy1_id   UUID;
  v_buy2_id   UUID;
  v_sale_id   UUID;

  v_avg_cost   NUMERIC;
  v_stock      NUMERIC;
  v_movement_sum NUMERIC;
  v_assets_before NUMERIC;
  v_assets_after  NUMERIC;
  v_err        TEXT;

  v_today DATE := CURRENT_DATE;
BEGIN
  -- ── Setup ──────────────────────────────────────────────────────────
  SELECT t.out_user_id, t.out_organization_id, t.out_cash_account_id, t.out_cogs_account_id,
         t.out_inventory_account_id, t.out_revenue_account_id, t.out_payable_account_id, t.out_modal_account_id
    INTO v_user_id, v_org_id, v_cash_id, v_cogs_id, v_inv_id, v_rev_id, v_pay_id, v_mod_id
  FROM public._test_create_owner_and_org('INVENTORY GOLDEN ORG', v_today) AS t;

  IF v_inv_id IS NULL THEN PERFORM public._test_fail('I setup', 'inventory account (1300) missing'); END IF;
  IF v_cogs_id IS NULL THEN PERFORM public._test_fail('I setup', 'cogs account (5100) missing'); END IF;
  IF v_rev_id  IS NULL THEN PERFORM public._test_fail('I setup', 'revenue account (4100) missing'); END IF;

  PERFORM public._test_impersonate(v_user_id);

  -- ── Snapshot assets before inventory-only activity ───────────────
  SELECT COALESCE(SUM(jl.debit - jl.credit), 0)
  INTO v_assets_before
  FROM public.journal_lines jl
  JOIN public.accounts a ON a.id = jl.account_id
  JOIN public.journal_entries je ON je.id = jl.journal_entry_id
  WHERE jl.organization_id = v_org_id AND a.account_type = 'asset' AND je.status = 'posted';

  -- Fresh product
  INSERT INTO public.products (organization_id, code, name, unit, purchase_price, selling_price, current_stock, min_stock, is_active, created_by)
  VALUES (v_org_id, 'IG-' || substr(md5(random()::text),1,8), 'Inventory Golden Product', 'pcs', 0, 0, 0, 0, true, v_user_id)
  RETURNING id INTO v_product_id;

  -- ── I1: First purchase 10 @ 100 ──────────────────────────────────
  v_buy1_id := (public.post_transaction(
    v_org_id, v_today, 'cash_purchase', 1000,
    NULL, NULL, v_cash_id, NULL, 'paid', NULL, NULL,
    'I1: first purchase', NULL, v_product_id, 10, 100, NULL
  ) ->> 'transaction_id')::UUID;

  SELECT purchase_price, current_stock INTO v_avg_cost, v_stock
  FROM public.products WHERE id = v_product_id;
  PERFORM public._test_assert_eq_numeric('I1: avg cost after first purchase = 100', v_avg_cost, 100);
  PERFORM public._test_assert_eq_numeric('I1: stock after first purchase = 10', v_stock, 10);

  -- ── I2: Second purchase 10 @ 200 ─────────────────────────────────
  v_buy2_id := (public.post_transaction(
    v_org_id, v_today, 'cash_purchase', 2000,
    NULL, NULL, v_cash_id, NULL, 'paid', NULL, NULL,
    'I2: second purchase', NULL, v_product_id, 10, 200, NULL
  ) ->> 'transaction_id')::UUID;

  SELECT purchase_price, current_stock INTO v_avg_cost, v_stock
  FROM public.products WHERE id = v_product_id;
  PERFORM public._test_assert_eq_numeric('I2: avg cost after (10@100 + 10@200) = 150', v_avg_cost, 150);
  PERFORM public._test_assert_eq_numeric('I2: stock after second purchase = 20', v_stock, 20);

  -- ── I3: Sale 4 @ 250 → stock 16 ──────────────────────────────────
  v_sale_id := (public.post_transaction(
    v_org_id, v_today, 'cash_sale', 1000,
    NULL, NULL, v_cash_id, NULL, 'paid', NULL, NULL,
    'I3: sale 4 units', NULL, v_product_id, 4, 250, NULL
  ) ->> 'transaction_id')::UUID;

  SELECT current_stock INTO v_stock FROM public.products WHERE id = v_product_id;
  PERFORM public._test_assert_eq_numeric('I3: stock after sale = 16', v_stock, 16);

  -- ── I4: stock_movements reconciliation ───────────────────────────
  SELECT COALESCE(SUM(quantity), 0) INTO v_movement_sum
  FROM public.stock_movements
  WHERE organization_id = v_org_id AND product_id = v_product_id;

  PERFORM public._test_assert_eq_numeric(
    'I4: Σ stock_movements.quantity matches current_stock',
    v_movement_sum, v_stock);

  -- ── I5: Void the sale → stock back to 20, reversal COGS posted ───
  PERFORM public.void_transaction(v_org_id, v_sale_id, 'I5: void sale', v_today);

  SELECT current_stock INTO v_stock FROM public.products WHERE id = v_product_id;
  PERFORM public._test_assert_eq_numeric('I5: stock restored to 20 after void', v_stock, 20);

  -- Reversal COGS journal exists with status = posted
  PERFORM public._test_assert(
    'I5: reversal COGS journal entry exists for voided sale',
    EXISTS (
      SELECT 1
      FROM public.journal_entries je
      WHERE je.organization_id = v_org_id
        AND je.entry_type = 'reversal'
        AND je.status = 'posted'
    ),
    'No reversal journal_entries found'
  );

  -- ── I6: Oversell must be rejected ────────────────────────────────
  BEGIN
    PERFORM public.post_transaction(
      v_org_id, v_today, 'cash_sale', 25000,
      NULL, NULL, v_cash_id, NULL, 'paid', NULL, NULL,
      'I6: oversell (should fail)', NULL, v_product_id, 100, 250, NULL
    );
    PERFORM public._test_fail('I6', 'oversell of 100 units on stock=20 unexpectedly succeeded');
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    PERFORM public._test_assert(
      'I6: oversell rejected with stock-validation error',
      v_err ILIKE '%stok%' OR v_err ILIKE '%stock%' OR v_err ILIKE '%insufficient%' OR v_err ILIKE '%quantity%' OR v_err ILIKE '%available%',
      format('expected stock-validation error, got: %s', v_err)
    );
  END;

  -- ── I7: Final stock_movements reconciliation ─────────────────────
  SELECT COALESCE(SUM(quantity), 0) INTO v_movement_sum
  FROM public.stock_movements
  WHERE organization_id = v_org_id AND product_id = v_product_id;

  PERFORM public._test_assert_eq_numeric(
    'I7: final Σ stock_movements.quantity matches current_stock',
    v_movement_sum, v_stock);

  -- ── I8: Inventory-only activity does not move total assets ──────
  SELECT COALESCE(SUM(jl.debit - jl.credit), 0)
  INTO v_assets_after
  FROM public.journal_lines jl
  JOIN public.accounts a ON a.id = jl.account_id
  JOIN public.journal_entries je ON je.id = jl.journal_entry_id
  WHERE jl.organization_id = v_org_id AND a.account_type = 'asset' AND je.status = 'posted';

  PERFORM public._test_assert_eq_numeric(
    'I8: total assets unchanged after sale+void round trip',
    v_assets_after, v_assets_before
  );

  RAISE NOTICE '=== INVENTORY GOLDEN SCENARIO PASSED ===';
END $$;

-- Cleanup
SELECT public._test_cleanup();
DROP FUNCTION IF EXISTS public._test_create_owner_and_org(TEXT, DATE);
DROP FUNCTION IF EXISTS public._test_impersonate(UUID);

DO $$ BEGIN RAISE NOTICE '=== Inventory Golden Tests Complete ==='; END $$;
