import { createClient } from "@/lib/supabase/client";
import type {
  LedgerAccount,
  LedgerAccountInsert,
  LedgerTransaction,
  LedgerEntry,
  Worker,
  WorkerInsert,
  BankAccount,
  BankAccountInsert,
  AccountType,
  CashFlowType,
} from "@/types/database";

export type { CashFlowType };
import { DEFAULT_ACCOUNT_SUB_TYPES, DEFAULT_WORKSPACE_ID } from "@/lib/constants";
import { getActiveWorkspaceId } from "./workspace-service";
import { getLocalExpenses } from "./expense-service";
import { getLocalPayments } from "./payment-service";
import { getLocalPurchases, getLocalSupplierPayments } from "./purchase-service";
import { getLocalCustomers } from "./customer-service";
import { getLocalSuppliers } from "./supplier-service";

const LOCAL_ACCOUNTS_KEY = "atiq_local_ledger_accounts";
const LOCAL_TXNS_KEY = "atiq_local_ledger_transactions";
const LOCAL_ENTRIES_KEY = "atiq_local_ledger_entries";
const LOCAL_WORKERS_KEY = "atiq_local_workers";
const LOCAL_BANKS_KEY = "atiq_local_bank_accounts";

// ─── Default Chart of Accounts ──────────────────────────────────────────────

export const DEFAULT_CHART_OF_ACCOUNTS: Omit<LedgerAccount, "created_at" | "updated_at">[] = [
  // Assets (1000s)
  {
    id: "acc-1001",
    account_code: "1001",
    account_name: "Cash on Hand",
    account_type: "asset",
    account_sub_type: "Cash",
    related_entity_type: "none",
    related_entity_id: null,
    opening_balance: 0,
    opening_balance_date: "2026-01-01",
    is_active: true,
    notes: "Workshop operational cash drawer & counter float",
  },
  {
    id: "acc-1002",
    account_code: "1002",
    account_name: "Main Bank Account (ADCB)",
    account_type: "asset",
    account_sub_type: "Bank",
    related_entity_type: "bank",
    related_entity_id: "bank-adcb-1",
    opening_balance: 0,
    opening_balance_date: "2026-01-01",
    is_active: true,
    notes: "Abu Dhabi Commercial Bank primary workshop current account",
  },
  {
    id: "acc-1003",
    account_code: "1003",
    account_name: "Operations Bank Account (FAB)",
    account_type: "asset",
    account_sub_type: "Bank",
    related_entity_type: "bank",
    related_entity_id: "bank-fab-2",
    opening_balance: 0,
    opening_balance_date: "2026-01-01",
    is_active: true,
    notes: "First Abu Dhabi Bank secondary operations and supplier account",
  },
  {
    id: "acc-1100",
    account_code: "1100",
    account_name: "Accounts Receivable (Customers)",
    account_type: "asset",
    account_sub_type: "Customer Receivable",
    related_entity_type: "customer",
    related_entity_id: null,
    opening_balance: 0,
    opening_balance_date: "2026-01-01",
    is_active: true,
    notes: "Billed customer job cards and outstanding credit invoices",
  },
  {
    id: "acc-1200",
    account_code: "1200",
    account_name: "Spare Parts Inventory Asset",
    account_type: "asset",
    account_sub_type: "Inventory",
    related_entity_type: "none",
    related_entity_id: null,
    opening_balance: 0,
    opening_balance_date: "2026-01-01",
    is_active: true,
    notes: "Workshop stocked inventory and purchased materials at purchase cost",
  },
  {
    id: "acc-1300",
    account_code: "1300",
    account_name: "Staff & Worker Advances",
    account_type: "asset",
    account_sub_type: "Staff Advance",
    related_entity_type: "worker",
    related_entity_id: null,
    opening_balance: 0,
    opening_balance_date: "2026-01-01",
    is_active: true,
    notes: "Prepaid salary advances to technicians and mechanics",
  },

  // Liabilities (2000s)
  {
    id: "acc-2001",
    account_code: "2001",
    account_name: "Accounts Payable (Suppliers)",
    account_type: "liability",
    account_sub_type: "Supplier Payable",
    related_entity_type: "supplier",
    related_entity_id: null,
    opening_balance: 0,
    opening_balance_date: "2026-01-01",
    is_active: true,
    notes: "Outstanding payables for purchased parts and supplier deliveries",
  },
  {
    id: "acc-2100",
    account_code: "2100",
    account_name: "Worker Salaries & Wages Payable",
    account_type: "liability",
    account_sub_type: "Worker Payable",
    related_entity_type: "worker",
    related_entity_id: null,
    opening_balance: 0,
    opening_balance_date: "2026-01-01",
    is_active: true,
    notes: "Accumulated unpaid salaries, commissions, and staff dues",
  },
  {
    id: "acc-2200",
    account_code: "2200",
    account_name: "VAT Output Tax Payable (5%)",
    account_type: "liability",
    account_sub_type: "VAT / Tax Payable",
    related_entity_type: "none",
    related_entity_id: null,
    opening_balance: 0,
    opening_balance_date: "2026-01-01",
    is_active: true,
    notes: "UAE Federal Tax Authority 5% standard rate collected on invoices",
  },
  {
    id: "acc-2300",
    account_code: "2300",
    account_name: "Customer Advances / Deposits Liability",
    account_type: "liability",
    account_sub_type: "Customer Advance",
    related_entity_type: "customer",
    related_entity_id: null,
    opening_balance: 0,
    opening_balance_date: "2026-01-01",
    is_active: true,
    notes: "Customer deposits, retainers, and advance payments received prior to final invoice billing",
  },

  // Income (4000s)
  {
    id: "acc-4001",
    account_code: "4001",
    account_name: "Labor & Service Workshop Revenue",
    account_type: "income",
    account_sub_type: "Service Revenue",
    related_entity_type: "none",
    related_entity_id: null,
    opening_balance: 0,
    opening_balance_date: "2026-01-01",
    is_active: true,
    notes: "Income earned from vehicle mechanical, electrical, and labor services",
  },
  {
    id: "acc-4002",
    account_code: "4002",
    account_name: "Spare Parts Sales Revenue",
    account_type: "income",
    account_sub_type: "Spare Parts Revenue",
    related_entity_type: "none",
    related_entity_id: null,
    opening_balance: 0,
    opening_balance_date: "2026-01-01",
    is_active: true,
    notes: "Income from sales of replacement parts, lubricants, and materials",
  },
  {
    id: "acc-4100",
    account_code: "4100",
    account_name: "Other Workshop Income",
    account_type: "income",
    account_sub_type: "Other Income",
    related_entity_type: "none",
    related_entity_id: null,
    opening_balance: 0,
    opening_balance_date: "2026-01-01",
    is_active: true,
    notes: "Scrap sales, towing, inspection charges, and miscellaneous earnings",
  },

  // Expenses (5000s)
  {
    id: "acc-5001",
    account_code: "5001",
    account_name: "Rent Expense",
    account_type: "expense",
    account_sub_type: "Rent",
    related_entity_type: "none",
    related_entity_id: null,
    opening_balance: 0,
    opening_balance_date: "2026-01-01",
    is_active: true,
    notes: "Workshop garage shed lease & municipal property rent",
  },
  {
    id: "acc-5002",
    account_code: "5002",
    account_name: "Salaries & Wages Expense",
    account_type: "expense",
    account_sub_type: "Salaries / Wages",
    related_entity_type: "worker",
    related_entity_id: null,
    opening_balance: 0,
    opening_balance_date: "2026-01-01",
    is_active: true,
    notes: "Monthly staff payroll, technician wages, and overtime",
  },
  {
    id: "acc-5003",
    account_code: "5003",
    account_name: "Electricity Expense",
    account_type: "expense",
    account_sub_type: "Electricity",
    related_entity_type: "none",
    related_entity_id: null,
    opening_balance: 0,
    opening_balance_date: "2026-01-01",
    is_active: true,
    notes: "DEWA electricity utility charges for workshop power and lights",
  },
  {
    id: "acc-5004",
    account_code: "5004",
    account_name: "Water Expense",
    account_type: "expense",
    account_sub_type: "Water",
    related_entity_type: "none",
    related_entity_id: null,
    opening_balance: 0,
    opening_balance_date: "2026-01-01",
    is_active: true,
    notes: "DEWA water consumption and vehicle wash supply",
  },
  {
    id: "acc-5005",
    account_code: "5005",
    account_name: "Internet & Phone Expense",
    account_type: "expense",
    account_sub_type: "Internet / Phone",
    related_entity_type: "none",
    related_entity_id: null,
    opening_balance: 0,
    opening_balance_date: "2026-01-01",
    is_active: true,
    notes: "Etisalat / du workshop broadband and mobile communications",
  },
  {
    id: "acc-5006",
    account_code: "5006",
    account_name: "Fuel Expense",
    account_type: "expense",
    account_sub_type: "Fuel",
    related_entity_type: "none",
    related_entity_id: null,
    opening_balance: 0,
    opening_balance_date: "2026-01-01",
    is_active: true,
    notes: "Diesel and petrol for recovery pickup truck and generator",
  },
  {
    id: "acc-5007",
    account_code: "5007",
    account_name: "Tools & Equipment Expense",
    account_type: "expense",
    account_sub_type: "Tools",
    related_entity_type: "none",
    related_entity_id: null,
    opening_balance: 0,
    opening_balance_date: "2026-01-01",
    is_active: true,
    notes: "Hand tools, hydraulic lift maintenance, diagnostic scanner updates",
  },
  {
    id: "acc-5008",
    account_code: "5008",
    account_name: "Workshop Supplies Expense",
    account_type: "expense",
    account_sub_type: "Workshop Supplies",
    related_entity_type: "none",
    related_entity_id: null,
    opening_balance: 0,
    opening_balance_date: "2026-01-01",
    is_active: true,
    notes: "Shop towels, degreasers, wd40, gloves, and consumable supplies",
  },
  {
    id: "acc-5009",
    account_code: "5009",
    account_name: "Facility & Equipment Maintenance",
    account_type: "expense",
    account_sub_type: "Maintenance",
    related_entity_type: "none",
    related_entity_id: null,
    opening_balance: 0,
    opening_balance_date: "2026-01-01",
    is_active: true,
    notes: "Air compressor servicing, air conditioning, and garage upkeep",
  },
  {
    id: "acc-5010",
    account_code: "5010",
    account_name: "Government & Municipality Fees",
    account_type: "expense",
    account_sub_type: "Government Fees",
    related_entity_type: "none",
    related_entity_id: null,
    opening_balance: 0,
    opening_balance_date: "2026-01-01",
    is_active: true,
    notes: "Trade license renewal, civil defense, chamber of commerce fees",
  },
  {
    id: "acc-5011",
    account_code: "5011",
    account_name: "Bank Charges & Transfer Fees",
    account_type: "expense",
    account_sub_type: "Bank Charges",
    related_entity_type: "none",
    related_entity_id: null,
    opening_balance: 0,
    opening_balance_date: "2026-01-01",
    is_active: true,
    notes: "Bank transaction fees, transfer charges, and card terminal commissions",
  },
  {
    id: "acc-5099",
    account_code: "5099",
    account_name: "Miscellaneous Operational Expense",
    account_type: "expense",
    account_sub_type: "Miscellaneous Expense",
    related_entity_type: "none",
    related_entity_id: null,
    opening_balance: 0,
    opening_balance_date: "2026-01-01",
    is_active: true,
    notes: "Uncategorized small shop expenditures and office hospitality",
  },

  // Equity (3000s)
  {
    id: "acc-3001",
    account_code: "3001",
    account_name: "Owner Capital Introduced",
    account_type: "equity",
    account_sub_type: "Owner Capital",
    related_entity_type: "owner",
    related_entity_id: null,
    opening_balance: 0,
    opening_balance_date: "2026-01-01",
    is_active: true,
    notes: "Initial equity capital contributed by the workshop proprietor",
  },
  {
    id: "acc-3002",
    account_code: "3002",
    account_name: "Owner Drawings & Withdrawals",
    account_type: "equity",
    account_sub_type: "Owner Drawings",
    related_entity_type: "owner",
    related_entity_id: null,
    opening_balance: 0,
    opening_balance_date: "2026-01-01",
    is_active: true,
    notes: "Personal profit distributions and cash withdrawals by owner",
  },
  {
    id: "acc-3003",
    account_code: "3003",
    account_name: "Owner Advance to Workshop",
    account_type: "equity",
    account_sub_type: "Owner Advance",
    related_entity_type: "owner",
    related_entity_id: null,
    opening_balance: 0,
    opening_balance_date: "2026-01-01",
    is_active: true,
    notes: "Short-term temporary liquidity funding injected by owner",
  },
];

// ─── Default Bank Accounts ──────────────────────────────────────────────────

export const DEFAULT_BANK_ACCOUNTS: BankAccount[] = [
  {
    id: "bank-adcb-1",
    bank_name: "Abu Dhabi Commercial Bank (ADCB)",
    account_name: "Atiq Jehan Auto Repair LLC - Main",
    account_number_last_digits: "4920",
    opening_balance: 0,
    currency: "AED",
    status: "active",
    notes: "Primary business bank account",
    created_at: new Date().toISOString(),
  },
  {
    id: "bank-fab-2",
    bank_name: "First Abu Dhabi Bank (FAB)",
    account_name: "Atiq Jehan Auto Repair LLC - Operations",
    account_number_last_digits: "1088",
    opening_balance: 0,
    currency: "AED",
    status: "active",
    notes: "Secondary business account for supplier transfers",
    created_at: new Date().toISOString(),
  },
];

// ─── Default Workers ────────────────────────────────────────────────────────

export const DEFAULT_WORKERS: Worker[] = [
  {
    id: "w-1",
    name: "Mohammad Tariq",
    phone: "+971 50 123 4567",
    job_position: "Chief Mechanic",
    salary_type: "monthly",
    basic_salary: 3500,
    opening_balance: 0,
    status: "active",
    notes: "Senior engine and transmission technician",
    created_at: new Date().toISOString(),
  },
  {
    id: "w-2",
    name: "Kamal Uddin",
    phone: "+971 55 987 6543",
    job_position: "Auto Electrician",
    salary_type: "monthly",
    basic_salary: 2800,
    opening_balance: 0,
    status: "active",
    notes: "Diagnostic scanning and vehicle wiring specialist",
    created_at: new Date().toISOString(),
  },
  {
    id: "w-3",
    name: "Rashid Ali",
    phone: "+971 52 456 7890",
    job_position: "Denter & Painter",
    salary_type: "monthly",
    basic_salary: 2500,
    opening_balance: 0,
    status: "active",
    notes: "Body repair and spray painting technician",
    created_at: new Date().toISOString(),
  },
];

// ─── In-Memory Storage ──────────────────────────────────────────────────────

let inMemoryAccounts: LedgerAccount[] = DEFAULT_CHART_OF_ACCOUNTS.map((a) => ({
  ...a,
  workspace_id: a.workspace_id || DEFAULT_WORKSPACE_ID,
  created_at: new Date().toISOString(),
}));
let inMemoryTxns: LedgerTransaction[] = [];
let inMemoryEntries: LedgerEntry[] = [];
let inMemoryWorkers: Worker[] = DEFAULT_WORKERS.map((w) => ({
  ...w,
  workspace_id: w.workspace_id || DEFAULT_WORKSPACE_ID,
}));
let inMemoryBanks: BankAccount[] = DEFAULT_BANK_ACCOUNTS.map((b) => ({
  ...b,
  workspace_id: b.workspace_id || DEFAULT_WORKSPACE_ID,
}));

// ─── Local Storage Helpers ──────────────────────────────────────────────────

// Old test opening balance values that should be sanitized to 0 on read
const STALE_OPENING_BALANCE_MAP: Record<string, number[]> = {
  "acc-1002": [15000],
  "acc-1003": [5000],
  "acc-1200": [28500],
  "acc-3001": [50000],
};
let _accountsSanitized = false;

export function getLocalAccounts(workspaceId?: string): LedgerAccount[] {
  const targetWsId = workspaceId || getActiveWorkspaceId();
  let all: LedgerAccount[] = [];
  if (typeof window === "undefined") {
    all = inMemoryAccounts;
  } else {
    try {
      const raw = localStorage.getItem(LOCAL_ACCOUNTS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) all = parsed;
      }
    } catch {}
    if (all.length === 0) {
      all = inMemoryAccounts;
      if (typeof window !== "undefined") {
        try {
          localStorage.setItem(LOCAL_ACCOUNTS_KEY, JSON.stringify(inMemoryAccounts));
        } catch {}
      }
    }
    // Auto-sanitize stale test opening balances from cached localStorage
    if (all.length > 0) {
      let dirty = false;
      all = all.map((acc) => {
        if (!acc.workspace_id || acc.workspace_id === DEFAULT_WORKSPACE_ID) {
          const staleValues = STALE_OPENING_BALANCE_MAP[acc.id];
          if ((staleValues && staleValues.includes(Number(acc.opening_balance))) || Number(acc.opening_balance) !== 0) {
            dirty = true;
            return { ...acc, opening_balance: 0 };
          }
        }
        return acc;
      });
      if (dirty) {
        try {
          localStorage.setItem(LOCAL_ACCOUNTS_KEY, JSON.stringify(all));
          inMemoryAccounts = all;
        } catch {}
      }
      _accountsSanitized = true;
    }
  }
  return all.filter(
    (acc) => acc.workspace_id === targetWsId || (!acc.workspace_id && targetWsId === DEFAULT_WORKSPACE_ID)
  );
}

export function saveLocalAccounts(accounts: LedgerAccount[], workspaceId?: string) {
  const targetWsId = workspaceId || getActiveWorkspaceId();
  let allExisting: LedgerAccount[] = [];
  if (typeof window !== "undefined") {
    try {
      const raw = localStorage.getItem(LOCAL_ACCOUNTS_KEY);
      if (raw) allExisting = JSON.parse(raw);
    } catch {}
  }
  if (allExisting.length === 0) allExisting = inMemoryAccounts;
  const others = allExisting.filter((a) => a.workspace_id && a.workspace_id !== targetWsId);
  const tagged = accounts.map((a) => ({ ...a, workspace_id: a.workspace_id || targetWsId }));
  const merged = [...tagged, ...others];
  inMemoryAccounts = merged;
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(LOCAL_ACCOUNTS_KEY, JSON.stringify(merged));
    } catch (e) {
      console.error("Failed to save local accounts", e);
    }
  }
}

// Known legacy test transaction numbers and IDs to permanently purge
const LEGACY_TEST_TXN_NUMBERS = new Set(["TRF-000001", "TRF-000002"]);
const LEGACY_TEST_TXN_IDS = new Set(["txn-1788374655582-lyio", "txn-1788375483269-7gph"]);
const LEGACY_TEST_ENTRY_IDS = new Set([
  "entry-txn-1788374655582-lyio-1",
  "entry-txn-1788374655582-lyio-2",
  "entry-txn-1788375483269-7gph-1",
  "entry-txn-1788375483269-7gph-2",
  "entry-txn-1788375483269-7gph-3",
]);
const LEDGER_FRESH_START_KEY = "atiq_ledger_fresh_start_2026_09_04";

