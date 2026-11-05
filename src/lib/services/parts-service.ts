import { createClient } from "@/lib/supabase/client";
import { generateUUID } from "@/lib/utils";
import type { Part, PartInsert, PartUpdate } from "@/types/database";
import { getActiveWorkspaceId } from "./workspace-service";
import { DEFAULT_WORKSPACE_ID } from "@/lib/constants";

/**
 * Deprecated local helpers kept as strict no-ops for backward-compatible imports.
 * All spare parts inventory data is fetched exclusively from Supabase.
 */
export function getLocalParts(_workspaceId?: string): Part[] {
  return [];
}

export function saveLocalParts(_parts: Part[], _workspaceId?: string) {
  // No-op: localStorage fallback for inventory data is disabled
}

/**
 * Check if a Part Number already exists in the active workspace to prevent accidental duplicates
 */
export async function checkDuplicatePartNumber(
  partNumber: string,
  excludeId?: string,
  workspaceId?: string
): Promise<boolean> {
  if (!partNumber || !partNumber.trim()) return false;
  const cleanNum = partNumber.trim();
  const targetWsId = workspaceId || getActiveWorkspaceId();
  const supabase = createClient();

  let q = supabase
    .from("parts")
    .select("id, part_number")
    .eq("workspace_id", targetWsId)
    .eq("is_deleted", false)
    .ilike("part_number", cleanNum);

  if (excludeId) {
    q = q.neq("id", excludeId);
  }

  const { data, error } = await q.limit(1);
  if (error) {
    console.error("Failed to check duplicate part number in Supabase:", error);
    return false;
  }
  return Boolean(data && data.length > 0);
}

export type PartsFilterType = "all" | "in_stock" | "low_stock" | "out_of_stock" | "active" | "inactive";

/**
 * Fetch paginated, searchable spare parts catalog from Supabase (workspace-scoped, no localStorage fallback)
 */
export async function getParts(
  filter: PartsFilterType = "all",
  query?: string,
  page = 1,
  limit = 30,
  workspaceId?: string
): Promise<{ parts: Part[]; total: number }> {
  const targetWsId = workspaceId || getActiveWorkspaceId();
  const supabase = createClient();
  const offset = (page - 1) * limit;

  let dbQuery = supabase
    .from("parts")
    .select(
      "id, workspace_id, name, part_number, brand, description, unit, purchase_price, selling_price, current_stock, minimum_stock, supplier_id, location, is_active, is_deleted, created_at, updated_at, supplier:suppliers(id, name, phone, contact_person)",
      { count: "exact" }
    )
    .eq("workspace_id", targetWsId)
    .eq("is_deleted", false);

  if (query && query.trim()) {
    const q = query.trim().replace(/[,()]/g, " ").trim();
    if (q) {
      // Check for matching suppliers in the same workspace to support searching by supplier name
      const { data: matchedSups } = await supabase
        .from("suppliers")
        .select("id")
        .eq("workspace_id", targetWsId)
        .ilike("name", `%${q}%`);

      const supIds = (matchedSups || []).map((s: any) => s.id);

      if (supIds.length > 0) {
        dbQuery = dbQuery.or(
          `name.ilike.%${q}%,part_number.ilike.%${q}%,brand.ilike.%${q}%,description.ilike.%${q}%,location.ilike.%${q}%,supplier_id.in.(${supIds.join(",")})`
        );
      } else {
        dbQuery = dbQuery.or(
          `name.ilike.%${q}%,part_number.ilike.%${q}%,brand.ilike.%${q}%,description.ilike.%${q}%,location.ilike.%${q}%`
        );
      }
    }
  }

  if (filter === "active") dbQuery = dbQuery.eq("is_active", true);
  if (filter === "inactive") dbQuery = dbQuery.eq("is_active", false);
  if (filter === "in_stock") {
    dbQuery = dbQuery.eq("is_active", true).gt("current_stock", 0);
  }
  if (filter === "out_of_stock") {
    dbQuery = dbQuery.eq("is_active", true).lte("current_stock", 0);
  }

  const { data, count, error } = await dbQuery
    .order("name", { ascending: true })
    .range(offset, offset + limit - 1);

  if (error) {
    console.error("Failed to fetch spare parts from Supabase:", error);
    throw new Error(`Failed to fetch spare parts: ${error.message}`);
  }

  let filtered = ((data || []) as unknown as Part[]);

  if (filter === "low_stock") {
    filtered = filtered.filter(
      (p) => p.is_active && p.current_stock > 0 && p.current_stock <= p.minimum_stock
    );
  }

  return {
    parts: filtered,
    total: filter === "low_stock" ? filtered.length : count ?? filtered.length,
  };
}

/**
 * Fetch single spare part by ID from Supabase (no localStorage fallback)
 */
