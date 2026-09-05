-- ==============================================================================
-- Migration 023: Enterprise Multi-Workspace & Separate Business Isolation System
-- ==============================================================================
-- Transforms the application into a multi-tenant platform with complete data isolation
-- between independent businesses/workspaces inside the SAME database.
-- ==============================================================================

-- 1. Create Workspaces Table
CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
  name TEXT NOT NULL,
  business_name TEXT NOT NULL,
  owner_user_id TEXT NULL,
  phone TEXT NULL,
  email TEXT NULL,
  address TEXT NULL,
  country TEXT NOT NULL DEFAULT 'United Arab Emirates',
  currency TEXT NOT NULL DEFAULT 'AED',
  trn TEXT NULL,
  logo_url TEXT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workspaces_status ON workspaces(status);
CREATE INDEX IF NOT EXISTS idx_workspaces_email ON workspaces(email);

-- 2. Create Workspace Members Table (Membership & Roles)
CREATE TABLE IF NOT EXISTS workspace_members (
  id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'manager',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'invited', 'suspended')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workspace_members_ws_user ON workspace_members(workspace_id, user_id);
CREATE INDEX IF NOT EXISTS idx_workspace_members_user ON workspace_members(user_id);

-- 3. Seed Primary Default Workspace: ATIQ JEHAN AUTO REPAIR
INSERT INTO workspaces (
  id,
  name,
  business_name,
  owner_user_id,
  phone,
  email,
  address,
  country,
  currency,
  trn,
  status
) VALUES (
  'ws-atiq-default-001',
  'ATIQ JEHAN AUTO REPAIR',
  'ATIQ JEHAN AUTO REPAIR & USED SPARE PARTS L.L.C.',
  'usr-owner-001',
  '+971 52 123 4567',
  'atiqjehandaraz@gmail.com',
  'Industrial Area 4, Sharjah, United Arab Emirates',
  'United Arab Emirates',
  'AED',
  '100482910400003',
  'active'
) ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  business_name = EXCLUDED.business_name,
  trn = EXCLUDED.trn;

-- 4. Add workspace_id Column to All Business Tables
DO $$
BEGIN
  -- customers
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='customers' AND column_name='workspace_id') THEN
    ALTER TABLE customers ADD COLUMN workspace_id TEXT REFERENCES workspaces(id);
  END IF;

  -- vehicles
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='vehicles' AND column_name='workspace_id') THEN
    ALTER TABLE vehicles ADD COLUMN workspace_id TEXT REFERENCES workspaces(id);
  END IF;

  -- services
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='services' AND column_name='workspace_id') THEN
    ALTER TABLE services ADD COLUMN workspace_id TEXT REFERENCES workspaces(id);
  END IF;

  -- parts
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='parts' AND column_name='workspace_id') THEN
    ALTER TABLE parts ADD COLUMN workspace_id TEXT REFERENCES workspaces(id);
  END IF;

  -- suppliers
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='suppliers' AND column_name='workspace_id') THEN
    ALTER TABLE suppliers ADD COLUMN workspace_id TEXT REFERENCES workspaces(id);
  END IF;

  -- job_cards
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='job_cards' AND column_name='workspace_id') THEN
    ALTER TABLE job_cards ADD COLUMN workspace_id TEXT REFERENCES workspaces(id);
  END IF;

  -- uploaded_job_cards
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='uploaded_job_cards') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='uploaded_job_cards' AND column_name='workspace_id') THEN
      ALTER TABLE uploaded_job_cards ADD COLUMN workspace_id TEXT REFERENCES workspaces(id);
    END IF;
  END IF;

  -- invoices
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='invoices' AND column_name='workspace_id') THEN
    ALTER TABLE invoices ADD COLUMN workspace_id TEXT REFERENCES workspaces(id);
  END IF;

  -- payments
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payments' AND column_name='workspace_id') THEN
    ALTER TABLE payments ADD COLUMN workspace_id TEXT REFERENCES workspaces(id);
  END IF;

  -- purchases
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='purchases' AND column_name='workspace_id') THEN
    ALTER TABLE purchases ADD COLUMN workspace_id TEXT REFERENCES workspaces(id);
  END IF;

  -- expenses
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='expenses' AND column_name='workspace_id') THEN
    ALTER TABLE expenses ADD COLUMN workspace_id TEXT REFERENCES workspaces(id);
  END IF;

  -- inventory_transactions
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='inventory_transactions' AND column_name='workspace_id') THEN
    ALTER TABLE inventory_transactions ADD COLUMN workspace_id TEXT REFERENCES workspaces(id);
  END IF;

  -- ledger_accounts
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='ledger_accounts') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ledger_accounts' AND column_name='workspace_id') THEN
      ALTER TABLE ledger_accounts ADD COLUMN workspace_id TEXT REFERENCES workspaces(id);
    END IF;
  END IF;

  -- ledger_transactions
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='ledger_transactions') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ledger_transactions' AND column_name='workspace_id') THEN
      ALTER TABLE ledger_transactions ADD COLUMN workspace_id TEXT REFERENCES workspaces(id);
    END IF;
  END IF;

  -- workers
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='workers') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='workers' AND column_name='workspace_id') THEN
      ALTER TABLE workers ADD COLUMN workspace_id TEXT REFERENCES workspaces(id);
    END IF;
  END IF;

  -- bank_accounts
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='bank_accounts') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='bank_accounts' AND column_name='workspace_id') THEN
      ALTER TABLE bank_accounts ADD COLUMN workspace_id TEXT REFERENCES workspaces(id);
    END IF;
  END IF;

  -- settings
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='settings' AND column_name='workspace_id') THEN
    ALTER TABLE settings ADD COLUMN workspace_id TEXT REFERENCES workspaces(id);
  END IF;
