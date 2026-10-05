import { createClient } from "@/lib/supabase/client";
import { generateUUID } from "@/lib/utils";
import { getActiveWorkspaceId } from "./workspace-service";
import type { InventoryTransaction, InventoryTransactionType, Part } from "@/types/database";
import { getPartById, updatePart, getLocalParts, saveLocalParts } from "./parts-service";

const LOCAL_TX_KEY = "atiq_local_inventory_transactions";

const DEFAULT_TRANSACTIONS: InventoryTransaction[] = [
  {
    id: "tx-1",
    part_id: "prt-1",
    transaction_type: "purchase",
    quantity: 35,
    quantity_before: 0,
    quantity_after: 35,
    unit_cost: 110,
    reference_type: "purchase",
    reference_id: "PO-2026-001",
    notes: "Initial inventory stock in",
    created_by: "Owner",
    created_at: "2026-01-10T08:30:00.000Z",
  },
  {
    id: "tx-2",
    part_id: "prt-2",
    transaction_type: "purchase",
    quantity: 50,
    quantity_before: 0,
    quantity_after: 50,
    unit_cost: 25,
    reference_type: "purchase",
    reference_id: "PO-2026-001",
    notes: "Initial inventory stock in",
    created_by: "Owner",
    created_at: "2026-01-10T08:30:00.000Z",
  },
  {
    id: "tx-3",
    part_id: "prt-3",
    transaction_type: "purchase",
    quantity: 20,
    quantity_before: 0,
    quantity_after: 20,
    unit_cost: 140,
    reference_type: "purchase",
    reference_id: "PO-2026-002",
    notes: "Brembo batch purchase",
    created_by: "Owner",
    created_at: "2026-01-11T09:00:00.000Z",
  },
  {
    id: "tx-4",
    part_id: "prt-3",
    transaction_type: "job_card_usage",
    quantity: -2,
    quantity_before: 20,
    quantity_after: 18,
    unit_cost: 140,
    reference_type: "job_card",
    reference_id: "JC-1060",
    notes: "Used in Job Card #1060 (Toyota Camry)",
    created_by: "Owner",
    created_at: "2026-01-15T10:15:00.000Z",
  },
];

let inMemoryTransactions: InventoryTransaction[] = [...DEFAULT_TRANSACTIONS];

export function getLocalTransactions(): InventoryTransaction[] {
  if (typeof window === "undefined") return inMemoryTransactions;
  try {
    const raw = localStorage.getItem(LOCAL_TX_KEY);
    if (raw !== null) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
    localStorage.setItem(LOCAL_TX_KEY, JSON.stringify(DEFAULT_TRANSACTIONS));
    return inMemoryTransactions.length > 0 ? inMemoryTransactions : DEFAULT_TRANSACTIONS;
  } catch {
    return inMemoryTransactions.length > 0 ? inMemoryTransactions : DEFAULT_TRANSACTIONS;
  }
}


export function saveLocalTransactions(txs: InventoryTransaction[]) {
  inMemoryTransactions = txs;
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LOCAL_TX_KEY, JSON.stringify(txs));
  } catch (e) {
    console.error("Failed to save local inventory transactions", e);
  }
}

/**
 * Fetch inventory transactions ledger with resilient fallback
 */
export async function getInventoryTransactions(
  partId?: string,
  transactionType?: string,
  page = 1,
  limit = 50,
  workspaceId?: string
): Promise<{ transactions: InventoryTransaction[]; total: number }> {
  const targetWsId = workspaceId || await getActiveWorkspaceId();
  const supabase = createClient();
  const offset = (page - 1) * limit;

  let query = supabase
    .from("inventory_transactions")
    .select("*, part:parts(name, part_number, unit, brand)", { count: "exact" })
    .eq("workspace_id", targetWsId);

  if (partId) {
    query = query.eq("part_id", partId);
  }

  if (transactionType && transactionType !== "all") {
    query = query.eq("transaction_type", transactionType.toLowerCase());
  }

  const { data, count, error } = await query
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    console.error("Failed to fetch inventory transactions from Supabase:", error);
    throw new Error(`Failed to fetch inventory transactions: ${error.message}`);
  }

  return { transactions: data as InventoryTransaction[] || [], total: count || 0 };
}