export async function getPartById(id: string, workspaceId?: string): Promise<Part | null> {
  if (!id) return null;
  const targetWsId = workspaceId || getActiveWorkspaceId();
  const supabase = createClient();

  let q = supabase
    .from("parts")
    .select("*, supplier:suppliers(id, name, contact_person, phone)")
    .eq("id", id);

  if (targetWsId) {
    q = q.eq("workspace_id", targetWsId);
  }

  const { data, error } = await q.maybeSingle();

  if (error) {
    console.error(`Failed to read spare part ${id} from Supabase:`, error);
    return null;
  }

  return (data as Part) || null;
}

export interface PartDbRow {
  id: string;
  workspace_id: string;
  part_number: string | null;
  name: string;
  brand: string | null;
  description: string | null;
  unit: string;
  purchase_price: number;
  selling_price: number;
  current_stock: number;
  minimum_stock: number;
  supplier_id: string | null;
  location: string | null;
  is_active: boolean;
  is_deleted: boolean;
  deleted_at: string | null;
  deleted_by: string | null;
  created_at: string;
  updated_at: string;
}

export function buildPartDbInsertPayload(
  payload: any,
  meta: { id: string; workspaceId: string }
): PartDbRow {
  const now = new Date().toISOString();
  return {
    id: meta.id,
    workspace_id: meta.workspaceId,
    part_number: payload.part_number != null ? String(payload.part_number).trim() || null : null,
    name: String(payload.name || "").trim(),
    brand: payload.brand != null ? String(payload.brand).trim() || null : null,
    description: payload.description != null ? String(payload.description).trim() || null : null,
    unit: payload.unit != null && String(payload.unit).trim() ? String(payload.unit).trim() : "piece",
    purchase_price: Number(payload.purchase_price) || 0,
    selling_price: Number(payload.selling_price) || 0,
    current_stock: Number(payload.current_stock) || 0,
    minimum_stock: payload.minimum_stock != null ? Number(payload.minimum_stock) : 5,
    supplier_id: payload.supplier_id && payload.supplier_id.length === 36 ? payload.supplier_id : null,
    location: payload.location != null ? String(payload.location).trim() || null : null,
    is_active: payload.is_active !== undefined ? Boolean(payload.is_active) : true,
    is_deleted: false,
    deleted_at: null,
    deleted_by: null,
    created_at: payload.created_at || now,
    updated_at: now,
  };
}

export function buildPartDbUpdatePayload(payload: any): Partial<PartDbRow> {
  const updateData: Partial<PartDbRow> = {
    updated_at: new Date().toISOString(),
  };

  if (payload.name !== undefined) updateData.name = String(payload.name || "").trim();
  if (payload.part_number !== undefined) {
    updateData.part_number = payload.part_number != null ? String(payload.part_number).trim() || null : null;
  }
  if (payload.brand !== undefined) {
    updateData.brand = payload.brand != null ? String(payload.brand).trim() || null : null;
  }
  if (payload.description !== undefined) {
    updateData.description = payload.description != null ? String(payload.description).trim() || null : null;
  }
  if (payload.location !== undefined) {
    updateData.location = payload.location != null ? String(payload.location).trim() || null : null;
  }
  if (payload.unit !== undefined) {
    updateData.unit = payload.unit != null && String(payload.unit).trim() ? String(payload.unit).trim() : "piece";
  }
  if (payload.purchase_price !== undefined) {
    updateData.purchase_price = Number(payload.purchase_price) || 0;
  }
  if (payload.selling_price !== undefined) {
    updateData.selling_price = Number(payload.selling_price) || 0;
  }
  if (payload.minimum_stock !== undefined) {
    updateData.minimum_stock = Number(payload.minimum_stock) || 0;
  }
  if (payload.current_stock !== undefined) {
    updateData.current_stock = Number(payload.current_stock) || 0;
  }
  if (payload.supplier_id !== undefined) {
    updateData.supplier_id = payload.supplier_id && payload.supplier_id.length === 36 ? payload.supplier_id : null;
  }
  if (payload.is_active !== undefined) updateData.is_active = Boolean(payload.is_active);
  if (payload.is_deleted !== undefined) updateData.is_deleted = Boolean(payload.is_deleted);
  if (payload.deleted_at !== undefined) updateData.deleted_at = payload.deleted_at;
  if (payload.deleted_by !== undefined) updateData.deleted_by = payload.deleted_by;

  return updateData;
}

/**
 * Create a new spare part
 */
