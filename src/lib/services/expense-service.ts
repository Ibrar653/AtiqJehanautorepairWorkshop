import { createClient } from "@/lib/supabase/client";
import type { Expense, ExpenseInsert, ExpenseUpdate } from "@/types/database";
import { DEFAULT_EXPENSE_CATEGORIES, DEFAULT_WORKSPACE_ID } from "@/lib/constants";
import { getActiveWorkspaceId } from "./workspace-service";
import { invalidateDashboardCache } from "./dashboard-service";

const LOCAL_EXPENSES_KEY = "atiq_local_expenses";
const LOCAL_CUSTOM_CATEGORIES_KEY = "atiq_local_expense_custom_categories";

const DEFAULT_EXPENSES: any[] = [];

let inMemoryExpenses: any[] = [];
let inMemoryCustomCategories: string[] = [];

// Known test expense IDs to always purge
const TEST_EXPENSE_IDS = new Set(["exp-1", "exp-2", "exp-3"]);

export function getLocalExpenses(workspaceId?: string): any[] {
  const targetWsId = workspaceId || getActiveWorkspaceId();
  let all: any[] = [];
  if (typeof window === "undefined") {
    all = inMemoryExpenses;
  } else {
    try {
      const raw = localStorage.getItem(LOCAL_EXPENSES_KEY);
      if (raw !== null) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          // Auto-purge any legacy test records (e.g. exp-3 AED 650)
          const clean = parsed.filter(
            (e: any) =>
              !TEST_EXPENSE_IDS.has(e.id) &&
              e.description !== "Pneumatic impact wrench repair and socket set" &&
              e.description !== "Monthly workshop facility rent payment" &&
              e.description !== "Workshop recovery truck fuel refill"
          );
          if (clean.length !== parsed.length) {
            localStorage.setItem(LOCAL_EXPENSES_KEY, JSON.stringify(clean));
          }
          all = clean;
        }
      } else {
        localStorage.setItem(LOCAL_EXPENSES_KEY, JSON.stringify([]));
        all = [];
      }
    } catch {
      all = inMemoryExpenses;
    }
  }

  // Ensure in-memory is also sanitized of test records
  inMemoryExpenses = inMemoryExpenses.filter(
    (e: any) =>
      !TEST_EXPENSE_IDS.has(e.id) &&
      e.description !== "Pneumatic impact wrench repair and socket set" &&
      e.description !== "Monthly workshop facility rent payment" &&
      e.description !== "Workshop recovery truck fuel refill"
  );

  return all.filter(
    (e) => e.workspace_id === targetWsId || (!e.workspace_id && targetWsId === DEFAULT_WORKSPACE_ID)
  );
}


export function saveLocalExpenses(expenses: any[], workspaceId?: string) {
  const targetWsId = workspaceId || getActiveWorkspaceId();
  let allExisting: any[] = [];
  if (typeof window !== "undefined") {
    try {
      const raw = localStorage.getItem(LOCAL_EXPENSES_KEY);
      if (raw !== null) {
        allExisting = JSON.parse(raw);
      } else {
        allExisting = inMemoryExpenses;
      }
    } catch {
      allExisting = inMemoryExpenses;
    }
  } else {
    allExisting = inMemoryExpenses;
  }
  const others = allExisting.filter((e) => e.workspace_id && e.workspace_id !== targetWsId);
  const taggedExpenses = expenses.map((e) => ({
    ...e,
    workspace_id: e.workspace_id || targetWsId,
  }));
  const merged = [...taggedExpenses, ...others];
  inMemoryExpenses = merged;
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(LOCAL_EXPENSES_KEY, JSON.stringify(merged));
    } catch (e) {
      console.error("Failed to save local expenses", e);
    }
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

