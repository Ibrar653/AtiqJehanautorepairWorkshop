import { createClient } from "@/lib/supabase/client";
import type { Service, ServiceInsert, ServiceUpdate, ServiceUsageRecord } from "@/types/database";
import { getActiveWorkspaceId } from "./workspace-service";
import { generateUUID } from "@/lib/utils";

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

export function getLocalServices(): Service[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(LOCAL_SERVICES_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}
  return [];
}

export function saveLocalServices(services: Service[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LOCAL_SERVICES_KEY, JSON.stringify(services));
  } catch (e) {
    console.error("Failed to save local services", e);
  }
}

export async function getServices(
  activeOnly = false,
  searchQuery?: string,
  categoryFilter?: string,
  workspaceId?: string
): Promise<Service[]> {
  const targetWsId = workspaceId || getActiveWorkspaceId();
  const supabase = createClient();

  let query = supabase
    .from("services")
    .select("id, workspace_id, name, service_code, category, description, default_price, estimated_time, is_active, created_at, updated_at")
    .eq("workspace_id", targetWsId);

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
  if (error) {
    console.error("Failed to fetch services from Supabase:", error);
    throw error;
  }

  return (data || []) as Service[];
}

export async function createService(
  payload: ServiceInsert & { estimated_time?: string | null },
  workspaceId?: string
): Promise<Service> {
  const targetWsId = workspaceId || getActiveWorkspaceId();
  const supabase = createClient();
  const now = new Date().toISOString();

  const insertData = {
    id: (payload as any).id || generateUUID(),
    workspace_id: payload.workspace_id || targetWsId,
    name: payload.name.trim(),
    service_code: payload.service_code?.trim() || null,
    category: payload.category?.trim() || "General Maintenance",
    description: payload.description?.trim() || null,
    default_price: Number(payload.default_price) || 0,
    estimated_time: payload.estimated_time?.trim() || "45 mins",
    is_active: payload.is_active !== undefined ? payload.is_active : true,
    created_at: now,
    updated_at: now,
  };

  const { data, error } = await supabase
    .from("services")
    .insert(insertData)
    .select()
    .single();

  if (error) {
    console.error("Failed to create service in Supabase:", error);
    throw error;
  }
  return data as Service;
}

export async function updateService(
  id: string,
  payload: ServiceUpdate & { estimated_time?: string | null }
): Promise<Service> {
  const supabase = createClient();
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("services")
    .update({
      ...payload,
      updated_at: now,
    })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    console.error(`Failed to update service ${id} in Supabase:`, error);
    throw error;
  }
  return data as Service;
}

export async function toggleServiceStatus(id: string, currentStatus: boolean): Promise<Service> {
  return updateService(id, { is_active: !currentStatus });
}

export async function getServiceUsageCount(serviceId: string): Promise<number> {
  const supabase = createClient();
  const { count, error } = await supabase
    .from("job_card_items")
    .select("id", { count: "exact", head: true })
    .eq("service_id", serviceId);

  if (error) {
    console.error(`Failed to fetch service usage count for ${serviceId}:`, error);
    throw error;
  }
  return count || 0;
}

export async function deleteService(
  id: string,
  serviceName?: string
): Promise<{ success: boolean; deactivated: boolean; message: string }> {
  const usageCount = await getServiceUsageCount(id);

  if (usageCount > 0) {
    await updateService(id, { is_active: false });
    return {
      success: true,
      deactivated: true,
      message: "This service has existing Job Card history and cannot be permanently deleted. It has been deactivated instead.",
    };
  }

  const supabase = createClient();
  const { error } = await supabase.from("services").delete().eq("id", id);
  if (error) {
    console.error(`Failed to delete service ${id}:`, error);
    throw error;
  }

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

  const { data, error } = await supabase
    .from("job_card_items")
    .select(
      "id, quantity, unit_price, total_price, created_at, job_card:job_cards(id, job_card_number, invoice_number, date, customer:customers(name), vehicle:vehicles(make, model, registration_number))"
    )
    .eq("service_id", serviceId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error(`Failed to fetch service usage for ${serviceId}:`, error);
    throw error;
  }

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
}
