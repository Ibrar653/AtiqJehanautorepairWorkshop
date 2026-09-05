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
