-- ==============================================================================
-- Migration 009: Soft Delete & Recycle Bin Support
-- ==============================================================================

-- 1. Add soft-delete columns to customers
ALTER TABLE customers 
  ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS deleted_by TEXT NULL;

CREATE INDEX IF NOT EXISTS idx_customers_is_deleted ON customers (is_deleted);

-- 2. Add soft-delete columns to vehicles
ALTER TABLE vehicles 
  ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS deleted_by TEXT NULL;

CREATE INDEX IF NOT EXISTS idx_vehicles_is_deleted ON vehicles (is_deleted);

-- 3. Add soft-delete columns to job_cards
ALTER TABLE job_cards 
  ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS deleted_by TEXT NULL;

CREATE INDEX IF NOT EXISTS idx_job_cards_is_deleted ON job_cards (is_deleted);

-- 4. Helper function to check if record has linked financial history
CREATE OR REPLACE FUNCTION has_financial_history(record_type TEXT, record_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  has_history BOOLEAN := FALSE;
BEGIN
  IF record_type = 'customer' THEN
    -- Check invoices or payments linked to this customer
    IF EXISTS (SELECT 1 FROM invoices WHERE customer_id = record_id LIMIT 1) OR
       EXISTS (SELECT 1 FROM payments WHERE invoice_id IN (SELECT id FROM invoices WHERE customer_id = record_id) LIMIT 1) THEN
      has_history := TRUE;
    END IF;
  ELSIF record_type = 'vehicle' THEN
    -- Check invoices or job cards with invoices linked to this vehicle
    IF EXISTS (SELECT 1 FROM job_cards WHERE vehicle_id = record_id AND (invoice_id IS NOT NULL OR total > 0) LIMIT 1) THEN
      has_history := TRUE;
    END IF;
  ELSIF record_type = 'job_card' THEN
    -- Check if job card has an invoice or payments
    IF EXISTS (SELECT 1 FROM invoices WHERE job_card_id = record_id LIMIT 1) OR
       EXISTS (SELECT 1 FROM job_cards WHERE id = record_id AND (invoice_id IS NOT NULL OR payment_status = 'paid' OR payment_status = 'partially_paid') LIMIT 1) THEN
      has_history := TRUE;
    END IF;
  END IF;

  RETURN has_history;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
