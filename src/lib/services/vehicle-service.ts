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

export async function createVehicle(payload: VehicleInsert, workspaceId?: string): Promise<Vehicle> {
  const targetWsId = payload.workspace_id || workspaceId || getActiveWorkspaceId();
  const supabase = createClient();
  const vehicleId = (payload as any).id && !(payload as any).id.startsWith("veh-") ? (payload as any).id : generateUUID();

  const insertData = {
    ...payload,
    id: vehicleId,
    workspace_id: targetWsId,
    is_deleted: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("vehicles")
    .insert(insertData)
    .select()
    .single();

  if (error) {
    console.error("Supabase vehicle insertion error:", error);
    throw new Error(`Could not save vehicle to cloud database: ${error.message}. No data was saved. Please retry.`);
  }

  return data as Vehicle;
}

export async function updateVehicle(id: string, payload: VehicleUpdate): Promise<Vehicle> {
  const supabase = createClient();
  const updateData = {
    ...payload,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("vehicles")
    .update(updateData)
    .eq("id", id)
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

