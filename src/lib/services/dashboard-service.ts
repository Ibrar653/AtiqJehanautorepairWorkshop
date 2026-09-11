import { createClient } from "@/lib/supabase/client";
import type { JobCardWithRelations, Part } from "@/types/database";
import { getLocalExpenses } from "./expense-service";

export type DashboardPeriod =
  | "today"
  | "yesterday"
  | "this_week"
  | "this_month"
  | "last_month"
  | "this_year"
  | "custom";

export interface DateRange {
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
}

export interface DashboardMetrics {
  totalSales: number;
  serviceSales: number;
  partsSales: number;
  cashReceived: number;
  bankReceived: number;
  outstandingCredit: number;
  totalJobCards: number;
  completedJobs: number;
  openJobs: number;
  expenses: number;
  partsCost: number;
  grossProfit: number;
  netProfit: number;
  isProfitDataIncomplete: boolean;
  lowStockPartsCount: number;
  chartData: {
    labels: string[];
    salesSeries: number[];
    expensesSeries: number[];
    profitSeries: number[];
  };
}

export function getDateRangeForPeriod(
  period: DashboardPeriod,
  customRange?: { startDate?: string; endDate?: string }
): DateRange {
  const now = new Date();
  const formatYMD = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };

  if (period === "custom" && customRange?.startDate && customRange?.endDate) {
    return {
      startDate: customRange.startDate,
      endDate: customRange.endDate,
    };
  }

  const todayStr = formatYMD(now);

  switch (period) {
    case "today":
      return { startDate: todayStr, endDate: todayStr };

    case "yesterday": {
      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      return { startDate: formatYMD(y), endDate: formatYMD(y) };
    }

    case "this_week": {
      // Monday as start of week
      const day = now.getDay();
      const diff = now.getDate() - day + (day === 0 ? -6 : 1);
      const monday = new Date(now);
      monday.setDate(diff);
      return { startDate: formatYMD(monday), endDate: todayStr };
    }

    case "this_month": {
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
      const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      return { startDate: formatYMD(firstDay), endDate: formatYMD(lastDay) };
    }

    case "last_month": {
      const firstDay = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastDay = new Date(now.getFullYear(), now.getMonth(), 0);
      return { startDate: formatYMD(firstDay), endDate: formatYMD(lastDay) };
    }

    case "this_year": {
      const firstDay = new Date(now.getFullYear(), 0, 1);
      const lastDay = new Date(now.getFullYear(), 11, 31);
      return { startDate: formatYMD(firstDay), endDate: formatYMD(lastDay) };
    }

    default:
      return { startDate: todayStr, endDate: todayStr };
  }
}

// In-memory caching for dashboard metrics per date range
const dashboardCache = new Map<string, { timestamp: number; data: DashboardMetrics }>();
const DASHBOARD_CACHE_TTL_MS = 20000; // 20 seconds TTL

import { getActiveWorkspaceId } from "./workspace-service";
import { DEFAULT_WORKSPACE_ID } from "@/lib/constants";

export function invalidateDashboardCache() {
  dashboardCache.clear();
}

/**
 * Computes the recognized date for a fully-paid, completed transaction.
 * Recognized date = the LATER of:
 * 1. Job Card completion timestamp/date
 * 2. Full settlement timestamp/date (when balance reached 0)
 */
function computeSaleRecognitionDate(
  jobCard: any | null,
  invoice: any | null,
  relatedPayments: any[]
): string {
  let completionDate = "";
  if (jobCard) {
    if (jobCard.updated_at) completionDate = jobCard.updated_at.slice(0, 10);
    else if (jobCard.date) completionDate = jobCard.date.slice(0, 10);
    else if (jobCard.created_at) completionDate = jobCard.created_at.slice(0, 10);
  }

  let settlementDate = "";
  if (relatedPayments && relatedPayments.length > 0) {
    const sorted = [...relatedPayments].sort((a, b) => {
      const da = a.payment_date || a.created_at || "";
      const db = b.payment_date || b.created_at || "";
      return da.localeCompare(db);
    });
    const latest = sorted[sorted.length - 1];
    settlementDate = (latest.payment_date || latest.created_at || "").slice(0, 10);
  }

  if (!settlementDate) {
    if (invoice?.updated_at) settlementDate = invoice.updated_at.slice(0, 10);
    else if (invoice?.created_at) settlementDate = invoice.created_at.slice(0, 10);
    else if (jobCard?.updated_at) settlementDate = jobCard.updated_at.slice(0, 10);
    else if (jobCard?.date) settlementDate = jobCard.date.slice(0, 10);
  }

  if (completionDate && settlementDate) {
    return completionDate > settlementDate ? completionDate : settlementDate;
  }
  return settlementDate || completionDate || new Date().toISOString().slice(0, 10);
}

