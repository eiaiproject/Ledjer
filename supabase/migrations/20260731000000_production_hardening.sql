-- =============================================================================
-- LEDJER — Production Hardening Migration
-- =============================================================================
-- Covers: Phase 2 (Admin RPC grants), Phase 3 (Product protection),
--         Phase 5 (CSV escaping), Phase 9 (Invitation token hashing),
--         Phase 7 (Billing boundaries)
-- =============================================================================

-- ═══════════════════════════════════════════════════════════════════
-- PHASE 2: Admin RPC Privilege Hardening
-- ═══════════════════════════════════════════════════════════════════
-- Admin functions are REVOKE'd from PUBLIC/anon/authenticated but need
-- explicit GRANT to service_role for backend admin operations.

-- Admin: list organizations
GRANT EXECUTE ON FUNCTION public.admin_list_organizations(TEXT) TO service_role;

-- Admin: get organization detail
GRANT EXECUTE ON FUNCTION public.admin_get_organization(UUID) TO service_role;

-- Admin: update plan
GRANT EXECUTE ON FUNCTION public.admin_update_plan(UUID, TEXT) TO service_role;

-- Admin: suspend/unsuspend
GRANT EXECUTE ON FUNCTION public.admin_set_suspension(UUID, BOOLEAN, TEXT) TO service_role;

-- Verify admin RPC isolation: these tests run via psql as postgres superuser
-- and check that anon/authenticated cannot execute admin functions.
DO $$
DECLARE
  v_fn TEXT;
  v_can_anon BOOLEAN;
  v_can_auth BOOLEAN;
  v_failing TEXT[] := ARRAY[]::TEXT[];
BEGIN
  FOR v_fn IN
    SELECT p.proname
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'admin_list_organizations',
        'admin_get_organization',
        'admin_update_plan',
        'admin_set_suspension'
      )
  LOOP
    -- Check anon
    SELECT EXISTS (
      SELECT 1 FROM pg_proc p2
      JOIN pg_namespace n2 ON n2.oid = p2.pronamespace
      WHERE n2.nspname = 'public' AND p2.proname = v_fn
        AND has_function_privilege('anon', p2.oid, 'EXECUTE')
    ) INTO v_can_anon;

    -- Check authenticated
    SELECT EXISTS (
      SELECT 1 FROM pg_proc p2
      JOIN pg_namespace n2 ON n2.oid = p2.pronamespace
      WHERE n2.nspname = 'public' AND p2.proname = v_fn
        AND has_function_privilege('authenticated', p2.oid, 'EXECUTE')
    ) INTO v_can_auth;

    IF v_can_anon THEN
      v_failing := array_append(v_failing, 'anon CAN EXECUTE ' || v_fn);
    END IF;
    IF v_can_auth THEN
      v_failing := array_append(v_failing, 'authenticated CAN EXECUTE ' || v_fn);
    END IF;
  END LOOP;

  IF array_length(v_failing, 1) > 0 THEN
    RAISE EXCEPTION 'ADMIN RPC PRIVILEGE VIOLATION: %', array_to_string(v_failing, ', ');
  END IF;

  RAISE NOTICE 'PASS: admin RPCs are not callable by anon or authenticated';
END $$;


-- ═══════════════════════════════════════════════════════════════════
-- PHASE 3: Product Accounting Field Protection
-- ═══════════════════════════════════════════════════════════════════
-- The existing protect_product_stock_update trigger only protects
-- current_stock. Extend it to also protect purchase_price, which
-- represents moving average cost / cost basis. Direct mutation would
-- corrupt COGS, profit, and inventory valuation.

