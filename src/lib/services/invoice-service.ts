import { createClient } from "@/lib/supabase/client";
import { generateUUID } from "@/lib/utils";
import type {
  Invoice,
  InvoiceItem,
  Payment,
  PaymentStatus,
  PaymentMethod,
  CreateDirectInvoicePayload,
  DirectInvoiceServiceItemPayload,
  DirectInvoicePartItemPayload,
} from "@/types/database";

export type {
  CreateDirectInvoicePayload,
  DirectInvoiceServiceItemPayload,
  DirectInvoicePartItemPayload,
};
import { invalidateDashboardCache } from "./dashboard-service";
import { getActiveWorkspaceId } from "./workspace-service";
import { DEFAULT_WORKSPACE_ID } from "@/lib/constants";
import { isTableMissingInSupabase, markTableMissingInSupabase } from "./supabase-schema-status";
import { getNextInvoiceNumberAsync } from "./job-card-service";

const LOCAL_INVOICES_KEY = "atiq_local_invoices";
const LOCAL_INVOICE_ITEMS_KEY = "atiq_local_invoice_items";

let inMemoryInvoices: any[] = [];
let inMemoryInvoiceItems: any[] = [];

export function getLocalInvoices(workspaceId?: string): any[] {
  const targetWsId = workspaceId || getActiveWorkspaceId();
  let all: any[] = [];
  if (typeof window === "undefined") {
    all = inMemoryInvoices;
  } else {
    try {
      const raw = localStorage.getItem(LOCAL_INVOICES_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) all = parsed;
      }
    } catch {}
    if (all.length === 0) all = inMemoryInvoices;
  }
  return all.filter(
    (inv) => inv.workspace_id === targetWsId || (!inv.workspace_id && targetWsId === DEFAULT_WORKSPACE_ID)
  );
}

export function saveLocalInvoices(invoices: any[], workspaceId?: string) {
  const targetWsId = workspaceId || getActiveWorkspaceId();
  let allExisting: any[] = [];
  if (typeof window !== "undefined") {
    try {
      const raw = localStorage.getItem(LOCAL_INVOICES_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) allExisting = parsed;
      }
    } catch {}
  }
  if (allExisting.length === 0) allExisting = inMemoryInvoices;
  const others = allExisting.filter((inv) => inv.workspace_id && inv.workspace_id !== targetWsId);
  const taggedInvoices = invoices.map((inv) => ({
    ...inv,
    workspace_id: inv.workspace_id || targetWsId,
  }));
  const merged = [...taggedInvoices, ...others];
  inMemoryInvoices = merged;
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(LOCAL_INVOICES_KEY, JSON.stringify(merged));
    } catch (e) {
      console.error("Failed to save local invoices", e);
    }
  }
}

export function getLocalInvoiceItems(): any[] {
  if (typeof window === "undefined") return inMemoryInvoiceItems;
  try {
    const raw = localStorage.getItem(LOCAL_INVOICE_ITEMS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
    return inMemoryInvoiceItems;
  } catch {
    return inMemoryInvoiceItems;
  }
}

export function saveLocalInvoiceItems(items: any[]) {
  inMemoryInvoiceItems = items;
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LOCAL_INVOICE_ITEMS_KEY, JSON.stringify(items));
  } catch (e) {
    console.error("Failed to save local invoice items", e);
  }
}

function withTimeout<T>(promise: PromiseLike<T>, timeoutMs = 2000): Promise<T> {
  return Promise.race([
    Promise.resolve(promise),
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error("Invoice query timed out")), timeoutMs)
    ),
  ]);
}

/**
 * Check if an invoice already exists for a specific Job Card
 */
export async function getInvoiceByJobCardId(jobCardId: string, workspaceId?: string): Promise<any | null> {
  if (!jobCardId) return null;
  const targetWsId = workspaceId || getActiveWorkspaceId();
  const supabase = createClient();
  try {
    const fetchWithTimeout = async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select("*, customer:customers(*), vehicle:vehicles(*), items:invoice_items(*), payments(*)")
        .eq("job_card_id", jobCardId)
        .eq("workspace_id", targetWsId)
        .neq("payment_status", "void")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      return data;
    };

    const res = await withTimeout(fetchWithTimeout(), 1500);
    if (res) return res;
  } catch {
    // Check fallback
  }

  const list = getLocalInvoices(targetWsId).filter(
    (inv) => inv.job_card_id === jobCardId && inv.payment_status !== "void" && !inv.is_void
  );
  if (list.length > 0) {
    return await getInvoiceById(list[0].id, targetWsId);
  }
  return null;
}

export interface InvoicesFilterOptions {
  query?: string;
  statusFilter?: string; // "all" | "paid" | "partially_paid" | "credit" | "pending" | "void"
  dateFilter?: "all" | "today" | "this_month" | "custom";
  startDate?: string;
  endDate?: string;
  customerId?: string;
  page?: number;
  limit?: number;
}

/**
 * Get paginated invoices with search, status filter, and date filtering
 */