export async function getDashboardData(
  period: DashboardPeriod = "this_month",
  customRange?: { startDate?: string; endDate?: string },
  forceRefresh = false,
  workspaceId?: string
): Promise<DashboardMetrics> {
  const targetWsId = workspaceId || getActiveWorkspaceId();
  const { startDate, endDate } = getDateRangeForPeriod(period, customRange);
  const cacheKey = `${targetWsId}_${period}_${startDate}_${endDate}`;

  // Serve from cache if fresh and not forced
  if (!forceRefresh) {
    const cached = dashboardCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < DASHBOARD_CACHE_TTL_MS) {
      return cached.data;
    }
  }

  const supabase = createClient();

  try {
    const fetchWithTimeout = async () => {
      // 1. Fetch active Job Cards in target workspace
      const jobCardsPromise = supabase
        .from("job_cards")
        .select(
          "id, job_card_number, date, created_at, updated_at, status, total, paid, balance, payment_status, is_deleted, items:job_card_items(id, item_type, quantity, unit_price, total_price, part_id, cost_price)"
        )
        .eq("workspace_id", targetWsId)
        .or("is_deleted.is.null,is_deleted.eq.false");

      // 2. Fetch Expenses in date range
      const expensesPromise = supabase
        .from("expenses")
        .select("id, date, amount, category, is_deleted")
        .eq("workspace_id", targetWsId)
        .gte("date", startDate)
        .lte("date", endDate)
        .or("is_deleted.is.null,is_deleted.eq.false");

      // 3. Fetch Payments in target workspace
      const paymentsPromise = supabase
        .from("payments")
        .select("id, invoice_id, job_card_id, payment_date, amount, payment_method, created_at")
        .eq("workspace_id", targetWsId);

      // 4. Fetch Invoices in target workspace
      const invoicesPromise = supabase
        .from("invoices")
        .select(
          "id, invoice_number, job_card_id, invoice_type, created_at, updated_at, total, subtotal, discount, vat_amount, paid, balance, payment_status, is_void, is_deleted, items:invoice_items(id, item_type, description, quantity, unit_price, total_price, part_id, cost_price)"
        )
        .eq("workspace_id", targetWsId);

      // 5. Fetch Parts for stock alerts and cost map
      const partsPromise = supabase
        .from("parts")
        .select("id, purchase_price, current_stock, minimum_stock, is_active")
        .eq("workspace_id", targetWsId);

      return await Promise.all([
        jobCardsPromise,
        expensesPromise,
        paymentsPromise,
        invoicesPromise,
        partsPromise,
      ]);
    };

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Dashboard query timed out")), 1800)
    );

    const [
      { data: jobCardsData, error: jcErr },
      { data: expensesData, error: expErr },
      { data: paymentsData, error: payErr },
      { data: invoicesData, error: invErr },
      { data: partsData, error: prtErr },
    ] = await Promise.race([fetchWithTimeout(), timeoutPromise]);

    if (jcErr) console.warn("Supabase job_cards fetch notice:", jcErr.message);

    let jobCards: any[] = (jobCardsData || []).filter((j: any) => !j.is_deleted);
    let expenses: any[] = (expensesData || []).filter((e: any) => !e.is_deleted);
    let payments: any[] = paymentsData || [];
    let invoices: any[] = (invoicesData || []).filter((inv: any) => !inv.is_deleted && !inv.is_void && inv.payment_status !== "void");
    let parts: Part[] = (partsData as any[]) || [];

    if (invErr) {
      const { getLocalInvoices, getLocalInvoiceItems } = await import("./invoice-service");
      const localInvs = getLocalInvoices(targetWsId).filter((inv: any) => !inv.is_deleted && !inv.is_void && inv.payment_status !== "void");
      const localItems = getLocalInvoiceItems();
      invoices = localInvs.map((inv: any) => ({
        ...inv,
        items: inv.items && inv.items.length > 0 ? inv.items : localItems.filter((it: any) => it.invoice_id === inv.id),
      }));
    }

    if (expErr) {
      const { getLocalExpenses } = await import("./expense-service");
      const localExps = getLocalExpenses(targetWsId).filter(
        (e: any) => !e.is_deleted && (!e.date || (e.date >= startDate && e.date <= endDate))
      );
      expenses = localExps;
    }

    if (jcErr) {
      const { getLocalJobCards } = await import("./job-card-service");
      const localJcs = getLocalJobCards(targetWsId).filter((jc: any) => !jc.is_deleted);
      jobCards = localJcs;
    }

    if (payErr) {
      const { getLocalPayments } = await import("./payment-service");
      payments = getLocalPayments();
    }

    // Parts Catalog Map for Cost Calculation
    const partCostMap = new Map<string, number>();
    parts.forEach((p) => {
      partCostMap.set(p.id, Number(p.purchase_price) || 0);
    });

    // ─── Metric Calculations ──────────────────────────────────────────────────
    let totalSales = 0;
    let serviceSales = 0;
    let partsSales = 0;
    let outstandingCredit = 0;
    let completedJobs = 0;
    let openJobs = 0;
    const totalJobCards = jobCards.filter((jc) => jc.status !== "cancelled").length;

    let partsCost = 0;
    let missingCostItemsCount = 0;
    let totalPartItemsCount = 0;

    // Timeline Aggregation for Charts
    const dateMap = new Map<string, { sales: number; expenses: number; cost: number }>();

    // Tracking sets to prevent any duplication
    const processedInvoiceIds = new Set<string>();
    const processedJobCardIds = new Set<string>();

    // 1. Process All Invoices
    invoices.forEach((inv: any) => {
      if (inv.is_deleted || inv.is_void || inv.payment_status === "void") {
        return;
      }

      processedInvoiceIds.add(inv.id);
      const linkedJc = inv.job_card_id ? jobCards.find((j: any) => j.id === inv.job_card_id) : null;
      if (linkedJc) {
        processedJobCardIds.add(linkedJc.id);
      }

      const invTotal = Number(inv.total) || (linkedJc ? Number(linkedJc.total) : 0) || 0;
      const invPaid = Number(inv.paid) || 0;
      const invBalance = Number(inv.balance) !== undefined ? Number(inv.balance) : Math.max(0, invTotal - invPaid);

      // Track Outstanding Receivables
      if (invBalance > 0) {
        outstandingCredit += invBalance;
      }

      // Check Fully-Paid Requirement:
      // grand_total > 0 and balance <= 0 (or paid >= total and payment_status is 'paid')
      const isPaidStatus = String(inv.payment_status || "").toLowerCase() === "paid" || String(inv.payment_status || "").toLowerCase() === "paid full";
      const isFullyPaid = invTotal > 0 && (invBalance <= 0 || invPaid >= invTotal || isPaidStatus);

      // Check Completion Requirement:
      // If linked to a Job Card: Job Card MUST be 'completed' (not new, not in_progress, not waiting, not cancelled)
      // If Direct Invoice (no Job Card): No Job Card required
      let isCompleted = false;
      if (linkedJc) {
        isCompleted = linkedJc.status === "completed" && !linkedJc.is_deleted && linkedJc.status !== "cancelled";
      } else {
        isCompleted = true; // Direct invoice
      }

      // ONLY count if BOTH Fully Paid AND Completed!
      if (!isFullyPaid || !isCompleted || invTotal <= 0) {
        return;
      }

      // Find related payments to determine exact recognition date
      const relatedPayments = payments.filter(
        (p: any) => p.invoice_id === inv.id || (linkedJc && p.job_card_id === linkedJc.id)
      );

      const recognizedDate = computeSaleRecognitionDate(linkedJc, inv, relatedPayments);

      // Date Range Filtering: Only include if recognizedDate falls within [startDate, endDate]
      if (recognizedDate < startDate || recognizedDate > endDate) {
        return;
      }

      // Recognized Sale counts!
      totalSales += invTotal;

      // Extract Line Items (Services vs Parts)
      const invItems = inv.items && Array.isArray(inv.items) && inv.items.length > 0 
        ? inv.items 
        : (linkedJc?.items && Array.isArray(linkedJc.items) ? linkedJc.items : []);

      let itemServiceTotal = 0;
      let itemPartsTotal = 0;

      if (invItems.length > 0) {
        invItems.forEach((item: any) => {
          const qty = Number(item.quantity) || 1;
          const lineTotal = Number(item.total_price) || (qty * (Number(item.unit_price) || 0));

          if (item.item_type === "service" || item.item_type === "labour") {
            itemServiceTotal += lineTotal;
          } else if (item.item_type === "part") {
            itemPartsTotal += lineTotal;
            totalPartItemsCount++;

            const unitCost = Number(item.cost_price) || (item.part_id && partCostMap.get(item.part_id)) || 0;
            if (unitCost > 0) {
              partsCost += unitCost * qty;
            } else {
              missingCostItemsCount++;
            }
          } else {
            // Unspecified item_type
            if (inv.invoice_type === "direct_service") {
              itemServiceTotal += lineTotal;
            } else {
              itemPartsTotal += lineTotal;
            }
          }
        });
      } else {
        if (inv.invoice_type === "direct_service") {
          itemServiceTotal = Number(inv.subtotal) || invTotal;
        } else if (inv.invoice_type === "direct_parts" || inv.invoice_type === "direct_parts_sale") {
          itemPartsTotal = Number(inv.subtotal) || invTotal;
        } else {
          itemServiceTotal = Number(inv.subtotal) || invTotal;
        }
      }

      serviceSales += itemServiceTotal;
      partsSales += itemPartsTotal;

      // Add to timeline chart
      if (!dateMap.has(recognizedDate)) {
        dateMap.set(recognizedDate, { sales: 0, expenses: 0, cost: 0 });
      }
      dateMap.get(recognizedDate)!.sales += invTotal;
    });

    // 2. Process Standalone Job Cards (Job Cards with no separate Invoice record)
    jobCards.forEach((jc: any) => {
      if (jc.is_deleted || jc.status === "cancelled") {
        return;
      }

      // Already processed via an invoice
      if (processedJobCardIds.has(jc.id)) {
        return;
      }

      const jcTotal = Number(jc.total) || 0;
      const jcPaid = Number(jc.paid) || 0;
      const jcBalance = Number(jc.balance) !== undefined ? Number(jc.balance) : Math.max(0, jcTotal - jcPaid);

      // Track Outstanding Receivables
      if (jcBalance > 0) {
        outstandingCredit += jcBalance;
      }

      const isPaidStatus = String(jc.payment_status || "").toLowerCase() === "paid" || String(jc.payment_status || "").toLowerCase() === "paid full";
      const isFullyPaid = jcTotal > 0 && (jcBalance <= 0 || jcPaid >= jcTotal || isPaidStatus);
      const isCompleted = jc.status === "completed";

      // ONLY count if BOTH Fully Paid AND Completed!
      if (!isFullyPaid || !isCompleted || jcTotal <= 0) {
        return;
      }

      const relatedPayments = payments.filter((p: any) => p.job_card_id === jc.id);
      const recognizedDate = computeSaleRecognitionDate(jc, null, relatedPayments);

      if (recognizedDate < startDate || recognizedDate > endDate) {
        return;
      }

      totalSales += jcTotal;

      if (jc.items && Array.isArray(jc.items)) {
        jc.items.forEach((item: any) => {
          const qty = Number(item.quantity) || 1;
          const lineTotal = Number(item.total_price) || (qty * (Number(item.unit_price) || 0));

          if (item.item_type === "service" || item.item_type === "labour") {
            serviceSales += lineTotal;
          } else if (item.item_type === "part") {
            partsSales += lineTotal;
            totalPartItemsCount++;

            const unitCost = Number(item.cost_price) || (item.part_id && partCostMap.get(item.part_id)) || 0;
            if (unitCost > 0) {
              partsCost += unitCost * qty;
            } else {
              missingCostItemsCount++;
            }
          } else {
            serviceSales += lineTotal;
          }
        });
      }

      // Add to timeline chart
      if (!dateMap.has(recognizedDate)) {
        dateMap.set(recognizedDate, { sales: 0, expenses: 0, cost: 0 });
      }
      dateMap.get(recognizedDate)!.sales += jcTotal;
    });

    // 3. Count Job Statuses across active job cards
    jobCards.forEach((jc: any) => {
      if (jc.is_deleted || jc.status === "cancelled") return;
      if (jc.status === "completed") {
        completedJobs++;
      } else if (["new", "in_progress", "waiting"].includes(jc.status)) {
        openJobs++;
      }
    });

    // 4. Process Expenses
    let totalExpenses = 0;
    expenses.forEach((exp) => {
      const amt = Number(exp.amount) || 0;
      totalExpenses += amt;

      const expDate = exp.date || startDate;
      if (!dateMap.has(expDate)) {
        dateMap.set(expDate, { sales: 0, expenses: 0, cost: 0 });
      }
      dateMap.get(expDate)!.expenses += amt;
    });

    // 5. Process Payments in Date Range for Cash / Bank received widgets
    let cashReceived = 0;
    let bankReceived = 0;
    payments.forEach((pay: any) => {
      const pDate = (pay.payment_date || pay.created_at || "").slice(0, 10);
      if (pDate >= startDate && pDate <= endDate) {
        const amt = Number(pay.amount) || 0;
        if (pay.payment_method === "cash") {
          cashReceived += amt;
        } else if (pay.payment_method === "bank" || pay.payment_method === "card") {
          bankReceived += amt;
        }
      }
    });

    // Profit Calculation Logic
    const isProfitDataIncomplete =
      totalPartItemsCount > 0 && missingCostItemsCount > 0 && partsCost === 0;

    const grossProfit = Math.round((totalSales - partsCost) * 100) / 100;
    const netProfit = Math.round((grossProfit - totalExpenses) * 100) / 100;

    // Low Stock Count
    const lowStockPartsCount = parts.filter(
      (p) => p.is_active && p.current_stock <= p.minimum_stock
    ).length;

    // Generate Chart Time Series
    const sortedDates = Array.from(dateMap.keys()).sort();
    const chartLabels: string[] = [];
    const salesSeries: number[] = [];
    const expensesSeries: number[] = [];
    const profitSeries: number[] = [];

    if (sortedDates.length > 0) {
      sortedDates.forEach((d) => {
        const entry = dateMap.get(d)!;
        chartLabels.push(d);
        salesSeries.push(Math.round(entry.sales * 100) / 100);
        expensesSeries.push(Math.round(entry.expenses * 100) / 100);
        profitSeries.push(Math.round((entry.sales - entry.expenses) * 100) / 100);
      });
    }

    const resultMetrics: DashboardMetrics = {
      totalSales: Math.round(totalSales * 100) / 100,
      serviceSales: Math.round(serviceSales * 100) / 100,
      partsSales: Math.round(partsSales * 100) / 100,
      cashReceived: Math.round(cashReceived * 100) / 100,
      bankReceived: Math.round(bankReceived * 100) / 100,
      outstandingCredit: Math.round(outstandingCredit * 100) / 100,
      totalJobCards,
      completedJobs,
      openJobs,
      expenses: Math.round(totalExpenses * 100) / 100,
      partsCost: Math.round(partsCost * 100) / 100,
      grossProfit,
      netProfit,
      isProfitDataIncomplete,
      lowStockPartsCount,
      chartData: {
        labels: chartLabels,
        salesSeries,
        expensesSeries,
        profitSeries,
      },
    };

    dashboardCache.set(cacheKey, { timestamp: Date.now(), data: resultMetrics });
    return resultMetrics;
  } catch (err: any) {
    console.warn("Fallback to local storage in getDashboardData:", err);
    const fallback = getLocalDashboardDataFallback(startDate, endDate, targetWsId);
    dashboardCache.set(cacheKey, { timestamp: Date.now(), data: fallback });
    return fallback;
  }
}

