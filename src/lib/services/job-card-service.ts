import { createClient } from "@/lib/supabase/client";
import type {
  JobCard,
  JobCardInsert,
  JobCardUpdate,
  JobCardWithRelations,
  JobCardStatus,
  Customer,
  Vehicle,
  JobCardItem,
  JobCardQueryOptions,
} from "@/types/database";
export type { JobCardQueryOptions };
import { getCustomerById, getLocalCustomers } from "./customer-service";
import { getVehicleById, getLocalVehicles } from "./vehicle-service";
import { getPartById, getLocalParts } from "./parts-service";
import { recordStockTransaction } from "./inventory-service";
import { getActiveWorkspaceId } from "./workspace-service";
import { DEFAULT_WORKSPACE_ID } from "@/lib/constants";
import { generateUUID } from "@/lib/utils";


const LOCAL_JOB_CARDS_KEY = "atiq_local_job_cards";

// In-memory fallback
let inMemoryJobCards: JobCardWithRelations[] = [];

export function getLocalJobCards(workspaceId?: string): any[] {
  const targetWsId = workspaceId || getActiveWorkspaceId();
  let all: any[] = [];
  if (typeof window === "undefined") {
    all = inMemoryJobCards;
  } else {
    try {
      const raw = localStorage.getItem(LOCAL_JOB_CARDS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) all = parsed;
      }
    } catch {}
    if (all.length === 0) all = inMemoryJobCards;
  }
  return all.filter(
    (j) => j.workspace_id === targetWsId || (!j.workspace_id && targetWsId === DEFAULT_WORKSPACE_ID)
  );
}

export function saveLocalJobCards(cards: any[], workspaceId?: string) {
  const targetWsId = workspaceId || getActiveWorkspaceId();
  let allExisting: any[] = [];
  if (typeof window !== "undefined") {
    try {
      const raw = localStorage.getItem(LOCAL_JOB_CARDS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) allExisting = parsed;
      }
    } catch {}
  }
  if (allExisting.length === 0) allExisting = inMemoryJobCards;
  const others = allExisting.filter((j) => j.workspace_id && j.workspace_id !== targetWsId);
  const taggedCards = cards.map((c) => ({
    ...c,
    workspace_id: c.workspace_id || targetWsId,
  }));
  const merged = [...taggedCards, ...others];
  inMemoryJobCards = merged;
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(LOCAL_JOB_CARDS_KEY, JSON.stringify(merged));
    } catch (e) {
      console.error("Failed to save local job cards", e);
    }
  }
}

function withTimeout<T>(promise: PromiseLike<T>, timeoutMs = 2000): Promise<T> {
  return Promise.race([
    Promise.resolve(promise),
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error("Job Card query timed out")), timeoutMs)
    ),
  ]);
}

export const DEFAULT_START_NUMBER = 1066;

/**
 * Extracts a numeric sequence value from a record's identifier string/number.
 * Returns null if not a sequence number.
 */
export function extractSequenceNumber(val: string | number | null | undefined): number | null {
  if (val === null || val === undefined) return null;
  const str = String(val).trim();
  if (!str) return null;

  // Pure integer string like "1066" or number 1066
  if (/^\d+$/.test(str)) {
    const n = parseInt(str, 10);
    if (!isNaN(n) && n > 0 && n < 100000000) return n;
  }

  // Pre-fixed identifiers like "JC-1066", "INV-1066", "JC1066", "INV1066"
  const match = str.match(/^(?:JC-?|INV-?|JOB-?)(\d+)$/i);
  if (match) {
    const n = parseInt(match[1], 10);
    if (!isNaN(n) && n > 0 && n < 100000000) return n;
  }

  return null;
}

/**
 * Get Next Auto-incrementing Job Card Number:
 * - Starts automatically from 1066
 * - If records exist with number >= 1066, next is MAX + 1
 * - Scoped to the active workspace
 * - Guaranteed unique, plain string: "1066", "1067", etc.
 */
export function getNextJobCardNumber(workspaceId?: string): string {
  const targetWsId = workspaceId || getActiveWorkspaceId();
  const local = getLocalJobCards(targetWsId);
  const usedNumbers = new Set<number>();

  local.forEach((j) => {
    const num = extractSequenceNumber(j.job_card_number);
    if (num !== null) usedNumbers.add(num);
  });

  const sequenceNums = Array.from(usedNumbers).filter((n) => n >= DEFAULT_START_NUMBER);
  let candidate = sequenceNums.length > 0 ? Math.max(...sequenceNums) + 1 : DEFAULT_START_NUMBER;

  while (usedNumbers.has(candidate)) {
    candidate++;
  }

  return String(candidate);
}

