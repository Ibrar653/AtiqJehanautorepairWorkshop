import { createClient } from "@/lib/supabase/client";
import { generateUUID } from "@/lib/utils";
import type { Part, PartInsert, PartUpdate } from "@/types/database";
import { getActiveWorkspaceId } from "./workspace-service";
import { DEFAULT_WORKSPACE_ID } from "@/lib/constants";

const LOCAL_PARTS_KEY = "atiq_local_parts";

const DEFAULT_PARTS: Part[] = [
  {
    id: "prt-1",
    name: "Fully Synthetic Engine Oil 5W-30 (4L)",
    part_number: "OIL-5W30-SYN",
    brand: "Castrol",
    description: "Premium synthetic motor oil for modern petrol and diesel engines",
    unit: "can",
    purchase_price: 110,
    selling_price: 160,
    current_stock: 35,
    minimum_stock: 10,
    supplier_id: null,
    location: "Rack A-01",
    is_active: true,
    created_at: "2026-01-10T08:00:00.000Z",
    updated_at: "2026-01-10T08:00:00.000Z",
  },
  {
    id: "prt-2",
    name: "Genuine Engine Oil Filter",
    part_number: "FLT-OIL-OEM",
    brand: "Toyota / Genuine",
    description: "OEM high-flow engine oil filter element",
    unit: "piece",
    purchase_price: 25,
    selling_price: 45,
    current_stock: 50,
    minimum_stock: 15,
    supplier_id: null,
    location: "Shelf B-02",
    is_active: true,
    created_at: "2026-01-10T08:00:00.000Z",
    updated_at: "2026-01-10T08:00:00.000Z",
  },
  {
    id: "prt-3",
    name: "Ceramic Front Brake Pads Set",
    part_number: "BRK-PAD-F01",
    brand: "Brembo",
    description: "Heavy duty low-dust ceramic front brake pads",
    unit: "set",
    purchase_price: 140,
    selling_price: 220,
    current_stock: 18,
    minimum_stock: 6,
    supplier_id: null,
    location: "Rack C-04",
    is_active: true,
    created_at: "2026-01-11T08:00:00.000Z",
    updated_at: "2026-01-11T08:00:00.000Z",
  },
  {
    id: "prt-4",
    name: "Ceramic Rear Brake Pads Set",
    part_number: "BRK-PAD-R01",
    brand: "Brembo",
    description: "Premium rear brake pads for Japanese and Korean sedans",
    unit: "set",
    purchase_price: 120,
    selling_price: 190,
    current_stock: 14,
    minimum_stock: 5,
    supplier_id: null,
    location: "Rack C-05",
    is_active: true,
    created_at: "2026-01-11T08:00:00.000Z",
    updated_at: "2026-01-11T08:00:00.000Z",
  },
  {
    id: "prt-5",
    name: "Cabin AC Air Filter",
    part_number: "FLT-CAB-01",
    brand: "Denso",
    description: "Activated carbon air conditioner cabin pollen filter",
    unit: "piece",
    purchase_price: 30,
    selling_price: 60,
    current_stock: 22,
    minimum_stock: 8,
    supplier_id: null,
    location: "Bin 12",
    is_active: true,
    created_at: "2026-01-12T08:00:00.000Z",
    updated_at: "2026-01-12T08:00:00.000Z",
  },
  {
    id: "prt-6",
    name: "Engine Air Intake Filter",
    part_number: "FLT-AIR-01",
    brand: "Denso",
    description: "Engine intake air filter element",
    unit: "piece",
    purchase_price: 35,
    selling_price: 70,
    current_stock: 19,
    minimum_stock: 8,
    supplier_id: null,
    location: "Bin 14",
    is_active: true,
    created_at: "2026-01-12T08:00:00.000Z",
    updated_at: "2026-01-12T08:00:00.000Z",
  },
  {
    id: "prt-7",
    name: "Iridium Spark Plugs (Pack of 4)",
    part_number: "SPK-IRID-04",
    brand: "NGK",
    description: "Long-life Laser Iridium spark plug set",
    unit: "set",
    purchase_price: 90,
    selling_price: 150,
    current_stock: 25,
    minimum_stock: 10,
    supplier_id: null,
    location: "Shelf D-01",
    is_active: true,
    created_at: "2026-01-14T08:00:00.000Z",
    updated_at: "2026-01-14T08:00:00.000Z",
  },
  {
    id: "prt-8",
    name: "Automatic Transmission Fluid ATF WS (4L)",
    part_number: "ATF-WS-04",
    brand: "Toyota / Genuine",
    description: "Original ATF World Standard automatic gearbox fluid",
    unit: "can",
    purchase_price: 130,
    selling_price: 195,
    current_stock: 16,
    minimum_stock: 6,
    supplier_id: null,
    location: "Rack A-03",
    is_active: true,
    created_at: "2026-01-15T08:00:00.000Z",
    updated_at: "2026-01-15T08:00:00.000Z",
  },
  {
    id: "prt-9",
    name: "Long Life Engine Coolant / Antifreeze (4L)",
    part_number: "CLT-LLC-04",
    brand: "TotalEnergies",
    description: "Ready-to-use ethylene glycol 50/50 radiator coolant",
    unit: "can",
    purchase_price: 45,
    selling_price: 80,
    current_stock: 4,
    minimum_stock: 8,
    supplier_id: null,
    location: "Floor Zone E",
    is_active: true,
    created_at: "2026-01-16T08:00:00.000Z",
    updated_at: "2026-01-16T08:00:00.000Z",
  },
  {
    id: "prt-10",
    name: "Heavy Duty 12V 70Ah Car Battery",
    part_number: "BAT-12V-70A",
    brand: "Varta / Bosch",
    description: "Maintenance free automotive starter battery",
    unit: "piece",
    purchase_price: 240,
    selling_price: 360,
    current_stock: 0,
    minimum_stock: 4,
    supplier_id: null,
    location: "Battery Bay",
    is_active: true,
    created_at: "2026-01-18T08:00:00.000Z",
    updated_at: "2026-01-18T08:00:00.000Z",
  },
  {
    id: "prt-11",
    name: "Brake Fluid DOT 4 (1L)",
    part_number: "BF-DOT4-1L",
    brand: "Motul",
    description: "High boiling point synthetic brake and clutch fluid",
    unit: "bottle",
    purchase_price: 25,
    selling_price: 45,
    current_stock: 30,
    minimum_stock: 10,
    supplier_id: null,
    location: "Shelf B-01",
    is_active: true,
    created_at: "2026-01-18T08:00:00.000Z",
    updated_at: "2026-01-18T08:00:00.000Z",
  },
  {
    id: "prt-12",
    name: "Front Wiper Blades Pair (24\"/18\")",
    part_number: "WPR-BLD-PR",
    brand: "Bosch Aerotwin",
    description: "Flat aerodynamic frameless wiper blade set",
    unit: "pair",
    purchase_price: 40,
    selling_price: 75,
    current_stock: 15,
    minimum_stock: 5,
    supplier_id: null,
    location: "Rack F-02",
    is_active: true,
    created_at: "2026-01-19T08:00:00.000Z",
    updated_at: "2026-01-19T08:00:00.000Z",
  },
];

