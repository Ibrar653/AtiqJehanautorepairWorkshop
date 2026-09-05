import { createClient } from "@/lib/supabase/client";
import type {
  Customer,
  Vehicle,
  JobCard,
  Expense,
  Supplier,
  Part,
  Service,
  Purchase,
  Invoice,
  Payment,
  LedgerAccount,
  UserRole,
} from "@/types/database";
import { getLocalCustomers, saveLocalCustomers } from "./customer-service";
import { getLocalVehicles, saveLocalVehicles } from "./vehicle-service";
import { getLocalJobCards, saveLocalJobCards } from "./job-card-service";
import {
  getLocalExpenses,
  saveLocalExpenses,
  softDeleteExpense,
  restoreExpense,
  permanentlyDeleteExpense,
} from "./expense-service";
import { getLocalSuppliers, saveLocalSuppliers } from "./supplier-service";
import { getLocalParts, saveLocalParts } from "./parts-service";
import { getLocalServices, saveLocalServices } from "./service-catalog-service";
import { getLocalPurchases, saveLocalPurchases } from "./purchase-service";
import { getLocalInvoices, saveLocalInvoices } from "./invoice-service";
import { getLocalPayments, saveLocalPayments } from "./payment-service";
import { getLocalAccounts, saveLocalAccounts } from "./ledger-service";

// ─── TYPES ──────────────────────────────────────────────────────────────────

export type RecycleBinRecordType =
  | "customer"
  | "vehicle"
  | "job_card"
  | "service"
  | "part"
  | "supplier"
  | "purchase"
  | "invoice"
  | "payment"
  | "expense"
  | "ledger_account";

export type RecycleBinTabType =
  | "all"
  | "customers"
  | "vehicles"
  | "job_cards"
  | "services"
  | "parts"
  | "suppliers"
  | "purchases"
  | "invoices"
  | "payments"
  | "expenses"
  | "ledger_accounts";

export type RecycleBinDateFilter =
  | "all"
  | "today"
  | "yesterday"
  | "last_7_days"
  | "this_month"
  | "last_month"
  | "this_year"
  | "custom";

export type RecycleBinSortOption =
  | "newest"
  | "oldest"
  | "name_asc"
  | "record_type";

export type RecycleBinAction =
  | "DELETED"
  | "RESTORED"
  | "PERMANENTLY_DELETED"
  | "DELETE_BLOCKED";

export interface RecycleBinItem {
  id: string;
  type: RecycleBinRecordType;
  nameOrNumber: string;
  reference: string;
  source_module: string;
  details: string;
  deleted_at: string;
  deleted_by: string;
  rawData: any;
}

export interface RecycleBinHistoryEvent {
  id: string;
  record_type: RecycleBinRecordType;
  record_id: string;
  record_reference?: string | null;
  record_name: string;
  source_module: string;
  action: RecycleBinAction;
  performed_by: string;
  performed_at: string;
  reason?: string | null;
  metadata?: Record<string, any> | null;
}

export interface RecycleBinSummaryCounts {
  totalDeleted: number;
  deletedToday: number;
  customers: number;
  jobCards: number;
  spareParts: number;
  other: number;
}

export interface RecycleBinFilterOptions {
  type?: RecycleBinTabType;
  searchQuery?: string;
  dateFilter?: RecycleBinDateFilter;
  startDate?: string;
  endDate?: string;
  sortBy?: RecycleBinSortOption;
}

const LOCAL_RECYCLE_BIN_HISTORY_KEY = "atiq_recycle_bin_history";

// ─── LOCAL AUDIT HISTORY HELPERS ────────────────────────────────────────────

let inMemoryRecycleBinHistory: RecycleBinHistoryEvent[] = [];

export function getLocalRecycleBinHistory(): RecycleBinHistoryEvent[] {
  if (typeof window === "undefined") return inMemoryRecycleBinHistory;
  try {
    const raw = localStorage.getItem(LOCAL_RECYCLE_BIN_HISTORY_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
    return inMemoryRecycleBinHistory;
  } catch {
    return inMemoryRecycleBinHistory;
  }
}

export function saveLocalRecycleBinHistory(history: RecycleBinHistoryEvent[]) {
  inMemoryRecycleBinHistory = history;
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LOCAL_RECYCLE_BIN_HISTORY_KEY, JSON.stringify(history));
  } catch (e) {
    console.error("Failed to save local recycle bin history", e);
  }
}

/**
 * Log an audit history event to both Supabase and localStorage
 */
export async function logRecycleBinAction(event: {
  record_type: RecycleBinRecordType;
  record_id: string;
  record_reference?: string | null;
  record_name: string;
  source_module: string;
  action: RecycleBinAction;
  performed_by: string;
  reason?: string | null;
  metadata?: Record<string, any> | null;
}): Promise<RecycleBinHistoryEvent> {
  const newEntry: RecycleBinHistoryEvent = {
    id: "rbh-" + Date.now() + "-" + Math.random().toString(36).substring(2, 7),
    record_type: event.record_type,
    record_id: event.record_id,
    record_reference: event.record_reference || null,
    record_name: event.record_name,
    source_module: event.source_module,
    action: event.action,
    performed_by: event.performed_by,
    performed_at: new Date().toISOString(),
    reason: event.reason || null,
    metadata: event.metadata || null,
  };

  // 1. Save to local storage cache immediately
  const localHistory = getLocalRecycleBinHistory();
  saveLocalRecycleBinHistory([newEntry, ...localHistory]);

  // 2. Attempt insert to Supabase recycle_bin_history table
  try {
    const supabase = createClient();
    await supabase.from("recycle_bin_history").insert({
      record_type: newEntry.record_type,
      record_id: newEntry.record_id,
      record_reference: newEntry.record_reference,
      record_name: newEntry.record_name,
      source_module: newEntry.source_module,
      action: newEntry.action,
      performed_by: newEntry.performed_by,
      performed_at: newEntry.performed_at,
      reason: newEntry.reason,
      metadata: newEntry.metadata,
    });
  } catch (err) {
    console.warn("Recycle bin history remote sync fallback:", err);
  }

  return newEntry;
}

/**
 * Get audit history events with optional filtering
 */