export async function getInvoices(
  options: InvoicesFilterOptions = {},
  workspaceId?: string
): Promise<{ invoices: any[]; total: number }> {
  const targetWsId = workspaceId || getActiveWorkspaceId();
  const {
    query,
    statusFilter = "all",
    dateFilter = "all",
    startDate,
    endDate,
    customerId,
    page = 1,
    limit = 25,
  } = options;

  const supabase = createClient();
  const offset = (page - 1) * limit;

  // If table is known to be uninitialized in Supabase, skip doomed network call
  if (!isTableMissingInSupabase("invoices")) {
    try {
      const fetchWithTimeout = async () => {
        let dbQuery = supabase
          .from("invoices")
          .select(
            "*, customer:customers(id, name, mobile, email, company_name, trn_number, address), vehicle:vehicles(id, make, model, year, registration_number, chassis_vin), job_card:job_cards(id, job_card_number, invoice_number), items:invoice_items(id, item_type, description, quantity, unit_price, total_price), payments(id, amount, payment_method, payment_date)",
            { count: "exact" }
          )
          .eq("workspace_id", targetWsId);

        if (customerId) {
          dbQuery = dbQuery.eq("customer_id", customerId);
        }

        if (statusFilter && statusFilter !== "all") {
          if (statusFilter === "pending" || statusFilter === "credit") {
            dbQuery = dbQuery.in("payment_status", ["credit", "pending", "unpaid"]);
          } else {
            dbQuery = dbQuery.eq("payment_status", statusFilter);
          }
        }

        // Date Filters
        const now = new Date();
        const formatYMD = (d: Date) => d.toISOString().slice(0, 10);

        if (dateFilter === "today") {
          const todayStr = formatYMD(now);
          dbQuery = dbQuery.gte("created_at", `${todayStr}T00:00:00Z`).lte("created_at", `${todayStr}T23:59:59Z`);
        } else if (dateFilter === "this_month") {
          const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
          const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
          dbQuery = dbQuery
            .gte("created_at", `${formatYMD(firstDay)}T00:00:00Z`)
            .lte("created_at", `${formatYMD(lastDay)}T23:59:59Z`);
        } else if (dateFilter === "custom" && startDate && endDate) {
          dbQuery = dbQuery
            .gte("created_at", `${startDate}T00:00:00Z`)
            .lte("created_at", `${endDate}T23:59:59Z`);
        }

        if (query && query.trim()) {
          const q = query.trim();
          dbQuery = dbQuery.or(
            `invoice_number.ilike.%${q}%,notes.ilike.%${q}%`
          );
        }

        const { data, count, error } = await dbQuery
          .order("created_at", { ascending: false })
          .range(offset, offset + limit - 1);

        if (error) {
          markTableMissingInSupabase("invoices", error);
          throw error;
        }
        return { invoices: data || [], total: count || 0 };
      };

      return await withTimeout(fetchWithTimeout(), 2000);
    } catch (err: any) {
      markTableMissingInSupabase("invoices", err);
    }
  }

    let list = getLocalInvoices(targetWsId).filter((inv) => inv.is_deleted !== true);

    const { getLocalCustomers } = await import("./customer-service");
    const { getLocalVehicles } = await import("./vehicle-service");
    const { getLocalJobCards } = await import("./job-card-service");
    const { getLocalPayments } = await import("./payment-service");

    const allCustomers = getLocalCustomers();
    const allVehicles = getLocalVehicles();
    const allJobCards = getLocalJobCards();
    const allPayments = getLocalPayments();
    const allItems = getLocalInvoiceItems();

    // Enrich invoice objects
    list = list.map((inv) => {
      const cust = allCustomers.find((c) => c.id === inv.customer_id) || inv.customer || null;
      const veh = allVehicles.find((v) => v.id === inv.vehicle_id) || inv.vehicle || null;
      const jc = allJobCards.find((j) => j.id === inv.job_card_id) || inv.job_card || null;
      const items = (inv.items && inv.items.length > 0)
        ? inv.items
        : allItems.filter((it) => it.invoice_id === inv.id);
      const payments = (inv.payments && inv.payments.length > 0)
        ? inv.payments
        : allPayments.filter((p) => p.invoice_id === inv.id);

      return {
        ...inv,
        customer: cust,
        vehicle: veh,
        job_card: jc,
        items,
        payments,
      };
    });

    if (customerId) {
      list = list.filter((inv) => inv.customer_id === customerId);
    }

    if (statusFilter && statusFilter !== "all") {
      if (statusFilter === "pending" || statusFilter === "credit") {
        list = list.filter((inv) => inv.payment_status === "credit" || inv.payment_status === "pending" || inv.payment_status === "unpaid");
      } else {
        list = list.filter((inv) => inv.payment_status === statusFilter);
      }
    }

    const now = new Date();
    const formatYMD = (d: Date) => d.toISOString().slice(0, 10);

    if (dateFilter === "today") {
      const todayStr = formatYMD(now);
      list = list.filter((inv) => (inv.created_at || "").slice(0, 10) === todayStr);
    } else if (dateFilter === "this_month") {
      const currentMonth = now.toISOString().slice(0, 7); // YYYY-MM
      list = list.filter((inv) => (inv.created_at || "").startsWith(currentMonth));
    } else if (dateFilter === "custom" && startDate && endDate) {
      list = list.filter((inv) => {
        const d = (inv.created_at || "").slice(0, 10);
        return d >= startDate && d <= endDate;
      });
    }

    if (query && query.trim()) {
      const q = query.trim().toLowerCase();
      list = list.filter((inv) => {
        const invNum = (inv.invoice_number || "").toLowerCase();
        const custName = (inv.customer?.name || "").toLowerCase();
        const custPhone = (inv.customer?.mobile || "").toLowerCase();
        const custCompany = (inv.customer?.company_name || "").toLowerCase();
        const vehPlate = (inv.vehicle?.registration_number || "").toLowerCase();
        const vehVin = (inv.vehicle?.chassis_vin || "").toLowerCase();
        const jcNum = (inv.job_card?.job_card_number || "").toLowerCase();

        return (
          invNum.includes(q) ||
          custName.includes(q) ||
          custPhone.includes(q) ||
          custCompany.includes(q) ||
          vehPlate.includes(q) ||
          vehVin.includes(q) ||
          jcNum.includes(q)
        );
      });
    }

    // Sort descending by created_at
    list.sort(
      (a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
    );

    const total = list.length;
    const paginated = list.slice(offset, offset + limit);
    return { invoices: paginated, total };
  }


/**
 * Get single invoice by ID with complete relations, line items, and payment history
 */
export async function getInvoiceById(id: string, workspaceId?: string): Promise<any | null> {
  const targetWsId = workspaceId || getActiveWorkspaceId();
  const supabase = createClient();
  try {
    const fetchWithTimeout = async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select(
          "*, customer:customers(*), vehicle:vehicles(*), job_card:job_cards(*), items:invoice_items(*), payments(*)"
        )
        .eq("id", id)
        .eq("workspace_id", targetWsId)
        .single();

      if (error) throw error;
      return data;
    };

    return await withTimeout(fetchWithTimeout(), 2000);
  } catch (err: any) {
    console.warn(`Reading invoice ${id} from local fallback:`, err.message || err);
    let allInvs: any[] = inMemoryInvoices;
    if (typeof window !== "undefined") {
      try {
        const raw = localStorage.getItem(LOCAL_INVOICES_KEY);
        if (raw) allInvs = JSON.parse(raw);
      } catch {}
    }
    const inv = allInvs.find((item) => item.id === id);
    if (!inv) return null;

    const { getLocalCustomers } = await import("./customer-service");
    const { getLocalVehicles } = await import("./vehicle-service");
    const { getLocalJobCards } = await import("./job-card-service");
    const { getLocalPayments } = await import("./payment-service");

    const allCustomers = getLocalCustomers(targetWsId);
    const allVehicles = getLocalVehicles();
    const allJobCards = getLocalJobCards(targetWsId);
    const allPayments = getLocalPayments();
    const allItems = getLocalInvoiceItems();

    const cust = allCustomers.find((c) => c.id === inv.customer_id) || inv.customer || null;
    const veh = allVehicles.find((v) => v.id === inv.vehicle_id) || inv.vehicle || null;
    const jc = allJobCards.find((j) => j.id === inv.job_card_id) || inv.job_card || null;
    const items = (inv.items && inv.items.length > 0)
      ? inv.items
      : allItems.filter((it) => it.invoice_id === id);
    const payments = (inv.payments && inv.payments.length > 0)
      ? inv.payments
      : allPayments.filter((p) => p.invoice_id === id);

    return {
      ...inv,
      customer: cust,
      vehicle: veh,
      job_card: jc,
      items,
      payments,
    };
  }
}

/**
 * Convert Job Card into Invoice
 * - STRICT DUPLICATE PREVENTION: Checks if invoice already exists for job_card_id.
 * - Automatically populates customer, vehicle, line items (services + spare parts), subtotal, VAT, total, payments.
 * - Preserves existing invoice number without generating conflicting numbering.
 */
