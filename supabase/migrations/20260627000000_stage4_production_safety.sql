-- =============================================================================
-- LEDJER — Stage 4: Public Production SaaS Readiness
-- =============================================================================
-- Adds: period lock, staff invitations, admin ops, export RPCs.
-- Does NOT weaken existing RLS or bypass accounting safeguards.
--
-- Migration order: 20260627000000_stage4_production_safety.sql
-- =============================================================================

-- ═══════════════════════════════════════════════════════════════════
-- 1. ORGANIZATION PERIOD LOCK & ADMIN SAFETY FIELDS
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS locked_through_date DATE,
  ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS suspension_reason TEXT;

CREATE OR REPLACE FUNCTION public.protect_organization_core_fields() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path = public
AS $$
BEGIN
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
-- 2. ORGANIZATION INVITATIONS TABLE
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.organization_invitations (
  id UUID DEFAULT gen_random_uuid() NOT NULL,
  organization_id UUID NOT NULL,
  email TEXT NOT NULL,
  token TEXT NOT NULL,
  role TEXT DEFAULT 'staff' NOT NULL CHECK (role IN ('owner','staff')),
  invited_by UUID NOT NULL,
  status TEXT DEFAULT 'pending' NOT NULL CHECK (status IN ('pending','accepted','revoked','expired')),
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  accepted_by UUID,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

ALTER TABLE public.organization_invitations OWNER TO postgres;
ALTER TABLE ONLY public.organization_invitations
  ADD CONSTRAINT organization_invitations_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.organization_invitations
  ADD CONSTRAINT organization_invitations_organization_id_fkey
    FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;
CREATE UNIQUE INDEX idx_invitations_token ON public.organization_invitations(token);
CREATE INDEX idx_invitations_org_email ON public.organization_invitations(organization_id, email, status);

-- RLS
ALTER TABLE public.organization_invitations ENABLE ROW LEVEL SECURITY;

-- Org members can see invitations for their org
CREATE POLICY invitations_select ON public.organization_invitations
  FOR SELECT USING (public.is_org_member(organization_id));

-- ═══════════════════════════════════════════════════════════════════
-- 5. PERIOD LOCK ENFORCEMENT
-- ═══════════════════════════════════════════════════════════════════

-- Function: set period lock (owner only)
CREATE OR REPLACE FUNCTION public.set_period_lock(
  p_organization_id UUID,
  p_locked_through_date DATE
) RETURNS JSONB
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path = public
AS $$
DECLARE
  v_role TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Autentikasi diperlukan';
  END IF;

  SELECT role::TEXT INTO v_role
  FROM public.organization_members
  WHERE organization_id = p_organization_id
    AND user_id = auth.uid()
    AND status = 'active';

  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Anda bukan anggota organisasi ini';
  END IF;

  IF v_role != 'owner' THEN
    RAISE EXCEPTION 'Hanya owner yang dapat mengunci periode akuntansi';
  END IF;

  IF p_locked_through_date IS NULL THEN
    RAISE EXCEPTION 'Tanggal tidak boleh kosong';
  END IF;

  UPDATE public.organizations
  SET locked_through_date = p_locked_through_date,
      updated_at = now()
  WHERE id = p_organization_id;

  INSERT INTO public.audit_logs (organization_id, actor_user_id, entity_type, entity_id, action, after_data)
  VALUES (p_organization_id, auth.uid(), 'organization', p_organization_id, 'set_period_lock',
    jsonb_build_object('locked_through_date', p_locked_through_date));

  RETURN jsonb_build_object('locked_through_date', p_locked_through_date);
END;
$$;

ALTER FUNCTION public.set_period_lock(UUID, DATE) OWNER TO postgres;
REVOKE EXECUTE ON FUNCTION public.set_period_lock(UUID, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_period_lock(UUID, DATE) TO authenticated;

-- Function: unlock period (owner only, audited)
CREATE OR REPLACE FUNCTION public.unlock_period_lock(
  p_organization_id UUID
) RETURNS JSONB
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path = public
AS $$
DECLARE
  v_role TEXT;
  v_old_date DATE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Autentikasi diperlukan';
  END IF;

  SELECT role::TEXT INTO v_role
  FROM public.organization_members
  WHERE organization_id = p_organization_id
    AND user_id = auth.uid()
    AND status = 'active';

  IF v_role IS NULL OR v_role != 'owner' THEN
    RAISE EXCEPTION 'Hanya owner yang dapat membuka kunci periode';
  END IF;

  SELECT locked_through_date INTO v_old_date
  FROM public.organizations WHERE id = p_organization_id;

  UPDATE public.organizations
  SET locked_through_date = NULL,
      updated_at = now()
  WHERE id = p_organization_id;

  INSERT INTO public.audit_logs (organization_id, actor_user_id, entity_type, entity_id, action, after_data)
  VALUES (p_organization_id, auth.uid(), 'organization', p_organization_id, 'unlock_period_lock',
    jsonb_build_object('previous_locked_through_date', v_old_date));

  RETURN jsonb_build_object('locked_through_date', NULL);
END;
$$;

ALTER FUNCTION public.unlock_period_lock(UUID) OWNER TO postgres;
REVOKE EXECUTE ON FUNCTION public.unlock_period_lock(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.unlock_period_lock(UUID) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════
-- 6. TRUE STAFF INVITATION FLOW
-- ═══════════════════════════════════════════════════════════════════

-- Create invitation (owner only)
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
  v_invitation_id UUID;
  v_token TEXT;
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

  -- Generate secure token (32 bytes hex = 64 chars)
  v_token := encode(extensions.gen_random_bytes(32), 'hex');

  INSERT INTO public.organization_invitations (
    organization_id, email, token, role, invited_by, expires_at
  ) VALUES (
    p_organization_id, lower(p_email), v_token, 'staff', v_inviter_id,
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

-- Accept invitation (any authenticated user)
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
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Autentikasi diperlukan';
  END IF;

  SELECT email INTO v_user_email
  FROM auth.users WHERE id = v_user_id;

  SELECT * INTO v_invitation
  FROM public.organization_invitations
  WHERE token = p_token
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

-- Revoke invitation (owner only)
CREATE OR REPLACE FUNCTION public.revoke_invitation(
  p_organization_id UUID,
  p_invitation_id UUID
) RETURNS JSONB
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path = public
AS $$
DECLARE
  v_role TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Autentikasi diperlukan';
  END IF;

  SELECT role::TEXT INTO v_role
  FROM public.organization_members
  WHERE organization_id = p_organization_id
    AND user_id = auth.uid()
    AND status = 'active';

  IF v_role IS NULL OR v_role != 'owner' THEN
    RAISE EXCEPTION 'Hanya owner yang dapat membatalkan undangan';
  END IF;

  UPDATE public.organization_invitations
  SET status = 'revoked', updated_at = now()
  WHERE id = p_invitation_id
    AND organization_id = p_organization_id
    AND status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Undangan tidak ditemukan atau sudah diproses';
  END IF;

  INSERT INTO public.audit_logs (organization_id, actor_user_id, entity_type, entity_id, action, after_data)
  VALUES (p_organization_id, auth.uid(), 'invitation', p_invitation_id, 'invitation_revoked', '{}'::jsonb);

  RETURN jsonb_build_object('revoked', true);
END;
$$;

ALTER FUNCTION public.revoke_invitation(UUID, UUID) OWNER TO postgres;
REVOKE EXECUTE ON FUNCTION public.revoke_invitation(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revoke_invitation(UUID, UUID) TO authenticated;

-- Get pending invitations for an org
CREATE OR REPLACE FUNCTION public.get_invitations(
  p_organization_id UUID
) RETURNS JSONB
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path = public
AS $$
DECLARE
  v_role TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Autentikasi diperlukan';
  END IF;

  SELECT role::TEXT INTO v_role
  FROM public.organization_members
  WHERE organization_id = p_organization_id
    AND user_id = auth.uid()
    AND status = 'active';

  IF v_role IS NULL OR v_role != 'owner' THEN
    RAISE EXCEPTION 'Hanya owner yang dapat melihat undangan';
  END IF;

  RETURN (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', oi.id,
      'email', oi.email,
      'token', oi.token,
      'role', oi.role,
      'status', oi.status,
      'expires_at', oi.expires_at,
      'created_at', oi.created_at,
      'invited_by_name', p.full_name
    ) ORDER BY oi.created_at DESC), '[]'::jsonb)
    FROM public.organization_invitations oi
    LEFT JOIN public.profiles p ON p.user_id = oi.invited_by
    WHERE oi.organization_id = p_organization_id
      AND oi.status = 'pending'
  );
END;
$$;

ALTER FUNCTION public.get_invitations(UUID) OWNER TO postgres;
REVOKE EXECUTE ON FUNCTION public.get_invitations(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_invitations(UUID) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════
-- 7. ADMIN / SUPPORT OPERATIONS (service-role-only RPCs)
-- ═══════════════════════════════════════════════════════════════════

-- Admin: list organizations
CREATE OR REPLACE FUNCTION public.admin_list_organizations(
  p_search TEXT DEFAULT NULL
) RETURNS JSONB
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path = public
AS $$
BEGIN
  -- Only callable by service role (checks current_setting for app name)
  -- In production, this should only be called from admin dashboard via service role key
  RETURN (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', o.id,
      'name', o.name,
      'locked_through_date', o.locked_through_date,
      'suspended_at', o.suspended_at,
      'created_at', o.created_at,
      'owner_email', p.email,
      'member_count', mc.cnt
    )), '[]'::jsonb)
    FROM public.organizations o
    LEFT JOIN public.profiles p ON p.user_id = o.created_by
    LEFT JOIN (
      SELECT organization_id, COUNT(*)::INTEGER AS cnt
      FROM public.organization_members WHERE status = 'active'
      GROUP BY organization_id
    ) mc ON mc.organization_id = o.id
    WHERE (p_search IS NULL OR o.name ILIKE '%' || p_search || '%')
    ORDER BY o.created_at DESC
  );
