-- P0-2: Fix log_security_event cross-tenant audit-log injection
-- Derive actor from auth.uid(), require org membership, revoke public/anon/authenticated access

BEGIN;

CREATE OR REPLACE FUNCTION public.log_security_event(
  p_organization_id UUID,
  p_user_id UUID,
  p_action TEXT,
  p_resource_type TEXT DEFAULT NULL,
  p_resource_id TEXT DEFAULT NULL,
  p_details JSONB DEFAULT NULL,
  p_ip_address INET DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL
)
RETURNS UUID AS $$
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Revoke from PUBLIC, anon, authenticated — only service_role may call this
REVOKE EXECUTE ON FUNCTION public.log_security_event(UUID, UUID, TEXT, TEXT, TEXT, JSONB, INET, TEXT) FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
