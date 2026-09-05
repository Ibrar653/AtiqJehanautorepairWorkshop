import { createClient } from "@/lib/supabase/client";
import type { Vehicle, VehicleInsert, VehicleUpdate } from "@/types/database";

const DEFAULT_INITIAL_VEHICLES: Vehicle[] = [];

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
        if (clean.length !== parsed.length) {
          localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(clean));
        }
        return clean;
      }
    }
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify([]));
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
    console.error("Failed to save local vehicles", e);
  }
}

export async function checkDuplicateChassisVin(chassisVin: string, excludeVehicleId?: string) {
  if (!chassisVin || !chassisVin.trim()) return null;
  const supabase = createClient();
  try {
    let query = supabase
      .from("vehicles")
      .select("id, make, model, registration_number")
      .eq("is_deleted", false)
      .ilike("chassis_vin", chassisVin.trim());

    if (excludeVehicleId) {
      query = query.neq("id", excludeVehicleId);
    }

    const { data, error } = await query.maybeSingle();
    if (error) throw error;
    if (data) return data;
  } catch (e) {
    const local = getLocalVehicles().filter((v) => !v.is_deleted);
    const found = local.find(
      (v) =>
        v.chassis_vin &&
        v.chassis_vin.toLowerCase() === chassisVin.trim().toLowerCase() &&
        v.id !== excludeVehicleId
    );
    if (found) return found;
  }

  return null;
}

export async function checkDuplicateRegistration(regNumber: string, excludeVehicleId?: string) {
  if (!regNumber || !regNumber.trim()) return null;
  const cleaned = regNumber.trim();
  const supabase = createClient();
  try {
    let query = supabase
      .from("vehicles")
      .select("id, make, model, registration_number, customer:customers(name)")
      .eq("is_deleted", false)
      .ilike("registration_number", cleaned);

    if (excludeVehicleId) {
      query = query.neq("id", excludeVehicleId);
    }

    const { data, error } = await query.maybeSingle();
    if (error) throw error;
    if (data) return data;
  } catch (e) {
    const local = getLocalVehicles().filter((v) => !v.is_deleted);
    const found = local.find(
      (v) =>
        v.registration_number &&
        v.registration_number.toLowerCase().trim() === cleaned.toLowerCase() &&
        v.id !== excludeVehicleId
    );
    if (found) return found;
  }

  return null;
}

export const checkDuplicateRegistrationNumber = checkDuplicateRegistration;

export async function getVehicles(query?: string, page = 1, limit = 20) {
  const supabase = createClient();
  const offset = (page - 1) * limit;

  try {
    const fetchVehiclesPromise = (async () => {
      let dbQuery = supabase
        .from("vehicles")
        .select("id, customer_id, make, model, year, color, registration_number, chassis_vin, mileage, notes, created_at, is_deleted, customer:customers(name, mobile, email)", { count: "exact" })
        .eq("is_deleted", false);

      if (query && query.trim()) {
        const q = query.trim();
        dbQuery = dbQuery.or(`make.ilike.%${q}%,model.ilike.%${q}%,registration_number.ilike.%${q}%,chassis_vin.ilike.%${q}%`);
      }

      return await dbQuery
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);
    })();

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Vehicles query timed out")), 2000)
    );

    const { data, count, error } = await Promise.race([fetchVehiclesPromise, timeoutPromise]);

    if (error) throw error;

    saveLocalVehicles((data || []) as unknown as Vehicle[]);
    return { vehicles: (data || []) as unknown as Vehicle[], total: count || 0 };
  } catch (err: any) {
    console.warn("Using local vehicle store fallback:", err.message || err);
    let local = getLocalVehicles().filter((v) => !v.is_deleted);

    if (query && query.trim()) {
      const q = query.trim().toLowerCase();
      local = local.filter(
        (v) =>
          v.make.toLowerCase().includes(q) ||
          v.model.toLowerCase().includes(q) ||
          (v.registration_number && v.registration_number.toLowerCase().includes(q)) ||
          (v.chassis_vin && v.chassis_vin.toLowerCase().includes(q))
      );
    }

    const paged = local.slice(offset, offset + limit);
    return { vehicles: paged, total: local.length };
  }
}

export async function getVehicleById(id: string) {
  const supabase = createClient();
  try {
    const { data, error } = await supabase
      .from("vehicles")
      .select("*, customer:customers(*)")
      .eq("id", id)
      .single();

    if (error) throw error;
    return data;
  } catch (err: any) {
    console.warn(`Reading vehicle ${id} from local fallback:`, err.message || err);
    const local = getLocalVehicles();
    const found = local.find((v) => v.id === id);
    if (found) return found;

    return null;
  }
}

export async function getVehiclesByCustomer(customerId: string): Promise<Vehicle[]> {
  const supabase = createClient();
  try {
    const { data, error } = await supabase
      .from("vehicles")
      .select("*")
      .eq("customer_id", customerId)
      .eq("is_deleted", false)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return data as Vehicle[];
  } catch (err: any) {
    console.warn(`Fetching vehicles for customer ${customerId} from local fallback:`, err.message || err);
    const local = getLocalVehicles();
    return local.filter((v) => v.customer_id === customerId && !v.is_deleted);
  }
}

export async function createVehicle(payload: VehicleInsert) {
  const supabase = createClient();
  try {
    const { data, error } = await supabase
      .from("vehicles")
      .insert({ ...payload, is_deleted: false })
      .select()
      .single();

    if (error) throw error;
    return data as Vehicle;
  } catch (err: any) {
    console.warn("Creating vehicle in local store fallback:", err.message || err);
    const newVehicle: Vehicle = {
      id: "veh-" + Date.now() + "-" + Math.random().toString(36).substring(2, 7),
      customer_id: payload.customer_id,
      make: payload.make,
      model: payload.model,
      year: payload.year || null,
      color: payload.color || null,
      chassis_vin: payload.chassis_vin || null,
      mileage: payload.mileage || null,
      registration_number: payload.registration_number || null,
      notes: payload.notes || null,
      is_deleted: false,
      deleted_at: null,
      deleted_by: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const local = getLocalVehicles();
    local.unshift(newVehicle);
    saveLocalVehicles(local);
    return newVehicle;
  }
}

export async function updateVehicle(id: string, payload: VehicleUpdate) {
  const supabase = createClient();
  try {
    const { data, error } = await supabase
      .from("vehicles")
      .update(payload)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    return data as Vehicle;
  } catch (err: any) {
    console.warn("Updating vehicle in local store fallback:", err.message || err);
    const local = getLocalVehicles();
    const idx = local.findIndex((v) => v.id === id);
    if (idx !== -1) {
      local[idx] = {
        ...local[idx],
        ...payload,
        updated_at: new Date().toISOString(),
      };
      saveLocalVehicles(local);
      return local[idx];
    }
    throw new Error(`Error updating vehicle ${id}: ${err.message || err}`);
  }
}

export async function deleteVehicle(id: string) {
  const supabase = createClient();
  try {
    const { error } = await supabase.from("vehicles").delete().eq("id", id);
    if (error) throw error;
    return true;
  } catch (err: any) {
    console.warn("Deleting vehicle from local store fallback:", err.message || err);
    const local = getLocalVehicles().filter((v) => v.id !== id);
    saveLocalVehicles(local);
    return true;
  }
}