export async function generateInvoiceFromJobCard(
  jobCardId: string,
  createdByUserId?: string,
  workspaceId?: string
): Promise<any> {
  const targetWsId = workspaceId || getActiveWorkspaceId();
  const supabase = createClient();
  const { getJobCardById } = await import("./job-card-service");

  // 1. Check for existing invoice to guarantee ONE INVOICE PER JOB CARD
  const existingInvoice = await getInvoiceByJobCardId(jobCardId, targetWsId);
  if (existingInvoice) {
    return existingInvoice;
  }

  // 2. Fetch completed job card with items, customer, vehicle
  const jobCard = await getJobCardById(jobCardId, targetWsId);
  if (!jobCard) throw new Error("Job card not found.");

  const rawItems = jobCard.items || [];

  // Separate services and spare parts
  const serviceItems = rawItems
    .filter((it: any) => it.item_type === "service" || !it.item_type)
    .map((it: any) => {
      const q = Number(it.quantity) || 1;
      const p = Number(it.unit_price) || 0;
      const l = Number(it.labour_charge) || 0;
      const tot = Number(it.total_price) || (q * p + l);
      return {
        item_type: "service" as const,
        service_id: it.service_id || null,
        part_id: null,
        description: it.description || "Service",
        quantity: q,
        unit_price: p,
        total_price: tot,
      };
    });

  const sparePartItems = rawItems
    .filter((it: any) => it.item_type === "part")
    .map((it: any) => {
      const q = Number(it.quantity) || 1;
      const p = Number(it.unit_price) || 0;
      const tot = Number(it.total_price) || (q * p);
      return {
        item_type: "part" as const,
        service_id: null,
        part_id: it.part_id || null,
        description: it.description || "Spare Part",
        quantity: q,
        unit_price: p,
        total_price: tot,
      };
    });

  const allItems = [...serviceItems, ...sparePartItems];

  const servicesTotal = serviceItems.reduce((acc, s) => acc + s.total_price, 0);
  const sparePartsTotal = sparePartItems.reduce((acc, p) => acc + p.total_price, 0);
  const calculatedSubtotal = servicesTotal + sparePartsTotal;

  const subtotal = Number(jobCard.subtotal) || calculatedSubtotal;
  const discount = Number(jobCard.discount) || 0;
  const vatRate = jobCard.vat_rate !== undefined && jobCard.vat_rate !== null && Number.isFinite(Number(jobCard.vat_rate))
    ? Number(jobCard.vat_rate)
    : 5;
  const vatAmount = Number(jobCard.vat_amount) || Math.round(subtotal * (vatRate / 100) * 100) / 100;
  const total = Number(jobCard.total) || Math.round((subtotal + vatAmount - discount) * 100) / 100;

  // Fetch all existing real payment records for this Job Card
  const { getPaymentsByJobCard, getLocalPayments, saveLocalPayments } = await import("./payment-service");
  const existingJobPayments = await getPaymentsByJobCard(jobCard.id, jobCard.workspace_id || targetWsId);
  const existingPaidSum = existingJobPayments.reduce((sum: number, p: any) => sum + (Number(p.amount) || 0), 0);

  // Determine actual paid amount and balance
  const paid = existingPaidSum > 0 ? existingPaidSum : Math.min(total, Math.max(0, Number(jobCard.paid) || 0));
  const balance = Math.max(0, total - paid);

  let payment_status: PaymentStatus = "credit";
  if (balance === 0 && total > 0) {
    payment_status = "paid";
  } else if (paid > 0 && balance > 0) {
    payment_status = "partially_paid";
  }

  // Plain Invoice Number sequence (e.g., "1066", "1067")
  let formattedInvoiceNumber: string;
  if (jobCard.invoice_number) {
    formattedInvoiceNumber = String(jobCard.invoice_number);
  } else {
    formattedInvoiceNumber = await generateNextInvoiceNumber(jobCard.workspace_id || targetWsId);
  }

  const invoiceId = generateUUID();
  const now = new Date().toISOString();
  const wsId = jobCard.workspace_id || targetWsId;

  const invoicePayload = {
    id: invoiceId,
    workspace_id: wsId,
    invoice_number: formattedInvoiceNumber,
    job_card_id: jobCard.id,
    customer_id: jobCard.customer_id,
    vehicle_id: jobCard.vehicle_id,
    subtotal,
    discount,
    vat_rate: vatRate,
    vat_amount: vatAmount,
    total,
    paid,
    balance,
    payment_status,
    notes: jobCard.notes || null,
    created_by: createdByUserId || jobCard.created_by || "Owner",
    created_at: now,
    updated_at: now,
  };

  const invoiceItemsToInsert = allItems.map((it) => ({
    id: generateUUID(),
    invoice_id: invoiceId,
    workspace_id: wsId,
    item_type: it.item_type,
    service_id: it.service_id,
    part_id: it.part_id,
    description: it.description,
    quantity: it.quantity,
    unit_price: it.unit_price,
    total_price: it.total_price,
    created_at: now,
  }));

  // Write to Supabase
  const { data: created, error: invErr } = await supabase
    .from("invoices")
    .insert(invoicePayload)
    .select()
    .single();

  if (invErr) {
    console.error("Failed to insert invoice into Supabase:", invErr);
    throw new Error(`Failed to generate invoice: ${invErr.message}`);
  }

  if (invoiceItemsToInsert.length > 0) {
    const { error: itemsErr } = await supabase
      .from("invoice_items")
      .insert(invoiceItemsToInsert);

    if (itemsErr) {
      console.error("Failed to insert invoice items into Supabase:", itemsErr);
      throw new Error(`Failed to insert invoice items: ${itemsErr.message}`);
    }
  }

  // Carry forward existing payments without creating duplicates
  if (existingJobPayments.length > 0) {
    try {
      await supabase
        .from("payments")
        .update({ invoice_id: invoiceId })
        .eq("job_card_id", jobCard.id);
    } catch (carryErr) {
      console.warn("Updating carried forward payment invoice_id notice:", carryErr);
    }
  } else if (paid > 0) {
    try {
      await supabase.from("payments").insert({
        id: generateUUID(),
        workspace_id: wsId,
        invoice_id: invoiceId,
        job_card_id: jobCard.id,
        customer_id: jobCard.customer_id,
        amount: paid,
        payment_method: (jobCard.payment_status?.toLowerCase().includes("bank")
          ? "bank_transfer"
          : jobCard.payment_status?.toLowerCase().includes("card")
          ? "credit_card"
          : "cash") as PaymentMethod,
        payment_date: jobCard.date || now.slice(0, 10),
        reference_number: formattedInvoiceNumber,
        notes: "Initial Job Card Settlement Payment",
        created_by: createdByUserId || "Owner",
        created_at: now,
      });
    } catch (pErr) {
      console.warn("Initial job card payment recording note:", pErr);
    }
  }

  // Post customer invoice ledger
  try {
    const { postInvoiceLedger } = await import("./ledger-service");
    await postInvoiceLedger({
      id: invoiceId,
      invoice_number: formattedInvoiceNumber,
      customer_id: jobCard.customer_id,
      customer_name: jobCard.customer?.name,
      date: jobCard.date,
      services_total: servicesTotal,
      parts_total: sparePartsTotal,
      subtotal,
      vat_amount: vatAmount,
      total,
      created_by: createdByUserId || "Owner",
    });
  } catch (ledErr) {
    console.warn("Posting invoice ledger on conversion notice:", ledErr);
  }

  invalidateDashboardCache();
  return await getInvoiceById(invoiceId, wsId);
}

export interface DirectPartsSaleItemPayload {
  part_id: string;
  part_name: string;
  part_number?: string;
  brand?: string;
  quantity: number;
  unit_price: number;
  discount?: number;
  cost_price?: number;
}

export interface CreateDirectPartsInvoicePayload {
  customer_type: "walk_in" | "existing" | "new";
  customer_id?: string;
  customer_name: string;
  customer_phone?: string;
  company_name?: string;
  trn_number?: string;

  // Optional Vehicle fields
  vehicle_id?: string | null;
  vehicle_make?: string;
  vehicle_model?: string;
  vehicle_plate?: string;
  vehicle_vin?: string;

