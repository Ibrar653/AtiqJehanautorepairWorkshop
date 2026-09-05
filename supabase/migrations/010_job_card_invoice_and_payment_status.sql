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