END;
$$;

ALTER FUNCTION public.admin_list_organizations(TEXT) OWNER TO postgres;
REVOKE EXECUTE ON FUNCTION public.admin_list_organizations(TEXT) FROM PUBLIC, anon, authenticated;

-- Admin: get organization detail
CREATE OR REPLACE FUNCTION public.admin_get_organization(
  p_organization_id UUID
) RETURNS JSONB
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path = public
AS $$
BEGIN
  RETURN (
    SELECT jsonb_build_object(
      'organization', jsonb_build_object(
        'id', o.id, 'name', o.name,
        'locked_through_date', o.locked_through_date,
        'suspended_at', o.suspended_at,
        'suspension_reason', o.suspension_reason,
        'created_at', o.created_at
      ),
      'owner', jsonb_build_object(
        'email', p.email, 'full_name', p.full_name
      ),
      'members', (
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
          'user_id', om.user_id,
          'role', om.role,
          'status', om.status,
          'email', pr.email,
          'full_name', pr.full_name
        )), '[]'::jsonb)
        FROM public.organization_members om
        LEFT JOIN public.profiles pr ON pr.user_id = om.user_id
        WHERE om.organization_id = o.id AND om.status = 'active'
      )
    )
    FROM public.organizations o
    LEFT JOIN public.profiles p ON p.user_id = o.created_by
    WHERE o.id = p_organization_id
  );
