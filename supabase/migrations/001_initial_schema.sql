-- ============================================================================
-- ATIQ JEHAN AUTO REPAIR & USED SPARE PARTS L.L.C.
-- Auto Workshop Management System — Initial Database Schema
-- ============================================================================
-- Run this SQL in your Supabase SQL Editor (Dashboard > SQL Editor > New Query)
-- ============================================================================

-- ─── Enable UUID Extension ──────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── Custom ENUM Types ─────────────────────────────────────────────────────

CREATE TYPE user_role AS ENUM ('admin', 'manager', 'receptionist', 'storekeeper', 'mechanic');
CREATE TYPE job_card_status AS ENUM ('new', 'in_progress', 'waiting', 'completed', 'cancelled');
CREATE TYPE payment_method AS ENUM ('cash', 'bank', 'credit');
CREATE TYPE payment_status AS ENUM ('paid', 'partially_paid', 'credit');
CREATE TYPE purchase_payment_status AS ENUM ('paid', 'partially_paid', 'unpaid');
CREATE TYPE item_type AS ENUM ('service', 'part', 'labour');
CREATE TYPE inventory_transaction_type AS ENUM ('purchase_in', 'job_card_out', 'adjustment', 'return');
CREATE TYPE expense_payment_method AS ENUM ('cash', 'bank');

-- ─── Users ──────────────────────────────────────────────────────────────────

CREATE TABLE users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  role user_role NOT NULL DEFAULT 'receptionist',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Customers ──────────────────────────────────────────────────────────────

CREATE TABLE customers (
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

CREATE INDEX idx_customers_name ON customers USING gin(to_tsvector('english', name));
CREATE INDEX idx_customers_mobile ON customers(mobile);

-- ─── Suppliers ──────────────────────────────────────────────────────────────

CREATE TABLE suppliers (
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

CREATE TABLE vehicles (
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

CREATE INDEX idx_vehicles_customer ON vehicles(customer_id);
CREATE INDEX idx_vehicles_registration ON vehicles(registration_number);
CREATE INDEX idx_vehicles_chassis_vin ON vehicles(chassis_vin);
CREATE UNIQUE INDEX idx_vehicles_unique_chassis_vin ON vehicles(chassis_vin) WHERE chassis_vin IS NOT NULL AND chassis_vin != '';

-- ─── Services ───────────────────────────────────────────────────────────────

CREATE TABLE services (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  description TEXT,
  default_price NUMERIC(12, 2) NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Parts (Spare Parts) ───────────────────────────────────────────────────

CREATE TABLE parts (
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

CREATE INDEX idx_parts_part_number ON parts(part_number);
CREATE INDEX idx_parts_supplier ON parts(supplier_id);
CREATE INDEX idx_parts_low_stock ON parts(current_stock, minimum_stock) WHERE is_active = true;

-- ─── Job Cards ──────────────────────────────────────────────────────────────

CREATE TABLE job_cards (
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

CREATE INDEX idx_job_cards_customer ON job_cards(customer_id);
CREATE INDEX idx_job_cards_vehicle ON job_cards(vehicle_id);
CREATE INDEX idx_job_cards_status ON job_cards(status);
CREATE INDEX idx_job_cards_date ON job_cards(date);
CREATE INDEX idx_job_cards_number ON job_cards(job_card_number);

-- ─── Job Card Items ─────────────────────────────────────────────────────────

CREATE TABLE job_card_items (
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

CREATE INDEX idx_job_card_items_job_card ON job_card_items(job_card_id);

-- ─── Invoices ───────────────────────────────────────────────────────────────

CREATE TABLE invoices (
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

CREATE INDEX idx_invoices_customer ON invoices(customer_id);
CREATE INDEX idx_invoices_job_card ON invoices(job_card_id);
CREATE INDEX idx_invoices_status ON invoices(payment_status);
CREATE INDEX idx_invoices_date ON invoices(created_at);

-- ─── Invoice Items ──────────────────────────────────────────────────────────

CREATE TABLE invoice_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  item_type item_type,
  description TEXT NOT NULL,
  quantity NUMERIC(10, 2) NOT NULL DEFAULT 1,
  unit_price NUMERIC(12, 2) NOT NULL,
  total_price NUMERIC(12, 2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_invoice_items_invoice ON invoice_items(invoice_id);

-- ─── Payments ───────────────────────────────────────────────────────────────

CREATE TABLE payments (
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

CREATE INDEX idx_payments_invoice ON payments(invoice_id);
CREATE INDEX idx_payments_customer ON payments(customer_id);
CREATE INDEX idx_payments_date ON payments(payment_date);
CREATE INDEX idx_payments_method ON payments(payment_method);

-- ─── Purchases ──────────────────────────────────────────────────────────────

CREATE TABLE purchases (
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

CREATE INDEX idx_purchases_supplier ON purchases(supplier_id);
CREATE INDEX idx_purchases_date ON purchases(date);

-- ─── Purchase Items ─────────────────────────────────────────────────────────

CREATE TABLE purchase_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  purchase_id UUID NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
  part_id UUID NOT NULL REFERENCES parts(id),
  quantity NUMERIC(10, 2) NOT NULL,
  purchase_price NUMERIC(12, 2) NOT NULL,
  total_price NUMERIC(12, 2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_purchase_items_purchase ON purchase_items(purchase_id);

-- ─── Expenses ───────────────────────────────────────────────────────────────

CREATE TABLE expenses (
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

CREATE INDEX idx_expenses_date ON expenses(date);
CREATE INDEX idx_expenses_category ON expenses(category);

-- ─── Inventory Transactions ─────────────────────────────────────────────────

CREATE TABLE inventory_transactions (
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

CREATE INDEX idx_inventory_tx_part ON inventory_transactions(part_id);
CREATE INDEX idx_inventory_tx_date ON inventory_transactions(created_at);

-- ─── Settings ───────────────────────────────────────────────────────────────

CREATE TABLE settings (
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

CREATE TRIGGER trg_recalc_job_card_items
  AFTER INSERT OR UPDATE OR DELETE ON job_card_items
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

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
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

CREATE POLICY "Authenticated users can view all data" ON users FOR SELECT TO authenticated USING (true);
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
