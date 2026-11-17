-- ============================================================================
-- Migration 036: Smart Search Performance Indexes (pg_trgm)
-- NOTE: Prepared for review and manual approval before applying in Supabase.
-- Safe, non-destructive, read-accelerating GIN trigram indexes only.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 1. Customers trigram indexes (name, mobile, company_name, trn_number)
CREATE INDEX IF NOT EXISTS idx_customers_name_trgm
  ON customers USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_customers_mobile_trgm
  ON customers USING gin (mobile gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_customers_company_trgm
  ON customers USING gin (company_name gin_trgm_ops);

-- 2. Vehicles trigram indexes (make, model, registration_number, chassis_vin)
CREATE INDEX IF NOT EXISTS idx_vehicles_make_trgm
  ON vehicles USING gin (make gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_vehicles_model_trgm
  ON vehicles USING gin (model gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_vehicles_plate_trgm
  ON vehicles USING gin (registration_number gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_vehicles_vin_trgm
  ON vehicles USING gin (chassis_vin gin_trgm_ops);

-- Normalized plate index (strips spaces and hyphens for instant GSS23456 <-> GSS-23456 lookup)
CREATE INDEX IF NOT EXISTS idx_vehicles_plate_normalized
  ON vehicles (workspace_id, lower(regexp_replace(coalesce(registration_number, ''), '[\s\-_]+', '', 'g')))
  WHERE is_deleted = false;

-- 3. Job Cards trigram indexes
CREATE INDEX IF NOT EXISTS idx_job_cards_number_trgm
  ON job_cards USING gin (job_card_number gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_job_cards_mechanic_trgm
  ON job_cards USING gin (assigned_mechanic gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_job_cards_complaint_trgm
  ON job_cards USING gin (customer_complaint gin_trgm_ops);

-- 4. Invoices trigram indexes
CREATE INDEX IF NOT EXISTS idx_invoices_number_trgm
  ON invoices USING gin (invoice_number gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_invoices_notes_trgm
  ON invoices USING gin (notes gin_trgm_ops);

-- 5. Line items description trigram indexes
CREATE INDEX IF NOT EXISTS idx_job_card_items_desc_trgm
  ON job_card_items USING gin (description gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_invoice_items_desc_trgm
  ON invoice_items USING gin (description gin_trgm_ops);