  items: DirectPartsSaleItemPayload[];

  discount?: number;
  vat_rate?: number;

  payment_status: "paid" | "partially_paid" | "credit";
  payment_method: "cash" | "bank" | "credit";
  bank_account_id?: string;
  paid_amount?: number;

  notes?: string;
  created_by?: string;
  date?: string;
}

/**
 * Generate Next Plain Sequential Invoice Number (e.g. "1066", "1067"):
 * - Starts automatically from 1066
 * - If invoices exist >= 1066, returns MAX + 1
 * - Preserves multi-workspace isolation
 * - Never duplicates an invoice number
 */
export async function generateNextInvoiceNumber(workspaceId?: string): Promise<string> {
  const targetWsId = workspaceId || getActiveWorkspaceId();
  const num = await getNextInvoiceNumberAsync(targetWsId);
  return String(num);
}

/**
 * Create a Direct Invoice without requiring a Job Card.
 * Supports:
 * 1. Direct Service Invoices (mode: "service")
 * 2. Direct Spare Parts Invoices (mode: "parts")
 * 3. Combined Service + Spare Parts Invoices (mode: "mixed")
 *
 * - Job Card is optional (job_card_id = null).
 * - Vehicle is optional.
 * - Only spare parts deduct inventory; services NEVER affect stock.
 * - Posts revenue cleanly to Labor Revenue (acc-4001) and/or Spare Parts Revenue (acc-4002).
 * - Records settlement payments and updates dashboard cache.
 */
