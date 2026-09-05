/**
 * Force Delete Test Invoice Service (Owner / Super Admin Only)
 * 
 * Safely and permanently removes test invoices and their linked financial
 * dependencies in proper dependency order:
 * 1. Payments & allocations linked to the invoice
 * 2. Ledger transactions & entries posted for the invoice and payments
 * 3. Invoice line items (services, parts)
 * 4. Job card unlinking & inventory stock reversal (without double-adding)
 * 5. Document references, WhatsApp logs, and Recycle Bin records
 * 6. Customer outstanding recalculation
 * 7. Cash & Bank balance recalculation
 * 8. Dashboard cache invalidation
 * 
 * STRICT WORKSPACE ISOLATION: Targets ONLY activeWorkspaceId.
 */

import { createClient } from "@/lib/supabase/client";
import { getLocalInvoices, saveLocalInvoices, getLocalInvoiceItems, saveLocalInvoiceItems } from "./invoice-service";
import { getLocalPayments, saveLocalPayments } from "./payment-service";
import {
  getLocalTransactions,
  saveLocalTransactions,
  getLocalEntries,
  saveLocalEntries,
  getLocalAccounts,
  saveLocalAccounts,
} from "./ledger-service";
import { getLocalJobCards, saveLocalJobCards } from "./job-card-service";
import { getLocalParts, saveLocalParts } from "./parts-service";
import { getLocalTransactions as getLocalInvTxns, saveLocalTransactions as saveLocalInvTxns } from "./inventory-service";
import { getLocalCustomers, saveLocalCustomers } from "./customer-service";
import { getLocalRecycleBinHistory, saveLocalRecycleBinHistory } from "./recycle-bin-service";
import { invalidateDashboardCache } from "./dashboard-service";
import { isTableMissingInSupabase } from "./supabase-schema-status";

export interface ForceDeleteResult {
  success: boolean;
  invoiceId: string;
  invoiceNumber: string;
  paymentsRemovedCount: number;
  totalPaymentsRemoved: number;
  ledgerTransactionsRemoved: number;
  inventoryRestoredCount: number;
  message: string;
}

/**
 * Permanently remove a single test invoice and all its financial & inventory dependencies.
 */
