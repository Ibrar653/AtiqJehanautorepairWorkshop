import { createClient } from "@/lib/supabase/client";
import type { Supplier, SupplierInsert, SupplierUpdate, Purchase } from "@/types/database";
import { getActiveWorkspaceId } from "./workspace-service";
import { DEFAULT_WORKSPACE_ID } from "@/lib/constants";
import { getLocalPurchases } from "./purchase-service";
import { getLocalParts } from "./parts-service";

const LOCAL_SUPPLIERS_KEY = "atiq_local_suppliers";

export interface SupplierWithStats extends Supplier {
  total_purchases: number;
  total_paid: number;
  outstanding_balance: number;
  purchases_count: number;
  parts_count: number;
}

const DEFAULT_SUPPLIERS: Supplier[] = [
  {
    id: "sup-1",
    workspace_id: DEFAULT_WORKSPACE_ID,
    name: "Al Futtaim Auto Parts LLC",
    company_name: "Al Futtaim Group UAE",
    contact_person: "Rashid Ali",
    phone: "+971-4-2987654",
    alternate_phone: "+971-50-1234567",
    email: "orders@alfuttaim-parts.ae",
    address: "Al Quoz Industrial Area 3, Dubai",
    city: "Dubai",
    trn_number: "TRN-100200300400003",
    notes: "Official Toyota, Lexus & Genuine Japanese auto parts distributor",
    is_active: true,
    is_deleted: false,
    created_at: "2026-01-01T08:00:00.000Z",
    updated_at: "2026-01-01T08:00:00.000Z",
  },
  {
    id: "sup-2",
    workspace_id: DEFAULT_WORKSPACE_ID,
    name: "Emirates Brake & Suspension Trading",
    company_name: "Emirates Brake Parts Co.",
    contact_person: "Tariq Mahmood",
    phone: "+971-2-5544332",
    alternate_phone: "+971-55-9876543",
    email: "sales@emiratesbrakes.ae",
    address: "Mussafah M-12, Abu Dhabi",
    city: "Abu Dhabi",
    trn_number: "TRN-100500600700003",
    notes: "Brembo, Akebono & Bosch braking systems supplier",
    is_active: true,
    is_deleted: false,
    created_at: "2026-01-02T08:00:00.000Z",
    updated_at: "2026-01-02T08:00:00.000Z",
  },
  {
    id: "sup-3",
    workspace_id: DEFAULT_WORKSPACE_ID,
    name: "Gulf Lubricants & Filters Co.",
    company_name: "Gulf Auto Care LLC",
    contact_person: "Sameer Khan",
    phone: "+971-2-6677889",
    alternate_phone: null,
    email: "info@gulflubricants.ae",
    address: "Madinat Zayed Industrial Area, Al Dhafra",
    city: "Abu Dhabi",
    trn_number: "TRN-100800900100003",
    notes: "Castrol, Mobil1, Total oils and Denso filtration products",
    is_active: true,
    is_deleted: false,
    created_at: "2026-01-03T08:00:00.000Z",
    updated_at: "2026-01-03T08:00:00.000Z",
  },
];

let inMemorySuppliers: Supplier[] = DEFAULT_SUPPLIERS.map((s) => ({
  ...s,
  workspace_id: s.workspace_id || DEFAULT_WORKSPACE_ID,
}));

export function getLocalSuppliers(workspaceId?: string): Supplier[] {
  const targetWsId = workspaceId || getActiveWorkspaceId();
  let all: Supplier[] = [];
  if (typeof window === "undefined") {
    all = inMemorySuppliers;
  } else {
    try {
      const raw = localStorage.getItem(LOCAL_SUPPLIERS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) all = parsed;
      }
    } catch {}
    if (all.length === 0) {
      all = inMemorySuppliers;
      if (typeof window !== "undefined") {
        try {
          localStorage.setItem(LOCAL_SUPPLIERS_KEY, JSON.stringify(inMemorySuppliers));
        } catch {}
      }
    }
  }
  return all.filter(
    (s) => s.workspace_id === targetWsId || (!s.workspace_id && targetWsId === DEFAULT_WORKSPACE_ID)
  );
}

