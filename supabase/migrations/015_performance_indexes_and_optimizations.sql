-- ==============================================================================
-- Migration 015: Consolidated High-Performance Indexes for Auto Workshop
-- Ensures optimal B-Tree and Trigram index coverage across all core entities
-- ==============================================================================

-- 1. Customers Performance Indexes
CREATE INDEX IF NOT EXISTS idx_customers_name ON customers (name);
CREATE INDEX IF NOT EXISTS idx_customers_mobile ON customers (mobile);
CREATE INDEX IF NOT EXISTS idx_customers_created_at ON customers (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_customers_active ON customers (id) WHERE (is_deleted IS NULL OR is_deleted = false);

-- 2. Vehicles Performance Indexes
CREATE INDEX IF NOT EXISTS idx_vehicles_customer_id ON vehicles (customer_id);
CREATE INDEX IF NOT EXISTS idx_vehicles_chassis_vin ON vehicles (chassis_vin);
CREATE INDEX IF NOT EXISTS idx_vehicles_registration_number ON vehicles (registration_number);
CREATE INDEX IF NOT EXISTS idx_vehicles_make_model ON vehicles (make, model);
CREATE INDEX IF NOT EXISTS idx_vehicles_active ON vehicles (id) WHERE (is_deleted IS NULL OR is_deleted = false);

-- 3. Job Cards Performance Indexes
CREATE INDEX IF NOT EXISTS idx_job_cards_invoice_number ON job_cards (invoice_number);
CREATE INDEX IF NOT EXISTS idx_job_cards_customer_id ON job_cards (customer_id);
CREATE INDEX IF NOT EXISTS idx_job_cards_vehicle_id ON job_cards (vehicle_id);
CREATE INDEX IF NOT EXISTS idx_job_cards_date ON job_cards (date DESC);
CREATE INDEX IF NOT EXISTS idx_job_cards_status ON job_cards (status);
CREATE INDEX IF NOT EXISTS idx_job_cards_number ON job_cards (job_card_number);
CREATE INDEX IF NOT EXISTS idx_job_cards_active ON job_cards (id) WHERE (is_deleted IS NULL OR is_deleted = false);

-- 4. Services Performance Indexes
CREATE INDEX IF NOT EXISTS idx_services_name ON services (name);
CREATE INDEX IF NOT EXISTS idx_services_category ON services (category);
CREATE INDEX IF NOT EXISTS idx_services_active ON services (is_active);

-- 5. Parts & Inventory Performance Indexes
CREATE INDEX IF NOT EXISTS idx_parts_part_number ON parts (part_number);
CREATE INDEX IF NOT EXISTS idx_parts_name ON parts (name);
CREATE INDEX IF NOT EXISTS idx_parts_brand ON parts (brand);
CREATE INDEX IF NOT EXISTS idx_parts_supplier ON parts (supplier_id);
CREATE INDEX IF NOT EXISTS idx_parts_stock_status ON parts (current_stock, minimum_stock) WHERE is_active = true;

-- 6. Inventory Transactions Performance Indexes
CREATE INDEX IF NOT EXISTS idx_inventory_tx_part_created ON inventory_transactions (part_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_tx_type ON inventory_transactions (transaction_type);

-- 7. Invoices & Payments Indexes
CREATE INDEX IF NOT EXISTS idx_invoices_customer_id ON invoices (customer_id);
CREATE INDEX IF NOT EXISTS idx_invoices_job_card_id ON invoices (job_card_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices (payment_status);
CREATE INDEX IF NOT EXISTS idx_invoices_created_at ON invoices (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_payments_invoice_id ON payments (invoice_id);
CREATE INDEX IF NOT EXISTS idx_payments_job_card_id ON payments (job_card_id);
CREATE INDEX IF NOT EXISTS idx_payments_customer_id ON payments (customer_id);
CREATE INDEX IF NOT EXISTS idx_payments_date ON payments (payment_date DESC);
