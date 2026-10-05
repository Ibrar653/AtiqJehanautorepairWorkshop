import { createClient } from "@/lib/supabase/client";
import type { Customer, CustomerInsert, CustomerUpdate, Vehicle } from "@/types/database";
import { getActiveWorkspaceId } from "./workspace-service";
import { DEFAULT_WORKSPACE_ID } from "@/lib/constants";
import { generateUUID } from "@/lib/utils";
import { getLocalVehicles } from "./vehicle-service";

export interface CustomerWithMetrics extends Customer {
  vehicles?: Vehicle[];
  vehicles_count?: number;
  vehicles_summary?: string;
  primary_vehicle?: Vehicle | null;
  outstanding_balance?: number;
}

export interface UnifiedSearchResult {
  key: string;
  customer: Customer;
  vehicle?: Vehicle | null;
  matchType: "customer_name" | "customer_phone" | "customer_trn" | "vehicle_vin" | "vehicle_reg" | "vehicle_model" | "general";
}

// In-memory LRU cache for unified search
const searchCache = new Map<string, { timestamp: number; data: UnifiedSearchResult[] }>();
const CACHE_TTL_MS = 30000; // 30 seconds cache

export function clearSearchCache() {
  searchCache.clear();
}

// Local storage key preserved strictly for Recovery/Migration inspection tools
const LOCAL_STORAGE_KEY = "atiq_local_customers";
let inMemoryCustomers: CustomerWithMetrics[] = [];

export function getLocalCustomers(workspaceId?: string): CustomerWithMetrics[] {
  const targetWsId = workspaceId || getActiveWorkspaceId();
  let all: CustomerWithMetrics[] = [];
  if (typeof window === "undefined") {
    all = inMemoryCustomers;
  } else {
    try {
      const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (raw !== null) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          all = parsed;
        }
      }
    } catch {
      all = inMemoryCustomers;
    }
  }

  return all.filter(
    (c) => c.workspace_id === targetWsId || (!c.workspace_id && targetWsId === DEFAULT_WORKSPACE_ID)
  );
}

export function saveLocalCustomers(customers: CustomerWithMetrics[], workspaceId?: string) {
  const targetWsId = workspaceId || getActiveWorkspaceId();
  let allExisting: CustomerWithMetrics[] = [];
  if (typeof window !== "undefined") {
    try {
      const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (raw !== null) {
        allExisting = JSON.parse(raw);
      } else {
        allExisting = inMemoryCustomers;
      }
    } catch {
      allExisting = inMemoryCustomers;
    }
  } else {
    allExisting = inMemoryCustomers;
  }
  const others = allExisting.filter((c) => c.workspace_id && c.workspace_id !== targetWsId);
  const taggedCustomers = customers.map((c) => ({
    ...c,
    workspace_id: c.workspace_id || targetWsId,
  }));
  const merged = [...taggedCustomers, ...others];
  inMemoryCustomers = merged;
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(merged));
    } catch (e) {
      console.error("Failed to save local customers", e);
    }
  }
}

export function formatVehicleSummary(vehicles: Vehicle[] = []): string {
  const activeVehicles = vehicles.filter((v) => !v.is_deleted);
  if (!activeVehicles || activeVehicles.length === 0) return "No Vehicles";
  const first = activeVehicles[0];
  const firstName = `${first.make || ""} ${first.model || ""}`.trim() || "Vehicle";
  const plate = first.registration_number ? ` (${first.registration_number})` : "";

  if (activeVehicles.length === 1) {
    return `${firstName}${plate}`;
  }
  return `${firstName} +${activeVehicles.length - 1} more`;
}

