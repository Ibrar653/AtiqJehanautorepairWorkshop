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
