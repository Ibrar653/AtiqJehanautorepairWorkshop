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