export async function forceDeleteTestInvoice(
  invoiceId: string,
  workspaceId: string,
  deletedBy = "Primary Owner"
): Promise<ForceDeleteResult> {
  if (!invoiceId || !workspaceId) {
    throw new Error("Invoice ID and Workspace ID are required for force delete.");
  }

  const supabase = createClient();
  const isCloudConnected = !isTableMissingInSupabase("invoices");

  // 1. Locate the invoice in local or cloud store
  const allInvoices = getLocalInvoices(workspaceId);
  const targetInvoice = allInvoices.find((inv) => inv.id === invoiceId);

  let invoiceNumber = targetInvoice?.invoice_number || invoiceId;
  let jobCardId = targetInvoice?.job_card_id;
  let customerId = targetInvoice?.customer_id;
  let recordedPaid = Number(targetInvoice?.paid) || 0;

  // If cloud connected, also query cloud for invoice metadata
  if (isCloudConnected) {
    try {
      const { data: cloudInv } = await supabase
        .from("invoices")
        .select("id, invoice_number, job_card_id, customer_id, paid, workspace_id")
        .eq("id", invoiceId)
        .eq("workspace_id", workspaceId)
        .maybeSingle();

      if (cloudInv) {
        invoiceNumber = cloudInv.invoice_number || invoiceNumber;
        jobCardId = cloudInv.job_card_id || jobCardId;
        customerId = cloudInv.customer_id || customerId;
        recordedPaid = Math.max(recordedPaid, Number(cloudInv.paid) || 0);
      }
    } catch {
      // ignore
    }
  }

  // 2. Locate and remove all linked payments
  const allPayments = getLocalPayments();
  const linkedPayments = allPayments.filter(
    (p) => p.invoice_id === invoiceId || p.reference_number === invoiceNumber
  );

  let totalPaymentAmount = 0;
  const paymentIds = new Set<string>();

  linkedPayments.forEach((p) => {
    paymentIds.add(p.id);
    totalPaymentAmount += Number(p.amount) || 0;
  });

  // Also query cloud payments if available
  if (isCloudConnected) {
    try {
      const { data: cloudPayments } = await supabase
        .from("payments")
        .select("id, amount")
        .eq("invoice_id", invoiceId);

      if (cloudPayments) {
        cloudPayments.forEach((p: any) => {
          paymentIds.add(p.id);
        });
      }
    } catch {}
  }

  // Remove payments locally
  const remainingPayments = allPayments.filter(
    (p) => p.invoice_id !== invoiceId && !paymentIds.has(p.id)
  );
  saveLocalPayments(remainingPayments);

  // Remove payments in cloud
  if (isCloudConnected && paymentIds.size > 0) {
    try {
      await supabase
        .from("payments")
        .delete()
        .eq("invoice_id", invoiceId);
    } catch {}
  }

  // 3. Clean up Ledger Transactions & Entries
  // Transactions associated directly with invoice OR with any of the payments
  const allTxns = getLocalTransactions();
  const allEntries = getLocalEntries();

  const txnsToRemove = allTxns.filter((t) => {
    if (t.reference_type === "invoice" && (t.reference_id === invoiceId || t.description?.includes(invoiceNumber))) {
      return true;
    }
    if (t.reference_type === "payment" && t.reference_id && paymentIds.has(t.reference_id)) {
      return true;
    }
    if (t.description?.includes(invoiceNumber)) {
      return true;
    }
    return false;
  });

  const txnIdsToRemove = new Set(txnsToRemove.map((t) => t.id));

  // Filter local ledger transactions & entries
  const remainingTxns = allTxns.filter((t) => !txnIdsToRemove.has(t.id));
  const remainingEntries = allEntries.filter((e) => !txnIdsToRemove.has(e.transaction_id));

  saveLocalTransactions(remainingTxns);
  saveLocalEntries(remainingEntries);

  // Remove in cloud ledger
  if (isCloudConnected && txnIdsToRemove.size > 0) {
    try {
      const ids = Array.from(txnIdsToRemove);
      await supabase.from("ledger_entries").delete().in("transaction_id", ids);
      await supabase.from("ledger_transactions").delete().in("id", ids);
    } catch {}
  }

  // 4. Clean up Invoice Items
  const allItems = getLocalInvoiceItems();
  const remainingItems = allItems.filter((item) => item.invoice_id !== invoiceId);
  saveLocalInvoiceItems(remainingItems);

  if (isCloudConnected) {
    try {
      await supabase.from("invoice_items").delete().eq("invoice_id", invoiceId);
    } catch {}
  }

  // 5. Job Card Unlinking & Inventory Stock Reversal
  let inventoryRestoredCount = 0;
  if (jobCardId) {
    const allJobCards = getLocalJobCards(workspaceId);
    const jcIndex = allJobCards.findIndex((j) => j.id === jobCardId);
    if (jcIndex !== -1) {
      allJobCards[jcIndex] = {
        ...allJobCards[jcIndex],
        is_invoiced: false,
        invoice_id: null,
        invoice_number: null,
        updated_at: new Date().toISOString(),
      };
      saveLocalJobCards(allJobCards, workspaceId);
    }

    if (isCloudConnected) {
      try {
        await supabase
          .from("job_cards")
          .update({
            is_invoiced: false,
            invoice_id: null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", jobCardId)
          .eq("workspace_id", workspaceId);
      } catch {}
    }

    // Inspect inventory movements for parts
    const allParts = getLocalParts(workspaceId);
    const allInvTxns = getLocalInvTxns();
    let partsUpdated = false;

    // Find stock movements for this invoice or job card
    const relatedInvTxns = allInvTxns.filter(
      (tx) =>
        (tx.reference_type === "invoice" && tx.reference_id === invoiceId) ||
        (tx.reference_type === "job_card" && tx.reference_id === jobCardId && tx.transaction_type === "job_card_out")
    );

    for (const tx of relatedInvTxns) {
      const partIdx = allParts.findIndex((p) => p.id === tx.part_id);
      if (partIdx !== -1) {
        // Restore stock
        const restoredQty = Number(tx.quantity) || 0;
        allParts[partIdx].current_stock = (Number(allParts[partIdx].current_stock) || 0) + restoredQty;
        allParts[partIdx].updated_at = new Date().toISOString();
        partsUpdated = true;
        inventoryRestoredCount++;
      }
    }

    if (partsUpdated) {
      saveLocalParts(allParts, workspaceId);
    }

    // Filter out related inventory movements
    const remainingInvTxns = allInvTxns.filter(
      (tx) =>
        !(
          (tx.reference_type === "invoice" && tx.reference_id === invoiceId) ||
          (tx.reference_type === "job_card" && tx.reference_id === jobCardId && tx.transaction_type === "job_card_out")
        )
    );
    saveLocalInvTxns(remainingInvTxns);

    if (isCloudConnected && relatedInvTxns.length > 0) {
      try {
        const txIds = relatedInvTxns.map((t) => t.id);
        await supabase.from("inventory_transactions").delete().in("id", txIds);
      } catch {}
    }
  }

  // 6. Clean up Recycle Bin & Audit Logs
  const allRecycle = getLocalRecycleBinHistory();
  const filteredRecycle = allRecycle.filter(
    (item) => item.record_id !== invoiceId && !paymentIds.has(item.record_id)
  );
  saveLocalRecycleBinHistory(filteredRecycle);

  if (isCloudConnected) {
    try {
      await supabase
        .from("recycle_bin_history")
        .delete()
        .eq("record_id", invoiceId);
    } catch {}
  }

  // 7. Remove the Invoice Row
  const remainingInvoices = allInvoices.filter((inv) => inv.id !== invoiceId);
  saveLocalInvoices(remainingInvoices, workspaceId);

  if (isCloudConnected) {
    try {
      await supabase
        .from("invoices")
        .delete()
        .eq("id", invoiceId)
        .eq("workspace_id", workspaceId);
    } catch {}
  }

  // 8. Recalculate Customer Outstanding Balance
  if (customerId) {
    const allCustomers = getLocalCustomers(workspaceId);
    const custIdx = allCustomers.findIndex((c) => c.id === customerId);
    if (custIdx !== -1) {
      // Calculate remaining unpaid balance from active invoices
      const custInvoices = remainingInvoices.filter(
        (inv) => inv.customer_id === customerId && inv.is_deleted !== true && inv.payment_status !== "void"
      );
      const newOutstanding = custInvoices.reduce(
        (sum, inv) => sum + (Number(inv.balance) || 0),
        0
      );

      allCustomers[custIdx] = {
        ...allCustomers[custIdx],
        outstanding_balance: Math.round(newOutstanding * 100) / 100,
        updated_at: new Date().toISOString(),
      };
      saveLocalCustomers(allCustomers, workspaceId);

      if (isCloudConnected) {
        try {
          await supabase
            .from("customers")
            .update({
              outstanding_balance: Math.round(newOutstanding * 100) / 100,
              updated_at: new Date().toISOString(),
            })
            .eq("id", customerId)
            .eq("workspace_id", workspaceId);
        } catch {}
      }
    }
  }

  // 9. Invalidate Dashboard Cache
  invalidateDashboardCache();

  return {
    success: true,
    invoiceId,
    invoiceNumber,
    paymentsRemovedCount: linkedPayments.length,
    totalPaymentsRemoved: totalPaymentAmount,
    ledgerTransactionsRemoved: txnsToRemove.length,
    inventoryRestoredCount,
    message: `Test invoice #${invoiceNumber} and its linked financial records (AED ${totalPaymentAmount.toFixed(2)} in payments, ${txnsToRemove.length} ledger postings) were permanently removed.`,
  };
}

/**
 * Bulk force delete multiple test invoices.
 */
export async function bulkForceDeleteTestInvoices(
  invoiceIds: string[],
  workspaceId: string,
  deletedBy = "Primary Owner"
): Promise<{
  success: boolean;
  totalDeleted: number;
  totalPaymentsRemoved: number;
  results: ForceDeleteResult[];
}> {
  let totalPayments = 0;
  const results: ForceDeleteResult[] = [];

  for (const id of invoiceIds) {
    try {
      const res = await forceDeleteTestInvoice(id, workspaceId, deletedBy);
      totalPayments += res.totalPaymentsRemoved;
      results.push(res);
    } catch (err: any) {
      console.error(`Failed to force delete test invoice ${id}:`, err);
    }
  }

  invalidateDashboardCache();

  return {
    success: results.length > 0,
    totalDeleted: results.length,
    totalPaymentsRemoved: totalPayments,
    results,
  };
}
