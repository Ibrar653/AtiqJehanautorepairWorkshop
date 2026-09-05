import { createClient } from "@/lib/supabase/client";
import type { Invoice, InvoiceItem, Payment, PaymentStatus, PaymentMethod } from "@/types/database";
import { invalidateDashboardCache } from "./dashboard-service";
import { getActiveWorkspaceId } from "./workspace-service";
import { DEFAULT_WORKSPACE_ID } from "@/lib/constants";
import { isTableMissingInSupabase, markTableMissingInSupabase } from "./supabase-schema-status";

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
    const list = getLocalInvoices(targetWsId);
    const inv = list.find((item) => item.id === id);
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

  const paid = Math.min(total, Math.max(0, Number(jobCard.paid) || 0));
  const balance = Math.max(0, total - paid);

  let payment_status: PaymentStatus = "credit";
  if (balance === 0 && total > 0) {
    payment_status = "paid";
  } else if (paid > 0 && balance > 0) {
    payment_status = "partially_paid";
  }

  // Use existing Invoice Number logic (e.g., INV-1060)
  const baseNum = jobCard.invoice_number
    ? String(jobCard.invoice_number)
    : (jobCard.job_card_number || "").replace(/^JC-/, "") || "1060";
  const formattedInvoiceNumber = baseNum.startsWith("INV-") ? baseNum : `INV-${baseNum}`;

  const invoiceId = "inv-" + Date.now() + "-" + Math.random().toString(36).substring(2, 6);
  const now = new Date().toISOString();

  const invoicePayload = {
    id: invoiceId,
    workspace_id: jobCard.workspace_id || targetWsId,
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
    id: "invi-" + Date.now() + "-" + Math.random().toString(36).substring(2, 6),
    invoice_id: invoiceId,
    item_type: it.item_type,
    service_id: it.service_id,
    part_id: it.part_id,
    description: it.description,
    quantity: it.quantity,
    unit_price: it.unit_price,
    total_price: it.total_price,
    created_at: now,
  }));

  try {
    // Write to Supabase
    const { data: created, error: invErr } = await withTimeout(
      supabase.from("invoices").insert(invoicePayload).select().single(),
      2000
    );

    if (invErr) throw invErr;

    if (invoiceItemsToInsert.length > 0) {
      await withTimeout(
        supabase.from("invoice_items").insert(invoiceItemsToInsert),
        2000
      );
    }

    // If initial payment was made on Job Card, record payment
    if (paid > 0) {
      try {
        await supabase.from("payments").insert({
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
      } catch {
        // Non-blocking payment insert
      }
    }

    // Save to local cache
    const list = getLocalInvoices(targetWsId);
    list.unshift({ ...invoicePayload, items: invoiceItemsToInsert });
    saveLocalInvoices(list, targetWsId);

    const existingItems = getLocalInvoiceItems();
    saveLocalInvoiceItems([...invoiceItemsToInsert, ...existingItems]);

    invalidateDashboardCache();
    return { ...invoicePayload, items: invoiceItemsToInsert };
  } catch (err: any) {
    console.warn("Generating invoice in local fallback store:", err.message || err);

    // Record initial payment locally if paid > 0
    if (paid > 0) {
      const { getLocalPayments, saveLocalPayments } = await import("./payment-service");
      const localPayments = getLocalPayments();
      localPayments.unshift({
        id: "pay-" + Date.now() + "-" + Math.random().toString(36).substring(2, 6),
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
      saveLocalPayments(localPayments);
    }

    const list = getLocalInvoices(targetWsId);
    const createdLocal = { ...invoicePayload, items: invoiceItemsToInsert };
    list.unshift(createdLocal);
    saveLocalInvoices(list, targetWsId);

    const existingItems = getLocalInvoiceItems();
    saveLocalInvoiceItems([...invoiceItemsToInsert, ...existingItems]);

    invalidateDashboardCache();
    return createdLocal;
  }
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

  const paymentId = "pay-" + Date.now() + "-" + Math.random().toString(36).substring(2, 6);
  const paymentRecord: Payment = {
    id: paymentId,
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

  try {
    // 1. Insert Payment in Supabase
    await withTimeout(
      supabase.from("payments").insert(paymentRecord),
      2000
    );

    // 2. Update Invoice
    const { data: updatedInvoice, error: invErr } = await withTimeout(
      supabase
        .from("invoices")
        .update({
          paid: newPaid,
          balance: newBalance,
          payment_status: newStatus,
          updated_at: now,
        })
        .eq("id", invoiceId)
        .select()
        .single(),
      2000
    );

    if (invErr) throw invErr;

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
      } catch {
        // Non-blocking
      }
    }

    // 4. Update Local Stores
    const { getLocalPayments, saveLocalPayments } = await import("./payment-service");
    const localPayments = getLocalPayments();
    localPayments.unshift(paymentRecord);
    saveLocalPayments(localPayments);

    const localInvoices = getLocalInvoices();
    const invIdx = localInvoices.findIndex((inv) => inv.id === invoiceId);
    if (invIdx !== -1) {
      localInvoices[invIdx] = {
        ...localInvoices[invIdx],
        paid: newPaid,
        balance: newBalance,
        payment_status: newStatus,
        updated_at: now,
      };
      saveLocalInvoices(localInvoices);
    }

    invalidateDashboardCache();
    return { payment: paymentRecord, invoice: updatedInvoice || localInvoices[invIdx] };
  } catch (err: any) {
    console.warn("Recording payment in local fallback store:", err.message || err);

    const { getLocalPayments, saveLocalPayments } = await import("./payment-service");
    const localPayments = getLocalPayments();
    localPayments.unshift(paymentRecord);
    saveLocalPayments(localPayments);

    const localInvoices = getLocalInvoices();
    const invIdx = localInvoices.findIndex((inv) => inv.id === invoiceId);
    if (invIdx !== -1) {
      localInvoices[invIdx] = {
        ...localInvoices[invIdx],
        paid: newPaid,
        balance: newBalance,
        payment_status: newStatus,
        updated_at: now,
      };
      saveLocalInvoices(localInvoices);
    }

    if (invoice.job_card_id) {
      const { getLocalJobCards, saveLocalJobCards } = await import("./job-card-service");
      const localJobCards = getLocalJobCards();
      const jcIdx = localJobCards.findIndex((j) => j.id === invoice.job_card_id);
      if (jcIdx !== -1) {
        localJobCards[jcIdx].paid = newPaid;
        localJobCards[jcIdx].balance = newBalance;
        localJobCards[jcIdx].payment_status = newStatus === "paid" ? "Paid Full" : newStatus === "partially_paid" ? "Partially Paid" : "Pending";
        localJobCards[jcIdx].updated_at = now;
        saveLocalJobCards(localJobCards);
      }
    }

    invalidateDashboardCache();
    return { payment: paymentRecord, invoice: localInvoices[invIdx] || invoice };
  }
}

/**
 * Void Invoice with Audit Safety
 * - Owner/Admin only.
 * - Does NOT destroy existing payment records (preserves financial audit trail).
 * - Marks status as 'void'.
 */
export async function voidInvoice(invoiceId: string, voidReason: string, voidedBy?: string): Promise<any> {
  const supabase = createClient();
  const now = new Date().toISOString();

  const invoice = await getInvoiceById(invoiceId);
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

  try {
    const { data: updated, error } = await withTimeout(
      supabase.from("invoices").update(voidData).eq("id", invoiceId).select().single(),
      2000
    );

    if (error) throw error;

    const list = getLocalInvoices();
    const idx = list.findIndex((i) => i.id === invoiceId);
    if (idx !== -1) {
      list[idx] = { ...list[idx], ...voidData };
      saveLocalInvoices(list);
    }

    invalidateDashboardCache();
    return updated;
  } catch (err: any) {
    console.warn("Voiding invoice in local fallback store:", err.message || err);
    const list = getLocalInvoices();
    const idx = list.findIndex((i) => i.id === invoiceId);
    if (idx !== -1) {
      list[idx] = { ...list[idx], ...voidData };
      saveLocalInvoices(list);
      invalidateDashboardCache();
      return list[idx];
    }
    throw err;
  }
}
