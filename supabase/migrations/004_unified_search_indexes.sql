-- Migration: 004_unified_search_indexes.sql
-- Optimizes customer & vehicle unified autocomplete search performance

-- Try creating pg_trgm extension if permissions allow (safe execution)
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_trgm;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'pg_trgm extension could not be created or already exists';
END $$;

-- Customer search indexes
CREATE INDEX IF NOT EXISTS idx_customers_name_lower ON customers (LOWER(name));
CREATE INDEX IF NOT EXISTS idx_customers_mobile_clean ON customers (mobile);

-- Vehicle search indexes
CREATE INDEX IF NOT EXISTS idx_vehicles_chassis_vin ON vehicles (LOWER(chassis_vin));
CREATE INDEX IF NOT EXISTS idx_vehicles_registration_no ON vehicles (LOWER(registration_number));
CREATE INDEX IF NOT EXISTS idx_vehicles_make_model ON vehicles (LOWER(make), LOWER(model));
CREATE INDEX IF NOT EXISTS idx_vehicles_customer_id ON vehicles (customer_id);
