-- ==============================================================================
-- Migration 020: Recycle Bin Enhancements & Audit History
-- ==============================================================================

-- 1. Ensure soft-delete columns on all supported modules
ALTER TABLE IF EXISTS services
  ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS deleted_by TEXT NULL;

CREATE INDEX IF NOT EXISTS idx_services_is_deleted ON services (is_deleted) WHERE is_deleted = TRUE;

ALTER TABLE IF EXISTS parts
  ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS deleted_by TEXT NULL;

CREATE INDEX IF NOT EXISTS idx_parts_is_deleted ON parts (is_deleted) WHERE is_deleted = TRUE;

ALTER TABLE IF EXISTS suppliers
  ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS deleted_by TEXT NULL;

CREATE INDEX IF NOT EXISTS idx_suppliers_is_deleted ON suppliers (is_deleted) WHERE is_deleted = TRUE;

ALTER TABLE IF EXISTS purchases
  ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS deleted_by TEXT NULL;

CREATE INDEX IF NOT EXISTS idx_purchases_is_deleted ON purchases (is_deleted) WHERE is_deleted = TRUE;

ALTER TABLE IF EXISTS invoices
  ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS deleted_by TEXT NULL;

CREATE INDEX IF NOT EXISTS idx_invoices_is_deleted ON invoices (is_deleted) WHERE is_deleted = TRUE;

ALTER TABLE IF EXISTS payments
  ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS deleted_by TEXT NULL;

CREATE INDEX IF NOT EXISTS idx_payments_is_deleted ON payments (is_deleted) WHERE is_deleted = TRUE;

ALTER TABLE IF EXISTS ledger_accounts
  ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS deleted_by TEXT NULL;

CREATE INDEX IF NOT EXISTS idx_ledger_accounts_is_deleted ON ledger_accounts (is_deleted) WHERE is_deleted = TRUE;

-- 2. Create dedicated audit history table for Recycle Bin actions
CREATE TABLE IF NOT EXISTS recycle_bin_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  record_type TEXT NOT NULL,
  record_id TEXT NOT NULL,
  record_reference TEXT NULL,
  record_name TEXT NOT NULL,
  source_module TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('DELETED', 'RESTORED', 'PERMANENTLY_DELETED', 'DELETE_BLOCKED')),
  performed_by TEXT NOT NULL,
  performed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reason TEXT NULL,
  metadata JSONB NULL
);

-- Performance indexes for fast querying and filtering
CREATE INDEX IF NOT EXISTS idx_recycle_bin_history_performed_at ON recycle_bin_history (performed_at DESC);
CREATE INDEX IF NOT EXISTS idx_recycle_bin_history_record_type ON recycle_bin_history (record_type);
CREATE INDEX IF NOT EXISTS idx_recycle_bin_history_record_id ON recycle_bin_history (record_id);
CREATE INDEX IF NOT EXISTS idx_recycle_bin_history_action ON recycle_bin_history (action);

-- Enable RLS
ALTER TABLE recycle_bin_history ENABLE ROW LEVEL SECURITY;

-- Select policy: Allow authenticated users to view audit history
DO $$ BEGIN
  CREATE POLICY "Allow authenticated read on recycle_bin_history"
    ON recycle_bin_history FOR SELECT
    TO authenticated
    USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Insert policy: Allow authenticated users to insert audit history events
DO $$ BEGIN
  CREATE POLICY "Allow authenticated insert on recycle_bin_history"
    ON recycle_bin_history FOR INSERT
    TO authenticated
    WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