export interface RecordTransactionParams {
  partId: string;
  transactionType: "purchase" | "job_card_usage" | "job_card_reversal" | "sale" | "return" | "adjustment_in" | "adjustment_out" | "adjustment" | string;
  quantityChange: number; // positive to add stock, negative to subtract stock
  unitCost?: number;
  referenceType?: string | null;
  referenceId?: string | null;
  notes?: string | null;
  createdBy?: string | null;
  workspaceId?: string;
  workspace_id?: string;
}

/**
 * Atomic stock change ledger transaction with strict negative stock prevention
 */
export async function recordStockTransaction(params: RecordTransactionParams): Promise<InventoryTransaction> {
  const {
    partId,
    transactionType,
    quantityChange,
    unitCost,
    referenceType = null,
    referenceId = null,
    notes = null,
    createdBy = null,
  } = params;

  const targetWsId = params.workspace_id || params.workspaceId || getActiveWorkspaceId();
  const supabase = createClient();
  const now = new Date().toISOString();

  // 1. Fetch current stock
  const part = await getPartById(partId, targetWsId);
  if (!part) {
    throw new Error("Spare part not found in inventory catalog.");
  }

  const currentStock = Number(part.current_stock) || 0;
  const newStock = currentStock + quantityChange;

  // 2. Validate negative stock
  if (newStock < 0) {
    throw new Error(
      `Insufficient stock for "${part.name}". Current stock is ${currentStock}, requested quantity change is ${quantityChange}. Stock cannot be negative.`
    );
  }

  // 3. Update part stock in Master table
  await updatePart(partId, { current_stock: newStock }, targetWsId);

  const effectiveCost = unitCost !== undefined ? Number(unitCost) : Number(part.purchase_price) || 0;
  const txId = generateUUID();

  // 4. Create Ledger Record in Supabase
  const { data, error } = await supabase
    .from("inventory_transactions")
    .insert({
      id: txId,
      workspace_id: targetWsId,
      part_id: partId,
      transaction_type: transactionType.toLowerCase(),
      quantity: quantityChange,
      quantity_before: currentStock,
      quantity_after: newStock,
      unit_cost: effectiveCost,
      reference_type: referenceType,
      reference_id: referenceId,
      notes: notes || `${transactionType.toUpperCase()} of ${Math.abs(quantityChange)} ${part.unit || "unit(s)"}`,
      created_by: createdBy,
      created_at: now,
    })
    .select("*, part:parts(name, part_number, unit, brand)")
    .single();

  if (error) {
    console.error("Failed to insert inventory transaction in Supabase:", error);
    throw new Error(`Failed to record stock transaction: ${error.message}`);
  }

  return data as InventoryTransaction;
}

/**
 * Manual stock adjustment (Increase or Decrease)
 */
export async function recordStockAdjustment(
  partId: string,
  adjustmentQty: number,
  reason = "Physical Count Reconciled",
  notes = "",
  createdBy = "Owner",
  workspaceId?: string
): Promise<InventoryTransaction> {
  const txType = adjustmentQty >= 0 ? "adjustment_in" : "adjustment_out";
  const formattedNotes = reason
    ? (notes && notes.trim() ? `${reason} — ${notes.trim()}` : reason)
    : (notes || "Manual Inventory Count Adjustment");

  return recordStockTransaction({
    partId,
    transactionType: txType,
    quantityChange: adjustmentQty,
    referenceType: "manual_adjustment",
    referenceId: "ADJ-" + Date.now().toString().slice(-6),
    notes: formattedNotes,
    createdBy,
    workspace_id: workspaceId,
  });
}