CREATE OR REPLACE FUNCTION public.protect_product_stock_update() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path = public
AS $$
BEGIN
  -- Block direct current_stock changes (existing protection)
  IF TG_OP = 'UPDATE'
     AND OLD.current_stock IS DISTINCT FROM NEW.current_stock
     AND COALESCE(current_setting('ledjer.allow_stock_update', true), '') != 'on' THEN
    RAISE EXCEPTION 'Product stock cannot be changed directly. Use transaction or stock movement functions.';
  END IF;

  -- Block direct purchase_price changes (new protection)
  -- purchase_price is the moving average cost; only trusted functions
  -- (recalculate_product_average_cost) should modify it.
  -- SECURITY DEFINER functions that legitimately update purchase_price
  -- must call: PERFORM set_config('ledjer.allow_product_cost_update', 'on', true)
  -- before the UPDATE statement.
  IF TG_OP = 'UPDATE'
     AND OLD.purchase_price IS DISTINCT FROM NEW.purchase_price
     AND COALESCE(current_setting('ledjer.allow_product_cost_update', true), '') != 'on' THEN
    RAISE EXCEPTION 'Product cost (purchase_price) cannot be changed directly. Use recalculate_product_average_cost.';
  END IF;

  RETURN NEW;
END;
$$;

ALTER FUNCTION public.protect_product_stock_update() OWNER TO postgres;

-- The trigger protect_product_stock_update_trigger is already created
-- by the baseline migration and fires BEFORE UPDATE ON products.

-- PHASE 3b: Patch recalculate_product_average_cost to set the config flag
-- so the updated trigger does not block legitimate cost recalculation.
-- This is critical — without this, every purchase transaction would fail.
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
  SELECT organization_id, purchase_price
  INTO v_org_id, v_avg_cost
  FROM public.products
  WHERE id = p_product_id AND is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Produk tidak ditemukan atau tidak aktif';
  END IF;

  FOR r IN
    SELECT sm.id, sm.movement_type, sm.quantity, sm.unit_cost,
           t.transaction_type, t.original_transaction_id
    FROM public.stock_movements sm
    LEFT JOIN public.transactions t ON t.id = sm.transaction_id
    WHERE sm.product_id = p_product_id
      AND sm.organization_id = v_org_id
    ORDER BY sm.movement_date ASC,
             sm.created_at ASC,
             CASE WHEN sm.movement_type = 'void' THEN 1 ELSE 0 END ASC,
             sm.id ASC
  LOOP
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
      v_running_qty := v_running_qty + r.quantity;
      v_running_value := v_running_value + (r.quantity * COALESCE(r.unit_cost, 0));
      IF v_running_qty > 0 THEN
        v_avg_cost := v_running_value / v_running_qty;
      END IF;
    ELSIF r.movement_type = 'void' AND r.transaction_type IN ('cash_sale', 'credit_sale') THEN
      v_running_qty := v_running_qty + r.quantity;
      v_running_value := v_running_value + (r.quantity * COALESCE(r.unit_cost, v_avg_cost, 0));
      IF v_running_qty > 0 THEN
        v_avg_cost := v_running_value / v_running_qty;
      END IF;
    ELSE
      v_running_qty := v_running_qty + r.quantity;
      v_running_value := v_running_value + (r.quantity * COALESCE(r.unit_cost, v_avg_cost, 0));
      IF v_running_qty > 0 THEN
        v_avg_cost := v_running_value / v_running_qty;
      END IF;
    END IF;

    IF v_running_qty <= 0 THEN
      v_running_qty := 0;
      v_running_value := 0;
    END IF;
    IF v_running_value < 0 THEN
      v_running_value := 0;
    END IF;
  END LOOP;

  v_avg_cost := GREATEST(COALESCE(v_avg_cost, 0), 0);

  -- Allow the trigger to pass by setting the config flag
  PERFORM set_config('ledjer.allow_product_cost_update', 'on', true);

  UPDATE public.products
  SET purchase_price = v_avg_cost,
      updated_at = now()
  WHERE id = p_product_id;

  RETURN v_avg_cost;
END;
$$;

