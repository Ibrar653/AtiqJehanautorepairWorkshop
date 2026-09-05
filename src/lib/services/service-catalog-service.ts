import { createClient } from "@/lib/supabase/client";
import type { Service, ServiceInsert, ServiceUpdate, ServiceUsageRecord } from "@/types/database";
import { getLocalJobCards } from "./job-card-service";

const LOCAL_SERVICES_KEY = "atiq_local_services";

export const SERVICE_CATEGORIES = [
  "Engine",
  "AC",
  "Brakes",
  "Suspension",
  "Electrical",
  "Transmission",
  "General Maintenance",
  "Other",
] as const;

// Default initial workshop services catalog
const DEFAULT_SERVICES: Service[] = [
  { id: "srv-1", name: "Periodic Engine Oil & Filter Change", service_code: "ENG-OIL-01", category: "Engine", description: "Synthetic engine oil replacement with OEM oil filter", default_price: 250, estimated_time: "45 mins", is_active: true, created_at: "2026-01-15T08:00:00.000Z", updated_at: "2026-01-15T08:00:00.000Z", usage_count: 47 },
  { id: "srv-2", name: "Brake Pads Replacement (Front/Rear)", service_code: "BRK-PAD-01", category: "Brakes", description: "Front or rear brake pad replacement with disc inspection", default_price: 180, estimated_time: "1 hr", is_active: true, created_at: "2026-01-16T08:00:00.000Z", updated_at: "2026-01-16T08:00:00.000Z", usage_count: 32 },
  { id: "srv-3", name: "AC Diagnostic & Gas Refill", service_code: "AC-GAS-01", category: "AC", description: "R134a AC gas recharging and pressure leak test", default_price: 150, estimated_time: "45 mins", is_active: true, created_at: "2026-01-17T08:00:00.000Z", updated_at: "2026-01-17T08:00:00.000Z", usage_count: 28 },
  { id: "srv-4", name: "Computerized Engine Diagnostics (OBD-II)", service_code: "ENG-DIAG-01", category: "Electrical", description: "Full vehicle electronic system scan and error code report", default_price: 120, estimated_time: "30 mins", is_active: true, created_at: "2026-01-18T08:00:00.000Z", updated_at: "2026-01-18T08:00:00.000Z", usage_count: 19 },
  { id: "srv-5", name: "Wheel Alignment & Balancing", service_code: "SUSP-ALN-01", category: "Suspension", description: "4-wheel laser alignment and dynamic wheel balancing", default_price: 160, estimated_time: "45 mins", is_active: true, created_at: "2026-01-19T08:00:00.000Z", updated_at: "2026-01-19T08:00:00.000Z", usage_count: 24 },
  { id: "srv-6", name: "Spark Plugs Replacement", service_code: "ENG-PLUG-01", category: "Engine", description: "Iridium/Platinum spark plug set installation", default_price: 200, estimated_time: "1 hr", is_active: true, created_at: "2026-01-20T08:00:00.000Z", updated_at: "2026-01-20T08:00:00.000Z", usage_count: 14 },
  { id: "srv-7", name: "Engine Overhaul / Major Repair", service_code: "ENG-MAJ-01", category: "Engine", description: "Complete engine disassembly, head resurfacing, and reassembly", default_price: 2500, estimated_time: "2-3 days", is_active: true, created_at: "2026-01-21T08:00:00.000Z", updated_at: "2026-01-21T08:00:00.000Z", usage_count: 6 },
  { id: "srv-8", name: "Transmission Fluid Flush", service_code: "TRN-FLUSH-01", category: "Transmission", description: "Automatic transmission fluid drain and refill with filter replacement", default_price: 350, estimated_time: "1.5 hrs", is_active: true, created_at: "2026-01-22T08:00:00.000Z", updated_at: "2026-01-22T08:00:00.000Z", usage_count: 11 },
];

let inMemoryServices: Service[] = [...DEFAULT_SERVICES];

export function getLocalServices(): Service[] {
  if (typeof window === "undefined") return inMemoryServices;
  try {
    const raw = localStorage.getItem(LOCAL_SERVICES_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
    localStorage.setItem(LOCAL_SERVICES_KEY, JSON.stringify(DEFAULT_SERVICES));
    return inMemoryServices.length > 0 ? inMemoryServices : DEFAULT_SERVICES;
  } catch {
    return inMemoryServices.length > 0 ? inMemoryServices : DEFAULT_SERVICES;
  }
}

export function saveLocalServices(services: Service[]) {
  inMemoryServices = services;
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LOCAL_SERVICES_KEY, JSON.stringify(services));
  } catch (e) {
    console.error("Failed to save local services", e);
  }
}

