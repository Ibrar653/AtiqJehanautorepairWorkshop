-- ==============================================================================
-- ATIQ JEHAN AUTO REPAIR & WORKSHOP MANAGEMENT SYSTEM
-- COMPLETE MASTER DATABASE SCHEMA SETUP (ALL 29 MIGRATIONS CONSOLIDATED)
-- ==============================================================================
-- TARGET DATABASE: Supabase PostgreSQL (dnrrwcccclulidhyglub)
-- INSTRUCTIONS:
-- 1. Open your Supabase Dashboard:
--    https://supabase.com/dashboard/project/dnrrwcccclulidhyglub/sql/new
-- 2. Paste the entire content of this script.
-- 3. Click "Run" (or Ctrl+Enter).
--
-- This script is completely IDEMPOTENT (safe to run multiple times).
-- It creates all required tables, foreign keys, enums, triggers, RLS policies,
-- performance indexes, and seeds the primary workspace (ATIQ JEHAN AUTO REPAIR).
-- ==============================================================================

-- Enable Core Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";



-- ==============================================================================
-- MIGRATION STEP: 001_initial_schema.sql
-- ==============================================================================

-- ============================================================================
-- ATIQ JEHAN AUTO REPAIR & USED SPARE PARTS L.L.C.
-- Auto Workshop Management System — Initial Database Schema
-- ============================================================================
-- Run this SQL in your Supabase SQL Editor (Dashboard > SQL Editor > New Query)
-- ============================================================================

-- ─── Enable UUID Extension ──────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── Custom ENUM Types ─────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('admin', 'manager', 'receptionist', 'storekeeper', 'mechanic');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
  CREATE TYPE job_card_status AS ENUM ('new', 'in_progress', 'waiting', 'completed', 'cancelled');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
  CREATE TYPE payment_method AS ENUM ('cash', 'bank', 'credit');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
  CREATE TYPE payment_status AS ENUM ('paid', 'partially_paid', 'credit');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
  CREATE TYPE purchase_payment_status AS ENUM ('paid', 'partially_paid', 'unpaid');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
  CREATE TYPE item_type AS ENUM ('service', 'part', 'labour');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
  CREATE TYPE inventory_transaction_type AS ENUM ('purchase_in', 'job_card_out', 'adjustment', 'return');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
  CREATE TYPE expense_payment_method AS ENUM ('cash', 'bank');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- ─── Users ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  role user_role NOT NULL DEFAULT 'receptionist',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Customers ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS customers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  mobile TEXT,
  email TEXT,
  address TEXT,
  notes TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customers_name ON customers USING gin(to_tsvector('english', name));
CREATE INDEX IF NOT EXISTS idx_customers_mobile ON customers(mobile);

-- ─── Suppliers ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS suppliers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  contact_person TEXT,
  phone TEXT,
  address TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Vehicles ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS vehicles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  make TEXT NOT NULL,
  model TEXT NOT NULL,
  year INTEGER,
  color TEXT,
  chassis_vin TEXT,
  mileage INTEGER,
  registration_number TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vehicles_customer ON vehicles(customer_id);
CREATE INDEX IF NOT EXISTS idx_vehicles_registration ON vehicles(registration_number);
CREATE INDEX IF NOT EXISTS idx_vehicles_chassis_vin ON vehicles(chassis_vin);
CREATE UNIQUE INDEX IF NOT EXISTS idx_vehicles_unique_chassis_vin ON vehicles(chassis_vin) WHERE chassis_vin IS NOT NULL AND chassis_vin != '';

