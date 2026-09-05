-- ==============================================================================
-- Migration 006: High-Performance Database Search & Filter Indexes
-- Optimized for Auto Workshop Management System
-- ==============================================================================

-- 1. Enable pg_trgm extension for fast text matching if available
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 2. Customers Search Indexes
CREATE INDEX IF NOT EXISTS idx_customers_name_trgm ON customers USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_customers_mobile_trgm ON customers USING gin (mobile gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_customers_mobile ON customers (mobile);
CREATE INDEX IF NOT EXISTS idx_customers_created_at ON customers (created_at DESC);

-- 3. Vehicles Search Indexes
CREATE INDEX IF NOT EXISTS idx_vehicles_chassis_vin_trgm ON vehicles USING gin (chassis_vin gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_vehicles_reg_number_trgm ON vehicles USING gin (registration_number gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_vehicles_make_model ON vehicles (make, model);
CREATE INDEX IF NOT EXISTS idx_vehicles_customer_id ON vehicles (customer_id);

-- 4. Job Cards Query & Filter Indexes
CREATE INDEX IF NOT EXISTS idx_job_cards_date ON job_cards (date);
CREATE INDEX IF NOT EXISTS idx_job_cards_status ON job_cards (status);
CREATE INDEX IF NOT EXISTS idx_job_cards_is_deleted ON job_cards (is_deleted);
CREATE INDEX IF NOT EXISTS idx_job_cards_active_date ON job_cards (date) WHERE (is_deleted IS NULL OR is_deleted = false);
CREATE INDEX IF NOT EXISTS idx_job_cards_active_status ON job_cards (status) WHERE (is_deleted IS NULL OR is_deleted = false);
CREATE INDEX IF NOT EXISTS idx_job_cards_number ON job_cards (job_card_number);

-- 5. Job Card Items Foreign Key & Type Indexes
CREATE INDEX IF NOT EXISTS idx_job_card_items_jc_id ON job_card_items (job_card_id);
CREATE INDEX IF NOT EXISTS idx_job_card_items_type ON job_card_items (item_type);
CREATE INDEX IF NOT EXISTS idx_job_card_items_part_id ON job_card_items (part_id);

-- 6. Payments & Invoices Date & Method Indexes
CREATE INDEX IF NOT EXISTS idx_payments_date ON payments (payment_date);
CREATE INDEX IF NOT EXISTS idx_payments_method ON payments (payment_method);
CREATE INDEX IF NOT EXISTS idx_invoices_created_at ON invoices (created_at);
CREATE INDEX IF NOT EXISTS idx_invoices_balance ON invoices (balance);

-- 7. Expenses Date & Category Indexes
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses (date);
CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses (category);

-- 8. Parts Stock & Reorder Index
CREATE INDEX IF NOT EXISTS idx_parts_stock_active ON parts (is_active, current_stock, minimum_stock);
