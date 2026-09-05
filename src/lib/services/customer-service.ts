import { createClient } from "@/lib/supabase/client";
import type { Customer, CustomerInsert, CustomerUpdate, Vehicle } from "@/types/database";
import { getLocalVehicles } from "./vehicle-service";
import { getActiveWorkspaceId } from "./workspace-service";
import { DEFAULT_WORKSPACE_ID } from "@/lib/constants";

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


const DEFAULT_INITIAL_CUSTOMERS: CustomerWithMetrics[] = [];

// Local storage fallback key for offline/demo operation
const LOCAL_STORAGE_KEY = "atiq_local_customers";
let inMemoryCustomers: CustomerWithMetrics[] = [];

// Known demo customer IDs to always purge
const TEST_CUSTOMER_IDS = new Set(["cust-demo-gulkhan", "cust-demo-ahmed", "cust-demo-sultan"]);

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
          // Auto-purge any legacy demo records (e.g. Gul Khan)
          const clean = parsed.filter(
            (c: any) => !TEST_CUSTOMER_IDS.has(c.id) && c.name !== "Gul Khan"
          );
          if (clean.length !== parsed.length) {
            localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(clean));
          }
          all = clean;
        }
      } else {
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify([]));
        all = [];
      }
    } catch {
      all = inMemoryCustomers;
    }
  }

  // Ensure in-memory is also sanitized
  inMemoryCustomers = inMemoryCustomers.filter(
    (c: any) => !TEST_CUSTOMER_IDS.has(c.id) && c.name !== "Gul Khan"
  );

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

export async function checkDuplicateCustomerPhone(phone: string, excludeCustomerId?: string) {
  if (!phone || !phone.trim()) return null;
  const cleaned = phone.trim();
  const digitsOnly = cleaned.replace(/\D/g, "");
  const supabase = createClient();
  try {
    const { data } = await supabase
      .from("customers")
      .select("id, name, mobile, email, address, notes")
      .eq("is_deleted", false)
      .limit(20);

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
    console.warn("Supabase checkDuplicateCustomerPhone fallback to local:", e);
  }

  // Check local fallback
  const local = getLocalCustomers().filter((c) => !c.is_deleted);
  const found = local.find((c) => {
    if (c.id === excludeCustomerId || !c.mobile) return false;
    const cDigits = c.mobile.replace(/\D/g, "");
    return (
      c.mobile.trim().toLowerCase() === cleaned.toLowerCase() ||
      (digitsOnly.length >= 7 && cDigits.endsWith(digitsOnly.slice(-7)))
    );
  });

  return found ? (found as Customer) : null;
}

export async function getCustomers(query?: string, page = 1, limit = 20, workspaceId?: string) {
  const targetWsId = workspaceId || getActiveWorkspaceId();
  const supabase = createClient();
  const offset = (page - 1) * limit;

  try {
    const fetchCustomersPromise = (async () => {
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

      return await dbQuery
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);
    })();

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Customer query timed out")), 2000)
    );

    const { data, count, error } = await Promise.race([fetchCustomersPromise, timeoutPromise]);

    if (error) throw error;

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

    saveLocalCustomers(customersWithMetrics, targetWsId);
    return { customers: customersWithMetrics, total: count || customersWithMetrics.length };
  } catch (err: any) {
    console.warn("Using local customer store fallback:", err.message || err);
    let local = getLocalCustomers(targetWsId).filter((c) => !c.is_deleted);
    const localVehicles = getLocalVehicles().filter((v) => !v.is_deleted);

    const { getLocalInvoices } = await import("./invoice-service");
    const allInvoices = getLocalInvoices().filter((inv) => !inv.is_void && inv.payment_status !== "void");

    // Attach vehicles and live outstanding balance to local customers
    local = local.map((c) => {
      const custVehs = localVehicles.filter((v) => v.customer_id === c.id);
      const custInvoices = allInvoices.filter((inv) => inv.customer_id === c.id);
      const outstandingBalance = custInvoices.reduce((sum, inv) => sum + (Number(inv.balance) || 0), 0);
      return {
        ...c,
        vehicles: custVehs,
        vehicles_count: custVehs.length,
        vehicles_summary: formatVehicleSummary(custVehs),
        primary_vehicle: custVehs[0] || null,
        outstanding_balance: outstandingBalance,
      };
    });

    if (query && query.trim()) {
      const q = query.trim().toLowerCase();
      local = local.filter((c) => {
        const matchesCustomer =
          c.name.toLowerCase().includes(q) ||
          (c.mobile && c.mobile.toLowerCase().includes(q)) ||
          (c.email && c.email.toLowerCase().includes(q)) ||
          (c.trn_number && c.trn_number.toLowerCase().includes(q)) ||
          (c.company_name && c.company_name.toLowerCase().includes(q));

        const matchesVehicle = (c.vehicles || []).some(
          (v) =>
            v.make.toLowerCase().includes(q) ||
            v.model.toLowerCase().includes(q) ||
            (v.registration_number && v.registration_number.toLowerCase().includes(q)) ||
            (v.chassis_vin && v.chassis_vin.toLowerCase().includes(q))
        );

        return matchesCustomer || matchesVehicle;
      });
    }

    const paged = local.slice(offset, offset + limit);
    return { customers: paged, total: local.length };
  }
}

