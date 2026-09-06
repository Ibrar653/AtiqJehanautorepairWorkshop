-- ==============================================================================
-- Migration 030: Comprehensive Workspaces & Multi-Tenant Schema Fix
-- ==============================================================================
-- Ensures public.workspaces and public.workspace_members exist with all required
-- columns, indexes, foreign keys, and RLS policies for strict tenant isolation.
-- Safe & idempotent: Does NOT delete data, does NOT reset database.
-- ==============================================================================

-- 1. Enable Required Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Create or Extend public.workspaces Table
CREATE TABLE IF NOT EXISTS public.workspaces (
  id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
  name TEXT NOT NULL,
  code TEXT NULL,
  workspace_code TEXT NULL,
  business_name TEXT NOT NULL DEFAULT '',
  owner_user_id TEXT NULL,
  owner_name TEXT NULL,
  owner_email TEXT NULL,
  phone TEXT NULL,
  email TEXT NULL,
  address TEXT NULL,
  country TEXT NOT NULL DEFAULT 'United Arab Emirates',
  currency TEXT NOT NULL DEFAULT 'AED',
  trn TEXT NULL,
  logo_url TEXT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'archived')),
  is_primary BOOLEAN NOT NULL DEFAULT false,
  created_by TEXT NULL,
  users_count INTEGER NOT NULL DEFAULT 1,
  last_activity TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ensure all required columns exist if the table was previously created with fewer fields
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='workspaces' AND column_name='code') THEN
    ALTER TABLE public.workspaces ADD COLUMN code TEXT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='workspaces' AND column_name='workspace_code') THEN
    ALTER TABLE public.workspaces ADD COLUMN workspace_code TEXT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='workspaces' AND column_name='is_primary') THEN
    ALTER TABLE public.workspaces ADD COLUMN is_primary BOOLEAN NOT NULL DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='workspaces' AND column_name='created_by') THEN
    ALTER TABLE public.workspaces ADD COLUMN created_by TEXT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='workspaces' AND column_name='owner_name') THEN
    ALTER TABLE public.workspaces ADD COLUMN owner_name TEXT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='workspaces' AND column_name='owner_email') THEN
    ALTER TABLE public.workspaces ADD COLUMN owner_email TEXT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='workspaces' AND column_name='users_count') THEN
    ALTER TABLE public.workspaces ADD COLUMN users_count INTEGER NOT NULL DEFAULT 1;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='workspaces' AND column_name='last_activity') THEN
    ALTER TABLE public.workspaces ADD COLUMN last_activity TIMESTAMPTZ NULL;
  END IF;
END $$;

-- Trigger to keep code and workspace_code in sync
CREATE OR REPLACE FUNCTION public.sync_workspace_codes()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.workspace_code IS NULL AND NEW.code IS NOT NULL THEN
    NEW.workspace_code := NEW.code;
  ELSIF NEW.code IS NULL AND NEW.workspace_code IS NOT NULL THEN
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

-- Indexes on workspaces
CREATE INDEX IF NOT EXISTS idx_workspaces_status ON public.workspaces(status);
CREATE INDEX IF NOT EXISTS idx_workspaces_code ON public.workspaces(code);
CREATE INDEX IF NOT EXISTS idx_workspaces_workspace_code ON public.workspaces(workspace_code);
CREATE INDEX IF NOT EXISTS idx_workspaces_email ON public.workspaces(email);
CREATE INDEX IF NOT EXISTS idx_workspaces_is_primary ON public.workspaces(is_primary);

-- 3. Create or Extend public.workspace_members Table
CREATE TABLE IF NOT EXISTS public.workspace_members (
  id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
  workspace_id TEXT NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'owner',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'invited', 'pending', 'suspended', 'removed')),
  is_workspace_owner BOOLEAN NOT NULL DEFAULT false,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  removed_at TIMESTAMPTZ NULL,
  removed_by TEXT NULL
);

-- Ensure all columns exist in workspace_members
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='workspace_members' AND column_name='is_workspace_owner') THEN
    ALTER TABLE public.workspace_members ADD COLUMN is_workspace_owner BOOLEAN NOT NULL DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='workspace_members' AND column_name='created_at') THEN
    ALTER TABLE public.workspace_members ADD COLUMN created_at TIMESTAMPTZ NOT NULL DEFAULT now();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='workspace_members' AND column_name='updated_at') THEN
    ALTER TABLE public.workspace_members ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='workspace_members' AND column_name='removed_at') THEN
    ALTER TABLE public.workspace_members ADD COLUMN removed_at TIMESTAMPTZ NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='workspace_members' AND column_name='removed_by') THEN
    ALTER TABLE public.workspace_members ADD COLUMN removed_by TEXT NULL;
  END IF;
END $$;

