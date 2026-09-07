-- ==============================================================================
-- Migration 034: Complete Workshop Business Schema & Multi-Tenant RLS
-- ==============================================================================
-- Aligned with Migration 033 Workspaces & Security Foundation
-- Tables included:
--   1. customers
--   2. vehicles
--   3. services
--   4. suppliers
--   5. parts
--   6. inventory_transactions
--   7. job_cards
--   8. job_card_items
--   9. invoices
--  10. invoice_items
--  11. payments
--  12. purchases
--  13. purchase_items
--  14. supplier_payments
--  15. expenses
--  16. workers
--  17. bank_accounts
--  18. ledger_accounts
--  19. ledger_transactions
--  20. ledger_entries
--  21. uploaded_job_cards
--  22. job_card_attachments
--  23. recycle_bin_history
--  24. approval_requests
--  25. access_requests
--  26. settings
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── 1. Customers Table ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  mobile TEXT,
  email TEXT,
  address TEXT,
  company_name TEXT,
  trn_number TEXT,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  deleted_at TIMESTAMPTZ,
  deleted_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customers_workspace ON public.customers(workspace_id);
CREATE INDEX IF NOT EXISTS idx_customers_mobile ON public.customers(mobile);
CREATE INDEX IF NOT EXISTS idx_customers_name ON public.customers(name);
CREATE INDEX IF NOT EXISTS idx_customers_trn ON public.customers(trn_number);
CREATE INDEX IF NOT EXISTS idx_customers_is_deleted ON public.customers(is_deleted);

DROP TRIGGER IF EXISTS trg_customers_updated_at ON public.customers;
CREATE TRIGGER trg_customers_updated_at
  BEFORE UPDATE ON public.customers
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- ─── 2. Vehicles Table ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.vehicles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  make TEXT NOT NULL,
  model TEXT NOT NULL,
  year INTEGER,
  color TEXT,
  chassis_vin TEXT,
  mileage INTEGER,
  registration_number TEXT,
  notes TEXT,
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  deleted_at TIMESTAMPTZ,
  deleted_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vehicles_workspace ON public.vehicles(workspace_id);
CREATE INDEX IF NOT EXISTS idx_vehicles_customer ON public.vehicles(customer_id);
CREATE INDEX IF NOT EXISTS idx_vehicles_reg ON public.vehicles(registration_number);
CREATE INDEX IF NOT EXISTS idx_vehicles_vin ON public.vehicles(chassis_vin);
CREATE INDEX IF NOT EXISTS idx_vehicles_is_deleted ON public.vehicles(is_deleted);

DROP TRIGGER IF EXISTS trg_vehicles_updated_at ON public.vehicles;
CREATE TRIGGER trg_vehicles_updated_at
  BEFORE UPDATE ON public.vehicles
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- ─── 3. Services Catalog ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  service_code TEXT,
  category TEXT,
  name TEXT NOT NULL,
  description TEXT,
  default_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  estimated_time TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  deleted_at TIMESTAMPTZ,
  deleted_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_services_workspace ON public.services(workspace_id);
CREATE INDEX IF NOT EXISTS idx_services_code ON public.services(service_code);

DROP TRIGGER IF EXISTS trg_services_updated_at ON public.services;
CREATE TRIGGER trg_services_updated_at
  BEFORE UPDATE ON public.services
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- ─── 4. Suppliers Table ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  company_name TEXT,
  contact_person TEXT,
  phone TEXT,
  alternate_phone TEXT,
  email TEXT,
  address TEXT,
  city TEXT,
  trn_number TEXT,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  deleted_at TIMESTAMPTZ,
  deleted_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_suppliers_workspace ON public.suppliers(workspace_id);
CREATE INDEX IF NOT EXISTS idx_suppliers_name ON public.suppliers(name);

DROP TRIGGER IF EXISTS trg_suppliers_updated_at ON public.suppliers;
CREATE TRIGGER trg_suppliers_updated_at
  BEFORE UPDATE ON public.suppliers
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- ─── 5. Parts Inventory Master ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.parts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  part_number TEXT,
  name TEXT NOT NULL,
  brand TEXT,
  description TEXT,
  unit TEXT NOT NULL DEFAULT 'piece',
  purchase_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  selling_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  current_stock NUMERIC(12,2) NOT NULL DEFAULT 0,
  minimum_stock NUMERIC(12,2) NOT NULL DEFAULT 5,
  supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
  location TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  deleted_at TIMESTAMPTZ,
  deleted_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_parts_workspace ON public.parts(workspace_id);