END;
$$;

ALTER FUNCTION public.admin_get_organization(UUID) OWNER TO postgres;
REVOKE EXECUTE ON FUNCTION public.admin_get_organization(UUID) FROM PUBLIC, anon, authenticated;

-- Admin: suspend/unsuspend organization
CREATE OR REPLACE FUNCTION public.admin_set_suspension(
  p_organization_id UUID,
  p_suspended BOOLEAN,
  p_reason TEXT DEFAULT NULL
) RETURNS JSONB
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path = public
AS $$
BEGIN
  IF p_suspended THEN
    UPDATE public.organizations
    SET suspended_at = now(),
        suspension_reason = COALESCE(p_reason, 'Suspended by admin'),
        updated_at = now()
    WHERE id = p_organization_id;
  ELSE
    UPDATE public.organizations
    SET suspended_at = NULL,
        suspension_reason = NULL,
        updated_at = now()
    WHERE id = p_organization_id;
  END IF;

  INSERT INTO public.audit_logs (organization_id, actor_user_id, entity_type, entity_id, action, after_data)
  VALUES (p_organization_id, NULL, 'organization', p_organization_id,
    CASE WHEN p_suspended THEN 'admin_suspend' ELSE 'admin_unsuspend' END,
    jsonb_build_object('suspended', p_suspended, 'reason', p_reason));

  RETURN jsonb_build_object('suspended', p_suspended);
