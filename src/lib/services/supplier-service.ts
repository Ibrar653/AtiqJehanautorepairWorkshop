import { createClient } from "@/lib/supabase/client";
import type { Supplier, SupplierInsert, SupplierUpdate, Purchase } from "@/types/database";
import { getActiveWorkspaceId } from "./workspace-service";
import { DEFAULT_WORKSPACE_ID } from "@/lib/constants";
import { generateUUID } from "@/lib/utils";

const LOCAL_SUPPLIERS_KEY = "atiq_local_suppliers";

export interface SupplierWithStats extends Supplier {
  total_purchases: number;
  total_paid: number;
  outstanding_balance: number;
  purchases_count: number;
  parts_count: number;
}

export function getLocalSuppliers(workspaceId?: string): Supplier[] {
  const targetWsId = workspaceId || getActiveWorkspaceId();
  let all: Supplier[] = [];
  if (typeof window !== "undefined") {
    try {
      const raw = localStorage.getItem(LOCAL_SUPPLIERS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) all = parsed;
      }
    } catch {}
  }
  return all.filter(
    (s) => s.workspace_id === targetWsId || (!s.workspace_id && targetWsId === DEFAULT_WORKSPACE_ID)
  );
}

export function saveLocalSuppliers(suppliers: Supplier[], workspaceId?: string) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LOCAL_SUPPLIERS_KEY, JSON.stringify(suppliers));
  } catch (e) {
    console.error("Failed to save local suppliers", e);
  }
}

/**
 * Calculates supplier purchase aggregates (total purchases, paid, outstanding balance, parts count)
 */
export function calculateSupplierStats(
  supplierId: string,
  allPurchases?: any[],
  allParts?: any[]
): {
  total_purchases: number;
  total_paid: number;
  outstanding_balance: number;
  purchases_count: number;
  parts_count: number;
} {
  const purchasesList = allPurchases || [];
  const partsList = allParts || [];

  const supplierPurchases = purchasesList.filter(
    (p) => p.supplier_id === supplierId && p.is_deleted !== true
  );

  let total_purchases = 0;
  let total_paid = 0;
  let outstanding_balance = 0;

  supplierPurchases.forEach((p) => {
    const tot = Number(p.total) || 0;
    const paid = Number(p.paid_amount !== undefined ? p.paid_amount : (p.payment_status === "paid" ? tot : 0));
    const bal = p.balance !== undefined ? Number(p.balance) : Math.max(0, tot - paid);

    total_purchases += tot;
    total_paid += paid;
    outstanding_balance += bal;
  });

  const parts_count = partsList.filter(
    (pt) => pt.supplier_id === supplierId && pt.is_deleted !== true
  ).length;

  return {
    total_purchases,
    total_paid,
    outstanding_balance,
    purchases_count: supplierPurchases.length,
    parts_count,
  };
}

/**
 * Get suppliers with search, status filtering, pagination, and financial aggregates
 */
export async function getSuppliers(
  query?: string,
  page = 1,
  limit = 50,
  status: "all" | "active" | "inactive" = "all",
  workspaceId?: string
): Promise<{ suppliers: SupplierWithStats[]; total: number }> {
  const targetWsId = workspaceId || getActiveWorkspaceId();
  const supabase = createClient();
  const offset = (page - 1) * limit;

  let dbQuery = supabase
    .from("suppliers")
    .select("*, purchases(*), parts(*)", { count: "exact" })
    .eq("workspace_id", targetWsId)
    .or("is_deleted.is.null,is_deleted.eq.false");

  if (status === "active") {
    dbQuery = dbQuery.or("is_active.is.null,is_active.eq.true");
  } else if (status === "inactive") {
    dbQuery = dbQuery.eq("is_active", false);
  }

  if (query && query.trim()) {
    const q = query.trim();
    dbQuery = dbQuery.or(
      `name.ilike.%${q}%,company_name.ilike.%${q}%,contact_person.ilike.%${q}%,phone.ilike.%${q}%,trn_number.ilike.%${q}%`
    );
  }

  const { data, count, error } = await dbQuery
    .order("name")
    .range(offset, offset + limit - 1);

  if (error) {
    console.error("Failed to fetch suppliers from Supabase:", error);
    throw error;
  }

  const suppliersWithStats: SupplierWithStats[] = (data || []).map((s: any) => {
    const stats = calculateSupplierStats(s.id, s.purchases, s.parts);
    return {
      ...s,
      ...stats,
    };
  });

  return { suppliers: suppliersWithStats, total: count || 0 };
}

