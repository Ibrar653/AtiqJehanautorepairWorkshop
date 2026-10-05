import { createClient } from "@/lib/supabase/client";
import type {
  Purchase,
  PurchaseInsert,
  PurchaseItem,
  PurchaseItemInsert,
  PurchasePaymentStatus,
  PurchasePaymentMethod,
  SupplierPayment,
} from "@/types/database";
import { getActiveWorkspaceId } from "./workspace-service";
import { DEFAULT_WORKSPACE_ID } from "@/lib/constants";
import { recordStockTransaction } from "./inventory-service";
import { generateUUID } from "@/lib/utils";

const LOCAL_PURCHASES_KEY = "atiq_local_purchases";
const LOCAL_SUPPLIER_PAYMENTS_KEY = "atiq_local_supplier_payments";

export function getLocalPurchases(workspaceId?: string): any[] {
  const targetWsId = workspaceId || getActiveWorkspaceId();
  let all: any[] = [];
  if (typeof window !== "undefined") {
    try {
      const raw = localStorage.getItem(LOCAL_PURCHASES_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) all = parsed;
      }
    } catch {}
  }
  return all.filter(
    (p) => p.workspace_id === targetWsId || (!p.workspace_id && targetWsId === DEFAULT_WORKSPACE_ID)
  );
}

export function saveLocalPurchases(purchases: any[], workspaceId?: string) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LOCAL_PURCHASES_KEY, JSON.stringify(purchases));
  } catch (e) {
    console.error("Failed to save local purchases", e);
  }
}

export function getLocalSupplierPayments(workspaceId?: string): SupplierPayment[] {
  const targetWsId = workspaceId || getActiveWorkspaceId();
  let all: SupplierPayment[] = [];
  if (typeof window !== "undefined") {
    try {
      const raw = localStorage.getItem(LOCAL_SUPPLIER_PAYMENTS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) all = parsed;
      }
    } catch {}
  }
  return all.filter(
    (p) => p.workspace_id === targetWsId || (!p.workspace_id && targetWsId === DEFAULT_WORKSPACE_ID)
  );
}

export function saveLocalSupplierPayments(payments: SupplierPayment[], workspaceId?: string) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LOCAL_SUPPLIER_PAYMENTS_KEY, JSON.stringify(payments));
  } catch (e) {
    console.error("Failed to save local supplier payments", e);
  }
}

/**
 * Get purchases with query, status filter, supplierId filter, and pagination
 */
export async function getPurchases(
  query?: string,
  status: string = "all",
  supplierId?: string,
  page = 1,
  limit = 50,
  workspaceId?: string
): Promise<{ purchases: any[]; total: number }> {
  const targetWsId = workspaceId || getActiveWorkspaceId();
  const supabase = createClient();
  const offset = (page - 1) * limit;

  let dbQuery = supabase
    .from("purchases")
    .select(
      "*, supplier:suppliers(id, name, company_name, phone), items:purchase_items(*, part:parts(id, name, part_number, brand))",
      { count: "exact" }
    )
    .eq("workspace_id", targetWsId);

  if (supplierId) {
    dbQuery = dbQuery.eq("supplier_id", supplierId);
  }

  if (status && status !== "all") {
    dbQuery = dbQuery.eq("payment_status", status);
  }

  if (query && query.trim()) {
    const q = query.trim();
    dbQuery = dbQuery.or(
      `purchase_invoice_number.ilike.%${q}%,notes.ilike.%${q}%,supplier.name.ilike.%${q}%`
    );
  }

  const { data, count, error } = await dbQuery
    .order("date", { ascending: false })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    console.error("Failed to fetch purchases from Supabase:", error);
    throw error;
  }

  return { purchases: data || [], total: count || 0 };
}

/**
 * Get single purchase by ID with items, supplier, and payments
 */
export async function getPurchaseById(id: string): Promise<any | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("purchases")
    .select(
      "*, supplier:suppliers(*), items:purchase_items(*, part:parts(*)), payments:supplier_payments(*)"
    )
    .eq("id", id)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null;
    console.error(`Failed to fetch purchase ${id} from Supabase:`, error);
    throw error;
  }

  return data;
}

/**
 * Create a new Purchase:
 * - Computes total, paid_amount, balance
 * - Inserts purchase & purchase items
 * - Increases stock for each item & logs PURCHASE inventory transaction
 * - Updates latest cost price on spare part master
 */
