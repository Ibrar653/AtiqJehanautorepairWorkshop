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
import { recordStockTransaction, getLocalTransactions, saveLocalTransactions } from "./inventory-service";
import { getLocalParts, saveLocalParts, updatePart } from "./parts-service";
import { getLocalSuppliers } from "./supplier-service";

const LOCAL_PURCHASES_KEY = "atiq_local_purchases";
const LOCAL_SUPPLIER_PAYMENTS_KEY = "atiq_local_supplier_payments";

let inMemoryPurchases: any[] = [];
let inMemorySupplierPayments: SupplierPayment[] = [];

export function getLocalPurchases(workspaceId?: string): any[] {
  const targetWsId = workspaceId || getActiveWorkspaceId();
  let all: any[] = [];
  if (typeof window === "undefined") {
    all = inMemoryPurchases;
  } else {
    try {
      const raw = localStorage.getItem(LOCAL_PURCHASES_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) all = parsed;
      }
    } catch {}
    if (all.length === 0) all = inMemoryPurchases;
  }
  return all.filter(
    (p) => p.workspace_id === targetWsId || (!p.workspace_id && targetWsId === DEFAULT_WORKSPACE_ID)
  );
}

export function saveLocalPurchases(purchases: any[], workspaceId?: string) {
  const targetWsId = workspaceId || getActiveWorkspaceId();
  let allExisting: any[] = [];
  if (typeof window !== "undefined") {
    try {
      const raw = localStorage.getItem(LOCAL_PURCHASES_KEY);
      if (raw) allExisting = JSON.parse(raw);
    } catch {}
  }
  if (allExisting.length === 0) allExisting = inMemoryPurchases;
  const others = allExisting.filter((p) => p.workspace_id && p.workspace_id !== targetWsId);
  const tagged = purchases.map((p) => ({ ...p, workspace_id: p.workspace_id || targetWsId }));
  const merged = [...tagged, ...others];
  inMemoryPurchases = merged;
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(LOCAL_PURCHASES_KEY, JSON.stringify(merged));
    } catch (e) {
      console.error("Failed to save local purchases", e);
    }
  }
}

export function getLocalSupplierPayments(workspaceId?: string): SupplierPayment[] {
  const targetWsId = workspaceId || getActiveWorkspaceId();
  let all: SupplierPayment[] = [];
  if (typeof window === "undefined") {
    all = inMemorySupplierPayments;
  } else {
    try {
      const raw = localStorage.getItem(LOCAL_SUPPLIER_PAYMENTS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) all = parsed;
      }
    } catch {}
    if (all.length === 0) all = inMemorySupplierPayments;
  }
  return all.filter(
    (p) => p.workspace_id === targetWsId || (!p.workspace_id && targetWsId === DEFAULT_WORKSPACE_ID)
  );
}

export function saveLocalSupplierPayments(payments: SupplierPayment[], workspaceId?: string) {
  const targetWsId = workspaceId || getActiveWorkspaceId();
  let allExisting: SupplierPayment[] = [];
  if (typeof window !== "undefined") {
    try {
      const raw = localStorage.getItem(LOCAL_SUPPLIER_PAYMENTS_KEY);
      if (raw) allExisting = JSON.parse(raw);
    } catch {}
  }
  if (allExisting.length === 0) allExisting = inMemorySupplierPayments;
  const others = allExisting.filter((p) => p.workspace_id && p.workspace_id !== targetWsId);
  const tagged = payments.map((p) => ({ ...p, workspace_id: p.workspace_id || targetWsId }));
  const merged = [...tagged, ...others];
  inMemorySupplierPayments = merged;
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(LOCAL_SUPPLIER_PAYMENTS_KEY, JSON.stringify(merged));
    } catch (e) {
      console.error("Failed to save local supplier payments", e);
    }
  }
}

