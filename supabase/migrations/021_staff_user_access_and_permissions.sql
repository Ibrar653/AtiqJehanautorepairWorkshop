-- ==============================================================================
-- Migration 021: Professional Staff User Access, Granular Permissions & Audit
-- ==============================================================================

-- 1. Ensure 'accountant' and 'custom' exist in user_role ENUM
DO $$
BEGIN
  ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'accountant';
  ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'custom';
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 2. Add staff user management fields to users table
ALTER TABLE IF EXISTS users
  ADD COLUMN IF NOT EXISTS phone TEXT NULL,
  ADD COLUMN IF NOT EXISTS job_title TEXT NULL,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS access_expiry_date TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS notes TEXT NULL;

CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);

-- 3. Granular User Permissions Table
CREATE TABLE IF NOT EXISTS user_permissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  module TEXT NOT NULL,
  access BOOLEAN NOT NULL DEFAULT true,
  can_view BOOLEAN NOT NULL DEFAULT true,
  can_create BOOLEAN NOT NULL DEFAULT false,
  can_edit BOOLEAN NOT NULL DEFAULT false,
  can_delete BOOLEAN NOT NULL DEFAULT false,
  can_print BOOLEAN NOT NULL DEFAULT false,
  can_export BOOLEAN NOT NULL DEFAULT false,
  can_transfer BOOLEAN NOT NULL DEFAULT false,
  can_journal BOOLEAN NOT NULL DEFAULT false,
  can_reverse BOOLEAN NOT NULL DEFAULT false,
  can_finalize BOOLEAN NOT NULL DEFAULT false,
  can_record_payment BOOLEAN NOT NULL DEFAULT false,
  can_void BOOLEAN NOT NULL DEFAULT false,
  can_view_bank_balance BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_user_module UNIQUE (user_id, module)
);

CREATE INDEX IF NOT EXISTS idx_user_permissions_user_id ON user_permissions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_permissions_module ON user_permissions(module);

-- 4. User Activity Audit Logs Table
CREATE TABLE IF NOT EXISTS user_activity_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  user_email TEXT NOT NULL,
  user_name TEXT NOT NULL,
  action TEXT NOT NULL,
  module TEXT NOT NULL,
  record_reference TEXT NULL,
  description TEXT NOT NULL,
  details JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_activity_user_id ON user_activity_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_user_activity_created_at ON user_activity_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_activity_module ON user_activity_logs(module);

-- 5. Permission Change History Table
CREATE TABLE IF NOT EXISTS permission_change_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  operator_id TEXT NOT NULL,
  operator_name TEXT NOT NULL,
  target_user_id TEXT NOT NULL,
  target_user_name TEXT NOT NULL,
  module TEXT NOT NULL,
  change_summary TEXT NOT NULL,
  old_permissions JSONB DEFAULT '{}'::jsonb,
  new_permissions JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_perm_change_target ON permission_change_logs(target_user_id);
CREATE INDEX IF NOT EXISTS idx_perm_change_created_at ON permission_change_logs(created_at DESC);

-- 6. Row Level Security Policies
ALTER TABLE user_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE permission_change_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view permissions"
  ON user_permissions FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Admins and Owners can manage permissions"
  ON user_permissions FOR ALL TO authenticated
  USING (is_admin_or_owner())
  WITH CHECK (is_admin_or_owner());

CREATE POLICY "Authenticated users can insert activity logs"
  ON user_activity_logs FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can view activity logs"
  ON user_activity_logs FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Admins and Owners can view permission change logs"
  ON permission_change_logs FOR SELECT TO authenticated
  USING (is_admin_or_owner());

CREATE POLICY "Admins and Owners can insert permission change logs"
  ON permission_change_logs FOR INSERT TO authenticated
  WITH CHECK (is_admin_or_owner());