export async function getRecycleBinHistory(filters?: {
  record_type?: string;
  action?: string;
  search?: string;
  startDate?: string;
  endDate?: string;
}): Promise<RecycleBinHistoryEvent[]> {
  const supabase = createClient();
  const q = filters?.search?.trim().toLowerCase() || "";

  try {
    let query = supabase
      .from("recycle_bin_history")
      .select("*")
      .order("performed_at", { ascending: false });

    if (filters?.record_type && filters.record_type !== "all") {
      query = query.eq("record_type", filters.record_type);
    }
    if (filters?.action && filters.action !== "all") {
      query = query.eq("action", filters.action);
    }
    if (filters?.startDate) {
      query = query.gte("performed_at", filters.startDate + "T00:00:00Z");
    }
    if (filters?.endDate) {
      query = query.lte("performed_at", filters.endDate + "T23:59:59Z");
    }
    if (q) {
      query = query.or(`record_name.ilike.%${q}%,record_reference.ilike.%${q}%,performed_by.ilike.%${q}%`);
    }

    const { data, error } = await query.limit(100);
    const local = getLocalRecycleBinHistory();
    const combined = [...local];
    if (!error && data && Array.isArray(data)) {
      for (const item of data) {
        if (!combined.some((c) => c.id === item.id)) {
          combined.push(item as RecycleBinHistoryEvent);
        }
      }
    }
    combined.sort((a, b) => new Date(b.performed_at).getTime() - new Date(a.performed_at).getTime());
    let list = combined;
    if (filters?.record_type && filters.record_type !== "all") {
      list = list.filter((e) => e.record_type === filters.record_type);
    }
    if (filters?.action && filters.action !== "all") {
      list = list.filter((e) => e.action === filters.action);
    }
    if (filters?.startDate) {
      const sDate = filters.startDate;
      list = list.filter((e) => e.performed_at.slice(0, 10) >= sDate);
    }
    if (filters?.endDate) {
      const eDate = filters.endDate;
      list = list.filter((e) => e.performed_at.slice(0, 10) <= eDate);
    }
    if (q) {
      list = list.filter(
        (e) =>
          e.record_name.toLowerCase().includes(q) ||
          (e.record_reference && e.record_reference.toLowerCase().includes(q)) ||
          e.performed_by.toLowerCase().includes(q) ||
          e.source_module.toLowerCase().includes(q)
      );
    }
    return list;
  } catch (err) {
    console.warn("Recycle bin history fetch remote fallback:", err);
  }

  // Local fallback
  let list = getLocalRecycleBinHistory();
  if (filters?.record_type && filters.record_type !== "all") {
    list = list.filter((e) => e.record_type === filters.record_type);
  }
  if (filters?.action && filters.action !== "all") {
    list = list.filter((e) => e.action === filters.action);
  }
  if (filters?.startDate) {
    const sDate = filters.startDate;
    list = list.filter((e) => e.performed_at.slice(0, 10) >= sDate);
  }
  if (filters?.endDate) {
    const eDate = filters.endDate;
    list = list.filter((e) => e.performed_at.slice(0, 10) <= eDate);
  }
  if (q) {
    list = list.filter(
      (e) =>
        e.record_name.toLowerCase().includes(q) ||
        (e.record_reference && e.record_reference.toLowerCase().includes(q)) ||
        e.performed_by.toLowerCase().includes(q) ||
        e.source_module.toLowerCase().includes(q)
    );
  }
  return list;
}

/**
 * Get history specifically for a single record
 */
export async function getRecordActivityHistory(recordId: string): Promise<RecycleBinHistoryEvent[]> {
  const local = getLocalRecycleBinHistory().filter((e) => e.record_id === recordId);
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("recycle_bin_history")
      .select("*")
      .eq("record_id", recordId)
      .order("performed_at", { ascending: false });

    if (!error && data && Array.isArray(data)) {
      const combined = [...local];
      for (const item of data) {
        if (!combined.some((c) => c.id === item.id)) {
          combined.push(item as RecycleBinHistoryEvent);
        }
      }
      combined.sort((a, b) => new Date(b.performed_at).getTime() - new Date(a.performed_at).getTime());
      return combined;
    }
  } catch (err) {
    console.warn("Record activity history remote fallback:", err);
  }

  return local;
}

// ─── DATE FILTERING UTILITIES ───────────────────────────────────────────────

function isDateInFilter(
  dateIso: string | undefined | null,
  filter: RecycleBinDateFilter = "all",
  customStart?: string,
  customEnd?: string
): boolean {
  if (!dateIso) return true;
  if (filter === "all") return true;

  const d = new Date(dateIso);
  const now = new Date();
  const dateStr = d.toISOString().slice(0, 10);
  const todayStr = now.toISOString().slice(0, 10);

  if (filter === "today") {
    return dateStr === todayStr;
  }

  if (filter === "yesterday") {
    const y = new Date();
    y.setDate(y.getDate() - 1);
    return dateStr === y.toISOString().slice(0, 10);
  }

  if (filter === "last_7_days") {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    return d >= sevenDaysAgo && d <= now;
  }

  if (filter === "this_month") {
    const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    return dateStr >= firstOfMonth && dateStr <= todayStr;
  }

  if (filter === "last_month") {
    const firstOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().slice(0, 10);
    const lastOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().slice(0, 10);
    return dateStr >= firstOfLastMonth && dateStr <= lastOfLastMonth;
  }

  if (filter === "this_year") {
    const firstOfYear = new Date(now.getFullYear(), 0, 1).toISOString().slice(0, 10);
    return dateStr >= firstOfYear;
  }

  if (filter === "custom") {
    if (customStart && dateStr < customStart) return false;
    if (customEnd && dateStr > customEnd) return false;
    return true;
  }

  return true;
}

// ─── UNIFIED QUERY ENGINE ───────────────────────────────────────────────────