export async function checkDuplicateCustomerPhone(phone: string, excludeCustomerId?: string, workspaceId?: string) {
  if (!phone || !phone.trim()) return null;
  const targetWsId = workspaceId || getActiveWorkspaceId();
  const cleaned = phone.trim();
  const digitsOnly = cleaned.replace(/\D/g, "");
  const supabase = createClient();
  try {
    const { data, error } = await supabase
      .from("customers")
      .select("id, name, mobile, email, address, notes")
      .eq("workspace_id", targetWsId)
      .eq("is_deleted", false)
      .limit(50);

    if (error) throw error;

    if (data && data.length > 0) {
      const match = data.find((c) => {
        if (c.id === excludeCustomerId || !c.mobile) return false;
        const cDigits = c.mobile.replace(/\D/g, "");
        return (
          c.mobile.trim().toLowerCase() === cleaned.toLowerCase() ||
          (digitsOnly.length >= 7 && cDigits.endsWith(digitsOnly.slice(-7)))
        );
      });
      if (match) return match as Customer;
    }
  } catch (e) {
    console.error("Error checking duplicate phone in Supabase:", e);
  }

  return null;
}

export async function getCustomers(query?: string, page = 1, limit = 20, workspaceId?: string) {
  const targetWsId = workspaceId || getActiveWorkspaceId();
  const supabase = createClient();
  const offset = (page - 1) * limit;

  let dbQuery = supabase
    .from("customers")
    .select(
      "id, name, mobile, email, address, company_name, trn_number, notes, workspace_id, is_deleted, created_at, updated_at, vehicles(id, make, model, year, registration_number, chassis_vin, color, mileage, is_deleted), invoices(balance)",
      { count: "exact" }
    )
    .eq("is_deleted", false)
    .eq("workspace_id", targetWsId);

  if (query && query.trim()) {
    const q = query.trim();
    dbQuery = dbQuery.or(`name.ilike.%${q}%,mobile.ilike.%${q}%,email.ilike.%${q}%,trn_number.ilike.%${q}%,company_name.ilike.%${q}%`);
  }

  const { data, count, error } = await dbQuery
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    console.error("Failed to query customers from Supabase:", error);
    throw new Error(`Failed to load customers from cloud database: ${error.message}`);
  }

  const customersWithMetrics: CustomerWithMetrics[] = (data || []).map((c: any) => {
    const activeVehicles = (c.vehicles || []).filter((v: any) => !v.is_deleted);
    const totalBalance = (c.invoices || []).reduce(
      (sum: number, inv: any) => sum + (Number(inv.balance) || 0),
      0
    );
    return {
      ...c,
      vehicles: activeVehicles,
      vehicles_count: activeVehicles.length,
      vehicles_summary: formatVehicleSummary(activeVehicles),
      primary_vehicle: activeVehicles[0] || null,
      outstanding_balance: totalBalance,
    };
  });

  return { customers: customersWithMetrics, total: count !== null ? count : customersWithMetrics.length };
}

export async function getCustomerById(id: string, workspaceId?: string): Promise<CustomerWithMetrics | null> {
  const targetWsId = workspaceId || getActiveWorkspaceId();
  const supabase = createClient();

  const { data: customer, error } = await supabase
    .from("customers")
    .select("*, vehicles(*), invoices(balance)")
    .eq("id", id)
    .eq("workspace_id", targetWsId)
    .maybeSingle();

  if (error) {
    console.error(`Error loading customer ${id} from Supabase:`, error);
    throw new Error(`Failed to load customer details: ${error.message}`);
  }

  if (!customer || customer.is_deleted) return null;

  const activeVehicles = (customer.vehicles || []).filter((v: any) => !v.is_deleted);
  const totalBalance = (customer.invoices || []).reduce(
    (sum: number, inv: any) => sum + (Number(inv.balance) || 0),
    0
  );

  return {
    ...customer,
    vehicles: activeVehicles,
    vehicles_count: activeVehicles.length,
    vehicles_summary: formatVehicleSummary(activeVehicles),
    primary_vehicle: activeVehicles[0] || null,
    outstanding_balance: totalBalance,
  };
}

export async function createCustomer(payload: CustomerInsert, workspaceId?: string): Promise<Customer> {
  const targetWsId = payload.workspace_id || workspaceId || getActiveWorkspaceId();
  const supabase = createClient();
  const customerId = (payload as any).id && (payload as any).id.length > 20 ? (payload as any).id : generateUUID();
  const now = new Date().toISOString();

  const insertPayload = {
    ...payload,
    id: customerId,
    workspace_id: targetWsId,
    is_deleted: false,
    deleted_at: null,
    deleted_by: null,
    created_at: now,
    updated_at: now,
  };

  const { data, error } = await supabase
    .from("customers")
    .insert(insertPayload)
    .select()
    .single();

  if (error) {
    console.error("Supabase customer creation failed:", error);
    throw new Error(`Could not save Customer to cloud database: ${error.message}. No data was saved locally.`);
  }

  clearSearchCache();
  return data as Customer;
}

