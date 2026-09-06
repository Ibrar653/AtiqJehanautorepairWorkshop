-- ==============================================================================
-- Migration 031: Production Workspaces & Multi-Tenant Approval Schema
-- ==============================================================================
-- Architecture:
-- 1. UUID Primary Keys throughout public.workspaces and public.workspace_members.
-- 2. Foreign keys linked directly to Supabase Auth (auth.users.id).
-- 3. In-app approval lifecycle: 'pending' -> 'active' | 'rejected' | 'suspended' | 'archived'.
-- 4. Safe & non-destructive: Does NOT touch business data (customers, invoices, etc.).
-- 5. Row Level Security policies using auth.uid() and Primary Owner privileges.
-- ==============================================================================

-- 1. Ensure required extensions exist
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Create public.workspaces Table (UUID Primary Key)
CREATE TABLE IF NOT EXISTS public.workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  workspace_code TEXT UNIQUE NOT NULL,
  code TEXT UNIQUE,
  business_name TEXT NOT NULL DEFAULT '',
  owner_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  owner_name TEXT NULL,
  owner_email TEXT NULL,
  phone TEXT NULL,
  email TEXT NULL,
  address TEXT NULL,
  country TEXT NOT NULL DEFAULT 'United Arab Emirates',
  currency TEXT NOT NULL DEFAULT 'AED',
  trn TEXT NULL,
  logo_url TEXT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'suspended', 'rejected', 'archived')),
  is_primary BOOLEAN NOT NULL DEFAULT false,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ NULL,
  rejection_reason TEXT NULL,
  users_count INTEGER NOT NULL DEFAULT 1,
  last_activity TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Trigger to keep code and workspace_code in sync
CREATE OR REPLACE FUNCTION public.sync_workspace_codes()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.workspace_code IS NULL AND NEW.code IS NOT NULL THEN
    NEW.workspace_code := UPPER(TRIM(NEW.code));
  ELSIF NEW.code IS NULL AND NEW.workspace_code IS NOT NULL THEN
    NEW.code := UPPER(TRIM(NEW.workspace_code));
  ELSIF NEW.workspace_code IS NOT NULL THEN
    NEW.workspace_code := UPPER(TRIM(NEW.workspace_code));
    NEW.code := NEW.workspace_code;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_workspace_codes ON public.workspaces;
CREATE TRIGGER trg_sync_workspace_codes
  BEFORE INSERT OR UPDATE ON public.workspaces
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_workspace_codes();

-- Performance Indexes on workspaces
CREATE INDEX IF NOT EXISTS idx_workspaces_status ON public.workspaces(status);
CREATE INDEX IF NOT EXISTS idx_workspaces_workspace_code ON public.workspaces(workspace_code);
CREATE INDEX IF NOT EXISTS idx_workspaces_code ON public.workspaces(code);
CREATE INDEX IF NOT EXISTS idx_workspaces_owner_user_id ON public.workspaces(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_workspaces_is_primary ON public.workspaces(is_primary);

-- 3. Create public.workspace_members Table (UUID Foreign Keys)
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

-- Performance Indexes on workspace_members
CREATE INDEX IF NOT EXISTS idx_workspace_members_ws_user ON public.workspace_members(workspace_id, user_id);
CREATE INDEX IF NOT EXISTS idx_workspace_members_user ON public.workspace_members(user_id);
CREATE INDEX IF NOT EXISTS idx_workspace_members_status ON public.workspace_members(status);

-- 4. Create public.workspace_audit_logs Table (UUID)
CREATE TABLE IF NOT EXISTS public.workspace_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  performed_by TEXT NOT NULL,
  target_user TEXT NULL,
  details JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workspace_audit_logs_ws_id ON public.workspace_audit_logs(workspace_id);
CREATE INDEX IF NOT EXISTS idx_workspace_audit_logs_created_at ON public.workspace_audit_logs(created_at DESC);

-- 5. Create public.user_permissions Table (UUID)
CREATE TABLE IF NOT EXISTS public.user_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id UUID NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
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
  CONSTRAINT uq_user_permissions_user_module UNIQUE (user_id, module)
);

CREATE INDEX IF NOT EXISTS idx_user_permissions_user ON public.user_permissions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_permissions_module ON public.user_permissions(module);

-- 6. Seed Primary Workspace (ATIQ JEHAN AUTO REPAIR) with is_primary = true, status = 'active'
DO $$
DECLARE
  v_owner_auth_id UUID;
  v_workspace_id UUID;