export async function getRecycleBinItems(
  type: RecycleBinTabType = "all",
  searchQuery?: string,
  options?: {
    dateFilter?: RecycleBinDateFilter;
    startDate?: string;
    endDate?: string;
    sortBy?: RecycleBinSortOption;
  }
): Promise<RecycleBinItem[]> {
  const q = searchQuery?.trim().toLowerCase() || "";
  const dateFilter = options?.dateFilter || "all";
  const startDate = options?.startDate;
  const endDate = options?.endDate;
  const sortBy = options?.sortBy || "newest";

  const allItems: RecycleBinItem[] = [];

  // Helper to test if item matches search query across all possible fields
  const matchesSearch = (item: RecycleBinItem): boolean => {
    if (!q || q.length < 2) return true;
    const raw = item.rawData || {};

    const searchPool = [
      item.nameOrNumber,
      item.reference,
      item.source_module,
      item.details,
      item.deleted_by,
      raw.name,
      raw.mobile,
      raw.phone,
      raw.email,
      raw.chassis_vin,
      raw.registration_number,
      raw.job_card_number,
      raw.invoice_number,
      raw.part_number,
      raw.service_code,
      raw.description,
      raw.account_name,
      raw.account_code,
      raw.reference_number,
      raw.purchase_invoice_number,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return searchPool.includes(q);
  };

  // 1. CUSTOMERS
  if (type === "all" || type === "customers") {
    const local = getLocalCustomers();
    const custItems = local
      .filter((c) => c.is_deleted)
      .filter((c) => isDateInFilter(c.deleted_at, dateFilter, startDate, endDate))
      .map((c) => ({
        id: c.id,
        type: "customer" as const,
        nameOrNumber: c.name,
        reference: c.mobile || c.trn_number || "—",
        source_module: "Customers",
        details: [c.mobile, c.email].filter(Boolean).join(" • ") || "No contact info",
        deleted_at: c.deleted_at || c.updated_at || new Date().toISOString(),
        deleted_by: c.deleted_by || "Admin",
        rawData: c,
      }));
    allItems.push(...custItems);
  }

  // 2. VEHICLES
  if (type === "all" || type === "vehicles") {
    const local = getLocalVehicles();
    const vehItems = local
      .filter((v) => v.is_deleted)
      .filter((v) => isDateInFilter(v.deleted_at, dateFilter, startDate, endDate))
      .map((v) => ({
        id: v.id,
        type: "vehicle" as const,
        nameOrNumber: `${v.make} ${v.model} ${v.year ? `(${v.year})` : ""}`.trim(),
        reference: v.registration_number || v.chassis_vin || "—",
        source_module: "Vehicles",
        details: [
          v.registration_number ? `Plate: ${v.registration_number}` : null,
          v.chassis_vin ? `VIN: ${v.chassis_vin}` : null,
        ].filter(Boolean).join(" • ") || "Vehicle Record",
        deleted_at: v.deleted_at || v.updated_at || new Date().toISOString(),
        deleted_by: v.deleted_by || "Admin",
        rawData: v,
      }));
    allItems.push(...vehItems);
  }

  // 3. JOB CARDS
  if (type === "all" || type === "job_cards") {
    const local = getLocalJobCards();
    const jobItems = local
      .filter((j) => j.is_deleted)
      .filter((j) => isDateInFilter(j.deleted_at, dateFilter, startDate, endDate))
      .map((j) => ({
        id: j.id,
        type: "job_card" as const,
        nameOrNumber: `Job Card ${j.job_card_number}`,
        reference: j.job_card_number,
        source_module: "Job Cards",
        details: `Date: ${j.date} • Total: AED ${(j.total || 0).toLocaleString()} • Status: ${j.status}`,
        deleted_at: j.deleted_at || j.updated_at || new Date().toISOString(),
        deleted_by: j.deleted_by || "Admin",
        rawData: j,
      }));
    allItems.push(...jobItems);
  }

  // 4. SERVICES
  if (type === "all" || type === "services") {
    const local = getLocalServices();
    const srvItems = local
      .filter((s: any) => s.is_deleted)
      .filter((s: any) => isDateInFilter(s.deleted_at, dateFilter, startDate, endDate))
      .map((s: any) => ({
        id: s.id,
        type: "service" as const,
        nameOrNumber: s.name,
        reference: s.service_code || s.category || "—",
        source_module: "Services",
        details: `Category: ${s.category || "General"} • Price: AED ${Number(s.default_price || 0).toLocaleString()}`,
        deleted_at: s.deleted_at || s.updated_at || new Date().toISOString(),
        deleted_by: s.deleted_by || "Admin",
        rawData: s,
      }));
    allItems.push(...srvItems);
  }

  // 5. SPARE PARTS
  if (type === "all" || type === "parts") {
    const local = getLocalParts();
    const prtItems = local
      .filter((p: any) => p.is_deleted)
      .filter((p: any) => isDateInFilter(p.deleted_at, dateFilter, startDate, endDate))
      .map((p: any) => ({
        id: p.id,
        type: "part" as const,
        nameOrNumber: p.name,
        reference: p.part_number || "—",
        source_module: "Spare Parts",
        details: `Part #: ${p.part_number || "N/A"} • Stock: ${p.current_stock ?? 0} • Price: AED ${Number(p.selling_price || 0).toLocaleString()}`,
        deleted_at: p.deleted_at || p.updated_at || new Date().toISOString(),
        deleted_by: p.deleted_by || "Admin",
        rawData: p,
      }));
    allItems.push(...prtItems);
  }

  // 6. SUPPLIERS
  if (type === "all" || type === "suppliers") {
    const local = getLocalSuppliers();
    const supItems = local
      .filter((s: any) => s.is_deleted)
      .filter((s: any) => isDateInFilter(s.deleted_at, dateFilter, startDate, endDate))
      .map((s: any) => ({
        id: s.id,
        type: "supplier" as const,
        nameOrNumber: s.name,
        reference: s.phone || s.trn_number || "—",
        source_module: "Suppliers",
        details: [s.phone, s.contact_person, s.city].filter(Boolean).join(" • ") || "Supplier Record",
        deleted_at: s.deleted_at || s.updated_at || new Date().toISOString(),
        deleted_by: s.deleted_by || "Admin",
        rawData: s,
      }));
    allItems.push(...supItems);
  }

  // 7. PURCHASES
  if (type === "all" || type === "purchases") {
    const local = getLocalPurchases();
    const purItems = local
      .filter((p: any) => p.is_deleted)
      .filter((p: any) => isDateInFilter(p.deleted_at, dateFilter, startDate, endDate))
      .map((p: any) => ({
        id: p.id,
        type: "purchase" as const,
        nameOrNumber: `Purchase ${p.purchase_invoice_number || p.id}`,
        reference: p.purchase_invoice_number || p.id,
        source_module: "Purchases",
        details: `Date: ${p.date || "N/A"} • Total: AED ${Number(p.total || 0).toLocaleString()} • Status: ${p.payment_status || "N/A"}`,
        deleted_at: p.deleted_at || p.updated_at || new Date().toISOString(),
        deleted_by: p.deleted_by || "Admin",
        rawData: p,
      }));
    allItems.push(...purItems);
  }

  // 8. INVOICES
  if (type === "all" || type === "invoices") {
    const local = getLocalInvoices();
    const invItems = local
      .filter((i: any) => i.is_deleted)
      .filter((i: any) => isDateInFilter(i.deleted_at, dateFilter, startDate, endDate))
      .map((i: any) => ({
        id: i.id,
        type: "invoice" as const,
        nameOrNumber: `Invoice ${i.invoice_number}`,
        reference: String(i.invoice_number),
        source_module: "Invoices",
        details: `Total: AED ${Number(i.total || 0).toLocaleString()} • Status: ${i.payment_status}`,
        deleted_at: i.deleted_at || i.updated_at || new Date().toISOString(),
        deleted_by: i.deleted_by || "Admin",
        rawData: i,
      }));
    allItems.push(...invItems);
  }

  // 9. PAYMENTS
  if (type === "all" || type === "payments") {
    const local = getLocalPayments();
    const payItems = local
      .filter((p: any) => p.is_deleted)
      .filter((p: any) => isDateInFilter(p.deleted_at, dateFilter, startDate, endDate))
      .map((p: any) => ({
        id: p.id,
        type: "payment" as const,
        nameOrNumber: `Payment AED ${Number(p.amount || 0).toLocaleString()}`,
        reference: p.reference_number || p.payment_date || "—",
        source_module: "Payments",
        details: `Date: ${p.payment_date} • Method: ${p.payment_method} • Ref: ${p.reference_number || "None"}`,
        deleted_at: p.deleted_at || p.created_at || new Date().toISOString(),
        deleted_by: p.deleted_by || "Admin",
        rawData: p,
      }));
    allItems.push(...payItems);
  }

  // 10. EXPENSES
  if (type === "all" || type === "expenses") {
    const local = getLocalExpenses();
    const expItems = local
      .filter((e: any) => e.is_deleted)
      .filter((e: any) => isDateInFilter(e.deleted_at, dateFilter, startDate, endDate))
      .map((e: any) => ({
        id: e.id,
        type: "expense" as const,
        nameOrNumber: `${e.category}: AED ${Number(e.amount || 0).toLocaleString()}`,
        reference: e.reference_number || e.category || "—",
        source_module: "Expenses",
        details: `Date: ${e.date || "N/A"} • Paid To: ${e.paid_to || "N/A"} • ${e.description || "No description"}`,
        deleted_at: e.deleted_at || e.created_at || new Date().toISOString(),
        deleted_by: e.deleted_by || "Admin",
        rawData: e,
      }));
    allItems.push(...expItems);
  }

  // 11. ACCOUNTS / LEDGER
  if (type === "all" || type === "ledger_accounts") {
    const local = getLocalAccounts();
    const accItems = local
      .filter((a: any) => a.is_deleted)
      .filter((a: any) => isDateInFilter(a.deleted_at, dateFilter, startDate, endDate))
      .map((a: any) => ({
        id: a.id,
        type: "ledger_account" as const,
        nameOrNumber: a.account_name,
        reference: a.account_code,
        source_module: "Accounts / Ledger",
        details: `Code: ${a.account_code} • Type: ${a.account_type.toUpperCase()} • Balance: AED ${Number(a.current_balance || a.opening_balance || 0).toLocaleString()}`,
        deleted_at: a.deleted_at || a.created_at || new Date().toISOString(),
        deleted_by: a.deleted_by || "Admin",
        rawData: a,
      }));
    allItems.push(...accItems);
  }

  // Filter with search query
  const filtered = allItems.filter(matchesSearch);

  // Sorting
  filtered.sort((a, b) => {
    if (sortBy === "oldest") {
      return new Date(a.deleted_at).getTime() - new Date(b.deleted_at).getTime();
    }
    if (sortBy === "name_asc") {
      return a.nameOrNumber.localeCompare(b.nameOrNumber);
    }
    if (sortBy === "record_type") {
      return a.source_module.localeCompare(b.source_module);
    }
    // Default newest
    return new Date(b.deleted_at).getTime() - new Date(a.deleted_at).getTime();
  });

  return filtered;
}

/**
 * Compute summary counts for the dashboard header
 */
export async function getRecycleBinSummaryCounts(): Promise<RecycleBinSummaryCounts> {
  const allDeleted = await getRecycleBinItems("all");
  const todayStr = new Date().toISOString().slice(0, 10);

  let deletedToday = 0;
  let customers = 0;
  let jobCards = 0;
  let spareParts = 0;
  let other = 0;

  allDeleted.forEach((item) => {
    const dStr = item.deleted_at ? item.deleted_at.slice(0, 10) : "";
    if (dStr === todayStr) {
      deletedToday++;
    }

    if (item.type === "customer") {
      customers++;
    } else if (item.type === "job_card") {
      jobCards++;
    } else if (item.type === "part") {
      spareParts++;
    } else {
      other++;
    }
  });

  return {
    totalDeleted: allDeleted.length,
    deletedToday,
    customers,
    jobCards,
    spareParts,
    other,
  };
}

// ─── INDIVIDUAL SOFT DELETE & RESTORE FUNCTIONS ─────────────────────────────

// CUSTOMERS
export async function softDeleteCustomer(
  customerId: string,
  deletedBy = "Admin"
): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient();
  const now = new Date().toISOString();

  const localCusts = getLocalCustomers();
  const target = localCusts.find((c) => c.id === customerId);
  const updatedCusts = localCusts.map((c) =>
    c.id === customerId ? { ...c, is_deleted: true, deleted_at: now, deleted_by: deletedBy } : c
  );
  saveLocalCustomers(updatedCusts);

  const localVehs = getLocalVehicles();
  const updatedVehs = localVehs.map((v) =>
    v.customer_id === customerId ? { ...v, is_deleted: true, deleted_at: now, deleted_by: deletedBy } : v
  );
  saveLocalVehicles(updatedVehs);

  // Log audit history
  await logRecycleBinAction({
    record_type: "customer",
    record_id: customerId,
    record_reference: target?.mobile || null,
    record_name: target?.name || "Customer",
    source_module: "Customers",
    action: "DELETED",
    performed_by: deletedBy,
  });

  try {
    await supabase.from("customers").update({ is_deleted: true, deleted_at: now, deleted_by: deletedBy }).eq("id", customerId);
    await supabase.from("vehicles").update({ is_deleted: true, deleted_at: now, deleted_by: deletedBy }).eq("customer_id", customerId);
  } catch (err) {
    console.warn("Supabase softDeleteCustomer fallback:", err);
  }

  return { success: true };
}

