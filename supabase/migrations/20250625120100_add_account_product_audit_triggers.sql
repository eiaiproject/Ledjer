-- ============================================================================
-- Add audit triggers for accounts and products tables.
-- These triggers automatically log create/update/deactivate operations
-- to audit_logs without changing client code.
-- ============================================================================

-- Function to log account mutations
CREATE OR REPLACE FUNCTION "public"."audit_account_changes"()
RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
AS $$
DECLARE
  v_actor_id UUID;
  v_action TEXT;
  v_entity_id UUID;
  v_before_data JSONB;
  v_after_data JSONB;
BEGIN
  -- Derive actor from JWT
  v_actor_id := auth.uid();

  -- Skip audit logging when no authenticated user (e.g., migrations, SECURITY DEFINER functions)
  IF v_actor_id IS NULL THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    ELSE
      RETURN NEW;
    END IF;
  END IF;

  IF TG_OP = 'INSERT' THEN
    v_action := 'create';
    v_entity_id := NEW.id;
    v_after_data := jsonb_build_object(
      'code', NEW.code,
      'name', NEW.name,
      'account_type', NEW.account_type,
      'normal_balance', NEW.normal_balance,
      'is_active', NEW.is_active,
      'is_cash_account', NEW.is_cash_account,
      'is_system', NEW.is_system
    );
  ELSIF TG_OP = 'UPDATE' THEN
    -- Detect deactivate (is_active changed from true to false)
    IF OLD.is_active = true AND NEW.is_active = false THEN
      v_action := 'deactivate';
    ELSE
      v_action := 'update';
    END IF;
    v_entity_id := NEW.id;
    v_before_data := jsonb_build_object(
      'name', OLD.name,
      'is_active', OLD.is_active,
      'is_cash_account', OLD.is_cash_account
    );
    v_after_data := jsonb_build_object(
      'name', NEW.name,
      'is_active', NEW.is_active,
      'is_cash_account', NEW.is_cash_account
    );
  ELSIF TG_OP = 'DELETE' THEN
    v_action := 'delete';
    v_entity_id := OLD.id;
    v_before_data := jsonb_build_object(
      'code', OLD.code,
      'name', OLD.name,
      'account_type', OLD.account_type
    );
  END IF;

  INSERT INTO public.audit_logs (
    organization_id, actor_user_id, entity_type, entity_id,
    action, before_data, after_data
  ) VALUES (
    COALESCE(NEW.organization_id, OLD.organization_id),
    v_actor_id,
    'account',
    v_entity_id,
    v_action,
    v_before_data,
    v_after_data
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$;

-- Function to log product mutations
CREATE OR REPLACE FUNCTION "public"."audit_product_changes"()
RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
AS $$
DECLARE
  v_actor_id UUID;
  v_action TEXT;
  v_entity_id UUID;
  v_before_data JSONB;
  v_after_data JSONB;
BEGIN
  -- Derive actor from JWT
  v_actor_id := auth.uid();

  -- Skip audit logging when no authenticated user (e.g., migrations, SECURITY DEFINER functions)
  IF v_actor_id IS NULL THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    ELSE
      RETURN NEW;
    END IF;
  END IF;

  IF TG_OP = 'INSERT' THEN
    v_action := 'create';
    v_entity_id := NEW.id;
    v_after_data := jsonb_build_object(
      'code', NEW.code,
      'name', NEW.name,
      'selling_price', NEW.selling_price,
      'is_active', NEW.is_active
    );
  ELSIF TG_OP = 'UPDATE' THEN
    -- Detect deactivate (is_active changed from true to false)
    IF OLD.is_active = true AND NEW.is_active = false THEN
      v_action := 'deactivate';
    ELSE
      v_action := 'update';
    END IF;
    v_entity_id := NEW.id;
    v_before_data := jsonb_build_object(
      'name', OLD.name,
      'selling_price', OLD.selling_price,
      'is_active', OLD.is_active
    );
    v_after_data := jsonb_build_object(
      'name', NEW.name,
      'selling_price', NEW.selling_price,
      'is_active', NEW.is_active
    );
  ELSIF TG_OP = 'DELETE' THEN
    v_action := 'delete';
    v_entity_id := OLD.id;
    v_before_data := jsonb_build_object(
      'code', OLD.code,
      'name', OLD.name
    );
  END IF;

  INSERT INTO public.audit_logs (
    organization_id, actor_user_id, entity_type, entity_id,
    action, before_data, after_data
  ) VALUES (
    COALESCE(NEW.organization_id, OLD.organization_id),
    v_actor_id,
    'product',
    v_entity_id,
    v_action,
    v_before_data,
    v_after_data
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$;

-- Create triggers
DROP TRIGGER IF EXISTS audit_accounts_trigger ON public.accounts;
CREATE TRIGGER audit_accounts_trigger
  AFTER INSERT OR UPDATE OR DELETE ON public.accounts
  FOR EACH ROW
  EXECUTE FUNCTION "public"."audit_account_changes"();

DROP TRIGGER IF EXISTS audit_products_trigger ON public.products;
CREATE TRIGGER audit_products_trigger
  AFTER INSERT OR UPDATE OR DELETE ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION "public"."audit_product_changes"();

-- Add comments
COMMENT ON FUNCTION "public"."audit_account_changes"() IS 'Audit trigger for accounts table: logs create/update/deactivate/delete operations.';
COMMENT ON FUNCTION "public"."audit_product_changes"() IS 'Audit trigger for products table: logs create/update/deactivate/delete operations.';