export async function getNextJobCardNumberAsync(workspaceId?: string): Promise<string> {
  const targetWsId = workspaceId || getActiveWorkspaceId();
  const supabase = createClient();

  try {
    const fetchWithTimeout = async () => {
      const { data, error } = await supabase
        .from("job_cards")
        .select("job_card_number")
        .eq("workspace_id", targetWsId);

      if (error) throw error;

      const usedNumbers = new Set<number>();

      (data || []).forEach((row: any) => {
        const num = extractSequenceNumber(row.job_card_number);
        if (num !== null) usedNumbers.add(num);
      });

      // Also merge local storage to avoid collisions
      const local = getLocalJobCards(targetWsId);
      local.forEach((j) => {
        const num = extractSequenceNumber(j.job_card_number);
        if (num !== null) usedNumbers.add(num);
      });

      const sequenceNums = Array.from(usedNumbers).filter((n) => n >= DEFAULT_START_NUMBER);
      let candidate = sequenceNums.length > 0 ? Math.max(...sequenceNums) + 1 : DEFAULT_START_NUMBER;

      while (usedNumbers.has(candidate)) {
        candidate++;
      }

      return String(candidate);
    };

    return await withTimeout(fetchWithTimeout(), 1500);
  } catch {
    return getNextJobCardNumber(targetWsId);
  }
}

/**
 * Get Next Auto-incrementing Invoice Number:
 * - Starts automatically from 1066
 * - If records exist with number >= 1066, next is MAX + 1
 * - Scoped to the active workspace
 * - Guaranteed unique numeric sequence
 */
export function getNextInvoiceNumber(workspaceId?: string): number {
  const targetWsId = workspaceId || getActiveWorkspaceId();
  const localJc = getLocalJobCards(targetWsId);
  const usedNumbers = new Set<number>();

  localJc.forEach((j) => {
    const num = extractSequenceNumber(j.invoice_number);
    if (num !== null) usedNumbers.add(num);
  });

  try {
    if (typeof window !== "undefined") {
      const rawInvs = localStorage.getItem("atiq_local_invoices");
      if (rawInvs) {
        const parsedInvs = JSON.parse(rawInvs);
        if (Array.isArray(parsedInvs)) {
          parsedInvs
            .filter((inv: any) => inv.workspace_id === targetWsId || (!inv.workspace_id && targetWsId === DEFAULT_WORKSPACE_ID))
            .forEach((inv: any) => {
              const num = extractSequenceNumber(inv.invoice_number);
              if (num !== null) usedNumbers.add(num);
            });
        }
      }
    }
  } catch {}

  const sequenceNums = Array.from(usedNumbers).filter((n) => n >= DEFAULT_START_NUMBER);
  let candidate = sequenceNums.length > 0 ? Math.max(...sequenceNums) + 1 : DEFAULT_START_NUMBER;

  while (usedNumbers.has(candidate)) {
    candidate++;
  }

  return candidate;
}

export async function getNextInvoiceNumberAsync(workspaceId?: string): Promise<number> {
  const targetWsId = workspaceId || getActiveWorkspaceId();
  const supabase = createClient();

  try {
    const fetchWithTimeout = async () => {
      // 1. Query job_cards for invoice_number in this workspace
      const { data: jcData, error: jcErr } = await supabase
        .from("job_cards")
        .select("invoice_number")
        .eq("workspace_id", targetWsId)
        .not("invoice_number", "is", null);

      if (jcErr) throw jcErr;

      // 2. Query invoices table for invoice_number in this workspace
      const { data: invData } = await supabase
        .from("invoices")
        .select("invoice_number")
        .eq("workspace_id", targetWsId);

      const usedNumbers = new Set<number>();

      (jcData || []).forEach((d: any) => {
        const num = extractSequenceNumber(d.invoice_number);
        if (num !== null) usedNumbers.add(num);
      });

      (invData || []).forEach((d: any) => {
        const num = extractSequenceNumber(d.invoice_number);
        if (num !== null) usedNumbers.add(num);
      });

      // Merge local storage
      const local = getLocalJobCards(targetWsId);
      local.forEach((j) => {
        const num = extractSequenceNumber(j.invoice_number);
        if (num !== null) usedNumbers.add(num);
      });

      try {
        if (typeof window !== "undefined") {
          const rawInvs = localStorage.getItem("atiq_local_invoices");
          if (rawInvs) {
            const parsedInvs = JSON.parse(rawInvs);
            if (Array.isArray(parsedInvs)) {
              parsedInvs
                .filter((inv: any) => inv.workspace_id === targetWsId || (!inv.workspace_id && targetWsId === DEFAULT_WORKSPACE_ID))
                .forEach((inv: any) => {
                  const num = extractSequenceNumber(inv.invoice_number);
                  if (num !== null) usedNumbers.add(num);
                });
            }
          }
        }
      } catch {}

      const sequenceNums = Array.from(usedNumbers).filter((n) => n >= DEFAULT_START_NUMBER);
      let candidate = sequenceNums.length > 0 ? Math.max(...sequenceNums) + 1 : DEFAULT_START_NUMBER;

      while (usedNumbers.has(candidate)) {
        candidate++;
      }

      return candidate;
    };

    return await withTimeout(fetchWithTimeout(), 1500);
  } catch {
    return getNextInvoiceNumber(targetWsId);
  }
}