export async function restoreCustomer(
  customerId: string,
  restoredBy = "Admin"
): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient();

  const localCusts = getLocalCustomers();
  const target = localCusts.find((c) => c.id === customerId);
  const updatedCusts = localCusts.map((c) =>
    c.id === customerId ? { ...c, is_deleted: false, deleted_at: null, deleted_by: null } : c
  );
  saveLocalCustomers(updatedCusts);

  const localVehs = getLocalVehicles();
  const updatedVehs = localVehs.map((v) =>
    v.customer_id === customerId ? { ...v, is_deleted: false, deleted_at: null, deleted_by: null } : v
  );
  saveLocalVehicles(updatedVehs);

  // Log audit history
  await logRecycleBinAction({
    record_type: "customer",
    record_id: customerId,
    record_reference: target?.mobile || null,
    record_name: target?.name || "Customer",
    source_module: "Customers",
    action: "RESTORED",
    performed_by: restoredBy,
  });

  try {
    await supabase.from("customers").update({ is_deleted: false, deleted_at: null, deleted_by: null }).eq("id", customerId);
    await supabase.from("vehicles").update({ is_deleted: false, deleted_at: null, deleted_by: null }).eq("customer_id", customerId);
  } catch (err) {
    console.warn("Supabase restoreCustomer fallback:", err);
  }

  return { success: true };
}