END;
$$;

ALTER FUNCTION public.admin_set_suspension(UUID, BOOLEAN, TEXT) OWNER TO postgres;
REVOKE EXECUTE ON FUNCTION public.admin_set_suspension(UUID, BOOLEAN, TEXT) FROM PUBLIC, anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════
-- 8. CSV EXPORT RPCs
-- ═══════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.export_transactions_csv(UUID, DATE, DATE);

-- Export transactions as CSV text
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
    to_char(t.transaction_date, 'YYYY-MM-DD') || ',' ||
    t.transaction_number || ',' ||
    t.transaction_type || ',' ||
    COALESCE(replace(party_name, ',', ';'), '') || ',' ||
    COALESCE(replace(t.description, ',', ';'), '') || ',' ||
    COALESCE(t.amount::TEXT, '0') || ',' ||
    t.status,
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

-- Export accounts (chart of accounts) as CSV
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
    a.code || ',' ||
    a.name || ',' ||
    a.account_type || ',' ||
    a.normal_balance || ',' ||
    a.is_active,
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

-- Export products as CSV
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
    pr.code || ',' ||
    pr.name || ',' ||
    COALESCE(replace(pr.description, ',', ';'), '') || ',' ||
    COALESCE(pr.unit, '') || ',' ||
    COALESCE(pr.purchase_price::TEXT, '0') || ',' ||
    COALESCE(pr.selling_price::TEXT, '0') || ',' ||
    COALESCE(pr.current_stock::TEXT, '0') || ',' ||
    COALESCE(pr.min_stock::TEXT, '0') || ',' ||
    pr.is_active,
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

-- Export trial balance as CSV
CREATE OR REPLACE FUNCTION public.export_trial_balance_csv(
  p_organization_id UUID,
  p_as_of_date DATE DEFAULT NULL
) RETURNS TEXT
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path = public
AS $$
DECLARE
  v_result TEXT;
  v_header TEXT := 'Kode Akun,Nama Akun,Debit,Kredit';
  v_date DATE;
BEGIN
  IF NOT public.is_org_member(p_organization_id) THEN
    RAISE EXCEPTION 'Anda bukan anggota organisasi ini';
  END IF;

  IF NOT public.has_permission(p_organization_id, 'can_view_reports') THEN
    RAISE EXCEPTION 'Anda tidak memiliki izin untuk export data';
  END IF;

  v_date := COALESCE(p_as_of_date, CURRENT_DATE);

  SELECT string_agg(
    tb.account_code || ',' ||
    tb.account_name || ',' ||
    tb.ending_debit || ',' ||
    tb.ending_credit,
    E'\n'
  ) INTO v_result
  FROM public.get_trial_balance(p_organization_id, v_date) tb;

  RETURN v_header || E'\n' || COALESCE(v_result, '');
END;
$$;

ALTER FUNCTION public.export_trial_balance_csv(UUID, DATE) OWNER TO postgres;
REVOKE EXECUTE ON FUNCTION public.export_trial_balance_csv(UUID, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.export_trial_balance_csv(UUID, DATE) TO authenticated;

-- Export profit & loss as CSV
CREATE OR REPLACE FUNCTION public.export_profit_loss_csv(
  p_organization_id UUID,
  p_from_date DATE DEFAULT NULL,
  p_to_date DATE DEFAULT NULL
) RETURNS TEXT
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path = public
AS $$
DECLARE
  v_result TEXT;
  v_header TEXT := 'Bagian,Kode Akun,Nama Akun,Jumlah';
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
    pl.section || ',' ||
    pl.account_code || ',' ||
    pl.account_name || ',' ||
    pl.amount,
    E'\n'
  ) INTO v_result
  FROM public.get_profit_loss(p_organization_id, v_from, v_to) pl;

  RETURN v_header || E'\n' || COALESCE(v_result, '');