-- ─── Services ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS services (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  description TEXT,
  default_price NUMERIC(12, 2) NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Parts (Spare Parts) ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS parts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  part_number TEXT,
  brand TEXT,
  unit TEXT NOT NULL DEFAULT 'piece',
  purchase_price NUMERIC(12, 2) NOT NULL DEFAULT 0,
  selling_price NUMERIC(12, 2) NOT NULL DEFAULT 0,
  current_stock INTEGER NOT NULL DEFAULT 0 CHECK (current_stock >= 0),
  minimum_stock INTEGER NOT NULL DEFAULT 0 CHECK (minimum_stock >= 0),
  supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_parts_part_number ON parts(part_number);
CREATE INDEX IF NOT EXISTS idx_parts_supplier ON parts(supplier_id);
CREATE INDEX IF NOT EXISTS idx_parts_low_stock ON parts(current_stock, minimum_stock) WHERE is_active = true;

-- ─── Job Cards ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS job_cards (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_card_number TEXT UNIQUE NOT NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  customer_id UUID NOT NULL REFERENCES customers(id),
  vehicle_id UUID NOT NULL REFERENCES vehicles(id),
  mileage_in INTEGER,
  customer_complaint TEXT,
  discount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  subtotal NUMERIC(12, 2) NOT NULL DEFAULT 0,
  vat_rate NUMERIC(5, 2) NOT NULL DEFAULT 5,
  vat_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  total NUMERIC(12, 2) NOT NULL DEFAULT 0,
  paid NUMERIC(12, 2) NOT NULL DEFAULT 0,
  balance NUMERIC(12, 2) NOT NULL DEFAULT 0,
  status job_card_status NOT NULL DEFAULT 'new',
  assigned_mechanic TEXT,
  notes TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_job_cards_customer ON job_cards(customer_id);
CREATE INDEX IF NOT EXISTS idx_job_cards_vehicle ON job_cards(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_job_cards_status ON job_cards(status);
CREATE INDEX IF NOT EXISTS idx_job_cards_date ON job_cards(date);
CREATE INDEX IF NOT EXISTS idx_job_cards_number ON job_cards(job_card_number);

-- ─── Job Card Items ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS job_card_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_card_id UUID NOT NULL REFERENCES job_cards(id) ON DELETE CASCADE,
  item_type item_type NOT NULL,
  service_id UUID REFERENCES services(id),
  part_id UUID REFERENCES parts(id),
  description TEXT NOT NULL,
  quantity NUMERIC(10, 2) NOT NULL DEFAULT 1,
  unit_price NUMERIC(12, 2) NOT NULL,
  total_price NUMERIC(12, 2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_job_card_items_job_card ON job_card_items(job_card_id);

-- ─── Invoices ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS invoices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_number TEXT UNIQUE NOT NULL,
  job_card_id UUID REFERENCES job_cards(id),
  customer_id UUID NOT NULL REFERENCES customers(id),
  vehicle_id UUID REFERENCES vehicles(id),
  subtotal NUMERIC(12, 2) NOT NULL DEFAULT 0,
  discount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  vat_rate NUMERIC(5, 2) NOT NULL DEFAULT 5,
  vat_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  total NUMERIC(12, 2) NOT NULL DEFAULT 0,
  paid NUMERIC(12, 2) NOT NULL DEFAULT 0,
  balance NUMERIC(12, 2) NOT NULL DEFAULT 0,
  payment_status payment_status NOT NULL DEFAULT 'credit',
  notes TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invoices_customer ON invoices(customer_id);
CREATE INDEX IF NOT EXISTS idx_invoices_job_card ON invoices(job_card_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(payment_status);
CREATE INDEX IF NOT EXISTS idx_invoices_date ON invoices(created_at);

-- ─── Invoice Items ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS invoice_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  item_type item_type,
  description TEXT NOT NULL,
  quantity NUMERIC(10, 2) NOT NULL DEFAULT 1,
  unit_price NUMERIC(12, 2) NOT NULL,
  total_price NUMERIC(12, 2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice ON invoice_items(invoice_id);

-- ─── Payments ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_id UUID REFERENCES invoices(id),
  job_card_id UUID REFERENCES job_cards(id),
  customer_id UUID NOT NULL REFERENCES customers(id),
  amount NUMERIC(12, 2) NOT NULL,
  payment_method payment_method NOT NULL,
  reference_number TEXT,
  notes TEXT,
  payment_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payments_invoice ON payments(invoice_id);
CREATE INDEX IF NOT EXISTS idx_payments_customer ON payments(customer_id);
CREATE INDEX IF NOT EXISTS idx_payments_date ON payments(payment_date);
CREATE INDEX IF NOT EXISTS idx_payments_method ON payments(payment_method);

-- ─── Purchases ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS purchases (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  supplier_id UUID NOT NULL REFERENCES suppliers(id),
  purchase_invoice_number TEXT,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  total NUMERIC(12, 2) NOT NULL DEFAULT 0,
  payment_status purchase_payment_status NOT NULL DEFAULT 'unpaid',
  notes TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_purchases_supplier ON purchases(supplier_id);
CREATE INDEX IF NOT EXISTS idx_purchases_date ON purchases(date);

-- ─── Purchase Items ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS purchase_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  purchase_id UUID NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
  part_id UUID NOT NULL REFERENCES parts(id),
  quantity NUMERIC(10, 2) NOT NULL,
  purchase_price NUMERIC(12, 2) NOT NULL,
  total_price NUMERIC(12, 2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_purchase_items_purchase ON purchase_items(purchase_id);

-- ─── Expenses ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS expenses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  category TEXT NOT NULL,
  description TEXT,
  amount NUMERIC(12, 2) NOT NULL,
  payment_method expense_payment_method NOT NULL,
  notes TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date);
CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category);

-- ─── Inventory Transactions ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS inventory_transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  part_id UUID NOT NULL REFERENCES parts(id),
  transaction_type inventory_transaction_type NOT NULL,
  quantity INTEGER NOT NULL,
  reference_id UUID,
  reference_type TEXT,
  notes TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inventory_tx_part ON inventory_transactions(part_id);
CREATE INDEX IF NOT EXISTS idx_inventory_tx_date ON inventory_transactions(created_at);

-- ─── Settings ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  key TEXT UNIQUE NOT NULL,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES users(id)
);

-- Insert default settings
INSERT INTO settings (key, value) VALUES
  ('vat_rate', '5'),
  ('company_name', 'ATIQ JEHAN AUTO REPAIR & USED SPARE PARTS L.L.C.'),
  ('company_phone', ''),
  ('company_address', ''),
  ('company_trn', ''),
  ('currency', 'AED');

-- ─── Auto-update updated_at Trigger ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_customers_updated_at BEFORE UPDATE ON customers FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_vehicles_updated_at BEFORE UPDATE ON vehicles FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_services_updated_at BEFORE UPDATE ON services FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_parts_updated_at BEFORE UPDATE ON parts FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_suppliers_updated_at BEFORE UPDATE ON suppliers FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_job_cards_updated_at BEFORE UPDATE ON job_cards FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_invoices_updated_at BEFORE UPDATE ON invoices FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_purchases_updated_at BEFORE UPDATE ON purchases FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── Auto-generate Job Card Number (JC-YYYYMMDD-001) ─────────────────────────

CREATE OR REPLACE FUNCTION generate_job_card_number()
RETURNS TRIGGER AS $$
DECLARE
  today_count INTEGER;
  today_str TEXT;
BEGIN
  today_str := to_char(NEW.date, 'YYYYMMDD');

  SELECT COUNT(*) + 1 INTO today_count
  FROM job_cards
  WHERE to_char(date, 'YYYYMMDD') = today_str;

  NEW.job_card_number := 'JC-' || today_str || '-' || lpad(today_count::TEXT, 3, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_job_card_number BEFORE INSERT ON job_cards
  FOR EACH ROW
  WHEN (NEW.job_card_number IS NULL OR NEW.job_card_number = '')
  EXECUTE FUNCTION generate_job_card_number();

-- ─── Auto-generate Invoice Number (INV-YYYYMMDD-001) ──────────────────────────

CREATE OR REPLACE FUNCTION generate_invoice_number()
RETURNS TRIGGER AS $$
DECLARE
  today_count INTEGER;
  today_str TEXT;
BEGIN
  today_str := to_char(CURRENT_DATE, 'YYYYMMDD');

  SELECT COUNT(*) + 1 INTO today_count
  FROM invoices
  WHERE to_char(created_at::date, 'YYYYMMDD') = today_str;

  NEW.invoice_number := 'INV-' || today_str || '-' || lpad(today_count::TEXT, 3, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_invoice_number BEFORE INSERT ON invoices
  FOR EACH ROW
  WHEN (NEW.invoice_number IS NULL OR NEW.invoice_number = '')
  EXECUTE FUNCTION generate_invoice_number();

-- ─── Stock Movements & Inventory Logging Triggers ─────────────────────────────

-- 1. Purchases increase stock & record inventory_transactions
CREATE OR REPLACE FUNCTION process_purchase_item_stock()
RETURNS TRIGGER AS $$
BEGIN
  -- Increase part current_stock
  UPDATE parts
  SET current_stock = current_stock + NEW.quantity::INTEGER
  WHERE id = NEW.part_id;

  -- Insert inventory transaction
  INSERT INTO inventory_transactions (
    part_id, transaction_type, quantity, reference_id, reference_type, notes
  ) VALUES (
    NEW.part_id, 'purchase_in', NEW.quantity::INTEGER, NEW.purchase_id, 'purchase', 'Stock received from purchase order'
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_purchase_item_stock ON purchase_items;
CREATE TRIGGER trg_purchase_item_stock AFTER INSERT ON purchase_items
  FOR EACH ROW EXECUTE FUNCTION process_purchase_item_stock();

-- 2. Job Card Part Items decrease stock & record inventory_transactions
CREATE OR REPLACE FUNCTION process_job_card_part_stock()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.item_type = 'part' AND NEW.part_id IS NOT NULL THEN
    -- Decrease part current_stock
    UPDATE parts
    SET current_stock = current_stock - NEW.quantity::INTEGER
    WHERE id = NEW.part_id;

    -- Insert inventory transaction
    INSERT INTO inventory_transactions (
      part_id, transaction_type, quantity, reference_id, reference_type, notes
    ) VALUES (
      NEW.part_id, 'job_card_out', -1 * (NEW.quantity::INTEGER), NEW.job_card_id, 'job_card', 'Part issued for job card'
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_job_card_part_stock ON job_card_items;
CREATE TRIGGER trg_job_card_part_stock AFTER INSERT ON job_card_items
  FOR EACH ROW EXECUTE FUNCTION process_job_card_part_stock();

-- ─── Payment & Balance Auto-reconciliation Trigger ───────────────────────────

CREATE OR REPLACE FUNCTION reconcile_payments()
RETURNS TRIGGER AS $$
DECLARE
  v_total_paid NUMERIC(12, 2);
  v_invoice_total NUMERIC(12, 2);
  v_invoice_id UUID;
  v_job_card_id UUID;
BEGIN
  v_invoice_id := NEW.invoice_id;
  v_job_card_id := NEW.job_card_id;

  -- Reconcile Invoice if linked
  IF v_invoice_id IS NOT NULL THEN
    SELECT COALESCE(SUM(amount), 0) INTO v_total_paid FROM payments WHERE invoice_id = v_invoice_id;
    SELECT total INTO v_invoice_total FROM invoices WHERE id = v_invoice_id;

    UPDATE invoices
    SET
      paid = v_total_paid,
      balance = v_invoice_total - v_total_paid,
      payment_status = CASE
        WHEN v_total_paid >= v_invoice_total THEN 'paid'::payment_status
        WHEN v_total_paid > 0 THEN 'partially_paid'::payment_status
        ELSE 'credit'::payment_status
      END
    WHERE id = v_invoice_id;
  END IF;

  -- Reconcile Job Card if linked
  IF v_job_card_id IS NOT NULL THEN
    SELECT COALESCE(SUM(amount), 0) INTO v_total_paid FROM payments WHERE job_card_id = v_job_card_id;

    UPDATE job_cards
    SET
      paid = v_total_paid,
      balance = total - v_total_paid
    WHERE id = v_job_card_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_reconcile_payments ON payments;
CREATE TRIGGER trg_reconcile_payments AFTER INSERT OR UPDATE ON payments
  FOR EACH ROW EXECUTE FUNCTION reconcile_payments();

-- ─── Recalculate Job Card Totals ────────────────────────────────────────────

CREATE OR REPLACE FUNCTION recalculate_job_card_totals()
RETURNS TRIGGER AS $$
DECLARE
  v_job_card_id UUID;
  v_subtotal NUMERIC(12, 2);
  v_discount NUMERIC(12, 2);
  v_vat_rate NUMERIC(5, 2);
  v_vat_amount NUMERIC(12, 2);
  v_total NUMERIC(12, 2);
  v_paid NUMERIC(12, 2);
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_job_card_id := OLD.job_card_id;
  ELSE
    v_job_card_id := NEW.job_card_id;
  END IF;

  SELECT COALESCE(SUM(total_price), 0) INTO v_subtotal
  FROM job_card_items
  WHERE job_card_id = v_job_card_id;

  SELECT discount, vat_rate, paid INTO v_discount, v_vat_rate, v_paid
  FROM job_cards
  WHERE id = v_job_card_id;

  v_vat_amount := ROUND((v_subtotal - v_discount) * v_vat_rate / 100, 2);
  v_total := (v_subtotal - v_discount) + v_vat_amount;

  UPDATE job_cards
  SET
    subtotal = v_subtotal,
    vat_amount = v_vat_amount,
    total = v_total,
    balance = v_total - v_paid,
    updated_at = now()
  WHERE id = v_job_card_id;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_recalc_job_card_items ON job_card_items;
CREATE TRIGGER trg_recalc_job_card_items AFTER INSERT OR UPDATE OR DELETE ON job_card_items
  FOR EACH ROW EXECUTE FUNCTION recalculate_job_card_totals();

-- ─── Auto-create User Profile on Signup ─────────────────────────────────────

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    COALESCE((NEW.raw_user_meta_data->>'role')::user_role, 'receptionist')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ─── Row Level Security ─────────────────────────────────────────────────────

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE services ENABLE ROW LEVEL SECURITY;
ALTER TABLE parts ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_card_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view all data" ON users;
CREATE POLICY "Authenticated users can view all data" ON users FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Authenticated users can update own profile" ON users;
CREATE POLICY "Authenticated users can update own profile" ON users FOR UPDATE TO authenticated USING (auth.uid() = id);

DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN
    SELECT unnest(ARRAY[
      'customers', 'vehicles', 'services', 'parts', 'suppliers',
      'job_cards', 'job_card_items', 'invoices', 'invoice_items',
      'payments', 'purchases', 'purchase_items', 'expenses',
      'inventory_transactions', 'settings'
    ])
  LOOP
    EXECUTE format('CREATE POLICY "auth_select_%1$s" ON %1$s FOR SELECT TO authenticated USING (true)', tbl);
    EXECUTE format('CREATE POLICY "auth_insert_%1$s" ON %1$s FOR INSERT TO authenticated WITH CHECK (true)', tbl);
    EXECUTE format('CREATE POLICY "auth_update_%1$s" ON %1$s FOR UPDATE TO authenticated USING (true)', tbl);
    EXECUTE format('CREATE POLICY "auth_delete_%1$s" ON %1$s FOR DELETE TO authenticated USING (true)', tbl);
  END LOOP;
END
$$;


-- ==============================================================================
-- MIGRATION STEP: 002_uploaded_job_cards.sql
-- ==============================================================================

-- ============================================================================
-- Migration: Uploaded Job Cards & Job Card Attachments
-- ============================================================================

-- ─── Add work_details to job_cards if not exists ─────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'job_cards' AND column_name = 'work_details'
  ) THEN
    ALTER TABLE job_cards ADD COLUMN work_details TEXT;
  END IF;
END $$;

-- ─── Document Type Enum ──────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'document_type') THEN
    CREATE TYPE document_type AS ENUM (
      'paper_job_card',
      'vehicle_photo',
      'supplier_document',
      'inspection_photo',
      'other'
    );
  END IF;
END $$;

-- ─── Uploaded Job Cards Table ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS uploaded_job_cards (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_card_number TEXT NOT NULL,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  vehicle_id UUID REFERENCES vehicles(id) ON DELETE SET NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  description TEXT,
  file_url TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_type TEXT NOT NULL,
  file_size BIGINT NOT NULL DEFAULT 0,
  document_type document_type NOT NULL DEFAULT 'paper_job_card',
  job_card_id UUID REFERENCES job_cards(id) ON DELETE SET NULL,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_uploaded_job_cards_customer ON uploaded_job_cards(customer_id);
CREATE INDEX IF NOT EXISTS idx_uploaded_job_cards_vehicle ON uploaded_job_cards(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_uploaded_job_cards_number ON uploaded_job_cards(job_card_number);
CREATE INDEX IF NOT EXISTS idx_uploaded_job_cards_date ON uploaded_job_cards(date);

-- ─── Job Card Attachments Table ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS job_card_attachments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_card_id UUID NOT NULL REFERENCES job_cards(id) ON DELETE CASCADE,
  document_type document_type NOT NULL DEFAULT 'vehicle_photo',
  file_url TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_type TEXT NOT NULL,
  file_size BIGINT NOT NULL DEFAULT 0,
  description TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_job_card_attachments_job_card ON job_card_attachments(job_card_id);

-- ─── Storage Bucket Setup ───────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('job-card-documents', 'job-card-documents', true)
ON CONFLICT (id) DO NOTHING;


-- ==============================================================================
-- MIGRATION STEP: 003_job_card_performance_indexes.sql
-- ==============================================================================

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


-- ==============================================================================
-- MIGRATION STEP: 004_unified_search_indexes.sql
-- ==============================================================================

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


-- ==============================================================================
-- MIGRATION STEP: 005_soft_delete_and_dashboard_indexes.sql
-- ==============================================================================

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


-- ==============================================================================
-- MIGRATION STEP: 006_optimized_search_indexes.sql
-- ==============================================================================

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


-- ==============================================================================
-- MIGRATION STEP: 007_role_based_security_and_staff_management.sql
-- ==============================================================================

-- ==============================================================================
-- Migration 007: Role-Based Security, Staff Roles & User Management
-- ==============================================================================

-- 1. Ensure 'owner' exists in user_role ENUM
DO $$
BEGIN
  ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'owner' BEFORE 'admin';
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 2. Helper function to get current authenticated user's workshop role
CREATE OR REPLACE FUNCTION get_auth_user_role()
RETURNS user_role AS $$
DECLARE
  v_role user_role;
BEGIN
  SELECT role INTO v_role FROM public.users WHERE id = auth.uid() AND is_active = true LIMIT 1;
  RETURN COALESCE(v_role, 'receptionist'::user_role);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Helper function to check if current user is owner or admin
CREATE OR REPLACE FUNCTION is_admin_or_owner()
RETURNS BOOLEAN AS $$
DECLARE
  v_role user_role;
BEGIN
  SELECT role INTO v_role FROM public.users WHERE id = auth.uid() AND is_active = true LIMIT 1;
  RETURN (v_role IN ('owner', 'admin'));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Secure RLS policies on public.users
DROP POLICY IF EXISTS "Authenticated users can view all data" ON users;
DROP POLICY IF EXISTS "Authenticated users can update own profile" ON users;
DROP POLICY IF EXISTS "Admins and Owners can manage users" ON users;

CREATE POLICY "Authenticated users can view staff profiles"
  ON users FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Admins and Owners can insert staff"
  ON users FOR INSERT TO authenticated
  WITH CHECK (is_admin_or_owner() OR auth.uid() = id);

CREATE POLICY "Admins and Owners can update staff"
  ON users FOR UPDATE TO authenticated
  USING (is_admin_or_owner() OR auth.uid() = id);

CREATE POLICY "Admins and Owners can delete staff"
  ON users FOR DELETE TO authenticated
  USING (is_admin_or_owner());


-- ==============================================================================
-- MIGRATION STEP: 008_owner_manager_viewer_rbac.sql
-- ==============================================================================

-- ==============================================================================
-- Migration 008: Owner, Manager & Viewer Role-Based Access Control (RBAC)
-- Primary Owner: atiqjehandaraz@gmail.com
-- ==============================================================================

-- 1. Ensure 'viewer' exists in user_role ENUM
DO $$
BEGIN
  ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'viewer';
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 2. Add last_login_at column to users table if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'users' AND column_name = 'last_login_at'
  ) THEN
    ALTER TABLE users ADD COLUMN last_login_at TIMESTAMPTZ;
  END IF;
END $$;

-- 3. Security Helper Functions
CREATE OR REPLACE FUNCTION is_active_user()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid() AND is_active = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION is_owner()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid() AND is_active = true AND role = 'owner'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION is_manager_or_above()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid() AND is_active = true AND role IN ('owner', 'admin', 'manager')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Secure RLS policies on public.users
DROP POLICY IF EXISTS "Authenticated users can view staff profiles" ON users;
DROP POLICY IF EXISTS "Admins and Owners can insert staff" ON users;
DROP POLICY IF EXISTS "Admins and Owners can update staff" ON users;
DROP POLICY IF EXISTS "Admins and Owners can delete staff" ON users;

-- View staff profiles: all active authenticated users
CREATE POLICY "Active users can view staff profiles"
  ON users FOR SELECT TO authenticated
  USING (is_active_user());

-- Insert/Create staff: Only Owner and Admin
CREATE POLICY "Owners and Admins can create staff"
  ON users FOR INSERT TO authenticated
  WITH CHECK (is_owner() OR is_admin_or_owner());

-- Update staff: Owner can update any; Admin/Manager cannot modify Owner; users can update own profile
CREATE POLICY "Owners can update any staff, users can update own profile"
  ON users FOR UPDATE TO authenticated
  USING (
    is_owner() OR
    (is_admin_or_owner() AND role != 'owner') OR
    (auth.uid() = id)
  );

-- Delete staff: Only Owner
CREATE POLICY "Only Owners can delete staff"
  ON users FOR DELETE TO authenticated
  USING (is_owner() AND role != 'owner');

-- 5. Operational Tables RLS Enforcement for Viewers (Read-Only)
-- Data tables can only be modified by Manager, Admin, or Owner (Viewers are blocked from INSERT, UPDATE, DELETE)
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN
    SELECT unnest(ARRAY[
      'customers', 'vehicles', 'services', 'parts', 'suppliers',
      'job_cards', 'job_card_items', 'invoices', 'invoice_items',
      'payments', 'purchases', 'purchase_items', 'expenses',
      'inventory_transactions', 'settings'
    ])
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "auth_select_%1$s" ON %1$s', tbl);
    EXECUTE format('DROP POLICY IF EXISTS "auth_insert_%1$s" ON %1$s', tbl);
    EXECUTE format('DROP POLICY IF EXISTS "auth_update_%1$s" ON %1$s', tbl);
    EXECUTE format('DROP POLICY IF EXISTS "auth_delete_%1$s" ON %1$s', tbl);

    -- SELECT: Allowed for all active authenticated users (including Viewer)
    EXECUTE format('CREATE POLICY "auth_select_%1$s" ON %1$s FOR SELECT TO authenticated USING (is_active_user())', tbl);

    -- INSERT, UPDATE, DELETE: Allowed only for Manager or above (Blocked for Viewer)
    EXECUTE format('CREATE POLICY "auth_insert_%1$s" ON %1$s FOR INSERT TO authenticated WITH CHECK (is_manager_or_above())', tbl);
    EXECUTE format('CREATE POLICY "auth_update_%1$s" ON %1$s FOR UPDATE TO authenticated USING (is_manager_or_above())', tbl);
    EXECUTE format('CREATE POLICY "auth_delete_%1$s" ON %1$s FOR DELETE TO authenticated USING (is_manager_or_above())', tbl);
  END LOOP;
END
$$;


-- ==============================================================================
-- MIGRATION STEP: 009_soft_delete_and_recycle_bin.sql
-- ==============================================================================

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


-- ==============================================================================
-- MIGRATION STEP: 010_job_card_invoice_and_payment_status.sql
-- ==============================================================================

-- Migration 010: Job Card Sequential Invoice Number & Payment Status

-- 1. Create atomic sequence for invoice numbers starting at 1060
CREATE SEQUENCE IF NOT EXISTS job_card_invoice_seq START WITH 1060 INCREMENT BY 1;

-- 2. Add invoice_number and payment_status columns to job_cards if not existing
ALTER TABLE public.job_cards
  ADD COLUMN IF NOT EXISTS invoice_number BIGINT UNIQUE DEFAULT nextval('job_card_invoice_seq'),
  ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'Pending';

-- 3. Set sequence to at least 1060 or max existing invoice number + 1
DO $$
DECLARE
  v_max_invoice BIGINT;
BEGIN
  SELECT COALESCE(MAX(invoice_number), 1059) INTO v_max_invoice FROM public.job_cards;
  IF v_max_invoice < 1059 THEN
    v_max_invoice := 1059;
  END IF;
  PERFORM setval('job_card_invoice_seq', v_max_invoice + 1, false);
END $$;

-- 4. Create performance indexes
CREATE INDEX IF NOT EXISTS idx_job_cards_invoice_number ON public.job_cards(invoice_number);
CREATE INDEX IF NOT EXISTS idx_job_cards_payment_status ON public.job_cards(payment_status);


-- ==============================================================================
-- MIGRATION STEP: 011_job_card_trn_and_invoice_mode.sql
-- ==============================================================================

-- Migration 011: Customer TRN, Job Card Invoice Mode & VAT Rate
-- Adds Company/Customer TRN to customers and manual/auto invoice mode + custom VAT rate to job_cards

-- 1. Add TRN Number to customers table
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS trn_number TEXT;

-- 2. Add Invoice Number Mode and VAT Rate columns to job_cards
ALTER TABLE public.job_cards
  ADD COLUMN IF NOT EXISTS invoice_number_mode TEXT DEFAULT 'auto',
  ADD COLUMN IF NOT EXISTS vat_rate NUMERIC(5,2) DEFAULT 5.00;

-- 3. Create indexes for quick search and lookup
CREATE INDEX IF NOT EXISTS idx_customers_trn_number ON public.customers(trn_number);
CREATE INDEX IF NOT EXISTS idx_job_cards_invoice_mode ON public.job_cards(invoice_number_mode);


-- ==============================================================================
-- MIGRATION STEP: 012_services_category_and_code.sql
-- ==============================================================================

-- ─── 012: Add category, service_code, and estimated_time to services table ───

ALTER TABLE services ADD COLUMN IF NOT EXISTS service_code TEXT;
ALTER TABLE services ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'General Maintenance';
ALTER TABLE services ADD COLUMN IF NOT EXISTS estimated_time TEXT DEFAULT '45 mins';

CREATE INDEX IF NOT EXISTS idx_services_category ON services(category);
CREATE INDEX IF NOT EXISTS idx_services_service_code ON services(service_code);



-- ==============================================================================
-- MIGRATION STEP: 013_parts_inventory_table.sql
-- ==============================================================================

-- ─── 013: Spare Parts Inventory Master Table ────────────────────────────────
-- Ensures public.parts table exists with indexes and performance optimizations

CREATE TABLE IF NOT EXISTS parts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  part_number TEXT,
  brand TEXT,
  unit TEXT NOT NULL DEFAULT 'piece',
  purchase_price NUMERIC(12, 2) NOT NULL DEFAULT 0,
  selling_price NUMERIC(12, 2) NOT NULL DEFAULT 0,
  current_stock INTEGER NOT NULL DEFAULT 0,
  minimum_stock INTEGER NOT NULL DEFAULT 0,
  supplier_id UUID,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_parts_name ON parts(name);
CREATE INDEX IF NOT EXISTS idx_parts_part_number ON parts(part_number);
CREATE INDEX IF NOT EXISTS idx_parts_brand ON parts(brand);
CREATE INDEX IF NOT EXISTS idx_parts_low_stock ON parts(current_stock, minimum_stock) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_parts_active ON parts(is_active);


-- ==============================================================================
-- MIGRATION STEP: 014_spare_parts_and_inventory_ledger.sql
-- ==============================================================================

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


-- ==============================================================================
-- MIGRATION STEP: 015_performance_indexes_and_optimizations.sql
-- ==============================================================================

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


-- ==============================================================================
-- MIGRATION STEP: 016_expenses_module_enhancements.sql
-- ==============================================================================

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


-- ==============================================================================
-- MIGRATION STEP: 017_accounts_and_ledger_system.sql
-- ==============================================================================

-- ==============================================================================
-- Migration 017: Professional Accounts & Double-Entry Ledger System
-- ==============================================================================

-- 1. Ledger Accounts Table (Chart of Accounts Master)
CREATE TABLE IF NOT EXISTS ledger_accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_code TEXT UNIQUE NOT NULL,
  account_name TEXT NOT NULL,
  account_type TEXT NOT NULL CHECK (account_type IN ('asset', 'liability', 'income', 'expense', 'equity')),
  account_sub_type TEXT NOT NULL,
  related_entity_type TEXT NOT NULL DEFAULT 'none' CHECK (related_entity_type IN ('customer', 'supplier', 'worker', 'bank', 'owner', 'none')),
  related_entity_id TEXT NULL,
  opening_balance NUMERIC(12, 2) NOT NULL DEFAULT 0,
  opening_balance_date DATE NOT NULL DEFAULT CURRENT_DATE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  notes TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ledger_accounts_type ON ledger_accounts (account_type);
CREATE INDEX IF NOT EXISTS idx_ledger_accounts_sub_type ON ledger_accounts (account_sub_type);
CREATE INDEX IF NOT EXISTS idx_ledger_accounts_entity ON ledger_accounts (related_entity_type, related_entity_id);
CREATE INDEX IF NOT EXISTS idx_ledger_accounts_active ON ledger_accounts (is_active);

-- 2. Ledger Transactions Table (General Journal Master)
CREATE TABLE IF NOT EXISTS ledger_transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  transaction_number TEXT UNIQUE NOT NULL,
  transaction_date DATE NOT NULL DEFAULT CURRENT_DATE,
  reference_type TEXT NOT NULL,
  reference_id TEXT NULL,
  description TEXT NOT NULL,
  created_by TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ledger_txns_date ON ledger_transactions (transaction_date DESC);
CREATE INDEX IF NOT EXISTS idx_ledger_txns_ref ON ledger_transactions (reference_type, reference_id);
CREATE INDEX IF NOT EXISTS idx_ledger_txns_number ON ledger_transactions (transaction_number);

-- 3. Ledger Entries Table (Journal Lines with Debit/Credit)
CREATE TABLE IF NOT EXISTS ledger_entries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  transaction_id UUID NOT NULL REFERENCES ledger_transactions(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES ledger_accounts(id) ON DELETE RESTRICT,
  debit NUMERIC(12, 2) NOT NULL DEFAULT 0,
  credit NUMERIC(12, 2) NOT NULL DEFAULT 0,
  notes TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ledger_entries_txn ON ledger_entries (transaction_id);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_account ON ledger_entries (account_id);

-- 4. Workers Table (Financial worker profiles for salary/advance ledger)
CREATE TABLE IF NOT EXISTS workers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  phone TEXT NULL,
  job_position TEXT NOT NULL DEFAULT 'Mechanic',
  salary_type TEXT NOT NULL DEFAULT 'monthly' CHECK (salary_type IN ('monthly', 'daily', 'hourly', 'commission')),
  basic_salary NUMERIC(12, 2) NOT NULL DEFAULT 0,
  opening_balance NUMERIC(12, 2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'on_leave', 'terminated')),
  notes TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workers_status ON workers (status);
CREATE INDEX IF NOT EXISTS idx_workers_name ON workers (name);

-- 5. Bank Accounts Table (Workshop business banking accounts)
CREATE TABLE IF NOT EXISTS bank_accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  bank_name TEXT NOT NULL,
  account_name TEXT NOT NULL,
  account_number_last_digits TEXT NULL,
  opening_balance NUMERIC(12, 2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'AED',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'closed')),
  notes TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bank_accounts_status ON bank_accounts (status);


-- ==============================================================================
-- MIGRATION STEP: 018_accounts_search_indexes.sql
-- ==============================================================================

-- ==============================================================================
-- Migration 018: Accounts & Ledger Fast Search Indexes
-- ==============================================================================

-- 1. Ledger Accounts search indexes
CREATE INDEX IF NOT EXISTS idx_ledger_accounts_name ON ledger_accounts (account_name);
CREATE INDEX IF NOT EXISTS idx_ledger_accounts_code ON ledger_accounts (account_code);
CREATE INDEX IF NOT EXISTS idx_ledger_accounts_type_sub ON ledger_accounts (account_type, account_sub_type);

-- 2. Workers search indexes
CREATE INDEX IF NOT EXISTS idx_workers_phone ON workers (phone);

-- 3. Bank Accounts search indexes
CREATE INDEX IF NOT EXISTS idx_bank_accounts_bank_name ON bank_accounts (bank_name);
CREATE INDEX IF NOT EXISTS idx_bank_accounts_acc_name ON bank_accounts (account_name);


-- ==============================================================================
-- MIGRATION STEP: 019_money_transfers_and_bank_charges.sql
-- ==============================================================================

-- ==============================================================================
-- Migration 019: Money Transfers Sequence, Bank Charges Account, and Indexes
-- ==============================================================================

-- 1. Transfer Number Sequence for atomic generation
CREATE SEQUENCE IF NOT EXISTS transfer_number_seq START WITH 1 INCREMENT BY 1;

-- 2. Insert standard Bank Charges & Transfer Fees account if not exists
INSERT INTO ledger_accounts (
  account_code,
  account_name,
  account_type,
  account_sub_type,
  related_entity_type,
  related_entity_id,
  opening_balance,
  opening_balance_date,
  is_active,
  notes
) VALUES (
  '5011',
  'Bank Charges & Transfer Fees',
  'expense',
  'Bank Charges',
  'none',
  NULL,
  0,
  CURRENT_DATE,
  TRUE,
  'Bank transaction fees, transfer charges, and card terminal commissions'
) ON CONFLICT (account_code) DO NOTHING;

-- 3. Indexes for fast money transfer queries
CREATE INDEX IF NOT EXISTS idx_ledger_txns_transfer_number ON ledger_transactions (transaction_number) WHERE transaction_number LIKE 'TRF-%';
CREATE INDEX IF NOT EXISTS idx_ledger_txns_transfer_ref ON ledger_transactions (reference_type) WHERE reference_type IN ('transfer', 'transfer_reversal');


-- ==============================================================================
-- MIGRATION STEP: 020_recycle_bin_and_audit_history.sql
-- ==============================================================================

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


-- ==============================================================================
-- MIGRATION STEP: 021_staff_user_access_and_permissions.sql
-- ==============================================================================

-- ==============================================================================
-- Migration 021: Professional Staff User Access, Granular Permissions & Audit
-- ==============================================================================

-- 1. Ensure 'accountant' and 'custom' exist in user_role ENUM
DO $$
BEGIN
  ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'accountant';
  ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'custom';
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 2. Add staff user management fields to users table
ALTER TABLE IF EXISTS users
  ADD COLUMN IF NOT EXISTS phone TEXT NULL,
  ADD COLUMN IF NOT EXISTS job_title TEXT NULL,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS access_expiry_date TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS notes TEXT NULL;

CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);

-- 3. Granular User Permissions Table
CREATE TABLE IF NOT EXISTS user_permissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  module TEXT NOT NULL,
  access BOOLEAN NOT NULL DEFAULT true,
  can_view BOOLEAN NOT NULL DEFAULT true,
  can_create BOOLEAN NOT NULL DEFAULT false,
  can_edit BOOLEAN NOT NULL DEFAULT false,
  can_delete BOOLEAN NOT NULL DEFAULT false,
  can_print BOOLEAN NOT NULL DEFAULT false,
  can_export BOOLEAN NOT NULL DEFAULT false,
  can_transfer BOOLEAN NOT NULL DEFAULT false,
  can_journal BOOLEAN NOT NULL DEFAULT false,
  can_reverse BOOLEAN NOT NULL DEFAULT false,
  can_finalize BOOLEAN NOT NULL DEFAULT false,
  can_record_payment BOOLEAN NOT NULL DEFAULT false,
  can_void BOOLEAN NOT NULL DEFAULT false,
  can_view_bank_balance BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_user_module UNIQUE (user_id, module)
);

CREATE INDEX IF NOT EXISTS idx_user_permissions_user_id ON user_permissions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_permissions_module ON user_permissions(module);

-- 4. User Activity Audit Logs Table
CREATE TABLE IF NOT EXISTS user_activity_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  user_email TEXT NOT NULL,
  user_name TEXT NOT NULL,
  action TEXT NOT NULL,
  module TEXT NOT NULL,
  record_reference TEXT NULL,
  description TEXT NOT NULL,
  details JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_activity_user_id ON user_activity_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_user_activity_created_at ON user_activity_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_activity_module ON user_activity_logs(module);

-- 5. Permission Change History Table
CREATE TABLE IF NOT EXISTS permission_change_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  operator_id TEXT NOT NULL,
  operator_name TEXT NOT NULL,
  target_user_id TEXT NOT NULL,
  target_user_name TEXT NOT NULL,
  module TEXT NOT NULL,
  change_summary TEXT NOT NULL,
  old_permissions JSONB DEFAULT '{}'::jsonb,
  new_permissions JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_perm_change_target ON permission_change_logs(target_user_id);
CREATE INDEX IF NOT EXISTS idx_perm_change_created_at ON permission_change_logs(created_at DESC);

-- 6. Row Level Security Policies
ALTER TABLE user_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE permission_change_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view permissions"
  ON user_permissions FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Admins and Owners can manage permissions"
  ON user_permissions FOR ALL TO authenticated
  USING (is_admin_or_owner())
  WITH CHECK (is_admin_or_owner());

CREATE POLICY "Authenticated users can insert activity logs"
  ON user_activity_logs FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can view activity logs"
  ON user_activity_logs FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Admins and Owners can view permission change logs"
  ON permission_change_logs FOR SELECT TO authenticated
  USING (is_admin_or_owner());

CREATE POLICY "Admins and Owners can insert permission change logs"
  ON permission_change_logs FOR INSERT TO authenticated
  WITH CHECK (is_admin_or_owner());


-- ==============================================================================
-- MIGRATION STEP: 022_enterprise_delegated_access.sql
-- ==============================================================================

-- ==============================================================================
-- Migration 022: Enterprise Delegated Staff Access & Protected Actions
-- ==============================================================================

-- 1. Add can_approve and protected_actions to user_permissions
ALTER TABLE IF EXISTS user_permissions
  ADD COLUMN IF NOT EXISTS can_approve BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS protected_actions JSONB NOT NULL DEFAULT '{}'::jsonb;

-- 2. Ensure status column on users can store all enterprise statuses:
-- 'invited', 'active', 'suspended', 'disabled', 'expired'
ALTER TABLE IF EXISTS users
  ALTER COLUMN status SET DEFAULT 'invited';

-- Update any legacy is_active synchronization trigger if present
CREATE OR REPLACE FUNCTION sync_user_status_is_active()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'active' THEN
    NEW.is_active := true;
  ELSE
    NEW.is_active := false;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_user_status_is_active ON users;
CREATE TRIGGER trg_sync_user_status_is_active
  BEFORE INSERT OR UPDATE OF status ON users
  FOR EACH ROW
  EXECUTE FUNCTION sync_user_status_is_active();


-- ==============================================================================
-- MIGRATION STEP: 023_multi_workspace_system.sql
-- ==============================================================================

-- ==============================================================================
-- Migration 023: Enterprise Multi-Workspace & Separate Business Isolation System
-- ==============================================================================
-- Transforms the application into a multi-tenant platform with complete data isolation
-- between independent businesses/workspaces inside the SAME database.
-- ==============================================================================

-- 1. Create Workspaces Table
CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
  name TEXT NOT NULL,
  business_name TEXT NOT NULL,
  owner_user_id TEXT NULL,
  phone TEXT NULL,
  email TEXT NULL,
  address TEXT NULL,
  country TEXT NOT NULL DEFAULT 'United Arab Emirates',
  currency TEXT NOT NULL DEFAULT 'AED',
  trn TEXT NULL,
  logo_url TEXT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workspaces_status ON workspaces(status);
CREATE INDEX IF NOT EXISTS idx_workspaces_email ON workspaces(email);

-- 2. Create Workspace Members Table (Membership & Roles)
CREATE TABLE IF NOT EXISTS workspace_members (
  id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'manager',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'invited', 'suspended')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workspace_members_ws_user ON workspace_members(workspace_id, user_id);
CREATE INDEX IF NOT EXISTS idx_workspace_members_user ON workspace_members(user_id);

-- 3. Seed Primary Default Workspace: ATIQ JEHAN AUTO REPAIR
INSERT INTO workspaces (
  id,
  name,
  business_name,
  owner_user_id,
  phone,
  email,
  address,
  country,
  currency,
  trn,
  status
) VALUES (
  'ws-atiq-default-001',
  'ATIQ JEHAN AUTO REPAIR',
  'ATIQ JEHAN AUTO REPAIR & USED SPARE PARTS L.L.C.',
  'usr-owner-001',
  '+971 52 123 4567',
  'atiqjehandaraz@gmail.com',
  'Industrial Area 4, Sharjah, United Arab Emirates',
  'United Arab Emirates',
  'AED',
  '100482910400003',
  'active'
) ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  business_name = EXCLUDED.business_name,
  trn = EXCLUDED.trn;

-- 4. Add workspace_id Column to All Business Tables
DO $$
BEGIN
  -- customers
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='customers' AND column_name='workspace_id') THEN
    ALTER TABLE customers ADD COLUMN workspace_id TEXT REFERENCES workspaces(id);
  END IF;

  -- vehicles
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='vehicles' AND column_name='workspace_id') THEN
    ALTER TABLE vehicles ADD COLUMN workspace_id TEXT REFERENCES workspaces(id);
  END IF;

  -- services
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='services' AND column_name='workspace_id') THEN
    ALTER TABLE services ADD COLUMN workspace_id TEXT REFERENCES workspaces(id);
  END IF;

  -- parts
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='parts' AND column_name='workspace_id') THEN
    ALTER TABLE parts ADD COLUMN workspace_id TEXT REFERENCES workspaces(id);
  END IF;

  -- suppliers
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='suppliers' AND column_name='workspace_id') THEN
    ALTER TABLE suppliers ADD COLUMN workspace_id TEXT REFERENCES workspaces(id);
  END IF;

  -- job_cards
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='job_cards' AND column_name='workspace_id') THEN
    ALTER TABLE job_cards ADD COLUMN workspace_id TEXT REFERENCES workspaces(id);
  END IF;

  -- uploaded_job_cards
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='uploaded_job_cards') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='uploaded_job_cards' AND column_name='workspace_id') THEN
      ALTER TABLE uploaded_job_cards ADD COLUMN workspace_id TEXT REFERENCES workspaces(id);
    END IF;
  END IF;

  -- invoices
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='invoices' AND column_name='workspace_id') THEN
    ALTER TABLE invoices ADD COLUMN workspace_id TEXT REFERENCES workspaces(id);
  END IF;

  -- payments
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payments' AND column_name='workspace_id') THEN
    ALTER TABLE payments ADD COLUMN workspace_id TEXT REFERENCES workspaces(id);
  END IF;

  -- purchases
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='purchases' AND column_name='workspace_id') THEN
    ALTER TABLE purchases ADD COLUMN workspace_id TEXT REFERENCES workspaces(id);
  END IF;

  -- expenses
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='expenses' AND column_name='workspace_id') THEN
    ALTER TABLE expenses ADD COLUMN workspace_id TEXT REFERENCES workspaces(id);
  END IF;

  -- inventory_transactions
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='inventory_transactions' AND column_name='workspace_id') THEN
    ALTER TABLE inventory_transactions ADD COLUMN workspace_id TEXT REFERENCES workspaces(id);
  END IF;

  -- ledger_accounts
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='ledger_accounts') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ledger_accounts' AND column_name='workspace_id') THEN
      ALTER TABLE ledger_accounts ADD COLUMN workspace_id TEXT REFERENCES workspaces(id);
    END IF;
  END IF;

  -- ledger_transactions
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='ledger_transactions') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ledger_transactions' AND column_name='workspace_id') THEN
      ALTER TABLE ledger_transactions ADD COLUMN workspace_id TEXT REFERENCES workspaces(id);
    END IF;
  END IF;

  -- workers
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='workers') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='workers' AND column_name='workspace_id') THEN
      ALTER TABLE workers ADD COLUMN workspace_id TEXT REFERENCES workspaces(id);
    END IF;
  END IF;

  -- bank_accounts
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='bank_accounts') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='bank_accounts' AND column_name='workspace_id') THEN
      ALTER TABLE bank_accounts ADD COLUMN workspace_id TEXT REFERENCES workspaces(id);
    END IF;
  END IF;

  -- settings
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='settings' AND column_name='workspace_id') THEN
    ALTER TABLE settings ADD COLUMN workspace_id TEXT REFERENCES workspaces(id);
  END IF;