export function getLocalLedgerTransactions(workspaceId?: string): LedgerTransaction[] {
  const targetWsId = workspaceId || getActiveWorkspaceId();
  let all: LedgerTransaction[] = [];
  if (typeof window === "undefined") {
    all = inMemoryTxns;
  } else {
    try {
      // Auto-execute one-time fresh start cleanup for ATIQ JEHAN if not performed yet
      if (localStorage.getItem(LEDGER_FRESH_START_KEY) !== "true") {
        try {
          const rawTxns = localStorage.getItem(LOCAL_TXNS_KEY);
          if (rawTxns) {
            const parsedTxns: LedgerTransaction[] = JSON.parse(rawTxns);
            if (Array.isArray(parsedTxns)) {
              // Keep only transactions belonging to other workspaces (e.g. ibrar)
              const remaining = parsedTxns.filter(
                (t) => t.workspace_id && t.workspace_id !== DEFAULT_WORKSPACE_ID
              );
              localStorage.setItem(LOCAL_TXNS_KEY, JSON.stringify(remaining));
              inMemoryTxns = remaining;
            }
          }
          const rawEntries = localStorage.getItem(LOCAL_ENTRIES_KEY);
          if (rawEntries) {
            const parsedEntries: LedgerEntry[] = JSON.parse(rawEntries);
            if (Array.isArray(parsedEntries)) {
              const activeTxnIds = new Set(inMemoryTxns.map((t) => t.id));
              const remainingEntries = parsedEntries.filter((e) => activeTxnIds.has(e.transaction_id));
              localStorage.setItem(LOCAL_ENTRIES_KEY, JSON.stringify(remainingEntries));
              inMemoryEntries = remainingEntries;
            }
          }
          // Reset ATIQ JEHAN account opening and current balances to 0
          const rawAccs = localStorage.getItem(LOCAL_ACCOUNTS_KEY);
          if (rawAccs) {
            const parsedAccs: LedgerAccount[] = JSON.parse(rawAccs);
            if (Array.isArray(parsedAccs)) {
              const resetAccs = parsedAccs.map((a) => {
                if (!a.workspace_id || a.workspace_id === DEFAULT_WORKSPACE_ID) {
                  return { ...a, opening_balance: 0, current_balance: 0 };
                }
                return a;
              });
              localStorage.setItem(LOCAL_ACCOUNTS_KEY, JSON.stringify(resetAccs));
              inMemoryAccounts = resetAccs;
            }
          }
          // Reset ATIQ JEHAN bank account opening and current balances to 0
          const rawBanks = localStorage.getItem(LOCAL_BANKS_KEY);
          if (rawBanks) {
            const parsedBanks: BankAccount[] = JSON.parse(rawBanks);
            if (Array.isArray(parsedBanks)) {
              const resetBanks = parsedBanks.map((b) => {
                if (!b.workspace_id || b.workspace_id === DEFAULT_WORKSPACE_ID) {
                  return { ...b, opening_balance: 0, current_balance: 0 };
                }
                return b;
              });
              localStorage.setItem(LOCAL_BANKS_KEY, JSON.stringify(resetBanks));
              inMemoryBanks = resetBanks;
            }
          }
          localStorage.setItem(LEDGER_FRESH_START_KEY, "true");
        } catch (e) {
          console.warn("Ledger fresh start migration error:", e);
        }
      }

      const raw = localStorage.getItem(LOCAL_TXNS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          // Always filter out known legacy test transactions
          const cleaned = parsed.filter(
            (t) =>
              !LEGACY_TEST_TXN_NUMBERS.has(t.transaction_number) &&
              !LEGACY_TEST_TXN_IDS.has(t.id)
          );
          if (cleaned.length !== parsed.length) {
            localStorage.setItem(LOCAL_TXNS_KEY, JSON.stringify(cleaned));
          }
          all = cleaned;
        }
      }
    } catch {}
    if (all.length === 0) all = inMemoryTxns;
  }
  return all.filter(
    (t) =>
      !LEGACY_TEST_TXN_NUMBERS.has(t.transaction_number) &&
      !LEGACY_TEST_TXN_IDS.has(t.id) &&
      (t.workspace_id === targetWsId || (!t.workspace_id && targetWsId === DEFAULT_WORKSPACE_ID))
  );
}

export function saveLocalLedgerTransactions(txns: LedgerTransaction[], workspaceId?: string) {
  const targetWsId = workspaceId || getActiveWorkspaceId();
  let allExisting: LedgerTransaction[] = [];
  if (typeof window !== "undefined") {
    try {
      const raw = localStorage.getItem(LOCAL_TXNS_KEY);
      if (raw) allExisting = JSON.parse(raw);
    } catch {}
  }
  if (allExisting.length === 0) allExisting = inMemoryTxns;
  const others = allExisting.filter((t) => t.workspace_id && t.workspace_id !== targetWsId);
  const tagged = txns.map((t) => ({ ...t, workspace_id: t.workspace_id || targetWsId }));
  const merged = [...tagged, ...others];
  inMemoryTxns = merged;
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(LOCAL_TXNS_KEY, JSON.stringify(merged));
    } catch (e) {
      console.error("Failed to save local transactions", e);
    }
  }
}

export const getLocalTransactions = getLocalLedgerTransactions;
export const saveLocalTransactions = saveLocalLedgerTransactions;

export function getLocalEntries(): LedgerEntry[] {
  if (typeof window === "undefined") return inMemoryEntries;
  try {
    const raw = localStorage.getItem(LOCAL_ENTRIES_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const cleaned = parsed.filter(
          (e) =>
            !LEGACY_TEST_ENTRY_IDS.has(e.id) &&
            !LEGACY_TEST_TXN_IDS.has(e.transaction_id)
        );
        if (cleaned.length !== parsed.length) {
          localStorage.setItem(LOCAL_ENTRIES_KEY, JSON.stringify(cleaned));
        }
        return cleaned;
      }
    }
    return inMemoryEntries;
  } catch {
    return inMemoryEntries;
  }
}

export function saveLocalEntries(entries: LedgerEntry[]) {
  inMemoryEntries = entries;
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LOCAL_ENTRIES_KEY, JSON.stringify(entries));
  } catch (e) {
    console.error("Failed to save local entries", e);
  }
}

export function getLocalWorkers(workspaceId?: string): Worker[] {
  const targetWsId = workspaceId || getActiveWorkspaceId();
  let all: Worker[] = [];
  if (typeof window === "undefined") {
    all = inMemoryWorkers;
  } else {
    try {
      const raw = localStorage.getItem(LOCAL_WORKERS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) all = parsed;
      }
    } catch {}
    if (all.length === 0) {
      all = inMemoryWorkers;
      if (typeof window !== "undefined") {
        try {
          localStorage.setItem(LOCAL_WORKERS_KEY, JSON.stringify(inMemoryWorkers));
        } catch {}
      }
    }
  }
  return all.filter(
    (w) => w.workspace_id === targetWsId || (!w.workspace_id && targetWsId === DEFAULT_WORKSPACE_ID)
  );
}

export function saveLocalWorkers(workers: Worker[], workspaceId?: string) {
  const targetWsId = workspaceId || getActiveWorkspaceId();
  let allExisting: Worker[] = [];
  if (typeof window !== "undefined") {
    try {
      const raw = localStorage.getItem(LOCAL_WORKERS_KEY);
      if (raw) allExisting = JSON.parse(raw);
    } catch {}
  }
  if (allExisting.length === 0) allExisting = inMemoryWorkers;
  const others = allExisting.filter((w) => w.workspace_id && w.workspace_id !== targetWsId);
  const tagged = workers.map((w) => ({ ...w, workspace_id: w.workspace_id || targetWsId }));
  const merged = [...tagged, ...others];
  inMemoryWorkers = merged;
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(LOCAL_WORKERS_KEY, JSON.stringify(merged));
    } catch (e) {
      console.error("Failed to save local workers", e);
    }
  }
}

// Old test bank opening balances to sanitize
const STALE_BANK_BALANCE_MAP: Record<string, number[]> = {
  "bank-adcb-1": [15000],
  "bank-fab-2": [5000],
};
let _banksSanitized = false;

export function getLocalBankAccounts(workspaceId?: string): BankAccount[] {
  const targetWsId = workspaceId || getActiveWorkspaceId();
  let all: BankAccount[] = [];
  if (typeof window === "undefined") {
    all = inMemoryBanks;
  } else {
    try {
      const raw = localStorage.getItem(LOCAL_BANKS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) all = parsed;
      }
    } catch {}
    if (all.length === 0) {
      all = inMemoryBanks;
      if (typeof window !== "undefined") {
        try {
          localStorage.setItem(LOCAL_BANKS_KEY, JSON.stringify(inMemoryBanks));
        } catch {}
      }
    }
    // Auto-sanitize stale test bank opening balances
    if (all.length > 0) {
      let dirty = false;
      all = all.map((bank) => {
        if (!bank.workspace_id || bank.workspace_id === DEFAULT_WORKSPACE_ID) {
          if (Number(bank.opening_balance) !== 0) {
            dirty = true;
            return { ...bank, opening_balance: 0 };
          }
        }
        return bank;
      });
      if (dirty) {
        try {
          localStorage.setItem(LOCAL_BANKS_KEY, JSON.stringify(all));
          inMemoryBanks = all;
        } catch {}
      }
      _banksSanitized = true;
    }
  }
  return all.filter(
    (b) => b.workspace_id === targetWsId || (!b.workspace_id && targetWsId === DEFAULT_WORKSPACE_ID)
  );
}

export function saveLocalBankAccounts(banks: BankAccount[], workspaceId?: string) {
  const targetWsId = workspaceId || getActiveWorkspaceId();
  let allExisting: BankAccount[] = [];
  if (typeof window !== "undefined") {
    try {
      const raw = localStorage.getItem(LOCAL_BANKS_KEY);
      if (raw) allExisting = JSON.parse(raw);
    } catch {}
  }
  if (allExisting.length === 0) allExisting = inMemoryBanks;
  const others = allExisting.filter((b) => b.workspace_id && b.workspace_id !== targetWsId);
  const tagged = banks.map((b) => ({ ...b, workspace_id: b.workspace_id || targetWsId }));
  const merged = [...tagged, ...others];
  inMemoryBanks = merged;
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(LOCAL_BANKS_KEY, JSON.stringify(merged));
    } catch (e) {
      console.error("Failed to save local bank accounts", e);
    }
  }
}

// ─── Helper: Unique Transaction Number Generator ────────────────────────────

let txnSequence = 1000;

export function generateTransactionNumber(): string {
  txnSequence++;
  const datePrefix = new Date().getFullYear().toString().slice(-2);
  return `TXN-${datePrefix}${String(Date.now()).slice(-4)}${String(txnSequence).slice(-2)}`;
}

// ─── Account Balances Calculator ────────────────────────────────────────────

/**
 * Calculates current balance for an account:
 * For Asset and Expense: Opening + Debits - Credits
 * For Liability, Equity, and Income: Opening + Credits - Debits
 */
export function calculateAccountBalance(
  account: LedgerAccount,
  entries: { account_id: string; debit: number | string; credit: number | string }[]
): number {
  let totalDebit = 0;
  let totalCredit = 0;

  entries
    .filter((e) => e.account_id === account.id)
    .forEach((e) => {
      totalDebit += Number(e.debit) || 0;
      totalCredit += Number(e.credit) || 0;
    });

  const opening = Number(account.opening_balance) || 0;

  if (account.account_type === "asset" || account.account_type === "expense") {
    return Math.round((opening + totalDebit - totalCredit) * 100) / 100;
  } else {
    return Math.round((opening + totalCredit - totalDebit) * 100) / 100;
  }
}

// ─── Core Ledger Service Functions ──────────────────────────────────────────

/**
 * Fetch all Chart of Accounts with their calculated balances
 */
export async function getLedgerAccounts(workspaceId?: string): Promise<LedgerAccount[]> {
  const targetWsId = workspaceId || getActiveWorkspaceId();
  const supabase = createClient();
  const localAccounts = getLocalAccounts(targetWsId);
  const localEntries = getLocalEntries();

  try {
    const { data: accountsData, error: accErr } = await supabase
      .from("ledger_accounts")
      .select("*")
      .eq("workspace_id", targetWsId)
      .order("account_code", { ascending: true });

    if (accErr || !accountsData || accountsData.length === 0) {
      throw accErr || new Error("No database accounts found");
    }

    const { data: entriesData } = await supabase
      .from("ledger_entries")
      .select("account_id, debit, credit");

    const entries = entriesData || localEntries;

    return accountsData.map((acc: any) => ({
      ...acc,
      current_balance: calculateAccountBalance(acc, entries),
    }));
  } catch {
    const localTxns = getLocalLedgerTransactions(targetWsId);
    const validTxnIds = new Set(localTxns.map((t) => t.id));
    const validLocalEntries = localEntries.filter((e) => validTxnIds.has(e.transaction_id));
    return localAccounts.map((acc) => ({
      ...acc,
      current_balance: calculateAccountBalance(acc, validLocalEntries),
    }));
  }
}

/**
 * Fetch a single ledger account by ID with current balance
 */
export async function getLedgerAccountById(id: string): Promise<LedgerAccount | null> {
  const accounts = await getLedgerAccounts();
  return accounts.find((a) => a.id === id) || null;
}

/**
 * Find or resolve account by code or purpose
 */
export function findAccountByCode(code: string): LedgerAccount | undefined {
  const accounts = getLocalAccounts();
  return accounts.find((a) => a.account_code === code);
}

/**
 * Create a new Ledger Account (Chart of Accounts Master)
 */
