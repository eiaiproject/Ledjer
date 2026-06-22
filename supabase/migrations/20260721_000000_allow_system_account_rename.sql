-- Allow renaming system accounts (display name only)
-- Other fields (code, account_type, normal_balance) remain protected by trigger

-- Drop the restrictive policy
DROP POLICY IF EXISTS "Members with account permission can update accounts" ON public.accounts;

-- Create new policy that allows name updates for system accounts
-- but still requires can_manage_accounts permission
CREATE POLICY "Members with account permission can update accounts"
  ON public.accounts FOR UPDATE
  USING (
    public.has_permission(organization_id, 'can_manage_accounts')
    AND (
      -- Non-system accounts: full edit allowed
      (NOT is_system AND NOT is_locked)
      OR
      -- System accounts: only name update allowed (other fields protected by trigger)
      (is_system AND NOT is_locked)
    )
  )
  WITH CHECK (
    public.has_permission(organization_id, 'can_manage_accounts')
    AND (
      -- Non-system accounts: full edit allowed
      (NOT is_system AND NOT is_locked)
      OR
      -- System accounts: only name update allowed (other fields protected by trigger)
      (is_system AND NOT is_locked)
    )
  );

-- Update the trigger to be more specific about what can change on system accounts
CREATE OR REPLACE FUNCTION public.protect_account_fields()
RETURNS TRIGGER AS $$
BEGIN
  -- Prevent changes to critical fields on system or locked accounts
  IF OLD.is_system = true OR OLD.is_locked = true THEN
    IF OLD.code IS DISTINCT FROM NEW.code THEN
      RAISE EXCEPTION 'Cannot modify code on system or locked accounts';
    END IF;
    IF OLD.account_type IS DISTINCT FROM NEW.account_type THEN
      RAISE EXCEPTION 'Cannot modify account_type on system or locked accounts';
    END IF;
    IF OLD.normal_balance IS DISTINCT FROM NEW.normal_balance THEN
      RAISE EXCEPTION 'Cannot modify normal_balance on system or locked accounts';
    END IF;
    IF OLD.is_cash_account IS DISTINCT FROM NEW.is_cash_account THEN
      RAISE EXCEPTION 'Cannot modify is_cash_account on system or locked accounts';
    END IF;
    IF OLD.parent_account_id IS DISTINCT FROM NEW.parent_account_id THEN
      RAISE EXCEPTION 'Cannot modify parent_account_id on system or locked accounts';
    END IF;
    -- Allow name update (display name change is safe)
    -- Allow is_active update (can deactivate system accounts if needed)
    -- Allow report_group update (cosmetic grouping change)
  END IF;
  
  -- Always prevent changing organization_id
  IF OLD.organization_id IS DISTINCT FROM NEW.organization_id THEN
    RAISE EXCEPTION 'Cannot change organization_id';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add comment explaining the policy
COMMENT ON POLICY "Members with account permission can update accounts" ON public.accounts 
  IS 'Allows renaming system accounts but protects code, type, and normal_balance via trigger';