function withTimeout<T>(promise: PromiseLike<T>, timeoutMs = 2000): Promise<T> {
  return Promise.race([
    Promise.resolve(promise),
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error("Purchase query timed out")), timeoutMs)
    ),
  ]);
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

  try {
    const fetchWithTimeout = async () => {
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

      if (error) throw error;
      return { purchases: data || [], total: count || 0 };
    };

    return await withTimeout(fetchWithTimeout(), 2000);
  } catch (err: any) {
    console.warn("Using local purchases fallback:", err.message || err);
    let list = getLocalPurchases(targetWsId).filter((p) => p.is_deleted !== true);

    if (supplierId) {
      list = list.filter((p) => p.supplier_id === supplierId);
    }

    if (status && status !== "all") {
      list = list.filter((p) => p.payment_status === status);
    }

    const allSuppliers = getLocalSuppliers(targetWsId);
    const allParts = getLocalParts(targetWsId);

    // Attach supplier and items with part details
    list = list.map((p) => {
      const sup = allSuppliers.find((s) => s.id === p.supplier_id) || p.supplier || null;
      const items = (p.items || []).map((it: any) => {
        const part = allParts.find((pt) => pt.id === it.part_id) || it.part || null;
        return {
          ...it,
          part,
        };
      });
      return {
        ...p,
        supplier: sup,
        items,
      };
    });

    if (query && query.trim()) {
      const q = query.trim().toLowerCase();
      list = list.filter((p) => {
        const supName = p.supplier?.name?.toLowerCase() || "";
        const invNo = p.purchase_invoice_number?.toLowerCase() || "";
        const date = p.date?.toLowerCase() || "";
        const hasMatchingPart = (p.items || []).some(
          (it: any) =>
            it.part?.name?.toLowerCase().includes(q) ||
            it.part?.part_number?.toLowerCase().includes(q)
        );
        return supName.includes(q) || invNo.includes(q) || date.includes(q) || hasMatchingPart;
      });
    }

    // Sort by date descending
    list.sort(
      (a, b) =>
        new Date(b.date || b.created_at).getTime() - new Date(a.date || a.created_at).getTime()
    );

    const total = list.length;
    const paginated = list.slice(offset, offset + limit);
    return { purchases: paginated, total };
  }
}

/**
 * Get single purchase by ID with items, supplier, and payments
 */