BEGIN
  -- Look up existing Supabase Auth UUID for primary owner if present
  SELECT id INTO v_owner_auth_id FROM auth.users WHERE email = 'atiqjehandaraz@gmail.com' LIMIT 1;

  -- Insert or update primary workspace
  INSERT INTO public.workspaces (
    name,
    workspace_code,
    code,
    business_name,
    owner_user_id,
    owner_name,
    owner_email,
    phone,
    email,
    address,
    country,
    currency,
    trn,
    status,
    is_primary,
    created_at,
    updated_at
  ) VALUES (
    'ATIQ JEHAN AUTO REPAIR',
    'ATIQ01',
    'ATIQ01',
    'ATIQ JEHAN AUTO REPAIR & USED SPARE PARTS L.L.C.',
    v_owner_auth_id,
    'Atiq Jehan',
    'atiqjehandaraz@gmail.com',
    '+971 52 123 4567',
    'atiqjehandaraz@gmail.com',
    'Industrial Area 4, Sharjah, United Arab Emirates',
    'United Arab Emirates',
    'AED',
    '100482910400003',
    'active',
    true,
    NOW(),
    NOW()
  )
  ON CONFLICT (workspace_code) DO UPDATE SET
    name = EXCLUDED.name,
    business_name = EXCLUDED.business_name,
    is_primary = true,
    status = 'active',
    owner_user_id = COALESCE(public.workspaces.owner_user_id, EXCLUDED.owner_user_id),
    updated_at = NOW()
  RETURNING id INTO v_workspace_id;

  -- If auth user exists, link as primary workspace owner
  IF v_owner_auth_id IS NOT NULL AND v_workspace_id IS NOT NULL THEN
    INSERT INTO public.workspace_members (
      workspace_id,
      user_id,
      role,
      status,
      is_workspace_owner,
      joined_at,
      created_at,
      updated_at
    ) VALUES (
      v_workspace_id,
      v_owner_auth_id,
      'owner',
      'active',
      true,
      NOW(),
      NOW(),
      NOW()
    )
    ON CONFLICT (workspace_id, user_id) DO UPDATE SET
      role = 'owner',
      status = 'active',
      is_workspace_owner = true,
      updated_at = NOW();
  END IF;
END $$;

-- 7. Row Level Security Helper Function (Uses auth.uid() UUID)
CREATE OR REPLACE FUNCTION public.get_auth_user_workspaces()
RETURNS TABLE (allowed_workspace_id UUID) AS $$
BEGIN
  -- Primary platform owner (atiqjehandaraz@gmail.com) sees all active & pending workspaces for approval
  IF (auth.jwt() ->> 'email') = 'atiqjehandaraz@gmail.com' THEN
    RETURN QUERY 
    SELECT id FROM public.workspaces 
    WHERE status != 'archived';
  ELSE
    -- Other users only see workspaces where their membership is active and workspace is active
    RETURN QUERY 
    SELECT wm.workspace_id 
    FROM public.workspace_members wm
    JOIN public.workspaces w ON w.id = wm.workspace_id
    WHERE wm.user_id = auth.uid()
      AND wm.status = 'active'
      AND w.status = 'active';
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8. Row Level Security Policies on Workspaces
ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "workspaces_access_policy" ON public.workspaces;
CREATE POLICY "workspaces_access_policy" ON public.workspaces
  FOR ALL
  USING (
    (auth.jwt() ->> 'email') = 'atiqjehandaraz@gmail.com'
    OR id IN (SELECT allowed_workspace_id FROM public.get_auth_user_workspaces())
  )
  WITH CHECK (
    (auth.jwt() ->> 'email') = 'atiqjehandaraz@gmail.com'
    OR id IN (SELECT allowed_workspace_id FROM public.get_auth_user_workspaces())
  );

-- 9. Row Level Security Policies on Workspace Members
ALTER TABLE public.workspace_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "workspace_members_access_policy" ON public.workspace_members;
CREATE POLICY "workspace_members_access_policy" ON public.workspace_members
  FOR ALL
  USING (
    (auth.jwt() ->> 'email') = 'atiqjehandaraz@gmail.com'
    OR user_id = auth.uid()
    OR workspace_id IN (SELECT allowed_workspace_id FROM public.get_auth_user_workspaces())
  )
  WITH CHECK (
    (auth.jwt() ->> 'email') = 'atiqjehandaraz@gmail.com'
    OR workspace_id IN (
      SELECT wm.workspace_id FROM public.workspace_members wm
      WHERE wm.user_id = auth.uid()
        AND wm.is_workspace_owner = true
        AND wm.status = 'active'
    )
  );

-- 10. Row Level Security Policies on User Permissions
ALTER TABLE public.user_permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_permissions_access_policy" ON public.user_permissions;
CREATE POLICY "user_permissions_access_policy" ON public.user_permissions
  FOR ALL
  USING (
    (auth.jwt() ->> 'email') = 'atiqjehandaraz@gmail.com'
    OR user_id = auth.uid()
  )
  WITH CHECK (
    (auth.jwt() ->> 'email') = 'atiqjehandaraz@gmail.com'
  );
