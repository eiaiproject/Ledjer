-- Create a function to rename accounts (bypasses RLS for system accounts)
-- This allows renaming display name while protecting other fields

CREATE OR REPLACE FUNCTION public.rename_account(
  p_account_id UUID,
  p_new_name TEXT
)
RETURNS JSON AS $$
DECLARE
  v_account RECORD;
  v_org_id UUID;
  v_trimmed_name TEXT;
  v_existing_id UUID;
BEGIN
  -- Trim the name
  v_trimmed_name := TRIM(p_new_name);
  
  -- Validate input
  IF v_trimmed_name = '' THEN
    RAISE EXCEPTION 'Nama akun wajib diisi';
  END IF;
  
  IF LENGTH(v_trimmed_name) > 60 THEN
    RAISE EXCEPTION 'Nama akun maksimal 60 karakter';
  END IF;
  
  -- Get the account
  SELECT id, organization_id, name, is_system, is_locked, code
  INTO v_account
  FROM public.accounts
  WHERE id = p_account_id;
  
  -- Check if account exists
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Akun tidak ditemukan';
  END IF;
  
  v_org_id := v_account.organization_id;
  
  -- Check permission
  IF NOT public.has_permission(v_org_id, 'can_manage_accounts') THEN
    RAISE EXCEPTION 'Tidak memiliki izin untuk mengelola akun';
  END IF;
  
  -- Check if account is locked (not just system)
  IF v_account.is_locked = true THEN
    RAISE EXCEPTION 'Akun ini terkunci dan tidak dapat diubah';
  END IF;
  
  -- Check for duplicate name (case-insensitive)
  SELECT id INTO v_existing_id
  FROM public.accounts
  WHERE organization_id = v_org_id
    AND LOWER(name) = LOWER(v_trimmed_name)
    AND id != p_account_id
  LIMIT 1;
  
  IF FOUND THEN
    RAISE EXCEPTION 'Nama akun sudah digunakan';
  END IF;
  
  -- Update the name
  UPDATE public.accounts
  SET name = v_trimmed_name,
      updated_at = NOW()
  WHERE id = p_account_id
  RETURNING id, name, code INTO v_account;
  
  -- Return the updated account
  RETURN json_build_object(
    'id', v_account.id,
    'name', v_account.name,
    'code', v_account.code
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.rename_account(UUID, TEXT) TO authenticated;

-- Add comment
COMMENT ON FUNCTION public.rename_account(UUID, TEXT) IS 'Rename account display name. Allows renaming system accounts but protects code, type, and normal_balance.';
