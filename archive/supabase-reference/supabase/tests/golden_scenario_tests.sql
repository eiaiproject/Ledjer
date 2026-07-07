-- =============================================================================
-- LEDJER — Golden Accounting Scenario (STRICT, DETERMINISTIC)
-- =============================================================================
-- Runs a full accounting cycle with EXPLICIT expected balances, simulating
-- an authenticated session via request.jwt.claims (Supabase-compatible).
--
-- Steps:
--   0.  Create auth.users row + profile
--   1.  Create organization (idempotent helper in this file)
--   2.  Owner capital injection → cash 10,000,000 / modal 10,000,000
--   3.  Cash purchase 10 units @ 100,000 → inventory 1,000,000 / cash 1,000,000
--   4.  Cash sale  4 units @ 150,000 → cash 600,000 / revenue 600,000
--                                + COGS Dr 400,000 / Cr Persediaan 400,000
--   5.  Credit sale 3 units @ 150,000 → piutang 450,000 / revenue 450,000
--                                       + COGS Dr 300,000 / Cr Persediaan 300,000
--   6.  Receive receivable 450,000 → cash 450,000 / piutang 450,000
--   7.  Expense payment 200,000 → beban 200,000 / cash 200,000
--   8.  Owner draw 100,000 → prive 100,000 / cash 100,000
--   9.  Void expense payment
--   10. Verify journal balances, trial balance, balance sheet, P&L
--
-- Every assertion uses _test_assert (RAISE EXCEPTION on FAIL).
-- ============================================================================

\i supabase/tests/_test_helpers.sql

-- ---------------------------------------------------------------------------
-- Authenticated user / organization factory used only by this test file.
-- Each call returns a fresh UUID and writes:
--   - auth.users row
--   - profiles row
--   - organizations row (status=in_progress, books_start_date=v_books)
--   - default chart of accounts
--   - owner membership
-- All wrapped in SECURITY DEFINER so the test does not need to set JWTs
-- for the helper itself; the tests then impersonate the owner via
-- set_config('request.jwt.claims', ...) before calling RPCs.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._test_create_owner_and_org(
  p_org_name TEXT,
  p_books_start DATE
)
RETURNS TABLE (out_user_id UUID, out_organization_id UUID, out_cash_account_id UUID, out_cogs_account_id UUID, out_inventory_account_id UUID, out_receivable_account_id UUID, out_payable_account_id UUID, out_modal_account_id UUID, out_prive_account_id UUID, out_revenue_account_id UUID, out_expense_account_id UUID)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  p_uid UUID := gen_random_uuid();
  p_oid  UUID := gen_random_uuid();
  v_cash_id UUID;
  v_cogs_id UUID;
  v_inv_id  UUID;
  v_rcv_id  UUID;
  v_pay_id  UUID;
  v_mod_id  UUID;
  v_pri_id  UUID;
  v_rev_id  UUID;
  v_exp_id  UUID;
  v_books   DATE := COALESCE(p_books_start, CURRENT_DATE);
BEGIN
  -- Insert into auth.users (required for FK from public.profiles.user_id)
  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password,
                          email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                          created_at, updated_at, confirmation_token,
                          email_change, email_change_token_new, recovery_token)
  VALUES (p_uid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          'golden-' || p_uid::TEXT || '@test.local', '', now(),
          '{"provider":"email","providers":["email"]}'::jsonb,
          '{"full_name":"Golden Test"}'::jsonb,
          now(), now(), '', '', '', '')
  ON CONFLICT (id) DO NOTHING;

  -- Profile
  INSERT INTO public.profiles (user_id, full_name, email)
  VALUES (p_uid, 'Golden Test', 'golden-' || p_uid::TEXT || '@test.local')
  ON CONFLICT (user_id) DO NOTHING;

  -- Organization
  INSERT INTO public.organizations (id, name, business_type, base_currency, books_start_date, onboarding_status, created_by)
  VALUES (p_oid, p_org_name, 'simple_trading', 'IDR', v_books, 'in_progress', p_uid)
  ON CONFLICT (id) DO NOTHING;

  -- Owner membership
  INSERT INTO public.organization_members (organization_id, user_id, role, status, can_create_transaction, can_view_reports, can_manage_accounts, can_void_transaction, can_view_audit_log, can_manage_products, invited_by, joined_at)
  VALUES (p_oid, p_uid, 'owner', 'active', true, true, true, true, true, true, p_uid, now())
  ON CONFLICT DO NOTHING;

  -- Default accounts (return value not needed; we look up by code below)
  PERFORM public.create_default_accounts(p_oid, p_org_name);

  -- Pick accounts by code (deterministic)
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

