


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE TYPE "public"."account_type" AS ENUM (
    'asset',
    'liability',
    'equity',
    'revenue',
    'cogs',
    'expense',
    'other_income',
    'other_expense'
);


ALTER TYPE "public"."account_type" OWNER TO "postgres";


CREATE TYPE "public"."business_type" AS ENUM (
    'service',
    'simple_trading'
);


ALTER TYPE "public"."business_type" OWNER TO "postgres";


CREATE TYPE "public"."journal_entry_status" AS ENUM (
    'posted',
    'voided',
    'reversed'
);


ALTER TYPE "public"."journal_entry_status" OWNER TO "postgres";


CREATE TYPE "public"."journal_entry_type" AS ENUM (
    'normal',
    'opening_balance',
    'adjustment',
    'reversal'
);


ALTER TYPE "public"."journal_entry_type" OWNER TO "postgres";


CREATE TYPE "public"."member_role" AS ENUM (
    'owner',
    'staff'
);


ALTER TYPE "public"."member_role" OWNER TO "postgres";


CREATE TYPE "public"."member_status" AS ENUM (
    'invited',
    'active',
    'removed'
);


ALTER TYPE "public"."member_status" OWNER TO "postgres";


CREATE TYPE "public"."normal_balance" AS ENUM (
    'debit',
    'credit'
);


ALTER TYPE "public"."normal_balance" OWNER TO "postgres";


CREATE TYPE "public"."onboarding_status" AS ENUM (
    'not_started',
    'in_progress',
    'completed'
);


ALTER TYPE "public"."onboarding_status" OWNER TO "postgres";


CREATE TYPE "public"."org_plan" AS ENUM (
    'free',
    'solo',
    'business'
);


ALTER TYPE "public"."org_plan" OWNER TO "postgres";


CREATE TYPE "public"."party_type" AS ENUM (
    'customer',
    'supplier',
    'employee',
    'owner',
    'other'
);


ALTER TYPE "public"."party_type" OWNER TO "postgres";


CREATE TYPE "public"."payment_status" AS ENUM (
    'paid',
    'unpaid',
    'partial'
);


ALTER TYPE "public"."payment_status" OWNER TO "postgres";


CREATE TYPE "public"."reporting_period" AS ENUM (
    'monthly'
);


ALTER TYPE "public"."reporting_period" OWNER TO "postgres";


CREATE TYPE "public"."transaction_status" AS ENUM (
    'draft',
    'posted',
    'voided',
    'reversed'
);


ALTER TYPE "public"."transaction_status" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_rate_limit"("p_identifier" "text", "p_action" "text", "p_max_attempts" integer DEFAULT 5, "p_window_seconds" integer DEFAULT 300) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_attempts INTEGER;
  v_window_start TIMESTAMPTZ;
BEGIN
  IF NULLIF(TRIM(p_identifier), '') IS NULL THEN
    RAISE EXCEPTION 'Rate-limit identifier is required';
  END IF;

  IF p_window_seconds <= 0 OR p_max_attempts <= 0 THEN
    RAISE EXCEPTION 'Invalid rate-limit configuration';
  END IF;

  DELETE FROM public.rate_limits
  WHERE created_at < now() - INTERVAL '24 hours';

  v_window_start := to_timestamp(
    floor(extract(epoch FROM now()) / p_window_seconds) * p_window_seconds
  );

  SELECT COALESCE(SUM(attempts), 0)
  INTO v_attempts
  FROM public.rate_limits
  WHERE identifier = lower(p_identifier)
    AND action = p_action
    AND window_start >= now() - (p_window_seconds || ' seconds')::INTERVAL;

  IF v_attempts >= p_max_attempts THEN
    RETURN false;
  END IF;

  INSERT INTO public.rate_limits (identifier, action, attempts, window_start)
  VALUES (lower(p_identifier), p_action, 1, v_window_start)
  ON CONFLICT (identifier, action, window_start)
  DO UPDATE SET attempts = public.rate_limits.attempts + 1;

  RETURN true;
END;
$$;