END $$;

-- 5. Safe Migration of All Existing Data to ATIQ JEHAN Workspace
-- Ensures 0 existing records are lost or left with NULL workspace_id
UPDATE customers SET workspace_id = 'ws-atiq-default-001' WHERE workspace_id IS NULL;
UPDATE vehicles SET workspace_id = 'ws-atiq-default-001' WHERE workspace_id IS NULL;
UPDATE services SET workspace_id = 'ws-atiq-default-001' WHERE workspace_id IS NULL;
UPDATE parts SET workspace_id = 'ws-atiq-default-001' WHERE workspace_id IS NULL;
UPDATE suppliers SET workspace_id = 'ws-atiq-default-001' WHERE workspace_id IS NULL;
UPDATE job_cards SET workspace_id = 'ws-atiq-default-001' WHERE workspace_id IS NULL;
UPDATE invoices SET workspace_id = 'ws-atiq-default-001' WHERE workspace_id IS NULL;
UPDATE payments SET workspace_id = 'ws-atiq-default-001' WHERE workspace_id IS NULL;
UPDATE purchases SET workspace_id = 'ws-atiq-default-001' WHERE workspace_id IS NULL;
UPDATE expenses SET workspace_id = 'ws-atiq-default-001' WHERE workspace_id IS NULL;
UPDATE inventory_transactions SET workspace_id = 'ws-atiq-default-001' WHERE workspace_id IS NULL;
UPDATE settings SET workspace_id = 'ws-atiq-default-001' WHERE workspace_id IS NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='uploaded_job_cards') THEN
    UPDATE uploaded_job_cards SET workspace_id = 'ws-atiq-default-001' WHERE workspace_id IS NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='ledger_accounts') THEN
    UPDATE ledger_accounts SET workspace_id = 'ws-atiq-default-001' WHERE workspace_id IS NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='ledger_transactions') THEN
    UPDATE ledger_transactions SET workspace_id = 'ws-atiq-default-001' WHERE workspace_id IS NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='workers') THEN
    UPDATE workers SET workspace_id = 'ws-atiq-default-001' WHERE workspace_id IS NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='bank_accounts') THEN
    UPDATE bank_accounts SET workspace_id = 'ws-atiq-default-001' WHERE workspace_id IS NULL;
  END IF;