-- Impersonate helper: sets request.jwt.claims so SECURITY DEFINER RPCs
-- see auth.uid() as the supplied user within the current transaction.
CREATE OR REPLACE FUNCTION public._test_impersonate(p_user_id UUID)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', p_user_id, 'role', 'authenticated')::text,
    true);
END;
$$;

-- =========================================================================
-- GOLDEN SCENARIO
-- =========================================================================
DO $$
DECLARE
  v_user_id  UUID;
  v_org_id   UUID;
  v_cash_id  UUID;
  v_cogs_id  UUID;
  v_inv_id   UUID;
  v_rcv_id   UUID;
  v_pay_id   UUID;
  v_mod_id   UUID;
  v_pri_id   UUID;
  v_rev_id   UUID;
  v_exp_id   UUID;

  v_owner_capital_id   UUID;
  v_cash_purchase_id   UUID;
  v_cash_sale_id       UUID;
  v_credit_sale_id     UUID;
  v_receive_id         UUID;
  v_expense_id         UUID;
  v_draw_id            UUID;

  v_product_id UUID;
  v_party_id   UUID;

  v_today DATE := CURRENT_DATE;
BEGIN
  -- Setup: owner + org + accounts
  -- Use aliases on the function output columns.
  SELECT t.out_user_id, t.out_organization_id, t.out_cash_account_id, t.out_cogs_account_id, t.out_inventory_account_id,
         t.out_receivable_account_id, t.out_payable_account_id, t.out_modal_account_id, t.out_prive_account_id,
         t.out_revenue_account_id, t.out_expense_account_id
    INTO v_user_id, v_org_id, v_cash_id, v_cogs_id, v_inv_id, v_rcv_id, v_pay_id, v_mod_id, v_pri_id, v_rev_id, v_exp_id
  FROM public._test_create_owner_and_org('GOLDEN ORG', v_today) AS t;

  -- Impersonate the owner so SECURITY DEFINER RPCs accept the membership check.
  PERFORM public._test_impersonate(v_user_id);

  IF v_cash_id IS NULL THEN PERFORM public._test_fail('SETUP', 'cash account (1110) not created'); END IF;
  IF v_mod_id  IS NULL THEN PERFORM public._test_fail('SETUP', 'modal account (3100) not created'); END IF;
  IF v_rev_id  IS NULL THEN PERFORM public._test_fail('SETUP', 'revenue account (4100) not created'); END IF;
  IF v_inv_id  IS NULL THEN PERFORM public._test_fail('SETUP', 'inventory account (1300) not created'); END IF;
  IF v_cogs_id IS NULL THEN PERFORM public._test_fail('SETUP', 'COGS account (5100) not created'); END IF;
  IF v_rcv_id  IS NULL THEN PERFORM public._test_fail('SETUP', 'receivable account (1200) not created'); END IF;
  IF v_pri_id  IS NULL THEN PERFORM public._test_fail('SETUP', 'prive account (3300) not created'); END IF;
  IF v_exp_id  IS NULL THEN PERFORM public._test_fail('SETUP', 'expense account (6190) not created'); END IF;

  -- Step 1: Owner capital injection 10,000,000
  v_owner_capital_id := (public.post_transaction(
    v_org_id, v_today, 'owner_capital', 10000000,
    NULL, NULL, v_cash_id, NULL, 'paid', NULL, NULL,
    'Modal awal pemilik', NULL, NULL, NULL, NULL
  ) ->> 'transaction_id')::UUID;

  -- Step 2: Cash purchase of 10 units @ 100,000 (product setup done by helper)
  INSERT INTO public.products (organization_id, code, name, unit, purchase_price, selling_price, current_stock, min_stock, is_active, created_by)
  VALUES (v_org_id, 'P001', 'Produk Test', 'pcs', 100000, 150000, 0, 0, true, v_user_id)
  RETURNING id INTO v_product_id;

  v_cash_purchase_id := (public.post_transaction(
    v_org_id, v_today, 'cash_purchase', 1000000,
    NULL, NULL, v_cash_id, NULL, 'paid', NULL, NULL,
    'Pembelian 10 unit Produk Test', NULL,
    v_product_id, 10, 100000, NULL
  ) ->> 'transaction_id')::UUID;

  -- Step 3: Cash sale of 4 units @ 150,000
  v_cash_sale_id := (public.post_transaction(
    v_org_id, v_today, 'cash_sale', 600000,
    NULL, NULL, v_cash_id, NULL, 'paid', NULL, NULL,
    'Penjualan tunai 4 unit', NULL,
    v_product_id, 4, 150000, NULL
  ) ->> 'transaction_id')::UUID;

  -- Step 4: Credit sale of 3 units @ 150,000 (unpaid)
  INSERT INTO public.parties (organization_id, name, party_type, is_active)
  VALUES (v_org_id, 'Pelanggan Test', 'customer', true)
  RETURNING id INTO v_party_id;

  v_credit_sale_id := (public.post_transaction(
    v_org_id, v_today, 'credit_sale', 450000,
    v_party_id, NULL, NULL, NULL, 'unpaid', NULL, NULL,
    'Penjualan kredit 3 unit', NULL,
    v_product_id, 3, 150000, NULL
  ) ->> 'transaction_id')::UUID;

  -- Step 5: Receive receivable 450,000
  v_receive_id := (public.post_transaction(
    v_org_id, v_today, 'receive_receivable', 450000,
    v_party_id, NULL, v_cash_id, NULL, 'paid', NULL, NULL,
    'Pelunasan piutang', NULL, NULL, NULL, NULL, NULL
  ) ->> 'transaction_id')::UUID;

  -- Step 6: Expense payment 200,000
  v_expense_id := (public.post_transaction(
    v_org_id, v_today, 'expense_payment', 200000,
    NULL, NULL, v_cash_id, NULL, 'paid', NULL, NULL,
    'Bayar listrik', NULL, NULL, NULL, NULL, v_exp_id
  ) ->> 'transaction_id')::UUID;

  -- Step 7: Owner draw 100,000
  v_draw_id := (public.post_transaction(
    v_org_id, v_today, 'owner_draw', 100000,
    NULL, NULL, v_cash_id, NULL, 'paid', NULL, NULL,
    'Prive pemilik', NULL, NULL, NULL, NULL, NULL
  ) ->> 'transaction_id')::UUID;

  -- ═══════════════════════════════════════════════════════════════════
  -- ASSERTIONS: each verified with explicit expected number
  -- ═══════════════════════════════════════════════════════════════════

  -- Cash (1110) balance = 10M - 1M (purchase) + 600k (sale) + 450k (receive) - 200k (expense) - 100k (draw) = 9,750,000
  PERFORM public._test_assert_eq_numeric(
    'G1: Cash balance after golden',
    public.get_account_balance(v_cash_id, NULL), 9750000);

  -- Modal (3100) = 10M
  PERFORM public._test_assert_eq_numeric(
    'G2: Modal balance after golden',
    public.get_account_balance(v_mod_id, NULL), 10000000);

  -- Revenue (4100) = 600k (cash sale) + 450k (credit sale) = 1,050,000
  PERFORM public._test_assert_eq_numeric(
    'G3: Revenue balance after golden',
    public.get_account_balance(v_rev_id, NULL), 1050000);

  -- COGS (5100) = 4*100k + 3*100k = 700,000
  PERFORM public._test_assert_eq_numeric(
    'G4: COGS balance after golden',
    public.get_account_balance(v_cogs_id, NULL), 700000);

  -- Inventory (1300) = 1M (purchase) - 700k (COGS) = 300,000
  PERFORM public._test_assert_eq_numeric(
    'G5: Inventory balance after golden',
    public.get_account_balance(v_inv_id, NULL), 300000);

  -- Receivable (1200) = 450k - 450k = 0
  PERFORM public._test_assert_eq_numeric(
    'G6: Receivable balance after golden',
    public.get_account_balance(v_rcv_id, NULL), 0);

  -- Expense (6190) = 200k
  PERFORM public._test_assert_eq_numeric(
    'G7: Expense balance after golden',
    public.get_account_balance(v_exp_id, NULL), 200000);

  -- Prive (3300) = 100k
  PERFORM public._test_assert_eq_numeric(
    'G8: Prive balance after golden',
    public.get_account_balance(v_pri_id, NULL), 100000);

  -- Trial balance
  PERFORM public._test_assert_eq_numeric(
    'G9: Trial balance total debit = total credit',
    ABS((SELECT SUM(debit) FROM public.journal_lines WHERE organization_id = v_org_id)
      - (SELECT SUM(credit) FROM public.journal_lines WHERE organization_id = v_org_id)),
    0);

  -- Step 9: Void the expense payment
  PERFORM public.void_transaction(v_org_id, v_expense_id, 'Test void', v_today);

  -- After voiding expense (reversal Dr Kas 200k / Cr Beban 200k):
  --   Cash increases by 200k back from 9,750,000 to 9,950,000
  --   Expense decreases by 200k back from 200,000 to 0
  PERFORM public._test_assert_eq_numeric(
    'G10: Cash after voiding expense payment',
    public.get_account_balance(v_cash_id, NULL), 9950000);
  PERFORM public._test_assert_eq_numeric(
    'G11: Expense after voiding expense payment',
    public.get_account_balance(v_exp_id, NULL), 0);

  -- Trial balance must still balance
  PERFORM public._test_assert_eq_numeric(
    'G12: Trial balance after void',
    ABS((SELECT SUM(debit) FROM public.journal_lines jl
          JOIN public.journal_entries je ON je.id = jl.journal_entry_id
          WHERE jl.organization_id = v_org_id AND je.status = 'posted')
      - (SELECT SUM(credit) FROM public.journal_lines jl
          JOIN public.journal_entries je ON je.id = jl.journal_entry_id
          WHERE jl.organization_id = v_org_id AND je.status = 'posted')),
    0);

  -- Step 10: Balance sheet invariant
  -- Assets = Liabilities + Equity + Revenue - Expenses
  PERFORM public._test_assert_eq_numeric(
    'G13: Balance sheet equation (A = L + E + R - X)',
    ABS(
      (SELECT COALESCE(SUM(jl.debit - jl.credit),0) FROM public.journal_lines jl
        JOIN public.accounts a ON a.id = jl.account_id
        JOIN public.journal_entries je ON je.id = jl.journal_entry_id
        WHERE jl.organization_id = v_org_id AND a.account_type = 'asset' AND je.status = 'posted')
      -
      ((SELECT COALESCE(SUM(jl.credit - jl.debit),0) FROM public.journal_lines jl
          JOIN public.accounts a ON a.id = jl.account_id
          JOIN public.journal_entries je ON je.id = jl.journal_entry_id
          WHERE jl.organization_id = v_org_id AND a.account_type = 'liability' AND je.status = 'posted')
       + (SELECT COALESCE(SUM(jl.credit - jl.debit),0) FROM public.journal_lines jl
          JOIN public.accounts a ON a.id = jl.account_id
          JOIN public.journal_entries je ON je.id = jl.journal_entry_id
          WHERE jl.organization_id = v_org_id AND a.account_type = 'equity' AND je.status = 'posted')
       + (SELECT COALESCE(SUM(jl.credit - jl.debit),0) FROM public.journal_lines jl
          JOIN public.accounts a ON a.id = jl.account_id
          JOIN public.journal_entries je ON je.id = jl.journal_entry_id
          WHERE jl.organization_id = v_org_id AND a.account_type = 'revenue' AND je.status = 'posted')
       - (SELECT COALESCE(SUM(jl.debit - jl.credit),0) FROM public.journal_lines jl
          JOIN public.accounts a ON a.id = jl.account_id
          JOIN public.journal_entries je ON je.id = jl.journal_entry_id
          WHERE jl.organization_id = v_org_id AND a.account_type IN ('expense','cogs','other_expense') AND je.status = 'posted'))
    ),
    0);

  RAISE NOTICE '=== GOLDEN SCENARIO PASSED ===';
END $$;

-- Cleanup test helpers

DO $$ BEGIN RAISE NOTICE '=== Golden Scenario Tests Complete ==='; END $$;