ALTER FUNCTION "public"."check_rate_limit"("p_identifier" "text", "p_action" "text", "p_max_attempts" integer, "p_window_seconds" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_default_accounts"("p_org_id" "uuid", "p_org_name" "text") RETURNS integer
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_count INTEGER := 0;
BEGIN
  INSERT INTO accounts (organization_id, code, name, account_type, normal_balance, is_system, is_locked, report_group, is_cash_account) VALUES
    -- Assets (1000-1999)
    (p_org_id, 1110, 'Kas', 'asset', 'debit', true, true, 'Kas', true),
    (p_org_id, 1120, 'Bank', 'asset', 'debit', true, true, 'Bank', true),
    (p_org_id, 1200, 'Piutang Usaha', 'asset', 'debit', true, true, 'Piutang Usaha', false),
    (p_org_id, 1300, 'Persediaan Sederhana', 'asset', 'debit', true, false, 'Persediaan', false),

    -- Liabilities (2000-2999)
    (p_org_id, 2100, 'Utang Usaha', 'liability', 'credit', true, true, 'Utang Usaha', false),
    (p_org_id, 2200, 'Beban Masih Harus Dibayar', 'liability', 'credit', true, false, 'Beban Belum Dibayar', false),

    -- Equity (3000-3999)
    (p_org_id, 3100, 'Modal Pemilik', 'equity', 'credit', true, true, 'Modal', false),
    (p_org_id, 3200, 'Saldo Awal', 'equity', 'credit', true, true, 'Saldo Awal', false),
    (p_org_id, 3300, 'Prive / Pengambilan Pemilik', 'equity', 'debit', true, true, 'Prive', false),
    (p_org_id, 3400, 'Saldo Laba', 'equity', 'credit', true, false, 'Saldo Laba', false),
    (p_org_id, 3500, 'Laba Tahun Berjalan', 'equity', 'credit', true, false, 'Laba Berjalan', false),

    -- Revenue (4000-4999)
    (p_org_id, 4100, 'Pendapatan Penjualan Barang', 'revenue', 'credit', true, false, 'Pendapatan', false),
    (p_org_id, 4200, 'Pendapatan Jasa', 'revenue', 'credit', true, false, 'Pendapatan', false),

    -- COGS / Direct Expense (5000-5999)
    (p_org_id, 5100, 'HPP / Beban Langsung', 'cogs', 'debit', true, false, 'Beban Langsung', false),

    -- Operating Expenses (6000-6999)
    (p_org_id, 6110, 'Beban Gaji', 'expense', 'debit', true, false, 'Beban Usaha', false),
    (p_org_id, 6120, 'Beban Sewa', 'expense', 'debit', true, false, 'Beban Usaha', false),
    (p_org_id, 6130, 'Beban Listrik dan Air', 'expense', 'debit', true, false, 'Beban Usaha', false),
    (p_org_id, 6140, 'Beban Internet dan Telepon', 'expense', 'debit', true, false, 'Beban Usaha', false),
    (p_org_id, 6150, 'Beban Transportasi', 'expense', 'debit', true, false, 'Beban Usaha', false),
    (p_org_id, 6160, 'Beban Iklan dan Promosi', 'expense', 'debit', true, false, 'Beban Usaha', false),
    (p_org_id, 6170, 'Beban Perlengkapan', 'expense', 'debit', true, false, 'Beban Usaha', false),
    (p_org_id, 6180, 'Beban Software / Langganan', 'expense', 'debit', true, false, 'Beban Usaha', false),
    (p_org_id, 6190, 'Beban Lain-lain', 'expense', 'debit', true, false, 'Beban Usaha', false),

    -- Other Income (7000-7999)
    (p_org_id, 7100, 'Pendapatan Lain-lain', 'other_income', 'credit', true, false, 'Pendapatan Lain', false),

    -- Other Expense (8000-8999)
    (p_org_id, 8100, 'Beban Lain-lain', 'other_expense', 'debit', true, false, 'Beban Lain', false),
    (p_org_id, 8300, 'Beban Pajak Penghasilan', 'other_expense', 'debit', true, false, 'Pajak', false);

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;


ALTER FUNCTION "public"."create_default_accounts"("p_org_id" "uuid", "p_org_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_organization_with_opening_balances"("p_organization_name" "text", "p_business_type" "public"."business_type", "p_books_start_date" "date", "p_default_cash_account_name" "text" DEFAULT 'Kas'::"text", "p_opening_cash_balance" numeric DEFAULT 0, "p_extra_opening_balances" "jsonb" DEFAULT '[]'::"jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_result JSONB;
  v_org_id UUID;
  v_item JSONB;
  v_account_id UUID;
  v_amount NUMERIC;
  v_account_code INTEGER;
  v_create_bank BOOLEAN;
  v_bank_number INTEGER;
  v_bank_name TEXT;
  v_next_code INTEGER;
  v_description TEXT;
  v_posted_count INTEGER := 0;
BEGIN
  IF jsonb_typeof(COALESCE(p_extra_opening_balances, '[]'::JSONB)) != 'array' THEN
    RAISE EXCEPTION 'Extra opening balances must be a JSON array';
  END IF;

  -- This creates org with onboarding_status = 'in_progress'
  v_result := public.create_organization_with_template(
    p_organization_name,
    p_business_type,
    p_books_start_date,
    p_default_cash_account_name,
    p_opening_cash_balance
  );

  v_org_id := (v_result ->> 'organization_id')::UUID;

  -- Post all extra opening balances (org is still in_progress, so post_opening_balance allows it)
  FOR v_item IN
    SELECT value FROM jsonb_array_elements(COALESCE(p_extra_opening_balances, '[]'::JSONB))
  LOOP
    v_amount := NULLIF(v_item ->> 'openingBalance', '')::NUMERIC;
    IF COALESCE(v_amount, 0) <= 0 THEN
      CONTINUE;
    END IF;

    v_create_bank := COALESCE((v_item ->> 'createBank')::BOOLEAN, false);
    v_description := COALESCE(NULLIF(v_item ->> 'description', ''), 'Saldo awal');

    IF v_create_bank THEN
      v_bank_number := COALESCE(NULLIF(v_item ->> 'bankNumber', '')::INTEGER, 2);
      v_bank_name := COALESCE(NULLIF(v_item ->> 'accountName', ''), 'Bank ' || v_bank_number::TEXT);

      SELECT COALESCE(MAX(code), 1120) + 1
      INTO v_next_code
      FROM public.accounts
      WHERE organization_id = v_org_id
        AND code >= 1120
        AND code < 1200;

      INSERT INTO public.accounts (
        organization_id, code, name, account_type, normal_balance,
        is_cash_account, is_active, is_locked, is_system, report_group
      ) VALUES (
        v_org_id, v_next_code, v_bank_name, 'asset', 'debit',
        true, true, false, false, 'cash_and_bank'
      ) RETURNING id INTO v_account_id;
    ELSE
      v_account_code := NULLIF(v_item ->> 'accountCode', '')::INTEGER;

      SELECT id
      INTO v_account_id
      FROM public.accounts
      WHERE organization_id = v_org_id
        AND code = v_account_code
        AND is_active = true
      LIMIT 1;

      IF v_account_id IS NULL THEN
        RAISE EXCEPTION 'Opening balance account % not found', v_account_code;
      END IF;
    END IF;

    PERFORM public.post_opening_balance(
      v_org_id,
      v_account_id,
      v_amount,
      v_description,
      p_books_start_date
    );

    v_posted_count := v_posted_count + 1;
  END LOOP;

  -- P0.2 FIX: Mark onboarding as completed AFTER all balances are posted
  UPDATE public.organizations
  SET onboarding_status = 'completed',
      updated_at = now()
  WHERE id = v_org_id;

  RETURN v_result || jsonb_build_object(
    'extra_opening_balances_posted', v_posted_count,
    'onboarding_status', 'completed'
  );
END;
$$;


ALTER FUNCTION "public"."create_organization_with_opening_balances"("p_organization_name" "text", "p_business_type" "public"."business_type", "p_books_start_date" "date", "p_default_cash_account_name" "text", "p_opening_cash_balance" numeric, "p_extra_opening_balances" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_organization_with_template"("p_organization_name" "text", "p_business_type" "public"."business_type", "p_books_start_date" "date", "p_default_cash_account_name" "text" DEFAULT 'Kas'::"text", "p_opening_cash_balance" numeric DEFAULT 0) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_org_id UUID;
  v_user_id UUID;
  v_accounts_created INTEGER;
  v_cash_account_id UUID;
  v_saldo_awal_id UUID;
  v_journal_id UUID;
  v_line_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- P0.2 FIX: Set onboarding_status = 'in_progress' (not 'completed')
  -- Will be set to 'completed' by create_organization_with_opening_balances
  INSERT INTO organizations (
    name, business_type, base_currency, books_start_date,
    onboarding_status, created_by
  ) VALUES (
    p_organization_name,
    p_business_type,
    'IDR',
    p_books_start_date,
    'in_progress',
    v_user_id
  ) RETURNING id INTO v_org_id;

  -- Create owner membership
  INSERT INTO organization_members (
    organization_id, user_id, role, status,
    can_create_transaction, can_view_reports, can_manage_accounts,
    can_void_transaction, can_view_audit_log,
    invited_by, joined_at
  ) VALUES (
    v_org_id, v_user_id, 'owner', 'active',
    true, true, true, true, true,
    v_user_id, now()
  );

  -- Create default chart of accounts
  v_accounts_created := public.create_default_accounts(v_org_id, p_organization_name);

  -- Find the selected cash/bank account
  SELECT id INTO v_cash_account_id
  FROM accounts
  WHERE organization_id = v_org_id
    AND name = p_default_cash_account_name
    AND account_type = 'asset'
  LIMIT 1;

  IF v_cash_account_id IS NULL THEN
    SELECT id INTO v_cash_account_id
    FROM accounts
    WHERE organization_id = v_org_id
      AND code = 1110
    LIMIT 1;
  END IF;

  -- Find Saldo Awal account
  SELECT id INTO v_saldo_awal_id
  FROM accounts
  WHERE organization_id = v_org_id
    AND code = 3200
  LIMIT 1;

  -- Post opening cash balance if > 0
  IF p_opening_cash_balance > 0 AND v_cash_account_id IS NOT NULL AND v_saldo_awal_id IS NOT NULL THEN
    INSERT INTO journal_entries (
      organization_id, entry_number, entry_date, entry_type,
      description, status, posted_at, posted_by
    ) VALUES (
      v_org_id,
      public.generate_entry_number(v_org_id),
      p_books_start_date,
      'opening_balance',
      'Saldo awal ' || p_default_cash_account_name,
      'posted',
      now(),
      v_user_id
    ) RETURNING id INTO v_journal_id;

    INSERT INTO journal_lines (
      organization_id, journal_entry_id, account_id,
      debit, credit, description, line_order
    ) VALUES (
      v_org_id, v_journal_id, v_cash_account_id,
      p_opening_cash_balance, 0,
      'Saldo awal ' || p_default_cash_account_name, 1
    );

    INSERT INTO journal_lines (
      organization_id, journal_entry_id, account_id,
      debit, credit, description, line_order
    ) VALUES (
      v_org_id, v_journal_id, v_saldo_awal_id,
      0, p_opening_cash_balance,
      'Saldo awal ' || p_default_cash_account_name, 2
    );

    INSERT INTO transactions (
      organization_id, transaction_number, transaction_date,
      transaction_type, amount, cash_account_id,
      description, status, posted_at, posted_by, created_by
    ) VALUES (
      v_org_id,
      public.generate_transaction_number(v_org_id),
      p_books_start_date,
      'opening_cash_balance',
      p_opening_cash_balance,
      v_cash_account_id,
      'Saldo awal ' || p_default_cash_account_name,
      'posted',
      now(),
      v_user_id,
      v_user_id
    ) RETURNING id INTO v_line_id;

    UPDATE journal_entries
    SET transaction_id = v_line_id
    WHERE id = v_journal_id;

    INSERT INTO audit_logs (
      organization_id, actor_user_id, entity_type, entity_id,
      action, after_data
    ) VALUES (
      v_org_id, v_user_id, 'transaction', v_line_id,
      'create', jsonb_build_object(
        'transaction_type', 'opening_cash_balance',
        'amount', p_opening_cash_balance
      )
    );
  END IF;

  -- Create profile if not exists
  INSERT INTO profiles (user_id, full_name, email)
  VALUES (
    v_user_id,
    COALESCE(
      (SELECT raw_user_meta_data->>'full_name' FROM auth.users WHERE id = v_user_id),
      ''
    ),
    COALESCE(
      (SELECT email FROM auth.users WHERE id = v_user_id),
      ''
    )
  )
  ON CONFLICT (user_id) DO NOTHING;

  RETURN jsonb_build_object(
    'organization_id', v_org_id,
    'onboarding_status', 'in_progress',
    'accounts_created', v_accounts_created,
    'cash_account_id', v_cash_account_id,
    'opening_balance_posted', (p_opening_cash_balance > 0)
  );
END;
$$;


ALTER FUNCTION "public"."create_organization_with_template"("p_organization_name" "text", "p_business_type" "public"."business_type", "p_books_start_date" "date", "p_default_cash_account_name" "text", "p_opening_cash_balance" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_journal_line_org_match"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_acct_org UUID;
BEGIN
  SELECT organization_id INTO v_acct_org
  FROM public.accounts WHERE id = NEW.account_id;

  IF v_acct_org IS NULL THEN
    RAISE EXCEPTION 'Akun % tidak ditemukan', NEW.account_id;
  END IF;

  IF v_acct_org != NEW.organization_id THEN
    RAISE EXCEPTION 'Akun tidak termasuk dalam organisasi ini';
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."enforce_journal_line_org_match"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_entry_number"("p_organization_id" "uuid") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_next_num INTEGER;
BEGIN
  v_next_num := public.get_next_counter(p_organization_id, 'entry_number');
  RETURN 'JE-' || LPAD(v_next_num::TEXT, 6, '0');
END;
$$;


ALTER FUNCTION "public"."generate_entry_number"("p_organization_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_transaction_number"("p_organization_id" "uuid") RETURNS "text"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT public.generate_transaction_number(p_organization_id, CURRENT_DATE);
$$;


ALTER FUNCTION "public"."generate_transaction_number"("p_organization_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_transaction_number"("p_organization_id" "uuid", "p_transaction_date" "date") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_period TEXT;
  v_next_num INTEGER;
BEGIN
  v_period := to_char(COALESCE(p_transaction_date, CURRENT_DATE), 'YYYYMM');
  v_next_num := public.get_next_counter(
    p_organization_id,
    'transaction_number:' || v_period
  );

  RETURN 'TRX-' || v_period || '-' || lpad(v_next_num::TEXT, 6, '0');
END;
$$;


ALTER FUNCTION "public"."generate_transaction_number"("p_organization_id" "uuid", "p_transaction_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_account_balance"("p_account_id" "uuid", "p_as_of_date" "date" DEFAULT NULL::"date") RETURNS numeric
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_balance NUMERIC;
  v_normal TEXT;
  v_org_id UUID;
BEGIN
  SELECT a.normal_balance::TEXT, a.organization_id
  INTO v_normal, v_org_id
  FROM public.accounts a
  WHERE a.id = p_account_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Account not found';
  END IF;

  IF NOT public.has_permission(v_org_id, 'can_view_reports') THEN
    RAISE EXCEPTION 'You do not have permission to view reports';
  END IF;

  SELECT COALESCE(SUM(jl.debit - jl.credit), 0)
  INTO v_balance
  FROM public.journal_lines jl
  JOIN public.journal_entries je ON je.id = jl.journal_entry_id
  WHERE jl.organization_id = v_org_id
    AND jl.account_id = p_account_id
    AND je.status = 'posted'
    AND (p_as_of_date IS NULL OR je.entry_date <= p_as_of_date);

  IF v_normal = 'credit' THEN
    v_balance := -v_balance;
  END IF;

  RETURN v_balance;
END;
$$;


ALTER FUNCTION "public"."get_account_balance"("p_account_id" "uuid", "p_as_of_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_account_by_code"("p_org_id" "uuid", "p_code" integer) RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT id
  FROM public.accounts
  WHERE organization_id = p_org_id
    AND code = p_code
    AND is_active = true
  LIMIT 1;
$$;


ALTER FUNCTION "public"."get_account_by_code"("p_org_id" "uuid", "p_code" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_balance_sheet"("p_organization_id" "uuid", "p_as_of_date" "date") RETURNS TABLE("section" "text", "account_code" integer, "account_name" "text", "amount" numeric)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NOT public.is_org_member(p_organization_id) THEN
    RAISE EXCEPTION 'Anda bukan anggota organisasi ini';
  END IF;

  IF NOT public.has_permission(p_organization_id, 'can_view_reports') THEN
    RAISE EXCEPTION 'Anda tidak memiliki izin untuk melihat laporan neraca';
  END IF;

  RETURN QUERY
  WITH posted_lines AS (
    SELECT
      jl.account_id,
      jl.debit,
      jl.credit
    FROM public.journal_lines jl
    JOIN public.journal_entries je
      ON je.id = jl.journal_entry_id
     AND je.organization_id = jl.organization_id
    WHERE jl.organization_id = p_organization_id
      AND je.status = 'posted'
      AND je.entry_date <= p_as_of_date
  ),
  account_balances AS (
    SELECT
      a.id,
      a.code,
      a.name,
      a.account_type,
      a.is_active,
      COALESCE(SUM(pl.debit - pl.credit), 0) AS balance
    FROM public.accounts a
    LEFT JOIN posted_lines pl ON pl.account_id = a.id
    WHERE a.organization_id = p_organization_id
      -- P0-4 FIX: include active accounts OR accounts with non-zero balance
      AND (a.is_active = true OR EXISTS (
        SELECT 1 FROM posted_lines pl2 WHERE pl2.account_id = a.id
      ))
    GROUP BY a.id, a.code, a.name, a.account_type, a.is_active
  ),
  net_income AS (
    SELECT -COALESCE(SUM(balance), 0) AS net
    FROM account_balances
    WHERE account_type IN ('revenue', 'cogs', 'expense', 'other_income', 'other_expense')
  )
  SELECT
    'asset'::TEXT      AS section,
    ab.code::INTEGER   AS account_code,
    ab.name::TEXT      AS account_name,
    ab.balance::NUMERIC AS amount
  FROM account_balances ab
  WHERE ab.account_type = 'asset' AND ab.balance != 0

  UNION ALL

  SELECT
    'liability'::TEXT,
    ab.code::INTEGER,
    ab.name::TEXT,
    (-ab.balance)::NUMERIC
  FROM account_balances ab
  WHERE ab.account_type = 'liability' AND ab.balance != 0

  UNION ALL

  SELECT
    'equity'::TEXT,
    ab.code::INTEGER,
    ab.name::TEXT,
    (-ab.balance)::NUMERIC
  FROM account_balances ab
  WHERE ab.account_type = 'equity'
    AND ab.code != 3500
    AND ab.balance != 0

  UNION ALL

  SELECT
    'equity'::TEXT,
    3500::INTEGER,
    'Laba Tahun Berjalan'::TEXT,
    ni.net::NUMERIC
  FROM net_income ni
  WHERE ni.net != 0

  ORDER BY section, account_code;
END;
$$;


ALTER FUNCTION "public"."get_balance_sheet"("p_organization_id" "uuid", "p_as_of_date" "date") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_balance_sheet"("p_organization_id" "uuid", "p_as_of_date" "date") IS 'Balance sheet: rewritten with CTEs (no temp table) so it works under pgbouncer transaction pooling.';



CREATE OR REPLACE FUNCTION "public"."get_dashboard_summary"("p_organization_id" "uuid", "p_from_date" "date" DEFAULT NULL::"date", "p_to_date" "date" DEFAULT NULL::"date") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  -- P&L defaults: current calendar month
  v_effective_from DATE := COALESCE(p_from_date, date_trunc('month', CURRENT_DATE)::DATE);
  v_effective_to   DATE := COALESCE(p_to_date, (date_trunc('month', CURRENT_DATE) + INTERVAL '1 month - 1 day')::DATE);
  -- Balance sheet: point-in-time (use p_to_date or today)
  v_point_in_time DATE := COALESCE(p_to_date, CURRENT_DATE);

  v_cash_balance NUMERIC;
  v_receivables NUMERIC;
  v_payables NUMERIC;
  v_revenue NUMERIC;
  v_expenses NUMERIC;
  v_net_income NUMERIC;
BEGIN
  IF NOT public.has_permission(p_organization_id, 'can_view_reports') THEN
    RAISE EXCEPTION 'Anda tidak memiliki izin untuk melihat laporan';
  END IF;

  WITH posted_lines AS (
    SELECT
      jl.debit,
      jl.credit,
      a.code,
      a.name,
      a.account_type,
      a.is_cash_account,
      je.entry_type,
      je.entry_date
    FROM public.journal_lines jl
    JOIN public.accounts a ON a.id = jl.account_id
    JOIN public.journal_entries je ON je.id = jl.journal_entry_id
    WHERE jl.organization_id = p_organization_id
      AND je.status = 'posted'
  ),
  -- Cash balance: point-in-time (all posted lines up to v_point_in_time)
  cash_lines AS (
    SELECT * FROM posted_lines
    WHERE is_cash_account = true
      AND entry_date <= v_point_in_time
  ),
  -- AR: point-in-time
  ar_lines AS (
    SELECT * FROM posted_lines
    WHERE code = 1200
      AND entry_date <= v_point_in_time
  ),
  -- AP: point-in-time
  ap_lines AS (
    SELECT * FROM posted_lines
    WHERE code = 2100
      AND entry_date <= v_point_in_time
  ),
  -- Revenue: period-scoped
  revenue_lines AS (
    SELECT * FROM posted_lines
    WHERE account_type = 'revenue'
      AND entry_type != 'opening_balance'
      AND entry_date BETWEEN v_effective_from AND v_effective_to
  ),
  -- Expenses (including COGS): period-scoped
  expense_lines AS (
    SELECT * FROM posted_lines
    WHERE account_type IN ('expense', 'cogs')
      AND entry_type != 'opening_balance'
      AND entry_date BETWEEN v_effective_from AND v_effective_to
  )
  SELECT
    COALESCE((SELECT SUM(debit - credit) FROM cash_lines), 0),
    COALESCE((SELECT SUM(debit - credit) FROM ar_lines), 0),
    COALESCE((SELECT SUM(credit - debit) FROM ap_lines), 0),
    COALESCE((SELECT SUM(credit - debit) FROM revenue_lines), 0),
    COALESCE((SELECT SUM(debit - credit) FROM expense_lines), 0)
  INTO v_cash_balance, v_receivables, v_payables, v_revenue, v_expenses;

  v_net_income := v_revenue - v_expenses;

  RETURN jsonb_build_object(
    'cash_balance', v_cash_balance,
    'accounts_receivable', v_receivables,
    'accounts_payable', v_payables,
    'revenue_current_period', v_revenue,
    'expense_current_period', v_expenses,
    'net_profit_current_period', v_net_income,
    'period_from', v_effective_from,
    'period_to', v_effective_to
  );
END;
$$;


ALTER FUNCTION "public"."get_dashboard_summary"("p_organization_id" "uuid", "p_from_date" "date", "p_to_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_general_ledger"("p_organization_id" "uuid", "p_account_id" "uuid" DEFAULT NULL::"uuid", "p_from_date" "date" DEFAULT NULL::"date", "p_to_date" "date" DEFAULT NULL::"date") RETURNS TABLE("account_id" "uuid", "account_code" integer, "account_name" "text", "entry_date" "date", "journal_entry_id" "uuid", "entry_number" "text", "transaction_id" "uuid", "transaction_number" "text", "description" "text", "party_name" "text", "debit" numeric, "credit" numeric, "running_balance" numeric)
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NOT public.has_permission(p_organization_id, 'can_view_reports') THEN
    RAISE EXCEPTION 'You do not have permission to view reports';
  END IF;

  RETURN QUERY
  SELECT
    gl.account_id,
    gl.account_code,
    gl.account_name,
    gl.entry_date,
    gl.journal_entry_id,
    gl.entry_number,
    gl.transaction_id,
    gl.transaction_number,
    gl.description,
    gl.party_name,
    gl.debit,
    gl.credit,
    gl.running_balance
  FROM public.general_ledger gl
  WHERE gl.organization_id = p_organization_id
    AND (p_account_id IS NULL OR gl.account_id = p_account_id)
    AND (p_from_date IS NULL OR gl.entry_date >= p_from_date)
    AND (p_to_date IS NULL OR gl.entry_date <= p_to_date)
  ORDER BY gl.account_code, gl.entry_date, gl.journal_entry_id, gl.running_balance;
END;
$$;


ALTER FUNCTION "public"."get_general_ledger"("p_organization_id" "uuid", "p_account_id" "uuid", "p_from_date" "date", "p_to_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_monthly_summary"("p_organization_id" "uuid", "p_month" "date" DEFAULT NULL::"date") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_month DATE := COALESCE(p_month, date_trunc('month', CURRENT_DATE)::DATE);
  v_next_month DATE := v_month + INTERVAL '1 month';
  v_cash_balance NUMERIC;
  v_revenue NUMERIC;
  v_expenses NUMERIC;
BEGIN
  IF NOT public.has_permission(p_organization_id, 'can_view_reports') THEN
    RAISE EXCEPTION 'Anda tidak memiliki izin untuk melihat laporan';
  END IF;

  -- Cash balance: use is_cash_account flag (all posted lines up to end of month)
  SELECT COALESCE(SUM(jl.debit - jl.credit), 0)
  INTO v_cash_balance
  FROM journal_lines jl
  JOIN accounts a ON a.id = jl.account_id
  JOIN journal_entries je ON je.id = jl.journal_entry_id
  WHERE jl.organization_id = p_organization_id
    AND a.account_type = 'asset'
    AND a.is_cash_account = true
    AND je.status = 'posted'
    AND je.entry_date < v_next_month;

  -- Revenue this month
  SELECT COALESCE(SUM(jl.credit - jl.debit), 0)
  INTO v_revenue
  FROM journal_lines jl
  JOIN accounts a ON a.id = jl.account_id
  JOIN journal_entries je ON je.id = jl.journal_entry_id
  WHERE jl.organization_id = p_organization_id
    AND a.account_type = 'revenue'
    AND je.entry_type != 'opening_balance'
    AND je.status = 'posted'
    AND je.entry_date >= v_month
    AND je.entry_date < v_next_month;

  -- Expenses this month (including COGS)
  SELECT COALESCE(SUM(jl.debit - jl.credit), 0)
  INTO v_expenses
  FROM journal_lines jl
  JOIN accounts a ON a.id = jl.account_id
  JOIN journal_entries je ON je.id = jl.journal_entry_id
  WHERE jl.organization_id = p_organization_id
    AND a.account_type IN ('expense', 'cogs')
    AND je.entry_type != 'opening_balance'
    AND je.status = 'posted'
    AND je.entry_date >= v_month
    AND je.entry_date < v_next_month;

  RETURN jsonb_build_object(
    'cash_balance', v_cash_balance,
    'revenue', v_revenue,
    'expenses', v_expenses,
    'net_profit', v_revenue - v_expenses,
    'month', v_month
  );
END;
$$;


ALTER FUNCTION "public"."get_monthly_summary"("p_organization_id" "uuid", "p_month" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_monthly_transaction_count"("p_org_id" "uuid") RETURNS integer
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_count INTEGER;
BEGIN
  IF NOT public.is_org_member(p_org_id) THEN
    RAISE EXCEPTION 'You are not a member of this organization';
  END IF;

  SELECT COUNT(*)::INTEGER
  INTO v_count
  FROM public.transactions
  WHERE organization_id = p_org_id
    AND status IN ('posted', 'voided')
    AND original_transaction_id IS NULL
    AND transaction_type NOT LIKE 'opening_%'
    AND created_at >= date_trunc('month', now())
    AND created_at < date_trunc('month', now()) + INTERVAL '1 month';

  RETURN v_count;
END;
$$;


ALTER FUNCTION "public"."get_monthly_transaction_count"("p_org_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_monthly_usage"("p_org_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_count INTEGER;
  v_limit INTEGER := 50;
  v_period_start TIMESTAMPTZ;
  v_period_end TIMESTAMPTZ;
BEGIN
  IF NOT public.is_org_member(p_org_id) THEN
    RAISE EXCEPTION 'You are not a member of this organization';
  END IF;

  v_period_start := date_trunc('month', now());
  v_period_end   := v_period_start + INTERVAL '1 month';

  SELECT COUNT(*)::INTEGER
  INTO v_count
  FROM public.transactions
  WHERE organization_id = p_org_id
    AND status IN ('posted', 'voided')
    AND original_transaction_id IS NULL
    AND transaction_type NOT LIKE 'opening_%'
    AND created_at >= v_period_start
    AND created_at < v_period_end;

  RETURN jsonb_build_object(
    'count',        v_count,
    'limit',        v_limit,
    'remaining',    GREATEST(v_limit - v_count, 0),
    'period_start', v_period_start,
    'period_end',   v_period_end
  );
END;
$$;


ALTER FUNCTION "public"."get_monthly_usage"("p_org_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_next_counter"("p_organization_id" "uuid", "p_counter_name" "text") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_next_value INTEGER;
BEGIN
  -- Atomic increment using INSERT ... ON CONFLICT
  INSERT INTO public.organization_document_counters (organization_id, counter_name, current_value, updated_at)
  VALUES (p_organization_id, p_counter_name, 1, now())
  ON CONFLICT (organization_id, counter_name)
  DO UPDATE SET 
    current_value = public.organization_document_counters.current_value + 1,
    updated_at = now()
  RETURNING current_value INTO v_next_value;

  RETURN v_next_value;
END;
$$;


ALTER FUNCTION "public"."get_next_counter"("p_organization_id" "uuid", "p_counter_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_org_role"("org_id" "uuid") RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT role::TEXT FROM public.organization_members
  WHERE organization_id = org_id
    AND user_id = auth.uid()
    AND status = 'active'
  LIMIT 1;
$$;


ALTER FUNCTION "public"."get_org_role"("org_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_product_info"("p_product_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_product RECORD;
BEGIN
  SELECT
    p.id, p.organization_id, p.code, p.name, p.description, p.unit,
    p.purchase_price, p.selling_price, p.current_stock, p.min_stock,
    p.is_active
  INTO v_product
  FROM public.products p
  WHERE p.id = p_product_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Product not found';
  END IF;

  IF NOT public.is_org_member(v_product.organization_id) THEN
    RAISE EXCEPTION 'Product not found';
  END IF;

  RETURN jsonb_build_object(
    'id', v_product.id,
    'code', v_product.code,
    'name', v_product.name,
    'description', v_product.description,
    'unit', v_product.unit,
    'purchase_price', v_product.purchase_price,
    'selling_price', v_product.selling_price,
    'current_stock', v_product.current_stock,
    'min_stock', v_product.min_stock,
    'is_active', v_product.is_active,
    'low_stock', v_product.current_stock <= v_product.min_stock
  );
END;
$$;


ALTER FUNCTION "public"."get_product_info"("p_product_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_profit_loss"("p_organization_id" "uuid", "p_from_date" "date", "p_to_date" "date") RETURNS TABLE("section" "text", "account_code" integer, "account_name" "text", "amount" numeric)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NOT public.has_permission(p_organization_id, 'can_view_reports') THEN
    RAISE EXCEPTION 'You do not have permission to view reports';
  END IF;

  RETURN QUERY
  WITH filtered_lines AS (
    SELECT jl.account_id, jl.debit, jl.credit
    FROM public.journal_lines jl
    JOIN public.journal_entries je ON je.id = jl.journal_entry_id
    WHERE jl.organization_id = p_organization_id
      AND je.status = 'posted'
      AND je.entry_type != 'opening_balance'
      AND je.entry_date BETWEEN p_from_date AND p_to_date
  )
  SELECT
    'revenue' AS section,
    a.code AS account_code,
    a.name AS account_name,
    COALESCE(SUM(fl.credit - fl.debit), 0) AS amount
  FROM public.accounts a
  LEFT JOIN filtered_lines fl ON fl.account_id = a.id
  WHERE a.organization_id = p_organization_id
    AND a.account_type = 'revenue'
  GROUP BY a.id, a.code, a.name

  UNION ALL

  SELECT
    'cogs' AS section,
    a.code AS account_code,
    a.name AS account_name,
    COALESCE(SUM(fl.debit - fl.credit), 0) AS amount
  FROM public.accounts a
  LEFT JOIN filtered_lines fl ON fl.account_id = a.id
  WHERE a.organization_id = p_organization_id
    AND a.account_type = 'cogs'
  GROUP BY a.id, a.code, a.name

  UNION ALL

  SELECT
    'expense' AS section,
    a.code AS account_code,
    a.name AS account_name,
    COALESCE(SUM(fl.debit - fl.credit), 0) AS amount
  FROM public.accounts a
  LEFT JOIN filtered_lines fl ON fl.account_id = a.id
  WHERE a.organization_id = p_organization_id
    AND a.account_type = 'expense'
  GROUP BY a.id, a.code, a.name

  UNION ALL

  SELECT
    'other_income' AS section,
    a.code AS account_code,
    a.name AS account_name,
    COALESCE(SUM(fl.credit - fl.debit), 0) AS amount
  FROM public.accounts a
  LEFT JOIN filtered_lines fl ON fl.account_id = a.id
  WHERE a.organization_id = p_organization_id
    AND a.account_type = 'other_income'
  GROUP BY a.id, a.code, a.name

  UNION ALL

  SELECT
    'other_expense' AS section,
    a.code AS account_code,
    a.name AS account_name,
    COALESCE(SUM(fl.debit - fl.credit), 0) AS amount
  FROM public.accounts a
  LEFT JOIN filtered_lines fl ON fl.account_id = a.id
  WHERE a.organization_id = p_organization_id
    AND a.account_type = 'other_expense'
  GROUP BY a.id, a.code, a.name

  ORDER BY section, account_code;
END;
$$;


ALTER FUNCTION "public"."get_profit_loss"("p_organization_id" "uuid", "p_from_date" "date", "p_to_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_trial_balance"("p_organization_id" "uuid", "p_as_of_date" "date" DEFAULT NULL::"date") RETURNS TABLE("account_id" "uuid", "account_code" integer, "account_name" "text", "account_type" "text", "normal_balance" "text", "debit_total" numeric, "credit_total" numeric, "ending_debit" numeric, "ending_credit" numeric)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NOT public.has_permission(p_organization_id, 'can_view_reports') THEN
    RAISE EXCEPTION 'You do not have permission to view reports';
  END IF;

  RETURN QUERY
  WITH filtered_lines AS (
    SELECT jl.account_id, jl.debit, jl.credit
    FROM public.journal_lines jl
    JOIN public.journal_entries je ON je.id = jl.journal_entry_id
    WHERE jl.organization_id = p_organization_id
      AND je.status = 'posted'
      AND (p_as_of_date IS NULL OR je.entry_date <= p_as_of_date)
  ),
  account_activity AS (
    SELECT
      a.id AS account_id,
      a.code AS account_code,
      a.name AS account_name,
      a.account_type::TEXT AS account_type,
      a.normal_balance::TEXT AS normal_balance,
      COALESCE(SUM(fl.debit), 0) AS debit_total,
      COALESCE(SUM(fl.credit), 0) AS credit_total,
      CASE
        WHEN a.normal_balance = 'debit' THEN COALESCE(SUM(fl.debit - fl.credit), 0)
        ELSE COALESCE(SUM(fl.credit - fl.debit), 0)
      END AS normal_amount
    FROM public.accounts a
    LEFT JOIN filtered_lines fl ON fl.account_id = a.id
    WHERE a.organization_id = p_organization_id
    GROUP BY a.id, a.code, a.name, a.account_type, a.normal_balance
  )
  SELECT
    aa.account_id,
    aa.account_code,
    aa.account_name,
    aa.account_type,
    aa.normal_balance,
    aa.debit_total,
    aa.credit_total,
    CASE
      WHEN aa.normal_balance = 'debit' AND aa.normal_amount >= 0 THEN aa.normal_amount
      WHEN aa.normal_balance = 'credit' AND aa.normal_amount < 0 THEN ABS(aa.normal_amount)
      ELSE 0
    END AS ending_debit,
    CASE
      WHEN aa.normal_balance = 'credit' AND aa.normal_amount >= 0 THEN aa.normal_amount
      WHEN aa.normal_balance = 'debit' AND aa.normal_amount < 0 THEN ABS(aa.normal_amount)
      ELSE 0
    END AS ending_credit
  FROM account_activity aa
  WHERE aa.debit_total != 0 OR aa.credit_total != 0
  ORDER BY aa.account_code;
END;
$$;


ALTER FUNCTION "public"."get_trial_balance"("p_organization_id" "uuid", "p_as_of_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.email, '')
  );
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."has_permission"("p_org_id" "uuid", "p_permission" "text") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_member public.organization_members%ROWTYPE;
BEGIN
  SELECT *
  INTO v_member
  FROM public.organization_members
  WHERE organization_id = p_org_id
    AND user_id = auth.uid()
    AND status = 'active'
  LIMIT 1;

  IF v_member.id IS NULL THEN
    RETURN false;
  END IF;

  IF v_member.role = 'owner' THEN
    RETURN true;
  END IF;

  RETURN CASE p_permission
    WHEN 'can_create_transaction' THEN v_member.can_create_transaction
    WHEN 'can_view_reports' THEN v_member.can_view_reports
    WHEN 'can_manage_accounts' THEN v_member.can_manage_accounts
    WHEN 'can_void_transaction' THEN v_member.can_void_transaction
    WHEN 'can_view_audit_log' THEN v_member.can_view_audit_log
    WHEN 'can_manage_products' THEN v_member.can_manage_products
    ELSE false
  END;
END;
$$;


ALTER FUNCTION "public"."has_permission"("p_org_id" "uuid", "p_permission" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."invite_staff"("p_organization_id" "uuid", "p_email" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
DECLARE
  v_inviter_id UUID;
  v_inviter_role TEXT;
  v_target_user_id UUID;
  v_target_email_verified_at TIMESTAMPTZ;
  v_current_plan TEXT;
  v_staff_count INTEGER;
  v_member_id UUID;
BEGIN
  v_inviter_id := auth.uid();
  IF v_inviter_id IS NULL THEN
    RAISE EXCEPTION 'Autentikasi diperlukan';
  END IF;

  IF p_email IS NULL OR p_email !~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$' THEN
    RAISE EXCEPTION 'Email tidak valid';
  END IF;

  SELECT role::TEXT
  INTO v_inviter_role
  FROM public.organization_members
  WHERE organization_id = p_organization_id
    AND user_id = v_inviter_id
    AND status = 'active';

  IF v_inviter_role IS NULL THEN
    RAISE EXCEPTION 'Anda bukan anggota organisasi ini';
  END IF;

  IF v_inviter_role != 'owner' THEN
    RAISE EXCEPTION 'Hanya owner yang dapat mengundang staf';
  END IF;

  SELECT current_plan
  INTO v_current_plan
  FROM public.organizations
  WHERE id = p_organization_id;

  IF v_current_plan != 'business' THEN
    RAISE EXCEPTION 'Invite staf memerlukan paket Business';
  END IF;

  SELECT COUNT(*)
  INTO v_staff_count
  FROM public.organization_members
  WHERE organization_id = p_organization_id
    AND role = 'staff'
    AND status = 'active';

  IF v_staff_count >= 1 THEN
    RAISE EXCEPTION 'Paket Business saat ini mendukung maksimal 1 staf';
  END IF;

  SELECT id, email_confirmed_at
  INTO v_target_user_id, v_target_email_verified_at
  FROM auth.users
  WHERE lower(email) = lower(p_email)
  LIMIT 1;

  IF v_target_user_id IS NULL THEN
    RAISE EXCEPTION 'User dengan email % belum terdaftar', p_email;
  END IF;

  IF v_target_email_verified_at IS NULL THEN
    RAISE EXCEPTION 'Email user belum terverifikasi';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.organization_members
    WHERE organization_id = p_organization_id
      AND user_id = v_target_user_id
      AND status != 'removed'
  ) THEN
    RAISE EXCEPTION 'User sudah menjadi anggota organisasi ini';
  END IF;

  INSERT INTO public.organization_members (
    organization_id,
    user_id,
    role,
    status,
    invited_by,
    joined_at,
    can_create_transaction,
    can_view_reports,
    can_manage_accounts,
    can_void_transaction,
    can_manage_products,
    can_view_audit_log
  ) VALUES (
    p_organization_id,
    v_target_user_id,
    'staff',
    'active',
    v_inviter_id,
    now(),
    false,
    false,
    false,
    false,
    false,
    false
  ) RETURNING id INTO v_member_id;

  INSERT INTO public.audit_logs (
    organization_id, actor_user_id, entity_type, entity_id,
    action, after_data
  ) VALUES (
    p_organization_id, v_inviter_id, 'organization_member', v_member_id,
    'invite_staff',
    jsonb_build_object(
      'invited_user_id', v_target_user_id,
      'email', lower(p_email),
      'role', 'staff'
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'member_id', v_member_id,
    'user_id', v_target_user_id
  );
END;
$_$;


ALTER FUNCTION "public"."invite_staff"("p_organization_id" "uuid", "p_email" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_email_rate_limited"("p_email" "text", "p_max_attempts" integer DEFAULT 5, "p_lockout_minutes" integer DEFAULT 15) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_failed_count INTEGER;
BEGIN
  SELECT COUNT(*)
  INTO v_failed_count
  FROM public.login_attempts
  WHERE email = lower(p_email)
    AND success = false
    AND created_at > now() - (p_lockout_minutes || ' minutes')::INTERVAL;

  RETURN v_failed_count >= p_max_attempts;
END;
$$;


ALTER FUNCTION "public"."is_email_rate_limited"("p_email" "text", "p_max_attempts" integer, "p_lockout_minutes" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_org_member"("org_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE organization_id = org_id
      AND user_id = auth.uid()
      AND status = 'active'
  );
$$;


ALTER FUNCTION "public"."is_org_member"("org_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."log_security_event"("p_organization_id" "uuid", "p_user_id" "uuid", "p_action" "text", "p_resource_type" "text" DEFAULT NULL::"text", "p_resource_id" "text" DEFAULT NULL::"text", "p_details" "jsonb" DEFAULT NULL::"jsonb", "p_ip_address" "inet" DEFAULT NULL::"inet", "p_user_agent" "text" DEFAULT NULL::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
DECLARE
  v_actor_id UUID;
  v_log_id UUID;
BEGIN
  -- Derive actor from JWT, never trust client-supplied user_id
  v_actor_id := auth.uid();
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Autentikasi diperlukan';
  END IF;

  -- Require org membership (or service_role bypasses RLS anyway)
  IF NOT public.is_org_member(p_organization_id) THEN
    RAISE EXCEPTION 'Anda bukan anggota organisasi ini';
  END IF;

  INSERT INTO public.audit_logs (
    organization_id, actor_user_id, action, entity_type, entity_id,
    after_data
  ) VALUES (
    p_organization_id,
    v_actor_id,
    p_action,
    COALESCE(p_resource_type, 'security'),
    CASE
      WHEN p_resource_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        THEN p_resource_id::UUID
      ELSE gen_random_uuid()
    END,
    jsonb_build_object(
      'details', p_details,
      'ip_address', p_ip_address::TEXT,
      'user_agent', p_user_agent
    )
  ) RETURNING id INTO v_log_id;

  RETURN v_log_id;
END;
$_$;


ALTER FUNCTION "public"."log_security_event"("p_organization_id" "uuid", "p_user_id" "uuid", "p_action" "text", "p_resource_type" "text", "p_resource_id" "text", "p_details" "jsonb", "p_ip_address" "inet", "p_user_agent" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."post_opening_balance"("p_organization_id" "uuid", "p_account_id" "uuid", "p_amount" numeric, "p_description" "text", "p_entry_date" "date") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_user_id           UUID;
  v_role              TEXT;
  v_saldo_awal_id     UUID;
  v_journal_id        UUID;
  v_txn_id            UUID;
  v_entry_number      TEXT;
  v_txn_number        TEXT;
  v_books_start_date  DATE;
  v_account_type      TEXT;
  v_is_cash_account   BOOLEAN;
  v_has_normal_txn    BOOLEAN;   -- ← was INTEGER, now BOOLEAN
  v_onboarding_status TEXT;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- Only owner
  SELECT role::TEXT INTO v_role
  FROM public.organization_members
  WHERE organization_id = p_organization_id
    AND user_id = v_user_id
    AND status = 'active';

  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Anda bukan anggota organisasi ini';
  END IF;
  IF v_role != 'owner' THEN
    RAISE EXCEPTION 'Hanya pemilik yang dapat memposting saldo awal';
  END IF;

  -- Check onboarding status
  SELECT onboarding_status::TEXT INTO v_onboarding_status
  FROM public.organizations WHERE id = p_organization_id;

  -- Reject if already completed (owner-only setup mode can override if needed in future)
  IF v_onboarding_status = 'completed' THEN
    RAISE EXCEPTION 'Saldo awal hanya dapat diisi selama onboarding. Hubungi dukungan jika perlu penyesuaikan.';
  END IF;

  -- Check if normal (non-opening) transactions exist
  SELECT EXISTS (
    SELECT 1
    FROM public.transactions
    WHERE organization_id = p_organization_id
      AND status = 'posted'
      AND transaction_type NOT LIKE 'opening_%'
  ) INTO v_has_normal_txn;   -- ← SELECT EXISTS ... INTO BOOLEAN

  IF v_has_normal_txn THEN   -- ← compare BOOLEAN, not integer
    RAISE EXCEPTION 'Saldo awal tidak dapat diposting setelah ada transaksi normal. Hubungi dukungan untuk menyesuaikan saldo.';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be greater than 0';
  END IF;

  SELECT books_start_date INTO v_books_start_date
  FROM public.organizations WHERE id = p_organization_id;

  IF v_books_start_date IS NULL THEN
    RAISE EXCEPTION 'Organization not found';
  END IF;

  IF p_entry_date < v_books_start_date THEN
    RAISE EXCEPTION 'Opening balance date % is before books start date %',
      p_entry_date, v_books_start_date;
  END IF;

  SELECT account_type::TEXT, is_cash_account
  INTO v_account_type, v_is_cash_account
  FROM public.accounts
  WHERE id = p_account_id
    AND organization_id = p_organization_id
    AND is_active = true;

  IF v_account_type IS NULL THEN
    RAISE EXCEPTION 'Opening balance account not found or inactive';
  END IF;
  IF v_account_type != 'asset' OR v_is_cash_account IS NOT TRUE THEN
    RAISE EXCEPTION 'Opening cash balance account must be an active cash/bank asset account';
  END IF;

  SELECT id INTO v_saldo_awal_id
  FROM public.accounts
  WHERE organization_id = p_organization_id
    AND code = 3200 AND is_active = true
  LIMIT 1;

  IF v_saldo_awal_id IS NULL THEN
    RAISE EXCEPTION 'Saldo Awal account not found';
  END IF;

  v_entry_number := public.generate_entry_number(p_organization_id);
  v_txn_number   := public.generate_transaction_number(p_organization_id, p_entry_date);

  INSERT INTO public.journal_entries (
    organization_id, entry_number, entry_date, entry_type,
    description, status, posted_at, posted_by
  ) VALUES (
    p_organization_id, v_entry_number, p_entry_date, 'opening_balance',
    p_description, 'posted', now(), v_user_id
  ) RETURNING id INTO v_journal_id;

  INSERT INTO public.journal_lines (
    organization_id, journal_entry_id, account_id,
    debit, credit, description, line_order
  ) VALUES
    (p_organization_id, v_journal_id, p_account_id, p_amount, 0, p_description, 1),
    (p_organization_id, v_journal_id, v_saldo_awal_id, 0, p_amount, p_description, 2);

  INSERT INTO public.transactions (
    organization_id, transaction_number, transaction_date,
    transaction_type, amount, cash_account_id,
    description, status, posted_at, posted_by, created_by
  ) VALUES (
    p_organization_id, v_txn_number, p_entry_date,
    'opening_cash_balance', p_amount, p_account_id,
    p_description, 'posted', now(), v_user_id, v_user_id
  ) RETURNING id INTO v_txn_id;

  UPDATE public.journal_entries
  SET transaction_id = v_txn_id
  WHERE id = v_journal_id;

  INSERT INTO public.audit_logs (
    organization_id, actor_user_id, entity_type, entity_id,
    action, after_data
  ) VALUES (
    p_organization_id, v_user_id, 'transaction', v_txn_id,
    'create', jsonb_build_object(
      'transaction_type', 'opening_cash_balance',
      'amount', p_amount
    )
  );

  RETURN jsonb_build_object(
    'journal_entry_id',   v_journal_id,
    'transaction_id',     v_txn_id,
    'transaction_number', v_txn_number,
    'success',            true
  );
END;
$$;


ALTER FUNCTION "public"."post_opening_balance"("p_organization_id" "uuid", "p_account_id" "uuid", "p_amount" numeric, "p_description" "text", "p_entry_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."post_transaction"("p_organization_id" "uuid", "p_transaction_date" "date", "p_transaction_type" "text", "p_amount" numeric, "p_party_id" "uuid" DEFAULT NULL::"uuid", "p_category_name" "text" DEFAULT NULL::"text", "p_cash_account_id" "uuid" DEFAULT NULL::"uuid", "p_destination_cash_account_id" "uuid" DEFAULT NULL::"uuid", "p_payment_status" "text" DEFAULT 'paid'::"text", "p_partial_amount" numeric DEFAULT NULL::numeric, "p_due_date" "date" DEFAULT NULL::"date", "p_description" "text" DEFAULT ''::"text", "p_notes" "text" DEFAULT NULL::"text", "p_product_id" "uuid" DEFAULT NULL::"uuid", "p_quantity" numeric DEFAULT NULL::numeric, "p_unit_price" numeric DEFAULT NULL::numeric, "p_debit_account_id" "uuid" DEFAULT NULL::"uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_user_id            UUID;
  v_role               TEXT;
  v_plan               TEXT;
  v_txn_count          INTEGER;
  v_books_start_date   DATE;
  v_account_type       TEXT;
  v_is_cash_account    BOOLEAN;
  v_debit_account_id   UUID;
  v_credit_account_id  UUID;
  v_receivable_acct_id UUID;
  v_payable_acct_id    UUID;
  v_debit_account_name TEXT;
  v_credit_account_name TEXT;
  v_debit_normal       TEXT;
  v_credit_normal      TEXT;
  v_journal_id         UUID;
  v_transaction_id     UUID;
  v_txn_number         TEXT;
  v_entry_number       TEXT;
  v_impact             JSONB := '{}'::JSONB;
  v_line_order         INTEGER := 0;
  v_remaining_amount   NUMERIC;
  v_product_org_id     UUID;
  v_product_purchase_price NUMERIC;
  v_cogs_account_id    UUID;
  v_inventory_account_id UUID;
  v_cogs_amount        NUMERIC;
BEGIN
  -- ── Auth ──
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Autentikasi diperlukan';
  END IF;

  -- ── Membership ──
  SELECT role::TEXT INTO v_role
  FROM public.organization_members
  WHERE organization_id = p_organization_id
    AND user_id = v_user_id
    AND status = 'active'
  LIMIT 1;

  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Anda bukan anggota organisasi ini';
  END IF;

  IF NOT public.has_permission(p_organization_id, 'can_create_transaction') THEN
    RAISE EXCEPTION 'Anda tidak memiliki izin untuk membuat transaksi';
  END IF;

  -- ═══════════════════════════════════════════════════════════════════
  --  PHASE 4 GUARD: Reject opening balance types
  -- ═══════════════════════════════════════════════════════════════════
  IF p_transaction_type IN (
    'opening_cash_balance',
    'opening_receivable_balance',
    'opening_payable_balance'
  ) THEN
    RAISE EXCEPTION 'Saldo awal tidak dapat dicatat melalui transaksi umum. Gunakan alur pemasangan saldo awal.';
  END IF;

  -- ── Org metadata ──
  SELECT books_start_date, current_plan::TEXT
  INTO v_books_start_date, v_plan
  FROM public.organizations
  WHERE id = p_organization_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Organisasi tidak ditemukan';
  END IF;

  IF p_transaction_date < v_books_start_date THEN
    RAISE EXCEPTION 'Tanggal transaksi % sebelum tanggal mulai pembukuan %',
      p_transaction_date, v_books_start_date;
  END IF;

  -- ── Plan limits ──
  IF v_plan = 'free' THEN
    v_txn_count := public.get_monthly_transaction_count(p_organization_id);
    IF v_txn_count >= 50 THEN
      RAISE EXCEPTION 'Batas transaksi paket Gratis tercapai (50 transaksi/bulan). Silakan upgrade.';
    END IF;
  END IF;

  -- ── Basic validation ──
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Nominal harus lebih dari 0';
  END IF;

  IF p_payment_status NOT IN ('paid', 'unpaid', 'partial') THEN
    RAISE EXCEPTION 'Status pembayaran tidak valid: %', p_payment_status;
  END IF;

  IF p_payment_status IN ('unpaid', 'partial')
     AND p_transaction_type NOT IN ('credit_sale', 'credit_purchase') THEN
    RAISE EXCEPTION 'Status belum dibayar atau sebagian hanya valid untuk transaksi kredit';
  END IF;

  IF p_transaction_type IN ('credit_sale', 'credit_purchase')
     AND p_payment_status = 'paid' THEN
    RAISE EXCEPTION 'Gunakan transaksi tunai untuk penjualan atau pembelian yang sudah lunas';
  END IF;

  IF p_payment_status = 'partial' THEN
    IF p_partial_amount IS NULL OR p_partial_amount <= 0 THEN
      RAISE EXCEPTION 'Nominal pembayaran sebagian harus lebih dari 0';
    END IF;
    IF p_partial_amount >= p_amount THEN
      RAISE EXCEPTION 'Nominal pembayaran sebagian harus lebih kecil dari total transaksi';
    END IF;
    IF p_cash_account_id IS NULL THEN
      RAISE EXCEPTION 'Akun kas/bank wajib diisi untuk pembayaran sebagian';
    END IF;
  END IF;

  -- ── Party validation ──
  IF p_transaction_type IN ('credit_sale', 'credit_purchase', 'receive_receivable', 'pay_payable')
     AND p_party_id IS NULL THEN
    RAISE EXCEPTION 'Pihak wajib dipilih untuk transaksi tipe %', p_transaction_type;
  END IF;

  IF p_party_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.parties
    WHERE id = p_party_id
      AND organization_id = p_organization_id
      AND is_active = true
  ) THEN
    RAISE EXCEPTION 'Pihak tidak ditemukan atau tidak aktif';
  END IF;

  -- ── Product validation ──
  IF p_product_id IS NOT NULL THEN
    IF p_transaction_type NOT IN ('cash_purchase', 'credit_purchase', 'cash_sale', 'credit_sale') THEN
      RAISE EXCEPTION 'Produk hanya dapat digunakan untuk transaksi penjualan atau pembelian';
    END IF;
    IF p_quantity IS NULL OR p_quantity <= 0 THEN
      RAISE EXCEPTION 'Kuantitas produk harus lebih dari 0';
    END IF;
    IF p_unit_price IS NULL OR p_unit_price < 0 THEN
      RAISE EXCEPTION 'Harga satuan produk tidak valid';
    END IF;
    IF ABS(p_amount - (p_quantity * p_unit_price)) > 0.01 THEN
      RAISE EXCEPTION 'Nominal transaksi harus sama dengan kuantitas dikali harga satuan';
    END IF;

    SELECT organization_id, purchase_price
    INTO v_product_org_id, v_product_purchase_price
    FROM public.products
    WHERE id = p_product_id
      AND is_active = true;

    IF NOT FOUND OR v_product_org_id != p_organization_id THEN
      RAISE EXCEPTION 'Produk tidak ditemukan dalam organisasi ini';
    END IF;

    IF p_transaction_type IN ('cash_sale', 'credit_sale') THEN
      PERFORM public.validate_product_sale_accounts(p_organization_id, p_product_id);
    END IF;
  END IF;

  -- ── Cash account required for certain types ──
  IF p_transaction_type IN (
    'cash_sale', 'receive_receivable', 'cash_purchase', 'pay_payable',
    'expense_payment', 'owner_capital', 'owner_draw', 'cash_transfer'
  ) AND p_cash_account_id IS NULL THEN
    RAISE EXCEPTION 'Akun kas/bank wajib diisi untuk transaksi tipe %', p_transaction_type;
  END IF;

  -- ── Cash account validation ──
  IF p_transaction_type != 'simple_adjustment' AND p_cash_account_id IS NOT NULL THEN
    SELECT account_type::TEXT, is_cash_account
    INTO v_account_type, v_is_cash_account
    FROM public.accounts
    WHERE id = p_cash_account_id
      AND organization_id = p_organization_id
      AND is_active = true;

    IF v_account_type IS NULL THEN
      RAISE EXCEPTION 'Akun kas/bank tidak ditemukan atau tidak aktif';
    END IF;
    IF v_account_type != 'asset' OR v_is_cash_account IS NOT TRUE THEN
      RAISE EXCEPTION 'Akun kas/bank harus akun aset yang ditandai sebagai akun kas/bank';
    END IF;
  END IF;

  -- ── Destination account validation ──
  IF p_destination_cash_account_id IS NOT NULL
     AND p_transaction_type NOT IN ('cash_transfer', 'simple_adjustment') THEN
    RAISE EXCEPTION 'Akun tujuan hanya boleh diisi untuk transfer kas atau penyesuaian';
  END IF;

  IF p_transaction_type = 'cash_transfer' THEN
    IF p_destination_cash_account_id IS NULL THEN
      RAISE EXCEPTION 'Akun tujuan wajib diisi untuk transfer kas';
    END IF;
    IF p_cash_account_id = p_destination_cash_account_id THEN
      RAISE EXCEPTION 'Akun sumber dan tujuan transfer harus berbeda';
    END IF;

    SELECT account_type::TEXT, is_cash_account
    INTO v_account_type, v_is_cash_account
    FROM public.accounts
    WHERE id = p_destination_cash_account_id
      AND organization_id = p_organization_id
      AND is_active = true;

    IF v_account_type IS NULL THEN
      RAISE EXCEPTION 'Akun tujuan tidak ditemukan atau tidak aktif';
    END IF;
    IF v_account_type != 'asset' OR v_is_cash_account IS NOT TRUE THEN
      RAISE EXCEPTION 'Akun tujuan harus akun aset yang ditandai sebagai akun kas/bank';
    END IF;
  END IF;

  -- ═══════════════════════════════════════════════════════════════════
  --  P0-3 FIX: simple_adjustment — validate both accounts exist,
  --  are active, and belong to this org.
  -- ═══════════════════════════════════════════════════════════════════
  IF p_transaction_type = 'simple_adjustment' THEN
    IF v_role != 'owner' THEN
      RAISE EXCEPTION 'Hanya owner yang dapat membuat penyesuaian manual';
    END IF;
    IF p_cash_account_id IS NULL OR p_destination_cash_account_id IS NULL THEN
      RAISE EXCEPTION 'Akun debit dan kredit wajib diisi untuk penyesuaian';
    END IF;
    IF p_cash_account_id = p_destination_cash_account_id THEN
      RAISE EXCEPTION 'Akun debit dan kredit tidak boleh sama untuk penyesuaian';
    END IF;

    -- Validate debit account
    SELECT account_type::TEXT, is_cash_account
    INTO v_account_type, v_is_cash_account
    FROM public.accounts
    WHERE id = p_cash_account_id
      AND organization_id = p_organization_id
      AND is_active = true;

    IF v_account_type IS NULL THEN
      RAISE EXCEPTION 'Akun debit tidak ditemukan atau tidak aktif dalam organisasi ini';
    END IF;

    -- Validate credit account
    SELECT account_type::TEXT, is_cash_account
    INTO v_account_type, v_is_cash_account
    FROM public.accounts
    WHERE id = p_destination_cash_account_id
      AND organization_id = p_organization_id
      AND is_active = true;

    IF v_account_type IS NULL THEN
      RAISE EXCEPTION 'Akun kredit tidak ditemukan atau tidak aktif dalam organisasi ini';
    END IF;
  END IF;

  -- ═══════════════════════════════════════════════════════════════════
  --  ACCOUNT RESOLUTION PER TRANSACTION TYPE
  -- ═══════════════════════════════════════════════════════════════════

  CASE p_transaction_type
    WHEN 'cash_sale' THEN
      v_debit_account_id   := p_cash_account_id;
      v_debit_account_name := 'Kas/Bank';
      SELECT id, name INTO v_credit_account_id, v_credit_account_name
      FROM public.accounts
      WHERE organization_id = p_organization_id
        AND account_type = 'revenue'
        AND is_active = true
        AND ((p_category_name IS NOT NULL AND name ILIKE '%' || replace(replace(replace(p_category_name, '\', '\\'), '%', '\%'), '_', '\_') || '%' ESCAPE '\') OR code = 4100)
      ORDER BY CASE WHEN p_category_name IS NOT NULL AND name ILIKE '%' || replace(replace(replace(p_category_name, '\', '\\'), '%', '\%'), '_', '\_') || '%' ESCAPE '\' THEN 0 ELSE 1 END, code
      LIMIT 1;

    WHEN 'credit_sale' THEN
      SELECT id INTO v_receivable_acct_id
      FROM public.accounts
      WHERE organization_id = p_organization_id AND code = 1200 AND is_active = true;

      IF p_payment_status = 'partial' THEN
        v_debit_account_id   := p_cash_account_id;
        v_debit_account_name := 'Kas/Bank + Piutang Usaha';
      ELSE
        v_debit_account_id   := v_receivable_acct_id;
        v_debit_account_name := 'Piutang Usaha';
      END IF;

      SELECT id, name INTO v_credit_account_id, v_credit_account_name
      FROM public.accounts
      WHERE organization_id = p_organization_id
        AND account_type = 'revenue'
        AND is_active = true
        AND ((p_category_name IS NOT NULL AND name ILIKE '%' || replace(replace(replace(p_category_name, '\', '\\'), '%', '\%'), '_', '\_') || '%' ESCAPE '\') OR code = 4100)
      ORDER BY CASE WHEN p_category_name IS NOT NULL AND name ILIKE '%' || replace(replace(replace(p_category_name, '\', '\\'), '%', '\%'), '_', '\_') || '%' ESCAPE '\' THEN 0 ELSE 1 END, code
      LIMIT 1;

    WHEN 'receive_receivable' THEN
      v_debit_account_id   := p_cash_account_id;
      v_debit_account_name := 'Kas/Bank';
      SELECT id INTO v_credit_account_id
      FROM public.accounts
      WHERE organization_id = p_organization_id AND code = 1200 AND is_active = true;
      v_credit_account_name := 'Piutang Usaha';

    WHEN 'cash_purchase' THEN
      IF p_product_id IS NOT NULL THEN
        SELECT id, name INTO v_debit_account_id, v_debit_account_name
        FROM public.accounts
        WHERE organization_id = p_organization_id AND code = 1300 AND is_active = true;
      ELSIF p_debit_account_id IS NOT NULL THEN
        SELECT id, name INTO v_debit_account_id, v_debit_account_name
        FROM public.accounts
        WHERE id = p_debit_account_id
          AND organization_id = p_organization_id
          AND account_type IN ('expense', 'cogs', 'asset')
          AND is_active = true;
      ELSE
        SELECT id, name INTO v_debit_account_id, v_debit_account_name
        FROM public.accounts
        WHERE organization_id = p_organization_id
          AND account_type IN ('expense', 'cogs', 'asset')
          AND is_active = true
          AND ((p_category_name IS NOT NULL AND name ILIKE '%' || replace(replace(replace(p_category_name, '\', '\\'), '%', '\%'), '_', '\_') || '%' ESCAPE '\') OR code = 5100)
        ORDER BY CASE WHEN p_category_name IS NOT NULL AND name ILIKE '%' || replace(replace(replace(p_category_name, '\', '\\'), '%', '\%'), '_', '\_') || '%' ESCAPE '\' THEN 0 ELSE 1 END, code
        LIMIT 1;
      END IF;
      v_credit_account_id   := p_cash_account_id;
      v_credit_account_name := 'Kas/Bank';

    WHEN 'credit_purchase' THEN
      IF p_product_id IS NOT NULL THEN
        SELECT id, name INTO v_debit_account_id, v_debit_account_name
        FROM public.accounts
        WHERE organization_id = p_organization_id AND code = 1300 AND is_active = true;
      ELSIF p_debit_account_id IS NOT NULL THEN
        SELECT id, name INTO v_debit_account_id, v_debit_account_name
        FROM public.accounts
        WHERE id = p_debit_account_id
          AND organization_id = p_organization_id
          AND account_type IN ('expense', 'cogs', 'asset')
          AND is_active = true;
      ELSE
        SELECT id, name INTO v_debit_account_id, v_debit_account_name
        FROM public.accounts
        WHERE organization_id = p_organization_id
          AND account_type IN ('expense', 'cogs', 'asset')
          AND is_active = true
          AND ((p_category_name IS NOT NULL AND name ILIKE '%' || replace(replace(replace(p_category_name, '\', '\\'), '%', '\%'), '_', '\_') || '%' ESCAPE '\') OR code = 5100)
        ORDER BY CASE WHEN p_category_name IS NOT NULL AND name ILIKE '%' || replace(replace(replace(p_category_name, '\', '\\'), '%', '\%'), '_', '\_') || '%' ESCAPE '\' THEN 0 ELSE 1 END, code
        LIMIT 1;
      END IF;

      SELECT id INTO v_payable_acct_id
      FROM public.accounts
      WHERE organization_id = p_organization_id AND code = 2100 AND is_active = true;

      IF p_payment_status = 'partial' THEN
        v_credit_account_id   := p_cash_account_id;
        v_credit_account_name := 'Kas/Bank + Utang Usaha';
      ELSE
        v_credit_account_id   := v_payable_acct_id;
        v_credit_account_name := 'Utang Usaha';
      END IF;

    WHEN 'pay_payable' THEN
      SELECT id INTO v_debit_account_id
      FROM public.accounts
      WHERE organization_id = p_organization_id AND code = 2100 AND is_active = true;
      v_debit_account_name  := 'Utang Usaha';
      v_credit_account_id   := p_cash_account_id;
      v_credit_account_name := 'Kas/Bank';

    WHEN 'expense_payment' THEN
      IF p_debit_account_id IS NOT NULL THEN
        SELECT id, name INTO v_debit_account_id, v_debit_account_name
        FROM public.accounts
        WHERE id = p_debit_account_id
          AND organization_id = p_organization_id
          AND account_type = 'expense'
          AND is_active = true;
      ELSE
        SELECT id, name INTO v_debit_account_id, v_debit_account_name
        FROM public.accounts
        WHERE organization_id = p_organization_id
          AND account_type = 'expense'
          AND is_active = true
          AND ((p_category_name IS NOT NULL AND name ILIKE '%' || replace(replace(replace(p_category_name, '\', '\\'), '%', '\%'), '_', '\_') || '%' ESCAPE '\') OR code = 6190)
        ORDER BY CASE WHEN p_category_name IS NOT NULL AND name ILIKE '%' || replace(replace(replace(p_category_name, '\', '\\'), '%', '\%'), '_', '\_') || '%' ESCAPE '\' THEN 0 ELSE 1 END, code
        LIMIT 1;
      END IF;
      v_credit_account_id   := p_cash_account_id;
      v_credit_account_name := 'Kas/Bank';

    WHEN 'owner_capital' THEN
      v_debit_account_id   := p_cash_account_id;
      v_debit_account_name := 'Kas/Bank';
      SELECT id INTO v_credit_account_id
      FROM public.accounts
      WHERE organization_id = p_organization_id AND code = 3100 AND is_active = true;
      v_credit_account_name := 'Modal Pemilik';

    WHEN 'owner_draw' THEN
      SELECT id INTO v_debit_account_id
      FROM public.accounts
      WHERE organization_id = p_organization_id AND code = 3300 AND is_active = true;
      v_debit_account_name  := 'Prive';
      v_credit_account_id   := p_cash_account_id;
      v_credit_account_name := 'Kas/Bank';

    WHEN 'cash_transfer' THEN
      v_debit_account_id   := p_destination_cash_account_id;
      v_debit_account_name := 'Tujuan Transfer';
      v_credit_account_id   := p_cash_account_id;
      v_credit_account_name := 'Sumber Transfer';

    WHEN 'simple_adjustment' THEN
      v_debit_account_id   := p_cash_account_id;
      v_debit_account_name := 'Rekening Debit';
      v_credit_account_id   := p_destination_cash_account_id;
      v_credit_account_name := 'Rekening Kredit';

    ELSE
      RAISE EXCEPTION 'Jenis transaksi tidak dikenal: %', p_transaction_type;
  END CASE;

  -- ── Account existence check ──
  IF v_debit_account_id IS NULL THEN
    RAISE EXCEPTION 'Akun debit tidak ditemukan untuk jenis transaksi %', p_transaction_type;
  END IF;
  IF v_credit_account_id IS NULL THEN
    RAISE EXCEPTION 'Akun kredit tidak ditemukan untuk jenis transaksi %', p_transaction_type;
  END IF;

  -- ═══════════════════════════════════════════════════════════════════
  --  JOURNAL ENTRY + LINES (inserted atomically)
  -- ═══════════════════════════════════════════════════════════════════

  v_entry_number := public.generate_entry_number(p_organization_id);

  INSERT INTO public.journal_entries (
    organization_id, entry_number, entry_date, entry_type,
    description, status, posted_at, posted_by
  ) VALUES (
    p_organization_id,
    v_entry_number,
    p_transaction_date,
    'normal'::public.journal_entry_type,
    p_description,
    'posted',
    now(),
    v_user_id
  ) RETURNING id INTO v_journal_id;

  -- ── Credit-sale partial: split into cash + receivable ──
  IF p_transaction_type = 'credit_sale' AND p_payment_status = 'partial' THEN
    v_remaining_amount := p_amount - p_partial_amount;
    v_line_order := v_line_order + 1;
    INSERT INTO public.journal_lines (organization_id, journal_entry_id, account_id, party_id, debit, credit, description, line_order)
    VALUES (p_organization_id, v_journal_id, p_cash_account_id, p_party_id, p_partial_amount, 0, p_description, v_line_order);
    v_line_order := v_line_order + 1;
    INSERT INTO public.journal_lines (organization_id, journal_entry_id, account_id, party_id, debit, credit, description, line_order)
    VALUES (p_organization_id, v_journal_id, v_receivable_acct_id, p_party_id, v_remaining_amount, 0, 'Sisa piutang: ' || p_description, v_line_order);
  ELSE
    v_line_order := v_line_order + 1;
    INSERT INTO public.journal_lines (organization_id, journal_entry_id, account_id, party_id, debit, credit, description, line_order)
    VALUES (p_organization_id, v_journal_id, v_debit_account_id, p_party_id, p_amount, 0, p_description, v_line_order);
  END IF;

  -- ── Credit-purchase partial: split into cash + payable ──
  IF p_transaction_type = 'credit_purchase' AND p_payment_status = 'partial' THEN
    v_remaining_amount := p_amount - p_partial_amount;
    v_line_order := v_line_order + 1;
    INSERT INTO public.journal_lines (organization_id, journal_entry_id, account_id, party_id, debit, credit, description, line_order)
    VALUES (p_organization_id, v_journal_id, p_cash_account_id, p_party_id, 0, p_partial_amount, p_description, v_line_order);
    v_line_order := v_line_order + 1;
    INSERT INTO public.journal_lines (organization_id, journal_entry_id, account_id, party_id, debit, credit, description, line_order)
    VALUES (p_organization_id, v_journal_id, v_payable_acct_id, p_party_id, 0, v_remaining_amount, 'Sisa utang: ' || p_description, v_line_order);
  ELSE
    v_line_order := v_line_order + 1;
    INSERT INTO public.journal_lines (organization_id, journal_entry_id, account_id, party_id, debit, credit, description, line_order)
    VALUES (p_organization_id, v_journal_id, v_credit_account_id, p_party_id, 0, p_amount, p_description, v_line_order);
  END IF;

  -- ── P3-18: Journal balance check (penny-exact) ──
  IF (
    SELECT ABS(COALESCE(SUM(debit), 0) - COALESCE(SUM(credit), 0))
    FROM public.journal_lines
    WHERE journal_entry_id = v_journal_id
  ) <> 0 THEN
    RAISE EXCEPTION 'Jurnal tidak seimbang';
  END IF;

  -- ═══════════════════════════════════════════════════════════════════
  --  TRANSACTION RECORD
  -- ═══════════════════════════════════════════════════════════════════

  v_txn_number := public.generate_transaction_number(p_organization_id, p_transaction_date);

  INSERT INTO public.transactions (
    organization_id, transaction_number, transaction_date,
    transaction_type, amount, party_id, category_name,
    cash_account_id, destination_cash_account_id,
    payment_status, due_date, description, notes,
    status, posted_at, posted_by, created_by,
    product_id, quantity, unit_price
  ) VALUES (
    p_organization_id, v_txn_number, p_transaction_date,
    p_transaction_type, p_amount, p_party_id, p_category_name,
    p_cash_account_id, p_destination_cash_account_id,
    p_payment_status::public.payment_status, p_due_date,
    p_description,
    CASE
      WHEN p_partial_amount IS NOT NULL AND p_payment_status = 'partial' THEN
        COALESCE(p_notes, '') ||
        (CASE WHEN p_notes IS NOT NULL AND p_notes != '' THEN E'\n' ELSE '' END) ||
        'Dibayar sebagian: ' || p_partial_amount::TEXT
      ELSE p_notes
    END,
    'posted', now(), v_user_id, v_user_id,
    p_product_id, p_quantity, p_unit_price
  ) RETURNING id, transaction_number INTO v_transaction_id, v_txn_number;

  UPDATE public.journal_entries
  SET transaction_id = v_transaction_id
  WHERE id = v_journal_id;

  -- ═══════════════════════════════════════════════════════════════════
  --  PRODUCT: STOCK MOVEMENTS + COGS
  --  P0-5: Stock movement always recorded for quantity tracking.
  --  COGS journal only when cost > 0 (zero-cost = no economic event).
  -- ═══════════════════════════════════════════════════════════════════

  IF p_product_id IS NOT NULL THEN
    IF p_transaction_type IN ('cash_purchase', 'credit_purchase') THEN
      PERFORM public.record_stock_movement(
        p_organization_id, p_product_id, p_transaction_date,
        'purchase', p_quantity, p_unit_price,
        v_transaction_id,
        p_description
      );
      PERFORM public.recalculate_product_average_cost(p_product_id);

    ELSIF p_transaction_type IN ('cash_sale', 'credit_sale') THEN
      v_cogs_amount := COALESCE(v_product_purchase_price, 0) * p_quantity;

      -- P0-5: Post COGS journal only when cost > 0
      IF v_cogs_amount <> 0 THEN
        v_cogs_account_id    := public.get_account_by_code(p_organization_id, 5100);
        v_inventory_account_id := public.get_account_by_code(p_organization_id, 1300);

        IF v_cogs_account_id IS NOT NULL AND v_inventory_account_id IS NOT NULL THEN
          DECLARE
            v_cogs_entry_number TEXT;
            v_cogs_journal_id   UUID;
          BEGIN
            v_cogs_entry_number := public.generate_entry_number(p_organization_id);
            INSERT INTO public.journal_entries (
              organization_id, entry_number, entry_date, entry_type,
              transaction_id, description, status, posted_at, posted_by
            ) VALUES (
              p_organization_id, v_cogs_entry_number, p_transaction_date, 'normal',
              v_transaction_id, 'HPP: ' || p_description, 'posted', now(), v_user_id
            ) RETURNING id INTO v_cogs_journal_id;

            INSERT INTO public.journal_lines (
              organization_id, journal_entry_id, account_id,
              debit, credit, description, line_order
            ) VALUES
              (p_organization_id, v_cogs_journal_id, v_cogs_account_id,
               v_cogs_amount, 0, 'HPP: ' || p_description, 1),
              (p_organization_id, v_cogs_journal_id, v_inventory_account_id,
               0, v_cogs_amount, 'HPP: ' || p_description, 2);
          END;
        END IF;
      END IF;

      PERFORM public.record_stock_movement(
        p_organization_id, p_product_id, p_transaction_date,
        'sale', -p_quantity, COALESCE(v_product_purchase_price, 0),
        v_transaction_id,
        p_description
      );
    END IF;
  END IF;

  -- ═══════════════════════════════════════════════════════════════════
  --  IMPACT + AUDIT + RETURN
  -- ═══════════════════════════════════════════════════════════════════

  SELECT normal_balance::TEXT INTO v_debit_normal
  FROM public.accounts WHERE id = v_debit_account_id;
  SELECT normal_balance::TEXT INTO v_credit_normal
  FROM public.accounts WHERE id = v_credit_account_id;

  v_impact := jsonb_build_object(
    'debit_account_id',  v_debit_account_id,
    'debit_account',     COALESCE(v_debit_account_name, 'Debit'),
    'debit_change',      CASE WHEN v_debit_normal = 'debit' THEN 'increase' ELSE 'decrease' END,
    'credit_account_id', v_credit_account_id,
    'credit_account',    COALESCE(v_credit_account_name, 'Credit'),
    'credit_change',     CASE WHEN v_credit_normal = 'credit' THEN 'increase' ELSE 'decrease' END,
    'amount',            p_amount
  );

  INSERT INTO public.audit_logs (
    organization_id, actor_user_id, entity_type, entity_id,
    action, after_data
  ) VALUES (
    p_organization_id, v_user_id, 'transaction', v_transaction_id,
    'post', jsonb_build_object(
      'transaction_type', p_transaction_type,
      'amount',           p_amount,
      'journal_entry_id', v_journal_id,
      'product_id',       p_product_id
    )
  );

  RETURN jsonb_build_object(
    'transaction_id',     v_transaction_id,
    'transaction_number', v_txn_number,
    'journal_entry_id',   v_journal_id,
    'entry_number',       v_entry_number,
    'impact',             v_impact
  );
END;
$$;


ALTER FUNCTION "public"."post_transaction"("p_organization_id" "uuid", "p_transaction_date" "date", "p_transaction_type" "text", "p_amount" numeric, "p_party_id" "uuid", "p_category_name" "text", "p_cash_account_id" "uuid", "p_destination_cash_account_id" "uuid", "p_payment_status" "text", "p_partial_amount" numeric, "p_due_date" "date", "p_description" "text", "p_notes" "text", "p_product_id" "uuid", "p_quantity" numeric, "p_unit_price" numeric, "p_debit_account_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."post_transaction_impl_20260702"("p_organization_id" "uuid", "p_transaction_date" "date", "p_transaction_type" "text", "p_amount" numeric, "p_party_id" "uuid" DEFAULT NULL::"uuid", "p_category_name" "text" DEFAULT NULL::"text", "p_cash_account_id" "uuid" DEFAULT NULL::"uuid", "p_destination_cash_account_id" "uuid" DEFAULT NULL::"uuid", "p_payment_status" "text" DEFAULT 'paid'::"text", "p_partial_amount" numeric DEFAULT NULL::numeric, "p_due_date" "date" DEFAULT NULL::"date", "p_description" "text" DEFAULT ''::"text", "p_notes" "text" DEFAULT NULL::"text", "p_product_id" "uuid" DEFAULT NULL::"uuid", "p_quantity" numeric DEFAULT NULL::numeric, "p_unit_price" numeric DEFAULT NULL::numeric) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_user_id UUID;
  v_role TEXT;
  v_plan TEXT;
  v_txn_count INTEGER;
  v_debit_account_id UUID;
  v_credit_account_id UUID;
  v_receivable_account_id UUID;
  v_payable_account_id UUID;
  v_debit_account_name TEXT;
  v_credit_account_name TEXT;
  v_journal_id UUID;
  v_txn_id UUID;
  v_txn_number TEXT;
  v_entry_number TEXT;
  v_impact JSONB := '{}'::JSONB;
  v_line_order INTEGER := 0;
  v_remaining_amount NUMERIC;
  v_product_purchase_price NUMERIC;
  v_product_org_id UUID;
  v_cogs_account_id UUID;
  v_inventory_account_id UUID;
  v_cogs_amount NUMERIC;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT role::TEXT INTO v_role
  FROM public.organization_members
  WHERE organization_id = p_organization_id
    AND user_id = v_user_id
    AND status = 'active';

  IF v_role IS NULL THEN
    RAISE EXCEPTION 'You are not a member of this organization';
  END IF;

  IF v_role = 'staff'
     AND NOT public.has_permission(p_organization_id, 'can_create_transaction') THEN
    RAISE EXCEPTION 'You do not have permission to create transactions';
  END IF;

  SELECT current_plan INTO v_plan
  FROM public.organizations
  WHERE id = p_organization_id;

  IF v_plan = 'free' THEN
    v_txn_count := public.get_monthly_transaction_count(p_organization_id);
    IF v_txn_count >= 50 THEN
      RAISE EXCEPTION 'Free plan limit reached (50 transactions/month). Please upgrade.';
    END IF;
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be positive';
  END IF;

  IF p_payment_status NOT IN ('paid', 'unpaid', 'partial') THEN
    RAISE EXCEPTION 'Invalid payment status: %', p_payment_status;
  END IF;

  IF p_payment_status IN ('unpaid', 'partial')
     AND p_transaction_type NOT IN ('credit_sale', 'credit_purchase') THEN
    RAISE EXCEPTION 'Unpaid or partial payment status is only valid for credit sale or credit purchase transactions';
  END IF;

  IF p_transaction_type IN ('credit_sale', 'credit_purchase')
     AND p_payment_status = 'paid' THEN
    RAISE EXCEPTION 'Use cash sale or cash purchase for fully paid transactions';
  END IF;

  IF p_payment_status = 'partial' THEN
    IF p_partial_amount IS NULL OR p_partial_amount <= 0 THEN
      RAISE EXCEPTION 'Partial payment amount must be positive';
    END IF;
    IF p_partial_amount >= p_amount THEN
      RAISE EXCEPTION 'Partial payment amount must be less than total amount';
    END IF;
    IF p_cash_account_id IS NULL THEN
      RAISE EXCEPTION 'Cash/bank account is required for partial payments';
    END IF;
  END IF;

  IF p_cash_account_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.accounts
    WHERE id = p_cash_account_id
      AND organization_id = p_organization_id
      AND is_active = true
  ) THEN
    RAISE EXCEPTION 'Cash/bank account does not belong to this organization';
  END IF;

  IF p_destination_cash_account_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.accounts
    WHERE id = p_destination_cash_account_id
      AND organization_id = p_organization_id
      AND is_active = true
  ) THEN
    RAISE EXCEPTION 'Destination cash/bank account does not belong to this organization';
  END IF;

  IF p_transaction_type IN (
    'cash_sale', 'receive_receivable', 'cash_purchase', 'pay_payable',
    'expense_payment', 'owner_capital', 'owner_draw', 'cash_transfer',
    'opening_cash_balance'
  ) AND p_cash_account_id IS NULL THEN
    RAISE EXCEPTION 'Cash/bank account is required for transaction type %', p_transaction_type;
  END IF;

  IF p_transaction_type = 'cash_transfer' THEN
    IF p_destination_cash_account_id IS NULL THEN
      RAISE EXCEPTION 'Destination cash/bank account is required for cash transfers';
    END IF;
    IF p_cash_account_id = p_destination_cash_account_id THEN
      RAISE EXCEPTION 'Source and destination cash/bank accounts must be different';
    END IF;
  END IF;

  IF p_product_id IS NOT NULL THEN
    IF p_transaction_type NOT IN ('cash_purchase', 'credit_purchase', 'cash_sale', 'credit_sale') THEN
      RAISE EXCEPTION 'Products can only be used in sale or purchase transactions';
    END IF;
    IF p_quantity IS NULL OR p_quantity <= 0 THEN
      RAISE EXCEPTION 'Product quantity must be positive';
    END IF;
    IF p_unit_price IS NULL OR p_unit_price < 0 THEN
      RAISE EXCEPTION 'Product unit price must be zero or positive';
    END IF;
    IF ABS(p_amount - (p_quantity * p_unit_price)) > 0.01 THEN
      RAISE EXCEPTION 'Transaction amount must equal quantity times unit price';
    END IF;

    SELECT organization_id, purchase_price
    INTO v_product_org_id, v_product_purchase_price
    FROM public.products
    WHERE id = p_product_id
      AND is_active = true;

    IF NOT FOUND OR v_product_org_id != p_organization_id THEN
      RAISE EXCEPTION 'Product does not belong to this organization';
    END IF;
  END IF;

  CASE p_transaction_type
    WHEN 'opening_cash_balance' THEN
      v_debit_account_id := p_cash_account_id;
      SELECT id INTO v_credit_account_id
      FROM public.accounts WHERE organization_id = p_organization_id AND code = 3200;
      v_debit_account_name := 'Kas/Bank';
      v_credit_account_name := 'Saldo Awal';

    WHEN 'opening_receivable_balance' THEN
      SELECT id INTO v_debit_account_id
      FROM public.accounts WHERE organization_id = p_organization_id AND code = 1200;
      SELECT id INTO v_credit_account_id
      FROM public.accounts WHERE organization_id = p_organization_id AND code = 3200;
      v_debit_account_name := 'Piutang Usaha';
      v_credit_account_name := 'Saldo Awal';

    WHEN 'opening_payable_balance' THEN
      SELECT id INTO v_credit_account_id
      FROM public.accounts WHERE organization_id = p_organization_id AND code = 2100;
      SELECT id INTO v_debit_account_id
      FROM public.accounts WHERE organization_id = p_organization_id AND code = 3200;
      v_debit_account_name := 'Saldo Awal';
      v_credit_account_name := 'Utang Usaha';

    WHEN 'cash_sale' THEN
      v_debit_account_id := p_cash_account_id;
      v_debit_account_name := 'Kas/Bank';
      SELECT id, name INTO v_credit_account_id, v_credit_account_name
      FROM public.accounts
      WHERE organization_id = p_organization_id
        AND account_type = 'revenue'
        AND is_active = true
        AND ((p_category_name IS NOT NULL AND name ILIKE '%' || replace(replace(replace(p_category_name, '\', '\\'), '%', '\%'), '_', '\_') || '%' ESCAPE '\') OR code = 4100)
      ORDER BY CASE WHEN p_category_name IS NOT NULL AND name ILIKE '%' || replace(replace(replace(p_category_name, '\', '\\'), '%', '\%'), '_', '\_') || '%' ESCAPE '\' THEN 0 ELSE 1 END, code
      LIMIT 1;

    WHEN 'credit_sale' THEN
      SELECT id INTO v_receivable_account_id
      FROM public.accounts WHERE organization_id = p_organization_id AND code = 1200;
      IF p_payment_status = 'partial' THEN
        v_debit_account_id := p_cash_account_id;
        v_debit_account_name := 'Kas/Bank + Piutang Usaha';
      ELSE
        v_debit_account_id := v_receivable_account_id;
        v_debit_account_name := 'Piutang Usaha';
      END IF;
      SELECT id, name INTO v_credit_account_id, v_credit_account_name
      FROM public.accounts
      WHERE organization_id = p_organization_id
        AND account_type = 'revenue'
        AND is_active = true
        AND ((p_category_name IS NOT NULL AND name ILIKE '%' || replace(replace(replace(p_category_name, '\', '\\'), '%', '\%'), '_', '\_') || '%' ESCAPE '\') OR code = 4100)
      ORDER BY CASE WHEN p_category_name IS NOT NULL AND name ILIKE '%' || replace(replace(replace(p_category_name, '\', '\\'), '%', '\%'), '_', '\_') || '%' ESCAPE '\' THEN 0 ELSE 1 END, code
      LIMIT 1;

    WHEN 'receive_receivable' THEN
      v_debit_account_id := p_cash_account_id;
      v_debit_account_name := 'Kas/Bank';
      SELECT id INTO v_credit_account_id
      FROM public.accounts WHERE organization_id = p_organization_id AND code = 1200;
      v_credit_account_name := 'Piutang Usaha';

    WHEN 'cash_purchase' THEN
      IF p_product_id IS NOT NULL THEN
        SELECT id INTO v_debit_account_id
        FROM public.accounts WHERE organization_id = p_organization_id AND code = 1300;
        v_debit_account_name := 'Persediaan';
      ELSE
        SELECT id, name INTO v_debit_account_id, v_debit_account_name
        FROM public.accounts
        WHERE organization_id = p_organization_id
          AND account_type IN ('expense', 'cogs', 'asset')
          AND is_active = true
          AND ((p_category_name IS NOT NULL AND name ILIKE '%' || replace(replace(replace(p_category_name, '\', '\\'), '%', '\%'), '_', '\_') || '%' ESCAPE '\') OR code = 5100)
        ORDER BY CASE WHEN p_category_name IS NOT NULL AND name ILIKE '%' || replace(replace(replace(p_category_name, '\', '\\'), '%', '\%'), '_', '\_') || '%' ESCAPE '\' THEN 0 ELSE 1 END, code
        LIMIT 1;
      END IF;
      v_credit_account_id := p_cash_account_id;
      v_credit_account_name := 'Kas/Bank';

    WHEN 'credit_purchase' THEN
      IF p_product_id IS NOT NULL THEN
        SELECT id INTO v_debit_account_id
        FROM public.accounts WHERE organization_id = p_organization_id AND code = 1300;
        v_debit_account_name := 'Persediaan';
      ELSE
        SELECT id, name INTO v_debit_account_id, v_debit_account_name
        FROM public.accounts
        WHERE organization_id = p_organization_id
          AND account_type IN ('expense', 'cogs', 'asset')
          AND is_active = true
          AND ((p_category_name IS NOT NULL AND name ILIKE '%' || replace(replace(replace(p_category_name, '\', '\\'), '%', '\%'), '_', '\_') || '%' ESCAPE '\') OR code = 5100)
        ORDER BY CASE WHEN p_category_name IS NOT NULL AND name ILIKE '%' || replace(replace(replace(p_category_name, '\', '\\'), '%', '\%'), '_', '\_') || '%' ESCAPE '\' THEN 0 ELSE 1 END, code
        LIMIT 1;
      END IF;
      SELECT id INTO v_payable_account_id
      FROM public.accounts WHERE organization_id = p_organization_id AND code = 2100;
      IF p_payment_status = 'partial' THEN
        v_credit_account_id := p_cash_account_id;
        v_credit_account_name := 'Kas/Bank + Utang Usaha';
      ELSE
        v_credit_account_id := v_payable_account_id;
        v_credit_account_name := 'Utang Usaha';
      END IF;

    WHEN 'pay_payable' THEN
      SELECT id INTO v_debit_account_id
      FROM public.accounts WHERE organization_id = p_organization_id AND code = 2100;
      v_debit_account_name := 'Utang Usaha';
      v_credit_account_id := p_cash_account_id;
      v_credit_account_name := 'Kas/Bank';

    WHEN 'expense_payment' THEN
      SELECT id, name INTO v_debit_account_id, v_debit_account_name
      FROM public.accounts
      WHERE organization_id = p_organization_id
        AND account_type = 'expense'
        AND is_active = true
        AND ((p_category_name IS NOT NULL AND name ILIKE '%' || replace(replace(replace(p_category_name, '\', '\\'), '%', '\%'), '_', '\_') || '%' ESCAPE '\') OR code = 6190)
      ORDER BY CASE WHEN p_category_name IS NOT NULL AND name ILIKE '%' || replace(replace(replace(p_category_name, '\', '\\'), '%', '\%'), '_', '\_') || '%' ESCAPE '\' THEN 0 ELSE 1 END, code
      LIMIT 1;
      v_credit_account_id := p_cash_account_id;
      v_credit_account_name := 'Kas/Bank';

    WHEN 'owner_capital' THEN
      v_debit_account_id := p_cash_account_id;
      v_debit_account_name := 'Kas/Bank';
      SELECT id INTO v_credit_account_id
      FROM public.accounts WHERE organization_id = p_organization_id AND code = 3100;
      v_credit_account_name := 'Modal Pemilik';

    WHEN 'owner_draw' THEN
      SELECT id INTO v_debit_account_id
      FROM public.accounts WHERE organization_id = p_organization_id AND code = 3300;
      v_debit_account_name := 'Prive';
      v_credit_account_id := p_cash_account_id;
      v_credit_account_name := 'Kas/Bank';

    WHEN 'cash_transfer' THEN
      v_debit_account_id := p_destination_cash_account_id;
      v_debit_account_name := 'Tujuan Transfer';
      v_credit_account_id := p_cash_account_id;
      v_credit_account_name := 'Sumber Transfer';

    WHEN 'simple_adjustment' THEN
      IF v_role != 'owner' THEN
        RAISE EXCEPTION 'Only owners can create manual adjustments';
      END IF;
      v_debit_account_id := p_cash_account_id;
      v_debit_account_name := 'Rekening Debit';
      v_credit_account_id := p_destination_cash_account_id;
      v_credit_account_name := 'Rekening Kredit';

    ELSE
      RAISE EXCEPTION 'Unknown transaction type: %', p_transaction_type;
  END CASE;

  IF v_debit_account_id IS NULL THEN
    RAISE EXCEPTION 'Debit account not found for transaction type %', p_transaction_type;
  END IF;
  IF v_credit_account_id IS NULL THEN
    RAISE EXCEPTION 'Credit account not found for transaction type %', p_transaction_type;
  END IF;

  v_entry_number := public.generate_entry_number(p_organization_id);

  INSERT INTO public.journal_entries (
    organization_id, entry_number, entry_date, entry_type,
    description, status, posted_at, posted_by
  ) VALUES (
    p_organization_id,
    v_entry_number,
    p_transaction_date,
    CASE
      WHEN p_transaction_type LIKE 'opening_%' THEN 'opening_balance'::public.journal_entry_type
      ELSE 'normal'::public.journal_entry_type
    END,
    p_description,
    'posted',
    now(),
    v_user_id
  ) RETURNING id INTO v_journal_id;

  IF p_transaction_type = 'credit_sale' AND p_payment_status = 'partial' THEN
    v_remaining_amount := p_amount - p_partial_amount;

    v_line_order := v_line_order + 1;
    INSERT INTO public.journal_lines (
      organization_id, journal_entry_id, account_id, party_id,
      debit, credit, description, line_order
    ) VALUES (
      p_organization_id, v_journal_id, p_cash_account_id, p_party_id,
      p_partial_amount, 0, p_description, v_line_order
    );

    v_line_order := v_line_order + 1;
    INSERT INTO public.journal_lines (
      organization_id, journal_entry_id, account_id, party_id,
      debit, credit, description, line_order
    ) VALUES (
      p_organization_id, v_journal_id, v_receivable_account_id, p_party_id,
      v_remaining_amount, 0, 'Sisa piutang: ' || p_description, v_line_order
    );
  ELSE
    v_line_order := v_line_order + 1;
    INSERT INTO public.journal_lines (
      organization_id, journal_entry_id, account_id, party_id,
      debit, credit, description, line_order
    ) VALUES (
      p_organization_id, v_journal_id, v_debit_account_id, p_party_id,
      p_amount, 0, p_description, v_line_order
    );
  END IF;

  IF p_transaction_type = 'credit_purchase' AND p_payment_status = 'partial' THEN
    v_remaining_amount := p_amount - p_partial_amount;

    v_line_order := v_line_order + 1;
    INSERT INTO public.journal_lines (
      organization_id, journal_entry_id, account_id, party_id,
      debit, credit, description, line_order
    ) VALUES (
      p_organization_id, v_journal_id, p_cash_account_id, p_party_id,
      0, p_partial_amount, p_description, v_line_order
    );

    v_line_order := v_line_order + 1;
    INSERT INTO public.journal_lines (
      organization_id, journal_entry_id, account_id, party_id,
      debit, credit, description, line_order
    ) VALUES (
      p_organization_id, v_journal_id, v_payable_account_id, p_party_id,
      0, v_remaining_amount, 'Sisa utang: ' || p_description, v_line_order
    );
  ELSE
    v_line_order := v_line_order + 1;
    INSERT INTO public.journal_lines (
      organization_id, journal_entry_id, account_id, party_id,
      debit, credit, description, line_order
    ) VALUES (
      p_organization_id, v_journal_id, v_credit_account_id, p_party_id,
      0, p_amount, p_description, v_line_order
    );
  END IF;

  IF (
    SELECT ABS(COALESCE(SUM(debit), 0) - COALESCE(SUM(credit), 0))
    FROM public.journal_lines
    WHERE journal_entry_id = v_journal_id
  ) > 0.01 THEN
    RAISE EXCEPTION 'Journal is not balanced';
  END IF;

  v_txn_number := public.generate_transaction_number(p_organization_id);

  INSERT INTO public.transactions (
    organization_id, transaction_number, transaction_date,
    transaction_type, amount, party_id, category_name,
    cash_account_id, destination_cash_account_id,
    payment_status, due_date, description, notes,
    status, posted_at, posted_by, created_by,
    product_id, quantity, unit_price
  ) VALUES (
    p_organization_id,
    v_txn_number,
    p_transaction_date,
    p_transaction_type,
    p_amount,
    p_party_id,
    p_category_name,
    p_cash_account_id,
    p_destination_cash_account_id,
    p_payment_status::public.payment_status,
    p_due_date,
    p_description,
    CASE
      WHEN p_partial_amount IS NOT NULL AND p_payment_status = 'partial' THEN
        COALESCE(p_notes, '') ||
        (CASE WHEN p_notes IS NOT NULL AND p_notes != '' THEN E'\n' ELSE '' END) ||
        'Dibayar sebagian: ' || p_partial_amount::TEXT
      ELSE p_notes
    END,
    'posted',
    now(),
    v_user_id,
    v_user_id,
    p_product_id,
    p_quantity,
    p_unit_price
  ) RETURNING id INTO v_txn_id;

  UPDATE public.journal_entries
  SET transaction_id = v_txn_id
  WHERE id = v_journal_id;

  IF p_product_id IS NOT NULL THEN
    IF p_transaction_type IN ('cash_purchase', 'credit_purchase') THEN
      PERFORM public.record_stock_movement(
        p_organization_id,
        p_product_id,
        p_transaction_date,
        'purchase',
        p_quantity,
        p_unit_price,
        v_txn_id,
        p_description
      );
    ELSIF p_transaction_type IN ('cash_sale', 'credit_sale') THEN
      v_cogs_amount := COALESCE(v_product_purchase_price, 0) * p_quantity;

      IF v_cogs_amount > 0 THEN
        SELECT id INTO v_cogs_account_id
        FROM public.accounts
        WHERE organization_id = p_organization_id
          AND code = 5100;

        SELECT id INTO v_inventory_account_id
        FROM public.accounts
        WHERE organization_id = p_organization_id
          AND code = 1300;

        IF v_cogs_account_id IS NOT NULL AND v_inventory_account_id IS NOT NULL THEN
          DECLARE
            v_cogs_entry_number TEXT;
            v_cogs_journal_id UUID;
          BEGIN
            v_cogs_entry_number := public.generate_entry_number(p_organization_id);

            INSERT INTO public.journal_entries (
              organization_id, entry_number, entry_date, entry_type,
              transaction_id, description, status, posted_at, posted_by
            ) VALUES (
              p_organization_id,
              v_cogs_entry_number,
              p_transaction_date,
              'normal',
              v_txn_id,
              'HPP: ' || p_description,
              'posted',
              now(),
              v_user_id
            ) RETURNING id INTO v_cogs_journal_id;

            INSERT INTO public.journal_lines (
              organization_id, journal_entry_id, account_id,
              debit, credit, description, line_order
            ) VALUES
              (
                p_organization_id, v_cogs_journal_id, v_cogs_account_id,
                v_cogs_amount, 0, 'HPP: ' || p_description, 1
              ),
              (
                p_organization_id, v_cogs_journal_id, v_inventory_account_id,
                0, v_cogs_amount, 'HPP: ' || p_description, 2
              );
          END;
        END IF;
      END IF;

      PERFORM public.record_stock_movement(
        p_organization_id,
        p_product_id,
        p_transaction_date,
        'sale',
        -p_quantity,
        COALESCE(v_product_purchase_price, 0),
        v_txn_id,
        p_description
      );
    END IF;
  END IF;

  v_impact := jsonb_build_object(
    'debit_account', COALESCE(v_debit_account_name, 'Debit'),
    'credit_account', COALESCE(v_credit_account_name, 'Credit'),
    'debit_change', 'increase',
    'credit_change', CASE
      WHEN COALESCE(v_credit_account_name, '') ILIKE '%Kas%' THEN 'decrease'
      WHEN COALESCE(v_credit_account_name, '') ILIKE '%Piutang%' THEN 'decrease'
      ELSE 'increase'
    END
  );

  INSERT INTO public.audit_logs (
    organization_id, actor_user_id, entity_type, entity_id,
    action, after_data
  ) VALUES (
    p_organization_id, v_user_id, 'transaction', v_txn_id,
    'post', jsonb_build_object(
      'transaction_type', p_transaction_type,
      'amount', p_amount,
      'journal_entry_id', v_journal_id,
      'product_id', p_product_id
    )
  );

  RETURN jsonb_build_object(
    'transaction_id', v_txn_id,
    'transaction_number', v_txn_number,
    'journal_entry_id', v_journal_id,
    'entry_number', v_entry_number,
    'impact', v_impact
  );
END;
$$;


ALTER FUNCTION "public"."post_transaction_impl_20260702"("p_organization_id" "uuid", "p_transaction_date" "date", "p_transaction_type" "text", "p_amount" numeric, "p_party_id" "uuid", "p_category_name" "text", "p_cash_account_id" "uuid", "p_destination_cash_account_id" "uuid", "p_payment_status" "text", "p_partial_amount" numeric, "p_due_date" "date", "p_description" "text", "p_notes" "text", "p_product_id" "uuid", "p_quantity" numeric, "p_unit_price" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."protect_account_fields"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- Prevent changes to critical fields on system or locked accounts
  IF OLD.is_system = true OR OLD.is_locked = true THEN
    IF OLD.code IS DISTINCT FROM NEW.code THEN
      RAISE EXCEPTION 'Tidak dapat mengubah kode akun sistem atau terkunci';
    END IF;
    IF OLD.account_type IS DISTINCT FROM NEW.account_type THEN
      RAISE EXCEPTION 'Tidak dapat mengubah tipe akun sistem atau terkunci';
    END IF;
    IF OLD.normal_balance IS DISTINCT FROM NEW.normal_balance THEN
      RAISE EXCEPTION 'Tidak dapat mengubah normal balance akun sistem atau terkunci';
    END IF;
    IF OLD.is_cash_account IS DISTINCT FROM NEW.is_cash_account THEN
      RAISE EXCEPTION 'Tidak dapat mengubah status kas/bank akun sistem atau terkunci';
    END IF;
    IF OLD.parent_account_id IS DISTINCT FROM NEW.parent_account_id THEN
      RAISE EXCEPTION 'Tidak dapat mengubah parent akun sistem atau terkunci';
    END IF;
    -- Allow name update (display name change is safe)
    -- Allow is_active update (can deactivate system accounts if needed)
    -- Allow report_group update (cosmetic grouping change)
  END IF;

  -- P1-3: Block client changes to is_system / is_locked (only service_role)
  IF COALESCE(current_setting('request.jwt.claims', true)::json->>'role', '') IS DISTINCT FROM 'service_role' THEN
    IF OLD.is_system IS DISTINCT FROM NEW.is_system THEN
      RAISE EXCEPTION 'Tidak dapat mengubah status sistem akun';
    END IF;
    IF OLD.is_locked IS DISTINCT FROM NEW.is_locked THEN
      RAISE EXCEPTION 'Tidak dapat mengubah status kunci akun';
    END IF;
  END IF;

  -- Always prevent changing organization_id
  IF OLD.organization_id IS DISTINCT FROM NEW.organization_id THEN
    RAISE EXCEPTION 'Tidak dapat mengubah organisasi akun';
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."protect_account_fields"() OWNER TO "postgres";
REVOKE EXECUTE ON FUNCTION "public"."protect_account_fields"() FROM anon, authenticated;


CREATE OR REPLACE FUNCTION "public"."protect_organization_billing_columns"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- Allow service_role and trusted functions to update protected columns
  IF current_setting('role', true) = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- Block changes to protected columns from client context
  IF OLD.current_plan IS DISTINCT FROM NEW.current_plan THEN
    RAISE EXCEPTION 'Cannot modify billing plan from client. Use service role or billing RPC.';
  END IF;

  IF OLD.created_by IS DISTINCT FROM NEW.created_by THEN
    RAISE EXCEPTION 'Cannot modify created_by field';
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."protect_organization_billing_columns"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."protect_product_stock_update"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.current_stock IS DISTINCT FROM NEW.current_stock
     AND COALESCE(current_setting('ledjer.allow_stock_update', true), '') != 'on' THEN
    RAISE EXCEPTION 'Product stock cannot be changed directly. Use transaction or stock movement functions.';
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."protect_product_stock_update"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."recalculate_product_average_cost"("p_product_id" "uuid") RETURNS numeric
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_org_id UUID;
  v_total_cost NUMERIC := 0;
  v_total_qty NUMERIC := 0;
  v_avg_cost NUMERIC := 0;
BEGIN
  -- Validate product exists and get organization
  SELECT organization_id
  INTO v_org_id
  FROM public.products
  WHERE id = p_product_id AND is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Produk tidak ditemukan atau tidak aktif';
  END IF;

  -- Calculate weighted average cost from cost-bearing stock movements only.
  -- Use SIGNED quantities so that void movements correctly subtract quantity
  -- and cost basis (e.g., voiding a purchase reverses the original cost layer).
  --
  -- Include (cost-bearing movements only):
  --   - opening_balance: always has meaningful cost
  --   - purchase: always has meaningful cost
  --   - void of a purchase WHERE unit_cost IS NOT NULL AND unit_cost > 0:
  --     cost-bearing reversal that subtracts the original purchase layer
  --
  -- Exclude:
  --   - sale: reduces stock, no cost to average in
  --   - void of a sale: restores quantity/value for stock movement
  --     reconciliation but is not a purchase cost layer
  --   - void WHERE unit_cost IS NULL OR unit_cost <= 0: non-cost-bearing reversal
  --   - adjustment: manual adjustments with no reliable cost basis
  SELECT
    COALESCE(SUM(sm.quantity * sm.unit_cost), 0),
    COALESCE(SUM(sm.quantity), 0)
  INTO v_total_cost, v_total_qty
  FROM public.stock_movements sm
  WHERE sm.product_id = p_product_id
    AND sm.organization_id = v_org_id
    AND (
      sm.movement_type IN ('opening_balance', 'purchase')
      OR (
        sm.movement_type = 'void'
        AND sm.unit_cost IS NOT NULL
        AND sm.unit_cost > 0
        AND EXISTS (
          SELECT 1
          FROM public.transactions rt
          JOIN public.transactions ot
            ON ot.id = rt.original_transaction_id
           AND ot.organization_id = rt.organization_id
          WHERE rt.id = sm.transaction_id
            AND rt.organization_id = sm.organization_id
            AND ot.transaction_type IN ('cash_purchase', 'credit_purchase')
        )
      )
    );

  -- Calculate average
  IF v_total_qty > 0 THEN
    v_avg_cost := v_total_cost / v_total_qty;
  ELSE
    -- No costed movements; keep current purchase_price
    SELECT purchase_price INTO v_avg_cost
    FROM public.products
    WHERE id = p_product_id;
  END IF;

  -- Ensure non-negative
  v_avg_cost := GREATEST(COALESCE(v_avg_cost, 0), 0);

  -- Update product's purchase price
  UPDATE public.products
  SET purchase_price = v_avg_cost,
      updated_at = now()
  WHERE id = p_product_id;

  RETURN v_avg_cost;
END;
$$;


ALTER FUNCTION "public"."recalculate_product_average_cost"("p_product_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."record_initial_product_stock"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_inventory_account_id UUID;
  v_opening_account_id UUID;
  v_entry_id UUID;
  v_entry_number TEXT;
  v_initial_value NUMERIC;
  v_actor UUID;
  v_stock_date   DATE;
  v_onboarding   TEXT;
BEGIN
  -- Determine the effective date for the opening stock movement + journal entry.
  -- Prefer organizations.books_start_date so opening inventory falls into the
  -- correct accounting period. CURRENT_DATE is intentionally NOT used here.
  SELECT onboarding_status::TEXT, books_start_date
    INTO v_onboarding, v_stock_date
  FROM public.organizations
  WHERE id = NEW.organization_id;

  IF v_stock_date IS NULL THEN
    v_stock_date := CURRENT_DATE;
  END IF;

  -- Block creation of a product with positive initial stock once onboarding is
  -- complete. This prevents silent opening-balance journal entries after the
  -- books are open. Use the normal purchase flow for new stock.
  IF COALESCE(NEW.current_stock, 0) > 0
     AND v_onboarding = 'completed' THEN
    RAISE EXCEPTION 'Produk dengan stok awal > 0 tidak dapat dibuat setelah onboarding selesai. Catat pembelian atau gunakan alur penyesuaian stok resmi.';
  END IF;

  IF COALESCE(NEW.current_stock, 0) <= 0 THEN
    RETURN NEW;
  END IF;

  v_actor := COALESCE(NEW.created_by, auth.uid());
  v_initial_value := COALESCE(NEW.current_stock, 0) * COALESCE(NEW.purchase_price, 0);

  INSERT INTO public.stock_movements (
    organization_id, product_id, movement_date, movement_type,
    quantity, unit_cost, transaction_id, stock_after, notes, created_by
  ) VALUES (
    NEW.organization_id, NEW.id, v_stock_date, 'opening_balance',
    NEW.current_stock, NEW.purchase_price, NULL, NEW.current_stock,
    'Stok awal produk', v_actor
  );

  IF v_initial_value > 0 THEN
    v_inventory_account_id := NEW.inventory_account_id;
    IF v_inventory_account_id IS NULL THEN
      SELECT id INTO v_inventory_account_id
      FROM public.accounts
      WHERE organization_id = NEW.organization_id AND code = 1300
      LIMIT 1;
    END IF;

    SELECT id INTO v_opening_account_id
    FROM public.accounts
    WHERE organization_id = NEW.organization_id AND code = 3200
    LIMIT 1;

    IF v_inventory_account_id IS NULL OR v_opening_account_id IS NULL THEN
      RAISE EXCEPTION 'Inventory and opening balance accounts are required for initial stock value';
    END IF;

    v_entry_number := public.generate_entry_number(NEW.organization_id);

    INSERT INTO public.journal_entries (
      organization_id, entry_number, entry_date, entry_type,
      description, status, posted_at, posted_by
    ) VALUES (
      NEW.organization_id, v_entry_number, v_stock_date, 'opening_balance',
      'Stok awal produk: ' || NEW.name, 'posted', now(), v_actor
    ) RETURNING id INTO v_entry_id;

    INSERT INTO public.journal_lines (
      organization_id, journal_entry_id, account_id,
      debit, credit, description, line_order
    ) VALUES
      (
        NEW.organization_id, v_entry_id, v_inventory_account_id,
        v_initial_value, 0, 'Stok awal produk: ' || NEW.name, 1
      ),
      (
        NEW.organization_id, v_entry_id, v_opening_account_id,
        0, v_initial_value, 'Stok awal produk: ' || NEW.name, 2
      );
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."record_initial_product_stock"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."record_login_attempt"("p_email" "text", "p_success" boolean, "p_ip_address" "inet" DEFAULT NULL::"inet", "p_user_agent" "text" DEFAULT NULL::"text", "p_error_message" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  INSERT INTO public.login_attempts (email, success, ip_address, user_agent, error_message)
  VALUES (lower(p_email), p_success, p_ip_address, p_user_agent, p_error_message);

  DELETE FROM public.login_attempts
  WHERE created_at < now() - INTERVAL '24 hours';
END;
$$;


ALTER FUNCTION "public"."record_login_attempt"("p_email" "text", "p_success" boolean, "p_ip_address" "inet", "p_user_agent" "text", "p_error_message" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."record_login_attempt_pre_auth"("p_email" "text", "p_success" boolean, "p_user_agent" "text" DEFAULT NULL::"text", "p_error_message" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- Input validation: reject empty/null email, normalize
  IF p_email IS NULL OR length(trim(p_email)) = 0 THEN
    RAISE EXCEPTION 'Email is required';
  END IF;

  INSERT INTO public.login_attempts (email, success, ip_address, user_agent, error_message)
  VALUES (lower(trim(p_email)), p_success, inet_client_addr(), p_user_agent, p_error_message);

  -- Cleanup old records
  DELETE FROM public.login_attempts
  WHERE created_at < now() - INTERVAL '24 hours';
END;
$$;


ALTER FUNCTION "public"."record_login_attempt_pre_auth"("p_email" "text", "p_success" boolean, "p_user_agent" "text", "p_error_message" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."record_stock_movement"("p_organization_id" "uuid", "p_product_id" "uuid", "p_movement_date" "date", "p_movement_type" "text", "p_quantity" numeric, "p_unit_cost" numeric DEFAULT NULL::numeric, "p_transaction_id" "uuid" DEFAULT NULL::"uuid", "p_notes" "text" DEFAULT NULL::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_movement_id UUID;
  v_stock_after NUMERIC;
  v_product_org_id UUID;
BEGIN
  IF p_movement_type NOT IN ('purchase', 'sale', 'adjustment', 'void', 'opening_balance') THEN
    RAISE EXCEPTION 'Invalid stock movement type: %', p_movement_type;
  END IF;

  IF p_quantity IS NULL OR p_quantity = 0 THEN
    RAISE EXCEPTION 'Stock movement quantity must be non-zero';
  END IF;

  SELECT organization_id
  INTO v_product_org_id
  FROM public.products
  WHERE id = p_product_id;

  IF NOT FOUND OR v_product_org_id != p_organization_id THEN
    RAISE EXCEPTION 'Product does not belong to this organization';
  END IF;

  IF p_transaction_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.transactions
    WHERE id = p_transaction_id
      AND organization_id = p_organization_id
  ) THEN
    RAISE EXCEPTION 'Transaction does not belong to this organization';
  END IF;

  IF p_transaction_id IS NULL THEN
    IF NOT public.has_permission(p_organization_id, 'can_manage_products') THEN
      RAISE EXCEPTION 'You do not have permission to create manual stock movements';
    END IF;
  ELSE
    IF NOT (
      public.has_permission(p_organization_id, 'can_create_transaction')
      OR public.has_permission(p_organization_id, 'can_void_transaction')
      OR public.has_permission(p_organization_id, 'can_manage_products')
    ) THEN
      RAISE EXCEPTION 'You do not have permission to create stock movements';
    END IF;
  END IF;

  v_stock_after := public.update_product_stock(p_product_id, p_quantity);

  INSERT INTO public.stock_movements (
    organization_id, product_id, movement_date, movement_type,
    quantity, unit_cost, transaction_id, stock_after, notes, created_by
  ) VALUES (
    p_organization_id, p_product_id, p_movement_date, p_movement_type,
    p_quantity, p_unit_cost, p_transaction_id, v_stock_after, p_notes, auth.uid()
  ) RETURNING id INTO v_movement_id;

  RETURN v_movement_id;
END;
$$;


ALTER FUNCTION "public"."record_stock_movement"("p_organization_id" "uuid", "p_product_id" "uuid", "p_movement_date" "date", "p_movement_type" "text", "p_quantity" numeric, "p_unit_cost" numeric, "p_transaction_id" "uuid", "p_notes" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."remove_staff"("p_organization_id" "uuid", "p_member_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_remover_id UUID;
  v_remover_role TEXT;
  v_target_member RECORD;
BEGIN
  v_remover_id := auth.uid();
  IF v_remover_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT role::TEXT INTO v_remover_role
  FROM public.organization_members
  WHERE organization_id = p_organization_id
    AND user_id = v_remover_id
    AND status = 'active';

  IF v_remover_role IS NULL THEN
    RAISE EXCEPTION 'You are not a member of this organization';
  END IF;

  IF v_remover_role != 'owner' THEN
    RAISE EXCEPTION 'Only owners can remove staff';
  END IF;

  SELECT * INTO v_target_member
  FROM public.organization_members
  WHERE id = p_member_id
    AND organization_id = p_organization_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Staff member not found in this organization';
  END IF;

  IF v_target_member.role = 'owner' THEN
    RAISE EXCEPTION 'Cannot remove owner through remove_staff. Owners must be removed through organization transfer or deletion.';
  END IF;

  IF v_target_member.user_id = v_remover_id THEN
    RAISE EXCEPTION 'Cannot remove yourself';
  END IF;

  UPDATE public.organization_members
  SET status = 'removed',
      updated_at = now()
  WHERE id = p_member_id;

  INSERT INTO public.audit_logs (
    organization_id, actor_user_id, entity_type, entity_id,
    action, before_data
  ) VALUES (
    p_organization_id, v_remover_id, 'organization_member', p_member_id,
    'remove_staff',
    jsonb_build_object(
      'user_id', v_target_member.user_id,
      'role', v_target_member.role,
      'status', v_target_member.status
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'member_id', p_member_id
  );
END;
$$;


ALTER FUNCTION "public"."remove_staff"("p_organization_id" "uuid", "p_member_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rename_account"("p_account_id" "uuid", "p_new_name" "text") RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_account RECORD;
  v_org_id UUID;
  v_trimmed_name TEXT;
  v_existing_id UUID;
BEGIN
  v_trimmed_name := TRIM(p_new_name);

  IF v_trimmed_name = '' THEN
    RAISE EXCEPTION 'Nama akun wajib diisi';
  END IF;

  IF LENGTH(v_trimmed_name) > 60 THEN
    RAISE EXCEPTION 'Nama akun maksimal 60 karakter';
  END IF;

  SELECT id, organization_id, name, is_system, is_locked, code
  INTO v_account
  FROM public.accounts
  WHERE id = p_account_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Akun tidak ditemukan';
  END IF;

  v_org_id := v_account.organization_id;

  IF NOT public.has_permission(v_org_id, 'can_manage_accounts') THEN
    RAISE EXCEPTION 'Tidak memiliki izin untuk mengelola akun';
  END IF;

  IF v_account.is_locked = true THEN
    RAISE EXCEPTION 'Akun ini terkunci dan tidak dapat diubah';
  END IF;

  SELECT id INTO v_existing_id
  FROM public.accounts
  WHERE organization_id = v_org_id
    AND LOWER(name) = LOWER(v_trimmed_name)
    AND id != p_account_id
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'Nama akun sudah digunakan';
  END IF;

  UPDATE public.accounts
  SET name = v_trimmed_name,
      updated_at = NOW()
  WHERE id = p_account_id
  RETURNING id, name, code INTO v_account;

  RETURN json_build_object(
    'id', v_account.id,
    'name', v_account.name,
    'code', v_account.code
  );
END;
$$;


ALTER FUNCTION "public"."rename_account"("p_account_id" "uuid", "p_new_name" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."rename_account"("p_account_id" "uuid", "p_new_name" "text") IS 'Rename account display name. SET search_path = public to harden SECURITY DEFINER.';



CREATE OR REPLACE FUNCTION "public"."standardize_transaction_number"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
DECLARE
  v_period TEXT;
BEGIN
  v_period := to_char(NEW.transaction_date, 'YYYYMM');

  IF NEW.transaction_number IS NULL
     OR NEW.transaction_number !~ ('^TRX-' || v_period || '-[0-9]{6}$') THEN
    NEW.transaction_number := public.generate_transaction_number(
      NEW.organization_id,
      NEW.transaction_date
    );
  END IF;

  RETURN NEW;
END;
$_$;


ALTER FUNCTION "public"."standardize_transaction_number"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_organization_settings"("p_organization_id" "uuid", "p_name" "text" DEFAULT NULL::"text", "p_business_type" "public"."business_type" DEFAULT NULL::"public"."business_type", "p_books_start_date" "date" DEFAULT NULL::"date", "p_default_reporting_period" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_user_id UUID;
  v_role TEXT;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- Require active owner membership
  SELECT role::TEXT INTO v_role
  FROM public.organization_members
  WHERE organization_id = p_organization_id
    AND user_id = v_user_id
    AND status = 'active';

  IF v_role IS NULL THEN
    RAISE EXCEPTION 'You are not a member of this organization';
  END IF;

  IF v_role != 'owner' THEN
    RAISE EXCEPTION 'Only owners can update organization settings';
  END IF;

  -- Update only safe business profile fields
  UPDATE public.organizations
  SET
    name = COALESCE(p_name, name),
    business_type = COALESCE(p_business_type, business_type),
    books_start_date = COALESCE(p_books_start_date, books_start_date),
    default_reporting_period = COALESCE(p_default_reporting_period, default_reporting_period),
    updated_at = now()
  WHERE id = p_organization_id;

  RETURN jsonb_build_object(
    'success', true,
    'organization_id', p_organization_id
  );
END;
$$;


ALTER FUNCTION "public"."update_organization_settings"("p_organization_id" "uuid", "p_name" "text", "p_business_type" "public"."business_type", "p_books_start_date" "date", "p_default_reporting_period" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_product_stock"("p_product_id" "uuid", "p_quantity_delta" numeric) RETURNS numeric
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_org_id UUID;
  v_current_stock NUMERIC;
  v_new_stock NUMERIC;
BEGIN
  IF p_quantity_delta IS NULL OR p_quantity_delta = 0 THEN
    RAISE EXCEPTION 'Stock quantity delta must be non-zero';
  END IF;

  SELECT organization_id, current_stock
  INTO v_org_id, v_current_stock
  FROM public.products
  WHERE id = p_product_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Product not found';
  END IF;

  IF NOT (
    public.has_permission(v_org_id, 'can_manage_products')
    OR public.has_permission(v_org_id, 'can_create_transaction')
    OR public.has_permission(v_org_id, 'can_void_transaction')
  ) THEN
    RAISE EXCEPTION 'You do not have permission to update product stock';
  END IF;

  IF v_current_stock + p_quantity_delta < 0 THEN
    RAISE EXCEPTION 'Insufficient stock. Available: %, Required: %',
      v_current_stock, ABS(p_quantity_delta);
  END IF;

  PERFORM set_config('ledjer.allow_stock_update', 'on', true);

  UPDATE public.products
  SET current_stock = current_stock + p_quantity_delta,
      updated_at = now()
  WHERE id = p_product_id
  RETURNING current_stock INTO v_new_stock;

  RETURN v_new_stock;
END;
$$;


ALTER FUNCTION "public"."update_product_stock"("p_product_id" "uuid", "p_quantity_delta" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_staff_permissions"("p_organization_id" "uuid", "p_member_id" "uuid", "p_can_create_transaction" boolean DEFAULT NULL::boolean, "p_can_view_reports" boolean DEFAULT NULL::boolean, "p_can_manage_accounts" boolean DEFAULT NULL::boolean, "p_can_void_transaction" boolean DEFAULT NULL::boolean, "p_can_view_audit_log" boolean DEFAULT NULL::boolean) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_updater_id UUID;
  v_updater_role TEXT;
  v_target_member RECORD;
  v_old_permissions JSONB;
BEGIN
  v_updater_id := auth.uid();
  IF v_updater_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- Check updater is active owner
  SELECT role::TEXT INTO v_updater_role
  FROM public.organization_members
  WHERE organization_id = p_organization_id
    AND user_id = v_updater_id
    AND status = 'active';

  IF v_updater_role IS NULL THEN
    RAISE EXCEPTION 'You are not a member of this organization';
  END IF;

  IF v_updater_role != 'owner' THEN
    RAISE EXCEPTION 'Only owners can update staff permissions';
  END IF;

  -- Get target member and ensure they belong to the same organization
  SELECT * INTO v_target_member
  FROM public.organization_members
  WHERE id = p_member_id
    AND organization_id = p_organization_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Staff member not found in this organization';
  END IF;

  IF v_target_member.role != 'staff' THEN
    RAISE EXCEPTION 'Can only update permissions for staff members, not owners';
  END IF;

  -- Capture old permissions for audit
  v_old_permissions := jsonb_build_object(
    'can_create_transaction', v_target_member.can_create_transaction,
    'can_view_reports', v_target_member.can_view_reports,
    'can_manage_accounts', v_target_member.can_manage_accounts,
    'can_void_transaction', v_target_member.can_void_transaction,
    'can_view_audit_log', v_target_member.can_view_audit_log
  );

  -- Update permissions
  UPDATE public.organization_members
  SET
    can_create_transaction = COALESCE(p_can_create_transaction, can_create_transaction),
    can_view_reports = COALESCE(p_can_view_reports, can_view_reports),
    can_manage_accounts = COALESCE(p_can_manage_accounts, can_manage_accounts),
    can_void_transaction = COALESCE(p_can_void_transaction, can_void_transaction),
    can_view_audit_log = COALESCE(p_can_view_audit_log, can_view_audit_log),
    updated_at = now()
  WHERE id = p_member_id;

  -- Audit log
  INSERT INTO public.audit_logs (
    organization_id,
    actor_user_id,
    entity_type,
    entity_id,
    action,
    before_data,
    after_data
  ) VALUES (
    p_organization_id,
    v_updater_id,
    'organization_member',
    p_member_id,
    'update_permissions',
    v_old_permissions,
    jsonb_build_object(
      'can_create_transaction', COALESCE(p_can_create_transaction, v_target_member.can_create_transaction),
      'can_view_reports', COALESCE(p_can_view_reports, v_target_member.can_view_reports),
      'can_manage_accounts', COALESCE(p_can_manage_accounts, v_target_member.can_manage_accounts),
      'can_void_transaction', COALESCE(p_can_void_transaction, v_target_member.can_void_transaction),
      'can_view_audit_log', COALESCE(p_can_view_audit_log, v_target_member.can_view_audit_log)
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'member_id', p_member_id
  );
END;
$$;


ALTER FUNCTION "public"."update_staff_permissions"("p_organization_id" "uuid", "p_member_id" "uuid", "p_can_create_transaction" boolean, "p_can_view_reports" boolean, "p_can_manage_accounts" boolean, "p_can_void_transaction" boolean, "p_can_view_audit_log" boolean) OWNER TO "postgres";
REVOKE EXECUTE ON FUNCTION "public"."update_staff_permissions"("p_organization_id" "uuid", "p_member_id" "uuid", "p_can_create_transaction" boolean, "p_can_view_reports" boolean, "p_can_manage_accounts" boolean, "p_can_void_transaction" boolean, "p_can_view_audit_log" boolean) FROM anon;


CREATE OR REPLACE FUNCTION "public"."update_staff_permissions"("p_organization_id" "uuid", "p_member_id" "uuid", "p_can_create_transaction" boolean DEFAULT NULL::boolean, "p_can_view_reports" boolean DEFAULT NULL::boolean, "p_can_manage_accounts" boolean DEFAULT NULL::boolean, "p_can_void_transaction" boolean DEFAULT NULL::boolean, "p_can_manage_products" boolean DEFAULT NULL::boolean, "p_can_view_audit_log" boolean DEFAULT NULL::boolean) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_user_id UUID;
  v_role TEXT;
  v_member RECORD;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- Check membership and owner role
  SELECT role::TEXT INTO v_role
  FROM organization_members
  WHERE organization_id = p_organization_id
    AND user_id = v_user_id
    AND status = 'active';

  IF v_role IS NULL OR v_role != 'owner' THEN
    RAISE EXCEPTION 'Hanya owner yang dapat mengubah izin staff';
  END IF;

  -- Get the member to update
  SELECT * INTO v_member
  FROM organization_members
  WHERE id = p_member_id
    AND organization_id = p_organization_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Member tidak ditemukan';
  END IF;

  IF v_member.role != 'staff' THEN
    RAISE EXCEPTION 'Hanya staff yang dapat diubah izinnya';
  END IF;

  -- Update permissions (only non-NULL values)
  UPDATE organization_members
  SET
    can_create_transaction = COALESCE(p_can_create_transaction, can_create_transaction),
    can_view_reports = COALESCE(p_can_view_reports, can_view_reports),
    can_manage_accounts = COALESCE(p_can_manage_accounts, can_manage_accounts),
    can_void_transaction = COALESCE(p_can_void_transaction, can_void_transaction),
    can_manage_products = COALESCE(p_can_manage_products, can_manage_products),
    can_view_audit_log = COALESCE(p_can_view_audit_log, can_view_audit_log),
    updated_at = now()
  WHERE id = p_member_id;

  -- Audit log
  INSERT INTO audit_logs (
    organization_id, actor_user_id, entity_type, entity_id,
    action, after_data
  ) VALUES (
    p_organization_id,
    v_user_id,
    'staff_permissions',
    p_member_id,
    'update_permissions',
    jsonb_build_object(
      'can_create_transaction', COALESCE(p_can_create_transaction, v_member.can_create_transaction),
      'can_view_reports', COALESCE(p_can_view_reports, v_member.can_view_reports),
      'can_manage_accounts', COALESCE(p_can_manage_accounts, v_member.can_manage_accounts),
      'can_void_transaction', COALESCE(p_can_void_transaction, v_member.can_void_transaction),
      'can_manage_products', COALESCE(p_can_manage_products, v_member.can_manage_products),
      'can_view_audit_log', COALESCE(p_can_view_audit_log, v_member.can_view_audit_log)
    )
  );

  RETURN jsonb_build_object('success', true);
END;
$$;


ALTER FUNCTION "public"."update_staff_permissions"("p_organization_id" "uuid", "p_member_id" "uuid", "p_can_create_transaction" boolean, "p_can_view_reports" boolean, "p_can_manage_accounts" boolean, "p_can_void_transaction" boolean, "p_can_manage_products" boolean, "p_can_view_audit_log" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validate_product_sale_accounts"("p_organization_id" "uuid", "p_product_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_cogs_account_id UUID;
  v_inventory_account_id UUID;
BEGIN
  -- Always validate these accounts exist when selling a product
  -- This ensures accounting integrity even if purchase_price is 0
  SELECT id INTO v_cogs_account_id
  FROM public.accounts
  WHERE organization_id = p_organization_id
    AND code = 5100
    AND is_active = true;

  SELECT id INTO v_inventory_account_id
  FROM public.accounts
  WHERE organization_id = p_organization_id
    AND code = 1300
    AND is_active = true;

  IF v_cogs_account_id IS NULL THEN
    RAISE EXCEPTION 'Akun HPP (kode 5100) belum dikonfigurasi. Silakan tambahkan akun HPP di Daftar Akun.';
  END IF;

  IF v_inventory_account_id IS NULL THEN
    RAISE EXCEPTION 'Akun Persediaan (kode 1300) belum dikonfigurasi. Silakan tambahkan akun Persediaan di Daftar Akun.';
  END IF;
END;
$$;


ALTER FUNCTION "public"."validate_product_sale_accounts"("p_organization_id" "uuid", "p_product_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."void_transaction"("p_organization_id" "uuid", "p_transaction_id" "uuid", "p_void_reason" "text", "p_void_date" "date" DEFAULT NULL::"date") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_user_id UUID;
  v_role TEXT;
  v_txn RECORD;
  v_orig_je RECORD;
  v_reversal_je_id UUID;
  v_reversal_txn_id UUID;
  v_line RECORD;
  v_line_order INTEGER := 0;
  v_reversed_count INTEGER := 0;
  v_reversal_journal_ids JSONB := '[]'::JSONB;
  v_stock_delta NUMERIC;
  v_void_unit_cost NUMERIC;
  v_books_start_date DATE;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Autentikasi diperlukan';
  END IF;

  SELECT role::TEXT
  INTO v_role
  FROM public.organization_members
  WHERE organization_id = p_organization_id
    AND user_id = v_user_id
    AND status = 'active';

  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Anda bukan anggota organisasi ini';
  END IF;

  IF v_role != 'owner'
     AND NOT public.has_permission(p_organization_id, 'can_void_transaction') THEN
    RAISE EXCEPTION 'Anda tidak memiliki izin untuk membatalkan transaksi';
  END IF;

  IF NULLIF(TRIM(p_void_reason), '') IS NULL THEN
    RAISE EXCEPTION 'Alasan pembatalan wajib diisi';
  END IF;

  IF p_void_date IS NOT NULL THEN
    SELECT books_start_date
    INTO v_books_start_date
    FROM public.organizations
    WHERE id = p_organization_id;

    IF v_books_start_date IS NOT NULL AND p_void_date < v_books_start_date THEN
      RAISE EXCEPTION 'Tanggal pembatalan % sebelum tanggal mulai pembukuan %',
        p_void_date, v_books_start_date;
    END IF;
  END IF;

  SELECT *
  INTO v_txn
  FROM public.transactions
  WHERE id = p_transaction_id
    AND organization_id = p_organization_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transaksi tidak ditemukan';
  END IF;

  IF v_txn.status != 'posted' THEN
    RAISE EXCEPTION 'Hanya transaksi berstatus posted yang dapat dibatalkan';
  END IF;

  -- P1-2: Block voiding reversal rows
  IF v_txn.original_transaction_id IS NOT NULL THEN
    RAISE EXCEPTION 'Transaksi pembatalan tidak dapat dibatalkan';
  END IF;

  IF v_txn.transaction_type IN ('credit_sale', 'credit_purchase')
     AND v_txn.payment_status = 'partial' THEN
    RAISE EXCEPTION 'Transaksi kredit dengan pembayaran parsial tidak dapat dibatalkan langsung. Selesaikan pelunasan atau catat refund terpisah terlebih dahulu.';
  END IF;

  SELECT COUNT(*)
  INTO v_reversed_count
  FROM public.journal_entries
  WHERE transaction_id = p_transaction_id
    AND organization_id = p_organization_id
    AND status = 'posted';

  IF v_reversed_count = 0 THEN
    RAISE EXCEPTION 'Jurnal posted tidak ditemukan untuk transaksi ini';
  END IF;

  INSERT INTO public.transactions (
    organization_id, transaction_number, transaction_date,
    transaction_type, amount, party_id, category_name,
    cash_account_id, destination_cash_account_id,
    payment_status, due_date, description, notes,
    status, posted_at, posted_by, created_by,
    original_transaction_id,
    product_id, quantity, unit_price
  ) VALUES (
    p_organization_id,
    public.generate_transaction_number(p_organization_id),
    COALESCE(p_void_date, CURRENT_DATE),
    v_txn.transaction_type,
    v_txn.amount,
    v_txn.party_id,
    v_txn.category_name,
    v_txn.cash_account_id,
    v_txn.destination_cash_account_id,
    v_txn.payment_status,
    v_txn.due_date,
    'Pembatalan: ' || v_txn.description,
    p_void_reason,
    'posted',
    now(),
    v_user_id,
    v_user_id,
    p_transaction_id,
    v_txn.product_id,
    v_txn.quantity,
    v_txn.unit_price
  ) RETURNING id INTO v_reversal_txn_id;

  v_reversed_count := 0;

  FOR v_orig_je IN
    SELECT *
    FROM public.journal_entries
    WHERE transaction_id = p_transaction_id
      AND organization_id = p_organization_id
      AND status = 'posted'
    ORDER BY created_at, id
  LOOP
    v_line_order := 0;

    INSERT INTO public.journal_entries (
      organization_id, entry_number, entry_date, entry_type,
      transaction_id, description, status,
      reversed_entry_id, reversal_reason,
      posted_at, posted_by
    ) VALUES (
      p_organization_id,
      public.generate_entry_number(p_organization_id),
      COALESCE(p_void_date, CURRENT_DATE),
      'reversal',
      v_reversal_txn_id,
      'Pembatalan: ' || v_orig_je.description,
      'posted',
      v_orig_je.id,
      p_void_reason,
      now(),
      v_user_id
    ) RETURNING id INTO v_reversal_je_id;

    FOR v_line IN
      SELECT *
      FROM public.journal_lines
      WHERE journal_entry_id = v_orig_je.id
      ORDER BY line_order, id
    LOOP
      v_line_order := v_line_order + 1;
      INSERT INTO public.journal_lines (
        organization_id, journal_entry_id, account_id, party_id,
        debit, credit, description, line_order
      ) VALUES (
        p_organization_id, v_reversal_je_id, v_line.account_id, v_line.party_id,
        v_line.credit, v_line.debit,
        'Reversal: ' || v_line.description, v_line_order
      );
    END LOOP;

    IF (
      SELECT ABS(COALESCE(SUM(debit), 0) - COALESCE(SUM(credit), 0))
      FROM public.journal_lines
      WHERE journal_entry_id = v_reversal_je_id
    ) > 0.01 THEN
      RAISE EXCEPTION 'Jurnal reversal tidak seimbang';
    END IF;

    v_reversal_journal_ids := v_reversal_journal_ids || jsonb_build_array(v_reversal_je_id);
    v_reversed_count := v_reversed_count + 1;
  END LOOP;

  IF v_txn.product_id IS NOT NULL AND v_txn.quantity IS NOT NULL THEN
    v_stock_delta := CASE
      WHEN v_txn.transaction_type IN ('cash_sale', 'credit_sale') THEN v_txn.quantity
      WHEN v_txn.transaction_type IN ('cash_purchase', 'credit_purchase') THEN -v_txn.quantity
      ELSE NULL
    END;

    IF v_stock_delta IS NOT NULL AND v_stock_delta != 0 THEN
      SELECT sm.unit_cost
      INTO v_void_unit_cost
      FROM public.stock_movements sm
      WHERE sm.organization_id = p_organization_id
        AND sm.product_id = v_txn.product_id
        AND sm.transaction_id = p_transaction_id
        AND sm.movement_type IN ('purchase', 'sale')
      ORDER BY sm.created_at DESC, sm.id DESC
      LIMIT 1;

      PERFORM public.record_stock_movement(
        p_organization_id,
        v_txn.product_id,
        COALESCE(p_void_date, CURRENT_DATE),
        'void',
        v_stock_delta,
        CASE
          WHEN v_txn.transaction_type IN ('cash_purchase', 'credit_purchase') THEN COALESCE(v_void_unit_cost, v_txn.unit_price)
          WHEN v_txn.transaction_type IN ('cash_sale', 'credit_sale') THEN COALESCE(v_void_unit_cost, 0)
          ELSE NULL
        END,
        v_reversal_txn_id,
        p_void_reason
      );

      IF v_txn.transaction_type IN ('cash_purchase', 'credit_purchase') THEN
        PERFORM public.recalculate_product_average_cost(v_txn.product_id);
      END IF;
    END IF;
  END IF;

  UPDATE public.transactions
  SET status = 'voided',
      voided_at = now(),
      voided_by = v_user_id,
      void_reason = p_void_reason,
      reversal_transaction_id = v_reversal_txn_id
  WHERE id = p_transaction_id;

  INSERT INTO public.audit_logs (
    organization_id, actor_user_id, entity_type, entity_id,
    action, before_data, reason
  ) VALUES (
    p_organization_id, v_user_id, 'transaction', p_transaction_id,
    'void',
    jsonb_build_object(
      'transaction_number', v_txn.transaction_number,
      'amount', v_txn.amount,
      'transaction_type', v_txn.transaction_type,
      'reversed_journal_count', v_reversed_count
    ),
    p_void_reason
  );

  RETURN jsonb_build_object(
    'original_transaction_id', p_transaction_id,
    'reversal_transaction_id', v_reversal_txn_id,
    'reversal_journal_entry_ids', v_reversal_journal_ids,
    'status', 'voided'
  );
END;
$$;


ALTER FUNCTION "public"."void_transaction"("p_organization_id" "uuid", "p_transaction_id" "uuid", "p_void_reason" "text", "p_void_date" "date") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."account_mappings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "business_type" "public"."business_type" NOT NULL,
    "transaction_type" "text" NOT NULL,
    "category_name" "text" NOT NULL,
    "debit_account_id" "uuid" NOT NULL,
    "credit_account_id" "uuid" NOT NULL,
    "is_system" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."account_mappings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."accounts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "code" integer NOT NULL,
    "name" "text" NOT NULL,
    "account_type" "public"."account_type" NOT NULL,
    "normal_balance" "public"."normal_balance" NOT NULL,
    "parent_account_id" "uuid",
    "is_system" boolean DEFAULT false NOT NULL,
    "is_locked" boolean DEFAULT false NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "report_group" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "is_cash_account" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."accounts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."attachments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "transaction_id" "uuid" NOT NULL,
    "file_path" "text" NOT NULL,
    "file_name" "text" NOT NULL,
    "file_type" "text" NOT NULL,
    "file_size" integer NOT NULL,
    "uploaded_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."attachments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."audit_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "actor_user_id" "uuid" NOT NULL,
    "entity_type" "text" NOT NULL,
    "entity_id" "uuid" NOT NULL,
    "action" "text" NOT NULL,
    "before_data" "jsonb",
    "after_data" "jsonb",
    "reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."audit_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."journal_entries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "entry_number" "text" NOT NULL,
    "entry_date" "date" NOT NULL,
    "entry_type" "public"."journal_entry_type" DEFAULT 'normal'::"public"."journal_entry_type" NOT NULL,
    "transaction_id" "uuid",
    "description" "text" DEFAULT ''::"text" NOT NULL,
    "status" "public"."journal_entry_status" DEFAULT 'posted'::"public"."journal_entry_status" NOT NULL,
    "reversed_entry_id" "uuid",
    "reversal_reason" "text",
    "posted_at" timestamp with time zone,
    "posted_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."journal_entries" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."journal_lines" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "journal_entry_id" "uuid" NOT NULL,
    "account_id" "uuid" NOT NULL,
    "party_id" "uuid",
    "debit" numeric(15,2) DEFAULT 0 NOT NULL,
    "credit" numeric(15,2) DEFAULT 0 NOT NULL,
    "description" "text" DEFAULT ''::"text" NOT NULL,
    "line_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "journal_lines_check" CHECK (((("debit" > (0)::numeric) AND ("credit" = (0)::numeric)) OR (("debit" = (0)::numeric) AND ("credit" > (0)::numeric)))),
    CONSTRAINT "journal_lines_credit_check" CHECK (("credit" >= (0)::numeric)),
    CONSTRAINT "journal_lines_debit_check" CHECK (("debit" >= (0)::numeric))
);


ALTER TABLE "public"."journal_lines" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."parties" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "party_type" "public"."party_type" DEFAULT 'other'::"public"."party_type" NOT NULL,
    "email" "text",
    "phone" "text",
    "notes" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."parties" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."transactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "transaction_number" "text" NOT NULL,
    "transaction_date" "date" NOT NULL,
    "transaction_type" "text" NOT NULL,
    "amount" numeric(15,2) NOT NULL,
    "party_id" "uuid",
    "category_name" "text",
    "cash_account_id" "uuid",
    "destination_cash_account_id" "uuid",
    "payment_status" "public"."payment_status" DEFAULT 'paid'::"public"."payment_status" NOT NULL,
    "due_date" "date",
    "description" "text" DEFAULT ''::"text" NOT NULL,
    "notes" "text",
    "status" "public"."transaction_status" DEFAULT 'posted'::"public"."transaction_status" NOT NULL,
    "posted_at" timestamp with time zone,
    "posted_by" "uuid",
    "voided_at" timestamp with time zone,
    "voided_by" "uuid",
    "void_reason" "text",
    "original_transaction_id" "uuid",
    "reversal_transaction_id" "uuid",
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "product_id" "uuid",
    "quantity" numeric(15,3),
    "unit_price" numeric(15,2),
    CONSTRAINT "transactions_amount_check" CHECK (("amount" > (0)::numeric))
);


ALTER TABLE "public"."transactions" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."general_ledger" WITH ("security_invoker"='true') AS
 SELECT "jl"."organization_id",
    "jl"."account_id",
    "a"."code" AS "account_code",
    "a"."name" AS "account_name",
    "a"."account_type",
    "a"."normal_balance",
    "je"."entry_date",
    "je"."id" AS "journal_entry_id",
    "je"."entry_number",
    "t"."id" AS "transaction_id",
    "t"."transaction_number",
    "jl"."description",
    "p"."name" AS "party_name",
    "jl"."debit",
    "jl"."credit",
        CASE
            WHEN ("a"."normal_balance" = 'debit'::"public"."normal_balance") THEN ("jl"."debit" - "jl"."credit")
            ELSE ("jl"."credit" - "jl"."debit")
        END AS "signed_amount",
    "sum"(
        CASE
            WHEN ("a"."normal_balance" = 'debit'::"public"."normal_balance") THEN ("jl"."debit" - "jl"."credit")
            ELSE ("jl"."credit" - "jl"."debit")
        END) OVER (PARTITION BY "jl"."account_id", "jl"."organization_id" ORDER BY "je"."entry_date", "je"."created_at", "jl"."line_order" ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS "running_balance"
   FROM (((("public"."journal_lines" "jl"
     JOIN "public"."accounts" "a" ON (("a"."id" = "jl"."account_id")))
     JOIN "public"."journal_entries" "je" ON (("je"."id" = "jl"."journal_entry_id")))
     LEFT JOIN "public"."transactions" "t" ON (("t"."id" = "je"."transaction_id")))
     LEFT JOIN "public"."parties" "p" ON (("p"."id" = "jl"."party_id")))
  WHERE ("je"."status" = 'posted'::"public"."journal_entry_status");


ALTER VIEW "public"."general_ledger" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."login_attempts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "email" "text" NOT NULL,
    "success" boolean DEFAULT false NOT NULL,
    "ip_address" "inet",
    "user_agent" "text",
    "error_message" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."login_attempts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."organization_document_counters" (
    "organization_id" "uuid" NOT NULL,
    "counter_name" "text" NOT NULL,
    "current_value" integer DEFAULT 0 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."organization_document_counters" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."organization_members" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "public"."member_role" DEFAULT 'staff'::"public"."member_role" NOT NULL,
    "status" "public"."member_status" DEFAULT 'active'::"public"."member_status" NOT NULL,
    "can_create_transaction" boolean DEFAULT true NOT NULL,
    "can_view_reports" boolean DEFAULT true NOT NULL,
    "can_manage_accounts" boolean DEFAULT false NOT NULL,
    "can_void_transaction" boolean DEFAULT false NOT NULL,
    "can_view_audit_log" boolean DEFAULT false NOT NULL,
    "invited_by" "uuid",
    "joined_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "can_manage_products" boolean DEFAULT false
);


ALTER TABLE "public"."organization_members" OWNER TO "postgres";


COMMENT ON COLUMN "public"."organization_members"."can_manage_products" IS 'Staff permission: can create, update, and delete products';



CREATE TABLE IF NOT EXISTS "public"."organizations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "business_type" "public"."business_type" NOT NULL,
    "base_currency" "text" DEFAULT 'IDR'::"text" NOT NULL,
    "books_start_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "default_reporting_period" "public"."reporting_period" DEFAULT 'monthly'::"public"."reporting_period" NOT NULL,
    "onboarding_status" "public"."onboarding_status" DEFAULT 'not_started'::"public"."onboarding_status" NOT NULL,
    "current_plan" "public"."org_plan" DEFAULT 'free'::"public"."org_plan" NOT NULL,
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."organizations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."products" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "code" "text" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "unit" "text" DEFAULT 'pcs'::"text",
    "purchase_price" numeric(15,2) DEFAULT 0,
    "selling_price" numeric(15,2) DEFAULT 0,
    "current_stock" numeric(15,3) DEFAULT 0,
    "min_stock" numeric(15,3) DEFAULT 0,
    "inventory_account_id" "uuid",
    "cogs_account_id" "uuid",
    "revenue_account_id" "uuid",
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "created_by" "uuid",
    CONSTRAINT "products_current_stock_check" CHECK (("current_stock" >= (0)::numeric)),
    CONSTRAINT "products_purchase_price_check" CHECK (("purchase_price" >= (0)::numeric)),
    CONSTRAINT "products_selling_price_check" CHECK (("selling_price" >= (0)::numeric))
);


ALTER TABLE "public"."products" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "full_name" "text" DEFAULT ''::"text" NOT NULL,
    "email" "text" DEFAULT ''::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."rate_limits" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid",
    "identifier" "text" NOT NULL,
    "action" "text" NOT NULL,
    "attempts" integer DEFAULT 1,
    "window_start" timestamp with time zone DEFAULT "now"(),
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."rate_limits" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."stock_movements" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "product_id" "uuid" NOT NULL,
    "movement_date" "date" NOT NULL,
    "movement_type" "text" NOT NULL,
    "quantity" numeric(15,3) NOT NULL,
    "unit_cost" numeric(15,2),
    "transaction_id" "uuid",
    "stock_after" numeric(15,3) NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "created_by" "uuid",
    CONSTRAINT "stock_movements_quantity_check" CHECK (("quantity" <> (0)::numeric))
);


ALTER TABLE "public"."stock_movements" OWNER TO "postgres";


ALTER TABLE ONLY "public"."account_mappings"
    ADD CONSTRAINT "account_mappings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."accounts"
    ADD CONSTRAINT "accounts_organization_id_code_key" UNIQUE ("organization_id", "code");



ALTER TABLE ONLY "public"."accounts"
    ADD CONSTRAINT "accounts_organization_id_id_key" UNIQUE ("organization_id", "id");



ALTER TABLE ONLY "public"."accounts"
    ADD CONSTRAINT "accounts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."attachments"
    ADD CONSTRAINT "attachments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."journal_entries"
    ADD CONSTRAINT "journal_entries_org_entry_number_unique" UNIQUE ("organization_id", "entry_number");



ALTER TABLE ONLY "public"."journal_entries"
    ADD CONSTRAINT "journal_entries_organization_id_id_key" UNIQUE ("organization_id", "id");



ALTER TABLE ONLY "public"."journal_entries"
    ADD CONSTRAINT "journal_entries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."journal_lines"
    ADD CONSTRAINT "journal_lines_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."login_attempts"
    ADD CONSTRAINT "login_attempts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."organization_document_counters"
    ADD CONSTRAINT "organization_document_counters_pkey" PRIMARY KEY ("organization_id", "counter_name");



ALTER TABLE ONLY "public"."organization_members"
    ADD CONSTRAINT "organization_members_organization_id_user_id_key" UNIQUE ("organization_id", "user_id");



ALTER TABLE ONLY "public"."organization_members"
    ADD CONSTRAINT "organization_members_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."organizations"
    ADD CONSTRAINT "organizations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."parties"
    ADD CONSTRAINT "parties_organization_id_id_key" UNIQUE ("organization_id", "id");



ALTER TABLE ONLY "public"."parties"
    ADD CONSTRAINT "parties_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_organization_id_code_key" UNIQUE ("organization_id", "code");



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_organization_id_id_key" UNIQUE ("organization_id", "id");



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."rate_limits"
    ADD CONSTRAINT "rate_limits_identifier_action_window_start_key" UNIQUE ("identifier", "action", "window_start");



ALTER TABLE ONLY "public"."rate_limits"
    ADD CONSTRAINT "rate_limits_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."stock_movements"
    ADD CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_org_txn_number_unique" UNIQUE ("organization_id", "transaction_number");



ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_organization_id_id_key" UNIQUE ("organization_id", "id");



ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_pkey" PRIMARY KEY ("id");



CREATE INDEX "idx_account_mappings_org_id" ON "public"."account_mappings" USING "btree" ("organization_id");



CREATE INDEX "idx_accounts_code" ON "public"."accounts" USING "btree" ("organization_id", "code");



CREATE INDEX "idx_accounts_org_id" ON "public"."accounts" USING "btree" ("organization_id");



CREATE INDEX "idx_attachments_org_id" ON "public"."attachments" USING "btree" ("organization_id");



CREATE INDEX "idx_attachments_transaction" ON "public"."attachments" USING "btree" ("transaction_id");



CREATE INDEX "idx_audit_logs_entity" ON "public"."audit_logs" USING "btree" ("entity_type", "entity_id");



CREATE INDEX "idx_audit_logs_org_id" ON "public"."audit_logs" USING "btree" ("organization_id");



CREATE INDEX "idx_journal_entries_date" ON "public"."journal_entries" USING "btree" ("organization_id", "entry_date");



CREATE INDEX "idx_journal_entries_org_id" ON "public"."journal_entries" USING "btree" ("organization_id");



CREATE INDEX "idx_journal_entries_org_status_date" ON "public"."journal_entries" USING "btree" ("organization_id", "status", "entry_date");



CREATE INDEX "idx_journal_entries_transaction" ON "public"."journal_entries" USING "btree" ("transaction_id");



CREATE INDEX "idx_journal_lines_account" ON "public"."journal_lines" USING "btree" ("account_id");



CREATE INDEX "idx_journal_lines_entry" ON "public"."journal_lines" USING "btree" ("journal_entry_id");



CREATE INDEX "idx_journal_lines_org_account_entry" ON "public"."journal_lines" USING "btree" ("organization_id", "account_id", "journal_entry_id");



CREATE INDEX "idx_journal_lines_org_entry_account" ON "public"."journal_lines" USING "btree" ("organization_id", "journal_entry_id", "account_id");



CREATE INDEX "idx_journal_lines_org_id" ON "public"."journal_lines" USING "btree" ("organization_id");



CREATE INDEX "idx_login_attempts_email" ON "public"."login_attempts" USING "btree" ("email", "created_at" DESC);



CREATE INDEX "idx_login_attempts_ip" ON "public"."login_attempts" USING "btree" ("ip_address", "created_at" DESC);



CREATE INDEX "idx_org_members_org_id" ON "public"."organization_members" USING "btree" ("organization_id");



CREATE INDEX "idx_org_members_user_id" ON "public"."organization_members" USING "btree" ("user_id");



CREATE INDEX "idx_parties_org_id" ON "public"."parties" USING "btree" ("organization_id");



CREATE UNIQUE INDEX "idx_parties_org_name_unique" ON "public"."parties" USING "btree" ("organization_id", "lower"(TRIM(BOTH FROM "name"))) WHERE ("is_active" = true);



CREATE INDEX "idx_products_active" ON "public"."products" USING "btree" ("organization_id", "is_active");



CREATE INDEX "idx_products_code" ON "public"."products" USING "btree" ("organization_id", "code");



CREATE INDEX "idx_products_org" ON "public"."products" USING "btree" ("organization_id");



CREATE INDEX "idx_profiles_user_id" ON "public"."profiles" USING "btree" ("user_id");



CREATE INDEX "idx_rate_limits_lookup" ON "public"."rate_limits" USING "btree" ("identifier", "action", "window_start");



CREATE INDEX "idx_stock_movements_date" ON "public"."stock_movements" USING "btree" ("movement_date");



CREATE INDEX "idx_stock_movements_org" ON "public"."stock_movements" USING "btree" ("organization_id");



CREATE INDEX "idx_stock_movements_org_product_date" ON "public"."stock_movements" USING "btree" ("organization_id", "product_id", "movement_date" DESC, "created_at" DESC);



CREATE INDEX "idx_stock_movements_product" ON "public"."stock_movements" USING "btree" ("product_id");



CREATE INDEX "idx_stock_movements_transaction" ON "public"."stock_movements" USING "btree" ("transaction_id");



CREATE INDEX "idx_transactions_date" ON "public"."transactions" USING "btree" ("organization_id", "transaction_date");



CREATE INDEX "idx_transactions_org_id" ON "public"."transactions" USING "btree" ("organization_id");



CREATE INDEX "idx_transactions_org_status_created" ON "public"."transactions" USING "btree" ("organization_id", "status", "created_at") WHERE ("original_transaction_id" IS NULL);



CREATE INDEX "idx_transactions_product" ON "public"."transactions" USING "btree" ("product_id");



CREATE INDEX "idx_transactions_status" ON "public"."transactions" USING "btree" ("organization_id", "status");



CREATE INDEX "idx_transactions_type" ON "public"."transactions" USING "btree" ("organization_id", "transaction_type");



CREATE OR REPLACE TRIGGER "protect_account_fields_trigger" BEFORE UPDATE ON "public"."accounts" FOR EACH ROW EXECUTE FUNCTION "public"."protect_account_fields"();



CREATE OR REPLACE TRIGGER "protect_organization_billing_trigger" BEFORE UPDATE ON "public"."organizations" FOR EACH ROW EXECUTE FUNCTION "public"."protect_organization_billing_columns"();



CREATE OR REPLACE TRIGGER "protect_product_stock_update_trigger" BEFORE UPDATE ON "public"."products" FOR EACH ROW EXECUTE FUNCTION "public"."protect_product_stock_update"();



CREATE OR REPLACE TRIGGER "record_initial_product_stock_trigger" AFTER INSERT ON "public"."products" FOR EACH ROW EXECUTE FUNCTION "public"."record_initial_product_stock"();



CREATE OR REPLACE TRIGGER "standardize_transaction_number_trigger" BEFORE INSERT ON "public"."transactions" FOR EACH ROW EXECUTE FUNCTION "public"."standardize_transaction_number"();



CREATE OR REPLACE TRIGGER "trg_enforce_journal_line_org_match" BEFORE INSERT OR UPDATE ON "public"."journal_lines" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_journal_line_org_match"();



ALTER TABLE ONLY "public"."account_mappings"
    ADD CONSTRAINT "account_mappings_credit_account_id_fkey" FOREIGN KEY ("credit_account_id") REFERENCES "public"."accounts"("id");



ALTER TABLE ONLY "public"."account_mappings"
    ADD CONSTRAINT "account_mappings_credit_account_same_org_fkey" FOREIGN KEY ("organization_id", "credit_account_id") REFERENCES "public"."accounts"("organization_id", "id");



ALTER TABLE ONLY "public"."account_mappings"
    ADD CONSTRAINT "account_mappings_debit_account_id_fkey" FOREIGN KEY ("debit_account_id") REFERENCES "public"."accounts"("id");



ALTER TABLE ONLY "public"."account_mappings"
    ADD CONSTRAINT "account_mappings_debit_account_same_org_fkey" FOREIGN KEY ("organization_id", "debit_account_id") REFERENCES "public"."accounts"("organization_id", "id");



ALTER TABLE ONLY "public"."account_mappings"
    ADD CONSTRAINT "account_mappings_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."accounts"
    ADD CONSTRAINT "accounts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."accounts"
    ADD CONSTRAINT "accounts_parent_account_id_fkey" FOREIGN KEY ("parent_account_id") REFERENCES "public"."accounts"("id");



ALTER TABLE ONLY "public"."attachments"
    ADD CONSTRAINT "attachments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."attachments"
    ADD CONSTRAINT "attachments_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."attachments"
    ADD CONSTRAINT "attachments_transaction_same_org_fkey" FOREIGN KEY ("organization_id", "transaction_id") REFERENCES "public"."transactions"("organization_id", "id");



ALTER TABLE ONLY "public"."attachments"
    ADD CONSTRAINT "attachments_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_logs_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_logs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."journal_entries"
    ADD CONSTRAINT "journal_entries_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."journal_entries"
    ADD CONSTRAINT "journal_entries_posted_by_fkey" FOREIGN KEY ("posted_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."journal_entries"
    ADD CONSTRAINT "journal_entries_reversed_entry_id_fkey" FOREIGN KEY ("reversed_entry_id") REFERENCES "public"."journal_entries"("id");



ALTER TABLE ONLY "public"."journal_entries"
    ADD CONSTRAINT "journal_entries_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id");



ALTER TABLE ONLY "public"."journal_entries"
    ADD CONSTRAINT "journal_entries_transaction_same_org_fkey" FOREIGN KEY ("organization_id", "transaction_id") REFERENCES "public"."transactions"("organization_id", "id");



ALTER TABLE ONLY "public"."journal_lines"
    ADD CONSTRAINT "journal_lines_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id");



ALTER TABLE ONLY "public"."journal_lines"
    ADD CONSTRAINT "journal_lines_account_same_org_fkey" FOREIGN KEY ("organization_id", "account_id") REFERENCES "public"."accounts"("organization_id", "id");



ALTER TABLE ONLY "public"."journal_lines"
    ADD CONSTRAINT "journal_lines_entry_same_org_fkey" FOREIGN KEY ("organization_id", "journal_entry_id") REFERENCES "public"."journal_entries"("organization_id", "id");



ALTER TABLE ONLY "public"."journal_lines"
    ADD CONSTRAINT "journal_lines_journal_entry_id_fkey" FOREIGN KEY ("journal_entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."journal_lines"
    ADD CONSTRAINT "journal_lines_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."journal_lines"
    ADD CONSTRAINT "journal_lines_party_id_fkey" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id");



ALTER TABLE ONLY "public"."journal_lines"
    ADD CONSTRAINT "journal_lines_party_same_org_fkey" FOREIGN KEY ("organization_id", "party_id") REFERENCES "public"."parties"("organization_id", "id");



ALTER TABLE ONLY "public"."organization_document_counters"
    ADD CONSTRAINT "organization_document_counters_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."organization_members"
    ADD CONSTRAINT "organization_members_invited_by_fkey" FOREIGN KEY ("invited_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."organization_members"
    ADD CONSTRAINT "organization_members_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."organization_members"
    ADD CONSTRAINT "organization_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."organizations"
    ADD CONSTRAINT "organizations_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."parties"
    ADD CONSTRAINT "parties_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_cogs_account_id_fkey" FOREIGN KEY ("cogs_account_id") REFERENCES "public"."accounts"("id");



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_cogs_account_same_org_fkey" FOREIGN KEY ("organization_id", "cogs_account_id") REFERENCES "public"."accounts"("organization_id", "id");



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_inventory_account_id_fkey" FOREIGN KEY ("inventory_account_id") REFERENCES "public"."accounts"("id");



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_inventory_account_same_org_fkey" FOREIGN KEY ("organization_id", "inventory_account_id") REFERENCES "public"."accounts"("organization_id", "id");



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_revenue_account_id_fkey" FOREIGN KEY ("revenue_account_id") REFERENCES "public"."accounts"("id");



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_revenue_account_same_org_fkey" FOREIGN KEY ("organization_id", "revenue_account_id") REFERENCES "public"."accounts"("organization_id", "id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."rate_limits"
    ADD CONSTRAINT "rate_limits_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."stock_movements"
    ADD CONSTRAINT "stock_movements_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."stock_movements"
    ADD CONSTRAINT "stock_movements_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."stock_movements"
    ADD CONSTRAINT "stock_movements_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."stock_movements"
    ADD CONSTRAINT "stock_movements_product_same_org_fkey" FOREIGN KEY ("organization_id", "product_id") REFERENCES "public"."products"("organization_id", "id");



ALTER TABLE ONLY "public"."stock_movements"
    ADD CONSTRAINT "stock_movements_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."stock_movements"
    ADD CONSTRAINT "stock_movements_transaction_same_org_fkey" FOREIGN KEY ("organization_id", "transaction_id") REFERENCES "public"."transactions"("organization_id", "id");



ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_cash_account_id_fkey" FOREIGN KEY ("cash_account_id") REFERENCES "public"."accounts"("id");



ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_cash_account_same_org_fkey" FOREIGN KEY ("organization_id", "cash_account_id") REFERENCES "public"."accounts"("organization_id", "id");



ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_destination_cash_account_id_fkey" FOREIGN KEY ("destination_cash_account_id") REFERENCES "public"."accounts"("id");



ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_destination_cash_account_same_org_fkey" FOREIGN KEY ("organization_id", "destination_cash_account_id") REFERENCES "public"."accounts"("organization_id", "id");



ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_original_transaction_id_fkey" FOREIGN KEY ("original_transaction_id") REFERENCES "public"."transactions"("id");



ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_party_id_fkey" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id");



ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_party_same_org_fkey" FOREIGN KEY ("organization_id", "party_id") REFERENCES "public"."parties"("organization_id", "id");



ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_posted_by_fkey" FOREIGN KEY ("posted_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_product_same_org_fkey" FOREIGN KEY ("organization_id", "product_id") REFERENCES "public"."products"("organization_id", "id");



ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_reversal_transaction_id_fkey" FOREIGN KEY ("reversal_transaction_id") REFERENCES "public"."transactions"("id");



ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_voided_by_fkey" FOREIGN KEY ("voided_by") REFERENCES "auth"."users"("id");



CREATE POLICY "Authenticated users can create organization" ON "public"."organizations" FOR INSERT WITH CHECK (("auth"."uid"() = "created_by"));



CREATE POLICY "Members can delete attachments" ON "public"."attachments" FOR DELETE USING (("public"."is_org_member"("organization_id") AND (("uploaded_by" = "auth"."uid"()) OR ("public"."get_org_role"("organization_id") = 'owner'::"text"))));



CREATE POLICY "Members can insert attachments" ON "public"."attachments" FOR INSERT WITH CHECK (("public"."is_org_member"("organization_id") AND ("uploaded_by" = "auth"."uid"())));



CREATE POLICY "Members can insert parties" ON "public"."parties" FOR INSERT WITH CHECK ("public"."is_org_member"("organization_id"));



CREATE POLICY "Members can update parties" ON "public"."parties" FOR UPDATE USING ("public"."is_org_member"("organization_id"));



CREATE POLICY "Members can view account mappings" ON "public"."account_mappings" FOR SELECT USING ("public"."is_org_member"("organization_id"));



CREATE POLICY "Members can view accounts" ON "public"."accounts" FOR SELECT USING ("public"."is_org_member"("organization_id"));



CREATE POLICY "Members can view attachments" ON "public"."attachments" FOR SELECT USING ("public"."is_org_member"("organization_id"));



CREATE POLICY "Members can view org members" ON "public"."organization_members" FOR SELECT USING ("public"."is_org_member"("organization_id"));



CREATE POLICY "Members can view organization" ON "public"."organizations" FOR SELECT USING ("public"."is_org_member"("id"));



CREATE POLICY "Members can view parties" ON "public"."parties" FOR SELECT USING ("public"."is_org_member"("organization_id"));



CREATE POLICY "Members can view products in their organization" ON "public"."products" FOR SELECT USING (("organization_id" IN ( SELECT "organization_members"."organization_id"
   FROM "public"."organization_members"
  WHERE (("organization_members"."user_id" = "auth"."uid"()) AND ("organization_members"."status" = 'active'::"public"."member_status")))));



CREATE POLICY "Members can view stock movements in their organization" ON "public"."stock_movements" FOR SELECT USING (("organization_id" IN ( SELECT "organization_members"."organization_id"
   FROM "public"."organization_members"
  WHERE (("organization_members"."user_id" = "auth"."uid"()) AND ("organization_members"."status" = 'active'::"public"."member_status")))));



CREATE POLICY "Members can view transactions" ON "public"."transactions" FOR SELECT USING ("public"."is_org_member"("organization_id"));



CREATE POLICY "Members with account permission can delete accounts" ON "public"."accounts" FOR DELETE USING (("public"."has_permission"("organization_id", 'can_manage_accounts'::"text") AND (NOT "is_system") AND (NOT "is_locked")));



CREATE POLICY "Members with account permission can insert accounts" ON "public"."accounts" FOR INSERT WITH CHECK ("public"."has_permission"("organization_id", 'can_manage_accounts'::"text"));



CREATE POLICY "Members with account permission can update accounts" ON "public"."accounts" FOR UPDATE USING (("public"."has_permission"("organization_id", 'can_manage_accounts'::"text") AND (((NOT "is_system") AND (NOT "is_locked")) OR ("is_system" AND (NOT "is_locked"))))) WITH CHECK (("public"."has_permission"("organization_id", 'can_manage_accounts'::"text") AND (((NOT "is_system") AND (NOT "is_locked")) OR ("is_system" AND (NOT "is_locked")))));



COMMENT ON POLICY "Members with account permission can update accounts" ON "public"."accounts" IS 'Allows renaming system accounts but protects code, type, and normal_balance via trigger';



CREATE POLICY "Members with audit permission can view audit logs" ON "public"."audit_logs" FOR SELECT USING ("public"."has_permission"("organization_id", 'can_view_audit_log'::"text"));



CREATE POLICY "Members with product permission can create products" ON "public"."products" FOR INSERT WITH CHECK ("public"."has_permission"("organization_id", 'can_manage_products'::"text"));



CREATE POLICY "Members with product permission can update products" ON "public"."products" FOR UPDATE USING ("public"."has_permission"("organization_id", 'can_manage_products'::"text")) WITH CHECK ("public"."has_permission"("organization_id", 'can_manage_products'::"text"));



CREATE POLICY "Members with report permission can view journal entries" ON "public"."journal_entries" FOR SELECT USING ("public"."has_permission"("organization_id", 'can_view_reports'::"text"));



CREATE POLICY "Members with report permission can view journal lines" ON "public"."journal_lines" FOR SELECT USING ("public"."has_permission"("organization_id", 'can_view_reports'::"text"));



CREATE POLICY "No direct access to counters" ON "public"."organization_document_counters" USING (false);



CREATE POLICY "No direct stock movement inserts" ON "public"."stock_movements" FOR INSERT WITH CHECK (false);



CREATE POLICY "Org members can view co-member profiles" ON "public"."profiles" FOR SELECT USING ((("user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM ("public"."organization_members" "viewer"
     JOIN "public"."organization_members" "subject" ON (("subject"."organization_id" = "viewer"."organization_id")))
  WHERE (("viewer"."user_id" = "auth"."uid"()) AND ("viewer"."status" = 'active'::"public"."member_status") AND ("subject"."user_id" = "profiles"."user_id") AND ("subject"."status" = 'active'::"public"."member_status"))))));



CREATE POLICY "Owner can delete parties" ON "public"."parties" FOR DELETE USING (("public"."is_org_member"("organization_id") AND ("public"."get_org_role"("organization_id") = 'owner'::"text")));



CREATE POLICY "Owner can manage account mappings" ON "public"."account_mappings" USING (("public"."is_org_member"("organization_id") AND ("public"."get_org_role"("organization_id") = 'owner'::"text")));



CREATE POLICY "Owners can delete products" ON "public"."products" FOR DELETE USING (("public"."get_org_role"("organization_id") = 'owner'::"text"));



CREATE POLICY "Users can insert own profile" ON "public"."profiles" FOR INSERT WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can update own profile" ON "public"."profiles" FOR UPDATE USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can view own profile" ON "public"."profiles" FOR SELECT USING (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."account_mappings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."accounts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."attachments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."audit_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."journal_entries" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."journal_lines" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."login_attempts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "org_rate_limits_select" ON "public"."rate_limits" FOR SELECT USING (("organization_id" IN ( SELECT "organization_members"."organization_id"
   FROM "public"."organization_members"
  WHERE ("organization_members"."user_id" = "auth"."uid"()))));



ALTER TABLE "public"."organization_document_counters" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."organization_members" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."organizations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."parties" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."products" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."rate_limits" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."stock_movements" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "system_login_attempts_insert" ON "public"."login_attempts" FOR INSERT WITH CHECK (true);



ALTER TABLE "public"."transactions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "user_own_login_attempts" ON "public"."login_attempts" FOR SELECT USING (("email" = (( SELECT "users"."email"
   FROM "auth"."users"
  WHERE ("users"."id" = "auth"."uid"())))::"text"));



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."check_rate_limit"("p_identifier" "text", "p_action" "text", "p_max_attempts" integer, "p_window_seconds" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_rate_limit"("p_identifier" "text", "p_action" "text", "p_max_attempts" integer, "p_window_seconds" integer) TO "anon";



REVOKE ALL ON FUNCTION "public"."create_default_accounts"("p_org_id" "uuid", "p_org_name" "text") FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION "public"."create_default_accounts"("p_org_id" "uuid", "p_org_name" "text") FROM anon, authenticated;



REVOKE ALL ON FUNCTION "public"."create_organization_with_opening_balances"("p_organization_name" "text", "p_business_type" "public"."business_type", "p_books_start_date" "date", "p_default_cash_account_name" "text", "p_opening_cash_balance" numeric, "p_extra_opening_balances" "jsonb") FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION "public"."create_organization_with_opening_balances"("p_organization_name" "text", "p_business_type" "public"."business_type", "p_books_start_date" "date", "p_default_cash_account_name" "text", "p_opening_cash_balance" numeric, "p_extra_opening_balances" "jsonb") FROM anon;
GRANT ALL ON FUNCTION "public"."create_organization_with_opening_balances"("p_organization_name" "text", "p_business_type" "public"."business_type", "p_books_start_date" "date", "p_default_cash_account_name" "text", "p_opening_cash_balance" numeric, "p_extra_opening_balances" "jsonb") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."generate_entry_number"("p_organization_id" "uuid") FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION "public"."generate_entry_number"("p_organization_id" "uuid") FROM anon, authenticated;



REVOKE ALL ON FUNCTION "public"."generate_transaction_number"("p_organization_id" "uuid") FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION "public"."generate_transaction_number"("p_organization_id" "uuid") FROM anon, authenticated;



REVOKE ALL ON FUNCTION "public"."generate_transaction_number"("p_organization_id" "uuid", "p_transaction_date" "date") FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION "public"."generate_transaction_number"("p_organization_id" "uuid", "p_transaction_date" "date") FROM anon, authenticated;



REVOKE EXECUTE ON FUNCTION "public"."get_account_balance"("p_account_id" "uuid", "p_as_of_date" "date") FROM anon;
GRANT ALL ON FUNCTION "public"."get_account_balance"("p_account_id" "uuid", "p_as_of_date" "date") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."get_account_by_code"("p_org_id" "uuid", "p_code" integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION "public"."get_account_by_code"("p_org_id" "uuid", "p_code" integer) FROM anon, authenticated;



REVOKE EXECUTE ON FUNCTION "public"."get_balance_sheet"("p_organization_id" "uuid", "p_as_of_date" "date") FROM anon;
GRANT ALL ON FUNCTION "public"."get_balance_sheet"("p_organization_id" "uuid", "p_as_of_date" "date") TO "authenticated";



REVOKE EXECUTE ON FUNCTION "public"."get_dashboard_summary"("p_organization_id" "uuid", "p_from_date" "date", "p_to_date" "date") FROM anon;
GRANT ALL ON FUNCTION "public"."get_dashboard_summary"("p_organization_id" "uuid", "p_from_date" "date", "p_to_date" "date") TO "authenticated";



REVOKE EXECUTE ON FUNCTION "public"."get_monthly_summary"("p_organization_id" "uuid", "p_month" "date") FROM anon;
GRANT ALL ON FUNCTION "public"."get_monthly_summary"("p_organization_id" "uuid", "p_month" "date") TO "authenticated";



GRANT ALL ON FUNCTION "public"."get_monthly_transaction_count"("p_org_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."get_monthly_usage"("p_org_id" "uuid") FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION "public"."get_monthly_usage"("p_org_id" "uuid") FROM anon;
GRANT ALL ON FUNCTION "public"."get_monthly_usage"("p_org_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."get_next_counter"("p_organization_id" "uuid", "p_counter_name" "text") FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION "public"."get_next_counter"("p_organization_id" "uuid", "p_counter_name" "text") FROM anon, authenticated;



GRANT ALL ON FUNCTION "public"."get_product_info"("p_product_id" "uuid") TO "authenticated";



REVOKE EXECUTE ON FUNCTION "public"."get_profit_loss"("p_organization_id" "uuid", "p_from_date" "date", "p_to_date" "date") FROM anon;
GRANT ALL ON FUNCTION "public"."get_profit_loss"("p_organization_id" "uuid", "p_from_date" "date", "p_to_date" "date") TO "authenticated";



REVOKE EXECUTE ON FUNCTION "public"."get_trial_balance"("p_organization_id" "uuid", "p_as_of_date" "date") FROM anon;
GRANT ALL ON FUNCTION "public"."get_trial_balance"("p_organization_id" "uuid", "p_as_of_date" "date") TO "authenticated";



REVOKE EXECUTE ON FUNCTION "public"."invite_staff"("p_organization_id" "uuid", "p_email" "text") FROM anon;
GRANT ALL ON FUNCTION "public"."invite_staff"("p_organization_id" "uuid", "p_email" "text") TO "authenticated";



GRANT ALL ON FUNCTION "public"."is_email_rate_limited"("p_email" "text", "p_max_attempts" integer, "p_lockout_minutes" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_email_rate_limited"("p_email" "text", "p_max_attempts" integer, "p_lockout_minutes" integer) TO "anon";



REVOKE ALL ON FUNCTION "public"."log_security_event"("p_organization_id" "uuid", "p_user_id" "uuid", "p_action" "text", "p_resource_type" "text", "p_resource_id" "text", "p_details" "jsonb", "p_ip_address" "inet", "p_user_agent" "text") FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION "public"."log_security_event"("p_organization_id" "uuid", "p_user_id" "uuid", "p_action" "text", "p_resource_type" "text", "p_resource_id" "text", "p_details" "jsonb", "p_ip_address" "inet", "p_user_agent" "text") FROM anon, authenticated;



REVOKE ALL ON FUNCTION "public"."post_opening_balance"("p_organization_id" "uuid", "p_account_id" "uuid", "p_amount" numeric, "p_description" "text", "p_entry_date" "date") FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION "public"."post_opening_balance"("p_organization_id" "uuid", "p_account_id" "uuid", "p_amount" numeric, "p_description" "text", "p_entry_date" "date") FROM anon;
GRANT ALL ON FUNCTION "public"."post_opening_balance"("p_organization_id" "uuid", "p_account_id" "uuid", "p_amount" numeric, "p_description" "text", "p_entry_date" "date") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."post_transaction"("p_organization_id" "uuid", "p_transaction_date" "date", "p_transaction_type" "text", "p_amount" numeric, "p_party_id" "uuid", "p_category_name" "text", "p_cash_account_id" "uuid", "p_destination_cash_account_id" "uuid", "p_payment_status" "text", "p_partial_amount" numeric, "p_due_date" "date", "p_description" "text", "p_notes" "text", "p_product_id" "uuid", "p_quantity" numeric, "p_unit_price" numeric, "p_debit_account_id" "uuid") FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION "public"."post_transaction"("p_organization_id" "uuid", "p_transaction_date" "date", "p_transaction_type" "text", "p_amount" numeric, "p_party_id" "uuid", "p_category_name" "text", "p_cash_account_id" "uuid", "p_destination_cash_account_id" "uuid", "p_payment_status" "text", "p_partial_amount" numeric, "p_due_date" "date", "p_description" "text", "p_notes" "text", "p_product_id" "uuid", "p_quantity" numeric, "p_unit_price" numeric, "p_debit_account_id" "uuid") FROM anon;
GRANT ALL ON FUNCTION "public"."post_transaction"("p_organization_id" "uuid", "p_transaction_date" "date", "p_transaction_type" "text", "p_amount" numeric, "p_party_id" "uuid", "p_category_name" "text", "p_cash_account_id" "uuid", "p_destination_cash_account_id" "uuid", "p_payment_status" "text", "p_partial_amount" numeric, "p_due_date" "date", "p_description" "text", "p_notes" "text", "p_product_id" "uuid", "p_quantity" numeric, "p_unit_price" numeric, "p_debit_account_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."post_transaction_impl_20260702"("p_organization_id" "uuid", "p_transaction_date" "date", "p_transaction_type" "text", "p_amount" "numeric", "p_party_id" "uuid", "p_category_name" "text", "p_cash_account_id" "uuid", "p_destination_cash_account_id" "uuid", "p_payment_status" "text", "p_partial_amount" "numeric", "p_due_date" "date", "p_description" "text", "p_notes" "text", "p_product_id" "uuid", "p_quantity" "numeric", "p_unit_price" "numeric") FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION "public"."post_transaction_impl_20260702"("p_organization_id" "uuid", "p_transaction_date" "date", "p_transaction_type" "text", "p_amount" "numeric", "p_party_id" "uuid", "p_category_name" "text", "p_cash_account_id" "uuid", "p_destination_cash_account_id" "uuid", "p_payment_status" "text", "p_partial_amount" "numeric", "p_due_date" "date", "p_description" "text", "p_notes" "text", "p_product_id" "uuid", "p_quantity" "numeric", "p_unit_price" "numeric") FROM anon, authenticated;



REVOKE ALL ON FUNCTION "public"."protect_product_stock_update"() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION "public"."protect_product_stock_update"() FROM anon, authenticated;



REVOKE ALL ON FUNCTION "public"."recalculate_product_average_cost"("p_product_id" "uuid") FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION "public"."recalculate_product_average_cost"("p_product_id" "uuid") FROM anon, authenticated;
GRANT ALL ON FUNCTION "public"."recalculate_product_average_cost"("p_product_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."record_initial_product_stock"() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION "public"."record_initial_product_stock"() FROM anon, authenticated;



REVOKE ALL ON FUNCTION "public"."record_login_attempt"("p_email" "text", "p_success" boolean, "p_ip_address" "inet", "p_user_agent" "text", "p_error_message" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."record_login_attempt"("p_email" "text", "p_success" boolean, "p_ip_address" "inet", "p_user_agent" "text", "p_error_message" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."record_login_attempt_pre_auth"("p_email" "text", "p_success" boolean, "p_user_agent" "text", "p_error_message" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."record_login_attempt_pre_auth"("p_email" "text", "p_success" boolean, "p_user_agent" "text", "p_error_message" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."record_login_attempt_pre_auth"("p_email" "text", "p_success" boolean, "p_user_agent" "text", "p_error_message" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."record_stock_movement"("p_organization_id" "uuid", "p_product_id" "uuid", "p_movement_date" "date", "p_movement_type" "text", "p_quantity" numeric, "p_unit_cost" numeric, "p_transaction_id" "uuid", "p_notes" "text") FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION "public"."record_stock_movement"("p_organization_id" "uuid", "p_product_id" "uuid", "p_movement_date" "date", "p_movement_type" "text", "p_quantity" numeric, "p_unit_cost" numeric, "p_transaction_id" "uuid", "p_notes" "text") FROM anon, authenticated;



REVOKE EXECUTE ON FUNCTION "public"."remove_staff"("p_organization_id" "uuid", "p_member_id" "uuid") FROM anon;
GRANT ALL ON FUNCTION "public"."remove_staff"("p_organization_id" "uuid", "p_member_id" "uuid") TO "authenticated";



GRANT ALL ON FUNCTION "public"."rename_account"("p_account_id" "uuid", "p_new_name" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."standardize_transaction_number"() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION "public"."standardize_transaction_number"() FROM anon, authenticated;



REVOKE ALL ON FUNCTION "public"."update_product_stock"("p_product_id" "uuid", "p_quantity_delta" numeric) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION "public"."update_product_stock"("p_product_id" "uuid", "p_quantity_delta" numeric) FROM anon, authenticated;



REVOKE EXECUTE ON FUNCTION "public"."update_staff_permissions"("p_organization_id" "uuid", "p_member_id" "uuid", "p_can_create_transaction" boolean, "p_can_view_reports" boolean, "p_can_manage_accounts" boolean, "p_can_void_transaction" boolean, "p_can_manage_products" boolean, "p_can_view_audit_log" boolean) FROM anon;
GRANT ALL ON FUNCTION "public"."update_staff_permissions"("p_organization_id" "uuid", "p_member_id" "uuid", "p_can_create_transaction" boolean, "p_can_view_reports" boolean, "p_can_manage_accounts" boolean, "p_can_void_transaction" boolean, "p_can_manage_products" boolean, "p_can_view_audit_log" boolean) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."validate_product_sale_accounts"("p_organization_id" "uuid", "p_product_id" "uuid") FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION "public"."validate_product_sale_accounts"("p_organization_id" "uuid", "p_product_id" "uuid") FROM anon, authenticated;



REVOKE EXECUTE ON FUNCTION "public"."void_transaction"("p_organization_id" "uuid", "p_transaction_id" "uuid", "p_void_reason" "text", "p_void_date" "date") FROM anon;
GRANT ALL ON FUNCTION "public"."void_transaction"("p_organization_id" "uuid", "p_transaction_id" "uuid", "p_void_reason" "text", "p_void_date" "date") TO "authenticated";



-- anon/authenticated: no dangerous table privileges (REFERENCES, TRIGGER, TRUNCATE, MAINTAIN).
-- These roles operate via SECURITY DEFINER RPCs and RLS policies.
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."account_mappings" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."accounts" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."attachments" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."audit_logs" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."journal_entries" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."journal_lines" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."parties" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."transactions" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."general_ledger" TO "service_role";



GRANT SELECT ON TABLE "public"."login_attempts" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."login_attempts" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."organization_document_counters" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."organization_members" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."organizations" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."products" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."profiles" TO "service_role";



GRANT SELECT ON TABLE "public"."rate_limits" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."rate_limits" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."stock_movements" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT UPDATE ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT UPDATE ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT UPDATE ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
-- Future tables: only service_role gets dangerous privileges.
-- anon and authenticated operate through SECURITY DEFINER RPCs.
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLES TO "service_role";

-- ═══════════════════════════════════════════════════════════════════
-- Security hardening: explicitly REVOKE dangerous privileges that
-- Supabase may auto-grant during db reset / stack start.
-- These statements ensure anon and authenticated NEVER have
-- TRUNCATE, TRIGGER, REFERENCES, or MAINTAIN on any public table.
-- ═══════════════════════════════════════════════════════════════════
DO $$
DECLARE
  t RECORD;
BEGIN
  FOR t IN
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
  LOOP
    EXECUTE format(
      'REVOKE TRUNCATE, TRIGGER, REFERENCES, MAINTAIN ON TABLE public.%I FROM anon, authenticated',
      t.tablename
    );
  END LOOP;
END $$;