/**
 * Check if a custom invoice number is already in use
 */
export async function isInvoiceNumberAvailable(num: number, excludeJobCardId?: string): Promise<boolean> {
  if (!num || isNaN(num) || num <= 0) return false;
  const supabase = createClient();

  try {
    const fetchWithTimeout = async () => {
      let q = supabase
        .from("job_cards")
        .select("id, invoice_number")
        .eq("invoice_number", num);

      if (excludeJobCardId) {
        q = q.neq("id", excludeJobCardId);
      }

      const { data, error } = await q.limit(1);
      if (error) throw error;

      if (data && data.length > 0) return false;

      const local = getLocalJobCards();
      const localUsed = local.some((j) => Number(j.invoice_number) === num && j.id !== excludeJobCardId);
      return !localUsed;
    };

    return await withTimeout(fetchWithTimeout(), 1500);
  } catch {
    const local = getLocalJobCards();
    const exists = local.some((j) => Number(j.invoice_number) === num && j.id !== excludeJobCardId);
    return !exists;
  }
}

export type JobCardDateFilter =
  | "all"
  | "today"
  | "yesterday"
  | "last_7_days"
  | "last_30_days"
  | "this_month"
  | "last_month"
  | "custom";

export function computeJobCardDateRange(
  filter?: JobCardDateFilter | string,
  customStart?: string,
  customEnd?: string
): { start?: string; end?: string } {
  if (filter === "custom") {
    return {
      start: customStart || undefined,
      end: customEnd || undefined,
    };
  }

  const now = new Date();
  const formatYMD = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };

  const todayStr = formatYMD(now);

  switch (filter) {
    case "today":
      return { start: todayStr, end: todayStr };
    case "yesterday": {
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      const yStr = formatYMD(yesterday);
      return { start: yStr, end: yStr };
    }
    case "last_7_days": {
      const d7 = new Date(now);
      d7.setDate(d7.getDate() - 6);
      return { start: formatYMD(d7), end: todayStr };
    }
    case "last_30_days": {
      const d30 = new Date(now);
      d30.setDate(d30.getDate() - 29);
      return { start: formatYMD(d30), end: todayStr };
    }
    case "this_month": {
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
      const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      return { start: formatYMD(firstDay), end: formatYMD(lastDay) };
    }
    case "last_month": {
      const firstDay = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastDay = new Date(now.getFullYear(), now.getMonth(), 0);
      return { start: formatYMD(firstDay), end: formatYMD(lastDay) };
    }
    case "all":
    default:
      return {};
  }
}