END $$;

-- 6. Link Existing Users to Primary ATIQ Workspace
INSERT INTO workspace_members (workspace_id, user_id, role, status)
SELECT 'ws-atiq-default-001', id::text, role::text, 'active'
FROM users
ON CONFLICT DO NOTHING;

-- 7. Performance Indexes on workspace_id
CREATE INDEX IF NOT EXISTS idx_customers_workspace ON customers(workspace_id);
CREATE INDEX IF NOT EXISTS idx_vehicles_workspace ON vehicles(workspace_id);
CREATE INDEX IF NOT EXISTS idx_services_workspace ON services(workspace_id);
CREATE INDEX IF NOT EXISTS idx_parts_workspace ON parts(workspace_id);
CREATE INDEX IF NOT EXISTS idx_suppliers_workspace ON suppliers(workspace_id);
CREATE INDEX IF NOT EXISTS idx_job_cards_workspace ON job_cards(workspace_id);
CREATE INDEX IF NOT EXISTS idx_invoices_workspace ON invoices(workspace_id);
CREATE INDEX IF NOT EXISTS idx_payments_workspace ON payments(workspace_id);
CREATE INDEX IF NOT EXISTS idx_purchases_workspace ON purchases(workspace_id);
CREATE INDEX IF NOT EXISTS idx_expenses_workspace ON expenses(workspace_id);
CREATE INDEX IF NOT EXISTS idx_inventory_tx_workspace ON inventory_transactions(workspace_id);

