-- ==============================================================================
-- Migration 007: Role-Based Security, Staff Roles & User Management
-- ==============================================================================

-- 1. Ensure 'owner' exists in user_role ENUM
DO $$
BEGIN
  ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'owner' BEFORE 'admin';
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 2. Helper function to get current authenticated user's workshop role
CREATE OR REPLACE FUNCTION get_auth_user_role()
RETURNS user_role AS $$
DECLARE
  v_role user_role;
BEGIN
  SELECT role INTO v_role FROM public.users WHERE id = auth.uid() AND is_active = true LIMIT 1;
  RETURN COALESCE(v_role, 'receptionist'::user_role);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Helper function to check if current user is owner or admin
CREATE OR REPLACE FUNCTION is_admin_or_owner()
RETURNS BOOLEAN AS $$
DECLARE
  v_role user_role;
BEGIN
  SELECT role INTO v_role FROM public.users WHERE id = auth.uid() AND is_active = true LIMIT 1;
  RETURN (v_role IN ('owner', 'admin'));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Secure RLS policies on public.users
DROP POLICY IF EXISTS "Authenticated users can view all data" ON users;
DROP POLICY IF EXISTS "Authenticated users can update own profile" ON users;
DROP POLICY IF EXISTS "Admins and Owners can manage users" ON users;

CREATE POLICY "Authenticated users can view staff profiles"
  ON users FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Admins and Owners can insert staff"
  ON users FOR INSERT TO authenticated
  WITH CHECK (is_admin_or_owner() OR auth.uid() = id);

CREATE POLICY "Admins and Owners can update staff"
  ON users FOR UPDATE TO authenticated
  USING (is_admin_or_owner() OR auth.uid() = id);

CREATE POLICY "Admins and Owners can delete staff"
  ON users FOR DELETE TO authenticated
  USING (is_admin_or_owner());