let inMemoryParts: Part[] = DEFAULT_PARTS.map((p) => ({
  ...p,
  workspace_id: p.workspace_id || DEFAULT_WORKSPACE_ID,
}));

export function getLocalParts(workspaceId?: string): Part[] {
  const targetWsId = workspaceId || getActiveWorkspaceId();
  let all: Part[] = [];
  if (typeof window === "undefined") {
    all = inMemoryParts;
  } else {
    try {
      const raw = localStorage.getItem(LOCAL_PARTS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) all = parsed;
      }
    } catch {}
    if (all.length === 0) {
      all = inMemoryParts;
      if (typeof window !== "undefined") {
        try {
          localStorage.setItem(LOCAL_PARTS_KEY, JSON.stringify(inMemoryParts));
        } catch {}
      }
    }
  }
  return all.filter(
    (p) => p.workspace_id === targetWsId || (!p.workspace_id && targetWsId === DEFAULT_WORKSPACE_ID)
  );
}

export function saveLocalParts(parts: Part[], workspaceId?: string) {
  const targetWsId = workspaceId || getActiveWorkspaceId();
  let allExisting: Part[] = [];
  if (typeof window !== "undefined") {
    try {
      const raw = localStorage.getItem(LOCAL_PARTS_KEY);
      if (raw) allExisting = JSON.parse(raw);
    } catch {}
  }
  if (allExisting.length === 0) allExisting = inMemoryParts;
  const others = allExisting.filter((p) => p.workspace_id && p.workspace_id !== targetWsId);
  const tagged = parts.map((p) => ({ ...p, workspace_id: p.workspace_id || targetWsId }));
  const merged = [...tagged, ...others];
  inMemoryParts = merged;
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(LOCAL_PARTS_KEY, JSON.stringify(merged));
    } catch (e) {
      console.error("Failed to save local parts", e);
    }
  }
}