export async function getJobCards(
  options: JobCardQueryOptions = {},
  workspaceId?: string
): Promise<{ jobCards: JobCardWithRelations[]; total: number }> {
  const targetWsId = workspaceId || getActiveWorkspaceId();
  const search =
    typeof options?.search === "string"
      ? options.search.trim()
      : "";

  const status =
    typeof options?.status === "string" && options.status !== "all"
      ? options.status
      : undefined;

  const { startDate, endDate, dateFilter } = options;
  const { start, end } = computeJobCardDateRange(dateFilter, startDate, endDate);

  const page = typeof options?.page === "number" && options.page > 0 ? options.page : 1;
  const limit = typeof options?.limit === "number" && options.limit > 0 ? options.limit : 20;
  const offset = (page - 1) * limit;

  const supabase = createClient();

  let query = supabase
    .from("job_cards")
    .select(
      "id, invoice_number, payment_status, job_card_number, date, status, total, balance, customer_id, vehicle_id, customer_complaint, assigned_mechanic, workspace_id, is_deleted, created_at, customer:customers(id, name, mobile, email, company_name, trn_number, address), vehicle:vehicles(id, make, model, registration_number, chassis_vin, color, year, mileage), items:job_card_items(id, item_type, description, quantity, unit_price, cost_price, total_price)",
      { count: "exact" }
    )
    .eq("is_deleted", false)
    .eq("workspace_id", targetWsId);

  if (status) {
    query = query.eq("status", status);
  }

  if (options.assigned_mechanic) {
    query = query.ilike("assigned_mechanic", `%${options.assigned_mechanic}%`);
  }

  if (start) {
    query = query.gte("date", start);
  }
  if (end) {
    query = query.lte("date", end);
  }

  if (search) {
    const orClauses = [
      `job_card_number.ilike.%${search}%`,
      `assigned_mechanic.ilike.%${search}%`,
      `customer_complaint.ilike.%${search}%`,
    ];
    if (!isNaN(Number(search))) {
      orClauses.push(`invoice_number.eq.${Number(search)}`);
    }
    query = query.or(orClauses.join(","));
  }

  const { data, count, error } = await query
    .order("date", { ascending: false })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    console.error("Failed to fetch job cards from Supabase:", error);
    throw new Error(`Could not load job cards: ${error.message}`);
  }

  return { jobCards: (data || []) as unknown as JobCardWithRelations[], total: count || 0 };
}

export async function getJobCardById(id: string, workspaceId?: string): Promise<JobCardWithRelations | null> {
  if (!id) return null;
  const targetWsId = workspaceId || getActiveWorkspaceId();
  const supabase = createClient();

  const normalizeJobCardItems = (rawItems: any[] = []): JobCardItem[] => {
    return rawItems.map((item) => {
      const q = Number(item.quantity) || 1;
      const p = Number(item.unit_price) || 0;
      const l = Number(item.labour_charge) || 0;
      const calcTotal = item.item_type === "service" ? (q * p + l) : (q * p);
      return {
        id: item.id || generateUUID(),
        job_card_id: id,
        item_type: item.item_type || "service",
        service_id: item.service_id || null,
        part_id: item.part_id || null,
        description: item.description || "",
        quantity: q,
        unit_price: p,
        cost_price: Number(item.cost_price) || 0,
        labour_charge: l,
        total_price: Number(item.total_price) || calcTotal,
        created_at: item.created_at || new Date().toISOString(),
      };
    });
  };

  const { data, error } = await supabase
    .from("job_cards")
    .select(
      "*, customer:customers(*), vehicle:vehicles(*), items:job_card_items(*)"
    )
    .eq("id", id)
    .eq("workspace_id", targetWsId)
    .maybeSingle();

  if (error) {
    console.error(`Failed to fetch job card ${id} from Supabase:`, error);
    throw new Error(`Could not load job card: ${error.message}`);
  }

  if (data) {
    data.items = normalizeJobCardItems(data.items);
    return data as JobCardWithRelations;
  }

  return null;
}


export type JobCardItemInput = {
  id?: string;
  job_card_id?: string;
  item_type: "service" | "part" | "spare_part" | string;
  service_id?: string | null;
  part_id?: string | null;
  description?: string;
  quantity?: number;
  unit_price?: number;
  cost_price?: number;
  labour_charge?: number;
  total_price?: number;
};

export interface JobCardDbInsertRow {
  id: string;
  workspace_id: string;
  job_card_number: string;
  invoice_number: number | null;
  invoice_number_mode: string;
  customer_id: string;
  vehicle_id: string;
  date: string;
  mileage_in: number | null;
  customer_complaint: string | null;
  work_details: string | null;
  discount: number;
  subtotal: number;
  vat_rate: number;
  vat_amount: number;
  total: number;
  paid: number;
  balance: number;
  status: string;
  payment_status: string;
  assigned_mechanic: string | null;
  notes: string | null;
  created_by: string | null;
  is_deleted: boolean;
  deleted_at: string | null;
  deleted_by: string | null;
  created_at: string;
  updated_at: string;
}