export async function createDirectInvoice(
  payload: CreateDirectInvoicePayload,
  workspaceId?: string
): Promise<any> {
  const targetWsId = workspaceId || getActiveWorkspaceId();
  const supabase = createClient();
  const now = new Date().toISOString();
  const invoiceDate = payload.date || now.slice(0, 10);

  const mode = payload.invoice_type_mode || "mixed";
  const rawServices = payload.services || [];
  const rawParts = payload.parts || [];

  // Validation according to mode
  if (mode === "service" && rawServices.length === 0) {
    throw new Error("Direct Service Invoice must contain at least one service item.");
  }
  if (mode === "parts" && rawParts.length === 0) {
    throw new Error("Direct Spare Parts Invoice must contain at least one spare part.");
  }
  if (rawServices.length === 0 && rawParts.length === 0) {
    throw new Error("Direct Invoice must contain at least one service or spare part.");
  }

  // Determine internal invoice type
  let invoiceType: "direct_service" | "direct_parts" | "direct_mixed" = "direct_mixed";
  if (rawServices.length > 0 && rawParts.length === 0) {
    invoiceType = "direct_service";
  } else if (rawServices.length === 0 && rawParts.length > 0) {
    invoiceType = "direct_parts";
  } else {
    invoiceType = "direct_mixed";
  }

  // 1. Process Services & Optional Save to Catalog
  const verifiedServices: Array<{
    service_id: string | null;
    description: string;
    quantity: number;
    unit_price: number;
    discount: number;
    total_price: number;
  }> = [];

  for (const s of rawServices) {
    const desc = s.description?.trim();
    if (!desc) {
      throw new Error("Service description is required.");
    }
    const qty = Number(s.quantity) > 0 ? Number(s.quantity) : 1;
    const rate = Number(s.unit_price) >= 0 ? Number(s.unit_price) : 0;
    const disc = Number(s.discount) >= 0 ? Number(s.discount) : 0;
    const lineTotal = Math.max(0, qty * rate - disc);

    let resolvedServiceId = s.service_id || null;

    // If manual entry requested to be saved to catalog
    if (s.save_to_catalog && !resolvedServiceId) {
      try {
        const { createService } = await import("./service-catalog-service");
        const createdSrv = await createService({
          name: desc,
          category: "General Maintenance",
          description: desc,
          default_price: rate,
          estimated_time: "1 hr",
          is_active: true,
        });
        if (createdSrv?.id) {
          resolvedServiceId = createdSrv.id;
        }
      } catch (catErr) {
        console.warn("Could not save manual service to catalog:", catErr);
      }
    }

    verifiedServices.push({
      service_id: resolvedServiceId,
      description: desc,
      quantity: qty,
      unit_price: rate,
      discount: disc,
      total_price: lineTotal,
    });
  }

  // 2. Strict Stock Validation for Spare Parts (Catalog vs Manual)
  const verifiedParts: Array<{
    part_id: string | null;
    item_source: "inventory" | "manual";
    part_name: string;
    part_number?: string | null;
    brand?: string | null;
    description?: string | null;
    notes?: string | null;
    unit?: string | null;
    quantity: number;
    unit_price: number;
    discount: number;
    total_price: number;
    cost_price: number;
    currentStock: number;
    partObj: any;
  }> = [];

  if (rawParts.length > 0) {
    const { getPartById } = await import("./parts-service");
    for (const item of rawParts) {
      const qty = Number(item.quantity);
      if (isNaN(qty) || qty <= 0) {
        throw new Error(`Quantity for "${item.part_name}" must be greater than zero.`);
      }

      const isManual = item.item_source === "manual" || !item.part_id;
      if (isManual) {
        const price = Number(item.unit_price) >= 0 ? Number(item.unit_price) : 0;
        const disc = Number(item.discount) >= 0 ? Number(item.discount) : 0;
        const lineTotal = Math.max(0, qty * price - disc);

        verifiedParts.push({
          part_id: null,
          item_source: "manual",
          part_name: item.part_name,
          part_number: item.part_number || null,
          brand: item.brand || null,
          description: item.description || null,
          notes: item.notes || null,
          unit: item.unit || null,
          quantity: qty,
          unit_price: price,
          discount: disc,
          total_price: lineTotal,
          cost_price: Number(item.cost_price) >= 0 ? Number(item.cost_price) : 0,
          currentStock: 0,
          partObj: null,
        });
        continue;
      }

      const part = await getPartById(item.part_id!);
      if (!part) {
        throw new Error(`Spare part "${item.part_name || item.part_id}" was not found in catalog.`);
      }

      const availableStock = Number(part.current_stock) || 0;
      if (qty > availableStock) {
        throw new Error(`Only ${availableStock} units are available in stock for "${part.name}".`);
      }

      const price = Number(item.unit_price) >= 0 ? Number(item.unit_price) : Number(part.selling_price) || 0;
      const disc = Number(item.discount) >= 0 ? Number(item.discount) : 0;
      const lineTotal = Math.max(0, qty * price - disc);

      verifiedParts.push({
        part_id: item.part_id!,
        item_source: "inventory",
        part_name: part.name || item.part_name,
        part_number: item.part_number || part.part_number || null,
        brand: item.brand || part.brand || null,
        description: item.description || part.description || null,
        notes: item.notes || null,
        unit: item.unit || part.unit || null,
        quantity: qty,
        unit_price: price,
        discount: disc,
        total_price: lineTotal,
        cost_price: Number(item.cost_price) >= 0 ? Number(item.cost_price) : Number(part.purchase_price) || 0,
        currentStock: availableStock,
        partObj: part,
      });
    }
  }

  // 3. Resolve Customer
  const { getCustomers, getCustomerById, createCustomer } = await import("./customer-service");
  let resolvedCustomerId = payload.customer_id;
  const rawInputName = payload.customer_name?.trim() || "";
  let resolvedCustomerName = rawInputName || "Walk-in Customer";
  let resolvedCustomerPhone = payload.customer_phone?.trim() || null;
  let resolvedCompany = payload.company_name?.trim() || null;
  let resolvedTrn = payload.trn_number?.trim() || null;

  const isExplicitNameProvided =
    rawInputName !== "" &&
    rawInputName.toLowerCase() !== "walk-in customer" &&
    rawInputName.toLowerCase() !== "walk in customer" &&
    rawInputName.toLowerCase() !== "walk-in" &&
    rawInputName.toLowerCase() !== "walk in";

  if (resolvedCustomerId) {
    // Existing customer selected
    try {
      const existingCust = await getCustomerById(resolvedCustomerId, targetWsId);
      if (existingCust) {
        resolvedCustomerName = rawInputName || existingCust.name;
        if (!resolvedCustomerPhone) resolvedCustomerPhone = existingCust.mobile || null;
        if (!resolvedCompany) resolvedCompany = existingCust.company_name || null;
        if (!resolvedTrn) resolvedTrn = existingCust.trn_number || null;
      }
    } catch {}
  } else if (isExplicitNameProvided) {
    // Manually entered / new customer name (e.g. "FARMAN KHAN", "Ali Ahmad")
    try {
      const created = await createCustomer(
        {
          name: rawInputName,
          mobile: resolvedCustomerPhone,
          email: null,
          address: null,
          company_name: resolvedCompany,
          trn_number: resolvedTrn,
          notes: "Direct invoice customer",
        },
        targetWsId
      );
      resolvedCustomerId = created.id;
      resolvedCustomerName = created.name;
    } catch (e: any) {
      console.warn("Could not create customer record for direct invoice:", e);
      resolvedCustomerId = "cust-" + Date.now() + "-" + Math.random().toString(36).substring(2, 6);
      resolvedCustomerName = rawInputName;
    }
  } else {
    // True Walk-in (no name entered or generic placeholder)
    resolvedCustomerName = "Walk-in Customer";
    try {
      const res = await getCustomers("Walk-in", 1, 10, targetWsId);
      const found = (res.customers || []).find((c: any) =>
        c.name.toLowerCase().includes("walk-in")
      );
      if (found) {
        resolvedCustomerId = found.id;
        resolvedCustomerName = found.name;
        if (!resolvedCustomerPhone) resolvedCustomerPhone = found.mobile;
      } else {
        const created = await createCustomer(
          {
            name: "Walk-in Customer",
            mobile: resolvedCustomerPhone,
            email: null,
            address: null,
            company_name: resolvedCompany,
            trn_number: resolvedTrn,
            notes: "Walk-in counter customer",
          },
          targetWsId
        );
        resolvedCustomerId = created.id;
        resolvedCustomerName = created.name;
      }
    } catch {
      resolvedCustomerId = "cust-walkin-" + targetWsId;
    }
  }

  // 4. Optional Vehicle Resolution
  let resolvedVehicleId: string | null = payload.vehicle_id || null;
  if (!resolvedVehicleId && payload.vehicle_make && payload.vehicle_make.trim()) {
    try {
      const { createVehicle } = await import("./vehicle-service");
      const veh = await createVehicle({
        customer_id: resolvedCustomerId!,
        make: payload.vehicle_make.trim(),
        model: payload.vehicle_model?.trim() || "Standard",
        year: payload.vehicle_year ? Number(payload.vehicle_year) : null,
        color: null,
        mileage: null,
        registration_number: payload.vehicle_plate?.trim() || null,
        chassis_vin: payload.vehicle_vin?.trim() || null,
      });
      resolvedVehicleId = veh.id;
    } catch (e) {
      console.warn("Could not create optional vehicle for direct invoice:", e);
    }
  }

  // 5. Financial Calculations
  const servicesSubtotal = verifiedServices.reduce((sum, s) => sum + s.total_price, 0);
  const partsSubtotal = verifiedParts.reduce((sum, p) => sum + p.total_price, 0);
  const itemsTotal = servicesSubtotal + partsSubtotal;

  const overallDiscount = Number(payload.discount) || 0;
  const taxableSubtotal = Math.max(0, itemsTotal - overallDiscount);

  // Split overall discount proportionally for accounting accuracy
  let netServices = servicesSubtotal;
  let netParts = partsSubtotal;
  if (overallDiscount > 0 && itemsTotal > 0) {
    const discountRatio = 1 - (overallDiscount / itemsTotal);
    netServices = Math.round(servicesSubtotal * discountRatio * 100) / 100;
    netParts = Math.max(0, taxableSubtotal - netServices);
  }

  const vatRate = payload.vat_rate !== undefined && Number.isFinite(Number(payload.vat_rate))
    ? Number(payload.vat_rate)
    : 5;
  const vatAmount = Math.round(taxableSubtotal * (vatRate / 100) * 100) / 100;
  const grandTotal = Math.round((taxableSubtotal + vatAmount) * 100) / 100;

  const paidAmount = payload.payment_status === "credit"
    ? 0
    : payload.payment_status === "paid"
    ? grandTotal
    : Math.min(grandTotal, Math.max(0, Number(payload.paid_amount) || 0));

  const balance = Math.max(0, grandTotal - paidAmount);

  let payment_status: PaymentStatus = "credit";
  if (balance === 0 && grandTotal > 0) {
    payment_status = "paid";
  } else if (paidAmount > 0 && balance > 0) {
    payment_status = "partially_paid";
  }

  const formattedInvoiceNumber = await generateNextInvoiceNumber(targetWsId);
  const invoiceId = generateUUID();

  const invoicePayload: any = {
    id: invoiceId,
    workspace_id: targetWsId,
    invoice_number: formattedInvoiceNumber,
    job_card_id: null,
    customer_id: resolvedCustomerId!,
    vehicle_id: resolvedVehicleId,
    subtotal: taxableSubtotal,
    discount: overallDiscount,
    vat_rate: vatRate,
    vat_amount: vatAmount,
    total: grandTotal,
    paid: paidAmount,
    balance: balance,
    payment_status,
    invoice_type: invoiceType,
    notes: payload.notes || `Direct ${invoiceType === "direct_service" ? "Service" : invoiceType === "direct_parts" ? "Spare Parts" : "Service & Parts"} Invoice`,
    created_by: payload.created_by || "Owner",
    created_at: payload.date ? `${payload.date}T${now.slice(11)}` : now,
    updated_at: now,
  };

  // 6. Build Line Items
  const invoiceItemsToInsert: any[] = [];

  // Service line items
  for (const s of verifiedServices) {
    invoiceItemsToInsert.push({
      id: generateUUID(),
      invoice_id: invoiceId,
      workspace_id: targetWsId,
      item_type: "service" as const,
      service_id: s.service_id,
      part_id: null,
      description: s.description,
      quantity: s.quantity,
      unit_price: s.unit_price,
      total_price: s.total_price,
      cost_price: 0,
      created_at: now,
    });
  }

  // Spare part line items
  for (const p of verifiedParts) {
    invoiceItemsToInsert.push({
      id: generateUUID(),
      invoice_id: invoiceId,
      workspace_id: targetWsId,
      item_type: "part" as const,
      service_id: null,
      part_id: p.part_id,
      description: p.part_number ? `${p.part_name} (${p.part_number})` : p.part_name,
      quantity: p.quantity,
      unit_price: p.unit_price,
      total_price: p.total_price,
      cost_price: p.cost_price,
      created_at: now,
    });
  }

  // 7. Inventory Deduction: ONLY Catalog Spare Parts Deduct Inventory (Services & Manual parts NEVER touch stock)
  const inventoryPartsToDeduct = verifiedParts.filter(
    (p) => p.part_id && p.item_source !== "manual"
  );
  if (inventoryPartsToDeduct.length > 0) {
    const { recordStockTransaction } = await import("./inventory-service");
    for (const item of inventoryPartsToDeduct) {
      try {
        await recordStockTransaction({
          partId: item.part_id!,
          transactionType: "direct_sale",
          quantityChange: -item.quantity,
          unitCost: item.cost_price,
          referenceType: "invoice",
          referenceId: formattedInvoiceNumber,
          notes: `Direct Sale on Invoice #${formattedInvoiceNumber} (${item.quantity} units)`,
          createdBy: payload.created_by || "Owner",
          workspace_id: targetWsId,
        });
      } catch (err: any) {
        console.error(`Failed to deduct inventory for part ${item.part_id}:`, err);
        throw new Error(`Inventory deduction failed: ${err.message}`);
      }
    }
  }

  // 8. Persist to Supabase
  const { error: invErr } = await supabase
    .from("invoices")
    .insert(invoicePayload);

  if (invErr) {
    console.error("Failed to create direct invoice in Supabase:", invErr);
    throw new Error(`Failed to create direct invoice: ${invErr.message}`);
  }

  if (invoiceItemsToInsert.length > 0) {
    const { error: itemsErr } = await supabase
      .from("invoice_items")
      .insert(invoiceItemsToInsert);

    if (itemsErr) {
      console.error("Failed to insert direct invoice items in Supabase:", itemsErr);
      throw new Error(`Failed to create invoice items: ${itemsErr.message}`);
    }
  }

  // 9. Record Payment if paidAmount > 0
  if (paidAmount > 0) {
    const paymentId = generateUUID();
    const methodStr = payload.payment_method === "bank" ? "bank_transfer" : "cash";
    const paymentRecord = {
      id: paymentId,
      workspace_id: targetWsId,
      invoice_id: invoiceId,
      job_card_id: null,
      customer_id: resolvedCustomerId!,
      amount: paidAmount,
      payment_method: methodStr as PaymentMethod,
      payment_date: invoiceDate,
      reference_number: formattedInvoiceNumber,
      notes: `Direct Invoice Settlement (${payload.payment_method.toUpperCase()})`,
      created_by: payload.created_by || "Owner",
      created_at: now,
    };

    const { error: payErr } = await supabase.from("payments").insert(paymentRecord);
    if (payErr) {
      console.warn("Direct invoice payment recording notice:", payErr);
    }

    // Post Payment to Ledger
    try {
      const { postCustomerPaymentLedger } = await import("./ledger-service");
      await postCustomerPaymentLedger({
        id: paymentId,
        customer_id: resolvedCustomerId,
        customer_name: resolvedCustomerName,
        invoice_number: formattedInvoiceNumber,
        amount: paidAmount,
        payment_method: methodStr,
        reference_number: formattedInvoiceNumber,
        payment_date: invoiceDate,
        created_by: payload.created_by || "Owner",
      });
    } catch (ledgPayErr) {
      console.warn("Ledger customer payment posting notice:", ledgPayErr);
    }
  }

  // 10. Post Invoice to Ledger (acc-4001 Service Revenue and/or acc-4002 Spare Parts Revenue)
  try {
    const { postInvoiceLedger } = await import("./ledger-service");
    await postInvoiceLedger({
      id: invoiceId,
      invoice_number: formattedInvoiceNumber,
      customer_id: resolvedCustomerId,
      customer_name: resolvedCustomerName,
      date: invoiceDate,
      created_at: invoicePayload.created_at,
      services_total: netServices,
      parts_total: netParts,
      subtotal: taxableSubtotal,
      vat_amount: vatAmount,
      total: grandTotal,
      created_by: payload.created_by || "Owner",
    });
  } catch (ledgInvErr) {
    console.warn("Ledger invoice posting notice:", ledgInvErr);
  }

  invalidateDashboardCache();
  return await getInvoiceById(invoiceId, targetWsId);
}

