-- Org/Workspace Tenancy — Phase 1: Foundation tables
-- Adds multi-tenant organization support to SignalStack.
-- Existing user_id scoping remains — org_id is additive, not replacing.
-- Data migration (adding org_id to existing tables) happens in Phase 2.

/* ------------------------------------------------------------------ */
/*  Organizations                                                      */
/* ------------------------------------------------------------------ */

CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  owner_id UUID REFERENCES auth.users NOT NULL,
  logo_url TEXT,
  plan TEXT DEFAULT 'starter',
  max_members INT DEFAULT 5,
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE organizations IS 'Multi-tenant organizations. Each org can have multiple members and projects.';
COMMENT ON COLUMN organizations.slug IS 'URL-safe unique identifier (e.g., "pot-labs", "acme-brands")';
COMMENT ON COLUMN organizations.plan IS 'Subscription tier: starter, professional, enterprise';
COMMENT ON COLUMN organizations.settings IS 'Org-level preferences (currency, default retailer list, etc.)';

CREATE INDEX IF NOT EXISTS idx_organizations_owner ON organizations(owner_id);
CREATE INDEX IF NOT EXISTS idx_organizations_slug ON organizations(slug);

/* ------------------------------------------------------------------ */
/*  Organization Members                                                */
/* ------------------------------------------------------------------ */

-- Roles within an organization
CREATE TYPE org_role AS ENUM ('owner', 'admin', 'analyst', 'viewer');

CREATE TABLE IF NOT EXISTS org_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users NOT NULL,
  role org_role NOT NULL DEFAULT 'viewer',
  invited_by UUID REFERENCES auth.users,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(org_id, user_id)
);

COMMENT ON TABLE org_members IS 'Tracks which users belong to which organizations and their role.';

CREATE INDEX IF NOT EXISTS idx_org_members_org ON org_members(org_id);
CREATE INDEX IF NOT EXISTS idx_org_members_user ON org_members(user_id);
CREATE INDEX IF NOT EXISTS idx_org_members_role ON org_members(role);

/* ------------------------------------------------------------------ */
/*  Organization Invitations                                            */
/* ------------------------------------------------------------------ */

CREATE TABLE IF NOT EXISTS org_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  email TEXT NOT NULL,
  role org_role NOT NULL DEFAULT 'viewer',
  token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  invited_by UUID REFERENCES auth.users NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days'),
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE org_invitations IS 'Pending invitations to join an organization. Token-based acceptance.';

CREATE INDEX IF NOT EXISTS idx_org_invitations_org ON org_invitations(org_id);
CREATE INDEX IF NOT EXISTS idx_org_invitations_email ON org_invitations(email);
CREATE INDEX IF NOT EXISTS idx_org_invitations_token ON org_invitations(token);

/* ------------------------------------------------------------------ */
/*  RLS Policies                                                        */
/* ------------------------------------------------------------------ */

-- Organizations: members can view, only owner/admin can modify
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view their organization"
  ON organizations FOR SELECT
  USING (
    id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid())
    OR owner_id = auth.uid()
  );

CREATE POLICY "Org owner can update their organization"
  ON organizations FOR UPDATE
  USING (owner_id = auth.uid());

CREATE POLICY "Authenticated users can create organizations"
  ON organizations FOR INSERT
  WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Org owner can delete their organization"
  ON organizations FOR DELETE
  USING (owner_id = auth.uid());

-- Org Members: members can view co-members, admin+ can manage
ALTER TABLE org_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view org members"
  ON org_members FOR SELECT
  USING (
    org_id IN (SELECT org_id FROM org_members AS om WHERE om.user_id = auth.uid())
  );

CREATE POLICY "Org admin can insert members"
  ON org_members FOR INSERT
  WITH CHECK (
    org_id IN (
      SELECT org_id FROM org_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
    OR
    -- Allow self-insert when accepting an invitation
    user_id = auth.uid()
  );

CREATE POLICY "Org admin can update member roles"
  ON org_members FOR UPDATE
  USING (
    org_id IN (
      SELECT org_id FROM org_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

CREATE POLICY "Org admin can remove members"
  ON org_members FOR DELETE
  USING (
    org_id IN (
      SELECT org_id FROM org_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
    OR user_id = auth.uid() -- members can leave
  );

-- Org Invitations: admin+ can manage, invitees can view their own
ALTER TABLE org_invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org admin can manage invitations"
  ON org_invitations FOR ALL
  USING (
    org_id IN (
      SELECT org_id FROM org_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

CREATE POLICY "Invitees can view their pending invitations"
  ON org_invitations FOR SELECT
  USING (
    email IN (
      SELECT email FROM auth.users WHERE id = auth.uid()
    )
  );

/* ------------------------------------------------------------------ */
/*  Helper function: check org membership                               */
/* ------------------------------------------------------------------ */

CREATE OR REPLACE FUNCTION is_org_member(_org_id UUID, _user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM org_members
    WHERE org_id = _org_id AND user_id = _user_id
  );
$$;

CREATE OR REPLACE FUNCTION get_org_role(_org_id UUID, _user_id UUID)
RETURNS org_role
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT role FROM org_members
  WHERE org_id = _org_id AND user_id = _user_id
  LIMIT 1;
$$;

/* ------------------------------------------------------------------ */
/*  Auto-create org membership when org is created                      */
/* ------------------------------------------------------------------ */

CREATE OR REPLACE FUNCTION handle_new_org()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO org_members (org_id, user_id, role)
  VALUES (NEW.id, NEW.owner_id, 'owner');
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_org_created
  AFTER INSERT ON organizations
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_org();