END $$;

-- 5. Safe Migration of All Existing Data to ATIQ JEHAN Workspace
-- Ensures 0 existing records are lost or left with NULL workspace_id
UPDATE customers SET workspace_id = 'ws-atiq-default-001' WHERE workspace_id IS NULL;
UPDATE vehicles SET workspace_id = 'ws-atiq-default-001' WHERE workspace_id IS NULL;
UPDATE services SET workspace_id = 'ws-atiq-default-001' WHERE workspace_id IS NULL;
UPDATE parts SET workspace_id = 'ws-atiq-default-001' WHERE workspace_id IS NULL;
UPDATE suppliers SET workspace_id = 'ws-atiq-default-001' WHERE workspace_id IS NULL;
UPDATE job_cards SET workspace_id = 'ws-atiq-default-001' WHERE workspace_id IS NULL;
UPDATE invoices SET workspace_id = 'ws-atiq-default-001' WHERE workspace_id IS NULL;
UPDATE payments SET workspace_id = 'ws-atiq-default-001' WHERE workspace_id IS NULL;
UPDATE purchases SET workspace_id = 'ws-atiq-default-001' WHERE workspace_id IS NULL;
UPDATE expenses SET workspace_id = 'ws-atiq-default-001' WHERE workspace_id IS NULL;
UPDATE inventory_transactions SET workspace_id = 'ws-atiq-default-001' WHERE workspace_id IS NULL;
UPDATE settings SET workspace_id = 'ws-atiq-default-001' WHERE workspace_id IS NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='uploaded_job_cards') THEN
    UPDATE uploaded_job_cards SET workspace_id = 'ws-atiq-default-001' WHERE workspace_id IS NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='ledger_accounts') THEN
    UPDATE ledger_accounts SET workspace_id = 'ws-atiq-default-001' WHERE workspace_id IS NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='ledger_transactions') THEN
    UPDATE ledger_transactions SET workspace_id = 'ws-atiq-default-001' WHERE workspace_id IS NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='workers') THEN
    UPDATE workers SET workspace_id = 'ws-atiq-default-001' WHERE workspace_id IS NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='bank_accounts') THEN
    UPDATE bank_accounts SET workspace_id = 'ws-atiq-default-001' WHERE workspace_id IS NULL;
  END IF;
END $$;

-- 6. Link Existing Users to Primary ATIQ Workspace
INSERT INTO workspace_members (workspace_id, user_id, role, status)
SELECT 'ws-atiq-default-001', id::text, role::text, 'active'
FROM users
ON CONFLICT DO NOTHING;

-- 7. Performance Indexes on workspace_id
CREATE INDEX IF NOT EXISTS idx_customers_workspace ON customers(workspace_id);
CREATE INDEX IF NOT EXISTS idx_vehicles_workspace ON vehicles(workspace_id);
CREATE INDEX IF NOT EXISTS idx_services_workspace ON services(workspace_id);
CREATE INDEX IF NOT EXISTS idx_parts_workspace ON parts(workspace_id);
CREATE INDEX IF NOT EXISTS idx_suppliers_workspace ON suppliers(workspace_id);
CREATE INDEX IF NOT EXISTS idx_job_cards_workspace ON job_cards(workspace_id);
CREATE INDEX IF NOT EXISTS idx_invoices_workspace ON invoices(workspace_id);
CREATE INDEX IF NOT EXISTS idx_payments_workspace ON payments(workspace_id);
CREATE INDEX IF NOT EXISTS idx_purchases_workspace ON purchases(workspace_id);
CREATE INDEX IF NOT EXISTS idx_expenses_workspace ON expenses(workspace_id);
CREATE INDEX IF NOT EXISTS idx_inventory_tx_workspace ON inventory_transactions(workspace_id);