/**
 * Get single supplier with purchase history, parts linked, and stats
 */
export async function getSupplierById(id: string): Promise<(SupplierWithStats & { purchases: any[]; parts: any[] }) | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("suppliers")
    .select("*, parts(*), purchases(*, items:purchase_items(*))")
    .eq("id", id)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null;
    console.error(`Failed to fetch supplier ${id} from Supabase:`, error);
    throw error;
  }

  const stats = calculateSupplierStats(id, data.purchases, data.parts);
  return {
    ...(data as Supplier),
    ...stats,
    purchases: (data.purchases || []).sort(
      (a: any, b: any) => new Date(b.date || b.created_at).getTime() - new Date(a.date || a.created_at).getTime()
    ),
    parts: data.parts || [],
  };
}

/**
 * Create a new supplier
 */
export async function createSupplier(payload: SupplierInsert, workspaceId?: string): Promise<Supplier> {
  const targetWsId = workspaceId || getActiveWorkspaceId();
  const supabase = createClient();
  const now = new Date().toISOString();

  const newSupplierData = {
    ...payload,
    id: payload.id || generateUUID(),
    workspace_id: payload.workspace_id || targetWsId,
    is_active: payload.is_active !== undefined ? payload.is_active : true,
    is_deleted: false,
    deleted_at: null,
    deleted_by: null,
    created_at: now,
    updated_at: now,
  };

  const { data, error } = await supabase
    .from("suppliers")
    .insert(newSupplierData)
    .select()
    .single();

  if (error) {
    console.error("Failed to create supplier in Supabase:", error);
    throw error;
  }
  return data as Supplier;
}

/**
 * Update an existing supplier
 */
export async function updateSupplier(id: string, payload: SupplierUpdate): Promise<Supplier> {
  const supabase = createClient();
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("suppliers")
    .update({ ...payload, updated_at: now })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    console.error(`Failed to update supplier ${id} in Supabase:`, error);
    throw error;
  }
  return data as Supplier;
}

/**
 * Toggle supplier active status
 */
export async function toggleSupplierStatus(id: string, isActive: boolean): Promise<Supplier> {
  return await updateSupplier(id, { is_active: isActive });
}

/**
 * Safe delete supplier:
 * If supplier has purchase history or parts linked, soft-deletes (sets is_deleted = true, is_active = false).
 * Only permanently removes if no associated records exist.
 */
export async function deleteSupplier(id: string, force = false): Promise<{ success: boolean; softDeleted: boolean; message: string }> {
  const supabase = createClient();
  const now = new Date().toISOString();

  // Check history via Supabase
  const { data: supplierData, error: checkError } = await supabase
    .from("suppliers")
    .select("*, purchases(id), parts(id)")
    .eq("id", id)
    .single();

  if (checkError && checkError.code !== "PGRST116") {
    console.error(`Error checking supplier ${id} history:`, checkError);
  }

  const allPurchases = supplierData?.purchases || [];
  const allParts = supplierData?.parts || [];
  const hasHistory = allPurchases.length > 0 || allParts.length > 0;

  if (hasHistory && !force) {
    await updateSupplier(id, {
      is_active: false,
      is_deleted: true,
      deleted_at: now,
    });
    return {
      success: true,
      softDeleted: true,
      message: `Supplier has ${allPurchases.length} purchases and ${allParts.length} linked parts. Soft-deleted and deactivated to preserve records.`,
    };
  }

  const { error } = await supabase.from("suppliers").delete().eq("id", id);
  if (error) {
    console.error(`Failed to permanently delete supplier ${id}:`, error);
    throw error;
  }

  return {
    success: true,
    softDeleted: false,
    message: "Supplier permanently removed.",
  };
}