// VEHICLES
export async function softDeleteVehicle(
  vehicleId: string,
  deletedBy = "Admin"
): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient();
  const now = new Date().toISOString();

  const localVehs = getLocalVehicles();
  const target = localVehs.find((v) => v.id === vehicleId);
  const updatedVehs = localVehs.map((v) =>
    v.id === vehicleId ? { ...v, is_deleted: true, deleted_at: now, deleted_by: deletedBy } : v
  );
  saveLocalVehicles(updatedVehs);

  await logRecycleBinAction({
    record_type: "vehicle",
    record_id: vehicleId,
    record_reference: target?.registration_number || target?.chassis_vin || null,
    record_name: target ? `${target.make} ${target.model}` : "Vehicle",
    source_module: "Vehicles",
    action: "DELETED",
    performed_by: deletedBy,
  });

  try {
    await supabase.from("vehicles").update({ is_deleted: true, deleted_at: now, deleted_by: deletedBy }).eq("id", vehicleId);
  } catch (err) {
    console.warn("Supabase softDeleteVehicle fallback:", err);
  }

  return { success: true };
}

export async function restoreVehicle(
  vehicleId: string,
  restoredBy = "Admin"
): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient();

  const localVehs = getLocalVehicles();
  const target = localVehs.find((v) => v.id === vehicleId);
  const updatedVehs = localVehs.map((v) =>
    v.id === vehicleId ? { ...v, is_deleted: false, deleted_at: null, deleted_by: null } : v
  );
  saveLocalVehicles(updatedVehs);

  await logRecycleBinAction({
    record_type: "vehicle",
    record_id: vehicleId,
    record_reference: target?.registration_number || target?.chassis_vin || null,
    record_name: target ? `${target.make} ${target.model}` : "Vehicle",
    source_module: "Vehicles",
    action: "RESTORED",
    performed_by: restoredBy,
  });

  try {
    await supabase.from("vehicles").update({ is_deleted: false, deleted_at: null, deleted_by: null }).eq("id", vehicleId);
  } catch (err) {
    console.warn("Supabase restoreVehicle fallback:", err);
  }

  return { success: true };
}

// JOB CARDS
export async function softDeleteJobCard(
  jobCardId: string,
  deletedBy = "Admin"
): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient();
  const now = new Date().toISOString();

  const localJobs = getLocalJobCards();
  const target = localJobs.find((j) => j.id === jobCardId);
  const updatedJobs = localJobs.map((j) =>
    j.id === jobCardId ? { ...j, is_deleted: true, deleted_at: now, deleted_by: deletedBy } : j
  );
  saveLocalJobCards(updatedJobs);

  await logRecycleBinAction({
    record_type: "job_card",
    record_id: jobCardId,
    record_reference: target?.job_card_number || null,
    record_name: target ? `Job Card ${target.job_card_number}` : "Job Card",
    source_module: "Job Cards",
    action: "DELETED",
    performed_by: deletedBy,
  });

  try {
    await supabase.from("job_cards").update({ is_deleted: true, deleted_at: now, deleted_by: deletedBy }).eq("id", jobCardId);
  } catch (err) {
    console.warn("Supabase softDeleteJobCard fallback:", err);
  }

  return { success: true };
}

export async function restoreJobCard(
  jobCardId: string,
  restoredBy = "Admin"
): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient();

  const localJobs = getLocalJobCards();
  const target = localJobs.find((j) => j.id === jobCardId);
  const updatedJobs = localJobs.map((j) =>
    j.id === jobCardId ? { ...j, is_deleted: false, deleted_at: null, deleted_by: null } : j
  );
  saveLocalJobCards(updatedJobs);

  await logRecycleBinAction({
    record_type: "job_card",
    record_id: jobCardId,
    record_reference: target?.job_card_number || null,
    record_name: target ? `Job Card ${target.job_card_number}` : "Job Card",
    source_module: "Job Cards",
    action: "RESTORED",
    performed_by: restoredBy,
  });

  try {
    await supabase.from("job_cards").update({ is_deleted: false, deleted_at: null, deleted_by: null }).eq("id", jobCardId);
  } catch (err) {
    console.warn("Supabase restoreJobCard fallback:", err);
  }

  return { success: true };
}

// SERVICES
export async function softDeleteService(
  serviceId: string,
  deletedBy = "Admin"
): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient();
  const now = new Date().toISOString();

  const list = getLocalServices();
  const target = list.find((s) => s.id === serviceId);
  const updated = list.map((s: any) =>
    s.id === serviceId ? { ...s, is_deleted: true, deleted_at: now, deleted_by: deletedBy } : s
  );
  saveLocalServices(updated);

  await logRecycleBinAction({
    record_type: "service",
    record_id: serviceId,
    record_reference: target?.service_code || target?.category || null,
    record_name: target?.name || "Service",
    source_module: "Services",
    action: "DELETED",
    performed_by: deletedBy,
  });

  try {
    await supabase.from("services").update({ is_deleted: true, deleted_at: now, deleted_by: deletedBy }).eq("id", serviceId);
  } catch (err) {
    console.warn("Supabase softDeleteService fallback:", err);
  }

  return { success: true };
}

export async function restoreService(
  serviceId: string,
  restoredBy = "Admin"
): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient();

  const list = getLocalServices();
  const target = list.find((s) => s.id === serviceId);
  const updated = list.map((s: any) =>
    s.id === serviceId ? { ...s, is_deleted: false, deleted_at: null, deleted_by: null } : s
  );
  saveLocalServices(updated);

  await logRecycleBinAction({
    record_type: "service",
    record_id: serviceId,
    record_reference: target?.service_code || target?.category || null,
    record_name: target?.name || "Service",
    source_module: "Services",
    action: "RESTORED",
    performed_by: restoredBy,
  });

  try {
    await supabase.from("services").update({ is_deleted: false, deleted_at: null, deleted_by: null }).eq("id", serviceId);
  } catch (err) {
    console.warn("Supabase restoreService fallback:", err);
  }

  return { success: true };
}