export async function createLedgerAccount(payload: LedgerAccountInsert, workspaceId?: string): Promise<LedgerAccount> {
  const targetWsId = workspaceId || payload.workspace_id || getActiveWorkspaceId();
  const supabase = createClient();
  const now = new Date().toISOString();
  const newAccount: LedgerAccount = {
    ...payload,
    workspace_id: payload.workspace_id || targetWsId,
    id: payload.id || "acc-" + payload.account_code + "-" + Math.random().toString(36).substring(2, 6),
    opening_balance: Number(payload.opening_balance) || 0,
    opening_balance_date: payload.opening_balance_date || now.slice(0, 10),
    is_active: payload.is_active !== undefined ? payload.is_active : true,
    notes: payload.notes || null,
    created_at: now,
    updated_at: now,
    current_balance: Number(payload.opening_balance) || 0,
  };

  const list = getLocalAccounts(targetWsId);
  // Check code uniqueness
  if (list.some((a) => a.account_code === newAccount.account_code)) {
    throw new Error(`Account code ${newAccount.account_code} already exists.`);
  }

  list.push(newAccount);
  saveLocalAccounts(list, targetWsId);

  try {
    const { data, error } = await supabase
      .from("ledger_accounts")
      .insert(newAccount)
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch {
    return newAccount;
  }
}

/**
 * Update an existing Ledger Account
 */
export async function updateLedgerAccount(
  id: string,
  payload: Partial<LedgerAccountInsert>
): Promise<LedgerAccount> {
  const supabase = createClient();
  const list = getLocalAccounts();
  const now = new Date().toISOString();

  const index = list.findIndex((a) => a.id === id);
  if (index === -1) throw new Error("Account not found");

  const updatedAccount: LedgerAccount = {
    ...list[index],
    ...payload,
    updated_at: now,
  };

  list[index] = updatedAccount;
  saveLocalAccounts(list);

  try {
    const { data, error } = await supabase
      .from("ledger_accounts")
      .update({ ...payload, updated_at: now })
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch {
    return updatedAccount;
  }
}

/**
 * Delete safety: If an account has transactions, prevent permanent deletion.
 * Allow archiving (is_active = false) so historical financial records remain intact.
 */
export async function archiveLedgerAccount(
  id: string,
  forceArchive = false
): Promise<{ success: boolean; message: string }> {
  const entries = getLocalEntries().filter((e) => e.account_id === id);

  if (entries.length > 0 && !forceArchive) {
    // Cannot delete permanently - archive instead
    await updateLedgerAccount(id, { is_active: false });
    return {
      success: true,
      message: "Account has recorded historical transactions and was deactivated/archived rather than deleted.",
    };
  }

  // Deactivate account
  await updateLedgerAccount(id, { is_active: false });
  return {
    success: true,
    message: "Account successfully deactivated and archived.",
  };
}

// ─── Double-Entry Posting Engine ────────────────────────────────────────────

export interface PostTransactionParams {
  workspace_id?: string;
  transaction_number?: string;
  transaction_date: string;
  reference_type: string;
  reference_id?: string | null;
  description: string;
  cash_flow_type?: CashFlowType | null;
  created_by?: string | null;
  entries: {
    account_id: string;
    debit: number;
    credit: number;
    notes?: string | null;
  }[];
}

/**
 * Posts a double-entry balanced transaction.
 * Strictly verifies sum(debit) == sum(credit).
 * Guarantees idempotency via (reference_type, reference_id).
 */
export async function postTransaction(
  params: PostTransactionParams
): Promise<{ transaction: LedgerTransaction; entries: LedgerEntry[] }> {
  const {
    transaction_date,
    reference_type,
    reference_id,
    description,
    cash_flow_type,
    created_by = "System",
    entries: rawEntries,
  } = params;

  if (!rawEntries || rawEntries.length < 2) {
    throw new Error("A valid ledger transaction requires at least two journal entries.");
  }

  // 1. Balance verification
  let totalDebit = 0;
  let totalCredit = 0;

  const validEntries = rawEntries.map((e) => {
    const deb = Math.round((Number(e.debit) || 0) * 100) / 100;
    const cred = Math.round((Number(e.credit) || 0) * 100) / 100;
    totalDebit += deb;
    totalCredit += cred;
    return {
      ...e,
      debit: deb,
      credit: cred,
    };
  });

  totalDebit = Math.round(totalDebit * 100) / 100;
  totalCredit = Math.round(totalCredit * 100) / 100;

  if (Math.abs(totalDebit - totalCredit) > 0.01) {
    throw new Error(
      `Unbalanced journal entry! Total Debits (AED ${totalDebit.toFixed(2)}) must equal Total Credits (AED ${totalCredit.toFixed(2)}).`
    );
  }

  const now = new Date().toISOString();
  const supabase = createClient();

  // 2. Idempotency Check: Remove existing transaction for the same reference if any
  let txns = getLocalTransactions();
  let allEntries = getLocalEntries();

  if (reference_type && reference_id) {
    const existingTxn = txns.find(
      (t) => t.reference_type === reference_type && t.reference_id === reference_id
    );
    if (existingTxn) {
      txns = txns.filter((t) => t.id !== existingTxn.id);
      allEntries = allEntries.filter((e) => e.transaction_id !== existingTxn.id);
    }
  }

  const targetWsId = params.workspace_id || getActiveWorkspaceId();
  const txnId = "txn-" + Date.now() + "-" + Math.random().toString(36).substring(2, 6);
  const txnNumber = params.transaction_number || generateTransactionNumber();

  const newTxn: LedgerTransaction = {
    id: txnId,
    workspace_id: targetWsId,
    transaction_number: txnNumber,
    transaction_date: transaction_date || now.slice(0, 10),
    reference_type,
    reference_id: reference_id || null,
    description,
    cash_flow_type: cash_flow_type || undefined,
    created_by: created_by || "System",
    created_at: now,
    total_debit: totalDebit,
    total_credit: totalCredit,
  };

  const createdEntries: LedgerEntry[] = validEntries.map((entry, idx) => ({
    id: "entry-" + txnId + "-" + (idx + 1),
    transaction_id: txnId,
    account_id: entry.account_id,
    debit: entry.debit,
    credit: entry.credit,
    notes: entry.notes || null,
    created_at: now,
  }));

  // Update local caches
  txns.unshift(newTxn);
  allEntries.push(...createdEntries);
  saveLocalTransactions(txns);
  saveLocalEntries(allEntries);

  // Attempt Supabase insert
  try {
    if (reference_type && reference_id) {
      await supabase
        .from("ledger_transactions")
        .delete()
        .eq("reference_type", reference_type)
        .eq("reference_id", reference_id);
    }

    const { data: dbTxn, error: tErr } = await supabase
      .from("ledger_transactions")
      .insert({
        id: newTxn.id,
        transaction_number: newTxn.transaction_number,
        transaction_date: newTxn.transaction_date,
        reference_type: newTxn.reference_type,
        reference_id: newTxn.reference_id,
        description: newTxn.description,
        created_by: newTxn.created_by,
        created_at: newTxn.created_at,
      })
      .select()
      .single();

    if (!tErr && dbTxn) {
      await supabase.from("ledger_entries").insert(
        createdEntries.map((e) => ({
          id: e.id,
          transaction_id: e.transaction_id,
          account_id: e.account_id,
          debit: e.debit,
          credit: e.credit,
          notes: e.notes,
          created_at: e.created_at,
        }))
      );
    }
  } catch (err: any) {
    console.warn("Ledger transaction Supabase fallback to local:", err.message || err);
  }

  return { transaction: newTxn, entries: createdEntries };
}

// ─── Specific Business Flow Postings ────────────────────────────────────────

/**
 * 1. Customer Invoice Posting
 * Debit: Customer Receivable (1100)
 * Credit: Labor & Service Revenue (4001), Spare Parts Revenue (4002), VAT Output Tax (2200)
 */
export async function postInvoiceLedger(invoice: {
  id: string;
  invoice_number: string;
  customer_id?: string;
  customer_name?: string;
  date?: string;
  created_at?: string;
  services_total?: number;
  parts_total?: number;
  subtotal?: number;
  vat_amount?: number;
  total: number;
  created_by?: string | null;
}) {
  const accounts = getLocalAccounts();
  const receivableAcc = accounts.find((a) => a.account_code === "1100") || accounts[2];
  const serviceRevAcc = accounts.find((a) => a.account_code === "4001") || accounts[8];
  const partsRevAcc = accounts.find((a) => a.account_code === "4002") || accounts[9];
  const vatAcc = accounts.find((a) => a.account_code === "2200") || accounts[7];

  const total = Number(invoice.total) || 0;
  if (total <= 0) return null;

  const vat = Number(invoice.vat_amount) || 0;
  const netSubtotal = total - vat;

  const services = Number(invoice.services_total) || 0;
  const parts = Number(invoice.parts_total) || 0;

  const entries: { account_id: string; debit: number; credit: number; notes?: string }[] = [
    {
      account_id: receivableAcc.id,
      debit: total,
      credit: 0,
      notes: `Invoice ${invoice.invoice_number} issued to ${invoice.customer_name || "Customer"}`,
    },
  ];

  if (parts > 0 && services > 0) {
    entries.push(
      { account_id: serviceRevAcc.id, debit: 0, credit: services, notes: "Labor Service Revenue" },
      { account_id: partsRevAcc.id, debit: 0, credit: parts, notes: "Spare Parts Revenue" }
    );
  } else {
    // Default credit to service revenue for remainder
    entries.push({
      account_id: serviceRevAcc.id,
      debit: 0,
      credit: netSubtotal,
      notes: "Workshop Revenue",
    });
  }

  if (vat > 0) {
    entries.push({
      account_id: vatAcc.id,
      debit: 0,
      credit: vat,
      notes: "5% VAT Output Tax",
    });
  }

  return await postTransaction({
    transaction_date: invoice.date || (invoice.created_at ? invoice.created_at.slice(0, 10) : new Date().toISOString().slice(0, 10)),
    reference_type: "invoice",
    reference_id: invoice.id,
    description: `Customer Invoice ${invoice.invoice_number} - ${invoice.customer_name || "Customer"}`,
    created_by: invoice.created_by,
    entries,
  });
}

/**
 * 2. Customer Payment Posting
 * Debit: Cash (1001) or Bank (1002)
 * Credit: Customer Receivable (1100)
 */
export async function postCustomerPaymentLedger(payment: {
  id: string;
  customer_id?: string;
  customer_name?: string;
  invoice_number?: string;
  amount: number;
  payment_method: string;
  reference_number?: string;
  payment_date?: string;
  date?: string;
  created_by?: string | null;
}) {
  const accounts = getLocalAccounts();
  const receivableAcc = accounts.find((a) => a.account_code === "1100") || accounts[2];
  const cashAcc = accounts.find((a) => a.account_code === "1001") || accounts[0];
  const bankAcc = accounts.find((a) => a.account_code === "1002") || accounts[1];

  const amt = Number(payment.amount) || 0;
  if (amt <= 0) return null;

  const isBank =
    payment.payment_method === "bank" ||
    payment.payment_method === "bank_transfer" ||
    payment.payment_method === "credit_card" ||
    payment.payment_method === "card";

  const targetAssetAcc = isBank ? bankAcc : cashAcc;

  const pDate = payment.payment_date || (payment as any).date;
  return await postTransaction({
    transaction_date: pDate ? pDate.slice(0, 10) : new Date().toISOString().slice(0, 10),
    reference_type: "payment",
    reference_id: payment.id,
    description: `Customer Payment from ${payment.customer_name || "Customer"}${payment.invoice_number ? ` for Inv ${payment.invoice_number}` : ""}`,
    created_by: payment.created_by,
    entries: [
      {
        account_id: targetAssetAcc.id,
        debit: amt,
        credit: 0,
        notes: `Received via ${isBank ? "Bank / Card" : "Cash"}`,
      },
      {
        account_id: receivableAcc.id,
        debit: 0,
        credit: amt,
        notes: `Credit Customer Receivable`,
      },
    ],
  });
}

/**
 * 2a. Customer Advance Received Posting
 * Debit: Cash (1001) or Bank (1002/1003)
 * Credit: Customer Advances / Deposits Liability (2300)
 */
export async function postCustomerAdvanceLedger(advance: {
  id: string;
  advance_number: string;
  customer_id?: string;
  customer_name?: string;
  amount: number;
  payment_method: string;
  bank_account_id?: string;
  reference?: string;
  payment_date?: string;
  created_by?: string | null;
}) {
  const accounts = getLocalAccounts();
  const advanceAcc =
    accounts.find((a) => a.account_code === "2300") ||
    accounts.find((a) => a.account_sub_type === "Customer Advance") ||
    accounts.find((a) => a.account_name?.toLowerCase().includes("customer advance")) ||
    { id: "acc-2300" };
  const cashAcc = accounts.find((a) => a.account_code === "1001") || accounts[0];
  let bankAcc = accounts.find((a) => a.account_code === "1002") || accounts[1];
  if (advance.bank_account_id) {
    const matchedBank = accounts.find(
      (a) => a.id === advance.bank_account_id || a.related_entity_id === advance.bank_account_id || a.account_code === advance.bank_account_id
    );
    if (matchedBank) bankAcc = matchedBank;
  }

  const amt = Number(advance.amount) || 0;
  if (amt <= 0) return null;

  const isBank =
    advance.payment_method === "bank" ||
    advance.payment_method === "bank_transfer" ||
    advance.payment_method === "credit_card" ||
    advance.payment_method === "card";

  const targetAssetAcc = isBank ? bankAcc : cashAcc;
  const pDate = advance.payment_date || new Date().toISOString().slice(0, 10);

  return await postTransaction({
    transaction_date: pDate.slice(0, 10),
    reference_type: "customer_advance",
    reference_id: advance.id,
    description: `Customer Advance ${advance.advance_number} from ${advance.customer_name || "Customer"}`,
    created_by: advance.created_by,
    entries: [
      {
        account_id: targetAssetAcc.id,
        debit: amt,
        credit: 0,
        notes: `Received Advance via ${isBank ? "Bank / Card" : "Cash"}`,
      },
      {
        account_id: advanceAcc.id,
        debit: 0,
        credit: amt,
        notes: `Customer Advance Deposit Liability`,
      },
    ],
  });
}

/**
 * 2b. Apply Customer Advance to Invoice Posting
 * Debit: Customer Advances / Deposits Liability (2300)
 * Credit: Accounts Receivable (1100)
 * (No cash/bank movement - cash was recorded at advance receipt)
 */
export async function postApplyAdvanceToInvoiceLedger(params: {
  id: string;
  advance_number: string;
  invoice_number: string;
  customer_name?: string;
  amount: number;
  date?: string;
  created_by?: string | null;
}) {
  const accounts = getLocalAccounts();
  const advanceAcc =
    accounts.find((a) => a.account_code === "2300") ||
    accounts.find((a) => a.account_sub_type === "Customer Advance") ||
    accounts.find((a) => a.account_name?.toLowerCase().includes("customer advance")) ||
    { id: "acc-2300" };
  const receivableAcc = accounts.find((a) => a.account_code === "1100") || accounts[2];

  const amt = Number(params.amount) || 0;
  if (amt <= 0) return null;

  const pDate = params.date || new Date().toISOString().slice(0, 10);

  return await postTransaction({
    transaction_date: pDate.slice(0, 10),
    reference_type: "advance_applied",
    reference_id: params.id,
    description: `Apply Advance ${params.advance_number} to Inv ${params.invoice_number} (${params.customer_name || "Customer"})`,
    created_by: params.created_by,
    entries: [
      {
        account_id: advanceAcc.id,
        debit: amt,
        credit: 0,
        notes: `Settle Customer Advance against Invoice #${params.invoice_number}`,
      },
      {
        account_id: receivableAcc.id,
        debit: 0,
        credit: amt,
        notes: `Credit Accounts Receivable from applied advance`,
      },
    ],
  });
}

/**
 * 2c. Customer Advance Refund Posting
 * Debit: Customer Advances / Deposits Liability (2300)
 * Credit: Cash (1001) or Bank (1002)
 */
export async function postCustomerAdvanceRefundLedger(params: {
  id: string;
  advance_number: string;
  customer_name?: string;
  amount: number;
  payment_method: string;
  bank_account_id?: string;
  date?: string;
  created_by?: string | null;
}) {
  const accounts = getLocalAccounts();
  const advanceAcc =
    accounts.find((a) => a.account_code === "2300") ||
    accounts.find((a) => a.account_sub_type === "Customer Advance") ||
    accounts.find((a) => a.account_name?.toLowerCase().includes("customer advance")) ||
    { id: "acc-2300" };
  const cashAcc = accounts.find((a) => a.account_code === "1001") || accounts[0];
  let bankAcc = accounts.find((a) => a.account_code === "1002") || accounts[1];
  if (params.bank_account_id) {
    const matchedBank = accounts.find(
      (a) => a.id === params.bank_account_id || a.related_entity_id === params.bank_account_id || a.account_code === params.bank_account_id
    );
    if (matchedBank) bankAcc = matchedBank;
  }

  const amt = Number(params.amount) || 0;
  if (amt <= 0) return null;

  const isBank =
    params.payment_method === "bank" ||
    params.payment_method === "bank_transfer" ||
    params.payment_method === "credit_card" ||
    params.payment_method === "card";

  const targetAssetAcc = isBank ? bankAcc : cashAcc;
  const pDate = params.date || new Date().toISOString().slice(0, 10);

  return await postTransaction({
    transaction_date: pDate.slice(0, 10),
    reference_type: "advance_refund",
    reference_id: params.id,
    description: `Refund Customer Advance ${params.advance_number} to ${params.customer_name || "Customer"}`,
    created_by: params.created_by,
    entries: [
      {
        account_id: advanceAcc.id,
        debit: amt,
        credit: 0,
        notes: `Debit Customer Advance Liability (Refunded)`,
      },
      {
        account_id: targetAssetAcc.id,
        debit: 0,
        credit: amt,
        notes: `Refunded via ${isBank ? "Bank" : "Cash"}`,
      },
    ],
  });
}

/**
 * 3. Purchase on Credit Posting
 * Debit: Spare Parts Inventory Asset (1200)
 * Credit: Accounts Payable / Supplier Payable (2001)
 */
export async function postPurchaseLedger(purchase: {
  id: string;
  purchase_invoice_number?: string;
  supplier_id?: string;
  supplier_name?: string;
  date?: string;
  total: number;
  created_by?: string | null;
}) {
  const accounts = getLocalAccounts();
  const inventoryAcc = accounts.find((a) => a.account_code === "1200") || accounts[3];
  const payableAcc = accounts.find((a) => a.account_code === "2001") || accounts[5];

  const total = Number(purchase.total) || 0;
  if (total <= 0) return null;

  return await postTransaction({
    transaction_date: purchase.date || new Date().toISOString().slice(0, 10),
    reference_type: "purchase",
    reference_id: purchase.id,
    description: `Parts Purchase ${purchase.purchase_invoice_number || ""} from ${purchase.supplier_name || "Supplier"}`,
    created_by: purchase.created_by,
    entries: [
      {
        account_id: inventoryAcc.id,
        debit: total,
        credit: 0,
        notes: "Inventory Spare Parts Received",
      },
      {
        account_id: payableAcc.id,
        debit: 0,
        credit: total,
        notes: `Supplier Payable to ${purchase.supplier_name || "Supplier"}`,
      },
    ],
  });
}

/**
 * 4. Supplier Payment Posting
 * Debit: Accounts Payable (2001)
 * Credit: Cash (1001) or Bank (1002)
 */
export async function postSupplierPaymentLedger(payment: {
  id: string;
  supplier_id?: string;
  supplier_name?: string;
  amount: number;
  payment_method: string;
  date?: string;
  created_by?: string | null;
}) {
  const accounts = getLocalAccounts();
  const payableAcc = accounts.find((a) => a.account_code === "2001") || accounts[5];
  const cashAcc = accounts.find((a) => a.account_code === "1001") || accounts[0];
  const bankAcc = accounts.find((a) => a.account_code === "1002") || accounts[1];

  const amt = Number(payment.amount) || 0;
  if (amt <= 0) return null;

  const isBank =
    payment.payment_method === "bank" ||
    payment.payment_method === "bank_transfer" ||
    payment.payment_method === "credit_card" ||
    payment.payment_method === "card";

  const sourceAssetAcc = isBank ? bankAcc : cashAcc;

  return await postTransaction({
    transaction_date: payment.date || new Date().toISOString().slice(0, 10),
    reference_type: "supplier_payment",
    reference_id: payment.id,
    description: `Disbursement to Supplier: ${payment.supplier_name || "Supplier"}`,
    created_by: payment.created_by,
    entries: [
      {
        account_id: payableAcc.id,
        debit: amt,
        credit: 0,
        notes: `Reduce Supplier Payable`,
      },
      {
        account_id: sourceAssetAcc.id,
        debit: 0,
        credit: amt,
        notes: `Paid out from ${isBank ? "Bank" : "Cash Drawer"}`,
      },
    ],
  });
}

/**
 * 5. Expense Posting
 * Debit: Relevant Expense Account (5001 - 5099)
 * Credit: Cash (1001) or Bank (1002)
 */
export async function postExpenseLedger(
  expense: {
    id: string;
    date?: string;
    category: string;
    description?: string | null;
    amount: number;
    payment_method: string;
    paid_to?: string | null;
    reference_number?: string | null;
    created_by?: string | null;
  },
  paidFromAccountId?: string
) {
  const accounts = getLocalAccounts();
  const cashAcc = accounts.find((a) => a.account_code === "1001") || accounts[0];
  const bankAcc = accounts.find((a) => a.account_code === "1002") || accounts[1];

  // Map category to standard expense account code
  const categoryMap: Record<string, string> = {
    Rent: "5001",
    "Salary / Wages": "5002",
    Electricity: "5003",
    Water: "5004",
    "Internet / Phone": "5005",
    Fuel: "5006",
    "Tools & Equipment": "5007",
    Tools: "5007",
    "Workshop Supplies": "5008",
    Maintenance: "5009",
    "Government / Fees": "5010",
    "Government Fees": "5010",
    Miscellaneous: "5099",
  };

  const code = categoryMap[expense.category] || "5099";
  const expenseAcc = accounts.find((a) => a.account_code === code) || accounts.find((a) => a.account_type === "expense") || accounts[11];

  const amt = Number(expense.amount) || 0;
  if (amt <= 0) return null;

  const isBank =
    expense.payment_method === "bank" ||
    expense.payment_method === "bank_transfer" ||
    expense.payment_method === "credit_card";

  const creditAcc = paidFromAccountId
    ? accounts.find((a) => a.id === paidFromAccountId) || (isBank ? bankAcc : cashAcc)
    : isBank
    ? bankAcc
    : cashAcc;

  return await postTransaction({
    transaction_date: expense.date || new Date().toISOString().slice(0, 10),
    reference_type: "expense",
    reference_id: expense.id,
    description: `Expense: ${expense.category} - ${expense.description || "Operational Cost"}${expense.paid_to ? ` (Paid to ${expense.paid_to})` : ""}`,
    created_by: expense.created_by,
    entries: [
      {
        account_id: expenseAcc.id,
        debit: amt,
        credit: 0,
        notes: expense.description || expense.category,
      },
      {
        account_id: creditAcc.id,
        debit: 0,
        credit: amt,
        notes: `Paid from ${creditAcc.account_name}`,
      },
    ],
  });
}

/**
 * 6. Worker Salary Due Posting
 * Debit: Salaries & Wages Expense (5002)
 * Credit: Worker Salaries & Wages Payable (2100)
 */
export async function postWorkerSalaryDue(
  workerId: string,
  amount: number,
  periodDescription: string,
  createdBy = "Admin"
) {
  const accounts = getLocalAccounts();
  const salaryExpAcc = accounts.find((a) => a.account_code === "5002") || accounts[12];
  const workerPayAcc = accounts.find((a) => a.account_code === "2100") || accounts[6];
  const workers = getLocalWorkers();
  const worker = workers.find((w) => w.id === workerId);

  const amt = Number(amount) || 0;
  if (amt <= 0) throw new Error("Salary amount must be greater than zero.");

  return await postTransaction({
    transaction_date: new Date().toISOString().slice(0, 10),
    reference_type: "worker_salary",
    reference_id: `salary-${workerId}-${Date.now()}`,
    description: `Salary Accrual for ${worker?.name || "Worker"}: ${periodDescription}`,
    created_by: createdBy,
    entries: [
      {
        account_id: salaryExpAcc.id,
        debit: amt,
        credit: 0,
        notes: `Salary Expense - ${worker?.name || "Worker"}`,
      },
      {
        account_id: workerPayAcc.id,
        debit: 0,
        credit: amt,
        notes: `Accrued Salary Payable to ${worker?.name || "Worker"}`,
      },
    ],
  });
}

/**
 * 7. Worker Salary Payment Posting
 * Debit: Worker Salaries & Wages Payable (2100)
 * Credit: Cash (1001) or Bank (1002)
 */
export async function postWorkerPayment(
  workerId: string,
  amount: number,
  paymentMethod = "cash",
  bankAccountId?: string,
  notes = "",
  createdBy = "Admin"
) {
  const accounts = getLocalAccounts();
  const workerPayAcc = accounts.find((a) => a.account_code === "2100") || accounts[6];
  const cashAcc = accounts.find((a) => a.account_code === "1001") || accounts[0];
  const bankAcc = accounts.find((a) => a.account_code === "1002") || accounts[1];
  const workers = getLocalWorkers();
  const worker = workers.find((w) => w.id === workerId);

  const amt = Number(amount) || 0;
  if (amt <= 0) throw new Error("Payment amount must be greater than zero.");

  const isBank = paymentMethod === "bank" || paymentMethod === "bank_transfer";
  const sourceAcc = bankAccountId
    ? accounts.find((a) => a.id === bankAccountId) || (isBank ? bankAcc : cashAcc)
    : isBank
    ? bankAcc
    : cashAcc;

  return await postTransaction({
    transaction_date: new Date().toISOString().slice(0, 10),
    reference_type: "worker_payment",
    reference_id: `wpay-${workerId}-${Date.now()}`,
    description: `Salary Disbursement to ${worker?.name || "Worker"} via ${sourceAcc.account_name}`,
    created_by: createdBy,
    entries: [
      {
        account_id: workerPayAcc.id,
        debit: amt,
        credit: 0,
        notes: notes || `Disbursed to ${worker?.name || "Worker"}`,
      },
      {
        account_id: sourceAcc.id,
        debit: 0,
        credit: amt,
        notes: `Paid out from ${sourceAcc.account_name}`,
      },
    ],
  });
}

/**
 * 8. Worker Advance Posting
 * Debit: Staff & Worker Advances (1300)
 * Credit: Cash (1001) or Bank (1002)
 */
export async function postWorkerAdvance(
  workerId: string,
  amount: number,
  paymentMethod = "cash",
  notes = "",
  createdBy = "Admin"
) {
  const accounts = getLocalAccounts();
  const advanceAcc = accounts.find((a) => a.account_code === "1300") || accounts[4];
  const cashAcc = accounts.find((a) => a.account_code === "1001") || accounts[0];
  const bankAcc = accounts.find((a) => a.account_code === "1002") || accounts[1];
  const workers = getLocalWorkers();
  const worker = workers.find((w) => w.id === workerId);

  const amt = Number(amount) || 0;
  if (amt <= 0) throw new Error("Advance amount must be greater than zero.");

  const isBank = paymentMethod === "bank" || paymentMethod === "bank_transfer";
  const sourceAcc = isBank ? bankAcc : cashAcc;

  return await postTransaction({
    transaction_date: new Date().toISOString().slice(0, 10),
    reference_type: "worker_advance",
    reference_id: `adv-${workerId}-${Date.now()}`,
    description: `Staff Advance to ${worker?.name || "Worker"}`,
    created_by: createdBy,
    entries: [
      {
        account_id: advanceAcc.id,
        debit: amt,
        credit: 0,
        notes: notes || `Advance loan to ${worker?.name || "Worker"}`,
      },
      {
        account_id: sourceAcc.id,
        debit: 0,
        credit: amt,
        notes: `Disbursed from ${sourceAcc.account_name}`,
      },
    ],
  });
}

/**
 * 9. Owner Equity Transaction Posting
 * - Capital Introduced: Debit Cash/Bank, Credit Owner Capital (3001)
 * - Drawings/Withdrawal: Debit Owner Drawings (3002), Credit Cash/Bank
 * - Advance: Debit Cash/Bank, Credit Owner Advance (3003)
 */
export async function postOwnerTransaction(params: {
  type: "capital" | "drawings" | "advance" | "reimbursement";
  amount: number;
  payment_method: "cash" | "bank";
  bank_account_id?: string;
  description?: string;
  created_by?: string | null;
}) {
  const { type, amount, payment_method, bank_account_id, description, created_by } = params;
  const accounts = getLocalAccounts();

  const cashAcc = accounts.find((a) => a.account_code === "1001") || accounts[0];
  const bankAcc = accounts.find((a) => a.account_code === "1002") || accounts[1];
  const capitalAcc = accounts.find((a) => a.account_code === "3001") || accounts[21];
  const drawingsAcc = accounts.find((a) => a.account_code === "3002") || accounts[22];
  const advanceAcc = accounts.find((a) => a.account_code === "3003") || accounts[23];

  const amt = Number(amount) || 0;
  if (amt <= 0) throw new Error("Transaction amount must be greater than zero.");

  const targetFinancialAcc =
    payment_method === "bank"
      ? (bank_account_id ? accounts.find((a) => a.id === bank_account_id) || bankAcc : bankAcc)
      : cashAcc;

  if (type === "capital") {
    return await postTransaction({
      transaction_date: new Date().toISOString().slice(0, 10),
      reference_type: "owner_capital",
      reference_id: `cap-${Date.now()}`,
      description: description || `Owner Capital Introduced to ${targetFinancialAcc.account_name}`,
      created_by: created_by || "Owner",
      entries: [
        { account_id: targetFinancialAcc.id, debit: amt, credit: 0, notes: "Cash/Bank Inflow" },
        { account_id: capitalAcc.id, debit: 0, credit: amt, notes: "Owner Equity Capital" },
      ],
    });
  } else if (type === "drawings") {
    return await postTransaction({
      transaction_date: new Date().toISOString().slice(0, 10),
      reference_type: "owner_drawings",
      reference_id: `draw-${Date.now()}`,
      description: description || `Owner Drawing / Personal Withdrawal from ${targetFinancialAcc.account_name}`,
      created_by: created_by || "Owner",
      entries: [
        { account_id: drawingsAcc.id, debit: amt, credit: 0, notes: "Owner Drawings" },
        { account_id: targetFinancialAcc.id, debit: 0, credit: amt, notes: "Cash/Bank Outflow" },
      ],
    });
  } else if (type === "advance") {
    return await postTransaction({
      transaction_date: new Date().toISOString().slice(0, 10),
      reference_type: "owner_advance",
      reference_id: `adv-${Date.now()}`,
      description: description || `Owner Advance Injected to ${targetFinancialAcc.account_name}`,
      created_by: created_by || "Owner",
      entries: [
        { account_id: targetFinancialAcc.id, debit: amt, credit: 0, notes: "Cash/Bank Inflow" },
        { account_id: advanceAcc.id, debit: 0, credit: amt, notes: "Owner Short-term Advance" },
      ],
    });
  } else {
    // Reimbursement
    const miscExpAcc = accounts.find((a) => a.account_code === "5099") || accounts[20];
    return await postTransaction({
      transaction_date: new Date().toISOString().slice(0, 10),
      reference_type: "owner_reimbursement",
      reference_id: `reimb-${Date.now()}`,
      description: description || "Owner Expense Reimbursement",
      created_by: created_by || "Owner",
      entries: [
        { account_id: miscExpAcc.id, debit: amt, credit: 0, notes: "Reimbursed Expense" },
        { account_id: targetFinancialAcc.id, debit: 0, credit: amt, notes: "Reimbursement Payout" },
      ],
    });
  }
}

// ─── Worker Management ──────────────────────────────────────────────────────

export async function getWorkers(workspaceId?: string): Promise<Worker[]> {
  const targetWsId = workspaceId || getActiveWorkspaceId();
  const supabase = createClient();
  const localWorkers = getLocalWorkers(targetWsId);

  try {
    const { data, error } = await supabase
      .from("workers")
      .select("*")
      .eq("workspace_id", targetWsId)
      .order("name", { ascending: true });
    if (error || !data || data.length === 0) return localWorkers;
    return data;
  } catch {
    return localWorkers;
  }
}

export async function createWorker(payload: WorkerInsert, workspaceId?: string): Promise<Worker> {
  const targetWsId = workspaceId || getActiveWorkspaceId();
  const supabase = createClient();
  const now = new Date().toISOString();
  const newWorker: Worker = {
    ...payload,
    id: payload.id || "worker-" + Date.now() + "-" + Math.random().toString(36).substring(2, 6),
    workspace_id: payload.workspace_id || targetWsId,
    basic_salary: Number(payload.basic_salary) || 0,
    opening_balance: Number(payload.opening_balance) || 0,
    created_at: now,
    updated_at: now,
  };

  const list = getLocalWorkers(targetWsId);
  list.push(newWorker);
  saveLocalWorkers(list, targetWsId);

  try {
    const { data, error } = await supabase.from("workers").insert(newWorker).select().single();
    if (error) throw error;
    return data;
  } catch {
    return newWorker;
  }
}

export async function updateWorker(id: string, payload: Partial<WorkerInsert>): Promise<Worker> {
  const supabase = createClient();
  const list = getLocalWorkers();
  const idx = list.findIndex((w) => w.id === id);
  if (idx === -1) throw new Error("Worker not found");

  const updated = { ...list[idx], ...payload, updated_at: new Date().toISOString() };
  list[idx] = updated;
  saveLocalWorkers(list);

  try {
    const { data, error } = await supabase.from("workers").update(payload).eq("id", id).select().single();
    if (error) throw error;
    return data;
  } catch {
    return updated;
  }
}

// ─── Bank Accounts Management ───────────────────────────────────────────────

export async function getBankAccounts(workspaceId?: string): Promise<BankAccount[]> {
  const targetWsId = workspaceId || getActiveWorkspaceId();
  const supabase = createClient();
  const localBanks = getLocalBankAccounts(targetWsId);
  const accounts = await getLedgerAccounts(targetWsId);

  try {
    const { data, error } = await supabase
      .from("bank_accounts")
      .select("*")
      .eq("workspace_id", targetWsId)
      .order("bank_name");
    const banks = error || !data || data.length === 0 ? localBanks : data;

    // Attach calculated balance from ledger accounts if mapped
    return banks.map((b: any) => {
      const mappedLedger = accounts.find((a) => a.related_entity_id === b.id || a.account_name.includes(b.bank_name));
      return {
        ...b,
        current_balance: mappedLedger?.current_balance !== undefined ? mappedLedger.current_balance : b.opening_balance,
      };
    });
  } catch {
    return localBanks.map((b) => {
      const mappedLedger = accounts.find((a) => a.related_entity_id === b.id || a.account_name.includes(b.bank_name));
      return {
        ...b,
        current_balance: mappedLedger?.current_balance !== undefined ? mappedLedger.current_balance : b.opening_balance,
      };
    });
  }
}

export async function createBankAccount(payload: BankAccountInsert, workspaceId?: string): Promise<BankAccount> {
  const targetWsId = workspaceId || getActiveWorkspaceId();
  const supabase = createClient();
  const now = new Date().toISOString();
  const newBank: BankAccount = {
    ...payload,
    id: payload.id || "bank-" + Date.now() + "-" + Math.random().toString(36).substring(2, 6),
    workspace_id: payload.workspace_id || targetWsId,
    opening_balance: Number(payload.opening_balance) || 0,
    created_at: now,
    updated_at: now,
    current_balance: Number(payload.opening_balance) || 0,
  };

  const list = getLocalBankAccounts(targetWsId);
  list.push(newBank);
  saveLocalBankAccounts(list, targetWsId);

  // Automatically create a corresponding Ledger Account under Assets -> Bank
  try {
    const codeNum = 1002 + list.length;
    await createLedgerAccount({
      account_code: String(codeNum),
      account_name: `${newBank.bank_name} - ${newBank.account_name}`,
      account_type: "asset",
      account_sub_type: "Bank",
      related_entity_type: "bank",
      related_entity_id: newBank.id,
      workspace_id: targetWsId,
      opening_balance: newBank.opening_balance,
      opening_balance_date: now.slice(0, 10),
      is_active: true,
      notes: `Bank Account reference ${newBank.account_number_last_digits || ""}`,
    });
  } catch (err) {
    console.warn("Auto-create ledger account for bank notice:", err);
  }

  try {
    const { data, error } = await supabase.from("bank_accounts").insert(newBank).select().single();
    if (error) throw error;
    return data;
  } catch {
    return newBank;
  }
}

// ─── Running Balances & Detailed Ledger Statements ──────────────────────────

export interface LedgerStatementLine {
  id?: string;
  transaction_id?: string;
  date: string;
  transaction_number: string;
  reference_type: string;
  reference_id: string | null;
  description: string;
  counter_account_id?: string;
  counter_account_name?: string;
  counter_account_code?: string;
  counter_accounts?: string;
  debit: number;
  credit: number;
  running_balance: number;
  source_module?: string;
  payment_method?: string;
  created_by?: string;
  notes?: string | null;
  is_reversal?: boolean;
  entries?: {
    account_id: string;
    account_name: string;
    account_code: string;
    debit: number;
    credit: number;
    notes?: string | null;
  }[];
}

export interface AccountLedgerStatement {
  account: LedgerAccount;
  opening_balance: number;
  total_debit: number;
  total_credit: number;
  closing_balance: number;
  lines: LedgerStatementLine[];
}

export function getSourceModuleLabel(referenceType?: string | null): string {
  if (!referenceType) return "Manual Entry";
  const ref = referenceType.toLowerCase();
  if (ref === "invoice") return "Invoice";
  if (ref === "payment") return "Customer Payment";
  if (ref === "purchase") return "Supplier Purchase";
  if (ref === "supplier_payment") return "Supplier Payment";
  if (ref === "expense") return "Expense";
  if (ref === "transfer") return "Transfer Money";
  if (ref === "transfer_reversal") return "Transfer Reversal";
  if (ref === "worker_payment") return "Worker Payment";
  if (ref === "worker_advance") return "Worker Advance";
  if (ref === "worker_salary_due") return "Worker Salary Due";
  if (ref === "owner_transaction") return "Owner Capital / Drawing";
  if (ref === "manual_journal") return "Manual Journal";
  if (ref === "manual_entry") return "Manual Account Entry";
  if (ref === "reversal") return "Reversal";
  return referenceType.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Returns chronological ledger statement with running balance for any account
 */
export async function getAccountLedgerStatement(
  accountId: string,
  startDate?: string,
  endDate?: string
): Promise<AccountLedgerStatement> {
  const allAccounts = await getAllTransferrableAccounts();
  const accMap = new Map<string, TransferrableAccountItem>();
  allAccounts.forEach((a) => accMap.set(a.id, a));

  let account = allAccounts.find(
    (a) => a.id === accountId || a.account_code === accountId || (a.related_entity_id && a.related_entity_id === accountId)
  );
  if (!account) {
    const base = await getLedgerAccounts();
    account = base.find((a) => a.id === accountId || a.account_code === accountId);
  }
  if (!account) throw new Error("Account not found");

  const txns = getLocalTransactions();
  const entries = getLocalEntries();

  const txnMap = new Map<string, LedgerTransaction>();
  txns.forEach((t) => txnMap.set(t.id, t));

  // Filter entries for this account
  // If this is a linked customer/supplier/worker entity, also check if any legacy/fallback entry references them
  const targetId = account.id;
  const entityId = account.related_entity_id;
  const entityType = account.related_entity_type;

  const accountEntries = entries.filter((e) => {
    if (e.account_id === targetId) return true;
    if (entityId && entityType === "customer") {
      // Check if entry on Accounts Receivable (1100) specifically targets this customer
      const a = accMap.get(e.account_id);
      if (a && a.account_code === "1100") {
        const txn = txnMap.get(e.transaction_id);
        if (txn && ((txn.reference_id && txn.reference_id.includes(entityId)) || (txn.description && txn.description.includes(account!.account_name)))) {
          return true;
        }
      }
    }
    if (entityId && entityType === "supplier") {
      const a = accMap.get(e.account_id);
      if (a && a.account_code === "2001") {
        const txn = txnMap.get(e.transaction_id);
        if (txn && ((txn.reference_id && txn.reference_id.includes(entityId)) || (txn.description && txn.description.includes(account!.account_name)))) {
          return true;
        }
      }
    }
    return false;
  });

  // Sort chronologically
  const enriched = accountEntries
    .map((e) => {
      const txn = txnMap.get(e.transaction_id);
      return {
        entry: e,
        txn,
        date: txn?.transaction_date || (e.created_at ? e.created_at.slice(0, 10) : ""),
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date));

  let running = Number(account.opening_balance) || 0;
  const isAssetOrExp = account.account_type === "asset" || account.account_type === "expense";

  let totalDebit = 0;
  let totalCredit = 0;

  const lines: LedgerStatementLine[] = [];

  enriched.forEach((item) => {
    const deb = Number(item.entry.debit) || 0;
    const cred = Number(item.entry.credit) || 0;
    totalDebit += deb;
    totalCredit += cred;

    if (isAssetOrExp) {
      running += deb - cred;
    } else {
      running += cred - deb;
    }

    if ((!startDate || item.date >= startDate) && (!endDate || item.date <= endDate)) {
      const otherEntries = item.txn ? entries.filter((e) => e.transaction_id === item.txn?.id && e.id !== item.entry.id) : [];
      const counterNames = otherEntries
        .map((oe) => {
          const ca = accMap.get(oe.account_id);
          return ca ? `${ca.account_name} (${ca.account_code})` : oe.account_id;
        })
        .filter(Boolean)
        .join(", ") || "—";

      const firstCounter = otherEntries.length > 0 ? accMap.get(otherEntries[0].account_id) : undefined;
      const allTxnEntries = item.txn ? entries.filter((e) => e.transaction_id === item.txn?.id) : [item.entry];

      const detailedEntries = allTxnEntries.map((te) => {
        const a = accMap.get(te.account_id);
        return {
          account_id: te.account_id,
          account_name: a?.account_name || te.account_id,
          account_code: a?.account_code || "—",
          debit: Number(te.debit) || 0,
          credit: Number(te.credit) || 0,
          notes: te.notes,
        };
      });

      lines.push({
        id: item.entry.id,
        transaction_id: item.txn?.id || item.entry.transaction_id,
        date: item.date,
        transaction_number: item.txn?.transaction_number || "—",
        reference_type: item.txn?.reference_type || "manual",
        reference_id: item.txn?.reference_id || null,
        description: item.txn?.description || item.entry.notes || "General Entry",
        counter_account_id: firstCounter?.id,
        counter_account_name: firstCounter?.account_name || counterNames,
        counter_account_code: firstCounter?.account_code,
        counter_accounts: counterNames,
        debit: deb,
        credit: cred,
        running_balance: Math.round(running * 100) / 100,
        source_module: getSourceModuleLabel(item.txn?.reference_type),
        payment_method: (item.txn as any)?.cash_flow_type || undefined,
        created_by: item.txn?.created_by || "System",
        notes: item.entry.notes,
        is_reversal: item.txn?.reference_type === "reversal" || item.txn?.reference_type === "transfer_reversal",
        entries: detailedEntries,
      });
    }
  });

  return {
    account,
    opening_balance: Number(account.opening_balance) || 0,
    total_debit: Math.round(totalDebit * 100) / 100,
    total_credit: Math.round(totalCredit * 100) / 100,
    closing_balance: Math.round(running * 100) / 100,
    lines,
  };
}

/**
 * Customer Financial Ledger Statement
 */
export async function getCustomerLedgerStatement(customerId: string) {
  const customers = getLocalCustomers();
  const customer = customers.find((c) => c.id === customerId);

  const txns = getLocalTransactions();
  const entries = getLocalEntries();
  const accounts = getLocalAccounts();
  const recAcc = accounts.find((a) => a.account_code === "1100");

  const lines: LedgerStatementLine[] = [];
  let running = 0;
  let totalInvoiced = 0;
  let totalPaid = 0;

  // Filter transactions related to this customer
  const relatedTxns = txns
    .filter((t) => {
      if (t.reference_type === "invoice" || t.reference_type === "payment") {
        return (
          t.description.toLowerCase().includes(customer?.name?.toLowerCase() || "") ||
          t.reference_id?.includes(customerId)
        );
      }
      return false;
    })
    .sort((a, b) => a.transaction_date.localeCompare(b.transaction_date));

  relatedTxns.forEach((txn) => {
    const entry = entries.find((e) => e.transaction_id === txn.id && (!recAcc || e.account_id === recAcc.id));
    if (entry) {
      const deb = Number(entry.debit) || 0;
      const cred = Number(entry.credit) || 0;
      running += deb - cred;
      totalInvoiced += deb;
      totalPaid += cred;

      lines.push({
        date: txn.transaction_date,
        transaction_number: txn.transaction_number,
        reference_type: txn.reference_type,
        reference_id: txn.reference_id,
        description: txn.description,
        debit: deb,
        credit: cred,
        running_balance: Math.round(running * 100) / 100,
        notes: entry.notes,
      });
    }
  });

  return {
    customer,
    totalInvoiced: Math.round(totalInvoiced * 100) / 100,
    totalPaid: Math.round(totalPaid * 100) / 100,
    outstandingBalance: Math.round(running * 100) / 100,
    lines,
  };
}

/**
 * Supplier Financial Ledger Statement
 */
export async function getSupplierLedgerStatement(supplierId: string) {
  const suppliers = getLocalSuppliers();
  const supplier = suppliers.find((s) => s.id === supplierId);

  const txns = getLocalTransactions();
  const entries = getLocalEntries();
  const accounts = getLocalAccounts();
  const payAcc = accounts.find((a) => a.account_code === "2001");

  const lines: LedgerStatementLine[] = [];
  let running = 0;
  let totalPurchases = 0;
  let totalPayments = 0;

  const relatedTxns = txns
    .filter((t) => {
      if (t.reference_type === "purchase" || t.reference_type === "supplier_payment") {
        return (
          t.description.toLowerCase().includes(supplier?.name?.toLowerCase() || "") ||
          t.reference_id?.includes(supplierId)
        );
      }
      return false;
    })
    .sort((a, b) => a.transaction_date.localeCompare(b.transaction_date));

  relatedTxns.forEach((txn) => {
    const entry = entries.find((e) => e.transaction_id === txn.id && (!payAcc || e.account_id === payAcc.id));
    if (entry) {
      const deb = Number(entry.debit) || 0;
      const cred = Number(entry.credit) || 0;
      running += cred - deb; // Liability normal credit
      totalPurchases += cred;
      totalPayments += deb;

      lines.push({
        date: txn.transaction_date,
        transaction_number: txn.transaction_number,
        reference_type: txn.reference_type,
        reference_id: txn.reference_id,
        description: txn.description,
        debit: deb,
        credit: cred,
        running_balance: Math.round(running * 100) / 100,
        notes: entry.notes,
      });
    }
  });

  return {
    supplier,
    totalPurchases: Math.round(totalPurchases * 100) / 100,
    totalPayments: Math.round(totalPayments * 100) / 100,
    remainingBalance: Math.round(running * 100) / 100,
    lines,
  };
}

/**
 * Worker Financial Ledger Statement
 */
export async function getWorkerLedgerStatement(workerId: string) {
  const workers = getLocalWorkers();
  const worker = workers.find((w) => w.id === workerId);

  const txns = getLocalTransactions();
  const entries = getLocalEntries();
  const accounts = getLocalAccounts();
  const workerPayAcc = accounts.find((a) => a.account_code === "2100");

  const lines: LedgerStatementLine[] = [];
  let running = Number(worker?.opening_balance) || 0;
  let totalSalaryDue = 0;
  let totalPaid = 0;

  const relatedTxns = txns
    .filter((t) => {
      return (
        (t.reference_type === "worker_salary" ||
          t.reference_type === "worker_payment" ||
          t.reference_type === "worker_advance") &&
        (t.reference_id?.includes(workerId) || t.description.toLowerCase().includes(worker?.name?.toLowerCase() || ""))
      );
    })
    .sort((a, b) => a.transaction_date.localeCompare(b.transaction_date));

  relatedTxns.forEach((txn) => {
    const entry = entries.find((e) => e.transaction_id === txn.id && (!workerPayAcc || e.account_id === workerPayAcc.id));
    if (entry) {
      const deb = Number(entry.debit) || 0;
      const cred = Number(entry.credit) || 0;
      running += cred - deb;
      totalSalaryDue += cred;
      totalPaid += deb;

      lines.push({
        date: txn.transaction_date,
        transaction_number: txn.transaction_number,
        reference_type: txn.reference_type,
        reference_id: txn.reference_id,
        description: txn.description,
        debit: deb,
        credit: cred,
        running_balance: Math.round(running * 100) / 100,
        notes: entry.notes,
      });
    }
  });

  return {
    worker,
    openingBalance: Number(worker?.opening_balance) || 0,
    totalSalaryDue: Math.round(totalSalaryDue * 100) / 100,
    totalPaid: Math.round(totalPaid * 100) / 100,
    remainingPayable: Math.round(running * 100) / 100,
    lines,
  };
}

// ─── Account Dashboard Metrics ──────────────────────────────────────────────

export interface AccountDashboardMetrics {
  cashBalance: number;
  totalBankBalance: number;
  customerReceivables: number;
  supplierPayables: number;
  workerPayables: number;
  totalExpensesThisMonth: number;
  totalIncomeThisMonth: number;
  ownerCapital: number;
  netCashFlow: number;
}

export async function getAccountDashboardMetrics(): Promise<AccountDashboardMetrics> {
  const accounts = await getLedgerAccounts();
  const txns = getLocalTransactions();
  const entries = getLocalEntries();

  const now = new Date();
  const firstOfMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;

  let cashBalance = 0;
  let totalBankBalance = 0;
  let customerReceivables = 0;
  let supplierPayables = 0;
  let workerPayables = 0;
  let ownerCapital = 0;

  // 1. Calculate Total Bank Balance: Sum of ALL active Bank Accounts (ADCB, FAB, etc.)
  try {
    const bankList = await getBankAccounts();
    if (bankList && bankList.length > 0) {
      bankList.forEach((b) => {
        if (b.status === "active") {
          totalBankBalance += Number(b.current_balance !== undefined ? b.current_balance : b.opening_balance) || 0;
        }
      });
    }
  } catch {
    // fallback
  }

  // 2. Iterate accounts for cash, customer receivables, supplier payables, workers, and fallback banks
  accounts.forEach((acc) => {
    const bal = acc.current_balance || 0;
    const sub = (acc.account_sub_type || "").toLowerCase();
    const type = (acc.account_type || "").toLowerCase();

    if (sub === "cash" || acc.account_code === "1001") {
      cashBalance += bal;
    } else if (totalBankBalance === 0 && (sub.includes("bank") || acc.related_entity_type === "bank")) {
      totalBankBalance += bal;
    } else if (sub.includes("customer") || acc.account_code === "1100") {
      customerReceivables += bal;
    } else if (sub.includes("supplier") || acc.account_code === "2001") {
      supplierPayables += bal;
    } else if (sub.includes("worker") || acc.account_code === "2100") {
      workerPayables += bal;
    } else if (sub.includes("owner capital") || acc.account_code === "3001") {
      ownerCapital += bal;
    }
  });

  // Calculate monthly expenses & income from transactions
  let totalExpensesThisMonth = 0;
  let totalIncomeThisMonth = 0;

  const txnMap = new Map<string, LedgerTransaction>();
  txns.forEach((t) => txnMap.set(t.id, t));

  const expAccounts = new Set(accounts.filter((a) => a.account_type === "expense").map((a) => a.id));
  const incAccounts = new Set(accounts.filter((a) => a.account_type === "income").map((a) => a.id));

  entries.forEach((e) => {
    const txn = txnMap.get(e.transaction_id);
    if (txn && txn.transaction_date >= firstOfMonth) {
      if (expAccounts.has(e.account_id)) {
        totalExpensesThisMonth += (Number(e.debit) || 0) - (Number(e.credit) || 0);
      } else if (incAccounts.has(e.account_id)) {
        totalIncomeThisMonth += (Number(e.credit) || 0) - (Number(e.debit) || 0);
      }
    }
  });

  // Fallback check: if no ledger transactions exist yet, pull active monthly expenses from expenses module
  if (totalExpensesThisMonth === 0) {
    const localExpenses = getLocalExpenses().filter((exp) => !exp.is_deleted && (!exp.date || exp.date >= firstOfMonth));
    localExpenses.forEach((exp) => {
      totalExpensesThisMonth += Number(exp.amount) || 0;
    });
  }

  const netCashFlow = Math.round((cashBalance + totalBankBalance) * 100) / 100;

  return {
    cashBalance: Math.round(cashBalance * 100) / 100,
    totalBankBalance: Math.round(totalBankBalance * 100) / 100,
    customerReceivables: Math.max(0, Math.round(customerReceivables * 100) / 100),
    supplierPayables: Math.max(0, Math.round(supplierPayables * 100) / 100),
    workerPayables: Math.max(0, Math.round(workerPayables * 100) / 100),
    totalExpensesThisMonth: Math.round(totalExpensesThisMonth * 100) / 100,
    totalIncomeThisMonth: Math.round(totalIncomeThisMonth * 100) / 100,
    ownerCapital: Math.round(ownerCapital * 100) / 100,
    netCashFlow,
  };
}

// ─── Fast Universal Search Across Accounts / Ledger ─────────────────────────

export type LedgerSearchFilter =
  | "all"
  | "customers"
  | "suppliers"
  | "workers"
  | "banks"
  | "owner"
  | "asset"
  | "liability"
  | "income"
  | "expense"
  | "equity";

export interface LedgerSearchResult {
  id: string;
  name: string;
  account_code: string;
  account_type: string;
  account_sub_type?: string;
  related_entity_type: "customer" | "supplier" | "worker" | "bank" | "owner" | "ledger_account" | "transaction";
  related_entity_id?: string;
  balance: number;
  reference?: string;
  phone?: string;
  raw?: any;
}

export interface SearchAccountsOptions {
  query: string;
  filter?: LedgerSearchFilter | string;
  limit?: number;
  dataContext?: {
    accounts?: LedgerAccount[];
    customers?: any[];
    suppliers?: any[];
    workers?: Worker[];
    bankAccounts?: BankAccount[];
    transactions?: LedgerTransaction[];
  };
}

/**
 * High-performance search across:
 * - Ledger Account Name & Code & Type & Sub-Type
 * - Customer Name, Phone, TRN, Company
 * - Supplier Name, Phone, TRN, Company
 * - Worker Name, Phone, Job Position
 * - Bank Name, Account Name, Account Digits
 * - Owner / Admin Equity Accounts
 * - Transaction Number, Invoice Number, Reference Number
 */
export async function searchAccountsAndLedger(
  options: SearchAccountsOptions
): Promise<LedgerSearchResult[]> {
  const { query, filter = "all", limit = 20, dataContext } = options;
  const q = (query || "").trim().toLowerCase();
  if (q.length < 2) return [];

  const normalizedFilter = (filter || "all").toLowerCase();
  const results: LedgerSearchResult[] = [];

  // 1. Search Chart of Accounts (Ledger Accounts)
  const allowAccounts =
    normalizedFilter === "all" ||
    ["asset", "liability", "income", "expense", "equity", "banks", "owner"].includes(normalizedFilter);

  if (allowAccounts) {
    const accList = dataContext?.accounts || (await getLedgerAccounts());
    for (const acc of accList) {
      if (
        (normalizedFilter === "asset" && acc.account_type !== "asset") ||
        (normalizedFilter === "liability" && acc.account_type !== "liability") ||
        (normalizedFilter === "income" && acc.account_type !== "income") ||
        (normalizedFilter === "expense" && acc.account_type !== "expense") ||
        (normalizedFilter === "equity" && acc.account_type !== "equity") ||
        (normalizedFilter === "banks" && acc.account_sub_type !== "Bank") ||
        (normalizedFilter === "owner" && acc.account_type !== "equity" && !acc.account_sub_type.toLowerCase().includes("owner"))
      ) {
        continue;
      }

      const matchName = (acc.account_name || "").toLowerCase().includes(q);
      const matchCode = (acc.account_code || "").toLowerCase().includes(q);
      const matchType = (acc.account_type || "").toLowerCase().includes(q);
      const matchSubType = (acc.account_sub_type || "").toLowerCase().includes(q);
      const matchNotes = (acc.notes || "").toLowerCase().includes(q);

      if (matchName || matchCode || matchType || matchSubType || matchNotes) {
        let relType: LedgerSearchResult["related_entity_type"] = "ledger_account";
        if (acc.account_sub_type === "Bank") relType = "bank";
        else if (acc.account_type === "equity" || acc.account_sub_type.toLowerCase().includes("owner")) relType = "owner";

        results.push({
          id: `acc-${acc.id}`,
          name: acc.account_name,
          account_code: acc.account_code,
          account_type: `${acc.account_type.toUpperCase()} • ${acc.account_sub_type}`,
          account_sub_type: acc.account_sub_type,
          related_entity_type: relType,
          related_entity_id: acc.id,
          balance: Number(acc.current_balance) || 0,
          reference: acc.account_sub_type,
          raw: acc,
        });
      }
    }
  }

  // 2. Search Customer Accounts
  if (normalizedFilter === "all" || normalizedFilter === "customers" || normalizedFilter === "asset") {
    let custList = dataContext?.customers;
    if (!custList) {
      try {
        const { getLocalCustomers } = await import("./customer-service");
        custList = getLocalCustomers();
      } catch {
        custList = [];
      }
    }

    for (const cust of custList) {
      if (cust.is_deleted) continue;
      const matchName = (cust.name || "").toLowerCase().includes(q);
      const matchCompany = (cust.company_name || "").toLowerCase().includes(q);
      const matchPhone = (cust.mobile || cust.phone || "").toLowerCase().includes(q);
      const matchEmail = (cust.email || "").toLowerCase().includes(q);
      const matchTrn = (cust.trn_number || "").toLowerCase().includes(q);
      const matchCode = `cust-${(cust.id || "").slice(-4)}`.toLowerCase().includes(q);

      if (matchName || matchCompany || matchPhone || matchEmail || matchTrn || matchCode) {
        const custCode = cust.trn_number ? `TRN: ${cust.trn_number}` : `CUST-${(cust.id || "0000").slice(-4).toUpperCase()}`;
        results.push({
          id: `cust-${cust.id}`,
          name: cust.company_name ? `${cust.name} (${cust.company_name})` : cust.name,
          account_code: custCode,
          account_type: "Customer Account",
          account_sub_type: "Customer Receivable",
          related_entity_type: "customer",
          related_entity_id: cust.id,
          balance: Number(cust.outstanding_balance) || 0,
          reference: cust.mobile || cust.phone || cust.trn_number || undefined,
          phone: cust.mobile || cust.phone || undefined,
          raw: cust,
        });
      }
    }
  }

  // 3. Search Supplier Accounts
  if (normalizedFilter === "all" || normalizedFilter === "suppliers" || normalizedFilter === "liability") {
    let suppList = dataContext?.suppliers;
    if (!suppList) {
      try {
        const { getLocalSuppliers } = await import("./supplier-service");
        suppList = getLocalSuppliers();
      } catch {
        suppList = [];
      }
    }

    for (const supp of suppList) {
      if (supp.is_deleted) continue;
      const matchName = (supp.name || "").toLowerCase().includes(q);
      const matchCompany = (supp.company_name || "").toLowerCase().includes(q);
      const matchPhone = (supp.phone || supp.mobile || "").toLowerCase().includes(q);
      const matchEmail = (supp.email || "").toLowerCase().includes(q);
      const matchTrn = (supp.trn_number || "").toLowerCase().includes(q);
      const matchCode = `supp-${(supp.id || "").slice(-4)}`.toLowerCase().includes(q);

      if (matchName || matchCompany || matchPhone || matchEmail || matchTrn || matchCode) {
        const suppCode = `SUPP-${(supp.id || "0000").slice(-4).toUpperCase()}`;
        results.push({
          id: `supp-${supp.id}`,
          name: supp.company_name ? `${supp.name} (${supp.company_name})` : supp.name,
          account_code: suppCode,
          account_type: "Supplier Account",
          account_sub_type: "Supplier Payable",
          related_entity_type: "supplier",
          related_entity_id: supp.id,
          balance: Number(supp.total_pending || supp.outstanding_balance) || 0,
          reference: supp.phone || supp.email || undefined,
          phone: supp.phone || undefined,
          raw: supp,
        });
      }
    }
  }

  // 4. Search Worker Accounts
  if (normalizedFilter === "all" || normalizedFilter === "workers" || normalizedFilter === "liability") {
    const workerList = dataContext?.workers || (await getWorkers());
    for (const worker of workerList) {
      const matchName = (worker.name || "").toLowerCase().includes(q);
      const matchPhone = (worker.phone || "").toLowerCase().includes(q);
      const matchRole = (worker.job_position || "").toLowerCase().includes(q);
      const matchCode = `wrk-${(worker.id || "").slice(-4)}`.toLowerCase().includes(q);

      if (matchName || matchPhone || matchRole || matchCode) {
        results.push({
          id: `wrk-${worker.id}`,
          name: worker.name,
          account_code: `WRK-${(worker.id || "0000").slice(-4).toUpperCase()}`,
          account_type: `Worker Account (${worker.job_position})`,
          account_sub_type: "Worker Payable",
          related_entity_type: "worker",
          related_entity_id: worker.id,
          balance: Number(worker.opening_balance) || 0,
          reference: worker.phone ? `Phone: ${worker.phone}` : worker.job_position,
          phone: worker.phone || undefined,
          raw: worker,
        });
      }
    }
  }

  // 5. Search Bank Accounts
  if (normalizedFilter === "all" || normalizedFilter === "banks" || normalizedFilter === "asset") {
    const bankList = dataContext?.bankAccounts || (await getBankAccounts());
    for (const b of bankList) {
      const matchBank = (b.bank_name || "").toLowerCase().includes(q);
      const matchAcc = (b.account_name || "").toLowerCase().includes(q);
      const matchDigits = (b.account_number_last_digits || "").toLowerCase().includes(q);

      if (matchBank || matchAcc || matchDigits) {
        results.push({
          id: `bank-${b.id}`,
          name: `${b.bank_name} - ${b.account_name}`,
          account_code: b.account_number_last_digits ? `****${b.account_number_last_digits}` : "BANK-ACC",
          account_type: "Bank Account",
          account_sub_type: "Bank",
          related_entity_type: "bank",
          related_entity_id: b.id,
          balance: Number(b.opening_balance) || 0,
          reference: b.account_name,
          raw: b,
        });
      }
    }
  }

  // 6. Search Transactions & Invoices & Reference numbers
  if (normalizedFilter === "all") {
    const txnList = dataContext?.transactions || getLocalLedgerTransactions();
    for (const txn of txnList) {
      const matchNumber = (txn.transaction_number || "").toLowerCase().includes(q);
      const matchRef = (txn.reference_id || "").toLowerCase().includes(q);
      const matchDesc = (txn.description || "").toLowerCase().includes(q);

      if (matchNumber || matchRef || matchDesc) {
        results.push({
          id: `txn-${txn.id}`,
          name: txn.description,
          account_code: txn.transaction_number,
          account_type: `Journal Transaction (${(txn.reference_type || "").replace(/_/g, " ").toUpperCase()})`,
          related_entity_type: "transaction",
          related_entity_id: txn.id,
          balance: 0,
          reference: txn.reference_id ? `Ref: ${txn.reference_id}` : txn.transaction_date,
          raw: txn,
        });
      }
    }
  }

  return results.slice(0, limit);
}

// ─── MONEY TRANSFERS MODULE ──────────────────────────────────────────────────

export type DifferenceHandling =
  | "saving_account"
  | "receivable_account"
  | "payable_account"
  | "bank_fee"
  | "other_expense"
  | "adjustment"
  | "cancel";

export interface TransferrableAccountItem extends LedgerAccount {
  phone?: string;
  address?: string;
  entity_name?: string;
}

export interface MoneyTransferParams {
  id?: string;
  transfer_date?: string;
  cash_flow_type?: CashFlowType;
  // Step 1: Payable Account
  from_account_id: string;
  payable_amount?: number;
  payable_remarks?: string;
  // Step 2: Receivable Account
  to_account_id: string;
  receivable_amount?: number;
  receivable_remarks?: string;
  // Step 3: Optional Saving / Difference Account
  saving_account_id?: string;
  saving_amount?: number;
  saving_remarks?: string;
  // Difference Handling
  difference_handling?: DifferenceHandling;
  // Amounts & Fees (backward compatibility)
  amount?: number;
  fee?: number;
  reference_number?: string;
  notes?: string;
  created_by?: string | null;
  allow_negative?: boolean;
}

export interface MoneyTransferResult {
  transaction: LedgerTransaction;
  transfer_number: string;
  cash_flow_type: CashFlowType;
  from_account: LedgerAccount;
  to_account: LedgerAccount;
  saving_account?: LedgerAccount | null;
  payable_amount: number;
  receivable_amount: number;
  saving_amount?: number;
  amount: number;
  fee: number;
  difference: number;
  difference_handling?: DifferenceHandling;
  total_deducted: number;
}

export interface TransferHistoryItem {
  id: string;
  transfer_number: string;
  date: string;
  cash_flow_type: CashFlowType;
  from_account: { id: string; code: string; name: string; type: string };
  to_account: { id: string; code: string; name: string; type: string };
  saving_account?: { id: string; code: string; name: string; type: string } | null;
  payable_amount: number;
  receivable_amount: number;
  saving_amount?: number;
  difference: number;
  difference_handling?: string;
  amount: number;
  fee: number;
  reference: string;
  description: string;
  payable_remarks?: string;
  receivable_remarks?: string;
  saving_remarks?: string;
  created_by: string;
  is_reversed: boolean;
  reversal_transaction_number?: string;
  raw_transaction: LedgerTransaction;
}

/**
 * Validates if an account is eligible for Money Transfer
 * All active accounts (Cash, Bank, Customer, Supplier, Worker, Owner, etc.) are eligible
 */
export function isEligibleTransferAccount(
  acc: LedgerAccount,
  cashFlowType: CashFlowType = "internal_transfer",
  direction: "from" | "to" = "from"
): boolean {
  if (!acc) return false;
  return acc.is_active !== false;
}

/**
 * Get all transferrable accounts including Chart of Accounts, Customers, Suppliers, and Workers
 * without creating duplicate tables or entities.
 */
export async function getAllTransferrableAccounts(workspaceId?: string): Promise<TransferrableAccountItem[]> {
  const targetWsId = workspaceId || getActiveWorkspaceId();
  const baseAccounts = await getLedgerAccounts(targetWsId);
  const map = new Map<string, TransferrableAccountItem>();

  for (const acc of baseAccounts) {
    map.set(acc.id, { ...acc });
  }

  // 1. Linked & Available Customer Accounts
  try {
    const { getLocalCustomers } = await import("./customer-service");
    const custs = getLocalCustomers(targetWsId);
    for (const c of custs) {
      if (c.is_deleted) continue;
      const existing = baseAccounts.find(
        (a) => a.related_entity_type === "customer" && a.related_entity_id === c.id
      );
      if (existing) {
        map.set(existing.id, {
          ...existing,
          phone: c.mobile || (c as any).phone || undefined,
          address: c.address || undefined,
          entity_name: c.name,
        });
      } else {
        const custAccId = `acc-cust-${c.id}`;
        map.set(custAccId, {
          id: custAccId,
          account_code: `CUST-${(c.id || "0000").slice(-4).toUpperCase()}`,
          account_name: c.company_name ? `${c.name} (${c.company_name})` : c.name,
          account_type: "asset",
          account_sub_type: "Customer Receivable",
          related_entity_type: "customer",
          related_entity_id: c.id,
          opening_balance: 0,
          opening_balance_date: "2026-01-01",
          current_balance: Number(c.outstanding_balance) || 0,
          is_active: true,
          notes: `Customer Account • TRN: ${(c as any).trn || c.trn_number || "—"}`,
          phone: c.mobile || (c as any).phone || undefined,
          address: c.address || undefined,
          entity_name: c.name,
          created_at: c.created_at || new Date().toISOString(),
        });
      }
    }
  } catch {
    // Ignore customer loading error
  }

  // 2. Linked & Available Supplier Accounts
  try {
    const { getLocalSuppliers } = await import("./supplier-service");
    const supps = getLocalSuppliers(targetWsId);
    for (const s of supps) {
      if (s.is_deleted) continue;
      const existing = baseAccounts.find(
        (a) => a.related_entity_type === "supplier" && a.related_entity_id === s.id
      );
      if (existing) {
        map.set(existing.id, {
          ...existing,
          phone: s.phone || (s as any).mobile || undefined,
          address: s.address || undefined,
          entity_name: s.name,
        });
      } else {
        const suppAccId = `acc-supp-${s.id}`;
        map.set(suppAccId, {
          id: suppAccId,
          account_code: `SUPP-${(s.id || "0000").slice(-4).toUpperCase()}`,
          account_name: s.company_name ? `${s.name} (${s.company_name})` : s.name,
          account_type: "liability",
          account_sub_type: "Supplier Payable",
          related_entity_type: "supplier",
          related_entity_id: s.id,
          opening_balance: 0,
          opening_balance_date: "2026-01-01",
          current_balance: Number((s as any).total_pending || (s as any).outstanding_balance) || 0,
          is_active: true,
          notes: `Supplier Account • Phone: ${s.phone || "—"}`,
          phone: s.phone || (s as any).mobile || undefined,
          address: s.address || undefined,
          entity_name: s.name,
          created_at: s.created_at || new Date().toISOString(),
        });
      }
    }
  } catch {
    // Ignore supplier loading error
  }

  // 3. Linked & Available Worker Accounts
  try {
    const workers = await getWorkers();
    for (const w of workers) {
      const existing = baseAccounts.find(
        (a) => a.related_entity_type === "worker" && a.related_entity_id === w.id
      );
      if (existing) {
        map.set(existing.id, {
          ...existing,
          phone: w.phone || undefined,
          entity_name: w.name,
        });
      } else {
        const wrkAccId = `acc-wrk-${w.id}`;
        map.set(wrkAccId, {
          id: wrkAccId,
          account_code: `WRK-${(w.id || "0000").slice(-4).toUpperCase()}`,
          account_name: w.name,
          account_type: "liability",
          account_sub_type: "Worker Payable",
          related_entity_type: "worker",
          related_entity_id: w.id,
          opening_balance: 0,
          opening_balance_date: "2026-01-01",
          current_balance: Number(w.current_balance) || 0,
          is_active: true,
          notes: `Worker Account • ${w.job_position || "Technician"}`,
          phone: w.phone || undefined,
          entity_name: w.name,
          created_at: w.created_at || new Date().toISOString(),
        });
      }
    }
  } catch {
    // Ignore worker loading error
  }

  return Array.from(map.values());
}

/**
 * Resolve or persist an account in ledger_accounts if it's an on-the-fly entity account
 */
async function resolveOrCreateAccount(accountId: string, allAccounts: LedgerAccount[]): Promise<LedgerAccount> {
  const existing = allAccounts.find((a) => a.id === accountId);
  if (existing) return existing;

  // Check customer-linked account
  if (accountId.startsWith("acc-cust-")) {
    const custId = accountId.replace("acc-cust-", "");
    const { getLocalCustomers } = await import("./customer-service");
    const cust = getLocalCustomers().find((c) => c.id === custId);
    if (cust) {
      const newAcc: LedgerAccount = {
        id: accountId,
        account_code: `CUST-${(cust.id || "0000").slice(-4).toUpperCase()}`,
        account_name: cust.company_name ? `${cust.name} (${cust.company_name})` : cust.name,
        account_type: "asset",
        account_sub_type: "Customer Receivable",
        related_entity_type: "customer",
        related_entity_id: cust.id,
        opening_balance: 0,
        opening_balance_date: "2026-01-01",
        current_balance: Number(cust.outstanding_balance) || 0,
        is_active: true,
        notes: `Customer Account for ${cust.name}`,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      allAccounts.push(newAcc);
      saveLocalAccounts(allAccounts);
      return newAcc;
    }
  }

  // Check supplier-linked account
  if (accountId.startsWith("acc-supp-")) {
    const suppId = accountId.replace("acc-supp-", "");
    const { getLocalSuppliers } = await import("./supplier-service");
    const supp = getLocalSuppliers().find((s) => s.id === suppId);
    if (supp) {
      const newAcc: LedgerAccount = {
        id: accountId,
        account_code: `SUPP-${(supp.id || "0000").slice(-4).toUpperCase()}`,
        account_name: supp.company_name ? `${supp.name} (${supp.company_name})` : supp.name,
        account_type: "liability",
        account_sub_type: "Supplier Payable",
        related_entity_type: "supplier",
        related_entity_id: supp.id,
        opening_balance: 0,
        opening_balance_date: "2026-01-01",
        current_balance: Number((supp as any).total_pending || (supp as any).outstanding_balance) || 0,
        is_active: true,
        notes: `Supplier Account for ${supp.name}`,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      allAccounts.push(newAcc);
      saveLocalAccounts(allAccounts);
      return newAcc;
    }
  }

  // Check worker-linked account
  if (accountId.startsWith("acc-wrk-")) {
    const wrkId = accountId.replace("acc-wrk-", "");
    const worker = (await getWorkers()).find((w) => w.id === wrkId);
    if (worker) {
      const newAcc: LedgerAccount = {
        id: accountId,
        account_code: `WRK-${(worker.id || "0000").slice(-4).toUpperCase()}`,
        account_name: worker.name,
        account_type: "liability",
        account_sub_type: "Worker Payable",
        related_entity_type: "worker",
        related_entity_id: worker.id,
        opening_balance: 0,
        opening_balance_date: "2026-01-01",
        current_balance: Number(worker.current_balance) || 0,
        is_active: true,
        notes: `Worker Account for ${worker.name}`,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      allAccounts.push(newAcc);
      saveLocalAccounts(allAccounts);
      return newAcc;
    }
  }

  throw new Error(`Account with ID "${accountId}" not found in Chart of Accounts.`);
}

/**
 * Generate safe, unique sequential transfer number TRF-000001, TRF-000002...
 */
export async function getNextTransferNumber(): Promise<string> {
  // Query Supabase for latest TRF-
  try {
    const supabase = createClient();
    const { data } = await supabase
      .from("ledger_transactions")
      .select("transaction_number")
      .like("transaction_number", "TRF-%")
      .order("transaction_number", { ascending: false })
      .limit(1);

    if (data && data.length > 0 && data[0].transaction_number) {
      const match = data[0].transaction_number.match(/^TRF-(\d+)$/);
      if (match) {
        const nextNum = parseInt(match[1], 10) + 1;
        return `TRF-${String(nextNum).padStart(6, "0")}`;
      }
    }
  } catch {
    // Fallback to local storage
  }

  // Scan local transactions
  const txns = getLocalLedgerTransactions();
  let maxSeq = 0;
  for (const t of txns) {
    if (t.transaction_number && t.transaction_number.startsWith("TRF-")) {
      const match = t.transaction_number.match(/^TRF-(\d+)/);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > maxSeq) maxSeq = num;
      }
    }
  }
  return `TRF-${String(maxSeq + 1).padStart(6, "0")}`;
}

/**
 * Post a balanced, double-entry money transfer with 2-Step Payable & Receivable structure
 * and optional Saving / Difference Account handling.
 */
export async function postMoneyTransfer(params: MoneyTransferParams): Promise<MoneyTransferResult> {
  if (!params.from_account_id || !params.to_account_id) {
    throw new Error("Both Payable and Receivable accounts are required.");
  }

  if (params.from_account_id === params.to_account_id) {
    throw new Error("Payable and Receivable accounts must be different.");
  }

  // Calculate Initial Payable Amount and Receivable Amount
  let payableAmt = params.payable_amount !== undefined
    ? Math.round(Number(params.payable_amount) * 100) / 100
    : (params.amount !== undefined && params.fee !== undefined && params.fee > 0)
    ? Math.round((Number(params.amount) + Number(params.fee)) * 100) / 100
    : Math.round(Number(params.amount) * 100) / 100;

  let receivableAmt = params.receivable_amount !== undefined
    ? Math.round(Number(params.receivable_amount) * 100) / 100
    : Math.round(Number(params.amount) * 100) / 100;

  if (payableAmt <= 0) {
    throw new Error("Payable Amount must be greater than 0.");
  }

  if (receivableAmt <= 0) {
    throw new Error("Receivable Amount must be greater than 0.");
  }

  const accounts = await getLedgerAccounts();
  const fromAcc = await resolveOrCreateAccount(params.from_account_id, accounts);
  const toAcc = await resolveOrCreateAccount(params.to_account_id, accounts);

  // Check sufficient balance for Payable account if overdraft is not allowed
  const isFromLiquidAsset =
    (fromAcc.account_sub_type || "").toLowerCase() === "cash" ||
    (fromAcc.account_sub_type || "").toLowerCase() === "bank" ||
    fromAcc.account_code === "1001" ||
    fromAcc.account_code === "1002" ||
    fromAcc.account_code === "1003";

  if (!params.allow_negative && isFromLiquidAsset) {
    const availBalance = Number(fromAcc.current_balance) || 0;
    if (availBalance < payableAmt) {
      throw new Error(
        `Insufficient balance in Payable Account. Available: AED ${availBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}`
      );
    }
  }

  // Determine cash flow type (Cash In, Cash Out, or Internal Transfer)
  const cashFlowType: CashFlowType = params.cash_flow_type || (
    (fromAcc.account_type === "equity" && toAcc.account_type === "asset") ? "cash_in" :
    (fromAcc.account_type === "asset" && (toAcc.account_type === "equity" || toAcc.account_type === "expense")) ? "cash_out" :
    "internal_transfer"
  );

  // Difference Handling
  let savingAcc: LedgerAccount | null = null;
  let savingAmt = 0;
  let diffHandling = params.difference_handling;
  let diffLabel = "Difference / Saving";

  if (params.difference_handling === "receivable_account") {
    // Save difference in Receivable Account: Receivable absorbs Payable amount
    receivableAmt = payableAmt;
  } else if (params.difference_handling === "payable_account") {
    // Save difference in Payable Account: Payable matches Receivable amount
    payableAmt = receivableAmt;
  } else if (params.difference_handling === "saving_account" || params.saving_account_id) {
    const rawDiff = Math.round((payableAmt - receivableAmt) * 100) / 100;
    if (rawDiff !== 0) {
      const expectedDiff = Math.abs(rawDiff);
      if (!params.saving_account_id) {
        throw new Error("Please select a Saving Account.");
      }
      const providedSavingAmt = params.saving_amount !== undefined
        ? Math.round(Number(params.saving_amount) * 100) / 100
        : expectedDiff;
      if (Math.abs(providedSavingAmt - expectedDiff) > 0.01) {
        throw new Error("Saving Amount must match the transfer difference.");
      }
      savingAcc = await resolveOrCreateAccount(params.saving_account_id, accounts);
      if (savingAcc.id === fromAcc.id || savingAcc.id === toAcc.id) {
        throw new Error("Saving Account cannot be the same as Payable or Receivable Account.");
      }
      savingAmt = providedSavingAmt;
      diffLabel = savingAcc.account_name;
      diffHandling = "saving_account";
    }
  } else {
    // Saving / Difference Account handling fallback
    const rawDiff = Math.round((payableAmt - receivableAmt) * 100) / 100;
    if (rawDiff !== 0) {
      savingAmt = Math.abs(rawDiff);
      if (params.difference_handling === "other_expense") {
        savingAcc = accounts.find((a) => a.account_code === "5001" || a.account_sub_type === "General Expense")
          || accounts.find((a) => a.account_code === "5099")
          || accounts.find((a) => a.account_type === "expense") || null;
        diffLabel = "Other Expense";
      } else if (params.difference_handling === "adjustment") {
        savingAcc = accounts.find((a) => a.account_code === "5008" || a.account_sub_type === "Adjustment")
          || accounts.find((a) => a.account_code === "5099")
          || accounts.find((a) => a.account_type === "expense") || null;
        diffLabel = "Adjustment / Rounding";
      } else {
        // default: bank_fee
        savingAcc = accounts.find((a) => a.account_code === "5011" || a.account_sub_type === "Bank Charges")
          || accounts.find((a) => a.account_name.toLowerCase().includes("bank charge"))
          || accounts.find((a) => a.account_code === "5099")
          || accounts.find((a) => a.account_type === "expense") || null;
        diffLabel = "Bank Fee";
      }
    }
  }

  const finalDiff = Math.round((payableAmt - receivableAmt) * 100) / 100;
  const transferNumber = await getNextTransferNumber();
  const tDate = params.transfer_date ? params.transfer_date.slice(0, 10) : new Date().toISOString().slice(0, 10);
  const ref = params.reference_number || transferNumber;
  const typeLabel =
    cashFlowType === "cash_in"
      ? "Cash In"
      : cashFlowType === "cash_out"
      ? "Cash Out"
      : "Transfer";

  const description = params.notes
    ? `${params.notes} (${typeLabel}: ${fromAcc.account_name} → ${toAcc.account_name})`
    : params.payable_remarks && params.receivable_remarks
    ? `${params.payable_remarks} | ${params.receivable_remarks}`
    : params.payable_remarks || params.receivable_remarks || `${typeLabel}: ${fromAcc.account_name} to ${toAcc.account_name}`;

  // Build Double-Entry Journal Legs (Debits MUST equal Credits)
  const entries: Array<{ account_id: string; debit: number; credit: number; notes: string }> = [];

  // Leg 1: Debit Receivable Account
  entries.push({
    account_id: toAcc.id,
    debit: receivableAmt,
    credit: 0,
    notes: params.receivable_remarks || `Funds received from ${fromAcc.account_name} (${transferNumber})`,
  });

  // Leg 2: Difference / Saving Account Leg
  if (finalDiff > 0 && savingAcc) {
    // Payable was higher than Receivable: debit Saving Account
    entries.push({
      account_id: savingAcc.id,
      debit: finalDiff,
      credit: 0,
      notes: params.saving_remarks || `${diffLabel} for transfer ${transferNumber} (${toAcc.account_name})`,
    });
  } else if (finalDiff < 0 && savingAcc) {
    // Receivable was higher than Payable: credit Saving Account
    entries.push({
      account_id: savingAcc.id,
      debit: 0,
      credit: Math.abs(finalDiff),
      notes: params.saving_remarks || `${diffLabel} credit for transfer ${transferNumber}`,
    });
  }

  // Leg 3: Credit Payable Account
  entries.push({
    account_id: fromAcc.id,
    debit: 0,
    credit: payableAmt,
    notes: params.payable_remarks || `Funds transferred to ${toAcc.account_name}${finalDiff > 0 && savingAcc ? ` + AED ${finalDiff.toFixed(2)} ${diffLabel}` : ""} (${transferNumber})`,
  });

  // Post the unified transaction
  const postResult = await postTransaction({
    transaction_number: transferNumber,
    transaction_date: tDate,
    reference_type: "transfer",
    reference_id: ref,
    description,
    cash_flow_type: cashFlowType,
    created_by: params.created_by,
    entries,
  });

  // Update entity balances in stores if customer, supplier, or worker accounts were used
  try {
    // Customer updates
    if (fromAcc.related_entity_type === "customer" && fromAcc.related_entity_id) {
      const { getLocalCustomers, saveLocalCustomers } = await import("./customer-service");
      const custs = getLocalCustomers();
      const c = custs.find((item) => item.id === fromAcc.related_entity_id);
      if (c) {
        c.outstanding_balance = Math.max(0, Math.round(((Number(c.outstanding_balance) || 0) - payableAmt) * 100) / 100);
        saveLocalCustomers(custs);
      }
    }
    if (toAcc.related_entity_type === "customer" && toAcc.related_entity_id) {
      const { getLocalCustomers, saveLocalCustomers } = await import("./customer-service");
      const custs = getLocalCustomers();
      const c = custs.find((item) => item.id === toAcc.related_entity_id);
      if (c) {
        c.outstanding_balance = Math.round(((Number(c.outstanding_balance) || 0) + receivableAmt) * 100) / 100;
        saveLocalCustomers(custs);
      }
    }

    // Supplier updates
    if (toAcc.related_entity_type === "supplier" && toAcc.related_entity_id) {
      const { getLocalSuppliers, saveLocalSuppliers } = await import("./supplier-service");
      const supps = getLocalSuppliers();
      const s = supps.find((item) => item.id === toAcc.related_entity_id);
      if (s) {
        const cur = Number((s as any).total_pending || (s as any).outstanding_balance) || 0;
        const updated = Math.max(0, Math.round((cur - receivableAmt) * 100) / 100);
        (s as any).total_pending = updated;
        (s as any).outstanding_balance = updated;
        saveLocalSuppliers(supps);
      }
    }
    if (fromAcc.related_entity_type === "supplier" && fromAcc.related_entity_id) {
      const { getLocalSuppliers, saveLocalSuppliers } = await import("./supplier-service");
      const supps = getLocalSuppliers();
      const s = supps.find((item) => item.id === fromAcc.related_entity_id);
      if (s) {
        const cur = Number((s as any).total_pending || (s as any).outstanding_balance) || 0;
        const updated = Math.round((cur + payableAmt) * 100) / 100;
        (s as any).total_pending = updated;
        (s as any).outstanding_balance = updated;
        saveLocalSuppliers(supps);
      }
    }

    // Worker updates
    if (toAcc.related_entity_type === "worker" && toAcc.related_entity_id) {
      const workers = await getWorkers();
      const w = workers.find((item) => item.id === toAcc.related_entity_id);
      if (w) {
        w.current_balance = Math.round(((Number(w.current_balance) || 0) - receivableAmt) * 100) / 100;
        saveLocalWorkers(workers);
      }
    }
    if (fromAcc.related_entity_type === "worker" && fromAcc.related_entity_id) {
      const workers = await getWorkers();
      const w = workers.find((item) => item.id === fromAcc.related_entity_id);
      if (w) {
        w.current_balance = Math.round(((Number(w.current_balance) || 0) + payableAmt) * 100) / 100;
        saveLocalWorkers(workers);
      }
    }
  } catch (syncErr) {
    console.warn("Entity balance sync notice:", syncErr);
  }

  return {
    transaction: postResult.transaction,
    transfer_number: transferNumber,
    cash_flow_type: cashFlowType,
    from_account: fromAcc,
    to_account: toAcc,
    saving_account: savingAcc,
    payable_amount: payableAmt,
    receivable_amount: receivableAmt,
    saving_amount: savingAmt,
    amount: receivableAmt,
    fee: finalDiff > 0 ? finalDiff : 0,
    difference: finalDiff,
    difference_handling: diffHandling,
    total_deducted: payableAmt,
  };
}

/**
 * Reverse / Void a posted transfer by creating an offsetting balanced journal entry
 */
export async function reverseMoneyTransfer(options: {
  transferNumberOrTxnId: string;
  reason?: string;
  reversed_by?: string | null;
}): Promise<LedgerTransaction> {
  const txns = getLocalLedgerTransactions();
  const entries = getLocalEntries();

  const originalTxn = txns.find(
    (t) => t.id === options.transferNumberOrTxnId || t.transaction_number === options.transferNumberOrTxnId
  );

  if (!originalTxn) {
    throw new Error(`Transfer transaction "${options.transferNumberOrTxnId}" not found.`);
  }

  // Prevent duplicate reversal
  const alreadyReversed = txns.some(
    (t) => t.reference_type === "transfer_reversal" && t.reference_id === originalTxn.transaction_number
  );
  if (alreadyReversed) {
    throw new Error(`Transfer ${originalTxn.transaction_number} has already been reversed.`);
  }

  const originalEntries = entries.filter((e) => e.transaction_id === originalTxn.id);
  if (originalEntries.length === 0) {
    throw new Error("No journal entries found for original transfer.");
  }

  const now = new Date().toISOString();
  const reversalTxnNumber = `${originalTxn.transaction_number}-REV`;

  // Build offsetting balanced journal entries by flipping debit and credit
  const reversalEntries = originalEntries.map((e) => ({
    account_id: e.account_id,
    debit: e.credit, // swap credit to debit
    credit: e.debit, // swap debit to credit
    notes: `Reversal of ${originalTxn.transaction_number}: ${options.reason || "Voided transfer"}`,
  }));

  const reversalResult = await postTransaction({
    transaction_number: reversalTxnNumber,
    transaction_date: now.slice(0, 10),
    reference_type: "transfer_reversal",
    reference_id: originalTxn.transaction_number,
    description: `Reversal of Transfer ${originalTxn.transaction_number}: ${options.reason || "Voided transfer"}`,
    cash_flow_type: originalTxn.cash_flow_type || null,
    created_by: options.reversed_by || "System",
    entries: reversalEntries,
  });

  // Also restore entity balances if applicable
  try {
    const accounts = await getLedgerAccounts();
    for (const origEntry of originalEntries) {
      const acc = accounts.find((a) => a.id === origEntry.account_id);
      if (!acc) continue;
      const deb = Number(origEntry.debit) || 0;
      const cred = Number(origEntry.credit) || 0;

      // Customer
      if (acc.related_entity_type === "customer" && acc.related_entity_id) {
        const { getLocalCustomers, saveLocalCustomers } = await import("./customer-service");
        const custs = getLocalCustomers();
        const c = custs.find((item) => item.id === acc.related_entity_id);
        if (c) {
          // If customer was credited in original, they paid -> so in reversal, re-add debt
          c.outstanding_balance = Math.round(((Number(c.outstanding_balance) || 0) + cred - deb) * 100) / 100;
          saveLocalCustomers(custs);
        }
      }

      // Supplier
      if (acc.related_entity_type === "supplier" && acc.related_entity_id) {
        const { getLocalSuppliers, saveLocalSuppliers } = await import("./supplier-service");
        const supps = getLocalSuppliers();
        const s = supps.find((item) => item.id === acc.related_entity_id);
        if (s) {
          // If supplier was debited in original, they received pay -> so in reversal, re-add payable
          const cur = Number((s as any).total_pending || (s as any).outstanding_balance) || 0;
          const updated = Math.round((cur + deb - cred) * 100) / 100;
          (s as any).total_pending = updated;
          (s as any).outstanding_balance = updated;
          saveLocalSuppliers(supps);
        }
      }

      // Worker
      if (acc.related_entity_type === "worker" && acc.related_entity_id) {
        const workers = await getWorkers();
        const w = workers.find((item) => item.id === acc.related_entity_id);
        if (w) {
          w.current_balance = Math.round(((Number(w.current_balance) || 0) + deb - cred) * 100) / 100;
          saveLocalWorkers(workers);
        }
      }
    }
  } catch (revSyncErr) {
    console.warn("Reversal entity balance sync notice:", revSyncErr);
  }

  return reversalResult.transaction;
}

/**
 * Reverse ANY ledger transaction cleanly with offsetting opposite entries,
 * keeping the original history preserved for audit purposes.
 */
export async function reverseLedgerTransaction(options: {
  transactionNumberOrId: string;
  reason?: string;
  reversed_by?: string | null;
}): Promise<LedgerTransaction> {
  const txns = getLocalLedgerTransactions();
  const entries = getLocalEntries();

  const originalTxn = txns.find(
    (t) => t.id === options.transactionNumberOrId || t.transaction_number === options.transactionNumberOrId
  );

  if (!originalTxn) {
    throw new Error(`Transaction "${options.transactionNumberOrId}" not found.`);
  }

  // Prevent duplicate reversal
  const alreadyReversed = txns.some(
    (t) => (t.reference_type === "reversal" || t.reference_type === "transfer_reversal") && t.reference_id === originalTxn.transaction_number
  );
  if (alreadyReversed) {
    throw new Error(`Transaction ${originalTxn.transaction_number} has already been reversed.`);
  }

  const originalEntries = entries.filter((e) => e.transaction_id === originalTxn.id);
  if (originalEntries.length === 0) {
    throw new Error("No journal entries found for original transaction.");
  }

  const now = new Date().toISOString();
  const reversalTxnNumber = `${originalTxn.transaction_number}-REV`;

  // Build offsetting balanced journal entries by flipping debit and credit
  const reversalEntries = originalEntries.map((e) => ({
    account_id: e.account_id,
    debit: e.credit, // swap credit to debit
    credit: e.debit, // swap debit to credit
    notes: `Reversal of ${originalTxn.transaction_number}: ${options.reason || "Voided entry"}`,
  }));

  const reversalResult = await postTransaction({
    transaction_number: reversalTxnNumber,
    transaction_date: now.slice(0, 10),
    reference_type: "reversal",
    reference_id: originalTxn.transaction_number,
    description: `Reversal of ${originalTxn.transaction_number}: ${options.reason || "Voided entry"}`,
    cash_flow_type: originalTxn.cash_flow_type || null,
    created_by: options.reversed_by || "System",
    entries: reversalEntries,
  });

  // Restore entity balances if applicable
  try {
    const accounts = await getAllTransferrableAccounts();
    for (const origEntry of originalEntries) {
      const acc = accounts.find((a) => a.id === origEntry.account_id);
      if (!acc) continue;
      const deb = Number(origEntry.debit) || 0;
      const cred = Number(origEntry.credit) || 0;

      // Customer
      if (acc.related_entity_type === "customer" && acc.related_entity_id) {
        const { getLocalCustomers, saveLocalCustomers } = await import("./customer-service");
        const custs = getLocalCustomers();
        const c = custs.find((item) => item.id === acc.related_entity_id);
        if (c) {
          c.outstanding_balance = Math.max(0, Math.round(((Number(c.outstanding_balance) || 0) + cred - deb) * 100) / 100);
          saveLocalCustomers(custs);
        }
      }

      // Supplier
      if (acc.related_entity_type === "supplier" && acc.related_entity_id) {
        const { getLocalSuppliers, saveLocalSuppliers } = await import("./supplier-service");
        const supps = getLocalSuppliers();
        const s = supps.find((item) => item.id === acc.related_entity_id);
        if (s) {
          const cur = Number((s as any).total_pending || (s as any).outstanding_balance) || 0;
          const updated = Math.max(0, Math.round((cur + deb - cred) * 100) / 100);
          (s as any).total_pending = updated;
          (s as any).outstanding_balance = updated;
          saveLocalSuppliers(supps);
        }
      }

      // Worker
      if (acc.related_entity_type === "worker" && acc.related_entity_id) {
        const workers = await getWorkers();
        const w = workers.find((item) => item.id === acc.related_entity_id);
        if (w) {
          w.current_balance = Math.round(((Number(w.current_balance) || 0) + deb - cred) * 100) / 100;
          saveLocalWorkers(workers);
        }
      }
    }
  } catch (revSyncErr) {
    console.warn("Reversal entity balance sync notice:", revSyncErr);
  }

  return reversalResult.transaction;
}

export interface PostAccountEntryParams {
  workspace_id?: string;
  date?: string;
  account_id: string;
  entry_type: "money_in" | "money_out" | "debit" | "credit" | "adjustment" | "opening_balance_adjustment";
  amount: number;
  counter_account_id: string;
  reference_number?: string;
  description?: string;
  payment_method?: string;
  notes?: string;
  created_by?: string | null;
}

/**
 * Post an individual account transaction with mandatory counter account
 * enforcing strict double-entry balance (Debit === Credit).
 */
export async function postAccountEntry(params: PostAccountEntryParams): Promise<{
  transaction: LedgerTransaction;
  entries: LedgerEntry[];
}> {
  const { account_id, counter_account_id, entry_type, amount, date, reference_number, description, payment_method, notes, created_by } = params;

  if (!account_id || !counter_account_id) {
    throw new Error("Both Account and Counter Account are required.");
  }
  if (account_id === counter_account_id) {
    throw new Error("Account and Counter Account cannot be the same.");
  }
  const numAmount = Number(amount) || 0;
  if (numAmount <= 0) {
    throw new Error("Amount must be greater than zero.");
  }

  const targetWs = params.workspace_id || getActiveWorkspaceId();
  const allAccounts = await getAllTransferrableAccounts(targetWs);
  const primaryAcc = await resolveOrCreateAccount(account_id, allAccounts);
  const counterAcc = await resolveOrCreateAccount(counter_account_id, allAccounts);

  let primaryDebit = 0;
  let primaryCredit = 0;
  let counterDebit = 0;
  let counterCredit = 0;

  const isPrimaryAsset = primaryAcc.account_type === "asset";
  const isPrimaryCustomer = primaryAcc.related_entity_type === "customer" || primaryAcc.account_sub_type === "Customer Receivable";
  const isPrimarySupplier = primaryAcc.related_entity_type === "supplier" || primaryAcc.account_sub_type === "Supplier Payable";
  const isPrimaryExpense = primaryAcc.account_type === "expense";
  const isPrimaryIncome = primaryAcc.account_type === "income";

  switch (entry_type) {
    case "debit":
      primaryDebit = numAmount;
      counterCredit = numAmount;
      break;
    case "credit":
      primaryCredit = numAmount;
      counterDebit = numAmount;
      break;
    case "money_in":
      if (isPrimaryAsset) {
        // Asset (Bank/Cash) receives funds -> Debit Asset, Credit Counter
        primaryDebit = numAmount;
        counterCredit = numAmount;
      } else if (isPrimaryCustomer || isPrimaryIncome) {
        // Customer pays in -> Credit Customer, Debit Counter (Cash/Bank)
        primaryCredit = numAmount;
        counterDebit = numAmount;
      } else {
        primaryDebit = numAmount;
        counterCredit = numAmount;
      }
      break;
    case "money_out":
      if (isPrimaryAsset) {
        // Asset (Bank/Cash) pays out funds -> Credit Asset, Debit Counter (Expense/Supplier)
        primaryCredit = numAmount;
        counterDebit = numAmount;
      } else if (isPrimarySupplier || isPrimaryExpense) {
        // Supplier paid or expense incurred -> Debit Supplier/Expense, Credit Counter (Cash/Bank)
        primaryDebit = numAmount;
        counterCredit = numAmount;
      } else {
        primaryCredit = numAmount;
        counterDebit = numAmount;
      }
      break;
    case "adjustment":
    case "opening_balance_adjustment":
      primaryDebit = numAmount;
      counterCredit = numAmount;
      break;
    default:
      primaryDebit = numAmount;
      counterCredit = numAmount;
  }

  const txnNumber = `TXN-${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 90 + 10)}`;
  const txnDate = date || new Date().toISOString().slice(0, 10);
  const fullDesc = (description && description.trim()) ? description.trim() : `${entry_type.replace(/_/g, " ")} via ${counterAcc.account_name}`;

  const postResult = await postTransaction({
    workspace_id: params.workspace_id || primaryAcc.workspace_id || getActiveWorkspaceId(),
    transaction_number: txnNumber,
    transaction_date: txnDate,
    reference_type: "manual_entry",
    reference_id: reference_number?.trim() || null,
    description: fullDesc,
    created_by: created_by || "User",
    entries: [
      {
        account_id: primaryAcc.id,
        debit: primaryDebit,
        credit: primaryCredit,
        notes: notes?.trim() || `${entry_type.replace(/_/g, " ")} (Counter: ${counterAcc.account_name})`,
      },
      {
        account_id: counterAcc.id,
        debit: counterDebit,
        credit: counterCredit,
        notes: notes?.trim() || `Counter leg for ${primaryAcc.account_name}`,
      },
    ],
  });

  // Sync entity balances
  try {
    // 1. If Customer involved:
    if (primaryAcc.related_entity_type === "customer" && primaryAcc.related_entity_id) {
      const { getLocalCustomers, saveLocalCustomers } = await import("./customer-service");
      const custs = getLocalCustomers();
      const c = custs.find((item) => item.id === primaryAcc.related_entity_id);
      if (c) {
        const delta = primaryDebit - primaryCredit;
        c.outstanding_balance = Math.max(0, Math.round(((Number(c.outstanding_balance) || 0) + delta) * 100) / 100);
        saveLocalCustomers(custs);
      }
    }
    if (counterAcc.related_entity_type === "customer" && counterAcc.related_entity_id) {
      const { getLocalCustomers, saveLocalCustomers } = await import("./customer-service");
      const custs = getLocalCustomers();
      const c = custs.find((item) => item.id === counterAcc.related_entity_id);
      if (c) {
        const delta = counterDebit - counterCredit;
        c.outstanding_balance = Math.max(0, Math.round(((Number(c.outstanding_balance) || 0) + delta) * 100) / 100);
        saveLocalCustomers(custs);
      }
    }

    // 2. If Supplier involved:
    if (primaryAcc.related_entity_type === "supplier" && primaryAcc.related_entity_id) {
      const { getLocalSuppliers, saveLocalSuppliers } = await import("./supplier-service");
      const supps = getLocalSuppliers();
      const s = supps.find((item) => item.id === primaryAcc.related_entity_id);
      if (s) {
        const cur = Number((s as any).total_pending || (s as any).outstanding_balance) || 0;
        const delta = primaryCredit - primaryDebit;
        const updated = Math.max(0, Math.round((cur + delta) * 100) / 100);
        (s as any).total_pending = updated;
        (s as any).outstanding_balance = updated;
        saveLocalSuppliers(supps);
      }
    }
    if (counterAcc.related_entity_type === "supplier" && counterAcc.related_entity_id) {
      const { getLocalSuppliers, saveLocalSuppliers } = await import("./supplier-service");
      const supps = getLocalSuppliers();
      const s = supps.find((item) => item.id === counterAcc.related_entity_id);
      if (s) {
        const cur = Number((s as any).total_pending || (s as any).outstanding_balance) || 0;
        const delta = counterCredit - counterDebit;
        const updated = Math.max(0, Math.round((cur + delta) * 100) / 100);
        (s as any).total_pending = updated;
        (s as any).outstanding_balance = updated;
        saveLocalSuppliers(supps);
      }
    }

    // 3. If Worker involved:
    if (primaryAcc.related_entity_type === "worker" && primaryAcc.related_entity_id) {
      const workers = await getWorkers();
      const w = workers.find((item) => item.id === primaryAcc.related_entity_id);
      if (w) {
        const delta = primaryCredit - primaryDebit;
        w.current_balance = Math.round(((Number(w.current_balance) || 0) + delta) * 100) / 100;
        saveLocalWorkers(workers);
      }
    }
    if (counterAcc.related_entity_type === "worker" && counterAcc.related_entity_id) {
      const workers = await getWorkers();
      const w = workers.find((item) => item.id === counterAcc.related_entity_id);
      if (w) {
        const delta = counterCredit - counterDebit;
        w.current_balance = Math.round(((Number(w.current_balance) || 0) + delta) * 100) / 100;
        saveLocalWorkers(workers);
      }
    }
  } catch (syncErr) {
    console.warn("Entity balance sync notice:", syncErr);
  }

  return postResult;
}

/**
 * Query all Money Transfers with resolved accounts, fees, saving account, and reversal states
 */
export async function getTransferHistory(workspaceId?: string): Promise<TransferHistoryItem[]> {
  const targetWsId = workspaceId || getActiveWorkspaceId();
  const txns = getLocalLedgerTransactions(targetWsId);
  const validTxnIds = new Set(txns.map((t) => t.id));
  const entries = getLocalEntries().filter((e) => validTxnIds.has(e.transaction_id));
  const accounts = await getAllTransferrableAccounts(targetWsId);

  const accountMap = new Map<string, TransferrableAccountItem>();
  accounts.forEach((a) => accountMap.set(a.id, a));

  const transferTxns = txns.filter((t) => t.reference_type === "transfer");
  const reversalSet = new Map<string, string>();

  txns
    .filter((t) => t.reference_type === "transfer_reversal" && t.reference_id)
    .forEach((t) => {
      reversalSet.set(t.reference_id!, t.transaction_number);
    });

  const history: TransferHistoryItem[] = [];

  for (const t of transferTxns) {
    const tEntries = entries.filter((e) => e.transaction_id === t.id);

    // Credit leg (Source / Payable Account)
    const fromEntry = tEntries.find((e) => (Number(e.credit) || 0) > 0);

    // Debit leg (Receiving / Receivable Account - exclude expense/fee accounts if multiple debits)
    let toEntry = tEntries.find((e) => {
      if ((Number(e.debit) || 0) <= 0) return false;
      const acc = accountMap.get(e.account_id);
      return acc?.account_type !== "expense";
    });
    // Fallback if both are expenses
    if (!toEntry) toEntry = tEntries.find((e) => (Number(e.debit) || 0) > 0);

    // Saving / Difference Leg (any entry other than fromEntry and toEntry)
    const savingEntry = tEntries.find(
      (e) => (e !== fromEntry) && (e !== toEntry) && (Number(e.debit) > 0 || Number(e.credit) > 0)
    );

    const fromAcc = fromEntry ? accountMap.get(fromEntry.account_id) : null;
    const toAcc = toEntry ? accountMap.get(toEntry.account_id) : null;
    const savingAcc = savingEntry ? accountMap.get(savingEntry.account_id) : null;

    const payableAmt = fromEntry ? Number(fromEntry.credit) || 0 : 0;
    const receivableAmt = toEntry ? Number(toEntry.debit) || 0 : 0;
    const savingAmt = savingEntry ? Number(savingEntry.debit || savingEntry.credit) || 0 : 0;
    const diff = Math.round(Math.abs(payableAmt - receivableAmt) * 100) / 100;

    const cashFlowType: CashFlowType =
      t.cash_flow_type ||
      (t.description?.includes("Cash In") ? "cash_in" :
       t.description?.includes("Cash Out") ? "cash_out" :
       (fromAcc?.account_type === "equity" && toAcc?.account_type === "asset") ? "cash_in" :
       (fromAcc?.account_type === "asset" && (toAcc?.account_type === "equity" || toAcc?.account_type === "expense")) ? "cash_out" :
       "internal_transfer");

    history.push({
      id: t.id,
      transfer_number: t.transaction_number,
      date: t.transaction_date,
      cash_flow_type: cashFlowType,
      from_account: {
        id: fromAcc ? fromAcc.id : "—",
        code: fromAcc ? fromAcc.account_code : "—",
        name: fromAcc ? fromAcc.account_name : "Unknown Account",
        type: fromAcc ? fromAcc.account_type : "asset",
      },
      to_account: {
        id: toAcc ? toAcc.id : "—",
        code: toAcc ? toAcc.account_code : "—",
        name: toAcc ? toAcc.account_name : "Unknown Account",
        type: toAcc ? toAcc.account_type : "asset",
      },
      saving_account: savingAcc ? {
        id: savingAcc.id,
        code: savingAcc.account_code,
        name: savingAcc.account_name,
        type: savingAcc.account_type,
      } : null,
      payable_amount: payableAmt,
      receivable_amount: receivableAmt,
      saving_amount: savingAmt,
      difference: diff,
      difference_handling: savingAcc ? savingAcc.account_name : (diff > 0 ? "Adjustment / Fee" : undefined),
      amount: receivableAmt,
      fee: savingAmt,
      reference: t.reference_id || "—",
      description: t.description,
      saving_remarks: savingEntry?.notes || undefined,
      created_by: t.created_by || "System",
      is_reversed: reversalSet.has(t.transaction_number),
      reversal_transaction_number: reversalSet.get(t.transaction_number),
      raw_transaction: t,
    });
  }

  // Sort descending by date & number
  history.sort((a, b) => {
    if (a.date !== b.date) return b.date.localeCompare(a.date);
    return b.transfer_number.localeCompare(a.transfer_number);
  });

  return history;
}

export interface CashFlowSummary {
  cashInToday: number;
  cashOutToday: number;
  netCashFlowToday: number;
  cashInThisMonth: number;
  cashOutThisMonth: number;
  netCashFlowThisMonth: number;
}

/**
 * Calculates Operating Cash Flow summary for Today and This Month.
 * Pure internal transfers (e.g. Cash -> Bank) are strictly excluded from Operating Cash In / Out.
 */
export async function getCashFlowSummary(): Promise<CashFlowSummary> {
  const history = await getTransferHistory();
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const thisMonthPrefix = todayStr.slice(0, 7);

  let cashInToday = 0;
  let cashOutToday = 0;
  let cashInThisMonth = 0;
  let cashOutThisMonth = 0;

  for (const item of history) {
    if (item.is_reversed) continue;
    // Pure internal transfers are strictly excluded from business operating cash flow
    if (item.cash_flow_type === "internal_transfer") continue;

    const itemDate = item.date ? item.date.slice(0, 10) : "";
    const isToday = itemDate === todayStr;
    const isThisMonth = itemDate.startsWith(thisMonthPrefix);

    if (item.cash_flow_type === "cash_in") {
      if (isToday) cashInToday += item.amount;
      if (isThisMonth) cashInThisMonth += item.amount;
    } else if (item.cash_flow_type === "cash_out") {
      if (isToday) cashOutToday += item.amount;
      if (isThisMonth) cashOutThisMonth += item.amount;
    }
  }

  cashInToday = Math.round(cashInToday * 100) / 100;
  cashOutToday = Math.round(cashOutToday * 100) / 100;
  const netCashFlowToday = Math.round((cashInToday - cashOutToday) * 100) / 100;

  cashInThisMonth = Math.round(cashInThisMonth * 100) / 100;
  cashOutThisMonth = Math.round(cashOutThisMonth * 100) / 100;
  const netCashFlowThisMonth = Math.round((cashInThisMonth - cashOutThisMonth) * 100) / 100;

  return {
    cashInToday,
    cashOutToday,
    netCashFlowToday,
    cashInThisMonth,
    cashOutThisMonth,
    netCashFlowThisMonth,
  };
}

// ─── Delete Ledger Transaction (Permanent Removal) ──────────────────────────

// ─── Accounting Audit Logging ───────────────────────────────────────────────

const LOCAL_ACCOUNTING_AUDIT_KEY = "atiq_local_accounting_audit_logs";

export interface AccountingAuditLog {
  id: string;
  workspace_id: string;
  event: string;
  transaction_number: string;
  amount: number;
  deleted_by: string;
  deleted_at: string;
  reason: string;
}

export function getLocalAccountingAuditLogs(): AccountingAuditLog[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(LOCAL_ACCOUNTING_AUDIT_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/**
 * Permanently deletes a ledger transaction and all its journal entries.
 * This is a destructive operation (no reversal entry created).
 * Both debit and credit legs are removed together to preserve double-entry balance.
 * Only available to Owner/Admin roles.
 */
export async function deleteLedgerTransaction(options: {
  transactionId: string;
  deleted_by?: string | null;
  reason?: string;
}): Promise<{ success: boolean; deletedTxnNumber: string; deletedEntriesCount: number }> {
  const txns = getLocalLedgerTransactions();
  const entries = getLocalEntries();

  const txn = txns.find(
    (t) => t.id === options.transactionId || t.transaction_number === options.transactionId
  );

  if (!txn) {
    throw new Error(`Transaction "${options.transactionId}" not found.`);
  }

  const txnEntries = entries.filter((e) => e.transaction_id === txn.id);

  // Also find and remove any reversal transaction that references this one
  const reversalTxns = txns.filter(
    (t) => (t.reference_type === "reversal" || t.reference_type === "transfer_reversal") &&
           t.reference_id === txn.transaction_number
  );
  const reversalTxnIds = new Set(reversalTxns.map((t) => t.id));

  // Remove the transaction + any linked reversals
  const idsToRemove = new Set([txn.id, ...reversalTxnIds]);
  const remainingTxns = txns.filter((t) => !idsToRemove.has(t.id));
  const remainingEntries = entries.filter((e) => !idsToRemove.has(e.transaction_id));

  saveLocalLedgerTransactions(remainingTxns);
  saveLocalEntries(remainingEntries);

  // Attempt Supabase cleanup
  try {
    const supabase = createClient();
    const allIds = Array.from(idsToRemove);
    await supabase.from("ledger_entries").delete().in("transaction_id", allIds);
    await supabase.from("ledger_transactions").delete().in("id", allIds);
  } catch (err) {
    console.warn("Supabase delete attempt (non-critical):", err);
  }

  // Record audit log for the permanent deletion
  const auditEntry: AccountingAuditLog = {
    id: `aud-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    workspace_id: txn.workspace_id || DEFAULT_WORKSPACE_ID,
    event: "Accounting Entry Deleted",
    transaction_number: txn.transaction_number,
    amount: txn.total_debit || txn.total_credit || 0,
    deleted_by: options.deleted_by || "Primary Owner",
    deleted_at: new Date().toISOString(),
    reason: options.reason || "Manual deletion via account transaction history",
  };

  if (typeof window !== "undefined") {
    try {
      const logs = getLocalAccountingAuditLogs();
      logs.unshift(auditEntry);
      localStorage.setItem(LOCAL_ACCOUNTING_AUDIT_KEY, JSON.stringify(logs.slice(0, 500)));
    } catch {}
  }

  console.info(
    `[AUDIT] Accounting Entry Deleted: ${txn.transaction_number} permanently deleted by ${options.deleted_by || "System"}. ` +
    `Reason: ${options.reason || "Manual deletion"}. Entries removed: ${txnEntries.length + reversalTxns.length}`
  );

  return {
    success: true,
    deletedTxnNumber: txn.transaction_number,
    deletedEntriesCount: txnEntries.length,
  };
}

/**
 * Bulk delete multiple ledger transactions by their IDs.
 */
export async function bulkDeleteLedgerTransactions(options: {
  transactionIds: string[];
  deleted_by?: string | null;
  reason?: string;
}): Promise<{ success: boolean; deletedCount: number; errors: string[] }> {
  const errors: string[] = [];
  let deletedCount = 0;

  for (const txnId of options.transactionIds) {
    try {
      await deleteLedgerTransaction({
        transactionId: txnId,
        deleted_by: options.deleted_by,
        reason: options.reason || "Bulk deletion",
      });
      deletedCount++;
    } catch (err: any) {
      errors.push(`${txnId}: ${err.message}`);
    }
  }

  return { success: errors.length === 0, deletedCount, errors };
}

// ─── Custom Account Delete (Owner Only, Protected Accounts Preserved) ────────

export const PROTECTED_ACCOUNT_CODES = new Set([
  "1001", "1002", "1003", "1100", "1200", "1300",
  "2001", "2100", "2200",
  "3001", "3002", "3003",
  "4001", "4002", "4100",
  "5001", "5002", "5003", "5004", "5005", "5006", "5007", "5008", "5009", "5010", "5011", "5099",
]);

/**
 * For custom accounts only: delete an account if balance = 0, no transactions exist,
 * and it is not a protected system account.
 */
export async function deleteCustomLedgerAccount(
  accountId: string,
  workspaceId?: string
): Promise<{ success: boolean; message: string }> {
  const targetWsId = workspaceId || getActiveWorkspaceId();
  const accounts = getLocalAccounts(targetWsId);
  const account = accounts.find((a) => a.id === accountId);

  if (!account) {
    throw new Error(`Account "${accountId}" not found.`);
  }

  if (PROTECTED_ACCOUNT_CODES.has(account.account_code)) {
    throw new Error(`Account "${account.account_code} - ${account.account_name}" is a protected system account and cannot be deleted.`);
  }

  if (Number(account.current_balance || 0) !== 0 || Number(account.opening_balance || 0) !== 0) {
    throw new Error(`Account balance must be AED 0.00 to delete. Current balance: AED ${account.current_balance}`);
  }

  const entries = getLocalEntries().filter((e) => e.account_id === account.id);
  if (entries.length > 0) {
    throw new Error(`Account has ${entries.length} historical transaction entries and cannot be deleted. You can archive/deactivate it instead.`);
  }

  const remaining = accounts.filter((a) => a.id !== accountId);
  saveLocalAccounts(remaining, targetWsId);

  try {
    const supabase = createClient();
    await supabase.from("ledger_accounts").delete().eq("id", accountId).eq("workspace_id", targetWsId);
  } catch (err) {
    console.warn("Supabase account delete (non-critical):", err);
  }

  return {
    success: true,
    message: `Account "${account.account_code} - ${account.account_name}" deleted successfully.`,
  };
}

/**
 * Reset ALL ledger data for a workspace: clears transactions, entries,
 * and resets all opening balances to 0 while preserving account definitions.
 */
export async function resetAllLedgerData(workspaceId?: string): Promise<{
  success: boolean;
  message: string;
  clearedTransactions: number;
  clearedEntries: number;
}> {
  const targetWsId = workspaceId || getActiveWorkspaceId();

  // 1. Clear transactions for this workspace
  const allTxns = getLocalLedgerTransactions();
  const wsTxns = allTxns.filter(
    (t) => t.workspace_id === targetWsId || (!t.workspace_id && targetWsId === DEFAULT_WORKSPACE_ID)
  );
  const wsTxnIds = new Set(wsTxns.map((t) => t.id));
  const remainingTxns = allTxns.filter((t) => !wsTxnIds.has(t.id));
  saveLocalLedgerTransactions(remainingTxns);

  // 2. Clear entries for removed transactions
  const allEntries = getLocalEntries();
  const remainingEntries = allEntries.filter((e) => !wsTxnIds.has(e.transaction_id));
  saveLocalEntries(remainingEntries);

  // 3. Reset all account opening balances to 0
  const accounts = getLocalAccounts(targetWsId);
  const resetAccounts = accounts.map((acc) => ({
    ...acc,
    opening_balance: 0,
    current_balance: 0,
    updated_at: new Date().toISOString(),
  }));
  saveLocalAccounts(resetAccounts, targetWsId);

  // 4. Reset bank account opening balances
  const banks = getLocalBankAccounts(targetWsId);
  const resetBanks = banks.map((b) => ({
    ...b,
    opening_balance: 0,
    current_balance: 0,
    updated_at: new Date().toISOString(),
  }));
  saveLocalBankAccounts(resetBanks, targetWsId);

  // 5. Supabase cleanup
  try {
    const supabase = createClient();
    if (wsTxnIds.size > 0) {
      const ids = Array.from(wsTxnIds);
      await supabase.from("ledger_entries").delete().in("transaction_id", ids);
      await supabase.from("ledger_transactions").delete().in("id", ids);
    }
    await supabase.from("ledger_accounts").update({ opening_balance: 0, current_balance: 0 }).eq("workspace_id", targetWsId);
    await supabase.from("bank_accounts").update({ opening_balance: 0, current_balance: 0 }).eq("workspace_id", targetWsId);
  } catch (err) {
    console.warn("Supabase ledger reset (non-critical):", err);
  }

  return {
    success: true,
    message: `Ledger data reset complete. ${wsTxns.length} transactions and associated entries cleared. All opening balances set to AED 0.00.`,
    clearedTransactions: wsTxns.length,
    clearedEntries: allEntries.length - remainingEntries.length,
  };
}