export async function createPurchase(
  purchasePayload: PurchaseInsert,
  items: PurchaseItemInsert[],
  paymentDetails?: {
    paid_amount?: number;
    payment_method?: PurchasePaymentMethod | string;
    payment_reference?: string;
  },
  workspaceId?: string
): Promise<any> {
  const targetWsId = workspaceId || getActiveWorkspaceId();
  const supabase = createClient();
  const now = new Date().toISOString();

  // 1. Compute total
  const total = items.reduce(
    (acc, it) => acc + (it.total_price || Number(it.quantity) * Number(it.purchase_price)),
    0
  );

  let paid_amount = 0;
  if (paymentDetails?.paid_amount !== undefined) {
    paid_amount = Math.min(total, Math.max(0, Number(paymentDetails.paid_amount) || 0));
  } else if (purchasePayload.payment_status === "paid") {
    paid_amount = total;
  }

  const balance = Math.max(0, total - paid_amount);

  let payment_status: PurchasePaymentStatus = purchasePayload.payment_status || "unpaid";
  if (balance === 0 && total > 0) {
    payment_status = "paid";
  } else if (paid_amount > 0 && balance > 0) {
    payment_status = "partially_paid";
  } else if (paid_amount === 0) {
    payment_status = purchasePayload.payment_status || "credit";
  }

  const purchaseId = purchasePayload.id || generateUUID();

  const purchaseData = {
    ...purchasePayload,
    id: purchaseId,
    workspace_id: purchasePayload.workspace_id || targetWsId,
    total,
    paid_amount,
    balance,
    payment_status,
    payment_method: paymentDetails?.payment_method || purchasePayload.payment_method || "cash",
    created_at: now,
    updated_at: now,
  };

  // 2. Insert purchase header
  const { data: purchase, error: pErr } = await supabase
    .from("purchases")
    .insert(purchaseData)
    .select()
    .single();

  if (pErr) {
    console.error("Failed to insert purchase header:", pErr);
    throw pErr;
  }

  // 3. Insert items & update stock
  if (items.length > 0) {
    const itemsWithPurchaseId = items.map((it) => ({
      ...it,
      id: it.id || generateUUID(),
      purchase_id: purchase.id,
      workspace_id: targetWsId,
      total_price: it.total_price || Number(it.quantity) * Number(it.purchase_price),
    }));

    const { error: itemsErr } = await supabase.from("purchase_items").insert(itemsWithPurchaseId);
    if (itemsErr) {
      console.error("Failed to insert purchase items:", itemsErr);
      throw itemsErr;
    }

    // Increase stock and record PURCHASE transactions
    for (const it of items) {
      if (it.part_id && Number(it.quantity) > 0) {
        try {
          await recordStockTransaction({
            partId: it.part_id,
            transactionType: "purchase",
            quantityChange: Number(it.quantity),
            unitCost: Number(it.purchase_price),
            referenceType: "purchase",
            referenceId: purchase.id,
            notes: `Purchase Invoice #${purchasePayload.purchase_invoice_number || purchase.id.slice(-6)}`,
            workspaceId: targetWsId,
          });

          // Update spare part master purchase price to reflect latest purchase cost
          await supabase
            .from("parts")
            .update({ purchase_price: Number(it.purchase_price), updated_at: now })
            .eq("id", it.part_id);
        } catch (txErr) {
          console.error("Stock update error for purchase item:", txErr);
        }
      }
    }
  }

  // 4. Record initial payment if paid > 0
  if (paid_amount > 0) {
    const paymentRecord = {
      id: generateUUID(),
      workspace_id: targetWsId,
      purchase_id: purchase.id,
      supplier_id: purchase.supplier_id,
      amount: paid_amount,
      payment_method: paymentDetails?.payment_method || "cash",
      payment_date: purchasePayload.date || now.slice(0, 10),
      reference_number: paymentDetails?.payment_reference || purchasePayload.purchase_invoice_number,
      notes: "Initial purchase payment",
      created_by: purchasePayload.created_by || "Owner",
      created_at: now,
    };

    const { error: spErr } = await supabase.from("supplier_payments").insert(paymentRecord);
    if (spErr) {
      console.warn("Non-fatal error logging initial supplier payment:", spErr);
    }
  }

  // Sync to Accounts / Ledger
  try {
    const { postPurchaseLedger, postSupplierPaymentLedger } = await import("./ledger-service");
    await postPurchaseLedger({
      id: purchase.id,
      purchase_invoice_number: purchase.purchase_invoice_number,
      supplier_id: purchase.supplier_id,
      date: purchase.date,
      total: Number(purchase.total),
      created_by: purchase.created_by,
      workspace_id: targetWsId,
    });
    if (Number(purchase.paid_amount) > 0) {
      await postSupplierPaymentLedger({
        id: generateUUID(),
        supplier_id: purchase.supplier_id,
        amount: Number(purchase.paid_amount),
        payment_method: purchase.payment_method || "cash",
        date: purchase.date,
        created_by: purchase.created_by,
        workspace_id: targetWsId,
      });
    }
  } catch (e) {
    console.warn("Ledger post for purchase notice:", e);
  }

  return purchase;
}