-- Update status constraint to include 'removed' and 'pending'
DO $$
BEGIN
  ALTER TABLE public.workspace_members DROP CONSTRAINT IF EXISTS workspace_members_status_check;
  ALTER TABLE public.workspace_members ADD CONSTRAINT workspace_members_status_check 
    CHECK (status IN ('active', 'invited', 'pending', 'suspended', 'removed'));
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;

-- Unique constraint on (workspace_id, user_id)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_workspace_member'
  ) THEN
    ALTER TABLE public.workspace_members ADD CONSTRAINT uq_workspace_member UNIQUE (workspace_id, user_id);
  END IF;
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_workspace_members_ws_user ON public.workspace_members(workspace_id, user_id);
CREATE INDEX IF NOT EXISTS idx_workspace_members_user ON public.workspace_members(user_id);
CREATE INDEX IF NOT EXISTS idx_workspace_members_status ON public.workspace_members(status);

-- 4. Create Supporting Tables (Audit Logs, Permissions, Invitations)
CREATE TABLE IF NOT EXISTS public.workspace_audit_logs (
  id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
  workspace_id TEXT NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  performed_by TEXT NOT NULL,
  target_user TEXT NULL,
  details JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workspace_audit_logs_ws_id ON public.workspace_audit_logs(workspace_id);
CREATE INDEX IF NOT EXISTS idx_workspace_audit_logs_created_at ON public.workspace_audit_logs(created_at DESC);

CREATE TABLE IF NOT EXISTS public.user_permissions (
  id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
  user_id TEXT NOT NULL,
  workspace_id TEXT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
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
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_user_permissions_module') THEN
    ALTER TABLE public.user_permissions ADD CONSTRAINT uq_user_permissions_module UNIQUE (user_id, module);
  END IF;
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_user_permissions_user ON public.user_permissions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_permissions_module ON public.user_permissions(module);

CREATE TABLE IF NOT EXISTS public.workspace_invitations (
  id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
  workspace_id TEXT NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  invited_user_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'manager',
  token_hash TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  code_plain_preview TEXT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'accepted', 'failed', 'expired', 'revoked')),
  expires_at TIMESTAMPTZ NOT NULL,
  invited_by TEXT NOT NULL,
  permissions JSONB NULL,
  data_scope TEXT NULL DEFAULT 'all',
  financial_visibility JSONB NULL,
  approval_limits JSONB NULL,
  accepted_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_invitation_token_hash') THEN
    ALTER TABLE public.workspace_invitations ADD CONSTRAINT uq_invitation_token_hash UNIQUE (token_hash);
  END IF;
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_workspace_invitations_ws ON public.workspace_invitations(workspace_id);
CREATE INDEX IF NOT EXISTS idx_workspace_invitations_email ON public.workspace_invitations(email);

-- 5. Seed Primary Workspace: ATIQ JEHAN AUTO REPAIR
INSERT INTO public.workspaces (
  id,
  name,
  code,
  workspace_code,
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
  'ws-atiq-default-001',
  'ATIQ JEHAN AUTO REPAIR',
  'ATIQ01',
  'ATIQ01',
  'ATIQ JEHAN AUTO REPAIR & USED SPARE PARTS L.L.C.',
  'usr-owner-001',
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
  '2024-01-01T00:00:00Z',
  NOW()
) ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  business_name = EXCLUDED.business_name,
  trn = EXCLUDED.trn,
  is_primary = true,
  status = 'active',
  updated_at = NOW();

-- 6. Link Primary Owner to Primary Workspace
INSERT INTO public.workspace_members (
  id,
  workspace_id,
  user_id,
  role,
  status,
  is_workspace_owner,
  joined_at,
  created_at,
  updated_at
) VALUES (
  'wm-owner-001',
  'ws-atiq-default-001',
  'usr-owner-001',
  'owner',
  'active',
  true,
  '2024-01-01T00:00:00Z',
  '2024-01-01T00:00:00Z',
  NOW()
) ON CONFLICT (workspace_id, user_id) DO UPDATE SET
  role = 'owner',
  status = 'active',
  is_workspace_owner = true,
  updated_at = NOW();

INSERT INTO public.workspace_members (
  id,
  workspace_id,
  user_id,
  role,
  status,
  is_workspace_owner,
  joined_at,
  created_at,
  updated_at
) VALUES (
  'wm-owner-email-001',
  'ws-atiq-default-001',
  'atiqjehandaraz@gmail.com',
  'owner',
  'active',
  true,
  '2024-01-01T00:00:00Z',
  '2024-01-01T00:00:00Z',
  NOW()
) ON CONFLICT (workspace_id, user_id) DO UPDATE SET
  role = 'owner',
  status = 'active',
  is_workspace_owner = true,
  updated_at = NOW();

-- Also link existing users in public.users to the primary workspace
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='users') THEN
    INSERT INTO public.workspace_members (id, workspace_id, user_id, role, status, is_workspace_owner)
    SELECT 
      'wm-' || substr(md5(random()::text), 1, 12),
      'ws-atiq-default-001',
      id::text,
      COALESCE(role::text, 'manager'),
      'active',
      (email = 'atiqjehandaraz@gmail.com')
    FROM public.users
    ON CONFLICT (workspace_id, user_id) DO NOTHING;
  END IF;
