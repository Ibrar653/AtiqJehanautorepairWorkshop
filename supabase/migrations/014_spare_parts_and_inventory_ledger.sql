-- ─── 014: Spare Parts Master & Inventory Transactions Ledger ─────────────────
-- Enhances public.parts and public.inventory_transactions for real auto workshop operations

-- 1. Ensure columns on parts table
ALTER TABLE parts ADD COLUMN IF NOT EXISTS location TEXT;
ALTER TABLE parts ADD COLUMN IF NOT EXISTS description TEXT;

-- 2. Ensure columns on inventory_transactions table
ALTER TABLE inventory_transactions ADD COLUMN IF NOT EXISTS quantity_before INTEGER;
ALTER TABLE inventory_transactions ADD COLUMN IF NOT EXISTS quantity_after INTEGER;
ALTER TABLE inventory_transactions ADD COLUMN IF NOT EXISTS unit_cost NUMERIC(12, 2);

-- 3. Ensure cost snapshot column on job_card_items
ALTER TABLE job_card_items ADD COLUMN IF NOT EXISTS cost_price NUMERIC(12, 2) DEFAULT 0;

-- 4. Create performance indexes
CREATE INDEX IF NOT EXISTS idx_parts_part_number ON parts(part_number);
CREATE INDEX IF NOT EXISTS idx_parts_name ON parts(name);
CREATE INDEX IF NOT EXISTS idx_parts_brand ON parts(brand);
CREATE INDEX IF NOT EXISTS idx_parts_supplier ON parts(supplier_id);
CREATE INDEX IF NOT EXISTS idx_parts_stock_status ON parts(current_stock, minimum_stock) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_inventory_tx_part_created ON inventory_transactions(part_id, created_at DESC);
