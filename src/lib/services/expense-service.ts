import { createClient } from "@/lib/supabase/client";
import type { Expense, ExpenseInsert, ExpenseUpdate } from "@/types/database";
import { DEFAULT_EXPENSE_CATEGORIES, DEFAULT_WORKSPACE_ID } from "@/lib/constants";
import { getActiveWorkspaceId } from "./workspace-service";
import { invalidateDashboardCache } from "./dashboard-service";
import { generateUUID } from "@/lib/utils";

const LOCAL_EXPENSES_KEY = "atiq_local_expenses";
const LOCAL_CUSTOM_CATEGORIES_KEY = "atiq_local_expense_custom_categories";

let inMemoryCustomCategories: string[] = [];

export function getLocalExpenses(workspaceId?: string): any[] {
  const targetWsId = workspaceId || getActiveWorkspaceId();
  let all: any[] = [];
  if (typeof window !== "undefined") {
    try {
      const raw = localStorage.getItem(LOCAL_EXPENSES_KEY);
      if (raw !== null) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          all = parsed;
        }
      }
    } catch {}
  }
  return all.filter(
    (e) => e.workspace_id === targetWsId || (!e.workspace_id && targetWsId === DEFAULT_WORKSPACE_ID)
  );
}

export function saveLocalExpenses(expenses: any[], workspaceId?: string) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LOCAL_EXPENSES_KEY, JSON.stringify(expenses));
  } catch (e) {
    console.error("Failed to save local expenses", e);
  }
}

export function getCustomCategories(): string[] {
  if (typeof window === "undefined") return inMemoryCustomCategories;
  try {
    const raw = localStorage.getItem(LOCAL_CUSTOM_CATEGORIES_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
    return inMemoryCustomCategories;
  } catch {
    return inMemoryCustomCategories;
  }
}

export function saveCustomCategory(category: string) {
  const trimmed = category.trim();
  if (!trimmed) return;
  const current = getCustomCategories();
  if (!current.includes(trimmed) && !(DEFAULT_EXPENSE_CATEGORIES as readonly string[]).includes(trimmed)) {
    const updated = [...current, trimmed];
    inMemoryCustomCategories = updated;
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(LOCAL_CUSTOM_CATEGORIES_KEY, JSON.stringify(updated));
      } catch (e) {
        console.error("Failed to save custom category", e);
      }
    }
  }
}

export function getAllCategories(): string[] {
  const custom = getCustomCategories();
  const set = new Set<string>([...DEFAULT_EXPENSE_CATEGORIES, ...custom]);
  return Array.from(set);
}

export interface GetExpensesOptions {
  search?: string;
  category?: string;
  paymentMethod?: string;
  dateFilter?: "today" | "this_week" | "this_month" | "last_month" | "this_year" | "custom" | "all";
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
}

export interface ExpenseSummaryMetrics {
  todayTotal: number;
  thisMonthTotal: number;
  thisYearTotal: number;
  totalExpensesCount: number;
}

export interface ExpenseCategoryBreakdown {
  category: string;
  amount: number;
  percentage: number;
  count: number;
}

export interface ExpensePaymentMethodBreakdown {
  paymentMethod: string;
  label: string;
  amount: number;
  percentage: number;
  count: number;
}

export interface ExpenseReportData {
  startDate: string;
  endDate: string;
  totalExpenses: number;
  expensesCount: number;
  categoryBreakdown: ExpenseCategoryBreakdown[];
  paymentMethodBreakdown: ExpensePaymentMethodBreakdown[];
  expenses: any[];
}