// SPARE PARTS
export async function softDeletePart(
  partId: string,
  deletedBy = "Admin"
): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient();
  const now = new Date().toISOString();

  const list = getLocalParts();
  const target = list.find((p) => p.id === partId);
  const updated = list.map((p: any) =>
    p.id === partId ? { ...p, is_deleted: true, deleted_at: now, deleted_by: deletedBy } : p
  );
  saveLocalParts(updated);

  await logRecycleBinAction({
    record_type: "part",
    record_id: partId,
    record_reference: target?.part_number || null,
    record_name: target?.name || "Spare Part",
    source_module: "Spare Parts",
    action: "DELETED",
    performed_by: deletedBy,
  });

  try {
    await supabase.from("parts").update({ is_deleted: true, deleted_at: now, deleted_by: deletedBy }).eq("id", partId);
  } catch (err) {
    console.warn("Supabase softDeletePart fallback:", err);
  }

  return { success: true };
}

export async function restorePart(
  partId: string,
  restoredBy = "Admin"
): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient();

  const list = getLocalParts();
  const target = list.find((p) => p.id === partId);
  const updated = list.map((p: any) =>
    p.id === partId ? { ...p, is_deleted: false, deleted_at: null, deleted_by: null } : p
  );
  saveLocalParts(updated);

  await logRecycleBinAction({
    record_type: "part",
    record_id: partId,
    record_reference: target?.part_number || null,
    record_name: target?.name || "Spare Part",
    source_module: "Spare Parts",
    action: "RESTORED",
    performed_by: restoredBy,
  });

  try {
    await supabase.from("parts").update({ is_deleted: false, deleted_at: null, deleted_by: null }).eq("id", partId);
  } catch (err) {
    console.warn("Supabase restorePart fallback:", err);
  }

  return { success: true };
}

// SUPPLIERS
export async function softDeleteSupplier(
  supplierId: string,
  deletedBy = "Admin"
): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient();
  const now = new Date().toISOString();

  const list = getLocalSuppliers();
  const target = list.find((s) => s.id === supplierId);
  const updated = list.map((s: any) =>
    s.id === supplierId ? { ...s, is_deleted: true, deleted_at: now, deleted_by: deletedBy } : s
  );
  saveLocalSuppliers(updated);

  await logRecycleBinAction({
    record_type: "supplier",
    record_id: supplierId,
    record_reference: target?.phone || target?.trn_number || null,
    record_name: target?.name || "Supplier",
    source_module: "Suppliers",
    action: "DELETED",
    performed_by: deletedBy,
  });

  try {
    await supabase.from("suppliers").update({ is_deleted: true, deleted_at: now, deleted_by: deletedBy }).eq("id", supplierId);
  } catch (err) {
    console.warn("Supabase softDeleteSupplier fallback:", err);
  }

  return { success: true };
}

export async function restoreSupplier(
  supplierId: string,
  restoredBy = "Admin"
): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient();

  const list = getLocalSuppliers();
  const target = list.find((s) => s.id === supplierId);
  const updated = list.map((s: any) =>
    s.id === supplierId ? { ...s, is_deleted: false, deleted_at: null, deleted_by: null } : s
  );
  saveLocalSuppliers(updated);

  await logRecycleBinAction({
    record_type: "supplier",
    record_id: supplierId,
    record_reference: target?.phone || target?.trn_number || null,
    record_name: target?.name || "Supplier",
    source_module: "Suppliers",
    action: "RESTORED",
    performed_by: restoredBy,
  });

  try {
    await supabase.from("suppliers").update({ is_deleted: false, deleted_at: null, deleted_by: null }).eq("id", supplierId);
  } catch (err) {
    console.warn("Supabase restoreSupplier fallback:", err);
  }

  return { success: true };
}

// PURCHASES
export async function softDeletePurchase(
  purchaseId: string,
  deletedBy = "Admin"
): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient();
  const now = new Date().toISOString();

  const list = getLocalPurchases();
  const target = list.find((p) => p.id === purchaseId);
  const updated = list.map((p: any) =>
    p.id === purchaseId ? { ...p, is_deleted: true, deleted_at: now, deleted_by: deletedBy } : p
  );
  saveLocalPurchases(updated);

  await logRecycleBinAction({
    record_type: "purchase",
    record_id: purchaseId,
    record_reference: target?.purchase_invoice_number || null,
    record_name: target ? `Purchase ${target.purchase_invoice_number || target.id}` : "Purchase",
    source_module: "Purchases",
    action: "DELETED",
    performed_by: deletedBy,
  });

  try {
    await supabase.from("purchases").update({ is_deleted: true, deleted_at: now, deleted_by: deletedBy }).eq("id", purchaseId);
  } catch (err) {
    console.warn("Supabase softDeletePurchase fallback:", err);
  }

  return { success: true };
}

export async function restorePurchase(
  purchaseId: string,
  restoredBy = "Admin"
): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient();

  const list = getLocalPurchases();
  const target = list.find((p) => p.id === purchaseId);
  const updated = list.map((p: any) =>
    p.id === purchaseId ? { ...p, is_deleted: false, deleted_at: null, deleted_by: null } : p
  );
  saveLocalPurchases(updated);

  await logRecycleBinAction({
    record_type: "purchase",
    record_id: purchaseId,
    record_reference: target?.purchase_invoice_number || null,
    record_name: target ? `Purchase ${target.purchase_invoice_number || target.id}` : "Purchase",
    source_module: "Purchases",
    action: "RESTORED",
    performed_by: restoredBy,
  });

  try {
    await supabase.from("purchases").update({ is_deleted: false, deleted_at: null, deleted_by: null }).eq("id", purchaseId);
  } catch (err) {
    console.warn("Supabase restorePurchase fallback:", err);
  }

  return { success: true };
}

// INVOICES
export async function softDeleteInvoice(
  invoiceId: string,
  deletedBy = "Admin"
): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient();
  const now = new Date().toISOString();

  const list = getLocalInvoices();
  const target = list.find((i) => i.id === invoiceId);
  const updated = list.map((i: any) =>
    i.id === invoiceId ? { ...i, is_deleted: true, deleted_at: now, deleted_by: deletedBy } : i
  );
  saveLocalInvoices(updated);

  await logRecycleBinAction({
    record_type: "invoice",
    record_id: invoiceId,
    record_reference: target?.invoice_number ? String(target.invoice_number) : null,
    record_name: target ? `Invoice ${target.invoice_number}` : "Invoice",
    source_module: "Invoices",
    action: "DELETED",
    performed_by: deletedBy,
  });

  try {
    await supabase.from("invoices").update({ is_deleted: true, deleted_at: now, deleted_by: deletedBy }).eq("id", invoiceId);
  } catch (err) {
    console.warn("Supabase softDeleteInvoice fallback:", err);
  }

  return { success: true };
}