// Calculate usage counts from Job Cards
function attachUsageCounts(services: Service[]): Service[] {
  if (typeof window === "undefined") return services;
  try {
    const localJobCardsRaw = localStorage.getItem("atiq_local_job_cards");
    if (!localJobCardsRaw) return services;
    const jobCards: any[] = JSON.parse(localJobCardsRaw);

    const counts: Record<string, number> = {};
    jobCards.forEach((jc) => {
      if (Array.isArray(jc.items)) {
        jc.items.forEach((it: any) => {
          if (it.service_id) {
            counts[it.service_id] = (counts[it.service_id] || 0) + 1;
          } else if (it.description) {
            const match = services.find((s) => s.name.toLowerCase() === it.description.toLowerCase());
            if (match) {
              counts[match.id] = (counts[match.id] || 0) + 1;
            }
          }
        });
      }
    });

    return services.map((s) => ({
      ...s,
      usage_count: (s.usage_count || 0) + (counts[s.id] || 0),
    }));
  } catch {
    return services;
  }
}

function withTimeout<T>(promise: PromiseLike<T>, timeoutMs = 2000): Promise<T> {
  return Promise.race([
    Promise.resolve(promise),
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error("Service query timed out")), timeoutMs)
    ),
  ]);
}

export async function getServices(
  activeOnly = false,
  searchQuery?: string,
  categoryFilter?: string
): Promise<Service[]> {
  const supabase = createClient();
  try {
    const fetchWithTimeout = async () => {
      let query = supabase
        .from("services")
        .select("id, name, service_code, category, description, default_price, estimated_time, is_active, created_at, updated_at");

      if (activeOnly) {
        query = query.eq("is_active", true);
      }

      if (categoryFilter && categoryFilter !== "all") {
        query = query.eq("category", categoryFilter);
      }

      if (searchQuery && searchQuery.trim()) {
        const q = searchQuery.trim();
        query = query.or(`name.ilike.%${q}%,service_code.ilike.%${q}%,category.ilike.%${q}%,description.ilike.%${q}%`);
      }

      const { data, error } = await query.order("name");
      if (error) throw error;
      return data as Service[];
    };

    const data = await withTimeout(fetchWithTimeout(), 2000);
    const listWithUsage = attachUsageCounts(data);
    saveLocalServices(listWithUsage);
    return listWithUsage;
  } catch (err: any) {
    console.warn("Using local services catalog fallback:", err.message || err);
    let list = getLocalServices();

    if (activeOnly) {
      list = list.filter((s) => s.is_active);
    }

    if (categoryFilter && categoryFilter !== "all") {
      list = list.filter((s) => s.category?.toLowerCase() === categoryFilter.toLowerCase());
    }

    if (searchQuery && searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          (s.service_code && s.service_code.toLowerCase().includes(q)) ||
          (s.category && s.category.toLowerCase().includes(q)) ||
          (s.description && s.description.toLowerCase().includes(q))
      );
    }

    return attachUsageCounts(list);
  }
}

export async function createService(payload: ServiceInsert & { estimated_time?: string | null }): Promise<Service> {
  const supabase = createClient();
  const now = new Date().toISOString();
  try {
    const fetchWithTimeout = async () => {
      const { data, error } = await supabase
        .from("services")
        .insert({
          name: payload.name.trim(),
          service_code: payload.service_code?.trim() || null,
          category: payload.category?.trim() || "General Maintenance",
          description: payload.description?.trim() || null,
          default_price: Number(payload.default_price) || 0,
          estimated_time: payload.estimated_time?.trim() || "45 mins",
          is_active: payload.is_active !== undefined ? payload.is_active : true,
          created_at: now,
          updated_at: now,
        })
        .select()
        .single();

      if (error) throw error;
      return data as Service;
    };

    const created = await withTimeout(fetchWithTimeout(), 2000);
    const list = getLocalServices();
    list.unshift({ ...created, usage_count: 0 });
    saveLocalServices(list);
    return created;
  } catch (err: any) {
    console.warn("Creating service in local fallback store:", err.message || err);
    const newService: Service = {
      id: "srv-" + Date.now() + "-" + Math.random().toString(36).substring(2, 6),
      name: payload.name.trim(),
      service_code: payload.service_code?.trim() || null,
      category: payload.category?.trim() || "General Maintenance",
      description: payload.description?.trim() || null,
      default_price: Number(payload.default_price) || 0,
      estimated_time: payload.estimated_time?.trim() || "45 mins",
      is_active: payload.is_active !== undefined ? payload.is_active : true,
      created_at: now,
      updated_at: now,
      usage_count: 0,
    };

    const list = getLocalServices();
    list.unshift(newService);
    saveLocalServices(list);
    return newService;
  }
}

