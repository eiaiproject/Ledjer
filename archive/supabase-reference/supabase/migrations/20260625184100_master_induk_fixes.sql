-- =============================================================================
-- LEDJER — Master Induk Fixes Migration
-- =============================================================================

-- ═══════════════════════════════════════════════════════════════════
-- P0-1: Remove duplicate update_staff_permissions overload
-- ═══════════════════════════════════════════════════════════════════
DROP FUNCTION IF EXISTS public.update_staff_permissions(uuid, uuid, boolean, boolean, boolean, boolean, boolean);

-- ═══════════════════════════════════════════════════════════════════
-- P1-1: Lock down login_attempts direct inserts
-- ═══════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS system_login_attempts_insert ON public.login_attempts;
REVOKE INSERT ON TABLE public.login_attempts FROM anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════
-- P1-3: Idempotency column and index for transactions
-- ═══════════════════════════════════════════════════════════════════
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS client_token UUID;
DROP INDEX IF EXISTS public.transactions_org_client_token_idx;
CREATE UNIQUE INDEX transactions_org_client_token_idx ON public.transactions(organization_id, client_token) WHERE client_token IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════
-- P1-4: Remove dead post_transaction_impl_20260702
-- ═══════════════════════════════════════════════════════════════════
DROP FUNCTION IF EXISTS public.post_transaction_impl_20260702(uuid, date, text, numeric, uuid, text, uuid, uuid, text, numeric, date, text, text, uuid, numeric, numeric);

-- ═══════════════════════════════════════════════════════════════════
-- P2-6: Harden record_login_attempt post-auth
-- ═══════════════════════════════════════════════════════════════════
DROP FUNCTION IF EXISTS public.record_login_attempt(text, boolean, inet, text, text);