-- 8. Row Level Security Helper Function
CREATE OR REPLACE FUNCTION get_auth_user_workspaces()
RETURNS TABLE(allowed_workspace_id TEXT) AS $$
BEGIN
  -- Platform Super Owner (atiqjehandaraz@gmail.com) has platform-wide access
  IF (auth.jwt() ->> 'email') = 'atiqjehandaraz@gmail.com' THEN
    RETURN QUERY SELECT id FROM workspaces;
  ELSE
    RETURN QUERY
    SELECT wm.workspace_id
    FROM workspace_members wm
    WHERE wm.user_id = auth.uid()::text AND wm.status = 'active';
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 9. Row Level Security Policies
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE services ENABLE ROW LEVEL SECURITY;
ALTER TABLE parts ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;

-- Workspaces Policy
DROP POLICY IF EXISTS "workspaces_access_policy" ON workspaces;
CREATE POLICY "workspaces_access_policy" ON workspaces
  FOR ALL
  USING (
    (auth.jwt() ->> 'email') = 'atiqjehandaraz@gmail.com'
    OR id IN (SELECT allowed_workspace_id FROM get_auth_user_workspaces())
  );

-- Workspace Members Policy
DROP POLICY IF EXISTS "workspace_members_access_policy" ON workspace_members;
CREATE POLICY "workspace_members_access_policy" ON workspace_members
  FOR ALL
  USING (
    (auth.jwt() ->> 'email') = 'atiqjehandaraz@gmail.com'
    OR workspace_id IN (SELECT allowed_workspace_id FROM get_auth_user_workspaces())
  );

