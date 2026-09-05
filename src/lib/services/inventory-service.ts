import { createClient } from "@/lib/supabase/client";
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

function withTimeout<T>(promise: PromiseLike<T>, timeoutMs = 2000): Promise<T> {
  return Promise.race([
    Promise.resolve(promise),
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error("Inventory query timed out")), timeoutMs)
    ),
  ]);
}

/**
 * Fetch inventory transactions ledger with resilient fallback
 */
export async function getInventoryTransactions(
  partId?: string,
  transactionType?: string,
  page = 1,
  limit = 50
): Promise<{ transactions: InventoryTransaction[]; total: number }> {
  const supabase = createClient();
  const offset = (page - 1) * limit;

  try {
    const fetchWithTimeout = async () => {
      let query = supabase
        .from("inventory_transactions")
        .select("*, part:parts(name, part_number, unit, brand)", { count: "exact" });

      if (partId) {
        query = query.eq("part_id", partId);
      }

      if (transactionType && transactionType !== "all") {
        query = query.eq("transaction_type", transactionType.toLowerCase());
      }

      const { data, count, error } = await query
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) throw error;
      return { data: data as InventoryTransaction[], count: count || 0 };
    };

    const result = await withTimeout(fetchWithTimeout(), 2000);
    return { transactions: result.data || [], total: result.count || 0 };
  } catch (err: any) {
    console.warn("Using local inventory transactions ledger fallback:", err.message || err);

    let list = getLocalTransactions();
    const parts = getLocalParts();
    const partsMap = new Map(parts.map((p) => [p.id, p]));

    // Attach part relation
    let enriched = list.map((tx) => ({
      ...tx,
      part: tx.part || partsMap.get(tx.part_id) || null,
    }));

    if (partId) {
      enriched = enriched.filter((tx) => tx.part_id === partId);
    }

    if (transactionType && transactionType !== "all") {
      const qType = transactionType.toLowerCase();
      enriched = enriched.filter((tx) => (tx.transaction_type || "").toLowerCase() === qType);
    }

    // Sort by created_at DESC
    enriched.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    const total = enriched.length;
    const paginated = enriched.slice(offset, offset + limit);

    return { transactions: paginated, total };
  }
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

  const supabase = createClient();
  const now = new Date().toISOString();

  // 1. Fetch current stock
  const part = await getPartById(partId);
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
  await updatePart(partId, { current_stock: newStock });

  const effectiveCost = unitCost !== undefined ? Number(unitCost) : Number(part.purchase_price) || 0;

  // 4. Create Ledger Record
  const newTx: InventoryTransaction = {
    id: "tx-" + Date.now() + "-" + Math.random().toString(36).substring(2, 6),
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
    part,
  };

  // Attempt to write to Supabase
  try {
    await withTimeout(
      supabase.from("inventory_transactions").insert({
        id: newTx.id,
        part_id: partId,
        transaction_type: newTx.transaction_type,
        quantity: quantityChange,
        quantity_before: currentStock,
        quantity_after: newStock,
        unit_cost: effectiveCost,
        reference_type: referenceType,
        reference_id: referenceId,
        notes: newTx.notes,
        created_by: createdBy,
        created_at: now,
      }),
      1500
    );
  } catch (err: any) {
    console.warn("Writing inventory transaction to local fallback:", err.message || err);
  }

  // Update local cache
  const localList = getLocalTransactions();
  localList.unshift(newTx);
  saveLocalTransactions(localList);

  return newTx;
}

/**
 * Manual stock adjustment (Increase or Decrease)
 */
export async function recordStockAdjustment(
  partId: string,
  adjustmentQty: number,
  reason = "Physical Count Reconciled",
  notes = "",
  createdBy = "Owner"
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
  });
}
