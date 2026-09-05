-- ==============================================================================
-- Migration 016: Expenses Module Enhancements & Soft Delete Support
-- ==============================================================================

-- 1. Add missing expense fields if not present
ALTER TABLE expenses 
  ADD COLUMN IF NOT EXISTS paid_to TEXT NULL,
  ADD COLUMN IF NOT EXISTS reference_number TEXT NULL,
  ADD COLUMN IF NOT EXISTS attachment_path TEXT NULL,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now(),
  ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS deleted_by TEXT NULL;

-- 2. Performance indexes for expenses
CREATE INDEX IF NOT EXISTS idx_expenses_is_deleted ON expenses (is_deleted);
CREATE INDEX IF NOT EXISTS idx_expenses_paid_to ON expenses (paid_to);
CREATE INDEX IF NOT EXISTS idx_expenses_reference ON expenses (reference_number);
CREATE INDEX IF NOT EXISTS idx_expenses_created_at ON expenses (created_at DESC);