CREATE INDEX IF NOT EXISTS idx_parts_number ON public.parts(part_number);
CREATE INDEX IF NOT EXISTS idx_parts_supplier ON public.parts(supplier_id);

DROP TRIGGER IF EXISTS trg_parts_updated_at ON public.parts;
CREATE TRIGGER trg_parts_updated_at
  BEFORE UPDATE ON public.parts
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- ─── 6. Inventory Transactions Ledger ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.inventory_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  part_id UUID NOT NULL REFERENCES public.parts(id) ON DELETE CASCADE,
  transaction_type TEXT NOT NULL, -- 'purchase', 'job_card_usage', 'direct_sale', 'adjustment', 'return', 'reversal'
  quantity NUMERIC(12,2) NOT NULL,
  quantity_before NUMERIC(12,2),
  quantity_after NUMERIC(12,2),
  unit_cost NUMERIC(12,2),
  reference_type TEXT,
  reference_id TEXT,
  notes TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inventory_tx_workspace ON public.inventory_transactions(workspace_id);
CREATE INDEX IF NOT EXISTS idx_inventory_tx_part ON public.inventory_transactions(part_id);
CREATE INDEX IF NOT EXISTS idx_inventory_tx_type ON public.inventory_transactions(transaction_type);

-- ─── 7. Job Cards & Job Card Items ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.job_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  job_card_number TEXT NOT NULL,
  invoice_number NUMERIC,
  invoice_number_mode TEXT DEFAULT 'auto',
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  vehicle_id UUID NOT NULL REFERENCES public.vehicles(id) ON DELETE RESTRICT,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  mileage_in INTEGER,
  customer_complaint TEXT,
  work_details TEXT,
  discount NUMERIC(12,2) NOT NULL DEFAULT 0,
  subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
  vat_rate NUMERIC(5,2) NOT NULL DEFAULT 5.00,
  vat_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  total NUMERIC(12,2) NOT NULL DEFAULT 0,
  paid NUMERIC(12,2) NOT NULL DEFAULT 0,
  balance NUMERIC(12,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'new', -- 'new', 'in_progress', 'waiting', 'completed', 'cancelled'
  payment_status TEXT NOT NULL DEFAULT 'Pending',
  assigned_mechanic TEXT,
  notes TEXT,
  created_by TEXT,
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  deleted_at TIMESTAMPTZ,
  deleted_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_job_cards_workspace ON public.job_cards(workspace_id);
CREATE INDEX IF NOT EXISTS idx_job_cards_customer ON public.job_cards(customer_id);
CREATE INDEX IF NOT EXISTS idx_job_cards_vehicle ON public.job_cards(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_job_cards_number ON public.job_cards(job_card_number);
CREATE INDEX IF NOT EXISTS idx_job_cards_status ON public.job_cards(status);

DROP TRIGGER IF EXISTS trg_job_cards_updated_at ON public.job_cards;
CREATE TRIGGER trg_job_cards_updated_at
  BEFORE UPDATE ON public.job_cards
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

CREATE TABLE IF NOT EXISTS public.job_card_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  job_card_id UUID NOT NULL REFERENCES public.job_cards(id) ON DELETE CASCADE,
  item_type TEXT NOT NULL, -- 'service' | 'part'
  service_id UUID REFERENCES public.services(id) ON DELETE SET NULL,
  part_id UUID REFERENCES public.parts(id) ON DELETE SET NULL,
  description TEXT NOT NULL,
  quantity NUMERIC(12,2) NOT NULL DEFAULT 1,
  unit_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  cost_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  labour_charge NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_job_card_items_jc ON public.job_card_items(job_card_id);
CREATE INDEX IF NOT EXISTS idx_job_card_items_ws ON public.job_card_items(workspace_id);

-- ─── 8. Invoices & Invoice Items ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  invoice_number TEXT NOT NULL,
  job_card_id UUID REFERENCES public.job_cards(id) ON DELETE SET NULL,
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  vehicle_id UUID REFERENCES public.vehicles(id) ON DELETE SET NULL,
  subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
  discount NUMERIC(12,2) NOT NULL DEFAULT 0,
  vat_rate NUMERIC(5,2) NOT NULL DEFAULT 5.00,
  vat_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  total NUMERIC(12,2) NOT NULL DEFAULT 0,
  paid NUMERIC(12,2) NOT NULL DEFAULT 0,
  balance NUMERIC(12,2) NOT NULL DEFAULT 0,
  payment_status TEXT NOT NULL DEFAULT 'credit', -- 'paid', 'partially_paid', 'credit', 'void'
  invoice_type TEXT NOT NULL DEFAULT 'job_card', -- 'job_card', 'direct_service', 'direct_parts', 'direct_mixed'
  notes TEXT,
  is_void BOOLEAN NOT NULL DEFAULT false,
  void_reason TEXT,
  voided_at TIMESTAMPTZ,
  voided_by TEXT,
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  deleted_at TIMESTAMPTZ,
  deleted_by TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invoices_workspace ON public.invoices(workspace_id);
CREATE INDEX IF NOT EXISTS idx_invoices_number ON public.invoices(invoice_number);
CREATE INDEX IF NOT EXISTS idx_invoices_customer ON public.invoices(customer_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON public.invoices(payment_status);

DROP TRIGGER IF EXISTS trg_invoices_updated_at ON public.invoices;
CREATE TRIGGER trg_invoices_updated_at
  BEFORE UPDATE ON public.invoices
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

CREATE TABLE IF NOT EXISTS public.invoice_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  item_type TEXT NOT NULL,
  description TEXT NOT NULL,
  quantity NUMERIC(12,2) NOT NULL DEFAULT 1,
  unit_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  part_id UUID REFERENCES public.parts(id) ON DELETE SET NULL,
  service_id UUID REFERENCES public.services(id) ON DELETE SET NULL,
  cost_price NUMERIC(12,2) DEFAULT 0,
  part_number TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invoice_items_inv ON public.invoice_items(invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_items_ws ON public.invoice_items(workspace_id);

-- ─── 9. Payments Table ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  invoice_id UUID REFERENCES public.invoices(id) ON DELETE SET NULL,
  job_card_id UUID REFERENCES public.job_cards(id) ON DELETE SET NULL,
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  amount NUMERIC(12,2) NOT NULL,
  payment_method TEXT NOT NULL, -- 'cash', 'bank', 'credit', 'card'
  reference_number TEXT,
  notes TEXT,
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_by TEXT,
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  deleted_at TIMESTAMPTZ,
  deleted_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payments_workspace ON public.payments(workspace_id);
CREATE INDEX IF NOT EXISTS idx_payments_invoice ON public.payments(invoice_id);
CREATE INDEX IF NOT EXISTS idx_payments_customer ON public.payments(customer_id);
CREATE INDEX IF NOT EXISTS idx_payments_date ON public.payments(payment_date);

-- ─── 10. Purchases, Items & Supplier Payments ─────────────────────────────────
CREATE TABLE IF NOT EXISTS public.purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  supplier_id UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  purchase_invoice_number TEXT,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  total NUMERIC(12,2) NOT NULL DEFAULT 0,
  paid_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  balance NUMERIC(12,2) NOT NULL DEFAULT 0,
  payment_status TEXT NOT NULL DEFAULT 'unpaid', -- 'paid', 'partially_paid', 'unpaid', 'credit'
  payment_method TEXT,
  notes TEXT,
  created_by TEXT,
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  deleted_at TIMESTAMPTZ,
  deleted_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_purchases_workspace ON public.purchases(workspace_id);
CREATE INDEX IF NOT EXISTS idx_purchases_supplier ON public.purchases(supplier_id);

DROP TRIGGER IF EXISTS trg_purchases_updated_at ON public.purchases;
CREATE TRIGGER trg_purchases_updated_at
  BEFORE UPDATE ON public.purchases
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

CREATE TABLE IF NOT EXISTS public.purchase_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  purchase_id UUID NOT NULL REFERENCES public.purchases(id) ON DELETE CASCADE,
  part_id UUID NOT NULL REFERENCES public.parts(id) ON DELETE RESTRICT,
  quantity NUMERIC(12,2) NOT NULL,
  purchase_price NUMERIC(12,2) NOT NULL,
  total_price NUMERIC(12,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_purchase_items_purch ON public.purchase_items(purchase_id);
CREATE INDEX IF NOT EXISTS idx_purchase_items_part ON public.purchase_items(part_id);

CREATE TABLE IF NOT EXISTS public.supplier_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  purchase_id UUID REFERENCES public.purchases(id) ON DELETE SET NULL,
  supplier_id UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  amount NUMERIC(12,2) NOT NULL,
  payment_method TEXT NOT NULL,
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  reference_number TEXT,
  notes TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_supplier_payments_ws ON public.supplier_payments(workspace_id);
CREATE INDEX IF NOT EXISTS idx_supplier_payments_supp ON public.supplier_payments(supplier_id);

-- ─── 11. Expenses Table ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  category TEXT NOT NULL,
  description TEXT,
  amount NUMERIC(12,2) NOT NULL,
  payment_method TEXT NOT NULL,
  paid_to TEXT,
  reference_number TEXT,
  notes TEXT,
  attachment_path TEXT,
  created_by TEXT,
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  deleted_at TIMESTAMPTZ,
  deleted_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_expenses_workspace ON public.expenses(workspace_id);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON public.expenses(expense_date);
CREATE INDEX IF NOT EXISTS idx_expenses_category ON public.expenses(category);

DROP TRIGGER IF EXISTS trg_expenses_updated_at ON public.expenses;
CREATE TRIGGER trg_expenses_updated_at
  BEFORE UPDATE ON public.expenses
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- ─── 12. Workers Table ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.workers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT,
  job_position TEXT NOT NULL,
  salary_type TEXT NOT NULL DEFAULT 'monthly',
  basic_salary NUMERIC(12,2) NOT NULL DEFAULT 0,
  opening_balance NUMERIC(12,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workers_workspace ON public.workers(workspace_id);

DROP TRIGGER IF EXISTS trg_workers_updated_at ON public.workers;
CREATE TRIGGER trg_workers_updated_at
  BEFORE UPDATE ON public.workers
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- ─── 13. Bank Accounts Table ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.bank_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  bank_name TEXT NOT NULL,
  account_name TEXT NOT NULL,
  account_number_last_digits TEXT,
  opening_balance NUMERIC(12,2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'AED',
  status TEXT NOT NULL DEFAULT 'active',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bank_accounts_workspace ON public.bank_accounts(workspace_id);

DROP TRIGGER IF EXISTS trg_bank_accounts_updated_at ON public.bank_accounts;
CREATE TRIGGER trg_bank_accounts_updated_at
  BEFORE UPDATE ON public.bank_accounts
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- ─── 14. Double-Entry Accounting Ledger ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ledger_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  account_code TEXT NOT NULL,
  account_name TEXT NOT NULL,
  account_type TEXT NOT NULL, -- 'asset', 'liability', 'equity', 'income', 'expense'
  account_sub_type TEXT NOT NULL,
  related_entity_type TEXT NOT NULL DEFAULT 'none',
  related_entity_id UUID,
  opening_balance NUMERIC(12,2) NOT NULL DEFAULT 0,
  opening_balance_date DATE NOT NULL DEFAULT '2026-01-01',
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  deleted_at TIMESTAMPTZ,
  deleted_by TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ledger_accounts_ws ON public.ledger_accounts(workspace_id);
CREATE INDEX IF NOT EXISTS idx_ledger_accounts_code ON public.ledger_accounts(account_code);

DROP TRIGGER IF EXISTS trg_ledger_accounts_updated_at ON public.ledger_accounts;
CREATE TRIGGER trg_ledger_accounts_updated_at
  BEFORE UPDATE ON public.ledger_accounts
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

CREATE TABLE IF NOT EXISTS public.ledger_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  transaction_number TEXT NOT NULL,
  transaction_date DATE NOT NULL DEFAULT CURRENT_DATE,
  reference_type TEXT NOT NULL,
  reference_id TEXT,
  description TEXT NOT NULL,
  cash_flow_type TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ledger_tx_ws ON public.ledger_transactions(workspace_id);
CREATE INDEX IF NOT EXISTS idx_ledger_tx_date ON public.ledger_transactions(transaction_date);

CREATE TABLE IF NOT EXISTS public.ledger_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  transaction_id UUID NOT NULL REFERENCES public.ledger_transactions(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES public.ledger_accounts(id) ON DELETE RESTRICT,
  debit NUMERIC(12,2) NOT NULL DEFAULT 0,
  credit NUMERIC(12,2) NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ledger_entries_tx ON public.ledger_entries(transaction_id);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_acc ON public.ledger_entries(account_id);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_ws ON public.ledger_entries(workspace_id);

-- ─── 15. Uploaded Documents & Attachments ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.uploaded_job_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  job_card_number TEXT NOT NULL,
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  vehicle_id UUID REFERENCES public.vehicles(id) ON DELETE SET NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  description TEXT,
  file_url TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_type TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  document_type TEXT NOT NULL DEFAULT 'paper_job_card',
  job_card_id UUID REFERENCES public.job_cards(id) ON DELETE SET NULL,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_uploaded_jc_ws ON public.uploaded_job_cards(workspace_id);
CREATE INDEX IF NOT EXISTS idx_uploaded_jc_cust ON public.uploaded_job_cards(customer_id);

CREATE TABLE IF NOT EXISTS public.job_card_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  job_card_id UUID NOT NULL REFERENCES public.job_cards(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL DEFAULT 'other',
  file_url TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_type TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  description TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_jc_attachments_jc ON public.job_card_attachments(job_card_id);

-- ─── 16. Recycle Bin Audit History ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.recycle_bin_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  record_type TEXT NOT NULL,
  record_id TEXT NOT NULL,
  record_name_or_number TEXT NOT NULL,
  action TEXT NOT NULL,
  actor_name TEXT NOT NULL,
  details TEXT,
  raw_snapshot JSONB,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_recycle_bin_ws ON public.recycle_bin_history(workspace_id);
CREATE INDEX IF NOT EXISTS idx_recycle_bin_type ON public.recycle_bin_history(record_type);

-- ─── 17. Governance & Approvals ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.approval_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_name TEXT NOT NULL,
  request_type TEXT NOT NULL,
  amount NUMERIC(12,2),
  currency TEXT DEFAULT 'AED',
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending',
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_approval_requests_ws ON public.approval_requests(workspace_id);
CREATE INDEX IF NOT EXISTS idx_approval_requests_status ON public.approval_requests(status);

CREATE TABLE IF NOT EXISTS public.access_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_name TEXT NOT NULL,
  user_email TEXT NOT NULL,
  requested_module TEXT NOT NULL,
  requested_action TEXT NOT NULL,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_access_requests_ws ON public.access_requests(workspace_id);

CREATE TABLE IF NOT EXISTS public.settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  updated_by TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_settings_ws_key UNIQUE (workspace_id, key)
);

-- ─── 18. Multi-Tenant Row Level Security (RLS) Configuration ──────────────────
DO $$
DECLARE
  tbl TEXT;
  business_tables TEXT[] := ARRAY[
    'customers', 'vehicles', 'services', 'suppliers', 'parts',
    'inventory_transactions', 'job_cards', 'job_card_items',
    'invoices', 'invoice_items', 'payments', 'purchases',
    'purchase_items', 'supplier_payments', 'expenses', 'workers',
    'bank_accounts', 'ledger_accounts', 'ledger_transactions',
    'ledger_entries', 'uploaded_job_cards', 'job_card_attachments',
    'recycle_bin_history', 'approval_requests', 'access_requests',
    'settings'
  ];
BEGIN
  FOREACH tbl IN ARRAY business_tables LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', tbl);
    
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', tbl || '_workspace_isolation', tbl);
    
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (
         public.is_active_workspace_member(workspace_id) OR public.is_platform_admin()
       ) WITH CHECK (
         public.is_active_workspace_member(workspace_id) OR public.is_platform_admin()
       );',
      tbl || '_workspace_isolation',
      tbl
    );
  END LOOP;
END $$;
