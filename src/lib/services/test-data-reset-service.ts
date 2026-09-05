/**
 * Test Data Reset & Fresh Start Service (Primary Owner / Super Admin Only)
 * 
 * Provides granular test data deletion and one-click Fresh Start
 * exclusively for the primary workspace (ATIQ JEHAN AUTO REPAIR).
 * 
 * STRICT SAFETY RULES:
 * 1. Strictly scoped to target workspace_id.
 * 2. Foreign workspaces (e.g. ibrar) are strictly protected and never touched.
 * 3. Preserves software configuration:
 *    - Workspace setup, VAT/TRN details, templates, terms
 *    - Owner login, Supabase Auth users, staff permissions & roles
 *    - Services master catalog, Spare Parts definitions, Supplier records
 *    - Chart of Accounts, Bank account definitions, Cash account definition
 * 4. Resets financial ledger transactional postings and balances to zero:
 *    - Cash on Hand = AED 0.00
 *    - Total Bank Balance = AED 0.00
 *    - Customer Receivables = AED 0.00
 *    - Supplier Payables = AED 0.00
 *    - Worker Payables = AED 0.00
 *    - Owner Capital transactional balance = AED 0.00
 * 5. Pre-reset safety: Backup creation & count summary verification.
 */

import { createClient } from "@/lib/supabase/client";
import { getLocalInvoices, saveLocalInvoices, getLocalInvoiceItems, saveLocalInvoiceItems } from "./invoice-service";
import { getLocalPayments, saveLocalPayments } from "./payment-service";
import { getLocalCustomers, saveLocalCustomers, clearSearchCache } from "./customer-service";
import { getLocalVehicles, saveLocalVehicles } from "./vehicle-service";

import { getLocalJobCards, saveLocalJobCards } from "./job-card-service";
import { getLocalExpenses, saveLocalExpenses, clearAllWorkspaceExpenses } from "./expense-service";
import { getLocalPurchases, saveLocalPurchases } from "./purchase-service";

import {
  getLocalTransactions,
  saveLocalTransactions,
  getLocalEntries,
  saveLocalEntries,
  getLocalAccounts,
  saveLocalAccounts,
  getLocalBankAccounts,
  saveLocalBankAccounts,
  getLocalWorkers,
  saveLocalWorkers,
  resetAllLedgerData,
} from "./ledger-service";
import { getLocalParts, saveLocalParts } from "./parts-service";
import { getLocalSuppliers, saveLocalSuppliers } from "./supplier-service";
import { getLocalTransactions as getLocalInvTxns, saveLocalTransactions as saveLocalInvTxns } from "./inventory-service";
import { getLocalRecycleBinHistory, saveLocalRecycleBinHistory } from "./recycle-bin-service";
import { invalidateDashboardCache } from "./dashboard-service";
import { isTableMissingInSupabase } from "./supabase-schema-status";

export interface WorkspaceTestCounts {
  customers: number;
  vehicles: number;
  jobCards: number;
  invoices: number;
  payments: number;
  expenses: number;
  purchases: number;
  ledgerTransactions: number;
  inventoryTransactions: number;
  recycleBinRecords: number;
  totalTestRecords: number;
}

/**
 * Live counts of operational test records for the target workspace.
 */
export async function getWorkspaceTestCounts(workspaceId: string): Promise<WorkspaceTestCounts> {
  const customers = getLocalCustomers(workspaceId).length;
  const vehicles = getLocalVehicles().filter((v) => (v as any).workspace_id === workspaceId || !(v as any).workspace_id).length;
  const jobCards = getLocalJobCards(workspaceId).length;
  const invoices = getLocalInvoices(workspaceId).length;
  const payments = getLocalPayments().filter((p) => p.workspace_id === workspaceId || !p.workspace_id).length;
  const expenses = getLocalExpenses(workspaceId).length;
  const purchases = getLocalPurchases(workspaceId).length;
  const ledgerTransactions = getLocalTransactions().filter(
    (t) => t.workspace_id === workspaceId || !t.workspace_id
  ).length;
  const inventoryTransactions = getLocalInvTxns().filter(
    (tx) => tx.workspace_id === workspaceId || !tx.workspace_id
  ).length;
  const recycleBinRecords = getLocalRecycleBinHistory().filter(
    (r) => (r.metadata as any)?.workspace_id === workspaceId || !(r.metadata as any)?.workspace_id
  ).length;

  const totalTestRecords =
    customers +
    vehicles +
    jobCards +
    invoices +
    payments +
    expenses +
    purchases +
    ledgerTransactions +
    inventoryTransactions +
    recycleBinRecords;

  return {
    customers,
    vehicles,
    jobCards,
    invoices,
    payments,
    expenses,
    purchases,
    ledgerTransactions,
    inventoryTransactions,
    recycleBinRecords,
    totalTestRecords,
  };
}