export async function restoreInvoice(
  invoiceId: string,
  restoredBy = "Admin"
): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient();

  const list = getLocalInvoices();
  const target = list.find((i) => i.id === invoiceId);
  const updated = list.map((i: any) =>
    i.id === invoiceId ? { ...i, is_deleted: false, deleted_at: null, deleted_by: null } : i
  );
  saveLocalInvoices(updated);

  await logRecycleBinAction({
    record_type: "invoice",
    record_id: invoiceId,
    record_reference: target?.invoice_number ? String(target.invoice_number) : null,
    record_name: target ? `Invoice ${target.invoice_number}` : "Invoice",
    source_module: "Invoices",
    action: "RESTORED",
    performed_by: restoredBy,
  });

  try {
    await supabase.from("invoices").update({ is_deleted: false, deleted_at: null, deleted_by: null }).eq("id", invoiceId);
  } catch (err) {
    console.warn("Supabase restoreInvoice fallback:", err);
  }

  return { success: true };
}

// PAYMENTS
export async function softDeletePayment(
  paymentId: string,
  deletedBy = "Admin"
): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient();
  const now = new Date().toISOString();

  const list = getLocalPayments();
  const target = list.find((p) => p.id === paymentId);
  const updated = list.map((p: any) =>
    p.id === paymentId ? { ...p, is_deleted: true, deleted_at: now, deleted_by: deletedBy } : p
  );
  saveLocalPayments(updated);

  await logRecycleBinAction({
    record_type: "payment",
    record_id: paymentId,
    record_reference: target?.reference_number || null,
    record_name: target ? `Payment AED ${Number(target.amount || 0).toLocaleString()}` : "Payment",
    source_module: "Payments",
    action: "DELETED",
    performed_by: deletedBy,
  });

  try {
    await supabase.from("payments").update({ is_deleted: true, deleted_at: now, deleted_by: deletedBy }).eq("id", paymentId);
  } catch (err) {
    console.warn("Supabase softDeletePayment fallback:", err);
  }

  return { success: true };
}

export async function restorePayment(
  paymentId: string,
  restoredBy = "Admin"
): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient();

  const list = getLocalPayments();
  const target = list.find((p) => p.id === paymentId);
  const updated = list.map((p: any) =>
    p.id === paymentId ? { ...p, is_deleted: false, deleted_at: null, deleted_by: null } : p
  );
  saveLocalPayments(updated);

  await logRecycleBinAction({
    record_type: "payment",
    record_id: paymentId,
    record_reference: target?.reference_number || null,
    record_name: target ? `Payment AED ${Number(target.amount || 0).toLocaleString()}` : "Payment",
    source_module: "Payments",
    action: "RESTORED",
    performed_by: restoredBy,
  });

  try {
    await supabase.from("payments").update({ is_deleted: false, deleted_at: null, deleted_by: null }).eq("id", paymentId);
  } catch (err) {
    console.warn("Supabase restorePayment fallback:", err);
  }

  return { success: true };
}

// ACCOUNTS / LEDGER
export async function softDeleteLedgerAccount(
  accountId: string,
  deletedBy = "Admin"
): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient();
  const now = new Date().toISOString();

  const list = getLocalAccounts();
  const target = list.find((a) => a.id === accountId);
  const updated = list.map((a: any) =>
    a.id === accountId ? { ...a, is_active: false, is_deleted: true, deleted_at: now, deleted_by: deletedBy } : a
  );
  saveLocalAccounts(updated);

  await logRecycleBinAction({
    record_type: "ledger_account",
    record_id: accountId,
    record_reference: target?.account_code || null,
    record_name: target?.account_name || "Account",
    source_module: "Accounts / Ledger",
    action: "DELETED",
    performed_by: deletedBy,
  });

  try {
    await supabase.from("ledger_accounts").update({ is_active: false, is_deleted: true, deleted_at: now, deleted_by: deletedBy }).eq("id", accountId);
  } catch (err) {
    console.warn("Supabase softDeleteLedgerAccount fallback:", err);
  }

  return { success: true };
}

export async function restoreLedgerAccount(
  accountId: string,
  restoredBy = "Admin"
): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient();

  const list = getLocalAccounts();
  const target = list.find((a) => a.id === accountId);
  const updated = list.map((a: any) =>
    a.id === accountId ? { ...a, is_active: true, is_deleted: false, deleted_at: null, deleted_by: null } : a
  );
  saveLocalAccounts(updated);

  await logRecycleBinAction({
    record_type: "ledger_account",
    record_id: accountId,
    record_reference: target?.account_code || null,
    record_name: target?.account_name || "Account",
    source_module: "Accounts / Ledger",
    action: "RESTORED",
    performed_by: restoredBy,
  });

  try {
    await supabase.from("ledger_accounts").update({ is_active: true, is_deleted: false, deleted_at: null, deleted_by: null }).eq("id", accountId);
  } catch (err) {
    console.warn("Supabase restoreLedgerAccount fallback:", err);
  }

  return { success: true };
}

/**
 * Universal Restore dispatcher
 */
export async function restoreRecord(
  type: RecycleBinRecordType,
  id: string,
  restoredBy = "Admin"
): Promise<{ success: boolean; error?: string }> {
  switch (type) {
    case "customer":
      return restoreCustomer(id, restoredBy);
    case "vehicle":
      return restoreVehicle(id, restoredBy);
    case "job_card":
      return restoreJobCard(id, restoredBy);
    case "service":
      return restoreService(id, restoredBy);
    case "part":
      return restorePart(id, restoredBy);
    case "supplier":
      return restoreSupplier(id, restoredBy);
    case "purchase":
      return restorePurchase(id, restoredBy);
    case "invoice":
      return restoreInvoice(id, restoredBy);
    case "payment":
      return restorePayment(id, restoredBy);
    case "expense": {
      const res = await restoreExpense(id);
      await logRecycleBinAction({
        record_type: "expense",
        record_id: id,
        record_name: "Expense",
        source_module: "Expenses",
        action: "RESTORED",
        performed_by: restoredBy,
      });
      return res;
    }
    case "ledger_account":
      return restoreLedgerAccount(id, restoredBy);
    default:
      return { success: false, error: "Unsupported record type for restoration." };
  }
}

// ─── FINANCIAL LINKAGE CHECK & PERMANENT DELETE ─────────────────────────────