function withTimeout<T>(promise: PromiseLike<T>, timeoutMs = 4000): Promise<T> {
  return Promise.race([
    Promise.resolve(promise),
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error("Parts query timed out")), timeoutMs)
    ),
  ]);
}

/**
 * Check if a Part Number already exists to prevent accidental duplicates
 */
export async function checkDuplicatePartNumber(partNumber: string, excludeId?: string): Promise<boolean> {
  if (!partNumber || !partNumber.trim()) return false;
  const cleanNum = partNumber.trim().toLowerCase();
  const supabase = createClient();

  try {
    const fetchWithTimeout = async () => {
      let q = supabase
        .from("parts")
        .select("id, part_number")
        .ilike("part_number", cleanNum);

      if (excludeId) {
        q = q.neq("id", excludeId);
      }

      const { data, error } = await q.limit(1);
      if (error) throw error;
      return (data && data.length > 0);
    };

    return await withTimeout(fetchWithTimeout(), 1500);
  } catch {
    const list = getLocalParts();
    return list.some(
      (p) =>
        p.part_number &&
        p.part_number.trim().toLowerCase() === cleanNum &&
        p.id !== excludeId
    );
  }
}

export type PartsFilterType = "all" | "in_stock" | "low_stock" | "out_of_stock" | "active" | "inactive";