END $$;

-- 7. Add workspace_id Column to All Business Tables If Not Present
DO $$
DECLARE
  tbl text;
  business_tables text[] := ARRAY[
    'customers',
    'vehicles',
    'services',
    'parts',
    'suppliers',
    'job_cards',
    'uploaded_job_cards',
    'invoices',
    'payments',
    'purchases',
    'expenses',
    'inventory_transactions',
    'ledger_accounts',
    'ledger_transactions',
    'workers',
    'bank_accounts',
    'settings'
  ];
BEGIN
  FOREACH tbl IN ARRAY business_tables LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=tbl) THEN
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=tbl AND column_name='workspace_id') THEN
        EXECUTE format('ALTER TABLE public.%I ADD COLUMN workspace_id TEXT REFERENCES public.workspaces(id);', tbl);
      END IF;
      -- Backfill existing rows with null workspace_id to default workspace
      EXECUTE format('UPDATE public.%I SET workspace_id = %L WHERE workspace_id IS NULL;', tbl, 'ws-atiq-default-001');
      -- Add index
      EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_workspace_id ON public.%I(workspace_id);', tbl, tbl);
    END IF;
  END LOOP;
END $$;

-- 8. Row Level Security Helper Function
CREATE OR REPLACE FUNCTION public.get_auth_user_workspaces()
RETURNS TABLE (allowed_workspace_id TEXT) AS $$
BEGIN
  -- Primary platform owner (atiqjehandaraz@gmail.com) sees all active/unarchived workspaces
  IF (auth.jwt() ->> 'email') = 'atiqjehandaraz@gmail.com' THEN
    RETURN QUERY 
    SELECT id FROM public.workspaces 
    WHERE status != 'archived';
  ELSE
    -- Other users only see workspaces where their membership is ACTIVE and workspace is ACTIVE
    RETURN QUERY 
    SELECT wm.workspace_id 
    FROM public.workspace_members wm
    JOIN public.workspaces w ON w.id = wm.workspace_id
    WHERE (
      wm.user_id = auth.uid()::text 
      OR wm.user_id = (auth.jwt() ->> 'email')
    )
    AND wm.status = 'active'
    AND w.status = 'active';
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 9. Row Level Security Policies

-- Workspaces RLS
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

-- Workspace Members RLS
ALTER TABLE public.workspace_members ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "workspace_members_access_policy" ON public.workspace_members;
CREATE POLICY "workspace_members_access_policy" ON public.workspace_members
  FOR ALL
  USING (
    (auth.jwt() ->> 'email') = 'atiqjehandaraz@gmail.com'
    OR user_id = auth.uid()::text
    OR user_id = (auth.jwt() ->> 'email')
    OR workspace_id IN (SELECT allowed_workspace_id FROM public.get_auth_user_workspaces())
  )
  WITH CHECK (
    (auth.jwt() ->> 'email') = 'atiqjehandaraz@gmail.com'
    OR workspace_id IN (
      SELECT wm.workspace_id FROM public.workspace_members wm
      WHERE (wm.user_id = auth.uid()::text OR wm.user_id = (auth.jwt() ->> 'email'))
        AND wm.is_workspace_owner = true
        AND wm.status = 'active'
    )
  );

-- Business Tables Isolation Policies
DO $$
DECLARE
  tbl text;
  business_tables text[] := ARRAY[
    'customers',
    'vehicles',
    'services',
    'parts',
    'suppliers',
    'job_cards',
    'invoices',
    'payments',
    'purchases',
    'expenses',
    'inventory_transactions'
  ];
BEGIN
  FOREACH tbl IN ARRAY business_tables LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=tbl) THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', tbl);
      EXECUTE format('DROP POLICY IF EXISTS %I_workspace_isolation ON public.%I;', tbl, tbl);
      EXECUTE format(
        'CREATE POLICY %I_workspace_isolation ON public.%I FOR ALL USING (workspace_id IN (SELECT allowed_workspace_id FROM public.get_auth_user_workspaces())) WITH CHECK (workspace_id IN (SELECT allowed_workspace_id FROM public.get_auth_user_workspaces()));',
        tbl, tbl
      );
    END IF;
  END LOOP;
END $$;
