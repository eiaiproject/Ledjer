-- ============================================================
-- LEDJER MVP — Backend Security Hardening
-- Implements 7 critical security fixes to enforce backend authorization
-- ============================================================

-- ============================================================
-- FIX 1: BLOCK CLIENT-CONTROLLED PLAN CHANGES
-- ============================================================

-- Drop the policy that allows direct organization updates
DROP POLICY IF EXISTS "Members can update organization" ON public.organizations;

-- Create safe organization settings RPC (owner only, excludes billing fields)
CREATE OR REPLACE FUNCTION public.update_organization_settings(
  p_organization_id UUID,
  p_name TEXT DEFAULT NULL,
  p_business_type public.business_type DEFAULT NULL,
  p_books_start_date DATE DEFAULT NULL,
  p_default_reporting_period TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Add trigger to prevent client-context changes to protected billing/system columns
CREATE OR REPLACE FUNCTION public.protect_organization_billing_columns()
RETURNS TRIGGER AS $$
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS protect_organization_billing_trigger ON public.organizations;
CREATE TRIGGER protect_organization_billing_trigger
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_organization_billing_columns();

-- ============================================================
-- FIX 2: FORCE ALL TRANSACTION WRITES THROUGH ACCOUNTING RPCS
-- ============================================================

-- Drop direct insert/update RLS policies on transactions
DROP POLICY IF EXISTS "Members can insert transactions" ON public.transactions;
DROP POLICY IF EXISTS "Owner can update transactions" ON public.transactions;

-- Keep read access for active organization members
-- (The existing "Members can view transactions" policy remains)

-- Verify post_transaction and void_transaction are already secure
-- (They already have SECURITY DEFINER SET search_path = public from prior migration)

-- ============================================================
-- FIX 3: FORCE MEMBERSHIP CHANGES THROUGH STAFF RPCS
-- ============================================================

-- Drop direct insert/update RLS policies on organization_members
DROP POLICY IF EXISTS "Owner can insert org members" ON public.organization_members;
DROP POLICY IF EXISTS "Owner can update org members" ON public.organization_members;

-- Keep read access for active organization members
-- (The existing "Members can view org members" policy remains)

-- Harden invite_staff RPC (already has SET search_path = public from prior migration)
CREATE OR REPLACE FUNCTION public.invite_staff(
  p_organization_id UUID,
  p_email TEXT
)
RETURNS JSONB AS $$
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
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- Validate email format
  IF p_email IS NULL OR p_email !~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$' THEN
    RAISE EXCEPTION 'Invalid email address';
  END IF;

  -- Check inviter is active owner
  SELECT role::TEXT INTO v_inviter_role
  FROM public.organization_members
  WHERE organization_id = p_organization_id
    AND user_id = v_inviter_id
    AND status = 'active';

  IF v_inviter_role IS NULL THEN
    RAISE EXCEPTION 'You are not a member of this organization';
  END IF;

  IF v_inviter_role != 'owner' THEN
    RAISE EXCEPTION 'Only owners can invite staff';
  END IF;

  -- Find target user and verify email ownership
  SELECT id, email_confirmed_at
  INTO v_target_user_id, v_target_email_verified_at
  FROM auth.users
  WHERE LOWER(email) = LOWER(p_email)
  LIMIT 1;

  IF v_target_user_id IS NULL THEN
    RAISE EXCEPTION 'No user found with email: %. User must sign up first.', p_email;
  END IF;

  -- FIX 7: Require verified email ownership
  IF v_target_email_verified_at IS NULL THEN
    RAISE EXCEPTION 'Email address not verified. User must verify their email before being invited.';
  END IF;

  -- Check if user is already a member
  IF EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE organization_id = p_organization_id
      AND user_id = v_target_user_id
  ) THEN
    RAISE EXCEPTION 'User is already a member of this organization';
  END IF;

  -- Check plan limit for staff count
  SELECT current_plan INTO v_current_plan
  FROM public.organizations
  WHERE id = p_organization_id;

  SELECT COUNT(*)
  INTO v_staff_count
  FROM public.organization_members
  WHERE organization_id = p_organization_id
    AND role = 'staff'
    AND status = 'active';

  IF v_current_plan = 'free' AND v_staff_count >= 1 THEN
    RAISE EXCEPTION 'Free plan allows only 1 staff member. Please upgrade to Business plan.';
  END IF;

  -- Insert new staff member
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
    false
  ) RETURNING id INTO v_member_id;

  -- Audit log
  INSERT INTO public.audit_logs (
    organization_id,
    actor_user_id,
    entity_type,
    entity_id,
    action,
    after_data
  ) VALUES (
    p_organization_id,
    v_inviter_id,
    'organization_member',
    v_member_id,
    'invite_staff',
    jsonb_build_object(
      'invited_user_id', v_target_user_id,
      'email', p_email,
      'role', 'staff'
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'member_id', v_member_id,
    'user_id', v_target_user_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Harden update_staff_permissions RPC
CREATE OR REPLACE FUNCTION public.update_staff_permissions(
  p_organization_id UUID,
  p_member_id UUID,
  p_can_create_transaction BOOLEAN DEFAULT NULL,
  p_can_view_reports BOOLEAN DEFAULT NULL,
  p_can_manage_accounts BOOLEAN DEFAULT NULL,
  p_can_void_transaction BOOLEAN DEFAULT NULL,
  p_can_view_audit_log BOOLEAN DEFAULT NULL
)
RETURNS JSONB AS $$
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Harden remove_staff RPC
CREATE OR REPLACE FUNCTION public.remove_staff(
  p_organization_id UUID,
  p_member_id UUID
)
RETURNS JSONB AS $$
DECLARE
  v_remover_id UUID;
  v_remover_role TEXT;
  v_target_member RECORD;
BEGIN
  v_remover_id := auth.uid();
  IF v_remover_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- Check remover is active owner
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

  -- Get target member and ensure they belong to the same organization
  SELECT * INTO v_target_member
  FROM public.organization_members
  WHERE id = p_member_id
    AND organization_id = p_organization_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Staff member not found in this organization';
  END IF;

  -- Prevent removal of owner accounts
  IF v_target_member.role = 'owner' THEN
    RAISE EXCEPTION 'Cannot remove owner through remove_staff. Owners must be removed through organization transfer or deletion.';
  END IF;

  -- Prevent self-removal
  IF v_target_member.user_id = v_remover_id THEN
    RAISE EXCEPTION 'Cannot remove yourself';
  END IF;

  -- Soft delete: mark as removed
  UPDATE public.organization_members
  SET
    status = 'removed',
    updated_at = now()
  WHERE id = p_member_id;

  -- Audit log
  INSERT INTO public.audit_logs (
    organization_id,
    actor_user_id,
    entity_type,
    entity_id,
    action,
    before_data
  ) VALUES (
    p_organization_id,
    v_remover_id,
    'organization_member',
    p_member_id,
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================
-- FIX 4: ENFORCE REPORT PERMISSION AT DATA SOURCE LEVEL
-- ============================================================

-- Replace journal read policies to require can_view_reports
DROP POLICY IF EXISTS "Members can view journal entries" ON public.journal_entries;
DROP POLICY IF EXISTS "Members can view journal lines" ON public.journal_lines;

CREATE POLICY "Members with report permission can view journal entries"
  ON public.journal_entries FOR SELECT
  USING (public.has_permission(organization_id, 'can_view_reports'));

CREATE POLICY "Members with report permission can view journal lines"
  ON public.journal_lines FOR SELECT
  USING (public.has_permission(organization_id, 'can_view_reports'));

-- Add permission check to get_dashboard_summary
CREATE OR REPLACE FUNCTION public.get_dashboard_summary(
  p_organization_id UUID,
  p_from_date DATE DEFAULT NULL,
  p_to_date DATE DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_cash_balance NUMERIC;
  v_receivables NUMERIC;
  v_payables NUMERIC;
  v_revenue NUMERIC;
  v_expenses NUMERIC;
  v_net_income NUMERIC;
BEGIN
  -- Require report permission
  IF NOT public.has_permission(p_organization_id, 'can_view_reports') THEN
    RAISE EXCEPTION 'You do not have permission to view reports';
  END IF;

  -- Calculate cash balance (asset accounts with 'Kas' or 'Bank' in name)
  SELECT COALESCE(SUM(jl.debit - jl.credit), 0)
  INTO v_cash_balance
  FROM public.journal_lines jl
  JOIN public.accounts a ON a.id = jl.account_id
  JOIN public.journal_entries je ON je.id = jl.journal_entry_id
  WHERE jl.organization_id = p_organization_id
    AND a.account_type = 'asset'
    AND (a.name ILIKE '%kas%' OR a.name ILIKE '%bank%')
    AND je.status = 'posted'
    AND (p_to_date IS NULL OR je.entry_date <= p_to_date);

  -- Calculate receivables (account code 1200)
  SELECT COALESCE(SUM(jl.debit - jl.credit), 0)
  INTO v_receivables
  FROM public.journal_lines jl
  JOIN public.accounts a ON a.id = jl.account_id
  JOIN public.journal_entries je ON je.id = jl.journal_entry_id
  WHERE jl.organization_id = p_organization_id
    AND a.code = 1200
    AND je.status = 'posted'
    AND (p_to_date IS NULL OR je.entry_date <= p_to_date);

  -- Calculate payables (account code 2100)
  SELECT COALESCE(SUM(jl.credit - jl.debit), 0)
  INTO v_payables
  FROM public.journal_lines jl
  JOIN public.accounts a ON a.id = jl.account_id
  JOIN public.journal_entries je ON je.id = jl.journal_entry_id
  WHERE jl.organization_id = p_organization_id
    AND a.code = 2100
    AND je.status = 'posted'
    AND (p_to_date IS NULL OR je.entry_date <= p_to_date);

  -- Calculate revenue for period
  SELECT COALESCE(SUM(jl.credit - jl.debit), 0)
  INTO v_revenue
  FROM public.journal_lines jl
  JOIN public.accounts a ON a.id = jl.account_id
  JOIN public.journal_entries je ON je.id = jl.journal_entry_id
  WHERE jl.organization_id = p_organization_id
    AND a.account_type = 'revenue'
    AND je.status = 'posted'
    AND je.entry_type != 'opening_balance'
    AND (p_from_date IS NULL OR je.entry_date >= p_from_date)
    AND (p_to_date IS NULL OR je.entry_date <= p_to_date);

  -- Calculate expenses for period
  SELECT COALESCE(
    SUM(CASE WHEN a.account_type IN ('expense', 'cogs') THEN jl.debit - jl.credit ELSE 0 END),
    0
  ) INTO v_expenses
  FROM public.journal_lines jl
  JOIN public.accounts a ON a.id = jl.account_id
  JOIN public.journal_entries je ON je.id = jl.journal_entry_id
  WHERE jl.organization_id = p_organization_id
    AND a.account_type IN ('expense', 'cogs')
    AND je.status = 'posted'
    AND je.entry_type != 'opening_balance'
    AND (p_from_date IS NULL OR je.entry_date >= p_from_date)
    AND (p_to_date IS NULL OR je.entry_date <= p_to_date);

  v_net_income := v_revenue - v_expenses;

  RETURN jsonb_build_object(
    'cash_balance', v_cash_balance,
    'receivables', v_receivables,
    'payables', v_payables,
    'revenue', v_revenue,
    'expenses', v_expenses,
    'net_income', v_net_income
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

-- ============================================================
-- FIX 5: PROTECT SYSTEM AND LOCKED CHART-OF-ACCOUNT ROWS
-- ============================================================

-- Modify accounts update policy to prevent changes to system/locked accounts
DROP POLICY IF EXISTS "Members with account permission can update accounts" ON public.accounts;

CREATE POLICY "Members with account permission can update accounts"
  ON public.accounts FOR UPDATE
  USING (
    public.has_permission(organization_id, 'can_manage_accounts')
    AND NOT is_system
    AND NOT is_locked
  )
  WITH CHECK (
    public.has_permission(organization_id, 'can_manage_accounts')
    AND NOT is_system
    AND NOT is_locked
  );

-- Add trigger to protect certain account fields from modification
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
  END IF;

  -- Prevent changes to is_system or is_locked flags from client context
  IF OLD.is_system IS DISTINCT FROM NEW.is_system THEN
    RAISE EXCEPTION 'Cannot modify is_system flag';
  END IF;
  IF OLD.is_locked IS DISTINCT FROM NEW.is_locked THEN
    RAISE EXCEPTION 'Cannot modify is_locked flag';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS protect_account_fields_trigger ON public.accounts;
CREATE TRIGGER protect_account_fields_trigger
  BEFORE UPDATE ON public.accounts
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_account_fields();


-- ============================================================
-- FIX 6: MAKE TRANSACTION AND JOURNAL NUMBERING CONCURRENCY-SAFE
-- ============================================================

-- Create atomic counter table
CREATE TABLE IF NOT EXISTS public.organization_document_counters (
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  counter_name TEXT NOT NULL,
  current_value INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (organization_id, counter_name)
);

ALTER TABLE public.organization_document_counters ENABLE ROW LEVEL SECURITY;

-- Only backend functions should access this table
CREATE POLICY "No direct access to counters"
  ON public.organization_document_counters
  FOR ALL
  USING (false);

-- Backfill counter values from existing max numbers
INSERT INTO public.organization_document_counters (organization_id, counter_name, current_value)
SELECT 
  id AS organization_id,
  'transaction_number' AS counter_name,
  COALESCE(
    (SELECT MAX(CAST(SUBSTRING(transaction_number FROM '[0-9]+$') AS INTEGER))
     FROM public.transactions 
     WHERE organization_id = organizations.id
       AND transaction_number ~ '^TXN-[0-9]+$'),
    0
  ) AS current_value
FROM public.organizations
ON CONFLICT (organization_id, counter_name) 
DO UPDATE SET current_value = EXCLUDED.current_value;

INSERT INTO public.organization_document_counters (organization_id, counter_name, current_value)
SELECT 
  id AS organization_id,
  'entry_number' AS counter_name,
  COALESCE(
    (SELECT MAX(CAST(SUBSTRING(entry_number FROM '[0-9]+$') AS INTEGER))
     FROM public.journal_entries 
     WHERE organization_id = organizations.id
       AND entry_number ~ '^JE-[0-9]+$'),
    0
  ) AS current_value
FROM public.organizations
ON CONFLICT (organization_id, counter_name) 
DO UPDATE SET current_value = EXCLUDED.current_value;

-- Create atomic counter increment function
CREATE OR REPLACE FUNCTION public.get_next_counter(
  p_organization_id UUID,
  p_counter_name TEXT
)
RETURNS INTEGER AS $$
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Update generate_transaction_number to use atomic counter
-- Drop first to allow parameter name change
DROP FUNCTION IF EXISTS public.generate_transaction_number(UUID);

CREATE OR REPLACE FUNCTION public.generate_transaction_number(p_organization_id UUID)
RETURNS TEXT AS $$
DECLARE
  v_next_num INTEGER;
BEGIN
  v_next_num := public.get_next_counter(p_organization_id, 'transaction_number');
  RETURN 'TXN-' || LPAD(v_next_num::TEXT, 6, '0');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Update generate_entry_number to use atomic counter
-- Drop first to allow parameter name change
DROP FUNCTION IF EXISTS public.generate_entry_number(UUID);

CREATE OR REPLACE FUNCTION public.generate_entry_number(p_organization_id UUID)
RETURNS TEXT AS $$
DECLARE
  v_next_num INTEGER;
BEGIN
  v_next_num := public.get_next_counter(p_organization_id, 'entry_number');
  RETURN 'JE-' || LPAD(v_next_num::TEXT, 6, '0');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Add unique constraints to ensure no duplicates
-- First check if there are any existing duplicates
DO $$
DECLARE
  v_txn_dupes INTEGER;
  v_entry_dupes INTEGER;
BEGIN
  -- Check for duplicate transaction numbers
  SELECT COUNT(*) INTO v_txn_dupes
  FROM (
    SELECT organization_id, transaction_number, COUNT(*) as cnt
    FROM public.transactions
    WHERE transaction_number IS NOT NULL
    GROUP BY organization_id, transaction_number
    HAVING COUNT(*) > 1
  ) dupes;

  IF v_txn_dupes > 0 THEN
    RAISE WARNING 'Found % duplicate transaction numbers. These must be resolved before applying unique constraint.', v_txn_dupes;
    RAISE EXCEPTION 'Duplicate transaction numbers detected. Please fix data before proceeding.';
  END IF;

  -- Check for duplicate entry numbers
  SELECT COUNT(*) INTO v_entry_dupes
  FROM (
    SELECT organization_id, entry_number, COUNT(*) as cnt
    FROM public.journal_entries
    WHERE entry_number IS NOT NULL
    GROUP BY organization_id, entry_number
    HAVING COUNT(*) > 1
  ) dupes;

  IF v_entry_dupes > 0 THEN
    RAISE WARNING 'Found % duplicate entry numbers. These must be resolved before applying unique constraint.', v_entry_dupes;
    RAISE EXCEPTION 'Duplicate entry numbers detected. Please fix data before proceeding.';
  END IF;
END $$;

-- Add unique constraints if no duplicates found
ALTER TABLE public.transactions 
  DROP CONSTRAINT IF EXISTS transactions_org_txn_number_unique;
ALTER TABLE public.transactions 
  ADD CONSTRAINT transactions_org_txn_number_unique 
  UNIQUE (organization_id, transaction_number);

ALTER TABLE public.journal_entries 
  DROP CONSTRAINT IF EXISTS journal_entries_org_entry_number_unique;
ALTER TABLE public.journal_entries 
  ADD CONSTRAINT journal_entries_org_entry_number_unique 
  UNIQUE (organization_id, entry_number);

-- ============================================================
-- AUDIT LOG POLICY UPDATE
-- ============================================================

-- Update audit log policy to also check can_view_audit_log permission for staff
DROP POLICY IF EXISTS "Owner can view audit logs" ON public.audit_logs;

CREATE POLICY "Members with audit permission can view audit logs"
  ON public.audit_logs FOR SELECT
  USING (public.has_permission(organization_id, 'can_view_audit_log'));

-- ============================================================
-- MIGRATION COMPLETE
-- All 7 security fixes have been implemented:
-- 1. ✓ Block client-controlled plan changes
-- 2. ✓ Force all transaction writes through accounting RPCs
-- 3. ✓ Force membership changes through staff RPCs
-- 4. ✓ Enforce report permission at data source level
-- 5. ✓ Protect system and locked chart-of-account rows
-- 6. ✓ Make transaction and journal numbering concurrency-safe
-- 7. ✓ Require verified email ownership for staff invite
-- ============================================================