export function saveLocalSuppliers(suppliers: Supplier[], workspaceId?: string) {
  const targetWsId = workspaceId || getActiveWorkspaceId();
  let allExisting: Supplier[] = [];
  if (typeof window !== "undefined") {
    try {
      const raw = localStorage.getItem(LOCAL_SUPPLIERS_KEY);
      if (raw) allExisting = JSON.parse(raw);
    } catch {}
  }
  if (allExisting.length === 0) allExisting = inMemorySuppliers;
  const others = allExisting.filter((s) => s.workspace_id && s.workspace_id !== targetWsId);
  const tagged = suppliers.map((s) => ({ ...s, workspace_id: s.workspace_id || targetWsId }));
  const merged = [...tagged, ...others];
  inMemorySuppliers = merged;
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(LOCAL_SUPPLIERS_KEY, JSON.stringify(merged));
    } catch (e) {
      console.error("Failed to save local suppliers", e);
    }
  }
}

function withTimeout<T>(promise: PromiseLike<T>, timeoutMs = 2000): Promise<T> {
  return Promise.race([
    Promise.resolve(promise),
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error("Supplier query timed out")), timeoutMs)
    ),
  ]);
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
  const purchasesList = allPurchases || getLocalPurchases();
  const partsList = allParts || getLocalParts();

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

  try {
    const fetchWithTimeout = async () => {
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

      if (error) throw error;

      const suppliersWithStats: SupplierWithStats[] = (data || []).map((s: any) => {
        const stats = calculateSupplierStats(s.id, s.purchases, s.parts);
        return {
          ...s,
          ...stats,
        };
      });

      return { suppliers: suppliersWithStats, total: count || 0 };
    };

    return await withTimeout(fetchWithTimeout(), 2000);
  } catch (err: any) {
    console.warn("Using local suppliers fallback:", err.message || err);
    let list = getLocalSuppliers(targetWsId).filter((s) => s.is_deleted !== true);

    if (status === "active") {
      list = list.filter((s) => s.is_active !== false);
    } else if (status === "inactive") {
      list = list.filter((s) => s.is_active === false);
    }

    if (query && query.trim()) {
      const q = query.trim().toLowerCase();
      list = list.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          (s.company_name && s.company_name.toLowerCase().includes(q)) ||
          (s.contact_person && s.contact_person.toLowerCase().includes(q)) ||
          (s.phone && s.phone.toLowerCase().includes(q)) ||
          (s.alternate_phone && s.alternate_phone.toLowerCase().includes(q)) ||
          (s.trn_number && s.trn_number.toLowerCase().includes(q)) ||
          (s.email && s.email.toLowerCase().includes(q)) ||
          (s.city && s.city.toLowerCase().includes(q))
      );
    }

    const total = list.length;
    const paginated = list.slice(offset, offset + limit);

    const allPurchases = getLocalPurchases();
    const allParts = getLocalParts();

    const suppliersWithStats: SupplierWithStats[] = paginated.map((s) => {
      const stats = calculateSupplierStats(s.id, allPurchases, allParts);
      return {
        ...s,
        ...stats,
      };
    });

    return { suppliers: suppliersWithStats, total };
  }
}

/**
 * Get single supplier with purchase history, parts linked, and stats
 */