function computeDateRange(filter?: string, customStart?: string, customEnd?: string): { start?: string; end?: string } {
  if (filter === "custom" && customStart && customEnd) {
    return { start: customStart, end: customEnd };
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
    case "this_week": {
      const day = now.getDay();
      const diff = now.getDate() - day + (day === 0 ? -6 : 1);
      const monday = new Date(now);
      monday.setDate(diff);
      return { start: formatYMD(monday), end: todayStr };
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
    case "this_year": {
      const firstDay = new Date(now.getFullYear(), 0, 1);
      const lastDay = new Date(now.getFullYear(), 11, 31);
      return { start: formatYMD(firstDay), end: formatYMD(lastDay) };
    }
    case "all":
    default:
      return {};
  }
}

function mapExpenseRow(row: any): Expense {
  const d = row.expense_date || (row.created_at ? row.created_at.slice(0, 10) : "");
  return {
    ...row,
    date: d,
    expense_date: d,
    amount: Number(row.amount) || 0,
  };
}

/**
 * Fetch paginated & filtered expenses
 */
export async function getExpenses(
  optionsOrCategory?: GetExpensesOptions | string,
  pageParam = 1,
  limitParam = 25,
  workspaceId?: string
): Promise<{ expenses: any[]; total: number }> {
  const targetWsId = workspaceId || getActiveWorkspaceId();
  let options: GetExpensesOptions = {};
  if (typeof optionsOrCategory === "string") {
    options = {
      category: optionsOrCategory,
      page: pageParam,
      limit: limitParam,
    };
  } else if (optionsOrCategory) {
    options = optionsOrCategory;
  }

  const {
    search,
    category,
    paymentMethod,
    dateFilter = "all",
    startDate,
    endDate,
    page = 1,
    limit = 25,
  } = options;

  const { start, end } = computeDateRange(dateFilter, startDate, endDate);
  const offset = (page - 1) * limit;
  const q = search?.trim().toLowerCase() || "";

  const supabase = createClient();

  let query = supabase
    .from("expenses")
    .select("*", { count: "exact" })
    .eq("workspace_id", targetWsId)
    .or("is_deleted.is.null,is_deleted.eq.false");

  if (category && category !== "all") {
    query = query.eq("category", category);
  }

  if (paymentMethod && paymentMethod !== "all") {
    if (paymentMethod === "bank_transfer") {
      query = query.or("payment_method.eq.bank_transfer,payment_method.eq.bank");
    } else {
      query = query.eq("payment_method", paymentMethod);
    }
  }

  if (start && end) {
    query = query.gte("expense_date", start).lte("expense_date", end);
  } else if (start) {
    query = query.gte("expense_date", start);
  } else if (end) {
    query = query.lte("expense_date", end);
  }

  if (q) {
    query = query.or(
      `description.ilike.%${q}%,paid_to.ilike.%${q}%,reference_number.ilike.%${q}%,category.ilike.%${q}%`
    );
  }

  const { data, count, error } = await query
    .order("expense_date", { ascending: false })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    console.error("Failed to fetch expenses from Supabase:", error);
    throw error;
  }

  const mapped = (data || []).map(mapExpenseRow);
  return { expenses: mapped, total: count || 0 };
}

/**
 * Fetch top summary metrics: Today, This Month, This Year
 */
export async function getExpenseSummaryMetrics(workspaceId?: string): Promise<ExpenseSummaryMetrics> {
  const targetWsId = workspaceId || getActiveWorkspaceId();
  const now = new Date();
  const formatYMD = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };

  const todayStr = formatYMD(now);
  const firstOfMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const firstOfYear = `${now.getFullYear()}-01-01`;

  const supabase = createClient();

  const { data, error } = await supabase
    .from("expenses")
    .select("amount, expense_date, created_at, is_deleted")
    .eq("workspace_id", targetWsId)
    .or("is_deleted.is.null,is_deleted.eq.false")
    .gte("expense_date", firstOfYear);

  if (error) {
    console.error("Failed to fetch expense summary metrics:", error);
    throw error;
  }

  let todayTotal = 0;
  let thisMonthTotal = 0;
  let thisYearTotal = 0;
  let count = 0;

  (data || []).forEach((exp: any) => {
    const amt = Number(exp.amount) || 0;
    const d = exp.expense_date || (exp.created_at ? exp.created_at.slice(0, 10) : "");
    count++;

    if (d === todayStr) {
      todayTotal += amt;
    }
    if (d >= firstOfMonth) {
      thisMonthTotal += amt;
    }
    if (d >= firstOfYear) {
      thisYearTotal += amt;
    }
  });

  return {
    todayTotal: Math.round(todayTotal * 100) / 100,
    thisMonthTotal: Math.round(thisMonthTotal * 100) / 100,
    thisYearTotal: Math.round(thisYearTotal * 100) / 100,
    totalExpensesCount: count,
  };
}