/**
 * Update an existing Purchase:
 * - IDEMPOTENT DELTA-BASED STOCK ADJUSTMENT:
 *   - Compares old item quantities with new item quantities.
 *   - Only updates stock by the DELTA difference.
 *   - Re-saving with identical quantities causes ZERO stock change.
 */
export async function updatePurchase(
  purchaseId: string,
  purchasePayload: Partial<PurchaseInsert>,
  newItems: PurchaseItemInsert[],
  paymentDetails?: {
    paid_amount?: number;
    payment_method?: PurchasePaymentMethod | string;
    payment_reference?: string;
  }
): Promise<any> {
  const supabase = createClient();
  const now = new Date().toISOString();

  // 1. Fetch old purchase
  const existingPurchase = await getPurchaseById(purchaseId);
  if (!existingPurchase) {
    throw new Error(`Purchase ${purchaseId} not found.`);
  }

  const targetWsId = existingPurchase.workspace_id || getActiveWorkspaceId();
  const oldItems: any[] = existingPurchase.items || [];

  // 2. Compute old vs new item quantities per part_id
  const oldQtyMap = new Map<string, number>();
  oldItems.forEach((it) => {
    if (it.part_id) {
      oldQtyMap.set(it.part_id, (oldQtyMap.get(it.part_id) || 0) + Number(it.quantity || 0));
    }
  });

  const newQtyMap = new Map<string, { qty: number; unitCost: number }>();
  newItems.forEach((it) => {
    if (it.part_id) {
      const curr = newQtyMap.get(it.part_id) || { qty: 0, unitCost: Number(it.purchase_price) || 0 };
      curr.qty += Number(it.quantity || 0);
      curr.unitCost = Number(it.purchase_price) || curr.unitCost;
      newQtyMap.set(it.part_id, curr);
    }
  });

  // Calculate Deltas: delta = newQty - oldQty
  const allPartIds = new Set<string>([...oldQtyMap.keys(), ...newQtyMap.keys()]);

  for (const partId of allPartIds) {
    const oldQ = oldQtyMap.get(partId) || 0;
    const newEntry = newQtyMap.get(partId) || { qty: 0, unitCost: 0 };
    const newQ = newEntry.qty;
    const delta = newQ - oldQ;

    if (delta !== 0) {
      try {
        await recordStockTransaction({
          partId,
          transactionType: "purchase",
          quantityChange: delta,
          unitCost: newEntry.unitCost,
          referenceType: "purchase",
          referenceId: purchaseId,
          notes: `Purchase Invoice #${purchasePayload.purchase_invoice_number || existingPurchase.purchase_invoice_number || purchaseId.slice(-6)} (Qty adjusted ${oldQ} -> ${newQ})`,
          workspaceId: targetWsId,
        });
      } catch (txErr) {
        console.error(`Error updating stock delta for part ${partId}:`, txErr);
      }
    }
  }

  // 3. Compute new financial totals
  const total = newItems.reduce(
    (acc, it) => acc + (it.total_price || Number(it.quantity) * Number(it.purchase_price)),
    0
  );

  const existingPaid = Number(existingPurchase.paid_amount) || 0;
  let paid_amount = existingPaid;

  if (paymentDetails?.paid_amount !== undefined) {
    paid_amount = Math.min(total, Math.max(0, Number(paymentDetails.paid_amount)));
  }

  const balance = Math.max(0, total - paid_amount);

  let payment_status: PurchasePaymentStatus =
    purchasePayload.payment_status || existingPurchase.payment_status;
  if (balance === 0 && total > 0) {
    payment_status = "paid";
  } else if (paid_amount > 0 && balance > 0) {
    payment_status = "partially_paid";
  } else if (paid_amount === 0) {
    payment_status = "credit";
  }

  const updatedPurchaseData = {
    ...purchasePayload,
    total,
    paid_amount,
    balance,
    payment_status,
    updated_at: now,
  };

  // 4. Update in Supabase
  const { data: updated, error: uErr } = await supabase
    .from("purchases")
    .update(updatedPurchaseData)
    .eq("id", purchaseId)
    .select()
    .single();

  if (uErr) {
    console.error(`Failed to update purchase ${purchaseId}:`, uErr);
    throw uErr;
  }

  // Replace purchase items
  await supabase.from("purchase_items").delete().eq("purchase_id", purchaseId);

  const itemsToInsert = newItems.map((it) => ({
    ...it,
    id: it.id || generateUUID(),
    purchase_id: purchaseId,
    workspace_id: targetWsId,
    total_price: it.total_price || Number(it.quantity) * Number(it.purchase_price),
  }));

  const { error: itemsInsertErr } = await supabase.from("purchase_items").insert(itemsToInsert);
  if (itemsInsertErr) {
    console.error(`Failed to insert updated purchase items for purchase ${purchaseId}:`, itemsInsertErr);
    throw itemsInsertErr;
  }

  return updated;
}