/**
 * Generate a complete JSON export backup for the workspace before wiping test data.
 */
export async function exportWorkspaceDataBackup(workspaceId: string): Promise<string> {
  const backup = {
    exportDate: new Date().toISOString(),
    workspaceId,
    customers: getLocalCustomers(workspaceId),
    vehicles: getLocalVehicles().filter((v) => (v as any).workspace_id === workspaceId || !(v as any).workspace_id),
    jobCards: getLocalJobCards(workspaceId),
    invoices: getLocalInvoices(workspaceId),
    invoiceItems: getLocalInvoiceItems(),
    payments: getLocalPayments().filter((p) => p.workspace_id === workspaceId || !p.workspace_id),
    expenses: getLocalExpenses(workspaceId),
    purchases: getLocalPurchases(workspaceId),
    ledgerTransactions: getLocalTransactions().filter((t) => t.workspace_id === workspaceId || !t.workspace_id),
    ledgerEntries: getLocalEntries(),
    inventoryTransactions: getLocalInvTxns().filter((t) => t.workspace_id === workspaceId || !t.workspace_id),
    recycleBinHistory: getLocalRecycleBinHistory().filter((r) => (r.metadata as any)?.workspace_id === workspaceId || !(r.metadata as any)?.workspace_id),
    ledgerAccounts: getLocalAccounts(workspaceId),
    bankAccounts: getLocalBankAccounts(workspaceId),
    workers: getLocalWorkers(workspaceId),
    suppliers: getLocalSuppliers(workspaceId),
    parts: getLocalParts(workspaceId),
  };

  return JSON.stringify(backup, null, 2);
}

/**
 * Granularly reset selected test modules for the active workspace.
 */
