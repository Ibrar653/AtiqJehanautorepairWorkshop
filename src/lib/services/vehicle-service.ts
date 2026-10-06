import { createClient } from "@/lib/supabase/client";
import type { Vehicle, VehicleInsert, VehicleUpdate } from "@/types/database";
import { generateUUID } from "@/lib/utils";
import { getActiveWorkspaceId } from "./workspace-service";

const LOCAL_STORAGE_KEY = "atiq_local_vehicles";
let inMemoryVehicles: Vehicle[] = [];

// Known demo vehicle IDs to always purge
const TEST_VEHICLE_IDS = new Set(["veh-demo-landcruiser", "veh-demo-patrol", "veh-demo-bmwx5"]);

export function getLocalVehicles(): Vehicle[] {
  if (typeof window === "undefined") {
    return inMemoryVehicles.filter((v) => !TEST_VEHICLE_IDS.has(v.id));
  }
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (raw !== null) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const clean = parsed.filter((v: any) => !TEST_VEHICLE_IDS.has(v.id));
        return clean;
      }
    }
    return [];
  } catch {
    return inMemoryVehicles.filter((v) => !TEST_VEHICLE_IDS.has(v.id));
  }
}

export function saveLocalVehicles(vehicles: Vehicle[]) {
  inMemoryVehicles = vehicles;
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(vehicles));
  } catch (e) {
    console.error("Failed to save local vehicles cache", e);
  }
}

export async function checkDuplicateChassisVin(chassisVin: string, excludeVehicleId?: string, workspaceId?: string) {
  if (!chassisVin || !chassisVin.trim()) return null;
  const targetWsId = workspaceId || getActiveWorkspaceId();
  const supabase = createClient();
  try {
    let query = supabase
      .from("vehicles")
      .select("id, make, model, registration_number")
      .eq("workspace_id", targetWsId)
      .eq("is_deleted", false)
      .ilike("chassis_vin", chassisVin.trim());

    if (excludeVehicleId) {
      query = query.neq("id", excludeVehicleId);
    }

    const { data, error } = await query.maybeSingle();
    if (error) throw error;
    return data || null;
  } catch (e: any) {
    console.warn("Chassis VIN duplicate check error:", e?.message || e);
    return null;
  }
}

export async function checkDuplicateRegistration(regNumber: string, excludeVehicleId?: string, workspaceId?: string) {
  if (!regNumber || !regNumber.trim()) return null;
  const targetWsId = workspaceId || getActiveWorkspaceId();
  const cleaned = regNumber.trim();
  const supabase = createClient();
  try {
    let query = supabase
      .from("vehicles")
      .select("id, make, model, registration_number, customer:customers(name)")
      .eq("workspace_id", targetWsId)
      .eq("is_deleted", false)
      .ilike("registration_number", cleaned);

    if (excludeVehicleId) {
      query = query.neq("id", excludeVehicleId);
    }

    const { data, error } = await query.maybeSingle();
    if (error) throw error;
    return data || null;
  } catch (e: any) {
    console.warn("Registration duplicate check error:", e?.message || e);
    return null;
  }
}

export const checkDuplicateRegistrationNumber = checkDuplicateRegistration;

export async function getVehicles(query?: string, page = 1, limit = 20, workspaceId?: string) {
  const targetWsId = workspaceId || getActiveWorkspaceId();
  const supabase = createClient();
  const offset = (page - 1) * limit;

  let dbQuery = supabase
    .from("vehicles")
    .select("id, customer_id, make, model, year, color, registration_number, chassis_vin, mileage, notes, created_at, is_deleted, customer:customers(name, mobile, email)", { count: "exact" })
    .eq("workspace_id", targetWsId)
    .eq("is_deleted", false);

  if (query && query.trim()) {
    const q = query.trim();
    dbQuery = dbQuery.or(`make.ilike.%${q}%,model.ilike.%${q}%,registration_number.ilike.%${q}%,chassis_vin.ilike.%${q}%`);
  }

  const { data, count, error } = await dbQuery
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    console.error("Failed to fetch vehicles from Supabase:", error);
    throw new Error(`Could not load vehicles from database: ${error.message}`);
  }

  return { vehicles: (data || []) as unknown as Vehicle[], total: count || 0 };
}

export async function getVehicleById(id: string, workspaceId?: string) {
  if (!id) return null;
  const targetWsId = workspaceId || getActiveWorkspaceId();
  const supabase = createClient();

  const { data, error } = await supabase
    .from("vehicles")
    .select("*, customer:customers(*)")
    .eq("id", id)
    .eq("workspace_id", targetWsId)
    .maybeSingle();

  if (error) {
    console.error(`Failed to fetch vehicle ${id} from Supabase:`, error);
    throw new Error(`Could not load vehicle: ${error.message}`);
  }
  return data;
}

export async function getVehiclesByCustomer(customerId: string, workspaceId?: string): Promise<Vehicle[]> {
  if (!customerId) return [];
  const targetWsId = workspaceId || getActiveWorkspaceId();
  const supabase = createClient();

  const { data, error } = await supabase
    .from("vehicles")
    .select("*")
    .eq("customer_id", customerId)
    .eq("workspace_id", targetWsId)
    .eq("is_deleted", false)
    .order("created_at", { ascending: false });

  if (error) {
    console.error(`Failed to fetch customer vehicles for ${customerId}:`, error);
    throw new Error(`Could not load vehicles for customer: ${error.message}`);
  }
  return (data || []) as Vehicle[];
}