export function buildJobCardDbInsertPayload(
  payload: any,
  meta: {
    id: string;
    workspaceId: string;
    jobCardNumber: string;
    invoiceNumber: number | null;
    invoiceNumberMode?: string;
  }
): JobCardDbInsertRow {
  const now = new Date().toISOString();
  return {
    id: meta.id,
    workspace_id: meta.workspaceId,
    job_card_number: meta.jobCardNumber,
    invoice_number: meta.invoiceNumber != null && !isNaN(Number(meta.invoiceNumber)) ? Number(meta.invoiceNumber) : null,
    invoice_number_mode: meta.invoiceNumberMode || payload.invoice_number_mode || "auto",
    customer_id: payload.customer_id,
    vehicle_id: payload.vehicle_id,
    date: payload.date || now.slice(0, 10),
    mileage_in: payload.mileage_in != null && payload.mileage_in !== "" ? Number(payload.mileage_in) : null,
    customer_complaint: payload.customer_complaint != null ? String(payload.customer_complaint).trim() || null : null,
    work_details: payload.work_details != null ? String(payload.work_details).trim() || null : null,
    discount: Number(payload.discount) || 0,
    subtotal: Number(payload.subtotal) || 0,
    vat_rate: payload.vat_rate != null ? Number(payload.vat_rate) : 5.0,
    vat_amount: Number(payload.vat_amount) || 0,
    total: Number(payload.total) || 0,
    paid: Number(payload.paid) || 0,
    balance: Number(payload.balance) || 0,
    status: payload.status || "new",
    payment_status: payload.payment_status || "Pending",
    assigned_mechanic: payload.assigned_mechanic != null ? String(payload.assigned_mechanic).trim() || null : null,
    notes: payload.notes != null ? String(payload.notes).trim() || null : null,
    created_by: payload.created_by || "Owner",
    is_deleted: false,
    deleted_at: null,
    deleted_by: null,
    created_at: payload.created_at || now,
    updated_at: now,
  };
}

export function buildJobCardDbUpdatePayload(payload: any): Partial<JobCardDbInsertRow> {
  const updateData: Partial<JobCardDbInsertRow> = {
    updated_at: new Date().toISOString(),
  };

  if (payload.customer_id !== undefined) updateData.customer_id = payload.customer_id;
  if (payload.vehicle_id !== undefined) updateData.vehicle_id = payload.vehicle_id;
  if (payload.date !== undefined) updateData.date = payload.date;
  if (payload.mileage_in !== undefined) {
    updateData.mileage_in = payload.mileage_in != null && payload.mileage_in !== "" ? Number(payload.mileage_in) : null;
  }
  if (payload.customer_complaint !== undefined) {
    updateData.customer_complaint = payload.customer_complaint != null ? String(payload.customer_complaint).trim() || null : null;
  }
  if (payload.work_details !== undefined) {
    updateData.work_details = payload.work_details != null ? String(payload.work_details).trim() || null : null;
  }
  if (payload.discount !== undefined) updateData.discount = Number(payload.discount) || 0;
  if (payload.subtotal !== undefined) updateData.subtotal = Number(payload.subtotal) || 0;
  if (payload.vat_rate !== undefined) updateData.vat_rate = Number(payload.vat_rate) || 0;
  if (payload.vat_amount !== undefined) updateData.vat_amount = Number(payload.vat_amount) || 0;
  if (payload.total !== undefined) updateData.total = Number(payload.total) || 0;
  if (payload.paid !== undefined) updateData.paid = Number(payload.paid) || 0;
  if (payload.balance !== undefined) updateData.balance = Number(payload.balance) || 0;
  if (payload.status !== undefined) updateData.status = payload.status;
  if (payload.payment_status !== undefined) updateData.payment_status = payload.payment_status;
  if (payload.assigned_mechanic !== undefined) {
    updateData.assigned_mechanic = payload.assigned_mechanic != null ? String(payload.assigned_mechanic).trim() || null : null;
  }
  if (payload.notes !== undefined) {
    updateData.notes = payload.notes != null ? String(payload.notes).trim() || null : null;
  }
  if (payload.invoice_number !== undefined) {
    updateData.invoice_number = payload.invoice_number != null && payload.invoice_number !== "" ? Number(payload.invoice_number) : null;
  }
  if (payload.invoice_number_mode !== undefined) updateData.invoice_number_mode = payload.invoice_number_mode;
  if (payload.is_deleted !== undefined) updateData.is_deleted = Boolean(payload.is_deleted);
  if (payload.deleted_at !== undefined) updateData.deleted_at = payload.deleted_at;
  if (payload.deleted_by !== undefined) updateData.deleted_by = payload.deleted_by;

  return updateData;
}

export interface JobCardItemDbRow {
  id: string;
  workspace_id: string;
  job_card_id: string;
  item_type: "service" | "part";
  service_id: string | null;
  part_id: string | null;
  description: string;
  quantity: number;
  unit_price: number;
  cost_price: number;
  labour_charge: number;
  total_price: number;
  created_at: string;
}

