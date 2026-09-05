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