/**
 * Backward compatibility wrapper for Direct Spare Parts Sale.
 */
export async function createDirectPartsInvoice(
  payload: CreateDirectPartsInvoicePayload,
  workspaceId?: string
): Promise<any> {
  return createDirectInvoice(
    {
      invoice_type_mode: "parts",
      customer_type: payload.customer_type,
      customer_id: payload.customer_id,
      customer_name: payload.customer_name,
      customer_phone: payload.customer_phone,
      company_name: payload.company_name,
      trn_number: payload.trn_number,
      vehicle_id: payload.vehicle_id,
      vehicle_make: payload.vehicle_make,
      vehicle_model: payload.vehicle_model,
      vehicle_plate: payload.vehicle_plate,
      vehicle_vin: payload.vehicle_vin,
      parts: (payload.items || []).map((it) => ({
        part_id: it.part_id,
        part_name: it.part_name,
        part_number: it.part_number,
        quantity: it.quantity,
        unit_price: it.unit_price,
        discount: it.discount,
        cost_price: it.cost_price,
      })),
      discount: payload.discount,
      vat_rate: payload.vat_rate,
      payment_status: payload.payment_status,
      payment_method: payload.payment_method,
      bank_account_id: payload.bank_account_id,
      paid_amount: payload.paid_amount,
      notes: payload.notes,
      created_by: payload.created_by,
      date: payload.date,
    },
    workspaceId
  );
}

/**
 * Record payment against an invoice
 * - Handles multiple split payments (e.g. Cash 400 + Bank Transfer 440).
 * - Accurately updates Paid Amount, Balance, and Payment Status (Paid / Partially Paid / Pending).
 * - Synchronizes Job Card balance and Customer Outstanding balance in real-time.
 * - Refreshes dashboard metrics immediately.
 */