export async function checkFinancialLinkage(
  type: RecycleBinRecordType,
  id: string
): Promise<{ hasHistory: boolean; reason?: string }> {
  // Invoices and Payments are permanent legal accounting documents
  if (type === "invoice") {
    return {
      hasHistory: true,
      reason: "Tax invoices are legally bound financial documents and cannot be permanently deleted.",
    };
  }

  if (type === "payment") {
    return {
      hasHistory: true,
      reason: "Payment receipts represent posted cash or bank transactions and cannot be permanently deleted.",
    };
  }

  if (type === "customer") {
    const invoices = getLocalInvoices().filter((i) => i.customer_id === id);
    if (invoices.length > 0) {
      return {
        hasHistory: true,
        reason: "This customer has linked invoices and financial history.",
      };
    }
    const billedJobs = getLocalJobCards().filter((j) => j.customer_id === id && (Number(j.total) > 0 || Number(j.paid) > 0));
    if (billedJobs.length > 0) {
      return {
        hasHistory: true,
        reason: "This customer has billed job cards with financial totals.",
      };
    }
  }

  if (type === "vehicle") {
    const billedJobs = getLocalJobCards().filter((j) => j.vehicle_id === id && Number(j.total) > 0);
    if (billedJobs.length > 0) {
      return {
        hasHistory: true,
        reason: "This vehicle has billed repair history and job cards.",
      };
    }
  }

  if (type === "job_card") {
    const card = getLocalJobCards().find((j) => j.id === id);
    if (card && (Number(card.total) > 0 || Number(card.paid) > 0 || card.invoice_number)) {
      return {
        hasHistory: true,
        reason: "This job card is linked to an issued invoice or has recorded financial charges.",
      };
    }
  }

  if (type === "supplier") {
    const purchases = getLocalPurchases().filter((p) => p.supplier_id === id);
    if (purchases.length > 0) {
      return {
        hasHistory: true,
        reason: "This supplier has recorded purchase orders and payables history.",
      };
    }
  }

  if (type === "purchase") {
    const purchase = getLocalPurchases().find((p) => p.id === id);
    if (purchase && (Number(purchase.total) > 0 || Number(purchase.paid_amount) > 0)) {
      return {
        hasHistory: true,
        reason: "This purchase has recorded inventory transactions or financial payments.",
      };
    }
  }

  if (type === "part") {
    // Check if used in any job card items
    const jobCards = getLocalJobCards();
    const usedInJob = jobCards.some((j) => (j as any).items?.some((it: any) => it.part_id === id));
    if (usedInJob) {
      return {
        hasHistory: true,
        reason: "This spare part has recorded job card usage and cost history.",
      };
    }
  }

  if (type === "service") {
    const jobCards = getLocalJobCards();
    const usedInJob = jobCards.some((j) => (j as any).items?.some((it: any) => it.service_id === id));
    if (usedInJob) {
      return {
        hasHistory: true,
        reason: "This service has billed history in customer job cards.",
      };
    }
  }

  if (type === "ledger_account") {
    return {
      hasHistory: true,
      reason: "General ledger chart of accounts cannot be permanently deleted to prevent balance sheet rupture.",
    };
  }

  if (type === "expense") {
    const exp = getLocalExpenses().find((e) => e.id === id);
    // If expense has positive amount and is posted to ledger
    if (exp && Number(exp.amount) > 0) {
      return {
        hasHistory: true,
        reason: "This posted expense is recorded in financial reports and general ledger.",
      };
    }
  }

  return { hasHistory: false };
}

/**
 * Permanently Delete with financial audit immunity check and audit logging
 */
export async function permanentlyDelete(
  type: RecycleBinRecordType,
  id: string,
  userRole?: UserRole,
  performedBy = "Admin"
): Promise<{ success: boolean; error?: string }> {
  // 1. Authorization check: Only Owner / Admin can permanently delete
  if (userRole && userRole !== "owner" && userRole !== "admin") {
    return {
      success: false,
      error: "Access denied. Only Owner or Admin can permanently delete records.",
    };
  }

  // Find record name and reference for history
  const allDeleted = await getRecycleBinItems("all");
  const target = allDeleted.find((item) => item.id === id && item.type === type);
  const recordName = target?.nameOrNumber || `${type} record`;
  const recordReference = target?.reference || null;
  const sourceModule = target?.source_module || type;

  // 2. Financial linkage protection check
  const linkage = await checkFinancialLinkage(type, id);
  if (linkage.hasHistory) {
    // Log DELETE_BLOCKED audit history event
    await logRecycleBinAction({
      record_type: type,
      record_id: id,
      record_reference: recordReference,
      record_name: recordName,
      source_module: sourceModule,
      action: "DELETE_BLOCKED",
      performed_by: performedBy,
      reason: linkage.reason,
    });

    return {
      success: false,
      error: "This record has linked financial history and cannot be permanently deleted.",
    };
  }

  const supabase = createClient();

  // Purge from local stores
  if (type === "customer") {
    saveLocalCustomers(getLocalCustomers().filter((c) => c.id !== id));
    saveLocalVehicles(getLocalVehicles().filter((v) => v.customer_id !== id));
  } else if (type === "vehicle") {
    saveLocalVehicles(getLocalVehicles().filter((v) => v.id !== id));
  } else if (type === "job_card") {
    saveLocalJobCards(getLocalJobCards().filter((j) => j.id !== id));
  } else if (type === "service") {
    saveLocalServices(getLocalServices().filter((s) => s.id !== id));
  } else if (type === "part") {
    saveLocalParts(getLocalParts().filter((p) => p.id !== id));
  } else if (type === "supplier") {
    saveLocalSuppliers(getLocalSuppliers().filter((s) => s.id !== id));
  } else if (type === "expense") {
    saveLocalExpenses(getLocalExpenses().filter((e) => e.id !== id));
  }

  // Log PERMANENTLY_DELETED audit history event
  await logRecycleBinAction({
    record_type: type,
    record_id: id,
    record_reference: recordReference,
    record_name: recordName,
    source_module: sourceModule,
    action: "PERMANENTLY_DELETED",
    performed_by: performedBy,
  });

  // Attempt database deletion
  try {
    if (type === "customer") {
      await supabase.from("vehicles").delete().eq("customer_id", id);
      await supabase.from("customers").delete().eq("id", id);
    } else if (type === "vehicle") {
      await supabase.from("vehicles").delete().eq("id", id);
    } else if (type === "job_card") {
      await supabase.from("job_cards").delete().eq("id", id);
    } else if (type === "service") {
      await supabase.from("services").delete().eq("id", id);
    } else if (type === "part") {
      await supabase.from("parts").delete().eq("id", id);
    } else if (type === "supplier") {
      await supabase.from("suppliers").delete().eq("id", id);
    } else if (type === "expense") {
      await supabase.from("expenses").delete().eq("id", id);
    }
  } catch (err) {
    console.warn("Database permanent delete fallback:", err);
  }

  return { success: true };
}

export { restoreExpense, softDeleteExpense, permanentlyDeleteExpense };
