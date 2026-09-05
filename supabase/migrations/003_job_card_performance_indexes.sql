-- ============================================================================
-- Migration: Performance Indexes for Job Cards, Vehicles & Customers Search
-- ============================================================================

-- ─── Indexes for Job Cards ───────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_job_cards_number ON job_cards(job_card_number);
CREATE INDEX IF NOT EXISTS idx_job_cards_status ON job_cards(status);
CREATE INDEX IF NOT EXISTS idx_job_cards_customer_id ON job_cards(customer_id);
CREATE INDEX IF NOT EXISTS idx_job_cards_vehicle_id ON job_cards(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_job_cards_date ON job_cards(date);
CREATE INDEX IF NOT EXISTS idx_job_cards_created_at ON job_cards(created_at DESC);

-- ─── Indexes for Customers ──────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_customers_mobile ON customers(mobile);
CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(name);
CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(email);

-- ─── Indexes for Vehicles ───────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_vehicles_registration ON vehicles(registration_number);
CREATE INDEX IF NOT EXISTS idx_vehicles_chassis ON vehicles(chassis_vin);
CREATE INDEX IF NOT EXISTS idx_vehicles_customer ON vehicles(customer_id);

-- ─── Indexes for Services ───────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_services_name ON services(name);
CREATE INDEX IF NOT EXISTS idx_services_is_active ON services(is_active);

-- ─── Indexes for Job Card Items ─────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_job_card_items_jc_id ON job_card_items(job_card_id);
CREATE INDEX IF NOT EXISTS idx_job_card_items_type ON job_card_items(item_type);