export async function getPurchaseById(id: string): Promise<any | null> {
  const supabase = createClient();
  try {
    const fetchWithTimeout = async () => {
      const { data, error } = await supabase
        .from("purchases")
        .select(
          "*, supplier:suppliers(*), items:purchase_items(*, part:parts(*)), payments:supplier_payments(*)"
        )
        .eq("id", id)
        .single();

      if (error) throw error;
      return data;
    };

    return await withTimeout(fetchWithTimeout(), 2000);
  } catch (err: any) {
    console.warn(`Reading purchase ${id} from local fallback:`, err.message || err);
    const list = getLocalPurchases();
    const p = list.find((item) => item.id === id);
    if (!p) return null;

    const allSuppliers = getLocalSuppliers();
    const allParts = getLocalParts();
    const allPayments = getLocalSupplierPayments().filter((pay) => pay.purchase_id === id);

    const sup = allSuppliers.find((s) => s.id === p.supplier_id) || p.supplier || null;
    const items = (p.items || []).map((it: any) => {
      const part = allParts.find((pt) => pt.id === it.part_id) || it.part || null;
      return {
        ...it,
        part,
      };
    });

    return {
      ...p,
      supplier: sup,
      items,
      payments: allPayments,
    };
  }
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

  const purchaseId =
    purchasePayload.id || "po-" + Date.now() + "-" + Math.random().toString(36).substring(2, 6);

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

  try {
    // 2. Insert purchase header
    const { data: purchase, error: pErr } = await withTimeout(
      supabase.from("purchases").insert(purchaseData).select().single(),
      2000
    );

    if (pErr) throw pErr;

    // 3. Insert items & update stock
    if (items.length > 0) {
      const itemsWithPurchaseId = items.map((it) => ({
        ...it,
        purchase_id: purchase.id,
        total_price: it.total_price || Number(it.quantity) * Number(it.purchase_price),
      }));

      await withTimeout(supabase.from("purchase_items").insert(itemsWithPurchaseId), 2000);

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
      try {
        await supabase.from("supplier_payments").insert({
          purchase_id: purchase.id,
          supplier_id: purchase.supplier_id,
          amount: paid_amount,
          payment_method: paymentDetails?.payment_method || "cash",
          payment_date: purchasePayload.date || now.slice(0, 10),
          reference_number: paymentDetails?.payment_reference || purchasePayload.purchase_invoice_number,
          notes: "Initial purchase payment",
          created_by: purchasePayload.created_by || "Owner",
          created_at: now,
        });
      } catch {
        // Non-blocking payment log
      }
    }

    // Update local cache
    const list = getLocalPurchases(targetWsId);
    list.unshift(purchase);
    saveLocalPurchases(list, targetWsId);

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
      });
      if (Number(purchase.paid_amount) > 0) {
        await postSupplierPaymentLedger({
          id: `pay-${purchase.id}`,
          supplier_id: purchase.supplier_id,
          amount: Number(purchase.paid_amount),
          payment_method: purchase.payment_method || "cash",
          date: purchase.date,
          created_by: purchase.created_by,
        });
      }
    } catch (e) {
      console.warn("Ledger post for purchase notice:", e);
    }

    return purchase;
  } catch (err: any) {
    console.warn("Creating purchase in local fallback store:", err.message || err);

    const localItems = items.map((it) => ({
      id: it.id || "poi-" + Date.now() + "-" + Math.random().toString(36).substring(2, 6),
      purchase_id: purchaseId,
      part_id: it.part_id,
      quantity: Number(it.quantity),
      purchase_price: Number(it.purchase_price),
      total_price: it.total_price || Number(it.quantity) * Number(it.purchase_price),
    }));

    const localPurchase = {
      ...purchaseData,
      items: localItems,
    };

    // Update stock via inventory transaction
    const partsList = getLocalParts(targetWsId);
    for (const it of items) {
      if (it.part_id && Number(it.quantity) > 0) {
        await recordStockTransaction({
          partId: it.part_id,
          transactionType: "purchase",
          quantityChange: Number(it.quantity),
          unitCost: Number(it.purchase_price),
          referenceType: "purchase",
          referenceId: purchaseId,
          notes: `Purchase Invoice #${purchasePayload.purchase_invoice_number || purchaseId.slice(-6)}`,
        });

        // Update spare part master purchase price to latest purchase cost
        const pIdx = partsList.findIndex((p) => p.id === it.part_id);
        if (pIdx !== -1) {
          partsList[pIdx].purchase_price = Number(it.purchase_price);
          partsList[pIdx].updated_at = now;
        }
      }
    }
    saveLocalParts(partsList, targetWsId);

    // Record local payment if paid > 0
    if (paid_amount > 0) {
      const payments = getLocalSupplierPayments(targetWsId);
      payments.unshift({
        id: "spay-" + Date.now() + "-" + Math.random().toString(36).substring(2, 6),
        purchase_id: purchaseId,
        supplier_id: purchasePayload.supplier_id,
        amount: paid_amount,
        payment_method: paymentDetails?.payment_method || "cash",
        payment_date: purchasePayload.date || now.slice(0, 10),
        reference_number: paymentDetails?.payment_reference || purchasePayload.purchase_invoice_number || null,
        notes: "Initial purchase payment",
        created_by: purchasePayload.created_by || "Owner",
        created_at: now,
      });
      saveLocalSupplierPayments(payments, targetWsId);
    }

    const list = getLocalPurchases(targetWsId);
    list.unshift(localPurchase);
    saveLocalPurchases(list, targetWsId);

    // Sync to Accounts / Ledger
    try {
      const { postPurchaseLedger, postSupplierPaymentLedger } = await import("./ledger-service");
      await postPurchaseLedger({
        id: localPurchase.id,
        purchase_invoice_number: localPurchase.purchase_invoice_number || undefined,
        supplier_id: localPurchase.supplier_id,
        date: localPurchase.date,
        total: Number(localPurchase.total),
        created_by: localPurchase.created_by || undefined,
      });
      if (Number(localPurchase.paid_amount) > 0) {
        await postSupplierPaymentLedger({
          id: `pay-${localPurchase.id}`,
          supplier_id: localPurchase.supplier_id,
          amount: Number(localPurchase.paid_amount),
          payment_method: localPurchase.payment_method || "cash",
          date: localPurchase.date,
          created_by: localPurchase.created_by,
        });
      }
    } catch (e) {
      console.warn("Ledger post for purchase fallback notice:", e);
    }

    return localPurchase;
  }
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
  // If delta > 0: increase stock by +delta
  // If delta < 0: reduce stock by -delta
  // If delta == 0: ZERO change
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

  try {
    // 4. Update in Supabase
    const { data: updated, error: uErr } = await withTimeout(
      supabase.from("purchases").update(updatedPurchaseData).eq("id", purchaseId).select().single(),
      2000
    );

    if (uErr) throw uErr;

    // Replace purchase items
    await supabase.from("purchase_items").delete().eq("purchase_id", purchaseId);

    const itemsToInsert = newItems.map((it) => ({
      ...it,
      purchase_id: purchaseId,
      total_price: it.total_price || Number(it.quantity) * Number(it.purchase_price),
    }));

    await supabase.from("purchase_items").insert(itemsToInsert);

    // Update local cache
    const list = getLocalPurchases();
    const idx = list.findIndex((p) => p.id === purchaseId);
    if (idx !== -1) {
      list[idx] = {
        ...list[idx],
        ...updated,
        items: itemsToInsert,
      };
      saveLocalPurchases(list);
    }

    return updated;
  } catch (err: any) {
    console.warn("Updating purchase in local fallback:", err.message || err);

    const localItems = newItems.map((it) => ({
      id: it.id || "poi-" + Date.now() + "-" + Math.random().toString(36).substring(2, 6),
      purchase_id: purchaseId,
      part_id: it.part_id,
      quantity: Number(it.quantity),
      purchase_price: Number(it.purchase_price),
      total_price: it.total_price || Number(it.quantity) * Number(it.purchase_price),
    }));

    const list = getLocalPurchases();
    const idx = list.findIndex((p) => p.id === purchaseId);
    if (idx !== -1) {
      list[idx] = {
        ...list[idx],
        ...updatedPurchaseData,
        items: localItems,
      };
      saveLocalPurchases(list);
      return list[idx];
    }

    return {
      ...existingPurchase,
      ...updatedPurchaseData,
      items: localItems,
    };
  }
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

  const paymentRecord: SupplierPayment = {
    id: "spay-" + Date.now() + "-" + Math.random().toString(36).substring(2, 6),
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

  try {
    await supabase.from("supplier_payments").insert(paymentRecord);
    await supabase
      .from("purchases")
      .update({
        paid_amount: newPaidAmount,
        balance: newBalance,
        payment_status: newStatus,
        updated_at: now,
      })
      .eq("id", purchaseId);
  } catch (err: any) {
    console.warn("Recording payment in local fallback:", err.message || err);
  }

  // Update local payments
  const paymentsList = getLocalSupplierPayments();
  paymentsList.unshift(paymentRecord);
  saveLocalSupplierPayments(paymentsList);

  // Update local purchases
  const purchasesList = getLocalPurchases();
  const pIdx = purchasesList.findIndex((p) => p.id === purchaseId);
  if (pIdx !== -1) {
    purchasesList[pIdx] = {
      ...purchasesList[pIdx],
      paid_amount: newPaidAmount,
      balance: newBalance,
      payment_status: newStatus,
      updated_at: now,
    };
    saveLocalPurchases(purchasesList);
  }

  return {
    payment: paymentRecord,
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
          });
        } catch (txErr) {
          console.error("Reversal error on purchase deletion:", txErr);
        }
      }
    }
  }

  try {
    await supabase.from("purchase_items").delete().eq("purchase_id", purchaseId);
    await supabase.from("purchases").delete().eq("id", purchaseId);
  } catch (err: any) {
    console.warn("Deleting purchase in local fallback:", err.message || err);
  }

  const list = getLocalPurchases().filter((p) => p.id !== purchaseId);
  saveLocalPurchases(list);

  return true;
}
