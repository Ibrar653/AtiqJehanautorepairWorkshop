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
      // 1. Fetch active Job Cards with minimal fields
      const jobCardsPromise = supabase
        .from("job_cards")
        .select("id, date, created_at, status, total, balance, items:job_card_items(item_type, quantity, unit_price, total_price, part_id)")
        .eq("workspace_id", targetWsId)
        .gte("date", startDate)
        .lte("date", endDate)
        .or("is_deleted.is.null,is_deleted.eq.false");

      // 2. Fetch Expenses in date range
      const expensesPromise = supabase
        .from("expenses")
        .select("id, date, amount, category, is_deleted")
        .eq("workspace_id", targetWsId)
        .gte("date", startDate)
        .lte("date", endDate)
        .or("is_deleted.is.null,is_deleted.eq.false");

      // 3. Fetch Payments in date range
      const paymentsPromise = supabase
        .from("payments")
        .select("id, payment_date, amount, payment_method")
        .eq("workspace_id", targetWsId)
        .gte("payment_date", startDate)
        .lte("payment_date", endDate);

      // 4. Fetch Invoices in date range
      const invoicesPromise = supabase
        .from("invoices")
        .select(
          "id, invoice_number, job_card_id, invoice_type, created_at, total, subtotal, discount, vat_amount, paid, balance, payment_status, is_void, items:invoice_items(id, item_type, description, quantity, unit_price, total_price, part_id, cost_price)"
        )
        .eq("workspace_id", targetWsId)
        .gte("created_at", `${startDate}T00:00:00Z`)
        .lte("created_at", `${endDate}T23:59:59Z`);

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

    let jobCards: any[] = jobCardsData || [];
    let expenses: any[] = (expensesData || []).filter((e: any) => !e.is_deleted);
    let payments: any[] = paymentsData || [];
    let invoices: any[] = invoicesData || [];
    let parts: Part[] = (partsData as any[]) || [];

    if (invErr) {
      const { getLocalInvoices, getLocalInvoiceItems } = await import("./invoice-service");
      const localInvs = getLocalInvoices(targetWsId).filter((inv: any) => {
        const d = (inv.created_at || "").slice(0, 10);
        return !inv.is_deleted && (!inv.created_at || (d >= startDate && d <= endDate));
      });
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
      const localJcs = getLocalJobCards(targetWsId).filter(
        (jc: any) => !jc.is_deleted && (!jc.date || (jc.date >= startDate && jc.date <= endDate))
      );
      jobCards = localJcs;
    }


    // Parts Catalog Map for Cost Calculation
    const partCostMap = new Map<string, number>();
    let partsCatalogHasCost = parts.length > 0;
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
    let totalJobCards = jobCards.length;

    let partsCost = 0;
    let missingCostItemsCount = 0;
    let totalPartItemsCount = 0;

    // Timeline Aggregation for Charts
    const dateMap = new Map<string, { sales: number; expenses: number; cost: number }>();

    // Process Job Cards
    jobCards.forEach((jc) => {
      totalSales += Number(jc.total) || 0;
      outstandingCredit += Number(jc.balance) || 0;

      if (jc.status === "completed") {
        completedJobs++;
      } else if (["new", "in_progress", "waiting"].includes(jc.status)) {
        openJobs++;
      }

      // Parse item lines
      if (jc.items && Array.isArray(jc.items)) {
        jc.items.forEach((item: any) => {
          const qty = Number(item.quantity) || 1;
          const lineTotal = Number(item.total_price) || 0;

          if (item.item_type === "service" || item.item_type === "labour") {
            serviceSales += lineTotal;
          } else if (item.item_type === "part") {
            partsSales += lineTotal;
            totalPartItemsCount++;

            // Check part cost
            if (item.part_id && partCostMap.has(item.part_id)) {
              const unitCost = partCostMap.get(item.part_id)!;
              partsCost += unitCost * qty;
            } else if (item.unit_price) {
              // If not mapped in parts catalog or zero purchase price
              missingCostItemsCount++;
            }
          }
        });
      }

      // Chart aggregation
      const jcDate = jc.date || (jc.created_at ? jc.created_at.slice(0, 10) : startDate);
      if (!dateMap.has(jcDate)) {
        dateMap.set(jcDate, { sales: 0, expenses: 0, cost: 0 });
      }
      dateMap.get(jcDate)!.sales += Number(jc.total) || 0;
    });

    // Process Direct Invoices (Invoices without a Job Card or marked as direct_service / direct_parts / direct_mixed)
    const directInvoices = invoices.filter(
      (inv: any) =>
        !inv.is_void &&
        inv.payment_status !== "void" &&
        (!inv.job_card_id || (inv.invoice_type && inv.invoice_type.startsWith("direct_")))
    );

    directInvoices.forEach((inv: any) => {
      const invTotal = Number(inv.total) || 0;
      const invBalance = Number(inv.balance) !== undefined ? Number(inv.balance) : Math.max(0, invTotal - (Number(inv.paid) || 0));
      totalSales += invTotal;
      outstandingCredit += invBalance;

      // Extract services and parts revenue
      const invItems = inv.items && Array.isArray(inv.items) ? inv.items : [];
      let invoiceServicesRevenue = 0;
      let invoicePartsRevenue = 0;

      if (invItems.length > 0) {
        invItems.forEach((item: any) => {
          const qty = Number(item.quantity) || 1;
          const lineTotal = Number(item.total_price) || (qty * (Number(item.unit_price) || 0));
          if (item.item_type === "service" || item.item_type === "labour") {
            invoiceServicesRevenue += lineTotal;
          } else if (item.item_type === "part") {
            invoicePartsRevenue += lineTotal;
            totalPartItemsCount++;

            const unitCost = Number(item.cost_price) || (item.part_id && partCostMap.get(item.part_id)) || 0;
            if (unitCost > 0) {
              partsCost += unitCost * qty;
            } else {
              missingCostItemsCount++;
            }
          } else {
            // Unspecified item_type: infer from invoice_type
            if (inv.invoice_type === "direct_service") {
              invoiceServicesRevenue += lineTotal;
            } else {
              invoicePartsRevenue += lineTotal;
            }
          }
        });
      } else {
        if (inv.invoice_type === "direct_service") {
          invoiceServicesRevenue = Number(inv.subtotal) || invTotal;
        } else {
          invoicePartsRevenue = Number(inv.subtotal) || invTotal;
        }
      }

      serviceSales += invoiceServicesRevenue;
      partsSales += invoicePartsRevenue;

      // Add to timeline chart aggregation
      const invDate = inv.created_at ? inv.created_at.slice(0, 10) : startDate;
      if (!dateMap.has(invDate)) {
        dateMap.set(invDate, { sales: 0, expenses: 0, cost: 0 });
      }
      dateMap.get(invDate)!.sales += invTotal;
    });

    // Process Expenses
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

    // Process Payments
    let cashReceived = 0;
    let bankReceived = 0;
    payments.forEach((pay) => {
      const amt = Number(pay.amount) || 0;
      if (pay.payment_method === "cash") {
        cashReceived += amt;
      } else if (pay.payment_method === "bank") {
        bankReceived += amt;
      }
    });

    // Fallback: If no payments recorded in payments table but invoices have paid amounts
    if (cashReceived === 0 && bankReceived === 0) {
      invoices.forEach((inv) => {
        const paid = Number(inv.paid) || 0;
        if (paid > 0) {
          cashReceived += paid; // default assumption for quick cash sales
        }
      });
    }

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
  try {
    if (typeof window !== "undefined") {
      const raw = localStorage.getItem("atiq_local_job_cards");
      if (raw) localJobCards = JSON.parse(raw);
      const rawExp = localStorage.getItem("atiq_local_expenses");
      if (rawExp) localExpenses = JSON.parse(rawExp);
    }
  } catch {}

  const activeJobCards = localJobCards.filter(
    (jc) =>
      !jc.is_deleted &&
      (jc.workspace_id === targetWsId || (!jc.workspace_id && targetWsId === DEFAULT_WORKSPACE_ID)) &&
      (!jc.date || (jc.date >= startDate && jc.date <= endDate))
  );

  const activeExpenses = localExpenses.filter(
    (exp) =>
      !exp.is_deleted &&
      (exp.workspace_id === targetWsId || (!exp.workspace_id && targetWsId === DEFAULT_WORKSPACE_ID)) &&
      (!exp.date || (exp.date >= startDate && exp.date <= endDate))
  );

  let totalSales = 0;
  let serviceSales = 0;
  let partsSales = 0;
  let outstandingCredit = 0;
  let completedJobs = 0;
  let openJobs = 0;

  activeJobCards.forEach((jc) => {
    totalSales += Number(jc.total) || 0;
    outstandingCredit += Number(jc.balance) || 0;
    if (jc.status === "completed") completedJobs++;
    else if (["new", "in_progress", "waiting"].includes(jc.status)) openJobs++;

    if (jc.items && Array.isArray(jc.items)) {
      jc.items.forEach((it: any) => {
        const line = Number(it.total_price) || 0;
        if (it.item_type === "part") partsSales += line;
        else serviceSales += line;
      });
    }
  });

  // Include direct parts invoices in local fallback
  let localInvoices: any[] = [];
  try {
    if (typeof window !== "undefined") {
      const rawInv = localStorage.getItem("atiq_local_invoices");
      if (rawInv) localInvoices = JSON.parse(rawInv);
    }
  } catch {}

  const activeDirectInvoices = localInvoices.filter(
    (inv) =>
      !inv.is_deleted &&
      !inv.is_void &&
      inv.payment_status !== "void" &&
      (!inv.job_card_id || (inv.invoice_type && inv.invoice_type.startsWith("direct_"))) &&
      (inv.workspace_id === targetWsId || (!inv.workspace_id && targetWsId === DEFAULT_WORKSPACE_ID)) &&
      (!inv.created_at || (inv.created_at.slice(0, 10) >= startDate && inv.created_at.slice(0, 10) <= endDate))
  );

  activeDirectInvoices.forEach((inv) => {
    const invTotal = Number(inv.total) || 0;
    const invBalance = Number(inv.balance) !== undefined ? Number(inv.balance) : Math.max(0, invTotal - (Number(inv.paid) || 0));
    totalSales += invTotal;
    outstandingCredit += invBalance;

    let sSub = 0;
    let pSub = 0;
    if (inv.items && Array.isArray(inv.items)) {
      inv.items.forEach((it: any) => {
        const line = Number(it.total_price) || 0;
        if (it.item_type === "service" || it.item_type === "labour") {
          sSub += line;
        } else if (it.item_type === "part") {
          pSub += line;
        } else if (inv.invoice_type === "direct_service") {
          sSub += line;
        } else {
          pSub += line;
        }
      });
    } else {
      if (inv.invoice_type === "direct_service") {
        sSub = Number(inv.subtotal) || invTotal;
      } else {
        pSub = Number(inv.subtotal) || invTotal;
      }
    }
    serviceSales += sSub;
    partsSales += pSub;
  });

  let totalExpenses = 0;
  activeExpenses.forEach((exp) => {
    totalExpenses += Number(exp.amount) || 0;
  });

  const grossProfit = Math.round(totalSales * 100) / 100;
  const netProfit = Math.round((grossProfit - totalExpenses) * 100) / 100;

  const hasActivity = totalSales > 0 || totalExpenses > 0;

  return {
    totalSales: Math.round(totalSales * 100) / 100,
    serviceSales: Math.round(serviceSales * 100) / 100,
    partsSales: Math.round(partsSales * 100) / 100,
    cashReceived: 0,
    bankReceived: 0,
    outstandingCredit: Math.round(outstandingCredit * 100) / 100,
    totalJobCards: activeJobCards.length,
    completedJobs,
    openJobs,
    expenses: Math.round(totalExpenses * 100) / 100,
    partsCost: 0,
    grossProfit,
    netProfit,
    isProfitDataIncomplete: partsSales > 0,
    lowStockPartsCount: 0,
    chartData: {
      labels: hasActivity ? [startDate, endDate] : [],
      salesSeries: hasActivity ? [0, totalSales] : [],
      expensesSeries: hasActivity ? [0, Math.round(totalExpenses * 100) / 100] : [],
      profitSeries: hasActivity ? [0, netProfit] : [],
    },
  };
}