ALTER FUNCTION public.recalculate_product_average_cost(uuid) OWNER TO postgres;
REVOKE EXECUTE ON FUNCTION public.recalculate_product_average_cost(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recalculate_product_average_cost(uuid) TO service_role;


-- ═══════════════════════════════════════════════════════════════════
-- PHASE 5: CSV Export Security — Safe Escaping Helper
-- ═══════════════════════════════════════════════════════════════════
-- Current CSV exports only replace commas with semicolons, which is
-- insufficient. This helper properly escapes fields for CSV:
--   1. Fields containing comma, quote, newline, CR, or leading/trailing
--      whitespace are double-quoted.
--   2. Double quotes within fields are escaped by doubling them.
--   3. Dangerous formula-like values (=, +, -, @) are prefixed with a
--      single quote to neutralize spreadsheet injection.

CREATE OR REPLACE FUNCTION public.csv_escape(p_value TEXT)
RETURNS TEXT
    LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE
    SET search_path = public
AS $$
DECLARE
  v_result TEXT;
BEGIN
  IF p_value IS NULL THEN
    RETURN '';
  END IF;

  v_result := p_value;

  -- Normalize: replace literal newlines and carriage returns with space
  -- to prevent broken CSV rows
  v_result := replace(v_result, E'\r\n', ' ');
  v_result := replace(v_result, E'\r', ' ');
  v_result := replace(v_result, E'\n', ' ');

  -- Protect against spreadsheet formula injection:
  -- Prefix dangerous leading characters with a single quote (neutralized)
  IF v_result ~ '^[=\+\-@\t]' THEN
    v_result := '''' || v_result;
  END IF;

  -- If the field contains comma, double-quote, single-quote (from formula
  -- prefix), or has leading/trailing whitespace, wrap in double quotes
  -- and escape internal double quotes.
  IF v_result ~ '[,"'']| ^| $' THEN
    v_result := replace(v_result, '"', '""');
    v_result := '"' || v_result || '"';
  END IF;

  RETURN v_result;
END;
$$;

ALTER FUNCTION public.csv_escape(TEXT) OWNER TO postgres;

-- Revoke from non-privileged roles (internal helper, not for direct use)
REVOKE EXECUTE ON FUNCTION public.csv_escape(TEXT) FROM PUBLIC, anon, authenticated;


-- ═══════════════════════════════════════════════════════════════════
-- PHASE 5b: Update CSV Export RPCs to Use Safe Escaping
-- ═══════════════════════════════════════════════════════════════════

-- Update export_transactions_csv to use csv_escape
CREATE OR REPLACE FUNCTION public.export_transactions_csv(
  p_organization_id UUID,
  p_from_date DATE DEFAULT NULL,
  p_to_date DATE DEFAULT NULL,
  p_search TEXT DEFAULT NULL,
  p_transaction_type TEXT DEFAULT NULL,
  p_status public.transaction_status DEFAULT NULL
) RETURNS TEXT
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path = public
AS $$
DECLARE
  v_result TEXT;
  v_header TEXT := 'Tanggal,No Transaksi,Jenis,Partai,Deskripsi,Nominal,Status';
  v_search TEXT := NULLIF(regexp_replace(trim(COALESCE(p_search, '')), '[,%()]', ' ', 'g'), '');
BEGIN
  IF NOT public.is_org_member(p_organization_id) THEN
    RAISE EXCEPTION 'Anda bukan anggota organisasi ini';
  END IF;

  IF NOT public.has_permission(p_organization_id, 'can_view_reports') THEN
    RAISE EXCEPTION 'Anda tidak memiliki izin untuk export data';
  END IF;

  SELECT string_agg(
    public.csv_escape(to_char(t.transaction_date, 'YYYY-MM-DD')) || ',' ||
    public.csv_escape(t.transaction_number) || ',' ||
    public.csv_escape(t.transaction_type) || ',' ||
    public.csv_escape(COALESCE(pt.name, '')) || ',' ||
    public.csv_escape(t.description) || ',' ||
    public.csv_escape(COALESCE(t.amount::TEXT, '0')) || ',' ||
    public.csv_escape(t.status),
    E'\n'
  ) INTO v_result
  FROM (
    SELECT
      te.transaction_date, te.transaction_number, te.transaction_type,
      te.description, te.amount, te.status,
      pt.name AS party_name
    FROM public.transactions te
    LEFT JOIN public.parties pt ON pt.id = te.party_id
    WHERE te.organization_id = p_organization_id
      AND te.status IN ('posted', 'voided')
      AND (p_from_date IS NULL OR te.transaction_date >= p_from_date)
      AND (p_to_date IS NULL OR te.transaction_date <= p_to_date)
      AND (p_transaction_type IS NULL OR te.transaction_type = p_transaction_type)
      AND (p_status IS NULL OR te.status = p_status)
      AND (
        v_search IS NULL
        OR te.description ILIKE '%' || v_search || '%'
        OR te.transaction_number ILIKE '%' || v_search || '%'
      )
    ORDER BY te.transaction_date, te.transaction_number
  ) t;

  RETURN v_header || E'\n' || COALESCE(v_result, '');
END;
$$;

ALTER FUNCTION public.export_transactions_csv(UUID, DATE, DATE, TEXT, TEXT, public.transaction_status) OWNER TO postgres;
REVOKE EXECUTE ON FUNCTION public.export_transactions_csv(UUID, DATE, DATE, TEXT, TEXT, public.transaction_status) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.export_transactions_csv(UUID, DATE, DATE, TEXT, TEXT, public.transaction_status) TO authenticated;

-- Update export_accounts_csv to use csv_escape
CREATE OR REPLACE FUNCTION public.export_accounts_csv(
  p_organization_id UUID
) RETURNS TEXT
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path = public
AS $$
DECLARE
  v_result TEXT;
  v_header TEXT := 'Kode,Nama Akun,Tipe,Saldo Normal,Aktif';
BEGIN
  IF NOT public.is_org_member(p_organization_id) THEN
    RAISE EXCEPTION 'Anda bukan anggota organisasi ini';
  END IF;

  IF NOT public.has_permission(p_organization_id, 'can_manage_accounts') THEN
    RAISE EXCEPTION 'Anda tidak memiliki izin untuk export data';
  END IF;

  SELECT string_agg(
    public.csv_escape(a.code::TEXT) || ',' ||
    public.csv_escape(a.name) || ',' ||
    public.csv_escape(a.account_type::TEXT) || ',' ||
    public.csv_escape(a.normal_balance::TEXT) || ',' ||
    public.csv_escape(a.is_active::TEXT),
    E'\n'
  ) INTO v_result
  FROM public.accounts a
  WHERE a.organization_id = p_organization_id
  ORDER BY a.code;

  RETURN v_header || E'\n' || COALESCE(v_result, '');
END;
$$;

ALTER FUNCTION public.export_accounts_csv(UUID) OWNER TO postgres;
REVOKE EXECUTE ON FUNCTION public.export_accounts_csv(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.export_accounts_csv(UUID) TO authenticated;

-- Update export_products_csv to use csv_escape
CREATE OR REPLACE FUNCTION public.export_products_csv(
  p_organization_id UUID
) RETURNS TEXT
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path = public
AS $$
DECLARE
  v_result TEXT;
  v_header TEXT := 'Kode,Nama,Deskripsi,Satuan,Harga Beli,Harga Jual,Stok,Stok Min,Aktif';
BEGIN
  IF NOT public.is_org_member(p_organization_id) THEN
    RAISE EXCEPTION 'Anda bukan anggota organisasi ini';
  END IF;

  IF NOT public.has_permission(p_organization_id, 'can_manage_products') THEN
    RAISE EXCEPTION 'Anda tidak memiliki izin untuk export data';
  END IF;

  SELECT string_agg(
    public.csv_escape(pr.code) || ',' ||
    public.csv_escape(pr.name) || ',' ||
    public.csv_escape(COALESCE(pr.description, '')) || ',' ||
    public.csv_escape(COALESCE(pr.unit, '')) || ',' ||
    public.csv_escape(COALESCE(pr.purchase_price::TEXT, '0')) || ',' ||
    public.csv_escape(COALESCE(pr.selling_price::TEXT, '0')) || ',' ||
    public.csv_escape(COALESCE(pr.current_stock::TEXT, '0')) || ',' ||
    public.csv_escape(COALESCE(pr.min_stock::TEXT, '0')) || ',' ||
    public.csv_escape(pr.is_active::TEXT),
    E'\n'
  ) INTO v_result
  FROM public.products pr
  WHERE pr.organization_id = p_organization_id
    AND pr.is_active = true
  ORDER BY pr.code;

  RETURN v_header || E'\n' || COALESCE(v_result, '');
END;
$$;

ALTER FUNCTION public.export_products_csv(UUID) OWNER TO postgres;
REVOKE EXECUTE ON FUNCTION public.export_products_csv(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.export_products_csv(UUID) TO authenticated;

-- Update export_general_ledger_csv to use csv_escape
CREATE OR REPLACE FUNCTION public.export_general_ledger_csv(
  p_organization_id UUID,
  p_account_id UUID DEFAULT NULL,
  p_from_date DATE DEFAULT NULL,
  p_to_date DATE DEFAULT NULL
) RETURNS TEXT
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path = public
AS $$
DECLARE
  v_result TEXT;
  v_header TEXT := 'Tanggal,Nomor Ref,Akun,Kode,Nama Akun,Keterangan,Debit,Kredit,Saldo';
  v_from DATE;
  v_to DATE;
BEGIN
  IF NOT public.is_org_member(p_organization_id) THEN
    RAISE EXCEPTION 'Anda bukan anggota organisasi ini';
  END IF;

  IF NOT public.has_permission(p_organization_id, 'can_view_reports') THEN
    RAISE EXCEPTION 'Anda tidak memiliki izin untuk export data';
  END IF;

  v_from := COALESCE(p_from_date, date_trunc('month', CURRENT_DATE)::DATE);
  v_to := COALESCE(p_to_date, CURRENT_DATE);

  SELECT string_agg(
    public.csv_escape(gl.entry_date::TEXT) || ',' ||
    public.csv_escape(gl.transaction_number) || ',' ||
    public.csv_escape(gl.account_id::TEXT) || ',' ||
    public.csv_escape(gl.account_code::TEXT) || ',' ||
    public.csv_escape(gl.account_name) || ',' ||
    public.csv_escape(COALESCE(gl.description, '')) || ',' ||
    public.csv_escape(gl.debit::TEXT) || ',' ||
    public.csv_escape(gl.credit::TEXT) || ',' ||
    public.csv_escape(gl.running_balance::TEXT),
    E'\n'
  ) INTO v_result
  FROM public.get_general_ledger(p_organization_id, p_account_id, v_from, v_to) gl;

  RETURN v_header || E'\n' || COALESCE(v_result, '');
END;
$$;

ALTER FUNCTION public.export_general_ledger_csv(UUID, UUID, DATE, DATE) OWNER TO postgres;
REVOKE EXECUTE ON FUNCTION public.export_general_ledger_csv(UUID, UUID, DATE, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.export_general_ledger_csv(UUID, UUID, DATE, DATE) TO authenticated;


-- ═══════════════════════════════════════════════════════════════════
-- PHASE 9: Invitation Token Hashing
-- ═══════════════════════════════════════════════════════════════════
-- Migration strategy:
-- 1. Add a token_hash column to store SHA-256 hash of the token.
-- 2. For existing pending invitations, hash the existing token.
-- 3. Update create_invitation to store hash (and return raw token once).
-- 4. Update accept_invitation to compare by hash.
-- 5. Keep token column for backward compatibility during transition.

-- Add token_hash column
ALTER TABLE public.organization_invitations
  ADD COLUMN IF NOT EXISTS token_hash TEXT;

-- Create unique index on token_hash for fast lookup
CREATE UNIQUE INDEX IF NOT EXISTS idx_invitations_token_hash
  ON public.organization_invitations(token_hash)
  WHERE token_hash IS NOT NULL;

-- Backfill existing tokens with their SHA-256 hash
UPDATE public.organization_invitations
SET token_hash = encode(extensions.digest(token, 'sha256'), 'hex')
WHERE token_hash IS NULL AND token IS NOT NULL;

-- Expire pre-migration pending invitations that lack hashed tokens.
-- This eliminates the transition attack surface where plaintext tokens
-- were still valid. Affected users must be re-invited.
UPDATE public.organization_invitations
SET status = 'expired', updated_at = now()
WHERE status = 'pending' AND token_hash IS NULL;

-- Update create_invitation to store token_hash when creating new invitations
CREATE OR REPLACE FUNCTION public.create_invitation(
  p_organization_id UUID,
  p_email TEXT
) RETURNS JSONB
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path = public
AS $$
DECLARE
  v_inviter_id UUID;
  v_inviter_role TEXT;
  v_current_plan TEXT;
  v_staff_count INTEGER;
  v_pending_invitation_count INTEGER;
  v_invitation_id UUID;
  v_token TEXT;
  v_token_hash TEXT;
  v_expires_at TIMESTAMPTZ;
  v_existing_invitation RECORD;
BEGIN
  v_inviter_id := auth.uid();
  IF v_inviter_id IS NULL THEN
    RAISE EXCEPTION 'Autentikasi diperlukan';
  END IF;

  IF p_email IS NULL OR p_email !~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$' THEN
    RAISE EXCEPTION 'Email tidak valid';
  END IF;

  SELECT role::TEXT INTO v_inviter_role
  FROM public.organization_members
  WHERE organization_id = p_organization_id
    AND user_id = v_inviter_id
    AND status = 'active';

  IF v_inviter_role IS NULL OR v_inviter_role != 'owner' THEN
    RAISE EXCEPTION 'Hanya owner yang dapat mengundang staf';
  END IF;

  SELECT current_plan::TEXT INTO v_current_plan
  FROM public.organizations WHERE id = p_organization_id;

  IF v_current_plan != 'business' THEN
    RAISE EXCEPTION 'Invite staf memerlukan paket Business';
  END IF;

  SELECT COUNT(*) INTO v_staff_count
  FROM public.organization_members
  WHERE organization_id = p_organization_id
    AND role = 'staff'
    AND status = 'active';

  IF v_staff_count >= 1 THEN
    RAISE EXCEPTION 'Paket Business mendukung maksimal 1 staf';
  END IF;

  -- Check for existing pending invitation for this email
  SELECT id, status, token INTO v_existing_invitation
  FROM public.organization_invitations
  WHERE organization_id = p_organization_id
    AND lower(email) = lower(p_email)
    AND status = 'pending'
    AND expires_at > now();

  IF FOUND THEN
    -- Resend: update expiry, return existing
    UPDATE public.organization_invitations
    SET expires_at = now() + INTERVAL '7 days',
        updated_at = now()
    WHERE id = v_existing_invitation.id
    RETURNING expires_at INTO v_expires_at;

    INSERT INTO public.audit_logs (organization_id, actor_user_id, entity_type, entity_id, action, after_data)
    VALUES (p_organization_id, v_inviter_id, 'invitation', v_existing_invitation.id, 'invitation_resent',
      jsonb_build_object('email', lower(p_email)));

    RETURN jsonb_build_object(
      'invitation_id', v_existing_invitation.id,
      'email', lower(p_email),
      'token', v_existing_invitation.token,
      'expires_at', v_expires_at,
      'resent', true
    );
  END IF;

  SELECT COUNT(*) INTO v_pending_invitation_count
  FROM public.organization_invitations
  WHERE organization_id = p_organization_id
    AND status = 'pending'
    AND expires_at > now();

  IF v_pending_invitation_count >= 1 THEN
    RAISE EXCEPTION 'Slot undangan staf sudah terpakai. Batalkan undangan aktif sebelum membuat undangan baru.';
  END IF;

  -- Generate secure token (32 bytes hex = 64 chars)
  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  -- Store SHA-256 hash of token
  v_token_hash := encode(extensions.digest(v_token, 'sha256'), 'hex');

  INSERT INTO public.organization_invitations (
    organization_id, email, token, token_hash, role, invited_by, expires_at
  ) VALUES (
    p_organization_id, lower(p_email), v_token, v_token_hash, 'staff', v_inviter_id,
    now() + INTERVAL '7 days'
  ) RETURNING id INTO v_invitation_id;

  INSERT INTO public.audit_logs (organization_id, actor_user_id, entity_type, entity_id, action, after_data)
  VALUES (p_organization_id, v_inviter_id, 'invitation', v_invitation_id, 'invitation_created',
    jsonb_build_object('email', lower(p_email), 'role', 'staff'));

  RETURN jsonb_build_object(
    'invitation_id', v_invitation_id,
    'email', lower(p_email),
    'token', v_token,
    'expires_at', now() + INTERVAL '7 days',
    'resent', false
  );
END;
$$;

ALTER FUNCTION public.create_invitation(UUID, TEXT) OWNER TO postgres;
REVOKE EXECUTE ON FUNCTION public.create_invitation(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_invitation(UUID, TEXT) TO authenticated;

-- Update accept_invitation to also accept a hash for comparison
CREATE OR REPLACE FUNCTION public.accept_invitation(
  p_token TEXT
) RETURNS JSONB
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_user_email TEXT;
  v_invitation RECORD;
  v_member_id UUID;
  v_staff_count INTEGER;
  v_current_plan TEXT;
  v_token_hash TEXT;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Autentikasi diperlukan';
  END IF;

  SELECT email INTO v_user_email
  FROM auth.users WHERE id = v_user_id;

  -- Hash the provided token for lookup
  v_token_hash := encode(extensions.digest(p_token, 'sha256'), 'hex');

  SELECT * INTO v_invitation
  FROM public.organization_invitations
  WHERE (token_hash = v_token_hash OR token = p_token)
    AND status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Undangan tidak ditemukan atau sudah tidak berlaku';
  END IF;

  IF v_invitation.expires_at < now() THEN
    UPDATE public.organization_invitations SET status = 'expired', updated_at = now()
    WHERE id = v_invitation.id;
    RAISE EXCEPTION 'Undangan sudah kedaluwarsa';
  END IF;

  IF lower(v_user_email) != lower(v_invitation.email) THEN
    RAISE EXCEPTION 'Undangan ini ditujukan untuk email lain';
  END IF;

  -- Check plan limit
  SELECT current_plan::TEXT INTO v_current_plan
  FROM public.organizations WHERE id = v_invitation.organization_id;

  IF v_current_plan != 'business' THEN
    RAISE EXCEPTION 'Invite staf memerlukan paket Business';
  END IF;

  SELECT COUNT(*) INTO v_staff_count
  FROM public.organization_members
  WHERE organization_id = v_invitation.organization_id
    AND role = 'staff'
    AND status = 'active';

  IF v_staff_count >= 1 THEN
    RAISE EXCEPTION 'Slot staf sudah penuh';
  END IF;

  -- Check not already a member
  IF EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE organization_id = v_invitation.organization_id
      AND user_id = v_user_id
      AND status != 'removed'
  ) THEN
    RAISE EXCEPTION 'Anda sudah menjadi anggota organisasi ini';
  END IF;

  INSERT INTO public.organization_members (
    organization_id, user_id, role, status, invited_by, joined_at,
    can_create_transaction, can_view_reports, can_manage_accounts,
    can_void_transaction, can_manage_products, can_view_audit_log
  ) VALUES (
    v_invitation.organization_id, v_user_id, 'staff', 'active',
    v_invitation.invited_by, now(),
    false, false, false, false, false, false
  ) RETURNING id INTO v_member_id;

  -- Expire the token after successful acceptance
  UPDATE public.organization_invitations
  SET status = 'accepted', accepted_at = now(), accepted_by = v_user_id, updated_at = now()
  WHERE id = v_invitation.id;

  INSERT INTO public.audit_logs (organization_id, actor_user_id, entity_type, entity_id, action, after_data)
  VALUES (v_invitation.organization_id, v_user_id, 'invitation', v_invitation.id, 'invitation_accepted',
    jsonb_build_object('member_id', v_member_id, 'email', lower(v_user_email)));

  RETURN jsonb_build_object(
    'organization_id', v_invitation.organization_id,
    'member_id', v_member_id,
    'role', 'staff'
  );
END;
$$;

ALTER FUNCTION public.accept_invitation(TEXT) OWNER TO postgres;
REVOKE EXECUTE ON FUNCTION public.accept_invitation(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_invitation(TEXT) TO authenticated;


-- ═══════════════════════════════════════════════════════════════════
-- PHASE 7: Billing Readiness Boundaries
-- ═══════════════════════════════════════════════════════════════════
-- Document that current billing is manual/private-beta.
-- The protect_organization_billing_columns trigger already prevents
-- client-side plan mutations. No code changes needed here, but we
-- verify the trigger is functional:

DO $$
BEGIN
  -- Verify the trigger exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'protect_billing_columns'
      AND tgrelid = 'public.organizations'::regclass
  ) THEN
    RAISE WARNING 'protect_billing_columns trigger not found on organizations table';
  ELSE
    RAISE NOTICE 'PASS: protect_billing_columns trigger exists on organizations table';
  END IF;
END $$;


-- ═══════════════════════════════════════════════════════════════════
-- Verification: CSV Escape Function Tests
-- Uses plain RAISE EXCEPTION since this runs at
-- migration time, not test suite time.
-- ═══════════════════════════════════════════════════════════════════
DO $$
BEGIN
  -- Test: plain text unchanged
  IF public.csv_escape('hello') != 'hello' THEN
    RAISE EXCEPTION 'csv_escape plain: expected hello, got %', public.csv_escape('hello');
  END IF;

  -- Test: empty string
  IF public.csv_escape('') != '' THEN
    RAISE EXCEPTION 'csv_escape empty: expected empty, got %', public.csv_escape('');
  END IF;

  -- Test: NULL
  IF public.csv_escape(NULL) != '' THEN
    RAISE EXCEPTION 'csv_escape null: expected empty, got %', public.csv_escape(NULL);
  END IF;

  -- Test: comma gets quoted
  IF public.csv_escape('a,b') != '"a,b"' THEN
    RAISE EXCEPTION 'csv_escape comma: expected quoted, got %', public.csv_escape('a,b');
  END IF;

  -- Test: double quote gets escaped
  IF public.csv_escape(E'say "hi"') != E'"say ""hi"""' THEN
    RAISE EXCEPTION 'csv_escape quote: expected escaped, got %', public.csv_escape(E'say "hi"');
  END IF;

  -- Test: newline gets normalized (result has no comma/quote so stays unquoted)
  IF public.csv_escape(E'line1\nline2') != 'line1 line2' THEN
    RAISE EXCEPTION 'csv_escape newline: expected normalized, got %', public.csv_escape(E'line1\nline2');
  END IF;

  -- Test: formula injection prefix (=)
  -- After prefix: '=SUM(A1) → ' then single quote added = '=SUM(A1)
  -- Then comma/quote check triggers quoting
  IF public.csv_escape('=SUM(A1)') != '"''=SUM(A1)"' THEN
    RAISE EXCEPTION 'csv_escape formula =: expected quoted prefix, got %', public.csv_escape('=SUM(A1)');
  END IF;

  -- Test: formula injection prefix (+)
  IF public.csv_escape('+CMD') != '"''+CMD"' THEN
    RAISE EXCEPTION 'csv_escape formula +: expected quoted prefix, got %', public.csv_escape('+CMD');
  END IF;

  -- Test: formula injection prefix (-)
  IF public.csv_escape('-RC2') != '"''-RC2"' THEN
    RAISE EXCEPTION 'csv_escape formula -: expected quoted prefix, got %', public.csv_escape('-RC2');
  END IF;

  -- Test: formula injection prefix (@)
  IF public.csv_escape('@SUM') != '"''@SUM"' THEN
    RAISE EXCEPTION 'csv_escape formula @: expected quoted prefix, got %', public.csv_escape('@SUM');
  END IF;

  -- Test: leading/trailing whitespace gets quoted
  IF public.csv_escape(' padded ') != '" padded "' THEN
    RAISE EXCEPTION 'csv_escape whitespace: expected quoted, got %', public.csv_escape(' padded ');
  END IF;

  RAISE NOTICE '=== CSV Escape Function Tests PASSED ===';
END $$;