/**
 * Generate comprehensive Expense Report with category and payment method breakdown
 */
export async function getExpenseReportData(
  startDate?: string,
  endDate?: string,
  workspaceId?: string
): Promise<ExpenseReportData> {
  const targetWsId = workspaceId || getActiveWorkspaceId();
  const now = new Date();
  const formatYMD = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };

  const start = startDate || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const end = endDate || formatYMD(now);

  const supabase = createClient();

  const { data, error } = await supabase
    .from("expenses")
    .select("*")
    .eq("workspace_id", targetWsId)
    .or("is_deleted.is.null,is_deleted.eq.false")
    .gte("expense_date", start)
    .lte("expense_date", end)
    .order("expense_date", { ascending: false });

  if (error) {
    console.error("Failed to fetch expense report data:", error);
    throw error;
  }

  const rawList = (data || []).map(mapExpenseRow);

  let totalExpenses = 0;
  const categoryMap = new Map<string, { amount: number; count: number }>();
  const paymentMap = new Map<string, { amount: number; count: number }>();

  rawList.forEach((exp) => {
    const amt = Number(exp.amount) || 0;
    totalExpenses += amt;

    const cat = exp.category || "Miscellaneous";
    const currentCat = categoryMap.get(cat) || { amount: 0, count: 0 };
    categoryMap.set(cat, {
      amount: currentCat.amount + amt,
      count: currentCat.count + 1,
    });

    const rawMethod = exp.payment_method || "cash";
    const method = rawMethod === "bank" ? "bank_transfer" : rawMethod;
    const currentMethod = paymentMap.get(method) || { amount: 0, count: 0 };
    paymentMap.set(method, {
      amount: currentMethod.amount + amt,
      count: currentMethod.count + 1,
    });
  });

  const categoryBreakdown: ExpenseCategoryBreakdown[] = Array.from(categoryMap.entries())
    .map(([category, stats]) => ({
      category,
      amount: Math.round(stats.amount * 100) / 100,
      percentage: totalExpenses > 0 ? Math.round((stats.amount / totalExpenses) * 1000) / 10 : 0,
      count: stats.count,
    }))
    .sort((a, b) => b.amount - a.amount);

  const methodLabels: Record<string, string> = {
    cash: "Cash",
    bank_transfer: "Bank Transfer",
    credit_card: "Credit Card",
    other: "Other",
  };

  const paymentMethodBreakdown: ExpensePaymentMethodBreakdown[] = Array.from(paymentMap.entries())
    .map(([paymentMethod, stats]) => ({
      paymentMethod,
      label: methodLabels[paymentMethod] || paymentMethod,
      amount: Math.round(stats.amount * 100) / 100,
      percentage: totalExpenses > 0 ? Math.round((stats.amount / totalExpenses) * 1000) / 10 : 0,
      count: stats.count,
    }))
    .sort((a, b) => b.amount - a.amount);

  return {
    startDate: start,
    endDate: end,
    totalExpenses: Math.round(totalExpenses * 100) / 100,
    expensesCount: rawList.length,
    categoryBreakdown,
    paymentMethodBreakdown,
    expenses: rawList,
  };
}

export interface ExpenseDbRow {
  id: string;
  workspace_id: string;
  expense_date: string;
  category: string;
  description: string | null;
  amount: number;
  payment_method: string;
  paid_to: string | null;
  reference_number: string | null;
  notes: string | null;
  attachment_path: string | null;
  created_by: string | null;
  is_deleted: boolean;
  deleted_at: string | null;
  deleted_by: string | null;
  created_at: string;
  updated_at: string;
}