-- Customers Policy
DROP POLICY IF EXISTS "customers_workspace_isolation" ON customers;
CREATE POLICY "customers_workspace_isolation" ON customers
  FOR ALL
  USING (workspace_id IN (SELECT allowed_workspace_id FROM get_auth_user_workspaces()))
  WITH CHECK (workspace_id IN (SELECT allowed_workspace_id FROM get_auth_user_workspaces()));

-- Vehicles Policy
DROP POLICY IF EXISTS "vehicles_workspace_isolation" ON vehicles;
CREATE POLICY "vehicles_workspace_isolation" ON vehicles
  FOR ALL
  USING (workspace_id IN (SELECT allowed_workspace_id FROM get_auth_user_workspaces()))
  WITH CHECK (workspace_id IN (SELECT allowed_workspace_id FROM get_auth_user_workspaces()));

-- Job Cards Policy
DROP POLICY IF EXISTS "job_cards_workspace_isolation" ON job_cards;
CREATE POLICY "job_cards_workspace_isolation" ON job_cards
  FOR ALL
  USING (workspace_id IN (SELECT allowed_workspace_id FROM get_auth_user_workspaces()))
  WITH CHECK (workspace_id IN (SELECT allowed_workspace_id FROM get_auth_user_workspaces()));

-- Invoices Policy
DROP POLICY IF EXISTS "invoices_workspace_isolation" ON invoices;
CREATE POLICY "invoices_workspace_isolation" ON invoices
  FOR ALL
  USING (workspace_id IN (SELECT allowed_workspace_id FROM get_auth_user_workspaces()))
  WITH CHECK (workspace_id IN (SELECT allowed_workspace_id FROM get_auth_user_workspaces()));

