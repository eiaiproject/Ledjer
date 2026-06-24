-- P1-3: protect_account_fields trigger — restore SECURITY DEFINER + tamper guards
-- Allows display-name rename (the 20260721 intent) but blocks is_system/is_locked changes
-- from non-service_role callers

BEGIN;

CREATE OR REPLACE FUNCTION public.protect_account_fields()
RETURNS TRIGGER AS $$
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Drop the old trigger (name varies by migration history)
DROP TRIGGER IF EXISTS protect_account_fields_trigger ON public.accounts;
DROP TRIGGER IF EXISTS protect_account_fields ON public.accounts;

CREATE TRIGGER protect_account_fields_trigger
  BEFORE UPDATE ON public.accounts
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_account_fields();

NOTIFY pgrst, 'reload schema';

COMMIT;
