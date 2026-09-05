-- ==============================================================================
-- Migration 008: Owner, Manager & Viewer Role-Based Access Control (RBAC)
-- Primary Owner: atiqjehandaraz@gmail.com
-- ==============================================================================

-- 1. Ensure 'viewer' exists in user_role ENUM
DO $$
BEGIN
  ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'viewer';
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 2. Add last_login_at column to users table if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'users' AND column_name = 'last_login_at'
  ) THEN
    ALTER TABLE users ADD COLUMN last_login_at TIMESTAMPTZ;
  END IF;
END $$;

-- 3. Security Helper Functions
CREATE OR REPLACE FUNCTION is_active_user()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid() AND is_active = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION is_owner()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid() AND is_active = true AND role = 'owner'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION is_manager_or_above()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid() AND is_active = true AND role IN ('owner', 'admin', 'manager')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Secure RLS policies on public.users
DROP POLICY IF EXISTS "Authenticated users can view staff profiles" ON users;
DROP POLICY IF EXISTS "Admins and Owners can insert staff" ON users;
DROP POLICY IF EXISTS "Admins and Owners can update staff" ON users;
DROP POLICY IF EXISTS "Admins and Owners can delete staff" ON users;

-- View staff profiles: all active authenticated users
CREATE POLICY "Active users can view staff profiles"
  ON users FOR SELECT TO authenticated
  USING (is_active_user());

-- Insert/Create staff: Only Owner and Admin
CREATE POLICY "Owners and Admins can create staff"
  ON users FOR INSERT TO authenticated
  WITH CHECK (is_owner() OR is_admin_or_owner());

-- Update staff: Owner can update any; Admin/Manager cannot modify Owner; users can update own profile
CREATE POLICY "Owners can update any staff, users can update own profile"
  ON users FOR UPDATE TO authenticated
  USING (
    is_owner() OR
    (is_admin_or_owner() AND role != 'owner') OR
    (auth.uid() = id)
  );

-- Delete staff: Only Owner
CREATE POLICY "Only Owners can delete staff"
  ON users FOR DELETE TO authenticated
  USING (is_owner() AND role != 'owner');

-- 5. Operational Tables RLS Enforcement for Viewers (Read-Only)
-- Data tables can only be modified by Manager, Admin, or Owner (Viewers are blocked from INSERT, UPDATE, DELETE)
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN
    SELECT unnest(ARRAY[
      'customers', 'vehicles', 'services', 'parts', 'suppliers',
      'job_cards', 'job_card_items', 'invoices', 'invoice_items',
      'payments', 'purchases', 'purchase_items', 'expenses',
      'inventory_transactions', 'settings'
    ])
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "auth_select_%1$s" ON %1$s', tbl);
    EXECUTE format('DROP POLICY IF EXISTS "auth_insert_%1$s" ON %1$s', tbl);
    EXECUTE format('DROP POLICY IF EXISTS "auth_update_%1$s" ON %1$s', tbl);
    EXECUTE format('DROP POLICY IF EXISTS "auth_delete_%1$s" ON %1$s', tbl);

    -- SELECT: Allowed for all active authenticated users (including Viewer)
    EXECUTE format('CREATE POLICY "auth_select_%1$s" ON %1$s FOR SELECT TO authenticated USING (is_active_user())', tbl);

    -- INSERT, UPDATE, DELETE: Allowed only for Manager or above (Blocked for Viewer)
    EXECUTE format('CREATE POLICY "auth_insert_%1$s" ON %1$s FOR INSERT TO authenticated WITH CHECK (is_manager_or_above())', tbl);
    EXECUTE format('CREATE POLICY "auth_update_%1$s" ON %1$s FOR UPDATE TO authenticated USING (is_manager_or_above())', tbl);
    EXECUTE format('CREATE POLICY "auth_delete_%1$s" ON %1$s FOR DELETE TO authenticated USING (is_manager_or_above())', tbl);
  END LOOP;
END
$$;