CREATE OR REPLACE FUNCTION public.record_login_attempt(
  p_email text,
  p_user_agent text DEFAULT NULL,
  p_error_message text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.login_attempts (email, success, ip_address, user_agent, error_message)
  VALUES (lower(p_email), true, inet_client_addr(), substring(p_user_agent from 1 for 512), substring(p_error_message from 1 for 1024));
  DELETE FROM public.login_attempts WHERE created_at < now() - INTERVAL '24 hours';
END;
$$;

ALTER FUNCTION public.record_login_attempt(text, text, text) OWNER TO postgres;
REVOKE EXECUTE ON FUNCTION public.record_login_attempt(text, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.record_login_attempt(text, text, text) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════
-- P2-7: Standardize service_role checks and create_default_accounts search_path
-- ═══════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.create_default_accounts(
  p_org_id uuid,
  p_org_name text
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
    (p_org_id, 6180, 'Beban Software', 'expense', 'debit', true, false, 'Beban Usaha', false),
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

ALTER FUNCTION public.create_default_accounts(uuid, text) OWNER TO postgres;

-- Standardize protect_account_fields
CREATE OR REPLACE FUNCTION public.protect_account_fields() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
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
  END IF;

  -- Standardized service_role / trusted role check
  IF current_setting('role', true) NOT IN ('service_role', 'postgres') THEN
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

-- Standardize protect_organization_core_fields
CREATE OR REPLACE FUNCTION public.protect_organization_core_fields() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  -- Allow service_role and trusted functions to update protected columns
  IF current_setting('role', true) IN ('service_role', 'postgres') THEN
    RETURN NEW;
  END IF;

  IF OLD.created_by IS DISTINCT FROM NEW.created_by THEN
    RAISE EXCEPTION 'Cannot modify created_by field';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_organization_core_fields_trigger ON public.organizations;
CREATE TRIGGER protect_organization_core_fields_trigger
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_organization_core_fields();

-- ═══════════════════════════════════════════════════════════════════
-- P1-2 (b): True moving weighted average cost recalculation
-- ═══════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.recalculate_product_average_cost(p_product_id uuid) RETURNS numeric
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_running_qty NUMERIC := 0;
  v_running_value NUMERIC := 0;
  v_avg_cost NUMERIC := 0;
  r RECORD;
BEGIN
  -- Validate product exists and get organization
  SELECT organization_id, purchase_price
  INTO v_org_id, v_avg_cost
  FROM public.products
  WHERE id = p_product_id AND is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Produk tidak ditemukan atau tidak aktif';
  END IF;

  -- Iterate over all stock movements in chronological order
  FOR r IN
    SELECT sm.id, sm.movement_type, sm.quantity, sm.unit_cost, t.transaction_type, t.original_transaction_id
    FROM public.stock_movements sm
    LEFT JOIN public.transactions t ON t.id = sm.transaction_id
    WHERE sm.product_id = p_product_id
      AND sm.organization_id = v_org_id
    -- Chronological by business date first so backdated entries are folded in
    -- the correct order; created_at + void-flag + id break same-date ties
    -- deterministically (important when several movements share one txn clock).
    ORDER BY sm.movement_date ASC,
             sm.created_at ASC,
             CASE WHEN sm.movement_type = 'void' THEN 1 ELSE 0 END ASC,
             sm.id ASC
  LOOP
    -- Opening balance or purchase or purchase void:
    IF r.movement_type = 'opening_balance' THEN
      v_running_qty := v_running_qty + r.quantity;
      v_running_value := v_running_value + (r.quantity * COALESCE(r.unit_cost, 0));
      IF v_running_qty > 0 THEN
        v_avg_cost := v_running_value / v_running_qty;
      END IF;
    ELSIF r.movement_type = 'purchase' THEN
      v_running_qty := v_running_qty + r.quantity;
      v_running_value := v_running_value + (r.quantity * COALESCE(r.unit_cost, 0));
      IF v_running_qty > 0 THEN
        v_avg_cost := v_running_value / v_running_qty;
      END IF;
    ELSIF r.movement_type = 'void' AND r.transaction_type IN ('cash_purchase', 'credit_purchase') THEN
      -- Purchase void: quantity is negative, so this subtracts qty.
      -- Reverses at the unit_cost of the original purchase.
      v_running_qty := v_running_qty + r.quantity;
      v_running_value := v_running_value + (r.quantity * COALESCE(r.unit_cost, 0));
      IF v_running_qty > 0 THEN
        v_avg_cost := v_running_value / v_running_qty;
      END IF;
    ELSIF r.movement_type = 'void' AND r.transaction_type IN ('cash_sale', 'credit_sale') THEN
      -- Sale void: returned stock comes back at the original sale cost, so it
      -- can change the moving average if later purchases happened at a different cost.
      v_running_qty := v_running_qty + r.quantity;
      v_running_value := v_running_value + (r.quantity * COALESCE(r.unit_cost, v_avg_cost, 0));
      IF v_running_qty > 0 THEN
        v_avg_cost := v_running_value / v_running_qty;
      END IF;
    ELSE
      -- Sale or adjustment: reduce/add value at the movement cost basis.
      v_running_qty := v_running_qty + r.quantity;
      v_running_value := v_running_value + (r.quantity * COALESCE(r.unit_cost, v_avg_cost, 0));
      IF v_running_qty > 0 THEN
        v_avg_cost := v_running_value / v_running_qty;
      END IF;
    END IF;
    
    -- Floor checks to prevent rounding errors going negative
    IF v_running_qty <= 0 THEN
      v_running_qty := 0;
      v_running_value := 0;
      -- Don't reset v_avg_cost — preserve last known average for subsequent purchases.
    END IF;
    IF v_running_value < 0 THEN
      v_running_value := 0;
    END IF;
  END LOOP;

  -- Ensure non-negative average cost
  v_avg_cost := GREATEST(COALESCE(v_avg_cost, 0), 0);

  -- Update product's purchase price
  UPDATE public.products
  SET purchase_price = v_avg_cost,
      updated_at = now()
  WHERE id = p_product_id;

  RETURN v_avg_cost;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════
-- P2-1: Extend post_opening_balance to support AR, AP, equity
-- ═══════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.post_opening_balance(
  p_organization_id uuid,
  p_account_id uuid,
  p_amount numeric,
  p_description text,
  p_entry_date date
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user_id            UUID;
  v_role               TEXT;
  v_onboarding_status  TEXT;
  v_has_normal_txn     BOOLEAN;
  v_books_start_date   DATE;
  v_account_type       TEXT;
  v_is_cash_account    BOOLEAN;
  v_normal_balance     TEXT;
  v_account_code       INTEGER;
  v_saldo_awal_id      UUID;
  v_entry_number       TEXT;
  v_txn_number         TEXT;
  v_journal_id         UUID;
  v_txn_id             UUID;
  v_opening_txn_type   TEXT;
BEGIN
  -- ── Auth ──
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- ── Membership ──
  SELECT role::TEXT INTO v_role
  FROM public.organization_members
  WHERE organization_id = p_organization_id
    AND user_id = v_user_id
    AND status = 'active'
  LIMIT 1;

  IF v_role IS NULL THEN
    RAISE EXCEPTION 'You are not a member of this organization';
  END IF;
  IF v_role != 'owner' THEN
    RAISE EXCEPTION 'Hanya pemilik yang dapat memposting saldo awal';
  END IF;

  -- Check onboarding status
  SELECT onboarding_status::TEXT INTO v_onboarding_status
  FROM public.organizations WHERE id = p_organization_id;

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
  ) INTO v_has_normal_txn;

  IF v_has_normal_txn THEN
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

  SELECT account_type::TEXT, is_cash_account, normal_balance::TEXT, code
  INTO v_account_type, v_is_cash_account, v_normal_balance, v_account_code
  FROM public.accounts
  WHERE id = p_account_id
    AND organization_id = p_organization_id
    AND is_active = true;

  IF v_account_type IS NULL THEN
    RAISE EXCEPTION 'Opening balance account not found or inactive';
  END IF;

  -- Allowed accounts: Cash/bank, AR (1200), AP (2100), or Equity
  IF NOT (
    (v_account_type = 'asset' AND v_is_cash_account IS TRUE) OR
    (v_account_type = 'asset' AND v_account_code = 1200) OR
    (v_account_type = 'liability' AND v_account_code = 2100) OR
    (v_account_type = 'equity')
  ) THEN
    RAISE EXCEPTION 'Opening balance account must be an active cash/bank, AR (1200), AP (2100), or equity account';
  END IF;

  SELECT id INTO v_saldo_awal_id
  FROM public.accounts
  WHERE organization_id = p_organization_id
    AND code = 3200 AND is_active = true
  LIMIT 1;

  IF v_saldo_awal_id IS NULL THEN
    RAISE EXCEPTION 'Saldo Awal account not found';
  END IF;

  -- Determine transaction type
  IF v_account_type = 'asset' AND v_is_cash_account IS TRUE THEN
    v_opening_txn_type := 'opening_cash_balance';
  ELSIF v_account_type = 'asset' AND v_account_code = 1200 THEN
    v_opening_txn_type := 'opening_receivable_balance';
  ELSIF v_account_type = 'liability' AND v_account_code = 2100 THEN
    v_opening_txn_type := 'opening_payable_balance';
  ELSIF v_account_type = 'equity' THEN
    v_opening_txn_type := 'opening_equity_balance';
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

  -- Debit vs Credit logic based on normal balance
  IF v_normal_balance = 'debit' THEN
    INSERT INTO public.journal_lines (
      organization_id, journal_entry_id, account_id,
      debit, credit, description, line_order
    ) VALUES
      (p_organization_id, v_journal_id, p_account_id, p_amount, 0, p_description, 1),
      (p_organization_id, v_journal_id, v_saldo_awal_id, 0, p_amount, p_description, 2);
  ELSE
    INSERT INTO public.journal_lines (
      organization_id, journal_entry_id, account_id,
      debit, credit, description, line_order
    ) VALUES
      (p_organization_id, v_journal_id, v_saldo_awal_id, p_amount, 0, p_description, 1),
      (p_organization_id, v_journal_id, p_account_id, 0, p_amount, p_description, 2);
  END IF;

  INSERT INTO public.transactions (
    organization_id, transaction_number, transaction_date,
    transaction_type, amount, cash_account_id,
    description, status, posted_at, posted_by, created_by
  ) VALUES (
    p_organization_id, v_txn_number, p_entry_date,
    v_opening_txn_type, p_amount,
    CASE WHEN v_opening_txn_type = 'opening_cash_balance' THEN p_account_id ELSE NULL END,
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
      'transaction_type', v_opening_txn_type,
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

-- ═══════════════════════════════════════════════════════════════════
-- P1-3: Redefine post_transaction with client_token and zero-cost sale check
-- ═══════════════════════════════════════════════════════════════════
DROP FUNCTION IF EXISTS public.post_transaction(uuid, date, text, numeric, uuid, text, uuid, uuid, text, numeric, date, text, text, uuid, numeric, numeric, uuid);
DROP FUNCTION IF EXISTS public.post_transaction(uuid, date, text, numeric, uuid, text, uuid, uuid, text, numeric, date, text, text, uuid, numeric, numeric, uuid, uuid);

CREATE OR REPLACE FUNCTION public.post_transaction(
  p_organization_id uuid,
  p_transaction_date date,
  p_transaction_type text,
  p_amount numeric,
  p_party_id uuid DEFAULT NULL,
  p_category_name text DEFAULT NULL,
  p_cash_account_id uuid DEFAULT NULL,
  p_destination_cash_account_id uuid DEFAULT NULL,
  p_payment_status text DEFAULT 'paid',
  p_partial_amount numeric DEFAULT NULL,
  p_due_date date DEFAULT NULL,
  p_description text DEFAULT '',
  p_notes text DEFAULT NULL,
  p_product_id uuid DEFAULT NULL,
  p_quantity numeric DEFAULT NULL,
  p_unit_price numeric DEFAULT NULL,
  p_debit_account_id uuid DEFAULT NULL,
  p_client_token uuid DEFAULT NULL,
  p_party_name text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user_id            UUID;
  v_role               TEXT;
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
  v_party_name          TEXT;
  v_party_type          public.party_type;
  
  -- Idempotency check variables
  v_existing_txn_id UUID;
  v_existing_txn_number TEXT;
  v_existing_amount NUMERIC;
  v_existing_je_id UUID;
  v_existing_je_number TEXT;
  v_existing_impact JSONB;
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
    RAISE EXCEPTION 'Anda bukan anggota dari organisasi ini';
  END IF;

  -- ── Idempotency Check ──
  IF p_client_token IS NOT NULL THEN
    SELECT t.id, t.transaction_number, t.amount, je.id, je.entry_number
    INTO v_existing_txn_id, v_existing_txn_number, v_existing_amount, v_existing_je_id, v_existing_je_number
    FROM public.transactions t
    LEFT JOIN public.journal_entries je ON je.transaction_id = t.id
    WHERE t.organization_id = p_organization_id AND t.client_token = p_client_token
    LIMIT 1;

    IF v_existing_txn_id IS NOT NULL THEN
      -- Rebuild the impact payload from the existing journal's primary debit
      -- and credit lines (lowest line_order on each side). max() cannot be used
      -- here because account_id is a uuid (no max(uuid) aggregate exists).
      SELECT jsonb_build_object(
        'debit_account_id',  d.account_id,
        'debit_account',     d.name,
        'debit_change',      CASE WHEN d.normal_balance = 'debit' THEN 'increase' ELSE 'decrease' END,
        'credit_account_id', c.account_id,
        'credit_account',    c.name,
        'credit_change',     CASE WHEN c.normal_balance = 'credit' THEN 'increase' ELSE 'decrease' END,
        'amount',            v_existing_amount
      ) INTO v_existing_impact
      FROM
        (SELECT jl.account_id, a.name, a.normal_balance::text AS normal_balance
           FROM public.journal_lines jl
           JOIN public.accounts a ON a.id = jl.account_id
          WHERE jl.journal_entry_id = v_existing_je_id AND jl.debit > 0
          ORDER BY jl.line_order, jl.id LIMIT 1) d,
        (SELECT jl.account_id, a.name, a.normal_balance::text AS normal_balance
           FROM public.journal_lines jl
           JOIN public.accounts a ON a.id = jl.account_id
          WHERE jl.journal_entry_id = v_existing_je_id AND jl.credit > 0
          ORDER BY jl.line_order, jl.id LIMIT 1) c;

      RETURN jsonb_build_object(
        'transaction_id',     v_existing_txn_id,
        'transaction_number', v_existing_txn_number,
        'journal_entry_id',   v_existing_je_id,
        'entry_number',       v_existing_je_number,
        'impact',             v_existing_impact
      );
    END IF;
  END IF;

  -- ── Phase 4 Guard: Reject opening balance types ──
  IF p_transaction_type IN (
    'opening_cash_balance',
    'opening_receivable_balance',
    'opening_payable_balance',
    'opening_equity_balance'
  ) THEN
    RAISE EXCEPTION 'Saldo awal tidak dapat dicatat melalui transaksi umum. Gunakan alur pemasangan saldo awal.';
  END IF;

  -- ── Books Start Date Guard ──
  SELECT books_start_date INTO v_books_start_date
  FROM public.organizations WHERE id = p_organization_id;

  IF v_books_start_date IS NULL THEN
    RAISE EXCEPTION 'Organisasi tidak ditemukan';
  END IF;

  IF p_transaction_date < v_books_start_date THEN
    RAISE EXCEPTION 'Tanggal transaksi % sebelum tanggal mulai pembukuan %',
      p_transaction_date, v_books_start_date;
  END IF;

  -- ── Product Validation ──
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

    -- P1-2 (a): Zero-cost sale block
    IF p_transaction_type IN ('cash_sale', 'credit_sale') THEN
      IF COALESCE(v_product_purchase_price, 0) = 0 THEN
        RAISE EXCEPTION 'Harga pokok produk belum diatur. Harap atur harga pokok (purchase_price) sebelum mencatat penjualan.';
      END IF;
      PERFORM public.validate_product_sale_accounts(p_organization_id, p_product_id);
    END IF;
  END IF;

  -- ── Server-side party resolution (atomic with transaction posting) ──
  IF p_party_id IS NULL AND p_party_name IS NOT NULL AND btrim(p_party_name) != '' THEN
    v_party_name := btrim(p_party_name);
    v_party_type := CASE
      WHEN p_transaction_type IN ('credit_sale', 'receive_receivable') THEN 'customer'::public.party_type
      WHEN p_transaction_type IN ('credit_purchase', 'pay_payable') THEN 'supplier'::public.party_type
      ELSE 'other'::public.party_type
    END;

    INSERT INTO public.parties (organization_id, name, party_type, is_active)
    VALUES (p_organization_id, v_party_name, v_party_type, true)
    ON CONFLICT (organization_id, lower(TRIM(BOTH FROM name))) WHERE is_active = true
    DO UPDATE SET name = public.parties.name
    RETURNING id INTO p_party_id;
  END IF;

  -- ── Cash account required for certain types ──
  IF p_transaction_type IN (
    'cash_sale', 'receive_receivable', 'cash_purchase', 'pay_payable',
    'expense_payment', 'owner_capital', 'owner_draw', 'cash_transfer'
  ) THEN
    IF p_cash_account_id IS NULL THEN
      RAISE EXCEPTION 'Akun kas diperlukan untuk tipe transaksi ini';
    END IF;

    SELECT account_type::TEXT, is_cash_account
    INTO v_account_type, v_is_cash_account
    FROM public.accounts
    WHERE id = p_cash_account_id
      AND organization_id = p_organization_id
      AND is_active = true;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Akun kas tidak ditemukan';
    END IF;
    IF v_account_type != 'asset' OR v_is_cash_account != true THEN
      RAISE EXCEPTION 'Akun kas tidak valid';
    END IF;
  END IF;

  -- ── Destination cash account required for transfers ──
  IF p_transaction_type = 'cash_transfer' THEN
    IF p_destination_cash_account_id IS NULL THEN
      RAISE EXCEPTION 'Akun kas tujuan diperlukan untuk transfer';
    END IF;
    IF p_cash_account_id = p_destination_cash_account_id THEN
      RAISE EXCEPTION 'Akun kas sumber dan tujuan tidak boleh sama';
    END IF;

    SELECT account_type::TEXT, is_cash_account
    INTO v_account_type, v_is_cash_account
    FROM public.accounts
    WHERE id = p_destination_cash_account_id
      AND organization_id = p_organization_id
      AND is_active = true;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Akun kas tujuan tidak ditemukan';
    END IF;
    IF v_account_type != 'asset' OR v_is_cash_account != true THEN
      RAISE EXCEPTION 'Akun kas tujuan tidak valid';
    END IF;
  END IF;

  -- ── Party required for credit / receivables / payables ──
  IF p_transaction_type IN (
    'credit_sale', 'receive_receivable', 'credit_purchase', 'pay_payable'
  ) THEN
    IF p_party_id IS NULL THEN
      RAISE EXCEPTION 'Kontak / party diperlukan untuk tipe transaksi ini';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.parties
      WHERE id = p_party_id AND organization_id = p_organization_id AND is_active = true
    ) THEN
      RAISE EXCEPTION 'Kontak / party tidak aktif atau tidak ditemukan';
    END IF;
  END IF;

  -- ── Resolve accounts based on transaction type ──
  IF p_transaction_type = 'cash_sale' THEN
    v_debit_account_id := p_cash_account_id;
    SELECT id INTO v_credit_account_id
    FROM public.accounts
    WHERE organization_id = p_organization_id AND code = 4100 AND is_active = true;
    IF v_credit_account_id IS NULL THEN
      RAISE EXCEPTION 'Akun Pendapatan Penjualan (4100) tidak ditemukan atau tidak aktif';
    END IF;

  ELSIF p_transaction_type = 'credit_sale' THEN
    SELECT id INTO v_debit_account_id
    FROM public.accounts
    WHERE organization_id = p_organization_id AND code = 1200 AND is_active = true;
    IF v_debit_account_id IS NULL THEN
      RAISE EXCEPTION 'Akun Piutang Usaha (1200) tidak ditemukan atau tidak aktif';
    END IF;

    SELECT id INTO v_credit_account_id
    FROM public.accounts
    WHERE organization_id = p_organization_id AND code = 4100 AND is_active = true;
    IF v_credit_account_id IS NULL THEN
      RAISE EXCEPTION 'Akun Pendapatan Penjualan (4100) tidak ditemukan atau tidak aktif';
    END IF;

  ELSIF p_transaction_type = 'receive_receivable' THEN
    v_debit_account_id := p_cash_account_id;
    SELECT id INTO v_credit_account_id
    FROM public.accounts
    WHERE organization_id = p_organization_id AND code = 1200 AND is_active = true;
    IF v_credit_account_id IS NULL THEN
      RAISE EXCEPTION 'Akun Piutang Usaha (1200) tidak ditemukan atau tidak aktif';
    END IF;

  ELSIF p_transaction_type = 'cash_purchase' THEN
    IF p_product_id IS NOT NULL THEN
      SELECT id INTO v_debit_account_id
      FROM public.accounts
      WHERE organization_id = p_organization_id AND code = 1300 AND is_active = true;
      IF v_debit_account_id IS NULL THEN
        RAISE EXCEPTION 'Akun Persediaan (1300) tidak ditemukan atau tidak aktif';
      END IF;
    ELSE
      IF p_debit_account_id IS NULL THEN
        RAISE EXCEPTION 'Akun debit diperlukan jika membeli non-barang';
      END IF;
      v_debit_account_id := p_debit_account_id;
    END IF;
    v_credit_account_id := p_cash_account_id;

  ELSIF p_transaction_type = 'credit_purchase' THEN
    IF p_product_id IS NOT NULL THEN
      SELECT id INTO v_debit_account_id
      FROM public.accounts
      WHERE organization_id = p_organization_id AND code = 1300 AND is_active = true;
      IF v_debit_account_id IS NULL THEN
        RAISE EXCEPTION 'Akun Persediaan (1300) tidak ditemukan atau tidak aktif';
      END IF;
    ELSE
      IF p_debit_account_id IS NULL THEN
        RAISE EXCEPTION 'Akun debit diperlukan jika membeli kredit non-barang';
      END IF;
      v_debit_account_id := p_debit_account_id;
    END IF;
    SELECT id INTO v_credit_account_id
    FROM public.accounts
    WHERE organization_id = p_organization_id AND code = 2100 AND is_active = true;
    IF v_credit_account_id IS NULL THEN
      RAISE EXCEPTION 'Akun Utang Usaha (2100) tidak ditemukan atau tidak aktif';
    END IF;

  ELSIF p_transaction_type = 'pay_payable' THEN
    SELECT id INTO v_debit_account_id
    FROM public.accounts
    WHERE organization_id = p_organization_id AND code = 2100 AND is_active = true;
    IF v_debit_account_id IS NULL THEN
      RAISE EXCEPTION 'Akun Utang Usaha (2100) tidak ditemukan atau tidak aktif';
    END IF;
    v_credit_account_id := p_cash_account_id;

  ELSIF p_transaction_type = 'expense_payment' THEN
    IF p_debit_account_id IS NULL THEN
      SELECT id INTO v_debit_account_id
      FROM public.accounts
      WHERE organization_id = p_organization_id AND code = 6190 AND is_active = true;
      IF v_debit_account_id IS NULL THEN
        RAISE EXCEPTION 'Akun Beban Lain-lain (6190) tidak ditemukan atau tidak aktif';
      END IF;
    ELSE
      v_debit_account_id := p_debit_account_id;
    END IF;
    v_credit_account_id := p_cash_account_id;

  ELSIF p_transaction_type = 'owner_capital' THEN
    v_debit_account_id := p_cash_account_id;
    SELECT id INTO v_credit_account_id
    FROM public.accounts
    WHERE organization_id = p_organization_id AND code = 3100 AND is_active = true;
    IF v_credit_account_id IS NULL THEN
      RAISE EXCEPTION 'Akun Modal Pemilik (3100) tidak ditemukan atau tidak aktif';
    END IF;

  ELSIF p_transaction_type = 'owner_draw' THEN
    SELECT id INTO v_debit_account_id
    FROM public.accounts
    WHERE organization_id = p_organization_id AND code = 3300 AND is_active = true;
    IF v_debit_account_id IS NULL THEN
      RAISE EXCEPTION 'Akun Prive Pemilik (3300) tidak ditemukan atau tidak aktif';
    END IF;
    v_credit_account_id := p_cash_account_id;

  ELSIF p_transaction_type = 'cash_transfer' THEN
    v_debit_account_id := p_destination_cash_account_id;
    v_credit_account_id := p_cash_account_id;

  ELSIF p_transaction_type = 'simple_adjustment' THEN
    IF p_debit_account_id IS NULL OR p_cash_account_id IS NULL THEN
      RAISE EXCEPTION 'Akun debit dan kredit diperlukan untuk penyesuaian sederhana';
    END IF;
    v_debit_account_id := p_debit_account_id;
    v_credit_account_id := p_cash_account_id;
  ELSE
    RAISE EXCEPTION 'Tipe transaksi tidak didukung';
  END IF;

  -- ── Check accounts validity ──
  SELECT name INTO v_debit_account_name FROM public.accounts WHERE id = v_debit_account_id AND organization_id = p_organization_id;
  IF v_debit_account_name IS NULL THEN
    RAISE EXCEPTION 'Akun debit tidak valid';
  END IF;

  SELECT name INTO v_credit_account_name FROM public.accounts WHERE id = v_credit_account_id AND organization_id = p_organization_id;
  IF v_credit_account_name IS NULL THEN
    RAISE EXCEPTION 'Akun kredit tidak valid';
  END IF;

  -- ── Generate Numbers ──
  v_entry_number := public.generate_entry_number(p_organization_id);

  -- ── Insert Journal Entry ──
  INSERT INTO public.journal_entries (
    organization_id, entry_number, entry_date, entry_type,
    description, status, posted_at, posted_by
  ) VALUES (
    p_organization_id, v_entry_number, p_transaction_date, 'normal',
    p_description, 'posted', now(), v_user_id
  ) RETURNING id INTO v_journal_id;

  -- Credit & Debit lines insertion
  IF p_transaction_type = 'credit_sale' AND p_payment_status = 'partial' THEN
    IF p_partial_amount IS NULL OR p_partial_amount <= 0 OR p_partial_amount >= p_amount THEN
      RAISE EXCEPTION 'Jumlah bayar sebagian tidak valid';
    END IF;
    v_remaining_amount := p_amount - p_partial_amount;
    
    INSERT INTO public.journal_lines (organization_id, journal_entry_id, account_id, debit, credit, description, line_order) VALUES
      (p_organization_id, v_journal_id, p_cash_account_id, p_partial_amount, 0, p_description, 1),
      (p_organization_id, v_journal_id, v_debit_account_id, v_remaining_amount, 0, p_description, 2),
      (p_organization_id, v_journal_id, v_credit_account_id, 0, p_amount, p_description, 3);
  ELSIF p_transaction_type = 'credit_purchase' AND p_payment_status = 'partial' THEN
    IF p_partial_amount IS NULL OR p_partial_amount <= 0 OR p_partial_amount >= p_amount THEN
      RAISE EXCEPTION 'Jumlah bayar sebagian tidak valid';
    END IF;
    v_remaining_amount := p_amount - p_partial_amount;

    INSERT INTO public.journal_lines (organization_id, journal_entry_id, account_id, debit, credit, description, line_order) VALUES
      (p_organization_id, v_journal_id, v_debit_account_id, p_amount, 0, p_description, 1),
      (p_organization_id, v_journal_id, p_cash_account_id, 0, p_partial_amount, p_description, 2),
      (p_organization_id, v_journal_id, v_credit_account_id, 0, v_remaining_amount, p_description, 3);
  ELSE
    INSERT INTO public.journal_lines (organization_id, journal_entry_id, account_id, debit, credit, description, line_order) VALUES
      (p_organization_id, v_journal_id, v_debit_account_id, p_amount, 0, p_description, 1),
      (p_organization_id, v_journal_id, v_credit_account_id, 0, p_amount, p_description, 2);
  END IF;

  -- ── Balance Verification ──
  IF (
    SELECT ABS(COALESCE(SUM(debit), 0) - COALESCE(SUM(credit), 0))
    FROM public.journal_lines
    WHERE journal_entry_id = v_journal_id
  ) <> 0 THEN
    RAISE EXCEPTION 'Jurnal tidak seimbang';
  END IF;

  -- ── TRANSACTION RECORD ──
  v_txn_number := public.generate_transaction_number(p_organization_id, p_transaction_date);

  INSERT INTO public.transactions (
    organization_id, transaction_number, transaction_date,
    transaction_type, amount, party_id, category_name,
    cash_account_id, destination_cash_account_id,
    payment_status, due_date, description, notes,
    status, posted_at, posted_by, created_by,
    product_id, quantity, unit_price, client_token
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
    p_product_id, p_quantity, p_unit_price, p_client_token
  ) RETURNING id, transaction_number INTO v_transaction_id, v_txn_number;

  UPDATE public.journal_entries
  SET transaction_id = v_transaction_id
  WHERE id = v_journal_id;

  -- ── PRODUCT: STOCK MOVEMENTS + COGS ──
  IF p_product_id IS NOT NULL THEN
    IF p_transaction_type IN ('cash_purchase', 'credit_purchase') THEN
      PERFORM public.record_stock_movement(
        p_organization_id, p_product_id, p_transaction_date,
        'purchase', p_quantity, p_unit_price, v_transaction_id
      );
      PERFORM public.recalculate_product_average_cost(p_product_id);
    ELSIF p_transaction_type IN ('cash_sale', 'credit_sale') THEN
      v_cogs_amount := COALESCE(v_product_purchase_price, 0) * p_quantity;

      -- Post COGS journal (P1-2/a guarantees v_cogs_amount > 0 because purchase_price > 0)
      SELECT id INTO v_cogs_account_id FROM public.accounts WHERE organization_id = p_organization_id AND code = 5100 AND is_active = true;
      SELECT id INTO v_inventory_account_id FROM public.accounts WHERE organization_id = p_organization_id AND code = 1300 AND is_active = true;

      -- DR COGS (5100), CR Inventory (1300)
      INSERT INTO public.journal_lines (organization_id, journal_entry_id, account_id, debit, credit, description, line_order) VALUES
        (p_organization_id, v_journal_id, v_cogs_account_id, v_cogs_amount, 0, 'HPP: ' || p_description, 3),
        (p_organization_id, v_journal_id, v_inventory_account_id, 0, v_cogs_amount, 'HPP: ' || p_description, 4);

      PERFORM public.record_stock_movement(
        p_organization_id, p_product_id, p_transaction_date,
        'sale', -p_quantity, COALESCE(v_product_purchase_price, 0), v_transaction_id
      );
      -- note: sale doesn't change product average cost, so no recalculate
    END IF;
  END IF;

  -- ── IMPACT + AUDIT + RETURN ──
  SELECT normal_balance::TEXT INTO v_debit_normal FROM public.accounts WHERE id = v_debit_account_id;
  SELECT normal_balance::TEXT INTO v_credit_normal FROM public.accounts WHERE id = v_credit_account_id;

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

ALTER FUNCTION public.post_transaction(uuid, date, text, numeric, uuid, text, uuid, uuid, text, numeric, date, text, text, uuid, numeric, numeric, uuid, uuid, text) OWNER TO postgres;
REVOKE EXECUTE ON FUNCTION public.post_transaction(uuid, date, text, numeric, uuid, text, uuid, uuid, text, numeric, date, text, text, uuid, numeric, numeric, uuid, uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.post_transaction(uuid, date, text, numeric, uuid, text, uuid, uuid, text, numeric, date, text, text, uuid, numeric, numeric, uuid, uuid, text) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════
-- P1-3: Redefine void_transaction with client_token
-- ═══════════════════════════════════════════════════════════════════
DROP FUNCTION IF EXISTS public.void_transaction(uuid, uuid, text, date);

CREATE OR REPLACE FUNCTION public.void_transaction(
  p_organization_id uuid,
  p_transaction_id uuid,
  p_void_reason text,
  p_void_date date DEFAULT NULL,
  p_client_token uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user_id            UUID;
  v_role               TEXT;
  v_txn                RECORD;
  v_orig_je            RECORD;
  v_reversal_je_id     UUID;
  v_reversal_txn_id    UUID;
  v_line               RECORD;
  v_line_order         INTEGER := 0;
  v_reversed_count     INTEGER := 0;
  v_reversal_journal_ids JSONB := '[]'::JSONB;
  v_stock_delta        NUMERIC;
  v_void_unit_cost     NUMERIC;
  
  -- Idempotency check variables
  v_existing_reversal_id UUID;
  v_existing_reversal_je_ids JSONB;
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
    RAISE EXCEPTION 'Anda bukan anggota dari organisasi ini';
  END IF;

  -- ── Permission Check ──
  IF v_role != 'owner'
     AND NOT public.has_permission(p_organization_id, 'can_void_transaction') THEN
    RAISE EXCEPTION 'Anda tidak memiliki izin untuk membatalkan transaksi';
  END IF;

  -- ── Idempotency Check ──
  IF p_client_token IS NOT NULL THEN
    SELECT id INTO v_existing_reversal_id
    FROM public.transactions
    WHERE organization_id = p_organization_id AND client_token = p_client_token
    LIMIT 1;

    IF v_existing_reversal_id IS NOT NULL THEN
      SELECT COALESCE(jsonb_agg(id), '[]'::JSONB)
      INTO v_existing_reversal_je_ids
      FROM public.journal_entries
      WHERE transaction_id = v_existing_reversal_id;

      RETURN jsonb_build_object(
        'original_transaction_id', p_transaction_id,
        'reversal_transaction_id', v_existing_reversal_id,
        'reversal_journal_entry_ids', v_existing_reversal_je_ids,
        'status', 'voided'
      );
    END IF;
  END IF;

  -- ── Get Original Transaction ──
  SELECT *
  INTO v_txn
  FROM public.transactions
  WHERE id = p_transaction_id AND organization_id = p_organization_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transaksi tidak ditemukan';
  END IF;

  IF v_txn.status != 'posted' THEN
    RAISE EXCEPTION 'Hanya transaksi berstatus posted yang dapat dibatalkan';
  END IF;

  -- Block voiding reversal rows
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

  -- ── Create Reversal Transaction ──
  INSERT INTO public.transactions (
    organization_id, transaction_number, transaction_date,
    transaction_type, amount, party_id, category_name,
    cash_account_id, destination_cash_account_id,
    payment_status, due_date, description, notes,
    status, posted_at, posted_by, created_by,
    original_transaction_id,
    product_id, quantity, unit_price, client_token
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
    v_txn.unit_price,
    p_client_token
  ) RETURNING id INTO v_reversal_txn_id;

  v_reversed_count := 0;

  -- ── Reversal Journal entries creation ──
  FOR v_orig_je IN
    SELECT *
    FROM public.journal_entries
    WHERE transaction_id = p_transaction_id
      AND organization_id = p_organization_id
      AND status = 'posted'
    ORDER BY created_at, id
  LOOP
    INSERT INTO public.journal_entries (
      organization_id, transaction_id, entry_number, entry_date, entry_type,
      description, status, posted_at, posted_by
    ) VALUES (
      p_organization_id,
      v_reversal_txn_id,
      public.generate_entry_number(p_organization_id),
      COALESCE(p_void_date, CURRENT_DATE),
      'reversal'::public.journal_entry_type,
      'Pembatalan: ' || v_orig_je.description,
      'posted',
      now(),
      v_user_id
    ) RETURNING id INTO v_reversal_je_id;

    v_line_order := 0;
    
    -- Swap debit and credit lines
    FOR v_line IN
      SELECT *
      FROM public.journal_lines
      WHERE journal_entry_id = v_orig_je.id
        AND organization_id = p_organization_id
      ORDER BY line_order, id
    LOOP
      v_line_order := v_line_order + 1;
      INSERT INTO public.journal_lines (
        organization_id, journal_entry_id, account_id,
        debit, credit, description, line_order
      ) VALUES (
        p_organization_id,
        v_reversal_je_id,
        v_line.account_id,
        v_line.credit, -- credit becomes debit
        v_line.debit,  -- debit becomes credit
        'Reversal: ' || COALESCE(v_line.description, ''),
        v_line_order
      );
    END LOOP;

    -- Balance check
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

  -- ── Reversal Stock movement ──
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

      IF v_txn.transaction_type IN ('cash_purchase', 'credit_purchase', 'cash_sale', 'credit_sale') THEN
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

ALTER FUNCTION public.void_transaction(uuid, uuid, text, date, uuid) OWNER TO postgres;
REVOKE EXECUTE ON FUNCTION public.void_transaction(uuid, uuid, text, date, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.void_transaction(uuid, uuid, text, date, uuid) TO authenticated;