export async function updateCustomer(id: string, payload: CustomerUpdate, workspaceId?: string): Promise<Customer> {
  const targetWsId = workspaceId || getActiveWorkspaceId();
  const supabase = createClient();
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("customers")
    .update({ ...payload, updated_at: now })
    .eq("id", id)
    .eq("workspace_id", targetWsId)
    .select()
    .single();

  if (error) {
    console.error(`Supabase customer update failed for ${id}:`, error);
    throw new Error(`Could not update Customer in cloud database: ${error.message}.`);
  }

  clearSearchCache();
  return data as Customer;
}

export async function deleteCustomer(id: string, workspaceId?: string): Promise<boolean> {
  const targetWsId = workspaceId || getActiveWorkspaceId();
  const supabase = createClient();
  const now = new Date().toISOString();

  const { error } = await supabase
    .from("customers")
    .update({ is_deleted: true, deleted_at: now })
    .eq("id", id)
    .eq("workspace_id", targetWsId);

  if (error) {
    console.error(`Supabase customer delete failed for ${id}:`, error);
    throw new Error(`Could not delete Customer from cloud database: ${error.message}.`);
  }

  clearSearchCache();
  return true;
}

export async function searchCustomersAndVehicles(
  query: string,
  limit = 15,
  workspaceId?: string
): Promise<UnifiedSearchResult[]> {
  if (!query || !query.trim()) return [];
  const targetWsId = workspaceId || getActiveWorkspaceId();
  const q = query.trim();
  const qLower = q.toLowerCase();
  const cacheKey = `${targetWsId}_${qLower}`;

  // Check in-memory cache
  const cached = searchCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

  const supabase = createClient();
  const results: UnifiedSearchResult[] = [];
  const seenKeys = new Set<string>();

  try {
    const searchPromise = (async () => {
      // 1. Search customers in this workspace (not deleted)
      const { data: customers } = await supabase
        .from("customers")
        .select("id, name, mobile, email, address, company_name, trn_number, notes, workspace_id, created_at, updated_at, created_by, is_deleted, vehicles(id, customer_id, make, model, year, color, chassis_vin, registration_number, mileage, notes, is_deleted)")
        .eq("is_deleted", false)
        .eq("workspace_id", targetWsId)
        .or(`name.ilike.%${q}%,mobile.ilike.%${q}%,trn_number.ilike.%${q}%,company_name.ilike.%${q}%`)
        .limit(limit);

      if (customers) {
        for (const c of customers) {
          const activeVehicles = (c.vehicles || []).filter((v: any) => !v.is_deleted);
          const matchType: UnifiedSearchResult["matchType"] =
            c.trn_number && c.trn_number.toLowerCase().includes(qLower)
              ? "customer_trn"
              : c.name.toLowerCase().includes(qLower)
              ? "customer_name"
              : "customer_phone";

          if (activeVehicles.length > 0) {
            for (const v of activeVehicles) {
              const key = `cust-${c.id}-veh-${v.id}`;
              if (!seenKeys.has(key)) {
                seenKeys.add(key);
                results.push({
                  key,
                  customer: c as unknown as Customer,
                  vehicle: v as unknown as Vehicle,
                  matchType,
                });
              }
            }
          } else {
            const key = `cust-${c.id}`;
            if (!seenKeys.has(key)) {
              seenKeys.add(key);
              results.push({
                key,
                customer: c as unknown as Customer,
                vehicle: null,
                matchType,
              });
            }
          }
        }
      }

      // 2. Search vehicles by VIN, Plate, Make/Model (not deleted, filtered by customer workspace)
      const { data: vehicles } = await supabase
        .from("vehicles")
        .select("id, customer_id, make, model, year, color, chassis_vin, registration_number, mileage, notes, is_deleted, customer:customers!inner(id, name, mobile, email, address, company_name, trn_number, notes, workspace_id, is_deleted)")
        .eq("is_deleted", false)
        .eq("customer.workspace_id", targetWsId)
        .or(`chassis_vin.ilike.%${q}%,registration_number.ilike.%${q}%,make.ilike.%${q}%,model.ilike.%${q}%`)
        .limit(limit);

      if (vehicles) {
        for (const v of vehicles) {
          const c = v.customer as unknown as Customer;
          if (!c || c.is_deleted) continue;

          let matchType: UnifiedSearchResult["matchType"] = "general";
          if (v.chassis_vin && v.chassis_vin.toLowerCase().includes(qLower)) {
            matchType = "vehicle_vin";
          } else if (v.registration_number && v.registration_number.toLowerCase().includes(qLower)) {
            matchType = "vehicle_reg";
          } else if (
            v.make.toLowerCase().includes(qLower) ||
            v.model.toLowerCase().includes(qLower)
          ) {
            matchType = "vehicle_model";
          }

          const key = `cust-${c.id}-veh-${v.id}`;
          if (!seenKeys.has(key)) {
            seenKeys.add(key);
            results.push({
              key,
              customer: c as unknown as Customer,
              vehicle: v as unknown as Vehicle,
              matchType,
            });
          }
        }
      }

      return results;
    })();

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Search query timed out")), 1500)
    );

    const data = await Promise.race([searchPromise, timeoutPromise]);
    if (data && data.length > 0) {
      searchCache.set(cacheKey, { timestamp: Date.now(), data: data.slice(0, limit) });
      return data.slice(0, limit);
    }
  } catch (err: any) {
    console.warn("searchCustomersAndVehicles Supabase fallback to local:", err.message || err);
  }

  // Local storage search fallback
  const localCustomers = getLocalCustomers(targetWsId).filter((c) => !c.is_deleted);
  const localVehicles = getLocalVehicles().filter((v) => !v.is_deleted);

  for (const c of localCustomers) {
    const cMatchesName = c.name.toLowerCase().includes(qLower);
    const cMatchesPhone = c.mobile && c.mobile.toLowerCase().includes(qLower);
    const cMatchesTrn = c.trn_number && c.trn_number.toLowerCase().includes(qLower);
    const custVehicles = localVehicles.filter((v) => v.customer_id === c.id);

    if (cMatchesName || cMatchesPhone || cMatchesTrn) {
      const matchType = cMatchesTrn ? "customer_trn" : cMatchesName ? "customer_name" : "customer_phone";
      if (custVehicles.length > 0) {
        for (const v of custVehicles) {
          const key = `cust-${c.id}-veh-${v.id}`;
          if (!seenKeys.has(key)) {
            seenKeys.add(key);
            results.push({
              key,
              customer: c,
              vehicle: v,
              matchType,
            });
          }
        }
      } else {
        const key = `cust-${c.id}`;
        if (!seenKeys.has(key)) {
          seenKeys.add(key);
          results.push({
            key,
            customer: c,
            vehicle: null,
            matchType,
          });
        }
      }
    }
  }

  for (const v of localVehicles) {
    const vMatchesVin = v.chassis_vin && v.chassis_vin.toLowerCase().includes(qLower);
    const vMatchesReg = v.registration_number && v.registration_number.toLowerCase().includes(qLower);
    const vMatchesModel = v.make.toLowerCase().includes(qLower) || v.model.toLowerCase().includes(qLower);

    if (vMatchesVin || vMatchesReg || vMatchesModel) {
      const parentCustomer = localCustomers.find((c) => c.id === v.customer_id);
      if (parentCustomer) {
        const key = `cust-${parentCustomer.id}-veh-${v.id}`;
        if (!seenKeys.has(key)) {
          seenKeys.add(key);
          results.push({
            key,
            customer: parentCustomer,
            vehicle: v,
            matchType: vMatchesVin ? "vehicle_vin" : vMatchesReg ? "vehicle_reg" : "vehicle_model",
          });
        }
      }
    }
  }

  searchCache.set(cacheKey, { timestamp: Date.now(), data: results.slice(0, limit) });
  return results.slice(0, limit);
}