export async function getSupplierById(id: string): Promise<(SupplierWithStats & { purchases: any[]; parts: any[] }) | null> {
  const supabase = createClient();
  try {
    const fetchWithTimeout = async () => {
      const { data, error } = await supabase
        .from("suppliers")
        .select("*, parts(*), purchases(*, items:purchase_items(*))")
        .eq("id", id)
        .single();

      if (error) throw error;

      const stats = calculateSupplierStats(id, data.purchases, data.parts);
      return {
        ...(data as Supplier),
        ...stats,
        purchases: (data.purchases || []).sort(
          (a: any, b: any) => new Date(b.date || b.created_at).getTime() - new Date(a.date || a.created_at).getTime()
        ),
        parts: data.parts || [],
      };
    };

    return await withTimeout(fetchWithTimeout(), 2000);
  } catch (err: any) {
    console.warn(`Reading supplier ${id} from local fallback:`, err.message || err);
    const list = getLocalSuppliers();
    const s = list.find((item) => item.id === id);
    if (!s) return null;

    const allPurchases = getLocalPurchases().filter((p) => p.supplier_id === id);
    const allParts = getLocalParts().filter((p) => p.supplier_id === id);
    const stats = calculateSupplierStats(id, allPurchases, allParts);

    return {
      ...s,
      ...stats,
      purchases: allPurchases.sort(
        (a: any, b: any) => new Date(b.date || b.created_at).getTime() - new Date(a.date || a.created_at).getTime()
      ),
      parts: allParts,
    };
  }
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
    workspace_id: payload.workspace_id || targetWsId,
    is_active: payload.is_active !== undefined ? payload.is_active : true,
    is_deleted: false,
    deleted_at: null,
    deleted_by: null,
    created_at: now,
    updated_at: now,
  };

  try {
    const fetchWithTimeout = async () => {
      const { data, error } = await supabase
        .from("suppliers")
        .insert(newSupplierData)
        .select()
        .single();

      if (error) throw error;
      return data as Supplier;
    };

    const created = await withTimeout(fetchWithTimeout(), 2000);
    const list = getLocalSuppliers(targetWsId);
    list.unshift(created);
    saveLocalSuppliers(list, targetWsId);
    return created;
  } catch (err: any) {
    console.warn("Creating supplier in local fallback:", err.message || err);
    const newSup: Supplier = {
      id: payload.id || "sup-" + Date.now() + "-" + Math.random().toString(36).substring(2, 6),
      workspace_id: payload.workspace_id || targetWsId,
      name: payload.name.trim(),
      company_name: payload.company_name?.trim() || null,
      contact_person: payload.contact_person?.trim() || null,
      phone: payload.phone?.trim() || null,
      alternate_phone: payload.alternate_phone?.trim() || null,
      email: payload.email?.trim() || null,
      address: payload.address?.trim() || null,
      city: payload.city?.trim() || null,
      trn_number: payload.trn_number?.trim() || null,
      notes: payload.notes?.trim() || null,
      is_active: payload.is_active !== undefined ? payload.is_active : true,
      is_deleted: false,
      deleted_at: null,
      deleted_by: null,
      created_at: now,
      updated_at: now,
    };

    const list = getLocalSuppliers(targetWsId);
    list.unshift(newSup);
    saveLocalSuppliers(list, targetWsId);
    return newSup;
  }
}

/**
 * Update an existing supplier
 */
export async function updateSupplier(id: string, payload: SupplierUpdate): Promise<Supplier> {
  const supabase = createClient();
  const now = new Date().toISOString();

  try {
    const fetchWithTimeout = async () => {
      const { data, error } = await supabase
        .from("suppliers")
        .update({ ...payload, updated_at: now })
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data as Supplier;
    };

    const updated = await withTimeout(fetchWithTimeout(), 2000);
    const list = getLocalSuppliers();
    const idx = list.findIndex((s) => s.id === id);
    if (idx !== -1) {
      list[idx] = updated;
      saveLocalSuppliers(list);
    }
    return updated;
  } catch (err: any) {
    console.warn("Updating supplier in local fallback:", err.message || err);
    const list = getLocalSuppliers();
    const idx = list.findIndex((s) => s.id === id);
    if (idx !== -1) {
      list[idx] = { ...list[idx], ...payload, updated_at: now };
      saveLocalSuppliers(list);
      return list[idx];
    }
    throw err;
  }
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

  // Check history
  const allPurchases = getLocalPurchases().filter((p) => p.supplier_id === id && p.is_deleted !== true);
  const allParts = getLocalParts().filter((p) => p.supplier_id === id && p.is_deleted !== true);
  const hasHistory = allPurchases.length > 0 || allParts.length > 0;

  if (hasHistory && !force) {
    // Soft delete to protect financial audit and inventory links
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

  // Hard delete if no history or forced
  try {
    const { error } = await supabase.from("suppliers").delete().eq("id", id);
    if (error) throw error;
  } catch (err: any) {
    console.warn("Permanent delete in local fallback:", err.message || err);
  }

  const list = getLocalSuppliers().filter((s) => s.id !== id);
  saveLocalSuppliers(list);

  return {
    success: true,
    softDeleted: false,
    message: "Supplier permanently removed.",
  };
}