export async function getCustomerById(id: string, workspaceId?: string): Promise<CustomerWithMetrics | null> {
  const targetWsId = workspaceId || getActiveWorkspaceId();
  const supabase = createClient();
  try {
    const fetchPromise = supabase
      .from("customers")
      .select("*, vehicles(*), invoices(balance)")
      .eq("id", id)
      .eq("workspace_id", targetWsId)
      .single();

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("getCustomerById timed out")), 1500)
    );

    const { data: customer, error } = await Promise.race([fetchPromise, timeoutPromise]);

    if (error) throw error;

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
  } catch (err: any) {
    console.warn(`Reading customer ${id} from local fallback:`, err.message || err);
    const local = getLocalCustomers(targetWsId);
    const found = local.find((c) => c.id === id);
    if (found) {
      const allVehicles = getLocalVehicles().filter((v) => v.customer_id === id && !v.is_deleted);
      const { getLocalInvoices } = await import("./invoice-service");
      const allInvoices = getLocalInvoices(targetWsId).filter(
        (inv) => inv.customer_id === id && !inv.is_void && inv.payment_status !== "void"
      );
      const outstandingBalance = allInvoices.reduce((sum, inv) => sum + (Number(inv.balance) || 0), 0);
      return {
        ...found,
        vehicles: allVehicles,
        vehicles_count: allVehicles.length,
        vehicles_summary: formatVehicleSummary(allVehicles),
        primary_vehicle: allVehicles[0] || null,
        outstanding_balance: outstandingBalance,
      };
    }

    return null;
  }
}

export async function createCustomer(payload: CustomerInsert, workspaceId?: string) {
  const targetWsId = workspaceId || getActiveWorkspaceId();
  const supabase = createClient();
  try {
    const { data, error } = await supabase
      .from("customers")
      .insert({ ...payload, workspace_id: targetWsId, is_deleted: false })
      .select()
      .single();

    if (error) throw error;
    return data as Customer;
  } catch (err: any) {
    console.warn("Creating customer in local store fallback:", err.message || err);
    const newCustomer: CustomerWithMetrics = {
      id: "cust-" + Date.now() + "-" + Math.random().toString(36).substring(2, 7),
      workspace_id: targetWsId,
      name: payload.name,
      mobile: payload.mobile || null,
      email: payload.email || null,
      address: payload.address || null,
      company_name: payload.company_name || null,
      trn_number: payload.trn_number || null,
      notes: payload.notes || null,
      is_deleted: false,
      deleted_at: null,
      deleted_by: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      created_by: payload.created_by || null,
      vehicles: [],
      vehicles_count: 0,
      vehicles_summary: "No Vehicles",
      outstanding_balance: 0,
    };

    const local = getLocalCustomers(targetWsId);
    local.unshift(newCustomer);
    saveLocalCustomers(local, targetWsId);
    return newCustomer;
  }
}

export async function updateCustomer(id: string, payload: CustomerUpdate, workspaceId?: string) {
  const targetWsId = workspaceId || getActiveWorkspaceId();
  const supabase = createClient();
  try {
    const { data, error } = await supabase
      .from("customers")
      .update(payload)
      .eq("id", id)
      .eq("workspace_id", targetWsId)
      .select()
      .single();

    if (error) throw error;
    return data as Customer;
  } catch (err: any) {
    console.warn("Updating customer in local store fallback:", err.message || err);
    const local = getLocalCustomers(targetWsId);
    const idx = local.findIndex((c) => c.id === id);
    if (idx !== -1) {
      local[idx] = {
        ...local[idx],
        ...payload,
        updated_at: new Date().toISOString(),
      };
      saveLocalCustomers(local, targetWsId);
      return local[idx];
    }
    throw new Error(`Error updating customer ${id}: ${err.message || err}`);
  }
}

export async function deleteCustomer(id: string, workspaceId?: string) {
  const targetWsId = workspaceId || getActiveWorkspaceId();
  const supabase = createClient();
  try {
    const { error } = await supabase
      .from("customers")
      .delete()
      .eq("id", id)
      .eq("workspace_id", targetWsId);
    if (error) throw error;
    return true;
  } catch (err: any) {
    console.warn("Deleting customer from local store fallback:", err.message || err);
    const local = getLocalCustomers(targetWsId).filter((c) => c.id !== id);
    saveLocalCustomers(local, targetWsId);
    return true;
  }
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
