-- ============================================================================
-- Migration: Soft Delete for Job Cards & Dashboard Performance Indexes
-- ============================================================================

-- 1. Add Soft Delete Columns to job_cards (if not existing)
ALTER TABLE IF EXISTS job_cards
  ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES auth.users(id);

-- 2. Performance Indexes for Job Cards & Filtering
CREATE INDEX IF NOT EXISTS idx_job_cards_is_deleted ON job_cards(is_deleted);
CREATE INDEX IF NOT EXISTS idx_job_cards_date_status ON job_cards(date, status) WHERE (is_deleted IS FALSE OR is_deleted IS NULL);
CREATE INDEX IF NOT EXISTS idx_job_cards_created_at_active ON job_cards(created_at DESC) WHERE (is_deleted IS FALSE OR is_deleted IS NULL);

-- 3. Performance Indexes for Expenses
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date DESC);
CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category);
CREATE INDEX IF NOT EXISTS idx_expenses_payment_method ON expenses(payment_method);

-- 4. Performance Indexes for Payments
CREATE INDEX IF NOT EXISTS idx_payments_date ON payments(payment_date DESC);
CREATE INDEX IF NOT EXISTS idx_payments_method ON payments(payment_method);
CREATE INDEX IF NOT EXISTS idx_payments_job_card_id ON payments(job_card_id);
CREATE INDEX IF NOT EXISTS idx_payments_invoice_id ON payments(invoice_id);

-- 5. Performance Indexes for Invoices
CREATE INDEX IF NOT EXISTS idx_invoices_created_at ON invoices(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_invoices_payment_status ON invoices(payment_status);

-- 6. Performance Indexes for Parts & Low Stock
CREATE INDEX IF NOT EXISTS idx_parts_is_active ON parts(is_active);
CREATE INDEX IF NOT EXISTS idx_parts_stock ON parts(current_stock, minimum_stock) WHERE is_active = TRUE;