function withTimeout<T>(promise: PromiseLike<T>, timeoutMs = 2500): Promise<T> {
  return Promise.race([
    Promise.resolve(promise),
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error("Expense operation timed out")), timeoutMs)
    ),
  ]);
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

  try {
    const fetchWithTimeout = async () => {
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
        query = query.gte("date", start).lte("date", end);
      } else if (start) {
        query = query.gte("date", start);
      } else if (end) {
        query = query.lte("date", end);
      }

      if (q) {
        query = query.or(
          `description.ilike.%${q}%,paid_to.ilike.%${q}%,reference_number.ilike.%${q}%,category.ilike.%${q}%`
        );
      }

      const { data, count, error } = await query
        .order("date", { ascending: false })
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) throw error;
      return { expenses: data || [], total: count || 0 };
    };

    return await withTimeout(fetchWithTimeout(), 2500);
  } catch (err: any) {
    console.warn("Using local expenses fallback store:", err.message || err);
    let list = getLocalExpenses(targetWsId).filter((exp) => !exp.is_deleted);

    if (category && category !== "all") {
      list = list.filter((exp) => exp.category === category);
    }

    if (paymentMethod && paymentMethod !== "all") {
      list = list.filter((exp) => {
        if (paymentMethod === "bank_transfer") {
          return exp.payment_method === "bank_transfer" || exp.payment_method === "bank";
        }
        return exp.payment_method === paymentMethod;
      });
    }

    if (start && end) {
      list = list.filter((exp) => {
        const d = exp.date || exp.expense_date || (exp.created_at ? exp.created_at.slice(0, 10) : "");
        return d >= start && d <= end;
      });
    }

    if (q) {
      list = list.filter((exp) => {
        const desc = (exp.description || "").toLowerCase();
        const vendor = (exp.paid_to || "").toLowerCase();
        const ref = (exp.reference_number || "").toLowerCase();
        const cat = (exp.category || "").toLowerCase();
        return desc.includes(q) || vendor.includes(q) || ref.includes(q) || cat.includes(q);
      });
    }

    const total = list.length;
    const paginated = list.slice(offset, offset + limit);
    return { expenses: paginated, total };
  }
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

  try {
    const fetchMetrics = async () => {
      const { data, error } = await supabase
        .from("expenses")
        .select("amount, date, created_at, is_deleted")
        .eq("workspace_id", targetWsId)
        .or("is_deleted.is.null,is_deleted.eq.false")
        .gte("date", firstOfYear);

      if (error) throw error;

      let todayTotal = 0;
      let thisMonthTotal = 0;
      let thisYearTotal = 0;
      let count = 0;

      (data || []).forEach((exp: any) => {
        const amt = Number(exp.amount) || 0;
        const d = exp.date || (exp.created_at ? exp.created_at.slice(0, 10) : "");
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
    };

    return await withTimeout(fetchMetrics(), 2000);
  } catch (err: any) {
    console.warn("Using local summary metrics fallback:", err.message || err);
    const local = getLocalExpenses(targetWsId).filter((exp) => !exp.is_deleted);

    let todayTotal = 0;
    let thisMonthTotal = 0;
    let thisYearTotal = 0;

    local.forEach((exp: any) => {
      const amt = Number(exp.amount) || 0;
      const d = exp.date || exp.expense_date || (exp.created_at ? exp.created_at.slice(0, 10) : "");

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
      totalExpensesCount: local.length,
    };
  }
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

  let rawList: any[] = [];

  try {
    const fetchReport = async () => {
      const { data, error } = await supabase
        .from("expenses")
        .select("*")
        .eq("workspace_id", targetWsId)
        .or("is_deleted.is.null,is_deleted.eq.false")
        .gte("date", start)
        .lte("date", end)
        .order("date", { ascending: false });

      if (error) throw error;
      return data || [];
    };

    rawList = await withTimeout(fetchReport(), 2500);
  } catch (err: any) {
    console.warn("Using local report fallback:", err.message || err);
    rawList = getLocalExpenses(targetWsId).filter((exp) => {
      if (exp.is_deleted) return false;
      const d = exp.date || exp.expense_date || (exp.created_at ? exp.created_at.slice(0, 10) : "");
      return d >= start && d <= end;
    });
  }


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

/**
 * Record a new expense
 */
export async function recordExpense(payload: ExpenseInsert, workspaceId?: string): Promise<Expense> {
  const targetWsId = workspaceId || getActiveWorkspaceId();
  if (payload.amount <= 0) {
    throw new Error("Expense amount must be greater than zero.");
  }

  const supabase = createClient();
  const now = new Date().toISOString();
  const expId = payload.id || "exp-" + Date.now() + "-" + Math.random().toString(36).substring(2, 6);

  const cleanPayload = {
    ...payload,
    id: expId,
    workspace_id: payload.workspace_id || targetWsId,
    date: payload.date || payload.expense_date || now.slice(0, 10),
    category: payload.category.trim(),
    description: payload.description || null,
    paid_to: payload.paid_to?.trim() || null,
    reference_number: payload.reference_number?.trim() || null,
    notes: payload.notes?.trim() || null,
    attachment_path: payload.attachment_path || null,
    is_deleted: false,
    created_at: now,
    updated_at: now,
  };

  saveCustomCategory(cleanPayload.category);

  try {
    const fetchWithTimeout = async () => {
      const { data, error } = await supabase
        .from("expenses")
        .insert(cleanPayload)
        .select()
        .single();

      if (error) throw error;
      return data;
    };

    const created = await withTimeout(fetchWithTimeout(), 2500);
    const list = getLocalExpenses(targetWsId);
    list.unshift(created);
    saveLocalExpenses(list, targetWsId);
    invalidateDashboardCache();

    // Sync to Accounts / Ledger
    try {
      const { postExpenseLedger } = await import("./ledger-service");
      await postExpenseLedger(created);
    } catch (e) {
      console.warn("Ledger post for expense notice:", e);
    }

    return created;
  } catch (err: any) {
    console.warn("Recording expense in local fallback store:", err.message || err);
    const list = getLocalExpenses(targetWsId);
    list.unshift(cleanPayload);
    saveLocalExpenses(list, targetWsId);
    invalidateDashboardCache();

    // Sync to Accounts / Ledger
    try {
      const { postExpenseLedger } = await import("./ledger-service");
      await postExpenseLedger(cleanPayload as Expense);
    } catch (e) {
      console.warn("Ledger post for expense fallback notice:", e);
    }

    return cleanPayload as Expense;
  }
}

/**
 * Update an existing expense
 */
export async function updateExpense(id: string, payload: ExpenseUpdate): Promise<Expense> {
  const supabase = createClient();
  const now = new Date().toISOString();

  if (payload.category) {
    saveCustomCategory(payload.category);
  }

  const updatePayload = {
    ...payload,
    updated_at: now,
  };

  // Update in local cache
  const list = getLocalExpenses();
  const updatedList = list.map((exp) => (exp.id === id ? { ...exp, ...updatePayload } : exp));
  saveLocalExpenses(updatedList);
  invalidateDashboardCache();

  let finalExpense: Expense | null = null;

  try {
    const { data, error } = await supabase
      .from("expenses")
      .update(updatePayload)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    finalExpense = data;
  } catch (err: any) {
    console.warn("Updating expense in local fallback:", err.message || err);
    const found = updatedList.find((exp) => exp.id === id);
    if (!found) throw new Error("Expense not found");
    finalExpense = found;
  }

  // Update ledger entry
  if (finalExpense) {
    try {
      const { postExpenseLedger } = await import("./ledger-service");
      await postExpenseLedger(finalExpense);
    } catch (e) {
      console.warn("Ledger sync update notice:", e);
    }
  }

  return finalExpense!;
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

  const list = getLocalExpenses();
  const updatedList = list.map((exp) =>
    exp.id === id
      ? { ...exp, is_deleted: true, deleted_at: now, deleted_by: deletedBy }
      : exp
  );
  saveLocalExpenses(updatedList);
  invalidateDashboardCache();

  // Reverse / remove from ledger
  try {
    const { getLocalTransactions, saveLocalTransactions, getLocalEntries, saveLocalEntries } = await import("./ledger-service");
    const txns = getLocalTransactions();
    const toRemove = txns.find((t) => t.reference_type === "expense" && t.reference_id === id);
    if (toRemove) {
      saveLocalTransactions(txns.filter((t) => t.id !== toRemove.id));
      const entries = getLocalEntries().filter((e) => e.transaction_id !== toRemove.id);
      saveLocalEntries(entries);
    }
  } catch (e) {
    console.warn("Ledger removal for soft deleted expense notice:", e);
  }

  try {
    const { error } = await supabase
      .from("expenses")
      .update({
        is_deleted: true,
        deleted_at: now,
        deleted_by: deletedBy,
      })
      .eq("id", id);

    if (error) throw error;
    return { success: true };
  } catch (err: any) {
    console.warn("Soft deleting expense fallback to local store:", err.message || err);
    return { success: true };
  }
}

/**
 * Restore an expense from recycle bin
 */
export async function restoreExpense(id: string): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient();

  const list = getLocalExpenses();
  const updatedList = list.map((exp) =>
    exp.id === id
      ? { ...exp, is_deleted: false, deleted_at: null, deleted_by: null }
      : exp
  );
  saveLocalExpenses(updatedList);
  invalidateDashboardCache();

  try {
    const { error } = await supabase
      .from("expenses")
      .update({
        is_deleted: false,
        deleted_at: null,
        deleted_by: null,
      })
      .eq("id", id);

    if (error) throw error;
    return { success: true };
  } catch (err: any) {
    console.warn("Restoring expense fallback to local store:", err.message || err);
    return { success: true };
  }
}

/**
 * Permanently delete an expense
 */
export async function permanentlyDeleteExpense(
  id: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient();

  const list = getLocalExpenses();
  const updatedList = list.filter((exp) => exp.id !== id);
  saveLocalExpenses(updatedList);
  invalidateDashboardCache();

  try {
    const { error } = await supabase.from("expenses").delete().eq("id", id);
    if (error) throw error;
    return { success: true };
  } catch (err: any) {
    console.warn("Permanently deleting expense fallback to local store:", err.message || err);
    return { success: true };
  }
}

/**
 * Convert file to Base64 (fallback for receipts upload)
 */
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
 * Completely remove all expenses for a workspace (and unlinks any linked ledger postings)
 */
export async function clearAllWorkspaceExpenses(workspaceId?: string): Promise<{ success: boolean; count: number }> {
  const targetWsId = workspaceId || getActiveWorkspaceId();
  const supabase = createClient();

  // 1. Sanitize in-memory store
  const countBefore = inMemoryExpenses.filter(
    (e) => e.workspace_id === targetWsId || (!e.workspace_id && targetWsId === DEFAULT_WORKSPACE_ID)
  ).length;

  inMemoryExpenses = inMemoryExpenses.filter(
    (e) => e.workspace_id && e.workspace_id !== targetWsId
  );

  // 2. Sanitize local storage
  if (typeof window !== "undefined") {
    try {
      const raw = localStorage.getItem(LOCAL_EXPENSES_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          const filtered = parsed.filter(
            (e: any) => e.workspace_id && e.workspace_id !== targetWsId
          );
          localStorage.setItem(LOCAL_EXPENSES_KEY, JSON.stringify(filtered));
        }
      }
    } catch {}
  }

  // 3. Unlink and remove any ledger transactions referencing expenses for this workspace
  try {
    const { getLocalTransactions, saveLocalTransactions, getLocalEntries, saveLocalEntries } = await import("./ledger-service");
    const txns = getLocalTransactions(targetWsId);
    const expenseTxns = txns.filter((t) => t.reference_type === "expense");
    if (expenseTxns.length > 0) {
      const expenseTxnIds = new Set(expenseTxns.map((t) => t.id));
      const remainingTxns = txns.filter((t) => !expenseTxnIds.has(t.id));
      saveLocalTransactions(remainingTxns, targetWsId);
      const entries = getLocalEntries().filter((e) => !expenseTxnIds.has(e.transaction_id));
      saveLocalEntries(entries);
    }
  } catch (e) {
    console.warn("Ledger cleanup notice for workspace expenses:", e);
  }

  // 4. Delete from Supabase if table exists
  try {
    await supabase.from("expenses").delete().eq("workspace_id", targetWsId);
  } catch {}

  // 5. Invalidate caches
  invalidateDashboardCache();

  return { success: true, count: countBefore };
}