export interface VehicleDbRow {
  id: string;
  workspace_id: string;
  customer_id: string;
  make: string;
  model: string;
  year: number | null;
  color: string | null;
  chassis_vin: string | null;
  mileage: number | null;
  registration_number: string | null;
  notes: string | null;
  is_deleted: boolean;
  deleted_at: string | null;
  deleted_by: string | null;
  created_at: string;
  updated_at: string;
}

export function buildVehicleDbInsertPayload(
  payload: any,
  meta: { id: string; workspaceId: string }
): VehicleDbRow {
  const now = new Date().toISOString();
  return {
    id: meta.id,
    workspace_id: meta.workspaceId,
    customer_id: payload.customer_id,
    make: String(payload.make || "").trim(),
    model: String(payload.model || "").trim(),
    year: payload.year != null && payload.year !== "" ? Number(payload.year) : null,
    color: payload.color != null ? String(payload.color).trim() || null : null,
    chassis_vin: payload.chassis_vin != null ? String(payload.chassis_vin).trim().toUpperCase() || null : null,
    mileage: payload.mileage != null && payload.mileage !== "" ? Number(payload.mileage) : null,
    registration_number: payload.registration_number != null ? String(payload.registration_number).trim().toUpperCase() || null : null,
    notes: payload.notes != null ? String(payload.notes).trim() || null : null,
    is_deleted: false,
    deleted_at: null,
    deleted_by: null,
    created_at: payload.created_at || now,
    updated_at: now,
  };
}

export function buildVehicleDbUpdatePayload(payload: any): Partial<VehicleDbRow> {
  const updateData: Partial<VehicleDbRow> = {
    updated_at: new Date().toISOString(),
  };

  if (payload.customer_id !== undefined) updateData.customer_id = payload.customer_id;
  if (payload.make !== undefined) updateData.make = String(payload.make || "").trim();
  if (payload.model !== undefined) updateData.model = String(payload.model || "").trim();
  if (payload.year !== undefined) {
    updateData.year = payload.year != null && payload.year !== "" ? Number(payload.year) : null;
  }
  if (payload.color !== undefined) {
    updateData.color = payload.color != null ? String(payload.color).trim() || null : null;
  }
  if (payload.chassis_vin !== undefined) {
    updateData.chassis_vin = payload.chassis_vin != null ? String(payload.chassis_vin).trim().toUpperCase() || null : null;
  }
  if (payload.mileage !== undefined) {
    updateData.mileage = payload.mileage != null && payload.mileage !== "" ? Number(payload.mileage) : null;
  }
  if (payload.registration_number !== undefined) {
    updateData.registration_number = payload.registration_number != null ? String(payload.registration_number).trim().toUpperCase() || null : null;
  }
  if (payload.notes !== undefined) {
    updateData.notes = payload.notes != null ? String(payload.notes).trim() || null : null;
  }
  if (payload.is_deleted !== undefined) updateData.is_deleted = Boolean(payload.is_deleted);
  if (payload.deleted_at !== undefined) updateData.deleted_at = payload.deleted_at;
  if (payload.deleted_by !== undefined) updateData.deleted_by = payload.deleted_by;

  return updateData;
}

export async function createVehicle(payload: VehicleInsert, workspaceId?: string): Promise<Vehicle> {
  const targetWsId = payload.workspace_id || workspaceId || getActiveWorkspaceId();
  const supabase = createClient();
  const vehicleId = (payload as any).id && (payload as any).id.length === 36 ? (payload as any).id : generateUUID();

  const insertData = buildVehicleDbInsertPayload(payload, {
    id: vehicleId,
    workspaceId: targetWsId,
  });

  const { data, error } = await supabase
    .from("vehicles")
    .insert(insertData)
    .select()
    .single();

  if (error) {
    console.error("Supabase vehicle insertion error:", error);
    throw new Error(`Could not save vehicle to cloud database: ${error.message}.`);
  }

  return data as Vehicle;
}

export async function updateVehicle(id: string, payload: VehicleUpdate, workspaceId?: string): Promise<Vehicle> {
  const targetWsId = workspaceId || getActiveWorkspaceId();
  const supabase = createClient();

  const updateData = buildVehicleDbUpdatePayload(payload);

  const { data, error } = await supabase
    .from("vehicles")
    .update(updateData)
    .eq("id", id)
    .eq("workspace_id", targetWsId)
    .select()
    .single();

  if (error) {
    console.error(`Supabase vehicle update error for ${id}:`, error);
    throw new Error(`Could not update vehicle in database: ${error.message}`);
  }

  return data as Vehicle;
}

export async function deleteVehicle(id: string): Promise<boolean> {
  const supabase = createClient();
  const { error } = await supabase
    .from("vehicles")
    .update({
      is_deleted: true,
      deleted_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) {
    console.error(`Supabase vehicle deletion error for ${id}:`, error);
    throw new Error(`Could not delete vehicle in database: ${error.message}`);
  }
  return true;
}

