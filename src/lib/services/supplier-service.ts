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

export interface SupplierDbRow {
  id: string;
  workspace_id: string;
  name: string;
  company_name: string | null;
  contact_person: string | null;
  phone: string | null;
  alternate_phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  trn_number: string | null;
  notes: string | null;
  is_active: boolean;
  is_deleted: boolean;
  deleted_at: string | null;
  deleted_by: string | null;
  created_at: string;
  updated_at: string;
}

export function buildSupplierDbInsertPayload(
  payload: any,
  meta: { id: string; workspaceId: string }
): SupplierDbRow {
  const now = new Date().toISOString();
  return {
    id: meta.id,
    workspace_id: meta.workspaceId,
    name: String(payload.name || "").trim(),
    company_name: payload.company_name != null ? String(payload.company_name).trim() || null : null,
    contact_person: payload.contact_person != null ? String(payload.contact_person).trim() || null : null,
    phone: payload.phone != null ? String(payload.phone).trim() || null : null,
    alternate_phone: payload.alternate_phone != null ? String(payload.alternate_phone).trim() || null : null,
    email: payload.email != null ? String(payload.email).trim().toLowerCase() || null : null,
    address: payload.address != null ? String(payload.address).trim() || null : null,
    city: payload.city != null ? String(payload.city).trim() || null : null,
    trn_number: payload.trn_number != null ? String(payload.trn_number).trim() || null : null,
    notes: payload.notes != null ? String(payload.notes).trim() || null : null,
    is_active: payload.is_active !== undefined ? Boolean(payload.is_active) : true,
    is_deleted: false,
    deleted_at: null,
    deleted_by: null,
    created_at: payload.created_at || now,
    updated_at: now,
  };
}

export function buildSupplierDbUpdatePayload(payload: any): Partial<SupplierDbRow> {
  const updateData: Partial<SupplierDbRow> = {
    updated_at: new Date().toISOString(),
  };

  if (payload.name !== undefined) updateData.name = String(payload.name || "").trim();
  if (payload.company_name !== undefined) {
    updateData.company_name = payload.company_name != null ? String(payload.company_name).trim() || null : null;
  }
  if (payload.contact_person !== undefined) {
    updateData.contact_person = payload.contact_person != null ? String(payload.contact_person).trim() || null : null;
  }
  if (payload.phone !== undefined) {
    updateData.phone = payload.phone != null ? String(payload.phone).trim() || null : null;
  }
  if (payload.alternate_phone !== undefined) {
    updateData.alternate_phone = payload.alternate_phone != null ? String(payload.alternate_phone).trim() || null : null;
  }
  if (payload.email !== undefined) {
    updateData.email = payload.email != null ? String(payload.email).trim().toLowerCase() || null : null;
  }
  if (payload.address !== undefined) {
    updateData.address = payload.address != null ? String(payload.address).trim() || null : null;
  }
  if (payload.city !== undefined) {
    updateData.city = payload.city != null ? String(payload.city).trim() || null : null;
  }
  if (payload.trn_number !== undefined) {
    updateData.trn_number = payload.trn_number != null ? String(payload.trn_number).trim() || null : null;
  }
  if (payload.notes !== undefined) {
    updateData.notes = payload.notes != null ? String(payload.notes).trim() || null : null;
  }
  if (payload.is_active !== undefined) updateData.is_active = Boolean(payload.is_active);
  if (payload.is_deleted !== undefined) updateData.is_deleted = Boolean(payload.is_deleted);
  if (payload.deleted_at !== undefined) updateData.deleted_at = payload.deleted_at;
  if (payload.deleted_by !== undefined) updateData.deleted_by = payload.deleted_by;

  return updateData;
}

/**
 * Create a new supplier
 */
export async function createSupplier(payload: SupplierInsert, workspaceId?: string): Promise<Supplier> {
  const targetWsId = workspaceId || getActiveWorkspaceId();
  const supabase = createClient();

  const supplierId = payload.id && payload.id.length === 36 ? payload.id : generateUUID();

  const newSupplierData = buildSupplierDbInsertPayload(payload, {
    id: supplierId,
    workspaceId: payload.workspace_id || targetWsId,
  });

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
export async function updateSupplier(id: string, payload: SupplierUpdate, workspaceId?: string): Promise<Supplier> {
  const targetWsId = workspaceId || getActiveWorkspaceId();
  const supabase = createClient();

  const updateData = buildSupplierDbUpdatePayload(payload);

  const { data, error } = await supabase
    .from("suppliers")
    .update(updateData)
    .eq("id", id)
    .eq("workspace_id", targetWsId)
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
