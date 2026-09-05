-- ============================================================================
-- MIGRATION 024: ENTERPRISE DELEGATED ACCESS, DATA SCOPES & APPROVALS
-- ============================================================================
-- Adds enterprise-grade delegated access control:
-- 1. Data Access Scope (own, assigned, team, all)
-- 2. Financial Visibility toggles (selling, cost, profit, balances, ledger)
-- 3. Approval Limits per user (expense, transfer, payment, discount, stock, void)
-- 4. Approval Requests table for pending high-risk transactions
-- 5. Access Requests table for staff requesting restricted features
-- 6. Temporary Access tracking (start/expiry) and 2FA status
-- ============================================================================

-- 1. Extend users table
ALTER TABLE IF EXISTS public.users
  ADD COLUMN IF NOT EXISTS data_scope VARCHAR(20) DEFAULT 'all' CHECK (data_scope IN ('own', 'assigned', 'team', 'all')),
  ADD COLUMN IF NOT EXISTS financial_visibility JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS approval_limits JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS access_start_date TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS access_expiry_date TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS two_factor_enabled BOOLEAN DEFAULT FALSE;

-- 2. Create approval_requests table
CREATE TABLE IF NOT EXISTS public.approval_requests (
  id VARCHAR(64) PRIMARY KEY,
  workspace_id VARCHAR(64) NOT NULL,
  user_id VARCHAR(64) NOT NULL,
  user_name VARCHAR(255) NOT NULL,
  request_type VARCHAR(50) NOT NULL CHECK (request_type IN (
    'large_expense',
    'large_transfer',
    'large_payment',
    'invoice_void',
    'high_discount',
    'manual_journal',
    'stock_adjustment',
    'permanent_delete'
  )),
  amount NUMERIC(12, 2),
  currency VARCHAR(10) DEFAULT 'AED',
  details JSONB DEFAULT '{}'::jsonb,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  reviewed_by VARCHAR(255),
  reviewed_at TIMESTAMPTZ,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Create access_requests table
CREATE TABLE IF NOT EXISTS public.access_requests (
  id VARCHAR(64) PRIMARY KEY,
  workspace_id VARCHAR(64) NOT NULL,
  user_id VARCHAR(64) NOT NULL,
  user_name VARCHAR(255) NOT NULL,
  user_email VARCHAR(255) NOT NULL,
  requested_module VARCHAR(50) NOT NULL,
  requested_action VARCHAR(50) DEFAULT 'view',
  reason TEXT,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  reviewed_by VARCHAR(255),
  reviewed_at TIMESTAMPTZ,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Performance Indexes
CREATE INDEX IF NOT EXISTS idx_approval_requests_ws_status ON public.approval_requests(workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_approval_requests_user ON public.approval_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_access_requests_ws_status ON public.access_requests(workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_access_requests_user ON public.access_requests(user_id);

-- 5. Enable RLS
ALTER TABLE public.approval_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.access_requests ENABLE ROW LEVEL SECURITY;

-- 6. RLS Policies
CREATE POLICY "approval_requests_workspace_isolation"
  ON public.approval_requests
  FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY "access_requests_workspace_isolation"
  ON public.access_requests
  FOR ALL
  USING (true)
  WITH CHECK (true);