/**
 * Record a payment against an existing purchase invoice
 */
export async function recordSupplierPayment(
  purchaseId: string,
  amount: number,
  paymentMethod: PurchasePaymentMethod | string = "cash",
  referenceNumber?: string,
  notes?: string,
  createdBy = "Owner"
): Promise<{ payment: SupplierPayment; purchase: any }> {
  const supabase = createClient();
  const now = new Date().toISOString();

  const purchase = await getPurchaseById(purchaseId);
  if (!purchase) {
    throw new Error(`Purchase ${purchaseId} not found.`);
  }

  const payAmt = Number(amount);
  if (isNaN(payAmt) || payAmt <= 0) {
    throw new Error("Payment amount must be greater than 0.");
  }

  const currentBalance = Number(purchase.balance !== undefined ? purchase.balance : purchase.total - (purchase.paid_amount || 0));
  if (payAmt > currentBalance + 0.001) {
    throw new Error(
      `Payment amount of AED ${payAmt.toFixed(2)} exceeds remaining balance of AED ${currentBalance.toFixed(2)}.`
    );
  }

  const newPaidAmount = (Number(purchase.paid_amount) || 0) + payAmt;
  const newBalance = Math.max(0, Number(purchase.total) - newPaidAmount);
  const newStatus: PurchasePaymentStatus = newBalance === 0 ? "paid" : "partially_paid";

  const targetWsId = purchase.workspace_id || getActiveWorkspaceId();

  const paymentRecord = {
    id: generateUUID(),
    workspace_id: targetWsId,
    purchase_id: purchaseId,
    supplier_id: purchase.supplier_id,
    amount: payAmt,
    payment_method: paymentMethod,
    payment_date: now.slice(0, 10),
    reference_number: referenceNumber || null,
    notes: notes || null,
    created_by: createdBy,
    created_at: now,
  };

  const { data: insertedPayment, error: payErr } = await supabase
    .from("supplier_payments")
    .insert(paymentRecord)
    .select()
    .single();

  if (payErr) {
    console.error("Failed to insert supplier payment:", payErr);
    throw payErr;
  }

  const { error: updateErr } = await supabase
    .from("purchases")
    .update({
      paid_amount: newPaidAmount,
      balance: newBalance,
      payment_status: newStatus,
      updated_at: now,
    })
    .eq("id", purchaseId);

  if (updateErr) {
    console.error("Failed to update purchase status after payment:", updateErr);
    throw updateErr;
  }

  return {
    payment: insertedPayment as SupplierPayment,
    purchase: {
      ...purchase,
      paid_amount: newPaidAmount,
      balance: newBalance,
      payment_status: newStatus,
    },
  };
}

/**
 * Delete purchase and reverse inventory changes safely
 */
export async function deletePurchase(purchaseId: string): Promise<boolean> {
  const supabase = createClient();
  const existingPurchase = await getPurchaseById(purchaseId);

  if (existingPurchase && Array.isArray(existingPurchase.items)) {
    const targetWsId = existingPurchase.workspace_id || getActiveWorkspaceId();
    // Reverse stock deductions for all items
    for (const it of existingPurchase.items) {
      if (it.part_id && Number(it.quantity) > 0) {
        try {
          await recordStockTransaction({
            partId: it.part_id,
            transactionType: "job_card_reversal",
            quantityChange: -Number(it.quantity),
            unitCost: Number(it.purchase_price) || 0,
            referenceType: "purchase_reversal",
            referenceId: purchaseId,
            notes: `Purchase cancellation & stock reversal for PO #${existingPurchase.purchase_invoice_number || purchaseId.slice(-6)}`,
            workspaceId: targetWsId,
          });
        } catch (txErr) {
          console.error("Reversal error on purchase deletion:", txErr);
        }
      }
    }
  }

  // Delete child records first if foreign keys restrict delete
  await supabase.from("supplier_payments").delete().eq("purchase_id", purchaseId);
  await supabase.from("purchase_items").delete().eq("purchase_id", purchaseId);
  const { error } = await supabase.from("purchases").delete().eq("id", purchaseId);

  if (error) {
    console.error(`Failed to delete purchase ${purchaseId}:`, error);
    throw error;
  }

  return true;
}
