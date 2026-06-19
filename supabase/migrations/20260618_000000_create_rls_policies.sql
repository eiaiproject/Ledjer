-- ============================================================
-- LEDJER MVP — Row Level Security Policies
-- ============================================================

-- ENABLE RLS
-- ------------------------------------------------------------
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE parties ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- HELPER: Check if user is active member of org
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_org_member(org_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM organization_members
    WHERE organization_id = org_id
      AND user_id = auth.uid()
      AND status = 'active'
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- HELPER: Get user role in org
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_org_role(org_id UUID)
RETURNS TEXT AS $$
  SELECT role::TEXT FROM organization_members
  WHERE organization_id = org_id
    AND user_id = auth.uid()
    AND status = 'active'
  LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- PROFILES — users can read/update their own profile
-- ------------------------------------------------------------
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- ORGANIZATIONS — members can read, creator can update
-- ------------------------------------------------------------
CREATE POLICY "Members can view organization"
  ON organizations FOR SELECT
  USING (is_org_member(id));

CREATE POLICY "Members can update organization"
  ON organizations FOR UPDATE
  USING (is_org_member(id) AND get_org_role(id) = 'owner');

CREATE POLICY "Authenticated users can create organization"
  ON organizations FOR INSERT
  WITH CHECK (auth.uid() = created_by);

-- ORGANIZATION MEMBERS — members can read, owner can manage
-- ------------------------------------------------------------
CREATE POLICY "Members can view org members"
  ON organization_members FOR SELECT
  USING (is_org_member(organization_id));

CREATE POLICY "Owner can insert org members"
  ON organization_members FOR INSERT
  WITH CHECK (
    is_org_member(organization_id) AND
    get_org_role(organization_id) = 'owner'
  );

CREATE POLICY "Owner can update org members"
  ON organization_members FOR UPDATE
  USING (
    is_org_member(organization_id) AND
    get_org_role(organization_id) = 'owner'
  );

-- ACCOUNTS — members can read, owner can manage
-- ------------------------------------------------------------
CREATE POLICY "Members can view accounts"
  ON accounts FOR SELECT
  USING (is_org_member(organization_id));

CREATE POLICY "Owner can insert accounts"
  ON accounts FOR INSERT
  WITH CHECK (
    is_org_member(organization_id) AND
    get_org_role(organization_id) = 'owner'
  );

CREATE POLICY "Owner can update accounts"
  ON accounts FOR UPDATE
  USING (
    is_org_member(organization_id) AND
    get_org_role(organization_id) = 'owner'
  );

CREATE POLICY "Owner can delete accounts"
  ON accounts FOR DELETE
  USING (
    is_org_member(organization_id) AND
    get_org_role(organization_id) = 'owner' AND
    NOT is_system AND NOT is_locked
  );

-- ACCOUNT MAPPINGS — owner only
-- ------------------------------------------------------------
CREATE POLICY "Members can view account mappings"
  ON account_mappings FOR SELECT
  USING (is_org_member(organization_id));

CREATE POLICY "Owner can manage account mappings"
  ON account_mappings FOR ALL
  USING (
    is_org_member(organization_id) AND
    get_org_role(organization_id) = 'owner'
  );

-- PARTIES — members can read, owner can manage
-- ------------------------------------------------------------
CREATE POLICY "Members can view parties"
  ON parties FOR SELECT
  USING (is_org_member(organization_id));

CREATE POLICY "Owner can insert parties"
  ON parties FOR INSERT
  WITH CHECK (is_org_member(organization_id));

CREATE POLICY "Owner can update parties"
  ON parties FOR UPDATE
  USING (is_org_member(organization_id));

CREATE POLICY "Owner can delete parties"
  ON parties FOR DELETE
  USING (
    is_org_member(organization_id) AND
    get_org_role(organization_id) = 'owner'
  );

-- TRANSACTIONS — members can read, insert; owner can void
-- ------------------------------------------------------------
CREATE POLICY "Members can view transactions"
  ON transactions FOR SELECT
  USING (is_org_member(organization_id));

CREATE POLICY "Members can insert transactions"
  ON transactions FOR INSERT
  WITH CHECK (
    is_org_member(organization_id) AND
    created_by = auth.uid()
  );

CREATE POLICY "Owner can update transactions"
  ON transactions FOR UPDATE
  USING (
    is_org_member(organization_id) AND
    get_org_role(organization_id) = 'owner'
  );

-- JOURNAL ENTRIES — read only for members, no direct insert/update from frontend
-- ------------------------------------------------------------
CREATE POLICY "Members can view journal entries"
  ON journal_entries FOR SELECT
  USING (is_org_member(organization_id));

-- JOURNAL LINES — read only for members, no direct insert/update from frontend
-- ------------------------------------------------------------
CREATE POLICY "Members can view journal lines"
  ON journal_lines FOR SELECT
  USING (is_org_member(organization_id));

-- ATTACHMENTS — members can read, owner can manage
-- ------------------------------------------------------------
CREATE POLICY "Members can view attachments"
  ON attachments FOR SELECT
  USING (is_org_member(organization_id));

CREATE POLICY "Members can insert attachments"
  ON attachments FOR INSERT
  WITH CHECK (
    is_org_member(organization_id) AND
    uploaded_by = auth.uid()
  );

CREATE POLICY "Members can delete attachments"
  ON attachments FOR DELETE
  USING (
    is_org_member(organization_id) AND
    (uploaded_by = auth.uid() OR get_org_role(organization_id) = 'owner')
  );

-- AUDIT LOGS — read only for owner, no direct insert/update/delete
-- ------------------------------------------------------------
CREATE POLICY "Owner can view audit logs"
  ON audit_logs FOR SELECT
  USING (
    is_org_member(organization_id) AND
    get_org_role(organization_id) = 'owner'
  );