export async function updateService(id: string, payload: ServiceUpdate & { estimated_time?: string | null }): Promise<Service> {
  const supabase = createClient();
  const now = new Date().toISOString();
  try {
    const fetchWithTimeout = async () => {
      const { data, error } = await supabase
        .from("services")
        .update({
          ...payload,
          updated_at: now,
        })
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data as Service;
    };

    const updated = await withTimeout(fetchWithTimeout(), 2000);
    const list = getLocalServices();
    const idx = list.findIndex((s) => s.id === id);
    if (idx !== -1) {
      list[idx] = { ...list[idx], ...updated };
      saveLocalServices(list);
    }
    return updated;
  } catch (err: any) {
    console.warn("Updating service in local fallback store:", err.message || err);
    const list = getLocalServices();
    const idx = list.findIndex((s) => s.id === id);
    if (idx !== -1) {
      list[idx] = {
        ...list[idx],
        ...payload,
        updated_at: now,
      };
      saveLocalServices(list);
      return list[idx];
    }
    throw err;
  }
}

export async function toggleServiceStatus(id: string, currentStatus: boolean): Promise<Service> {
  return updateService(id, { is_active: !currentStatus });
}

export async function getServiceUsageCount(serviceId: string, serviceName?: string): Promise<number> {
  const supabase = createClient();
  try {
    const fetchWithTimeout = async () => {
      let q = supabase
        .from("job_card_items")
        .select("id", { count: "exact", head: true })
        .eq("service_id", serviceId);

      const { count, error } = await q;
      if (error) throw error;
      return count || 0;
    };

    return await withTimeout(fetchWithTimeout(), 1500);
  } catch {
    const localJobCards = getLocalJobCards();
    let count = 0;
    localJobCards.forEach((jc) => {
      if (Array.isArray(jc.items)) {
        jc.items.forEach((it: any) => {
          if (it.service_id === serviceId) count++;
          else if (serviceName && it.description && it.description.toLowerCase() === serviceName.toLowerCase()) count++;
        });
      }
    });
    return count;
  }
}

export async function deleteService(
  id: string,
  serviceName?: string
): Promise<{ success: boolean; deactivated: boolean; message: string }> {
  const usageCount = await getServiceUsageCount(id, serviceName);

  if (usageCount > 0) {
    await updateService(id, { is_active: false });
    return {
      success: true,
      deactivated: true,
      message: "This service has existing Job Card history and cannot be permanently deleted. It has been deactivated instead.",
    };
  }

  const supabase = createClient();
  try {
    const fetchWithTimeout = async () => {
      const { error } = await supabase.from("services").delete().eq("id", id);
      if (error) throw error;
    };
    await withTimeout(fetchWithTimeout(), 2000);
  } catch (e: any) {
    console.warn("Deleting service in local store fallback:", e.message || e);
  }

  const list = getLocalServices().filter((s) => s.id !== id);
  saveLocalServices(list);

  return {
    success: true,
    deactivated: false,
    message: "Service permanently deleted.",
  };
}

export async function getServiceUsage(
  serviceId: string,
  serviceName?: string
): Promise<ServiceUsageRecord[]> {
  const supabase = createClient();
  try {
    const fetchWithTimeout = async () => {
      let q = supabase
        .from("job_card_items")
        .select(
          "id, quantity, unit_price, total_price, created_at, job_card:job_cards(id, job_card_number, invoice_number, date, customer:customers(name), vehicle:vehicles(make, model, registration_number))"
        )
        .eq("service_id", serviceId)
        .order("created_at", { ascending: false });

      const { data, error } = await q;
      if (error) throw error;
      return (data || []).map((row: any) => ({
        job_card_id: row.job_card?.id || "",
        job_card_number: row.job_card?.job_card_number || "N/A",
        date: row.job_card?.date || row.created_at,
        customer_name: row.job_card?.customer?.name || "Unknown Customer",
        vehicle_make_model: row.job_card?.vehicle ? `${row.job_card.vehicle.make} ${row.job_card.vehicle.model}` : "N/A",
        registration_number: row.job_card?.vehicle?.registration_number || "No Plate",
        unit_price: Number(row.unit_price) || 0,
        total_price: Number(row.total_price) || 0,
      }));
    };

    return await withTimeout(fetchWithTimeout(), 2000);
  } catch (err: any) {
    console.warn("Using local job cards for service usage history:", err.message || err);
    const localJobCards = getLocalJobCards();
    const records: ServiceUsageRecord[] = [];

    localJobCards.forEach((jc) => {
      if (Array.isArray(jc.items)) {
        jc.items.forEach((it: any) => {
          const isMatch = it.service_id === serviceId || (serviceName && it.description && it.description.toLowerCase() === serviceName.toLowerCase());
          if (isMatch) {
            records.push({
              job_card_id: jc.id,
              job_card_number: jc.job_card_number || "N/A",
              date: jc.date || jc.created_at,
              customer_name: jc.customer?.name || "Unknown Customer",
              vehicle_make_model: jc.vehicle ? `${jc.vehicle.make} ${jc.vehicle.model}` : "N/A",
              registration_number: jc.vehicle?.registration_number || "No Plate",
              unit_price: Number(it.unit_price) || 0,
              total_price: Number(it.total_price) || 0,
            });
          }
        });
      }
    });

    return records;
  }
}