export async function createPart(payload: PartInsert, workspaceId?: string): Promise<Part> {
  const targetWsId = workspaceId || await getActiveWorkspaceId();
  const supabase = createClient();
  const now = new Date().toISOString();

  // Check duplicate part number if provided
  if (payload.part_number && payload.part_number.trim()) {
    const isDup = await checkDuplicatePartNumber(payload.part_number.trim(), undefined, targetWsId);
    if (isDup) {
      throw new Error(`A spare part with Part Number "${payload.part_number.trim()}" already exists.`);
    }
  }

  const initialStock = Math.max(0, Number(payload.current_stock) || 0);
  const partId = (payload as any).id && (payload as any).id.length === 36 ? (payload as any).id : generateUUID();

  const insertData = buildPartDbInsertPayload(
    { ...payload, current_stock: initialStock },
    {
      id: partId,
      workspaceId: payload.workspace_id || targetWsId,
    }
  );

  const { data: created, error } = await supabase
    .from("parts")
    .insert(insertData)
    .select()
    .single();

  if (error) {
    console.error("Failed to create spare part in Supabase:", error);
    throw new Error(`Failed to create spare part: ${error.message}`);
  }

  // If initial stock > 0, record initial stock-in transaction
  if (initialStock > 0) {
    try {
      await supabase.from("inventory_transactions").insert({
        id: generateUUID(),
        workspace_id: targetWsId,
        part_id: created.id,
        transaction_type: "opening_stock",
        quantity: initialStock,
        quantity_before: 0,
        quantity_after: initialStock,
        unit_cost: Number(payload.purchase_price) || 0,
        reference_type: "opening_stock",
        reference_id: "INIT-" + created.id.slice(-6),
        notes: "Opening Stock Registration",
        created_at: now,
      });
    } catch (txErr) {
      console.warn("Initial opening stock transaction notice:", txErr);
    }
  }

  return created as Part;
}

/**
 * Update an existing spare part
 */
export async function updatePart(id: string, payload: PartUpdate, workspaceId?: string): Promise<Part> {
  const targetWsId = workspaceId || await getActiveWorkspaceId();
  const supabase = createClient();

  // Validate duplicate part number if part_number changed
  if (payload.part_number && payload.part_number.trim()) {
    const isDup = await checkDuplicatePartNumber(payload.part_number.trim(), id, targetWsId);
    if (isDup) {
      throw new Error(`A spare part with Part Number "${payload.part_number.trim()}" already exists.`);
    }
  }

  const updateData = buildPartDbUpdatePayload(payload);

  const { data, error } = await supabase
    .from("parts")
    .update(updateData)
    .eq("id", id)
    .eq("workspace_id", targetWsId)
    .select()
    .single();

  if (error) {
    console.error(`Failed to update spare part ${id} in Supabase:`, error);
    throw new Error(`Failed to update spare part: ${error.message}`);
  }

  return data as Part;
}

/**
 * Toggle active / inactive status
 */
export async function togglePartStatus(id: string, currentStatus: boolean): Promise<Part> {
  return updatePart(id, { is_active: !currentStatus });
}

/**
 * Standalone spare part sale (decreases stock & logs inventory transaction)
 */
export async function sellSparePartStandalone(
  partId: string,
  quantity: number,
  notes = "Standalone Over-The-Counter Sale"
): Promise<{ success: boolean; message?: string }> {
  const { recordStockTransaction } = await import("./inventory-service");
  await recordStockTransaction({
    partId,
    transactionType: "sale",
    quantityChange: -quantity,
    referenceType: "direct_sale",
    notes,
  });
  return { success: true };
}

/**
 * Check if a spare part has historical records across Job Cards, Inventory Transactions, Purchases, or Invoices
 */
export async function getPartUsageCount(partId: string): Promise<number> {
  const supabase = createClient();

  try {
    const [jcRes, itRes, piRes, invRes] = await Promise.all([
      supabase.from("job_card_items").select("id", { count: "exact", head: true }).eq("part_id", partId),
      supabase.from("inventory_transactions").select("id", { count: "exact", head: true }).eq("part_id", partId),
      supabase.from("purchase_items").select("id", { count: "exact", head: true }).eq("part_id", partId),
      supabase.from("invoice_items").select("id", { count: "exact", head: true }).eq("part_id", partId),
    ]);

    return (jcRes.count || 0) + (itRes.count || 0) + (piRes.count || 0) + (invRes.count || 0);
  } catch {
    return 0;
  }
}

/**
 * Delete or soft-deactivate spare part safely protecting historical data
 */
export async function deletePart(
  id: string,
  workspaceId?: string
): Promise<{ success: boolean; deactivated: boolean; message: string }> {
  const targetWsId = workspaceId || await getActiveWorkspaceId();
  const usageCount = await getPartUsageCount(id);

  if (usageCount > 0) {
    await updatePart(id, { is_active: false }, targetWsId);
    return {
      success: true,
      deactivated: true,
      message: "This spare part has existing history and cannot be permanently deleted. It has been deactivated instead.",
    };
  }

  const supabase = createClient();
  const { error } = await supabase
    .from("parts")
    .delete()
    .eq("id", id)
    .eq("workspace_id", targetWsId);

  if (error) {
    console.error(`Failed to delete part ${id} from Supabase:`, error);
    throw new Error(`Failed to delete spare part: ${error.message}`);
  }

  return {
    success: true,
    deactivated: false,
    message: "Spare part permanently deleted.",
  };
}