export function buildJobCardItemDbPayload(
  it: JobCardItemInput,
  meta: { jobCardId: string; workspaceId: string }
): JobCardItemDbRow {
  const itemType = ((it.item_type as string) === "spare_part" ? "part" : it.item_type) as "service" | "part";
  const itemId = it.id && it.id.length === 36 && !it.id.startsWith("item-") && !it.id.startsWith("jci-") ? it.id : generateUUID();
  const qty = Number(it.quantity) || 1;
  const unitPrice = Number(it.unit_price) || 0;
  const costPrice = Number(it.cost_price) || 0;
  const labourCharge = Number(it.labour_charge) || 0;
  const rawTotal = (it as any).total;
  const totalPrice = it.total_price != null ? Number(it.total_price) : (rawTotal != null ? Number(rawTotal) : qty * unitPrice + labourCharge);
  return {
    id: itemId,
    job_card_id: meta.jobCardId,
    workspace_id: meta.workspaceId,
    item_type: itemType || "service",
    service_id: it.service_id && it.service_id.length === 36 ? it.service_id : null,
    part_id: it.part_id && it.part_id.length === 36 ? it.part_id : null,
    description: (it.description || (itemType === "part" ? "Spare Part" : "Service")).trim(),
    quantity: qty,
    unit_price: unitPrice,
    cost_price: costPrice,
    labour_charge: labourCharge,
    total_price: totalPrice,
    created_at: new Date().toISOString(),
  };
}

export async function createJobCard(
  payload: JobCardInsert & { items?: JobCardItemInput[]; payment_method?: string; payment_date?: string; payment_reference?: string; payment_notes?: string },
  itemsInput: JobCardItemInput[] = [],
  workspaceId?: string
) {
  const targetWsId = payload.workspace_id || workspaceId || getActiveWorkspaceId();
  const items = Array.isArray(itemsInput) && itemsInput.length > 0
    ? itemsInput
    : (Array.isArray(payload?.items) ? payload.items : []);

  const supabase = createClient();
  const rawInvoiceNum = payload.invoice_number != null ? Number(payload.invoice_number) : null;
  const assignedInvoiceNumber = rawInvoiceNum !== null && !isNaN(rawInvoiceNum)
    ? rawInvoiceNum
    : (await getNextInvoiceNumberAsync(targetWsId));
  const assignedJobCardNumber = payload.job_card_number || (await getNextJobCardNumberAsync(targetWsId));

  // 1. Stock Validation & Cost Snapshot
  for (const it of items) {
    if ((it.item_type === "part" || (it as any).item_type === "spare_part") && it.part_id) {
      const part = await getPartById(it.part_id, targetWsId);
      const reqQty = Number(it.quantity) || 1;
      if (part) {
        if (part.current_stock < reqQty) {
          throw new Error(
            `Insufficient stock for "${part.name}". Available stock is ${part.current_stock}, requested ${reqQty}.`
          );
        }
        if (it.cost_price === undefined) {
          it.cost_price = Number(part.purchase_price) || 0;
        }
      }
    }
  }

  const payloadId = (payload as any).id;
  const jobCardId = payloadId && payloadId.length === 36 ? payloadId : generateUUID();

  // 2. Build strictly whitelisted DB insert payload
  const dbInsertPayload = buildJobCardDbInsertPayload(payload, {
    id: jobCardId,
    workspaceId: targetWsId,
    jobCardNumber: assignedJobCardNumber,
    invoiceNumber: assignedInvoiceNumber,
    invoiceNumberMode: payload.invoice_number_mode || "auto",
  });

  // 3. Insert job card header
  const { data: jobCard, error: jcError } = await supabase
    .from("job_cards")
    .insert(dbInsertPayload)
    .select()
    .single();

  if (jcError) {
    console.error("Supabase job_cards insertion error:", jcError);
    throw new Error(`Could not save Job Card to cloud database: ${jcError.message}. No data was saved. Please retry.`);
  }

  // 4. Insert items with workspace_id and strictly whitelisted columns
  if (items && items.length > 0) {
    const itemsPayload = items.map((it) =>
      buildJobCardItemDbPayload(it, {
        jobCardId: jobCard.id,
        workspaceId: targetWsId,
      })
    );

    const { error: itemsError } = await supabase
      .from("job_card_items")
      .insert(itemsPayload);

    if (itemsError) {
      console.error("Supabase job_card_items insertion error:", itemsError);
      // Clean up orphaned job card
      await supabase.from("job_cards").delete().eq("id", jobCard.id);
      throw new Error(`Could not save Job Card items to cloud database: ${itemsError.message}. No data was saved. Please retry.`);
    }
  }

  // 4. Record stock usage transactions for parts
  if (payload.status !== "cancelled") {
    for (const it of items) {
      if ((it.item_type === "part" || (it.item_type as string) === "spare_part") && it.part_id) {
        const qty = Number(it.quantity) || 1;
        if (qty > 0) {
          try {
            await recordStockTransaction({
              partId: it.part_id,
              transactionType: "job_card_usage",
              quantityChange: -qty,
              unitCost: it.cost_price,
              referenceType: "job_card",
              referenceId: jobCard.id,
              notes: `Job Card #${assignedInvoiceNumber}`,
            });
          } catch (stkErr) {
            console.error("Stock transaction error on JC create:", stkErr);
          }
        }
      }
    }
  }

  // 5. Record Initial Advance / Partial Payment if paid > 0
  const initialPaid = Number(payload.paid) || 0;
  if (initialPaid > 0) {
    try {
      const { recordPayment } = await import("./payment-service");
      await recordPayment({
        workspace_id: targetWsId,
        job_card_id: jobCard.id,
        invoice_id: null,
        customer_id: jobCard.customer_id,
        amount: initialPaid,
        payment_method: ((payload as any).payment_method || (payload.payment_status?.toLowerCase().includes("bank") ? "bank_transfer" : payload.payment_status?.toLowerCase().includes("card") ? "credit_card" : "cash")) as any,
        payment_date: (payload as any).payment_date || payload.date || new Date().toISOString().slice(0, 10),
        reference_number: (payload as any).payment_reference || assignedJobCardNumber,
        notes: (payload as any).payment_notes || "Advance / Initial Payment on Job Card",
        created_by: payload.created_by || "Owner",
      });
    } catch (payErr) {
      console.warn("Initial Job Card payment recording notice:", payErr);
    }
  }

  const createdRecord = await getJobCardById(jobCard.id, targetWsId);
  return createdRecord;
}