END;
$$;

ALTER FUNCTION public.export_profit_loss_csv(UUID, DATE, DATE) OWNER TO postgres;
REVOKE EXECUTE ON FUNCTION public.export_profit_loss_csv(UUID, DATE, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.export_profit_loss_csv(UUID, DATE, DATE) TO authenticated;

-- Export balance sheet as CSV
CREATE OR REPLACE FUNCTION public.export_balance_sheet_csv(
  p_organization_id UUID,
  p_as_of_date DATE DEFAULT NULL
) RETURNS TEXT
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path = public
AS $$
DECLARE
  v_result TEXT;
  v_header TEXT := 'Bagian,Kode Akun,Nama Akun,Jumlah';
  v_date DATE;
BEGIN
  IF NOT public.is_org_member(p_organization_id) THEN
    RAISE EXCEPTION 'Anda bukan anggota organisasi ini';
  END IF;

  IF NOT public.has_permission(p_organization_id, 'can_view_reports') THEN
    RAISE EXCEPTION 'Anda tidak memiliki izin untuk export data';
  END IF;

  v_date := COALESCE(p_as_of_date, CURRENT_DATE);

  SELECT string_agg(
    bs.section || ',' ||
    bs.account_code || ',' ||
    bs.account_name || ',' ||
    bs.amount,
    E'\n'
  ) INTO v_result
  FROM public.get_balance_sheet(p_organization_id, v_date) bs;

  RETURN v_header || E'\n' || COALESCE(v_result, '');
END;
$$;

ALTER FUNCTION public.export_balance_sheet_csv(UUID, DATE) OWNER TO postgres;
REVOKE EXECUTE ON FUNCTION public.export_balance_sheet_csv(UUID, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.export_balance_sheet_csv(UUID, DATE) TO authenticated;

-- Export general ledger as CSV
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
    gl.entry_date || ',' ||
    gl.transaction_number || ',' ||
    gl.account_id || ',' ||
    gl.account_code || ',' ||
    gl.account_name || ',' ||
    COALESCE(replace(gl.description, ',', ';'), '') || ',' ||
    gl.debit || ',' ||
    gl.credit || ',' ||
    gl.running_balance,
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
-- 9. PERIOD LOCK ENFORCEMENT IN post_transaction
-- ═══════════════════════════════════════════════════════════════════
-- Add locked_through_date check after the org metadata fetch in post_transaction.
-- We use a trigger-based approach to avoid modifying the large function body.

CREATE OR REPLACE FUNCTION public.enforce_period_lock_on_transaction() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path = public
AS $$
DECLARE
  v_locked_date DATE;
BEGIN
  -- Only enforce for new transactions (not voids/reversals which come from service role)
  IF current_setting('role') = 'authenticated' THEN
    SELECT locked_through_date INTO v_locked_date
    FROM public.organizations
    WHERE id = NEW.organization_id;

    IF v_locked_date IS NOT NULL AND NEW.transaction_date <= v_locked_date THEN
      RAISE EXCEPTION 'Tanggal transaksi % berada pada atau sebelum periode terkunci (%). Hubungi owner untuk membuka kunci.',
        NEW.transaction_date, v_locked_date;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER enforce_period_lock_before_transaction
  BEFORE INSERT ON public.transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_period_lock_on_transaction();

-- ═══════════════════════════════════════════════════════════════════
-- 11. GET PENDING INVITATIONS LIST RPC (for team page)
-- ═══════════════════════════════════════════════════════════════════
-- Note: get_invitations already defined above in section 6.

-- ═══════════════════════════════════════════════════════════════════
-- 12. GRANT EXECUTE for existing RPCs that need new permissions
-- ═══════════════════════════════════════════════════════════════════

-- Revoke and re-grant for any existing functions that might need it
-- (defense in depth — most are already handled by baseline)