export async function recordInvoicePayment(
  invoiceId: string,
  amount: number,
  paymentMethod: PaymentMethod | string = "cash",
  referenceNumber?: string | null,
  notes?: string | null,
  paymentDate?: string,
  createdBy?: string | null
): Promise<any> {
  const supabase = createClient();
  const now = new Date().toISOString();
  const cleanAmount = Number(amount);

  if (isNaN(cleanAmount) || cleanAmount <= 0) {
    throw new Error("Payment amount must be greater than zero.");
  }

  // 1. Fetch current invoice
  const invoice = await getInvoiceById(invoiceId);
  if (!invoice) {
    throw new Error(`Invoice #${invoiceId} not found.`);
  }

  if (invoice.payment_status === "void" || invoice.is_void) {
    throw new Error("Cannot record payment against a voided invoice.");
  }

  const currentPaid = Number(invoice.paid) || 0;
  const totalAmount = Number(invoice.total) || 0;
  const newPaid = currentPaid + cleanAmount;
  const newBalance = Math.max(0, totalAmount - newPaid);

  let newStatus: PaymentStatus = "credit";
  if (newBalance === 0 && totalAmount > 0) {
    newStatus = "paid";
  } else if (newPaid > 0 && newBalance > 0) {
    newStatus = "partially_paid";
  }

  const targetWsId = invoice.workspace_id || getActiveWorkspaceId();
  const paymentId = generateUUID();
  const paymentRecord: Payment = {
    id: paymentId,
    workspace_id: targetWsId,
    invoice_id: invoiceId,
    job_card_id: invoice.job_card_id || null,
    customer_id: invoice.customer_id,
    amount: cleanAmount,
    payment_method: paymentMethod as PaymentMethod,
    reference_number: referenceNumber || null,
    payment_date: paymentDate || now.slice(0, 10),
    notes: notes || `Payment for Invoice #${invoice.invoice_number}`,
    created_by: createdBy || "Owner",
    created_at: now,
  };

  // 1. Insert Payment in Supabase
  const { error: payErr } = await supabase.from("payments").insert(paymentRecord);
  if (payErr) {
    console.error("Failed to insert payment in Supabase:", payErr);
    throw new Error(`Failed to record payment: ${payErr.message}`);
  }

  // 2. Update Invoice
  const { data: updatedInvoice, error: invErr } = await supabase
    .from("invoices")
    .update({
      paid: newPaid,
      balance: newBalance,
      payment_status: newStatus,
      updated_at: now,
    })
    .eq("id", invoiceId)
    .select()
    .single();

  if (invErr) {
    console.error("Failed to update invoice in Supabase:", invErr);
    throw new Error(`Failed to update invoice: ${invErr.message}`);
  }

  // 3. Synchronize linked Job Card if any
  if (invoice.job_card_id) {
    try {
      await supabase
        .from("job_cards")
        .update({
          paid: newPaid,
          balance: newBalance,
          payment_status: newStatus === "paid" ? "Paid Full" : newStatus === "partially_paid" ? "Partially Paid" : "Pending",
          updated_at: now,
        })
        .eq("id", invoice.job_card_id);
    } catch (jcErr) {
      console.warn("Synchronizing job card on payment notice:", jcErr);
    }
  }

  // 4. Ledger sync
  try {
    const { postCustomerPaymentLedger } = await import("./ledger-service");
    await postCustomerPaymentLedger({
      id: paymentId,
      customer_id: invoice.customer_id,
      invoice_id: invoiceId,
      job_card_id: invoice.job_card_id || undefined,
      invoice_number: invoice.invoice_number,
      amount: cleanAmount,
      payment_method: paymentMethod as any,
      reference_number: referenceNumber || invoice.invoice_number,
      payment_date: paymentDate || now.slice(0, 10),
      created_by: createdBy || "Owner",
    });
  } catch (ledgPayErr) {
    console.warn("Ledger customer payment posting notice:", ledgPayErr);
  }

  invalidateDashboardCache();
  return { payment: paymentRecord, invoice: updatedInvoice };
}

/**
 * Void Invoice with Audit Safety
 * - Owner/Admin only.
 * - Does NOT destroy existing payment records (preserves financial audit trail).
 * - Marks status as 'void'.
 */
export async function voidInvoice(invoiceId: string, voidReason: string, voidedBy?: string, workspaceId?: string): Promise<any> {
  const supabase = createClient();
  const now = new Date().toISOString();
  const targetWsId = workspaceId || getActiveWorkspaceId();

  const invoice = await getInvoiceById(invoiceId, targetWsId);
  if (!invoice) throw new Error("Invoice not found.");

  const voidData = {
    is_void: true,
    payment_status: "void" as PaymentStatus,
    balance: 0,
    void_reason: voidReason || "Voided by management",
    voided_by: voidedBy || "Owner",
    voided_at: now,
    updated_at: now,
  };

  // Reverse stock deductions for any spare parts sold on this invoice
  if (invoice.items && Array.isArray(invoice.items)) {
    for (const item of invoice.items) {
      if (item.item_type === "part" && item.part_id) {
        try {
          const { recordStockTransaction } = await import("./inventory-service");
          await recordStockTransaction({
            partId: item.part_id,
            transactionType: "return",
            quantityChange: Math.abs(Number(item.quantity) || 1),
            unitCost: Number(item.cost_price || item.unit_price || 0),
            referenceType: "invoice_void",
            referenceId: invoice.invoice_number,
            notes: `Stock reversal for voided invoice #${invoice.invoice_number}`,
            createdBy: voidedBy || "Owner",
            workspace_id: invoice.workspace_id || targetWsId,
          });
        } catch (stockErr) {
          console.warn(`Could not reverse stock for item ${item.part_id}:`, stockErr);
        }
      }
    }
  }

  const { data: updated, error } = await supabase
    .from("invoices")
    .update(voidData)
    .eq("id", invoiceId)
    .select()
    .single();

  if (error) {
    console.error("Failed to void invoice in Supabase:", error);
    throw new Error(`Failed to void invoice: ${error.message}`);
  }

  invalidateDashboardCache();
  return updated;
}

export interface SyncInvoiceResult {
  updated: boolean;
  invoice: any;
  message: string;
  diff?: {
    oldTotal: number;
    newTotal: number;
    oldSubtotal: number;
    newSubtotal: number;
    oldItemsCount: number;
    newItemsCount: number;
    oldBalance: number;
    newBalance: number;
    itemsChanged: boolean;
  };
}

/**
 * Synchronize an Invoice with its linked Job Card
 * - Idempotent
 * - Preserves existing invoice number & invoice ID
 * - Preserves all existing payment records & recalculates balance from actual valid payments
 * - Updates line items (services and spare parts) to match latest Job Card
 * - Updates customer & vehicle links if changed on Job Card
 * - Recalculates subtotal, VAT, total, and balance
 * - Safe for inventory: does NOT double-deduct stock
 * - Workspace-isolated
 */