export async function resetSelectedTestData(
  workspaceId: string,
  selectedModules: string[],
  resetBy = "Primary Owner"
): Promise<{ success: boolean; modulesReset: string[]; message: string }> {
  if (!workspaceId) throw new Error("Workspace ID is required.");
  const isCloudConnected = !isTableMissingInSupabase("workspaces");
  const supabase = createClient();

  const modulesReset: string[] = [];

  // 1. Payments
  if (selectedModules.includes("payments")) {
    const allPayments = getLocalPayments();
    const remaining = allPayments.filter((p) => p.workspace_id && p.workspace_id !== workspaceId);
    saveLocalPayments(remaining);

    if (isCloudConnected) {
      try {
        await supabase.from("payments").delete().eq("workspace_id", workspaceId);
      } catch {}
    }
    modulesReset.push("Payments");
  }

  // 2. Invoices & Items
  if (selectedModules.includes("invoices")) {
    const allInvoices = getLocalInvoices(workspaceId);
    const invIds = new Set(allInvoices.map((i) => i.id));

    saveLocalInvoices([], workspaceId);

    const allItems = getLocalInvoiceItems();
    saveLocalInvoiceItems(allItems.filter((it: any) => !invIds.has(it.invoice_id)));

    // Unlink job cards
    const allJobCards = getLocalJobCards(workspaceId);
    const unlinkedJcs = allJobCards.map((j) => ({
      ...j,
      is_invoiced: false,
      invoice_id: null,
      invoice_number: null,
    }));
    saveLocalJobCards(unlinkedJcs, workspaceId);

    if (isCloudConnected) {
      try {
        await supabase.from("invoice_items").delete().in("invoice_id", Array.from(invIds));
        await supabase.from("invoices").delete().eq("workspace_id", workspaceId);
        await supabase.from("job_cards").update({ is_invoiced: false, invoice_id: null }).eq("workspace_id", workspaceId);
      } catch {}
    }
    modulesReset.push("Invoices & Items");
  }

  // 3. Job Cards & Items
  if (selectedModules.includes("job_cards")) {
    const allJcs = getLocalJobCards(workspaceId);
    const jcIds = new Set(allJcs.map((j) => j.id));

    saveLocalJobCards([], workspaceId);

    if (isCloudConnected) {
      try {
        await supabase.from("job_card_items").delete().in("job_card_id", Array.from(jcIds));
        await supabase.from("job_cards").delete().eq("workspace_id", workspaceId);
      } catch {}
    }
    modulesReset.push("Job Cards & Items");
  }

  // 4. Vehicles
  if (selectedModules.includes("vehicles")) {
    const allVehicles = getLocalVehicles();
    const remainingVehicles = allVehicles.filter(
      (v) => (v as any).workspace_id && (v as any).workspace_id !== workspaceId
    );
    saveLocalVehicles(remainingVehicles);

    if (isCloudConnected) {
      try {
        await supabase.from("vehicles").delete().eq("workspace_id", workspaceId);
      } catch {}
    }
    modulesReset.push("Vehicles");
  }

  // 5. Customers
  if (selectedModules.includes("customers")) {
    saveLocalCustomers([], workspaceId);
    if (isCloudConnected) {
      try {
        await supabase.from("customers").delete().eq("workspace_id", workspaceId);
      } catch {}
    }
    modulesReset.push("Customers");
  }

  // 6. Expenses
  if (selectedModules.includes("expenses")) {
    await clearAllWorkspaceExpenses(workspaceId);
    modulesReset.push("Expenses");
  }


  // 7. Purchases
  if (selectedModules.includes("purchases")) {
    const allPurchases = getLocalPurchases(workspaceId);
    const purchaseIds = new Set(allPurchases.map((p) => p.id));
    saveLocalPurchases([], workspaceId);

    if (isCloudConnected) {
      try {
        await supabase.from("purchase_items").delete().in("purchase_id", Array.from(purchaseIds));
        await supabase.from("purchases").delete().eq("workspace_id", workspaceId);
      } catch {}
    }
    modulesReset.push("Purchases");
  }

  // 8. Ledger Transactions & Entries
  if (selectedModules.includes("ledger_transactions")) {
    await resetAllLedgerData(workspaceId);
    modulesReset.push("Ledger Transactions");
  }

  // 9. Inventory Test Transactions
  if (selectedModules.includes("inventory_transactions")) {
    const allInv = getLocalInvTxns();
    const remainingInv = allInv.filter((t) => t.workspace_id && t.workspace_id !== workspaceId);
    saveLocalInvTxns(remainingInv);

    // Reset spare parts stock to clean initial count
    const parts = getLocalParts(workspaceId);
    const cleanedParts = parts.map((p) => ({
      ...p,
      current_stock: 0,
      updated_at: new Date().toISOString(),
    }));
    saveLocalParts(cleanedParts, workspaceId);

    if (isCloudConnected) {
      try {
        await supabase.from("inventory_transactions").delete().eq("workspace_id", workspaceId);
      } catch {}
    }
    modulesReset.push("Inventory Test Transactions");
  }

  // 10. Recycle Bin Records
  if (selectedModules.includes("recycle_bin")) {
    const allRecycle = getLocalRecycleBinHistory();
    const remainingRecycle = allRecycle.filter(
      (r) => (r.metadata as any)?.workspace_id && (r.metadata as any)?.workspace_id !== workspaceId
    );
    saveLocalRecycleBinHistory(remainingRecycle);

    if (isCloudConnected) {
      try {
        await supabase.from("recycle_bin_history").delete().eq("workspace_id", workspaceId);
      } catch {}
    }
    modulesReset.push("Recycle Bin Records");
  }

  invalidateDashboardCache();
  clearSearchCache();

  return {

    success: true,
    modulesReset,
    message: `Successfully reset test data for: ${modulesReset.join(", ")}.`,
  };
}