function getLocalDashboardDataFallback(startDate: string, endDate: string, workspaceId?: string): DashboardMetrics {
  const targetWsId = workspaceId || getActiveWorkspaceId();
  let localJobCards: any[] = [];
  let localExpenses: any[] = getLocalExpenses(targetWsId);
  let localInvoices: any[] = [];
  let localPayments: any[] = [];

  try {
    if (typeof window !== "undefined") {
      const rawJc = localStorage.getItem("atiq_local_job_cards");
      if (rawJc) localJobCards = JSON.parse(rawJc);
      const rawExp = localStorage.getItem("atiq_local_expenses");
      if (rawExp) localExpenses = JSON.parse(rawExp);
      const rawInv = localStorage.getItem("atiq_local_invoices");
      if (rawInv) localInvoices = JSON.parse(rawInv);
      const rawPay = localStorage.getItem("atiq_local_payments");
      if (rawPay) localPayments = JSON.parse(rawPay);
    }
  } catch {}

  const activeJobCards = localJobCards.filter(
    (jc) =>
      !jc.is_deleted &&
      (jc.workspace_id === targetWsId || (!jc.workspace_id && targetWsId === DEFAULT_WORKSPACE_ID))
  );

  const activeExpenses = localExpenses.filter(
    (exp) =>
      !exp.is_deleted &&
      (exp.workspace_id === targetWsId || (!exp.workspace_id && targetWsId === DEFAULT_WORKSPACE_ID)) &&
      (!exp.date || (exp.date >= startDate && exp.date <= endDate))
  );

  const activeInvoices = localInvoices.filter(
    (inv) =>
      !inv.is_deleted &&
      !inv.is_void &&
      inv.payment_status !== "void" &&
      (inv.workspace_id === targetWsId || (!inv.workspace_id && targetWsId === DEFAULT_WORKSPACE_ID))
  );

  let totalSales = 0;
  let serviceSales = 0;
  let partsSales = 0;
  let outstandingCredit = 0;
  let completedJobs = 0;
  let openJobs = 0;
  const totalJobCards = activeJobCards.filter((jc) => jc.status !== "cancelled").length;

  const dateMap = new Map<string, { sales: number; expenses: number; cost: number }>();
  const processedInvoiceIds = new Set<string>();
  const processedJobCardIds = new Set<string>();

  // Process Invoices
  activeInvoices.forEach((inv) => {
    processedInvoiceIds.add(inv.id);
    const linkedJc = inv.job_card_id ? activeJobCards.find((j) => j.id === inv.job_card_id) : null;
    if (linkedJc) processedJobCardIds.add(linkedJc.id);

    const invTotal = Number(inv.total) || (linkedJc ? Number(linkedJc.total) : 0) || 0;
    const invPaid = Number(inv.paid) || 0;
    const invBalance = Number(inv.balance) !== undefined ? Number(inv.balance) : Math.max(0, invTotal - invPaid);

    if (invBalance > 0) {
      outstandingCredit += invBalance;
    }

    const isPaidStatus = String(inv.payment_status || "").toLowerCase() === "paid" || String(inv.payment_status || "").toLowerCase() === "paid full";
    const isFullyPaid = invTotal > 0 && (invBalance <= 0 || invPaid >= invTotal || isPaidStatus);

    let isCompleted = false;
    if (linkedJc) {
      isCompleted = linkedJc.status === "completed" && !linkedJc.is_deleted && linkedJc.status !== "cancelled";
    } else {
      isCompleted = true;
    }

    if (!isFullyPaid || !isCompleted || invTotal <= 0) {
      return;
    }

    const relatedPayments = localPayments.filter(
      (p) => p.invoice_id === inv.id || (linkedJc && p.job_card_id === linkedJc.id)
    );
    const recognizedDate = computeSaleRecognitionDate(linkedJc, inv, relatedPayments);

    if (recognizedDate < startDate || recognizedDate > endDate) {
      return;
    }

    totalSales += invTotal;

    const invItems = inv.items && Array.isArray(inv.items) && inv.items.length > 0 
      ? inv.items 
      : (linkedJc?.items && Array.isArray(linkedJc.items) ? linkedJc.items : []);

    let itemServiceTotal = 0;
    let itemPartsTotal = 0;

    if (invItems.length > 0) {
      invItems.forEach((item: any) => {
        const qty = Number(item.quantity) || 1;
        const lineTotal = Number(item.total_price) || (qty * (Number(item.unit_price) || 0));
        if (item.item_type === "service" || item.item_type === "labour") {
          itemServiceTotal += lineTotal;
        } else if (item.item_type === "part") {
          itemPartsTotal += lineTotal;
        } else if (inv.invoice_type === "direct_service") {
          itemServiceTotal += lineTotal;
        } else {
          itemPartsTotal += lineTotal;
        }
      });
    } else {
      if (inv.invoice_type === "direct_service") itemServiceTotal = Number(inv.subtotal) || invTotal;
      else itemPartsTotal = Number(inv.subtotal) || invTotal;
    }

    serviceSales += itemServiceTotal;
    partsSales += itemPartsTotal;

    if (!dateMap.has(recognizedDate)) {
      dateMap.set(recognizedDate, { sales: 0, expenses: 0, cost: 0 });
    }
    dateMap.get(recognizedDate)!.sales += invTotal;
  });

  // Process Standalone Job Cards
  activeJobCards.forEach((jc) => {
    if (jc.status === "cancelled") return;
    if (processedJobCardIds.has(jc.id)) return;

    const jcTotal = Number(jc.total) || 0;
    const jcPaid = Number(jc.paid) || 0;
    const jcBalance = Number(jc.balance) !== undefined ? Number(jc.balance) : Math.max(0, jcTotal - jcPaid);

    if (jcBalance > 0) {
      outstandingCredit += jcBalance;
    }

    const isPaidStatus = String(jc.payment_status || "").toLowerCase() === "paid" || String(jc.payment_status || "").toLowerCase() === "paid full";
    const isFullyPaid = jcTotal > 0 && (jcBalance <= 0 || jcPaid >= jcTotal || isPaidStatus);
    const isCompleted = jc.status === "completed";

    if (!isFullyPaid || !isCompleted || jcTotal <= 0) {
      return;
    }

    const relatedPayments = localPayments.filter((p) => p.job_card_id === jc.id);
    const recognizedDate = computeSaleRecognitionDate(jc, null, relatedPayments);

    if (recognizedDate < startDate || recognizedDate > endDate) {
      return;
    }

    totalSales += jcTotal;

    if (jc.items && Array.isArray(jc.items)) {
      jc.items.forEach((it: any) => {
        const line = Number(it.total_price) || 0;
        if (it.item_type === "part") partsSales += line;
        else serviceSales += line;
      });
    }

    if (!dateMap.has(recognizedDate)) {
      dateMap.set(recognizedDate, { sales: 0, expenses: 0, cost: 0 });
    }
    dateMap.get(recognizedDate)!.sales += jcTotal;
  });

  // Count Job Statuses
  activeJobCards.forEach((jc) => {
    if (jc.status === "cancelled") return;
    if (jc.status === "completed") completedJobs++;
    else if (["new", "in_progress", "waiting"].includes(jc.status)) openJobs++;
  });

  let totalExpenses = 0;
  activeExpenses.forEach((exp) => {
    const amt = Number(exp.amount) || 0;
    totalExpenses += amt;
    const expDate = exp.date || startDate;
    if (!dateMap.has(expDate)) {
      dateMap.set(expDate, { sales: 0, expenses: 0, cost: 0 });
    }
    dateMap.get(expDate)!.expenses += amt;
  });

  let cashReceived = 0;
  let bankReceived = 0;
  localPayments.forEach((pay: any) => {
    const pDate = (pay.payment_date || pay.created_at || "").slice(0, 10);
    if (pDate >= startDate && pDate <= endDate) {
      const amt = Number(pay.amount) || 0;
      if (pay.payment_method === "cash") cashReceived += amt;
      else if (pay.payment_method === "bank" || pay.payment_method === "card") bankReceived += amt;
    }
  });

  const grossProfit = Math.round(totalSales * 100) / 100;
  const netProfit = Math.round((grossProfit - totalExpenses) * 100) / 100;

  const sortedDates = Array.from(dateMap.keys()).sort();
  const chartLabels: string[] = [];
  const salesSeries: number[] = [];
  const expensesSeries: number[] = [];
  const profitSeries: number[] = [];

  sortedDates.forEach((d) => {
    const entry = dateMap.get(d)!;
    chartLabels.push(d);
    salesSeries.push(Math.round(entry.sales * 100) / 100);
    expensesSeries.push(Math.round(entry.expenses * 100) / 100);
    profitSeries.push(Math.round((entry.sales - entry.expenses) * 100) / 100);
  });

  return {
    totalSales: Math.round(totalSales * 100) / 100,
    serviceSales: Math.round(serviceSales * 100) / 100,
    partsSales: Math.round(partsSales * 100) / 100,
    cashReceived: Math.round(cashReceived * 100) / 100,
    bankReceived: Math.round(bankReceived * 100) / 100,
    outstandingCredit: Math.round(outstandingCredit * 100) / 100,
    totalJobCards,
    completedJobs,
    openJobs,
    expenses: Math.round(totalExpenses * 100) / 100,
    partsCost: 0,
    grossProfit,
    netProfit,
    isProfitDataIncomplete: partsSales > 0,
    lowStockPartsCount: 0,
    chartData: {
      labels: chartLabels,
      salesSeries,
      expensesSeries,
      profitSeries,
    },
  };
}