-- 8. Row Level Security Helper Function
CREATE OR REPLACE FUNCTION get_auth_user_workspaces()
RETURNS TABLE(allowed_workspace_id TEXT) AS $$
BEGIN
  -- Platform Super Owner (atiqjehandaraz@gmail.com) has platform-wide access
  IF (auth.jwt() ->> 'email') = 'atiqjehandaraz@gmail.com' THEN
    RETURN QUERY SELECT id FROM workspaces;
  ELSE
    RETURN QUERY
    SELECT wm.workspace_id
    FROM workspace_members wm
    WHERE wm.user_id = auth.uid()::text AND wm.status = 'active';
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 9. Row Level Security Policies
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE services ENABLE ROW LEVEL SECURITY;
ALTER TABLE parts ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;

-- Workspaces Policy
DROP POLICY IF EXISTS "workspaces_access_policy" ON workspaces;
CREATE POLICY "workspaces_access_policy" ON workspaces
  FOR ALL
  USING (
    (auth.jwt() ->> 'email') = 'atiqjehandaraz@gmail.com'
    OR id IN (SELECT allowed_workspace_id FROM get_auth_user_workspaces())
  );

-- Workspace Members Policy
DROP POLICY IF EXISTS "workspace_members_access_policy" ON workspace_members;
CREATE POLICY "workspace_members_access_policy" ON workspace_members
  FOR ALL
  USING (
    (auth.jwt() ->> 'email') = 'atiqjehandaraz@gmail.com'
    OR workspace_id IN (SELECT allowed_workspace_id FROM get_auth_user_workspaces())
  );

-- Customers Policy
DROP POLICY IF EXISTS "customers_workspace_isolation" ON customers;
CREATE POLICY "customers_workspace_isolation" ON customers
  FOR ALL
  USING (workspace_id IN (SELECT allowed_workspace_id FROM get_auth_user_workspaces()))
  WITH CHECK (workspace_id IN (SELECT allowed_workspace_id FROM get_auth_user_workspaces()));

-- Vehicles Policy
DROP POLICY IF EXISTS "vehicles_workspace_isolation" ON vehicles;
CREATE POLICY "vehicles_workspace_isolation" ON vehicles
  FOR ALL
  USING (workspace_id IN (SELECT allowed_workspace_id FROM get_auth_user_workspaces()))
  WITH CHECK (workspace_id IN (SELECT allowed_workspace_id FROM get_auth_user_workspaces()));

-- Job Cards Policy
DROP POLICY IF EXISTS "job_cards_workspace_isolation" ON job_cards;
CREATE POLICY "job_cards_workspace_isolation" ON job_cards
  FOR ALL
  USING (workspace_id IN (SELECT allowed_workspace_id FROM get_auth_user_workspaces()))
  WITH CHECK (workspace_id IN (SELECT allowed_workspace_id FROM get_auth_user_workspaces()));

-- Invoices Policy
DROP POLICY IF EXISTS "invoices_workspace_isolation" ON invoices;
CREATE POLICY "invoices_workspace_isolation" ON invoices
  FOR ALL
  USING (workspace_id IN (SELECT allowed_workspace_id FROM get_auth_user_workspaces()))
  WITH CHECK (workspace_id IN (SELECT allowed_workspace_id FROM get_auth_user_workspaces()));

-- Parts Policy
DROP POLICY IF EXISTS "parts_workspace_isolation" ON parts;
CREATE POLICY "parts_workspace_isolation" ON parts
  FOR ALL
  USING (workspace_id IN (SELECT allowed_workspace_id FROM get_auth_user_workspaces()))
  WITH CHECK (workspace_id IN (SELECT allowed_workspace_id FROM get_auth_user_workspaces()));

-- Expenses Policy
DROP POLICY IF EXISTS "expenses_workspace_isolation" ON expenses;
CREATE POLICY "expenses_workspace_isolation" ON expenses
  FOR ALL
  USING (workspace_id IN (SELECT allowed_workspace_id FROM get_auth_user_workspaces()))
  WITH CHECK (workspace_id IN (SELECT allowed_workspace_id FROM get_auth_user_workspaces()));
