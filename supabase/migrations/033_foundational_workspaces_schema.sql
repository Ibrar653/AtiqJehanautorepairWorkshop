-- ==============================================================================
-- Migration 033: Foundational Workspaces, Membership & Security Definer Schema
-- ==============================================================================
-- 1. UUID Primary Keys throughout all workspace entities.
-- 2. No hardcoded emails: Authorization uses public.platform_admins & auth.uid().
-- 3. Security Definer Helper Functions:
--      - public.is_platform_admin()
--      - public.has_workspace_membership(p_workspace_id UUID)
--      - public.is_active_workspace_member(p_workspace_id UUID)
--      - public.is_active_workspace_owner(p_workspace_id UUID)
--    All set search_path = public, pg_temp to prevent search-path injection.
-- 4. Complete elimination of RLS recursion: workspace_members policies never
--    perform raw subqueries against public.workspace_members.
-- 5. Strict lifecycle approval: 'pending' -> 'active' | 'rejected' | 'suspended'.
-- 6. user_permissions constraint: UNIQUE (workspace_id, user_id, module).
-- 7. Audit log security: performed_by and target_user use auth.users UUIDs.
-- 8. Safe Bootstrap: Verifies Primary Auth User exists; aborts if missing.
-- 9. Automatic updated_at triggers on mutable tables.
-- 10. Zero business tables touched (customers, invoices, etc. remain untouched).
-- ==============================================================================

-- 1. Required Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Automatic updated_at Trigger Function
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- 3. Create public.platform_admins Table
CREATE TABLE IF NOT EXISTS public.platform_admins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'platform_owner',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_platform_admins_user_id ON public.platform_admins(user_id);
CREATE INDEX IF NOT EXISTS idx_platform_admins_status ON public.platform_admins(status);

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

DROP TRIGGER IF EXISTS trg_workspaces_updated_at ON public.workspaces;
CREATE TRIGGER trg_workspaces_updated_at
  BEFORE UPDATE ON public.workspaces
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

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

DROP TRIGGER IF EXISTS trg_workspace_members_updated_at ON public.workspace_members;
CREATE TRIGGER trg_workspace_members_updated_at
  BEFORE UPDATE ON public.workspace_members
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

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

DROP TRIGGER IF EXISTS trg_user_permissions_updated_at ON public.user_permissions;
CREATE TRIGGER trg_user_permissions_updated_at
  BEFORE UPDATE ON public.user_permissions
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

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

-- ==============================================================================
-- 8. Safe SECURITY DEFINER Helper Functions (Zero RLS Recursion)
-- ==============================================================================

-- Helper 8.1: Check if current user is an active platform admin
CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN FALSE;
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.platform_admins
    WHERE user_id = auth.uid()
      AND status = 'active'
  );
END;
$$;

-- Helper 8.2: Check if current user has ANY membership (pending or active) in workspace
CREATE OR REPLACE FUNCTION public.has_workspace_membership(p_workspace_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL OR p_workspace_id IS NULL THEN
    RETURN FALSE;
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = p_workspace_id
      AND user_id = auth.uid()
  );
END;
$$;

-- Helper 8.3: Check if current user is an active member in workspace
CREATE OR REPLACE FUNCTION public.is_active_workspace_member(p_workspace_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL OR p_workspace_id IS NULL THEN
    RETURN FALSE;
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = p_workspace_id
      AND user_id = auth.uid()
      AND status = 'active'
  );
END;
$$;

-- Helper 8.4: Check if current user is an active workspace owner in workspace
CREATE OR REPLACE FUNCTION public.is_active_workspace_owner(p_workspace_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL OR p_workspace_id IS NULL THEN
    RETURN FALSE;
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = p_workspace_id
      AND user_id = auth.uid()
      AND status = 'active'
      AND is_workspace_owner = true
  );
END;
$$;

-- ==============================================================================
-- 9. Safe Bootstrap of Primary Platform Owner and Primary Workspace
-- ==============================================================================
DO $$
DECLARE
  v_primary_auth_id UUID;
  v_primary_ws_id UUID;
BEGIN
  -- 1. Discover Primary Owner UUID from auth.users
  SELECT id INTO v_primary_auth_id
  FROM auth.users
  WHERE email = 'atiqjehandaraz@gmail.com'
  LIMIT 1;

  -- 2. Abort immediately if the primary auth account does not exist
  IF v_primary_auth_id IS NULL THEN
    RAISE EXCEPTION 'Primary owner Supabase Auth user (atiqjehandaraz@gmail.com) not found. Create/login the owner account before running workspace migration.';
  END IF;

  -- 3. Register Primary Owner in platform_admins
  INSERT INTO public.platform_admins (user_id, role, status)
  VALUES (v_primary_auth_id, 'platform_owner', 'active')
  ON CONFLICT (user_id) DO UPDATE
    SET role = 'platform_owner', status = 'active';

  -- 4. Seed Primary Workspace with only verified essential fields
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
    v_primary_auth_id
  )
  ON CONFLICT (workspace_code) DO UPDATE
    SET is_primary = true,
        status = 'active',
        owner_user_id = COALESCE(public.workspaces.owner_user_id, EXCLUDED.owner_user_id),
        updated_at = now()
  RETURNING id INTO v_primary_ws_id;

  -- 5. Seed Primary Workspace Membership
  INSERT INTO public.workspace_members (
    workspace_id,
    user_id,
    role,
    status,
    is_workspace_owner,
    joined_at
  ) VALUES (
    v_primary_ws_id,
    v_primary_auth_id,
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
END $$;

-- ==============================================================================
-- 10. Non-Recursive Row Level Security Policies
-- ==============================================================================

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
    OR public.has_workspace_membership(id)
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

-- ─── C. Workspace Members RLS (Zero Self-Referencing Recursion) ────────────────
ALTER TABLE public.workspace_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "workspace_members_select_policy" ON public.workspace_members;
CREATE POLICY "workspace_members_select_policy" ON public.workspace_members
  FOR SELECT
  USING (
    public.is_platform_admin()
    OR user_id = auth.uid()
    OR public.is_active_workspace_owner(workspace_id)
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
    OR public.is_active_workspace_owner(workspace_id)
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
    OR public.is_active_workspace_owner(workspace_id)
  );

DROP POLICY IF EXISTS "workspace_audit_logs_insert_policy" ON public.workspace_audit_logs;
CREATE POLICY "workspace_audit_logs_insert_policy" ON public.workspace_audit_logs
  FOR INSERT
  WITH CHECK (public.is_platform_admin());