export async function updateJobCard(
  id: string,
  payload: JobCardUpdate,
  items?: JobCardItemInput[]
) {
  const supabase = createClient();
  const targetWsId = await getActiveWorkspaceId();

  const existingRecord = await getJobCardById(id, targetWsId);
  if (!existingRecord) {
    throw new Error(`Job Card #${id} not found.`);
  }

  const wasCancelled = existingRecord.status === "cancelled" || !!existingRecord.is_deleted;
  const willBeCancelled = payload.status === "cancelled" || payload.is_deleted === true;
  const invoiceNum = existingRecord.invoice_number || existingRecord.job_card_number || id;
  const wsId = existingRecord.workspace_id || targetWsId;

  // 1. Calculate previously allocated parts usage
  const oldPartQtyMap = new Map<string, number>();
  if (!wasCancelled && existingRecord.items) {
    existingRecord.items.forEach((it) => {
      if ((it.item_type === "part" || (it.item_type as string) === "spare_part") && it.part_id) {
        const prev = oldPartQtyMap.get(it.part_id) || 0;
        oldPartQtyMap.set(it.part_id, prev + (Number(it.quantity) || 1));
      }
    });
  }

  // 2. Calculate new parts requirement
  const newPartQtyMap = new Map<string, number>();
  const effectiveItems = items !== undefined ? items : (existingRecord.items || []);

  if (!willBeCancelled && effectiveItems) {
    for (const it of effectiveItems) {
      if ((it.item_type === "part" || (it.item_type as string) === "spare_part") && it.part_id) {
        const prev = newPartQtyMap.get(it.part_id) || 0;
        newPartQtyMap.set(it.part_id, prev + (Number(it.quantity) || 1));

        if (it.cost_price === undefined) {
          const part = await getPartById(it.part_id, wsId);
          it.cost_price = part ? Number(part.purchase_price) || 0 : 0;
        }
      }
    }
  }

  // 3. Validate stock availability on positive deltas
  const allPartIds = new Set([...oldPartQtyMap.keys(), ...newPartQtyMap.keys()]);
  for (const partId of allPartIds) {
    const oldQty = oldPartQtyMap.get(partId) || 0;
    const newQty = newPartQtyMap.get(partId) || 0;
    const delta = newQty - oldQty;

    if (delta > 0) {
      const part = await getPartById(partId, wsId);
      if (part && part.current_stock < delta) {
        throw new Error(
          `Insufficient stock for "${part.name}". Available stock is ${part.current_stock}, requested additional ${delta} unit(s).`
        );
      }
    }
  }

  // 4. Apply inventory stock delta adjustments
  for (const partId of allPartIds) {
    const oldQty = oldPartQtyMap.get(partId) || 0;
    const newQty = newPartQtyMap.get(partId) || 0;
    const delta = newQty - oldQty;

    if (delta > 0) {
      // Additional units used
      const part = await getPartById(partId, wsId);
      const unitCost = part ? Number(part.purchase_price) || 0 : undefined;
      await recordStockTransaction({
        partId,
        transactionType: "job_card_usage",
        quantityChange: -delta,
        unitCost,
        referenceType: "job_card",
        referenceId: id,
        notes: `Job Card #${invoiceNum} (Used +${delta} unit(s))`,
        workspace_id: wsId,
      });
    } else if (delta < 0) {
      // Units returned / reduced / cancelled
      const part = await getPartById(partId, wsId);
      const unitCost = part ? Number(part.purchase_price) || 0 : undefined;
      const returnedQty = Math.abs(delta);
      await recordStockTransaction({
        partId,
        transactionType: willBeCancelled ? "job_card_reversal" : "return",
        quantityChange: returnedQty,
        unitCost,
        referenceType: "job_card",
        referenceId: id,
        notes: willBeCancelled
          ? `Job Card #${invoiceNum} Cancelled (Returned ${returnedQty} unit(s))`
          : `Job Card #${invoiceNum} (Returned ${returnedQty} unit(s))`,
        workspace_id: wsId,
      });
    }
  }

  // 5. Update job card header in Supabase using strict whitelist
  const updatePayload = buildJobCardDbUpdatePayload(payload);

  const { data: updatedHeader, error: jcError } = await supabase
    .from("job_cards")
    .update(updatePayload)
    .eq("id", id)
    .eq("workspace_id", wsId)
    .select()
    .single();

  if (jcError) {
    console.error("Failed to update job card in Supabase:", jcError);
    throw new Error(`Failed to update job card: ${jcError.message}`);
  }

  // 6. Update items in Supabase if items array was provided
  if (items) {
    const { error: delError } = await supabase
      .from("job_card_items")
      .delete()
      .eq("job_card_id", id);

    if (delError) {
      console.error("Failed to clear old job card items:", delError);
      throw new Error(`Failed to clear old job card items: ${delError.message}`);
    }

    if (items.length > 0) {
      const itemsWithJcId = items.map((it) =>
        buildJobCardItemDbPayload(it, {
          jobCardId: id,
          workspaceId: wsId,
        })
      );

      const { error: insertItemsErr } = await supabase
        .from("job_card_items")
        .insert(itemsWithJcId);

      if (insertItemsErr) {
        console.error("Failed to insert updated job card items:", insertItemsErr);
        throw new Error(`Failed to update job card items: ${insertItemsErr.message}`);
      }
    }
  }

  return await getJobCardById(id, wsId);
}