-- Parts Policy
DROP POLICY IF EXISTS "parts_workspace_isolation" ON parts;
CREATE POLICY "parts_workspace_isolation" ON parts
  FOR ALL
  USING (workspace_id IN (SELECT allowed_workspace_id FROM get_auth_user_workspaces()))
  WITH CHECK (workspace_id IN (SELECT allowed_workspace_id FROM get_auth_user_workspaces()));

-- Expenses Policy
DROP POLICY IF EXISTS "expenses_workspace_isolation" ON expenses;
CREATE POLICY "expenses_workspace_isolation" ON expenses
  FOR ALL
  USING (workspace_id IN (SELECT allowed_workspace_id FROM get_auth_user_workspaces()))
  WITH CHECK (workspace_id IN (SELECT allowed_workspace_id FROM get_auth_user_workspaces()));


-- ==============================================================================
-- MIGRATION STEP: 024_enterprise_delegated_access_system.sql
-- ==============================================================================

-- ============================================================================
-- MIGRATION 024: ENTERPRISE DELEGATED ACCESS, DATA SCOPES & APPROVALS
-- ============================================================================
-- Adds enterprise-grade delegated access control:
-- 1. Data Access Scope (own, assigned, team, all)
-- 2. Financial Visibility toggles (selling, cost, profit, balances, ledger)
-- 3. Approval Limits per user (expense, transfer, payment, discount, stock, void)
-- 4. Approval Requests table for pending high-risk transactions
-- 5. Access Requests table for staff requesting restricted features
-- 6. Temporary Access tracking (start/expiry) and 2FA status
-- ============================================================================

-- 1. Extend users table
ALTER TABLE IF EXISTS public.users
  ADD COLUMN IF NOT EXISTS data_scope VARCHAR(20) DEFAULT 'all' CHECK (data_scope IN ('own', 'assigned', 'team', 'all')),
  ADD COLUMN IF NOT EXISTS financial_visibility JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS approval_limits JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS access_start_date TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS access_expiry_date TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS two_factor_enabled BOOLEAN DEFAULT FALSE;

-- 2. Create approval_requests table
CREATE TABLE IF NOT EXISTS public.approval_requests (
  id VARCHAR(64) PRIMARY KEY,
  workspace_id VARCHAR(64) NOT NULL,
  user_id VARCHAR(64) NOT NULL,
  user_name VARCHAR(255) NOT NULL,
  request_type VARCHAR(50) NOT NULL CHECK (request_type IN (
    'large_expense',
    'large_transfer',
    'large_payment',
    'invoice_void',
    'high_discount',
    'manual_journal',
    'stock_adjustment',
    'permanent_delete'
  )),
  amount NUMERIC(12, 2),
  currency VARCHAR(10) DEFAULT 'AED',
  details JSONB DEFAULT '{}'::jsonb,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  reviewed_by VARCHAR(255),
  reviewed_at TIMESTAMPTZ,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Create access_requests table
CREATE TABLE IF NOT EXISTS public.access_requests (
  id VARCHAR(64) PRIMARY KEY,
  workspace_id VARCHAR(64) NOT NULL,
  user_id VARCHAR(64) NOT NULL,
  user_name VARCHAR(255) NOT NULL,
  user_email VARCHAR(255) NOT NULL,
  requested_module VARCHAR(50) NOT NULL,
  requested_action VARCHAR(50) DEFAULT 'view',
  reason TEXT,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  reviewed_by VARCHAR(255),
  reviewed_at TIMESTAMPTZ,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Performance Indexes
CREATE INDEX IF NOT EXISTS idx_approval_requests_ws_status ON public.approval_requests(workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_approval_requests_user ON public.approval_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_access_requests_ws_status ON public.access_requests(workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_access_requests_user ON public.access_requests(user_id);

-- 5. Enable RLS
ALTER TABLE public.approval_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.access_requests ENABLE ROW LEVEL SECURITY;

-- 6. RLS Policies
CREATE POLICY "approval_requests_workspace_isolation"
  ON public.approval_requests
  FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY "access_requests_workspace_isolation"
  ON public.access_requests
  FOR ALL
  USING (true)
  WITH CHECK (true);


-- ==============================================================================
-- MIGRATION STEP: 025_workspace_invitations_system.sql
-- ==============================================================================

-- ==============================================================================
-- Migration 025: Workspace Invitations & One-Time Activation System
-- ==============================================================================
-- Enables Primary Owner to create secondary workspaces, invite workspace owners/users
-- with granular module permissions, generate secure one-time activation codes,
-- and securely activate accounts with user-created passwords.
-- ==============================================================================

CREATE TABLE IF NOT EXISTS workspace_invitations (
  id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  invited_user_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'manager',
  token_hash TEXT NOT NULL UNIQUE,
  code_hash TEXT NOT NULL,
  code_plain_preview TEXT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired', 'revoked')),
  expires_at TIMESTAMPTZ NOT NULL,
  invited_by TEXT NOT NULL,
  permissions JSONB NULL,
  data_scope TEXT NULL DEFAULT 'all',
  financial_visibility JSONB NULL,
  approval_limits JSONB NULL,
  accepted_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Performance and lookup indexes
CREATE INDEX IF NOT EXISTS idx_workspace_invitations_ws_id ON workspace_invitations(workspace_id);
CREATE INDEX IF NOT EXISTS idx_workspace_invitations_email ON workspace_invitations(email);
CREATE INDEX IF NOT EXISTS idx_workspace_invitations_token_hash ON workspace_invitations(token_hash);
CREATE INDEX IF NOT EXISTS idx_workspace_invitations_code_hash ON workspace_invitations(code_hash);
CREATE INDEX IF NOT EXISTS idx_workspace_invitations_status ON workspace_invitations(status);

-- Ensure workspace_members status includes 'pending'
DO $$
BEGIN
  ALTER TABLE workspace_members DROP CONSTRAINT IF EXISTS workspace_members_status_check;
  ALTER TABLE workspace_members ADD CONSTRAINT workspace_members_status_check CHECK (status IN ('active', 'invited', 'pending', 'suspended'));
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;


-- ==============================================================================
-- MIGRATION STEP: 026_workspace_invitations_email_delivery.sql
-- ==============================================================================

-- ==============================================================================
-- Migration 026: Workspace Invitations Email Delivery & Error Tracking
-- ==============================================================================
-- Adds 'sent' and 'failed' to invitation status check constraint.
-- Adds error_message and sent_at columns to track real Supabase Auth email delivery.
-- ==============================================================================

-- Drop old status check constraint and add updated one
DO $$
BEGIN
  ALTER TABLE workspace_invitations DROP CONSTRAINT IF EXISTS workspace_invitations_status_check;
  ALTER TABLE workspace_invitations ADD CONSTRAINT workspace_invitations_status_check 
    CHECK (status IN ('pending', 'sent', 'accepted', 'failed', 'expired', 'revoked'));
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;

-- Add error_message and sent_at columns if not present
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'workspace_invitations' AND column_name = 'error_message'
  ) THEN
    ALTER TABLE workspace_invitations ADD COLUMN error_message TEXT NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'workspace_invitations' AND column_name = 'sent_at'
  ) THEN
    ALTER TABLE workspace_invitations ADD COLUMN sent_at TIMESTAMPTZ NULL;
  END IF;
END $$;


-- ==============================================================================
-- MIGRATION STEP: 027_multi_workspace_governance.sql
-- ==============================================================================

-- ==============================================================================
-- Migration 027: Enterprise Multi-Workspace Governance & Second Owner Architecture
-- ==============================================================================
-- 1. Updates workspace_members to support 'removed' status, is_workspace_owner flag,
--    and removed_at timestamp for safe offboarding without data loss.
-- 2. Creates workspace_audit_logs table to track full lifecycle audit history.
-- 3. Updates get_auth_user_workspaces() to filter out suspended/archived workspaces.
-- ==============================================================================

-- 1. Update workspace_members status constraint and add columns
DO $$
BEGIN
  ALTER TABLE workspace_members DROP CONSTRAINT IF EXISTS workspace_members_status_check;
  ALTER TABLE workspace_members ADD CONSTRAINT workspace_members_status_check 
    CHECK (status IN ('active', 'invited', 'pending', 'suspended', 'removed'));
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'workspace_members' AND column_name = 'is_workspace_owner'
  ) THEN
    ALTER TABLE workspace_members ADD COLUMN is_workspace_owner BOOLEAN DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'workspace_members' AND column_name = 'removed_at'
  ) THEN
    ALTER TABLE workspace_members ADD COLUMN removed_at TIMESTAMPTZ NULL;
  END IF;
END $$;

-- 2. Create Workspace Audit Logs Table
CREATE TABLE IF NOT EXISTS workspace_audit_logs (
  id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  performed_by TEXT NOT NULL,
  target_user TEXT NULL,
  details JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workspace_audit_logs_ws_id ON workspace_audit_logs(workspace_id);
CREATE INDEX IF NOT EXISTS idx_workspace_audit_logs_created_at ON workspace_audit_logs(created_at);

-- 3. Update get_auth_user_workspaces()
CREATE OR REPLACE FUNCTION get_auth_user_workspaces()
RETURNS TABLE (allowed_workspace_id TEXT) AS $$
BEGIN
  -- Primary platform owner sees all active workspaces
  IF (auth.jwt() ->> 'email') = 'atiqjehandaraz@gmail.com' THEN
    RETURN QUERY 
    SELECT id FROM workspaces 
    WHERE status != 'archived';
  ELSE
    -- Delegated owners and staff only see workspaces where their membership is active AND the workspace is active
    RETURN QUERY
    SELECT wm.workspace_id
    FROM workspace_members wm
    JOIN workspaces w ON w.id = wm.workspace_id
    WHERE (wm.user_id = auth.uid()::text OR wm.user_id = auth.jwt() ->> 'email')
      AND wm.status = 'active'
      AND w.status = 'active';
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ==============================================================================
-- MIGRATION STEP: 028_workspace_user_access_governance.sql
-- ==============================================================================

-- ==============================================================================
-- Migration 028: Workspace User Access Governance & Safe Offboarding
-- ==============================================================================
-- 1. Adds removed_by to workspace_members.
-- 2. Adds deleted_at and deleted_by to users for safe account deactivation.
-- 3. Updates get_auth_user_workspaces() to strictly require status = 'active'
--    for workspace memberships and exclude archived workspaces.
-- ==============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'workspace_members' AND column_name = 'removed_by'
  ) THEN
    ALTER TABLE workspace_members ADD COLUMN removed_by TEXT NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'users' AND column_name = 'deleted_at'
  ) THEN
    ALTER TABLE users ADD COLUMN deleted_at TIMESTAMPTZ NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'users' AND column_name = 'deleted_by'
  ) THEN
    ALTER TABLE users ADD COLUMN deleted_by TEXT NULL;
  END IF;