/**
 * Fetch paginated, searchable spare parts catalog with supplier information and resilient fallback
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

  try {
    const fetchWithTimeout = async () => {
      let dbQuery = supabase
        .from("parts")
        .select(
          "id, name, part_number, brand, description, unit, purchase_price, selling_price, current_stock, minimum_stock, supplier_id, location, is_active, created_at, updated_at, supplier:suppliers(id, name, phone, contact_person)",
          { count: "exact" }
        )
        .eq("workspace_id", targetWsId);

      if (query && query.trim()) {
        const q = query.trim();
        // Check for matching suppliers first to support searching by supplier name in database
        const { data: matchedSups } = await supabase
          .from("suppliers")
          .select("id")
          .ilike("name", `%${q}%`);

        const supIds = (matchedSups || []).map((s: any) => s.id);

        if (supIds.length > 0) {
          dbQuery = dbQuery.or(
            `name.ilike.%${q}%,part_number.ilike.%${q}%,brand.ilike.%${q}%,location.ilike.%${q}%,supplier_id.in.(${supIds.join(",")})`
          );
        } else {
          dbQuery = dbQuery.or(
            `name.ilike.%${q}%,part_number.ilike.%${q}%,brand.ilike.%${q}%,location.ilike.%${q}%`
          );
        }
      }

      if (filter === "active") dbQuery = dbQuery.eq("is_active", true);
      if (filter === "inactive") dbQuery = dbQuery.eq("is_active", false);

      const { data, count, error } = await dbQuery
        .order("name", { ascending: true })
        .range(offset, offset + limit - 1);

      if (error) throw error;
      return { data: (data || []) as unknown as Part[], count: count || 0 };
    };

    const result = await withTimeout(fetchWithTimeout(), 2000);
    let filtered = result.data || [];

    if (filter === "in_stock") {
      filtered = filtered.filter((p) => p.is_active && p.current_stock > 0);
    } else if (filter === "low_stock") {
      filtered = filtered.filter((p) => p.is_active && p.current_stock > 0 && p.current_stock <= p.minimum_stock);
    } else if (filter === "out_of_stock") {
      filtered = filtered.filter((p) => p.is_active && p.current_stock <= 0);
    }

    // Synchronize to local cache if valid data was returned
    if (filtered.length > 0 && page === 1 && !query && filter === "all") {
      saveLocalParts(filtered, targetWsId);
    }

    return { parts: filtered, total: result.count || filtered.length };
  } catch (err: any) {
    console.warn("Using local spare parts catalog fallback:", err.message || err);

    let list = getLocalParts(targetWsId);
    let localSuppliers: any[] = [];
    try {
      const { getLocalSuppliers } = require("./supplier-service");
      localSuppliers = getLocalSuppliers();
    } catch {}

    // Attach supplier relations to local parts
    list = list.map((p) => {
      if (!p.supplier && p.supplier_id) {
        const foundSup = localSuppliers.find((s) => s.id === p.supplier_id);
        if (foundSup) {
          return { ...p, supplier: foundSup };
        }
      }
      return p;
    });

    // 1. Filter by search query (Name, Part #, Brand, Location, Supplier Name)
    if (query && query.trim()) {
      const q = query.trim().toLowerCase();
      list = list.filter((p) => {
        const supName = p.supplier && typeof p.supplier === "object" && "name" in p.supplier ? (p.supplier as any).name : "";
        return (
          p.name.toLowerCase().includes(q) ||
          (p.part_number && p.part_number.toLowerCase().includes(q)) ||
          (p.brand && p.brand.toLowerCase().includes(q)) ||
          (p.location && p.location.toLowerCase().includes(q)) ||
          (supName && supName.toLowerCase().includes(q))
        );
      });
    }

    // 2. Filter by status / stock condition
    if (filter === "active") {
      list = list.filter((p) => p.is_active);
    } else if (filter === "inactive") {
      list = list.filter((p) => !p.is_active);
    } else if (filter === "in_stock") {
      list = list.filter((p) => p.is_active && p.current_stock > 0);
    } else if (filter === "low_stock") {
      list = list.filter((p) => p.is_active && p.current_stock > 0 && p.current_stock <= p.minimum_stock);
    } else if (filter === "out_of_stock") {
      list = list.filter((p) => p.is_active && p.current_stock <= 0);
    }

    const total = list.length;
    const paginated = list.slice(offset, offset + limit);

    return { parts: paginated, total };
  }
}

/**
 * Fetch single spare part by ID
 */
export async function getPartById(id: string, workspaceId?: string): Promise<Part | null> {
  const supabase = createClient();
  try {
    const fetchWithTimeout = async () => {
      const { data, error } = await supabase
        .from("parts")
        .select("*, supplier:suppliers(id, name, contact_person, phone)")
        .eq("id", id)
        .single();

      if (error) throw error;
      return data as Part;
    };

    return await withTimeout(fetchWithTimeout(), 2000);
  } catch (err: any) {
    console.warn(`Reading part ${id} from local fallback:`, err.message || err);
    let all = inMemoryParts;
    if (typeof window !== "undefined") {
      try {
        const raw = localStorage.getItem(LOCAL_PARTS_KEY);
        if (raw) all = JSON.parse(raw);
      } catch {}
    }
    return all.find((p) => p.id === id) || null;
  }
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
    const isDup = await checkDuplicatePartNumber(payload.part_number.trim());
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
    const isDup = await checkDuplicatePartNumber(payload.part_number.trim(), id);
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
