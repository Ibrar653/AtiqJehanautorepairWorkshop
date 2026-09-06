-- ==============================================================================
-- Migration 032: Foundational Workspaces, Membership & Role Governance Schema
-- ==============================================================================
-- 1. UUID Primary Keys throughout all workspace entities.
-- 2. No hardcoded emails: Authorization uses public.platform_admins & auth.uid().
-- 3. Discrete RLS policies: SELECT separate from INSERT/UPDATE/DELETE.
-- 4. In-app approval lifecycle: 'pending' -> 'active' | 'rejected' | 'suspended'.
-- 5. Strict isolation: Normal users cannot self-promote or activate memberships.
-- 6. user_permissions constraint: UNIQUE (workspace_id, user_id, module).
-- 7. Audit log security: performed_by and target_user use auth.users UUIDs.
-- 8. Zero business tables touched (customers, invoices, etc. remain untouched).
-- ==============================================================================

-- 1. Required Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Create public.platform_admins Table
CREATE TABLE IF NOT EXISTS public.platform_admins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'platform_owner',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_platform_admins_user_id ON public.platform_admins(user_id);
CREATE INDEX IF NOT EXISTS idx_platform_admins_status ON public.platform_admins(status);

-- Helper Function: Check if current user is active Platform Admin
CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.platform_admins
    WHERE user_id = auth.uid()
      AND status = 'active'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- 3. One-Time Bootstrap: Register Primary Owner in platform_admins
DO $$
DECLARE
  v_primary_auth_id UUID;
BEGIN
  SELECT id INTO v_primary_auth_id
  FROM auth.users
  WHERE email = 'atiqjehandaraz@gmail.com'
  LIMIT 1;

  IF v_primary_auth_id IS NOT NULL THEN
    INSERT INTO public.platform_admins (user_id, role, status)
    VALUES (v_primary_auth_id, 'platform_owner', 'active')
    ON CONFLICT (user_id) DO UPDATE
      SET role = 'platform_owner', status = 'active';
  END IF;
END $$;

-- 4. Create public.workspaces Table (UUID)
CREATE TABLE IF NOT EXISTS public.workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  workspace_code TEXT UNIQUE NOT NULL,
  business_name TEXT NULL,
  owner_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'suspended', 'rejected', 'archived')),
  is_primary BOOLEAN NOT NULL DEFAULT false,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ NULL,
  rejection_reason TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workspaces_status ON public.workspaces(status);
CREATE INDEX IF NOT EXISTS idx_workspaces_workspace_code ON public.workspaces(workspace_code);
CREATE INDEX IF NOT EXISTS idx_workspaces_owner_user_id ON public.workspaces(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_workspaces_is_primary ON public.workspaces(is_primary);

-- 5. Create public.workspace_members Table (UUID)
CREATE TABLE IF NOT EXISTS public.workspace_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'owner',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'suspended', 'rejected', 'removed')),
  is_workspace_owner BOOLEAN NOT NULL DEFAULT false,
  joined_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  removed_at TIMESTAMPTZ NULL,
  removed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT uq_workspace_members_ws_user UNIQUE (workspace_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_workspace_members_ws_user ON public.workspace_members(workspace_id, user_id);
CREATE INDEX IF NOT EXISTS idx_workspace_members_user_id ON public.workspace_members(user_id);
CREATE INDEX IF NOT EXISTS idx_workspace_members_status ON public.workspace_members(status);

-- 6. Create public.user_permissions Table (Scoped to workspace_id)
CREATE TABLE IF NOT EXISTS public.user_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  module TEXT NOT NULL,
  access BOOLEAN NOT NULL DEFAULT true,
  can_view BOOLEAN NOT NULL DEFAULT true,
  can_create BOOLEAN NOT NULL DEFAULT false,
  can_edit BOOLEAN NOT NULL DEFAULT false,
  can_delete BOOLEAN NOT NULL DEFAULT false,
  can_print BOOLEAN NOT NULL DEFAULT false,
  can_export BOOLEAN NOT NULL DEFAULT false,
  can_approve BOOLEAN NOT NULL DEFAULT false,
  can_transfer_money BOOLEAN NOT NULL DEFAULT false,
  can_manual_journal BOOLEAN NOT NULL DEFAULT false,
  can_reverse_transaction BOOLEAN NOT NULL DEFAULT false,
  can_permanent_delete BOOLEAN NOT NULL DEFAULT false,
  can_view_bank_balance BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_user_permissions_ws_user_module UNIQUE (workspace_id, user_id, module)
);

CREATE INDEX IF NOT EXISTS idx_user_permissions_ws_user ON public.user_permissions(workspace_id, user_id);
CREATE INDEX IF NOT EXISTS idx_user_permissions_module ON public.user_permissions(module);

-- 7. Create public.workspace_audit_logs Table (UUID)
CREATE TABLE IF NOT EXISTS public.workspace_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  performed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  target_user UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  details JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workspace_audit_logs_ws_id ON public.workspace_audit_logs(workspace_id);
CREATE INDEX IF NOT EXISTS idx_workspace_audit_logs_created_at ON public.workspace_audit_logs(created_at DESC);

-- 8. Seed Primary Workspace (ATIQ JEHAN AUTO REPAIR) with verified essential fields only
DO $$
DECLARE
  v_owner_auth_id UUID;
  v_primary_ws_id UUID;