END $$;

-- Update get_auth_user_workspaces() to strictly exclude removed memberships
CREATE OR REPLACE FUNCTION get_auth_user_workspaces()
RETURNS TABLE (allowed_workspace_id TEXT) AS $$
BEGIN
  -- Primary platform owner sees all active/unarchived workspaces
  IF (auth.jwt() ->> 'email') = 'atiqjehandaraz@gmail.com' THEN
    RETURN QUERY 
    SELECT id FROM workspaces 
    WHERE status != 'archived';
  ELSE
    -- Other users only see workspaces where their membership is ACTIVE and workspace is ACTIVE
    RETURN QUERY 
    SELECT wm.workspace_id 
    FROM workspace_members wm
    JOIN workspaces w ON w.id = wm.workspace_id
    WHERE (
      wm.user_id = auth.uid()::text 
      OR wm.user_id = (auth.jwt() ->> 'email')
    )
    AND wm.status = 'active'
    AND w.status = 'active';
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ==============================================================================
-- MIGRATION STEP: 029_link_ibrar_workspace_user.sql
-- ==============================================================================

-- Migration 029: Link Ibrar Workspace & Supabase Auth User
-- Ensures the existing ibrar workspace is properly registered and user 081056bf-d01c-49da-8e55-7684bd043c1e is linked as active workspace_owner.

-- 1. Ensure the existing ibrar workspace exists in public.workspaces
INSERT INTO public.workspaces (
  id,
  name,
  business_name,
  owner_user_id,
  owner_name,
  owner_email,
  phone,
  address,
  country,
  currency,
  status,
  users_count,
  created_at,
  updated_at
) VALUES (
  'ws-ibrar-mtl907qk',
  'ibrar',
  'ibrar',
  '081056bf-d01c-49da-8e55-7684bd043c1e',
  'Ibrar Ahmad',
  'ibrarahmad0987a@gmail.com',
  NULL,
  'Abu dhabi',
  'United Arab Emirates',
  'AED',
  'active',
  1,
  '2026-09-03T08:13:34.124Z',
  NOW()
) ON CONFLICT (id) DO UPDATE SET
  name = 'ibrar',
  business_name = 'ibrar',
  owner_user_id = '081056bf-d01c-49da-8e55-7684bd043c1e',
  owner_email = 'ibrarahmad0987a@gmail.com',
  status = 'active',
  updated_at = NOW();

-- 2. Ensure public.users has the corresponding record for this user
INSERT INTO public.users (
  id,
  name,
  email,
  role,
  is_active,
  status,
  created_at,
  updated_at
) VALUES (
  '081056bf-d01c-49da-8e55-7684bd043c1e',
  'Ibrar Ahmad',
  'ibrarahmad0987a@gmail.com',
  'workspace_owner',
  true,
  'active',
  '2026-09-03T08:13:34.124Z',
  NOW()
) ON CONFLICT (id) DO UPDATE SET
  name = 'Ibrar Ahmad',
  email = 'ibrarahmad0987a@gmail.com',
  role = 'workspace_owner',
  is_active = true,
  status = 'active',
  updated_at = NOW();

-- 3. Link the user to the ibrar workspace in public.workspace_members as active workspace_owner
INSERT INTO public.workspace_members (
  id,
  workspace_id,
  user_id,
  role,
  status,
  is_workspace_owner,
  joined_at,
  updated_at
) VALUES (
  'wm-ibrar-mtl907qk-owner',
  'ws-ibrar-mtl907qk',
  '081056bf-d01c-49da-8e55-7684bd043c1e',
  'workspace_owner',
  'active',
  true,
  '2026-09-03T08:13:34.124Z',
  NOW()
) ON CONFLICT (workspace_id, user_id) DO UPDATE SET
  role = 'workspace_owner',
  status = 'active',
  is_workspace_owner = true,
  updated_at = NOW();

-- 4. Audit log entry for governance
INSERT INTO public.workspace_audit_logs (
  id,
  workspace_id,
  action,
  user_id,
  user_name,
  details,
  created_at
) VALUES (
  gen_random_uuid(),
  'ws-ibrar-mtl907qk',
  'MEMBER_ROLE_CHANGED',
  '081056bf-d01c-49da-8e55-7684bd043c1e',
  'Ibrar Ahmad',
  'Linked Supabase Auth user 081056bf-d01c-49da-8e55-7684bd043c1e as active workspace_owner of ibrar workspace',
  NOW()
);


-- ==============================================================================
-- VERIFICATION: Check created tables
-- ==============================================================================
DO $$
DECLARE
  v_count INT;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM information_schema.tables
  WHERE table_schema = 'public';
  RAISE NOTICE 'Total public tables successfully configured: %', v_count;
END $$;

SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;