export function buildExpenseDbInsertPayload(
  payload: any,
  meta: { id: string; workspaceId: string }
): ExpenseDbRow {
  const now = new Date().toISOString();
  return {
    id: meta.id,
    workspace_id: meta.workspaceId,
    expense_date: payload.expense_date || payload.date || now.slice(0, 10),
    category: String(payload.category || "").trim(),
    description: payload.description != null ? String(payload.description).trim() || null : null,
    amount: Number(payload.amount) || 0,
    payment_method: payload.payment_method || "cash",
    paid_to: payload.paid_to != null ? String(payload.paid_to).trim() || null : null,
    reference_number: payload.reference_number != null ? String(payload.reference_number).trim() || null : null,
    notes: payload.notes != null ? String(payload.notes).trim() || null : null,
    attachment_path: payload.attachment_path || null,
    created_by: payload.created_by || "Owner",
    is_deleted: false,
    deleted_at: null,
    deleted_by: null,
    created_at: payload.created_at || now,
    updated_at: now,
  };
}

export function buildExpenseDbUpdatePayload(payload: any): Partial<ExpenseDbRow> {
  const updateData: Partial<ExpenseDbRow> = {
    updated_at: new Date().toISOString(),
  };

  if (payload.expense_date !== undefined || payload.date !== undefined) {
    updateData.expense_date = payload.expense_date || payload.date;
  }
  if (payload.category !== undefined) updateData.category = String(payload.category || "").trim();
  if (payload.description !== undefined) {
    updateData.description = payload.description != null ? String(payload.description).trim() || null : null;
  }
  if (payload.amount !== undefined) updateData.amount = Number(payload.amount) || 0;
  if (payload.payment_method !== undefined) updateData.payment_method = payload.payment_method;
  if (payload.paid_to !== undefined) {
    updateData.paid_to = payload.paid_to != null ? String(payload.paid_to).trim() || null : null;
  }
  if (payload.reference_number !== undefined) {
    updateData.reference_number = payload.reference_number != null ? String(payload.reference_number).trim() || null : null;
  }
  if (payload.notes !== undefined) {
    updateData.notes = payload.notes != null ? String(payload.notes).trim() || null : null;
  }
  if (payload.attachment_path !== undefined) updateData.attachment_path = payload.attachment_path;
  if (payload.is_deleted !== undefined) updateData.is_deleted = Boolean(payload.is_deleted);
  if (payload.deleted_at !== undefined) updateData.deleted_at = payload.deleted_at;
  if (payload.deleted_by !== undefined) updateData.deleted_by = payload.deleted_by;

  return updateData;
}

/**
 * Record a new expense
 */
export async function recordExpense(payload: ExpenseInsert, workspaceId?: string): Promise<Expense> {
  const targetWsId = workspaceId || getActiveWorkspaceId();
  if (payload.amount <= 0) {
    throw new Error("Expense amount must be greater than zero.");
  }

  const supabase = createClient();
  const expId = payload.id && payload.id.length === 36 ? payload.id : generateUUID();

  const cleanPayload = buildExpenseDbInsertPayload(payload, {
    id: expId,
    workspaceId: payload.workspace_id || targetWsId,
  });

  saveCustomCategory(cleanPayload.category);

  const { data, error } = await supabase
    .from("expenses")
    .insert(cleanPayload)
    .select()
    .single();

  if (error) {
    console.error("Failed to insert expense into Supabase:", error);
    throw error;
  }

  const created = mapExpenseRow(data);
  invalidateDashboardCache();

  // Sync to Accounts / Ledger
  try {
    const { postExpenseLedger } = await import("./ledger-service");
    await postExpenseLedger(created);
  } catch (e) {
    console.warn("Ledger post for expense notice:", e);
  }

  return created;
}

/**
 * Update an existing expense
 */