BEGIN
  SELECT id INTO v_owner_auth_id
  FROM auth.users
  WHERE email = 'atiqjehandaraz@gmail.com'
  LIMIT 1;

  INSERT INTO public.workspaces (
    name,
    workspace_code,
    status,
    is_primary,
    owner_user_id
  ) VALUES (
    'ATIQ JEHAN AUTO REPAIR',
    'ATIQ01',
    'active',
    true,
    v_owner_auth_id
  )
  ON CONFLICT (workspace_code) DO UPDATE
    SET is_primary = true,
        status = 'active',
        owner_user_id = COALESCE(public.workspaces.owner_user_id, EXCLUDED.owner_user_id),
        updated_at = now()
  RETURNING id INTO v_primary_ws_id;

  IF v_owner_auth_id IS NOT NULL AND v_primary_ws_id IS NOT NULL THEN
    INSERT INTO public.workspace_members (
      workspace_id,
      user_id,
      role,
      status,
      is_workspace_owner,
      joined_at
    ) VALUES (
      v_primary_ws_id,
      v_owner_auth_id,
      'owner',
      'active',
      true,
      now()
    )
    ON CONFLICT (workspace_id, user_id) DO UPDATE
      SET role = 'owner',
          status = 'active',
          is_workspace_owner = true,
          updated_at = now();
  END IF;
END $$;

-- 9. Row Level Security Policies

-- ─── A. Platform Admins RLS ──────────────────────────────────────────────────
ALTER TABLE public.platform_admins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "platform_admins_select_policy" ON public.platform_admins;
CREATE POLICY "platform_admins_select_policy" ON public.platform_admins
  FOR SELECT
  USING (
    user_id = auth.uid()
    OR public.is_platform_admin()
  );

DROP POLICY IF EXISTS "platform_admins_mutation_policy" ON public.platform_admins;
CREATE POLICY "platform_admins_mutation_policy" ON public.platform_admins
  FOR ALL
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

-- ─── B. Workspaces RLS ────────────────────────────────────────────────────────
ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "workspaces_select_policy" ON public.workspaces;
CREATE POLICY "workspaces_select_policy" ON public.workspaces
  FOR SELECT
  USING (
    public.is_platform_admin()
    OR id IN (
      SELECT wm.workspace_id
      FROM public.workspace_members wm
      WHERE wm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "workspaces_insert_policy" ON public.workspaces;
CREATE POLICY "workspaces_insert_policy" ON public.workspaces
  FOR INSERT
  WITH CHECK (public.is_platform_admin());

DROP POLICY IF EXISTS "workspaces_update_policy" ON public.workspaces;
CREATE POLICY "workspaces_update_policy" ON public.workspaces
  FOR UPDATE
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

DROP POLICY IF EXISTS "workspaces_delete_policy" ON public.workspaces;
CREATE POLICY "workspaces_delete_policy" ON public.workspaces
  FOR DELETE
  USING (public.is_platform_admin());

-- ─── C. Workspace Members RLS ─────────────────────────────────────────────────
ALTER TABLE public.workspace_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "workspace_members_select_policy" ON public.workspace_members;
CREATE POLICY "workspace_members_select_policy" ON public.workspace_members
  FOR SELECT
  USING (
    public.is_platform_admin()
    OR user_id = auth.uid()
    OR workspace_id IN (
      SELECT wm.workspace_id
      FROM public.workspace_members wm
      WHERE wm.user_id = auth.uid()
        AND wm.is_workspace_owner = true
        AND wm.status = 'active'
    )
  );

DROP POLICY IF EXISTS "workspace_members_insert_policy" ON public.workspace_members;
CREATE POLICY "workspace_members_insert_policy" ON public.workspace_members
  FOR INSERT
  WITH CHECK (public.is_platform_admin());

DROP POLICY IF EXISTS "workspace_members_update_policy" ON public.workspace_members;
CREATE POLICY "workspace_members_update_policy" ON public.workspace_members
  FOR UPDATE
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

DROP POLICY IF EXISTS "workspace_members_delete_policy" ON public.workspace_members;
CREATE POLICY "workspace_members_delete_policy" ON public.workspace_members
  FOR DELETE
  USING (public.is_platform_admin());

-- ─── D. User Permissions RLS ──────────────────────────────────────────────────
ALTER TABLE public.user_permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_permissions_select_policy" ON public.user_permissions;
CREATE POLICY "user_permissions_select_policy" ON public.user_permissions
  FOR SELECT
  USING (
    public.is_platform_admin()
    OR user_id = auth.uid()
    OR workspace_id IN (
      SELECT wm.workspace_id
      FROM public.workspace_members wm
      WHERE wm.user_id = auth.uid()
        AND wm.is_workspace_owner = true
        AND wm.status = 'active'
    )
  );

DROP POLICY IF EXISTS "user_permissions_mutation_policy" ON public.user_permissions;
CREATE POLICY "user_permissions_mutation_policy" ON public.user_permissions
  FOR ALL
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

-- ─── E. Workspace Audit Logs RLS ──────────────────────────────────────────────
ALTER TABLE public.workspace_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "workspace_audit_logs_select_policy" ON public.workspace_audit_logs;
CREATE POLICY "workspace_audit_logs_select_policy" ON public.workspace_audit_logs
  FOR SELECT
  USING (
    public.is_platform_admin()
    OR workspace_id IN (
      SELECT wm.workspace_id
      FROM public.workspace_members wm
      WHERE wm.user_id = auth.uid()
        AND wm.is_workspace_owner = true
        AND wm.status = 'active'
    )
  );

DROP POLICY IF EXISTS "workspace_audit_logs_insert_policy" ON public.workspace_audit_logs;
CREATE POLICY "workspace_audit_logs_insert_policy" ON public.workspace_audit_logs
  FOR INSERT
  WITH CHECK (public.is_platform_admin());