export async function updateJobCardStatus(id: string, status: JobCardStatus) {
  return updateJobCard(id, { status });
}

export async function deleteJobCard(id: string, softDelete = true) {
  const supabase = createClient();
  const targetWsId = await getActiveWorkspaceId();

  // Return parts back to inventory on cancellation / deletion
  try {
    const existing = await getJobCardById(id, targetWsId);
    if (existing && existing.items && existing.status !== "cancelled" && !existing.is_deleted) {
      for (const it of existing.items) {
        if ((it.item_type === "part" || (it.item_type as string) === "spare_part") && it.part_id) {
          const q = Number(it.quantity) || 0;
          if (q > 0) {
            await recordStockTransaction({
              partId: it.part_id,
              transactionType: "job_card_reversal",
              quantityChange: q,
              referenceType: "job_card",
              referenceId: id,
              notes: `Job Card Void/Delete (Returned ${q} unit(s))`,
              workspace_id: existing.workspace_id || targetWsId,
            });
          }
        }
      }
    }
  } catch (err) {
    console.warn("Returning parts notice on delete:", err);
  }

  if (softDelete) {
    const { error } = await supabase
      .from("job_cards")
      .update({
        is_deleted: true,
        deleted_at: new Date().toISOString(),
        status: "cancelled",
      })
      .eq("id", id);
    if (error) {
      console.error("Failed to soft-delete job card in Supabase:", error);
      throw new Error(`Failed to delete job card: ${error.message}`);
    }
  } else {
    const { error } = await supabase.from("job_cards").delete().eq("id", id);
    if (error) {
      console.error("Failed to hard-delete job card in Supabase:", error);
      throw new Error(`Failed to permanently delete job card: ${error.message}`);
    }
  }
  return true;
}