export async function updateExpense(id: string, payload: ExpenseUpdate, workspaceId?: string): Promise<Expense> {
  const targetWsId = workspaceId || getActiveWorkspaceId();
  const supabase = createClient();

  if (payload.category) {
    saveCustomCategory(payload.category);
  }

  const updatePayload = buildExpenseDbUpdatePayload(payload);

  const { data, error } = await supabase
    .from("expenses")
    .update(updatePayload)
    .eq("id", id)
    .eq("workspace_id", targetWsId)
    .select()
    .single();

  if (error) {
    console.error(`Failed to update expense ${id} in Supabase:`, error);
    throw error;
  }

  const finalExpense = mapExpenseRow(data);
  invalidateDashboardCache();

  // Update ledger entry
  try {
    const { postExpenseLedger } = await import("./ledger-service");
    await postExpenseLedger(finalExpense);
  } catch (e) {
    console.warn("Ledger sync update notice:", e);
  }

  return finalExpense;
}

/**
 * Soft delete an expense
 */
export async function softDeleteExpense(
  id: string,
  deletedBy = "Admin"
): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient();
  const now = new Date().toISOString();

  const { error } = await supabase
    .from("expenses")
    .update({
      is_deleted: true,
      deleted_at: now,
      deleted_by: deletedBy,
    })
    .eq("id", id);

  if (error) {
    console.error(`Failed to soft delete expense ${id}:`, error);
    throw error;
  }

  invalidateDashboardCache();
  return { success: true };
}

/**
 * Restore an expense from recycle bin
 */
export async function restoreExpense(id: string): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient();

  const { error } = await supabase
    .from("expenses")
    .update({
      is_deleted: false,
      deleted_at: null,
      deleted_by: null,
    })
    .eq("id", id);

  if (error) {
    console.error(`Failed to restore expense ${id}:`, error);
    throw error;
  }

  invalidateDashboardCache();
  return { success: true };
}

/**
 * Permanently delete an expense
 */
export async function permanentlyDeleteExpense(
  id: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient();

  const { error } = await supabase.from("expenses").delete().eq("id", id);
  if (error) {
    console.error(`Failed to permanently delete expense ${id}:`, error);
    throw error;
  }

  invalidateDashboardCache();
  return { success: true };
}

function fileToBase64(file: File | Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    if (typeof FileReader === "undefined") {
      resolve("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==");
      return;
    }
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = (err) => reject(err);
  });
}

/**
 * Upload receipt attachment (JPG, PNG, PDF)
 */
export async function uploadExpenseReceipt(
  file: File
): Promise<{ fileUrl: string; fileName: string; fileType: string; fileSize: number }> {
  const fileName = file.name;
  const fileType = file.type || "application/octet-stream";
  const fileSize = file.size;
  const cleanName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  const filePath = `receipts/${Date.now()}_${cleanName}`;

  const supabase = createClient();

  try {
    const { data, error } = await supabase.storage
      .from("expense-receipts")
      .upload(filePath, file, {
        cacheControl: "3600",
        upsert: true,
      });

    if (error) throw error;

    const { data: publicUrlData } = supabase.storage
      .from("expense-receipts")
      .getPublicUrl(data.path);

    return {
      fileUrl: publicUrlData.publicUrl,
      fileName,
      fileType,
      fileSize,
    };
  } catch (err: any) {
    console.warn("Storage upload fallback to Base64 data URL:", err.message || err);
    const base64Url = await fileToBase64(file);
    return {
      fileUrl: base64Url,
      fileName,
      fileType,
      fileSize,
    };
  }
}

/**
 * Completely remove all expenses for a workspace
 */
export async function clearAllWorkspaceExpenses(workspaceId?: string): Promise<{ success: boolean; count: number }> {
  const targetWsId = workspaceId || getActiveWorkspaceId();
  const supabase = createClient();

  const { error } = await supabase.from("expenses").delete().eq("workspace_id", targetWsId);
  if (error) {
    console.error("Failed to clear workspace expenses:", error);
    throw error;
  }

  invalidateDashboardCache();
  return { success: true, count: 0 };
}