export async function syncInvoiceFromJobCard(
  invoiceId: string,
  updatedByUserId?: string,
  workspaceId?: string
): Promise<SyncInvoiceResult> {
  const targetWsId = workspaceId || getActiveWorkspaceId();
  const supabase = createClient();
  const { getJobCardById } = await import("./job-card-service");
  const { getPaymentsByInvoice } = await import("./payment-service");

  // 1. Fetch the invoice
  const invoice = await getInvoiceById(invoiceId, targetWsId);
  if (!invoice) {
    throw new Error("Invoice not found.");
  }

  // 2. Validate linked job card
  if (!invoice.job_card_id) {
    throw new Error("This invoice is not linked to any Job Card.");
  }

  // 3. Security: Check workspace
  if (invoice.workspace_id && targetWsId && invoice.workspace_id !== targetWsId) {
    throw new Error("Cannot sync invoice from another workspace.");
  }

  // 4. Check if invoice is voided
  if (invoice.payment_status === "void" || invoice.is_void) {
    throw new Error("Cannot sync a voided invoice.");
  }

  // 5. Fetch latest Job Card
  const jobCard = await getJobCardById(invoice.job_card_id, invoice.workspace_id || targetWsId);
  if (!jobCard) {
    throw new Error("Linked Job Card not found or has been removed.");
  }

  if (jobCard.workspace_id && invoice.workspace_id && jobCard.workspace_id !== invoice.workspace_id) {
    throw new Error("Workspace mismatch between Job Card and Invoice.");
  }

  // 6. Build latest line items from Job Card
  const rawItems = jobCard.items || [];

  const serviceItems = rawItems
    .filter((it: any) => it.item_type === "service" || !it.item_type)
    .map((it: any) => {
      const q = Number(it.quantity) || 1;
      const p = Number(it.unit_price) || 0;
      const l = Number(it.labour_charge) || 0;
      const tot = Number(it.total_price) || (q * p + l);
      return {
        item_type: "service" as const,
        service_id: it.service_id || null,
        part_id: null,
        description: it.description || "Service",
        quantity: q,
        unit_price: p,
        total_price: tot,
      };
    });

  const sparePartItems = rawItems
    .filter((it: any) => it.item_type === "part")
    .map((it: any) => {
      const q = Number(it.quantity) || 1;
      const p = Number(it.unit_price) || 0;
      const tot = Number(it.total_price) || (q * p);
      return {
        item_type: "part" as const,
        service_id: null,
        part_id: it.part_id || null,
        description: it.description || "Spare Part",
        quantity: q,
        unit_price: p,
        total_price: tot,
      };
    });

  const allItems = [...serviceItems, ...sparePartItems];

  const servicesTotal = serviceItems.reduce((acc, s) => acc + s.total_price, 0);
  const sparePartsTotal = sparePartItems.reduce((acc, p) => acc + p.total_price, 0);
  const calculatedSubtotal = servicesTotal + sparePartsTotal;

  const subtotal = Number(jobCard.subtotal) || calculatedSubtotal;
  const discount = Number(jobCard.discount) || 0;
  const taxableAmount = Math.max(0, subtotal - discount);
  const vatRate = jobCard.vat_rate !== undefined && jobCard.vat_rate !== null && Number.isFinite(Number(jobCard.vat_rate))
    ? Number(jobCard.vat_rate)
    : 5;
  const vatAmount = Number(jobCard.vat_amount) || Math.round(taxableAmount * (vatRate / 100) * 100) / 100;
  const total = Number(jobCard.total) || Math.round((taxableAmount + vatAmount) * 100) / 100;

  // 7. Calculate payments and balance strictly from actual existing valid payments
  const existingPayments = await getPaymentsByInvoice(invoice.id, invoice.workspace_id || targetWsId);
  const totalPaid = existingPayments.length > 0
    ? existingPayments.reduce((sum: number, p: any) => sum + (Number(p.amount) || 0), 0)
    : Number(invoice.paid) || 0;

  const balance = Math.max(0, total - totalPaid);

  let payment_status: PaymentStatus = "credit";
  if (balance === 0 && total > 0) {
    payment_status = "paid";
  } else if (totalPaid > 0 && balance > 0) {
    payment_status = "partially_paid";
  } else if (totalPaid > total) {
    payment_status = "paid"; // Overpayment situation
  }

  // 8. Check for differences (Idempotency check)
  const oldItems = invoice.items || [];
  const itemsChanged =
    oldItems.length !== allItems.length ||
    allItems.some((newItem, idx) => {
      const oldItem = oldItems[idx];
      if (!oldItem) return true;
      return (
        oldItem.item_type !== newItem.item_type ||
        oldItem.description !== newItem.description ||
        Number(oldItem.quantity) !== Number(newItem.quantity) ||
        Number(oldItem.unit_price) !== Number(newItem.unit_price) ||
        Number(oldItem.total_price) !== Number(newItem.total_price) ||
        (oldItem.part_id || null) !== (newItem.part_id || null) ||
        (oldItem.service_id || null) !== (newItem.service_id || null)
      );
    });

  const headersChanged =
    Number(invoice.subtotal) !== subtotal ||
    Number(invoice.discount) !== discount ||
    Number(invoice.vat_rate) !== vatRate ||
    Number(invoice.vat_amount) !== vatAmount ||
    Number(invoice.total) !== total ||
    Number(invoice.paid) !== totalPaid ||
    Number(invoice.balance) !== balance ||
    invoice.customer_id !== jobCard.customer_id ||
    invoice.vehicle_id !== jobCard.vehicle_id;

  if (!itemsChanged && !headersChanged) {
    return {
      updated: false,
      invoice,
      message: "No changes found. Invoice is already up to date.",
    };
  }

  const now = new Date().toISOString();
  const wsId = invoice.workspace_id || targetWsId;

  // 9. Prepare new items with stable IDs
  const invoiceItemsToInsert = allItems.map((it) => ({
    id: generateUUID(),
    invoice_id: invoice.id,
    workspace_id: wsId,
    item_type: it.item_type,
    service_id: it.service_id,
    part_id: it.part_id,
    description: it.description,
    quantity: it.quantity,
    unit_price: it.unit_price,
    total_price: it.total_price,
    created_at: now,
  }));

  const invoiceUpdatePayload = {
    customer_id: jobCard.customer_id,
    vehicle_id: jobCard.vehicle_id,
    subtotal,
    discount,
    vat_rate: vatRate,
    vat_amount: vatAmount,
    total,
    paid: totalPaid,
    balance,
    payment_status,
    notes: jobCard.notes || invoice.notes || null,
    updated_at: now,
  };

  // 10. Persist changes in Supabase
  const { data: updatedInv, error: invUpdateErr } = await supabase
    .from("invoices")
    .update(invoiceUpdatePayload)
    .eq("id", invoice.id)
    .select()
    .single();

  if (invUpdateErr) {
    console.error("Failed to update synced invoice in Supabase:", invUpdateErr);
    throw new Error(`Failed to sync invoice: ${invUpdateErr.message}`);
  }

  // Replace invoice items in Supabase
  const { error: delErr } = await supabase
    .from("invoice_items")
    .delete()
    .eq("invoice_id", invoice.id);

  if (delErr) {
    console.error("Failed to clear old invoice items in Supabase:", delErr);
    throw new Error(`Failed to update invoice items: ${delErr.message}`);
  }

  if (invoiceItemsToInsert.length > 0) {
    const { error: insertItemsErr } = await supabase
      .from("invoice_items")
      .insert(invoiceItemsToInsert);

    if (insertItemsErr) {
      console.error("Failed to insert synced invoice items in Supabase:", insertItemsErr);
      throw new Error(`Failed to insert synced invoice items: ${insertItemsErr.message}`);
    }
  }

  // Update Ledger
  try {
    const { postInvoiceLedger } = await import("./ledger-service");
    await postInvoiceLedger({
      id: invoice.id,
      invoice_number: invoice.invoice_number,
      customer_id: jobCard.customer_id,
      customer_name: jobCard.customer?.name,
      date: invoice.created_at || jobCard.date,
      services_total: servicesTotal,
      parts_total: sparePartsTotal,
      subtotal,
      vat_amount: vatAmount,
      total,
      created_by: updatedByUserId || invoice.created_by || "Owner",
    });
  } catch (ledErr) {
    console.warn("Ledger post update on invoice sync notice:", ledErr);
  }

  // Audit Log
  console.info(
    `[Invoice Sync Audit] Invoice ${invoice.invoice_number || invoice.id} synced from Job Card ${jobCard.job_card_number || jobCard.id} by ${updatedByUserId || "Owner"}. Old Total: AED ${invoice.total} -> New Total: AED ${total}`
  );

  invalidateDashboardCache();

  const refreshedInvoice = await getInvoiceById(invoice.id, wsId);

  return {
    updated: true,
    invoice: refreshedInvoice,
    message: "Invoice updated from Job Card.",
    diff: {
      oldTotal: Number(invoice.total),
      newTotal: total,
      oldSubtotal: Number(invoice.subtotal),
      newSubtotal: subtotal,
      oldItemsCount: oldItems.length,
      newItemsCount: invoiceItemsToInsert.length,
      oldBalance: Number(invoice.balance),
      newBalance: balance,
      itemsChanged,
    },
  };
}