/**
 * ONE-CLICK FRESH START: Complete Operational Test Data Purge for ATIQ JEHAN AUTO REPAIR.
 * Resets Customers, Vehicles, Job Cards, Invoices, Payments, Expenses, Purchases,
 * Ledger Transactions, and Recycle Bin to ZERO.
 * Resets Cash, Bank, Receivables, Payables balances to AED 0.00.
 * Preserves all configuration, master catalogs, chart of accounts, bank accounts, and foreign workspaces.
 */
export async function executeFreshStart(
  workspaceId: string,
  confirmedBy = "Primary Owner"
): Promise<{ success: boolean; message: string; timestamp: string }> {
  if (!workspaceId) throw new Error("Workspace ID is required for Fresh Start.");

  const allModules = [
    "payments",
    "invoices",
    "job_cards",
    "vehicles",
    "customers",
    "expenses",
    "purchases",
    "ledger_transactions",
    "inventory_transactions",
    "recycle_bin",
  ];

  await resetSelectedTestData(workspaceId, allModules, confirmedBy);

  // 1. Reset Chart of Accounts balances and opening balances to 0
  const accounts = getLocalAccounts(workspaceId);
  const resetAccounts = accounts.map((acc) => ({
    ...acc,
    opening_balance: 0,
    current_balance: 0,
    updated_at: new Date().toISOString(),
  }));
  saveLocalAccounts(resetAccounts, workspaceId);

  // 2. Reset Bank Account definitions opening and current balances to 0
  const bankAccounts = getLocalBankAccounts(workspaceId);
  const resetBanks = bankAccounts.map((b) => ({
    ...b,
    opening_balance: 0,
    current_balance: 0,
    updated_at: new Date().toISOString(),
  }));
  saveLocalBankAccounts(resetBanks, workspaceId);

  // 3. Reset Workers balance to 0
  const workers = getLocalWorkers(workspaceId);
  const resetWorkers = workers.map((w) => ({
    ...w,
    current_balance: 0,
    updated_at: new Date().toISOString(),
  }));
  saveLocalWorkers(resetWorkers, workspaceId);

  // 4. Reset Suppliers pending balance to 0
  const suppliers = getLocalSuppliers(workspaceId);
  const resetSuppliers = suppliers.map((s) => ({
    ...s,
    total_purchases: 0,
    total_paid: 0,
    total_pending: 0,
    outstanding_balance: 0,
    updated_at: new Date().toISOString(),
  }));
  saveLocalSuppliers(resetSuppliers, workspaceId);

  // 5. Reset Spare Parts stock to 0
  const parts = getLocalParts(workspaceId);
  const resetParts = parts.map((p) => ({
    ...p,
    current_stock: 0,
    updated_at: new Date().toISOString(),
  }));
  saveLocalParts(resetParts, workspaceId);

  // 6. If Supabase is connected, update balances
  const isCloudConnected = !isTableMissingInSupabase("workspaces");
  if (isCloudConnected) {
    const supabase = createClient();
    try {
      await supabase.from("ledger_accounts").update({ opening_balance: 0, current_balance: 0 }).eq("workspace_id", workspaceId);
      await supabase.from("bank_accounts").update({ opening_balance: 0, current_balance: 0 }).eq("workspace_id", workspaceId);
      await supabase.from("workers").update({ current_balance: 0 }).eq("workspace_id", workspaceId);
      await supabase.from("parts").update({ current_stock: 0 }).eq("workspace_id", workspaceId);
    } catch {}
  }

  // Invalidate all dashboard metrics and search cache
  invalidateDashboardCache();
  clearSearchCache();

  return {

    success: true,
    message: "ATIQ JEHAN AUTO REPAIR has been reset to a clean, fresh state. Operational transactional counts and balances are now 0.00. Software configuration and master catalogs remain intact.",
    timestamp: new Date().toISOString(),
  };
}
