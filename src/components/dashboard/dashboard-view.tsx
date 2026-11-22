"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import {
  getDashboardData,
  getDateRangeForPeriod,
  type DashboardMetrics,
  type DashboardPeriod,
} from "@/lib/services/dashboard-service";
import { getLocalJobCards } from "@/lib/services/job-card-service";
import { getLocalVehicles } from "@/lib/services/vehicle-service";
import { CombinedCustomerVehicleModal } from "@/components/shared/combined-customer-vehicle-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DollarSign,
  Wrench,
  AlertTriangle,
  Receipt,
  TrendingUp,
  Clock,
  CheckCircle2,
  Calendar,
  ChevronRight,
  Plus,
  UserPlus,
  Car,
  Package,
  Eye,
  BarChart3,
  Users,
  FileText,
  Sparkles,
  RefreshCw,
  Check,
  ArrowUpRight,
} from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import { useAuth } from "@/lib/context/auth-context";
import { useWorkspace } from "@/lib/context/workspace-context";

export function DashboardView() {
  const router = useRouter();
  const { user } = useAuth();
  const { currentWorkspace } = useWorkspace();
  const [period, setPeriod] = useState<DashboardPeriod>("this_month");
  const [customRange, setCustomRange] = useState<{ startDate?: string; endDate?: string }>({});
  const [showCustomRangePicker, setShowCustomRangePicker] = useState(false);
  const [customStartDate, setCustomStartDate] = useState(
    () => new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10)
  );
  const [customEndDate, setCustomEndDate] = useState(
    () => new Date().toISOString().slice(0, 10)
  );
  const [customRangeError, setCustomRangeError] = useState<string | null>(null);

  const handlePeriodChange = (pKey: DashboardPeriod) => {
    if (pKey === "custom") {
      setShowCustomRangePicker((prev) => !prev);
    } else {
      setShowCustomRangePicker(false);
      setCustomRangeError(null);
      setPeriod(pKey);
    }
  };

  const handleApplyCustomRange = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!customStartDate || !customEndDate) {
      setCustomRangeError("Please select both start date and end date.");
      return;
    }
    if (customStartDate > customEndDate) {
      setCustomRangeError("Start date cannot be after end date.");
      return;
    }
    setCustomRangeError(null);
    setCustomRange({ startDate: customStartDate, endDate: customEndDate });
    setPeriod("custom");
    setShowCustomRangePicker(false);
  };

  const handleCancelCustomRange = () => {
    setShowCustomRangePicker(false);
    setCustomRangeError(null);
    if (period === "custom" && (!customRange.startDate || !customRange.endDate)) {
      setPeriod("this_month");
    }
  };

  const handleResetCustomRange = () => {
    const defaultStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
    const defaultEnd = new Date().toISOString().slice(0, 10);
    setCustomStartDate(defaultStart);
    setCustomEndDate(defaultEnd);
    setCustomRange({});
    setCustomRangeError(null);
    setPeriod("this_month");
    setShowCustomRangePicker(false);
  };

  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [combinedModalOpen, setCombinedModalOpen] = useState(false);
  const [activeRevenueTab, setActiveRevenueTab] = useState<"sales" | "expenses" | "profit">("sales");
  const [recentJobCards, setRecentJobCards] = useState<any[]>([]);
  const [popularVehicles, setPopularVehicles] = useState<any[]>([]);

  const fetchMetrics = useCallback(async (isManualRefresh = false) => {
    if (isManualRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const data = await getDashboardData(period, customRange, isManualRefresh, currentWorkspace?.id);
      setMetrics(data);

      // Fetch real recent job cards from workspace store
      const allJobs = getLocalJobCards(currentWorkspace?.id);
      const activeJobs = allJobs.filter((j) => !j.is_deleted);
      setRecentJobCards(activeJobs.slice(0, 5));

      // Compute popular vehicles from real job card history
      const allVehs = getLocalVehicles();
      const vehicleCounts: Record<string, { make: string; model: string; count: number }> = {};
      activeJobs.forEach((j) => {
        const v = allVehs.find((veh) => veh.id === j.vehicle_id) || j.vehicle;
        if (v && v.make && v.model) {
          const key = `${v.make} ${v.model}`;
          if (!vehicleCounts[key]) {
            vehicleCounts[key] = { make: v.make, model: v.model, count: 0 };
          }
          vehicleCounts[key].count++;
        }
      });

      const popList = Object.values(vehicleCounts).sort((a, b) => b.count - a.count).slice(0, 5);
      setPopularVehicles(popList);
    } catch (err: any) {
      console.error("Dashboard fetch error:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [period, customRange, currentWorkspace?.id]);

  useEffect(() => {
    fetchMetrics();
  }, [fetchMetrics]);

  const activeRange = getDateRangeForPeriod(period, customRange);

  // Real job status counts
  const allJobs = useMemo(() => {
    return getLocalJobCards(currentWorkspace?.id).filter((j) => !j.is_deleted);
  }, [currentWorkspace?.id, refreshing]);

  const { newJobsCount, inProgressCount, waitingCount, completedCount } = useMemo(() => {
    let newJobs = 0;
    let inProg = 0;
    let wait = 0;
    let comp = 0;
    allJobs.forEach((j) => {
      if (j.status === "new") newJobs++;
      else if (j.status === "in_progress") inProg++;
      else if (j.status === "waiting") wait++;
      else if (j.status === "completed") comp++;
    });
    return { newJobsCount: newJobs, inProgressCount: inProg, waitingCount: wait, completedCount: comp };
  }, [allJobs]);

  const totalJobsCount = allJobs.length;

  // Real chart series built strictly from metrics.chartData
  const chartPoints = useMemo(() => {
    const labels = metrics?.chartData?.labels || [];
    const sales = metrics?.chartData?.salesSeries || [];
    const expenses = metrics?.chartData?.expensesSeries || [];
    const profit = metrics?.chartData?.profitSeries || [];
    return labels.map((label, idx) => ({
      name: label,
      sales: Number(sales[idx] || 0),
      expenses: Number(expenses[idx] || 0),
      profit: Number(profit[idx] || 0),
    }));
  }, [metrics]);

  const hasChartActivity = useMemo(() => {
    return (
      chartPoints.length > 0 &&
      chartPoints.some((p) => p.sales !== 0 || p.expenses !== 0 || p.profit !== 0)
    );
  }, [chartPoints]);

  const activeChartStroke =
    activeRevenueTab === "sales"
      ? "#007BFF"
      : activeRevenueTab === "expenses"
      ? "#F59E0B"
      : "#10B981";

  const activeChartGradientId =
    activeRevenueTab === "sales"
      ? "erpSalesGrad"
      : activeRevenueTab === "expenses"
      ? "erpExpensesGrad"
      : "erpProfitGrad";

  const totalSalesVal = Number(metrics?.totalSales || 0);
  const netProfitVal = Number(metrics?.netProfit || 0);
  const profitMarginPct =
    totalSalesVal > 0 && !metrics?.isProfitDataIncomplete
      ? Math.round((netProfitVal / totalSalesVal) * 100)
      : null;

  return (
    <div className="space-y-5 pb-10">
      {/* ───────────────────────────────────────────────────────────────────────
          1. LIQUID GLASS EXECUTIVE HEADER & INTEGRATED PERIOD CONTROLS
      ──────────────────────────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden glass-card p-5 sm:p-6 animate-glass-in">
        {/* Restrained abstract blue-cyan glass reflection behind header */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-20 -right-16 h-60 w-60 rounded-full opacity-35 dark:opacity-20"
          style={{
            background: "radial-gradient(circle, rgba(56,189,248,0.55) 0%, rgba(0,123,255,0.22) 50%, transparent 72%)",
          }}
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-24 left-1/3 h-44 w-72 rounded-full opacity-25 dark:opacity-15"
          style={{
            background: "radial-gradient(circle, rgba(184,217,255,0.75) 0%, transparent 70%)",
          }}
        />

        <div className="relative z-10 flex flex-col xl:flex-row xl:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="font-heading text-[26px] sm:text-[30px] font-bold text-[#101D36] dark:text-slate-100 tracking-tight leading-tight">
                Workshop Executive Dashboard
              </h1>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-[#E6F2FF]/90 dark:bg-sky-950/60 text-[#0068F5] dark:text-sky-300 border border-[#B8D9FF] dark:border-sky-800/70 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#007BFF]" />
                {currentWorkspace?.currency || "AED"} &bull; Live
              </span>
            </div>
            <p className="text-[13.5px] text-[#52657F] dark:text-slate-400 font-normal">
              Real-time workshop performance, financial metrics &amp; active repair orders.
            </p>
          </div>

          {/* Primary & Secondary Liquid Glass Actions */}
          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchMetrics(true)}
              disabled={refreshing}
              className="h-10 px-3.5 text-[13px] font-semibold rounded-xl gap-1.5"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin text-[#007BFF]" : "text-[#007BFF]"}`} />
              Live Revalidate
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setCombinedModalOpen(true)}
              className="h-10 px-4 text-[13px] font-semibold rounded-xl gap-1.5"
            >
              <UserPlus className="h-3.5 w-3.5 text-[#007BFF]" />
              Add Customer &amp; Vehicle
            </Button>

            <Button
              render={<Link href="/job-cards/new" />}
              className="h-10 px-4.5 text-[13px] font-semibold rounded-xl glass-btn-primary text-white gap-1.5"
            >
              <Plus className="h-4 w-4" />
              Create Job Card
            </Button>
          </div>
        </div>

        {/* Integrated Segmented Date Filter Bar */}
        <div className="relative z-10 mt-5 pt-4 border-t border-[#D7E4F3]/75 dark:border-white/10 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-1 overflow-x-auto p-1 rounded-2xl glass-inset">
              {(
                [
                  { key: "today", label: "Today" },
                  { key: "yesterday", label: "Yesterday" },
                  { key: "this_week", label: "This Week" },
                  { key: "this_month", label: "This Month" },
                  { key: "last_month", label: "Last Month" },
                  { key: "this_year", label: "This Year" },
                  { key: "custom", label: "Custom Range" },
                ] as const
              ).map((p) => (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => handlePeriodChange(p.key)}
                  className={`px-3.5 py-1.5 rounded-xl text-[12.5px] font-semibold transition-all whitespace-nowrap flex items-center gap-1.5 cursor-pointer ${
                    period === p.key
                      ? "glass-btn-primary text-white"
                      : "text-[#52657F] dark:text-slate-400 hover:text-[#101D36] dark:hover:text-white hover:bg-white/80 dark:hover:bg-white/5"
                  }`}
                >
                  {p.key === "custom" && <Calendar className="h-3.5 w-3.5" />}
                  {p.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2 text-xs font-medium self-end sm:self-center">
              {period === "custom" && customRange.startDate && customRange.endDate ? (
                <div className="flex items-center gap-1.5 bg-[#E8F3FF] dark:bg-sky-950/50 text-[#0068F5] dark:text-sky-300 font-semibold px-3 py-1.5 rounded-xl border border-[#B8D9FF] dark:border-sky-800/70">
                  <Calendar className="h-3.5 w-3.5 text-[#007BFF]" />
                  <span className="tabular-nums">
                    {customRange.startDate} to {customRange.endDate}
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowCustomRangePicker((prev) => !prev)}
                    className="ml-1 text-[11px] underline text-[#0068F5] hover:text-[#1746D1] cursor-pointer"
                    title="Modify date range"
                  >
                    Edit
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/65 dark:bg-white/5 border border-[#D7E4F3]/80 dark:border-white/10 text-[#52657F] dark:text-slate-400">
                  <Calendar className="h-3.5 w-3.5 text-[#007BFF]" />
                  <span className="tabular-nums font-medium">
                    {activeRange.startDate && activeRange.endDate
                      ? `${activeRange.startDate} to ${activeRange.endDate}`
                      : "Active cycle"}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Custom Range Picker Form */}
          {showCustomRangePicker && (
            <form
              onSubmit={handleApplyCustomRange}
              className="pt-3 border-t border-[#D7E4F3]/75 flex flex-wrap items-end gap-3.5 animate-glass-in"
            >
              <div className="space-y-1">
                <Label className="text-[11.5px] font-semibold text-[#52657F]">
                  Start Date
                </Label>
                <Input
                  type="date"
                  value={customStartDate}
                  onChange={(e) => {
                    setCustomStartDate(e.target.value);
                    setCustomRangeError(null);
                  }}
                  required
                  className="h-9 text-xs w-40 rounded-xl tabular-nums"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-[11.5px] font-semibold text-[#52657F]">
                  End Date
                </Label>
                <Input
                  type="date"
                  value={customEndDate}
                  onChange={(e) => {
                    setCustomEndDate(e.target.value);
                    setCustomRangeError(null);
                  }}
                  required
                  className="h-9 text-xs w-40 rounded-xl tabular-nums"
                />
              </div>

              <div className="flex items-center gap-2">
                <Button type="submit" size="sm" className="h-9 px-4 text-xs gap-1.5">
                  <Check className="h-3.5 w-3.5" />
                  Apply Range
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={handleCancelCustomRange} className="h-9 px-3 text-xs">
                  Cancel
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={handleResetCustomRange} className="h-9 px-2.5 text-xs">
                  Reset
                </Button>
              </div>

              {customRangeError && (
                <div className="w-full text-xs text-rose-600 font-medium flex items-center gap-1 mt-1">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  <span>{customRangeError}</span>
                </div>
              )}
            </form>
          )}
        </div>
      </div>

      {/* ───────────────────────────────────────────────────────────────────────
          2. TIER-1 HERO FINANCIAL KPI CARDS (Differentiated Luminous Bento Row)
      ──────────────────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 animate-glass-in-delay-1">
        {/* Hero Card 1: Total Sales — Featured Luminous Blue-Cyan Glass Card */}
        <div className="glass-card-hero p-5 flex flex-col justify-between transition-transform duration-150 hover:-translate-y-0.5">
          {/* Subtle decorative wave highlight */}
          <svg
            aria-hidden="true"
            viewBox="0 0 220 90"
            className="pointer-events-none absolute -bottom-2 right-0 w-44 h-20 opacity-20"
            fill="none"
          >
            <path
              d="M0 72 C45 64, 70 28, 122 36 C165 42, 185 12, 220 6 L220 90 L0 90 Z"
              fill="url(#heroWave)"
            />
            <defs>
              <linearGradient id="heroWave" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.9" />
                <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
              </linearGradient>
            </defs>
          </svg>

          <div className="relative z-10 flex items-center justify-between">
            <span className="text-[13px] font-semibold text-white/90 tracking-tight">
              Total Sales
            </span>
            <div className="h-10 w-10 rounded-2xl bg-white/18 border border-white/35 backdrop-blur-md flex items-center justify-center shrink-0 shadow-[inset_0_1px_1px_rgba(255,255,255,0.45)]">
              <DollarSign className="h-5 w-5 text-white" />
            </div>
          </div>
          <div className="relative z-10 mt-4">
            <h3 className="font-heading text-[28px] xl:text-[30px] font-bold text-white tabular-nums tracking-tight leading-none">
              {formatCurrency(metrics?.totalSales || 0)}
            </h3>
            <p className="text-[12px] text-white/80 font-medium mt-2">
              Invoice &amp; POS turnover
            </p>
          </div>
        </div>

        {/* Hero Card 2: Service Sales */}
        <div className="glass-card p-5 flex flex-col justify-between transition-all duration-150 hover:-translate-y-0.5 overflow-hidden">
          <div className="absolute top-0 inset-x-0 h-[3px] bg-gradient-to-r from-[#1746D1] via-[#007BFF] to-[#38BDF8] opacity-80" />
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-semibold text-[#52657F] dark:text-slate-300">
              Service Sales
            </span>
            <div className="h-10 w-10 rounded-2xl glass-icon-tile text-[#007BFF] flex items-center justify-center shrink-0">
              <Wrench className="h-[18px] w-[18px]" />
            </div>
          </div>
          <div className="mt-4">
            <h3 className="font-heading text-[26px] xl:text-[28px] font-bold text-[#101D36] dark:text-slate-100 tabular-nums tracking-tight leading-none">
              {formatCurrency(metrics?.serviceSales || 0)}
            </h3>
            <p className="text-[12px] text-[#5E738E] dark:text-slate-400 font-medium mt-2">
              Labor &amp; workshop repairs
            </p>
          </div>
        </div>

        {/* Hero Card 3: Spare Parts Sales */}
        <div className="glass-card p-5 flex flex-col justify-between transition-all duration-150 hover:-translate-y-0.5 overflow-hidden">
          <div className="absolute top-0 inset-x-0 h-[3px] bg-gradient-to-r from-[#007BFF] via-[#00A9DA] to-[#38BDF8] opacity-80" />
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-semibold text-[#52657F] dark:text-slate-300">
              Spare Parts Sales
            </span>
            <div className="h-10 w-10 rounded-2xl glass-icon-tile text-[#00A9DA] flex items-center justify-center shrink-0">
              <Package className="h-[18px] w-[18px]" />
            </div>
          </div>
          <div className="mt-4">
            <h3 className="font-heading text-[26px] xl:text-[28px] font-bold text-[#101D36] dark:text-slate-100 tabular-nums tracking-tight leading-none">
              {formatCurrency(metrics?.partsSales || 0)}
            </h3>
            <p className="text-[12px] text-[#5E738E] dark:text-slate-400 font-medium mt-2">
              OEM &amp; aftermarket components
            </p>
          </div>
        </div>

        {/* Hero Card 4: Net Profit */}
        <div className="glass-card p-5 flex flex-col justify-between transition-all duration-150 hover:-translate-y-0.5 overflow-hidden">
          <div className={`absolute top-0 inset-x-0 h-[3px] ${netProfitVal >= 0 ? "bg-gradient-to-r from-emerald-500 to-teal-400" : "bg-gradient-to-r from-rose-500 to-red-500"} opacity-85`} />
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-semibold text-[#52657F] dark:text-slate-300">
              Net Profit
            </span>
            <div className={`h-10 w-10 rounded-2xl glass-icon-tile flex items-center justify-center shrink-0 ${netProfitVal >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
              <TrendingUp className="h-[18px] w-[18px]" />
            </div>
          </div>
          <div className="mt-4">
            <div className="flex items-baseline justify-between gap-2">
              <h3 className={`font-heading text-[26px] xl:text-[28px] font-bold tabular-nums tracking-tight leading-none ${netProfitVal >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600"}`}>
                {formatCurrency(netProfitVal)}
              </h3>
              {profitMarginPct !== null && (
                <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold tabular-nums ${netProfitVal >= 0 ? "bg-emerald-50 text-emerald-700 border border-emerald-200/80" : "bg-rose-50 text-rose-700 border border-rose-200/80"}`}>
                  {profitMarginPct}% margin
                </span>
              )}
            </div>
            <p className="text-[12px] text-[#5E738E] dark:text-slate-400 font-medium mt-2">
              Net operating workshop margin
            </p>
          </div>
        </div>
      </div>

      {/* ───────────────────────────────────────────────────────────────────────
          3. TIER-2 COMPACT OPERATIONAL & CASHFLOW GLASS STRIP (4 Horizontal Cards)
      ──────────────────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 animate-glass-in-delay-2">
        {/* Compact Card: Outstanding */}
        <div className="glass-card px-4 py-3.5 flex items-center gap-3.5 transition-all duration-150 hover:-translate-y-0.5">
          <div className="h-11 w-11 rounded-2xl bg-rose-50/90 dark:bg-rose-950/40 border border-rose-200/80 dark:border-rose-800/50 text-rose-600 flex items-center justify-center shrink-0 shadow-[inset_0_1px_0_rgba(255,255,255,0.85)]">
            <Clock className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[12px] font-semibold text-[#52657F] dark:text-slate-400 truncate">Outstanding</p>
            <p className={`font-heading text-[21px] font-bold tabular-nums tracking-tight leading-tight mt-0.5 truncate ${Number(metrics?.outstandingCredit || 0) > 0 ? "text-rose-600 dark:text-rose-400" : "text-[#101D36] dark:text-slate-100"}`}>
              {formatCurrency(metrics?.outstandingCredit || 0)}
            </p>
            <p className="text-[11px] text-[#647B97] truncate">Unsettled customer balances</p>
          </div>
        </div>

        {/* Compact Card: Expenses */}
        <div className="glass-card px-4 py-3.5 flex items-center gap-3.5 transition-all duration-150 hover:-translate-y-0.5">
          <div className="h-11 w-11 rounded-2xl bg-amber-50/90 dark:bg-amber-950/40 border border-amber-200/80 dark:border-amber-800/50 text-amber-600 flex items-center justify-center shrink-0 shadow-[inset_0_1px_0_rgba(255,255,255,0.85)]">
            <Receipt className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[12px] font-semibold text-[#52657F] dark:text-slate-400 truncate">Expenses</p>
            <p className="font-heading text-[21px] font-bold text-[#101D36] dark:text-slate-100 tabular-nums tracking-tight leading-tight mt-0.5 truncate">
              {formatCurrency(metrics?.expenses || 0)}
            </p>
            <p className="text-[11px] text-[#647B97] truncate">Operational overheads &amp; utilities</p>
          </div>
        </div>

        {/* Compact Card: Open Jobs */}
        <div className="glass-card px-4 py-3.5 flex items-center gap-3.5 transition-all duration-150 hover:-translate-y-0.5">
          <div className="h-11 w-11 rounded-2xl bg-[#E8F3FF] dark:bg-blue-950/50 border border-[#B8D9FF] dark:border-blue-800/50 text-[#007BFF] flex items-center justify-center shrink-0 shadow-[inset_0_1px_0_rgba(255,255,255,0.85)]">
            <FileText className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[12px] font-semibold text-[#52657F] dark:text-slate-400 truncate">Open Jobs</p>
            <p className="font-heading text-[21px] font-bold text-[#101D36] dark:text-slate-100 tabular-nums tracking-tight leading-tight mt-0.5">
              {metrics?.openJobs ?? (newJobsCount + inProgressCount + waitingCount)}
            </p>
            <p className="text-[11px] text-[#647B97] truncate">Active repairs on workshop lifts</p>
          </div>
        </div>

        {/* Compact Card: Completed Jobs */}
        <div className="glass-card px-4 py-3.5 flex items-center gap-3.5 transition-all duration-150 hover:-translate-y-0.5">
          <div className="h-11 w-11 rounded-2xl bg-emerald-50/90 dark:bg-emerald-950/40 border border-emerald-200/80 dark:border-emerald-800/50 text-emerald-600 flex items-center justify-center shrink-0 shadow-[inset_0_1px_0_rgba(255,255,255,0.85)]">
            <CheckCircle2 className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[12px] font-semibold text-[#52657F] dark:text-slate-400 truncate">Completed Jobs</p>
            <p className="font-heading text-[21px] font-bold text-emerald-600 dark:text-emerald-400 tabular-nums tracking-tight leading-tight mt-0.5">
              {metrics?.completedJobs ?? completedCount}
            </p>
            <p className="text-[11px] text-[#647B97] truncate">Finished &amp; ready for invoice</p>
          </div>
        </div>
      </div>

      {/* ───────────────────────────────────────────────────────────────────────
          4. MIDDLE ANALYTICS ROW: REAL AREA CHART + JOB CARD STATUS + POPULAR VEHICLES
      ──────────────────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Column 1: Financial Overview & Performance (lg:col-span-6) */}
        <div className="lg:col-span-6 glass-card p-5 flex flex-col justify-between">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-[#D7E4F3]/75 dark:border-white/10 gap-3">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-xl glass-icon-tile text-[#007BFF] flex items-center justify-center">
                <BarChart3 className="h-4 w-4" />
              </div>
              <div>
                <h2 className="font-heading text-[16px] font-semibold text-[#101D36] dark:text-slate-100 leading-tight">
                  Financial Overview &amp; Performance
                </h2>
                <p className="text-[11.5px] text-[#5E738E]">Live period trend from workspace transactions</p>
              </div>
            </div>

            {/* Frosted Segmented Tabs: Sales, Expenses, Profit */}
            <div className="flex items-center gap-1 p-1 rounded-xl glass-inset">
              {(
                [
                  { id: "sales", label: "Sales" },
                  { id: "expenses", label: "Expenses" },
                  { id: "profit", label: "Profit" },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveRevenueTab(tab.id)}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    activeRevenueTab === tab.id
                      ? "glass-btn-primary text-white"
                      : "text-[#52657F] dark:text-slate-400 hover:text-[#101D36]"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Real Recharts Smooth Gradient Area Chart */}
          {!hasChartActivity ? (
            <div className="py-16 text-center flex flex-col items-center justify-center">
              <div className="h-12 w-12 rounded-2xl glass-icon-tile text-[#007BFF]/60 flex items-center justify-center mb-3">
                <BarChart3 className="h-6 w-6" />
              </div>
              <p className="text-[13.5px] font-semibold text-[#101D36] dark:text-slate-200">
                No financial transactions recorded for this period
              </p>
              <p className="text-xs text-[#5E738E] mt-1 max-w-sm">
                Generate your first invoice or register expenses to view real-time performance trends.
              </p>
            </div>
          ) : (
            <div className="pt-4 flex-1 flex flex-col">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#52657F] mb-3 px-1">
                <div className="flex items-center gap-4">
                  <span className="flex items-center gap-1.5 font-medium">
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: activeChartStroke }}
                    />
                    {activeRevenueTab === "sales"
                      ? "Total Sales"
                      : activeRevenueTab === "expenses"
                      ? "Expenses"
                      : "Net Profit"}
                  </span>
                  <span className="text-[11.5px] text-[#647B97] tabular-nums">
                    Services: {formatCurrency(metrics?.serviceSales || 0)} &bull; Parts: {formatCurrency(metrics?.partsSales || 0)}
                  </span>
                </div>
              </div>

              <div className="h-[235px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartPoints} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="erpSalesGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#007BFF" stopOpacity={0.34} />
                        <stop offset="65%" stopColor="#38BDF8" stopOpacity={0.12} />
                        <stop offset="100%" stopColor="#38BDF8" stopOpacity={0.01} />
                      </linearGradient>
                      <linearGradient id="erpExpensesGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#F59E0B" stopOpacity={0.30} />
                        <stop offset="100%" stopColor="#F59E0B" stopOpacity={0.02} />
                      </linearGradient>
                      <linearGradient id="erpProfitGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#10B981" stopOpacity={0.32} />
                        <stop offset="100%" stopColor="#10B981" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="4 4" stroke="rgba(160, 186, 218, 0.35)" vertical={false} />
                    <XAxis
                      dataKey="name"
                      tick={{ fontSize: 11, fill: "#5E738E" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: "#5E738E" }}
                      axisLine={false}
                      tickLine={false}
                      width={54}
                      tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${v}`)}
                    />
                    <Tooltip
                      formatter={(val: any) => [formatCurrency(Number(val) || 0), activeRevenueTab.toUpperCase()]}
                      contentStyle={{
                        backgroundColor: "rgba(252, 254, 255, 0.95)",
                        borderRadius: "14px",
                        border: "1px solid #CFE0F3",
                        boxShadow: "0 12px 28px rgba(16, 45, 96, 0.14)",
                        fontSize: "12px",
                        color: "#101D36",
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey={activeRevenueTab}
                      stroke={activeChartStroke}
                      strokeWidth={2.75}
                      fill={`url(#${activeChartGradientId})`}
                      activeDot={{ r: 5, strokeWidth: 2, stroke: "#FFFFFF" }}
                      animationDuration={320}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </div>

        {/* Column 2: Job Card Status Donut (lg:col-span-3) */}
        <div className="lg:col-span-3 glass-card p-5 flex flex-col justify-between">
          <div className="flex items-center gap-2.5 pb-3.5 border-b border-[#D7E4F3]/75 dark:border-white/10">
            <div className="h-9 w-9 rounded-xl glass-icon-tile text-[#007BFF] flex items-center justify-center">
              <Users className="h-4 w-4" />
            </div>
            <h2 className="font-heading text-[16px] font-semibold text-[#101D36] dark:text-slate-100">
              Job Card Status
            </h2>
          </div>

          <div className="py-4 flex items-center justify-center">
            <div className="relative w-36 h-36 flex items-center justify-center">
              <svg viewBox="0 0 36 36" className="w-36 h-36 transform -rotate-90 drop-shadow-[0_6px_14px_rgba(0,104,245,0.16)]">
                <circle cx="18" cy="18" r="14" fill="transparent" stroke="#DDEAF9" strokeWidth="3.8" />
                {totalJobsCount > 0 ? (
                  <>
                    <circle
                      cx="18"
                      cy="18"
                      r="14"
                      fill="transparent"
                      stroke="#007BFF"
                      strokeWidth="4"
                      strokeLinecap="round"
                      strokeDasharray={`${Math.round((newJobsCount / totalJobsCount) * 88)} 88`}
                      strokeDashoffset="0"
                    />
                    <circle
                      cx="18"
                      cy="18"
                      r="14"
                      fill="transparent"
                      stroke="#F59E0B"
                      strokeWidth="4"
                      strokeLinecap="round"
                      strokeDasharray={`${Math.round((inProgressCount / totalJobsCount) * 88)} 88`}
                      strokeDashoffset={`-${Math.round((newJobsCount / totalJobsCount) * 88)}`}
                    />
                    <circle
                      cx="18"
                      cy="18"
                      r="14"
                      fill="transparent"
                      stroke="#10B981"
                      strokeWidth="4"
                      strokeLinecap="round"
                      strokeDasharray={`${Math.round((completedCount / totalJobsCount) * 88)} 88`}
                      strokeDashoffset={`-${Math.round(((newJobsCount + inProgressCount) / totalJobsCount) * 88)}`}
                    />
                  </>
                ) : null}
              </svg>
              <div className="absolute h-20 w-20 rounded-full bg-white/80 dark:bg-[#13203A]/90 border border-white/95 dark:border-white/10 shadow-[var(--glass-shadow-sm)] flex flex-col items-center justify-center text-center">
                <span className="font-heading text-2xl font-bold text-[#101D36] dark:text-slate-100 leading-none tabular-nums">
                  {totalJobsCount}
                </span>
                <span className="text-[9.5px] font-semibold text-[#5E738E] uppercase tracking-wider mt-1">
                  Total Jobs
                </span>
              </div>
            </div>
          </div>

          <div className="space-y-1.5 pt-2.5 border-t border-[#D7E4F3]/75 dark:border-white/10 text-xs">
            {[
              { label: "New", count: newJobsCount, dot: "bg-[#007BFF]" },
              { label: "In Progress", count: inProgressCount, dot: "bg-amber-500" },
              { label: "Waiting", count: waitingCount, dot: "bg-purple-500" },
              { label: "Completed", count: completedCount, dot: "bg-emerald-500" },
            ].map((row) => (
              <div
                key={row.label}
                className="flex items-center justify-between px-2.5 py-1 rounded-lg bg-white/55 dark:bg-white/[0.03]"
              >
                <span className="flex items-center gap-2 text-[#52657F] dark:text-slate-300 font-medium">
                  <span className={`h-2.5 w-2.5 rounded-full ${row.dot}`} />
                  {row.label}
                </span>
                <span className="font-semibold text-[#101D36] dark:text-slate-100 tabular-nums">
                  {row.count}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Column 3: Popular Vehicles (lg:col-span-3) */}
        <div className="lg:col-span-3 glass-card p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between pb-3.5 border-b border-[#D7E4F3]/75 dark:border-white/10">
            <div className="flex items-center gap-2.5">
              <div className="h-9 w-9 rounded-xl glass-icon-tile text-[#00A9DA] flex items-center justify-center">
                <Car className="h-4 w-4" />
              </div>
              <h2 className="font-heading text-[16px] font-semibold text-[#101D36] dark:text-slate-100">
                Popular Vehicles
              </h2>
            </div>
            <Link
              href="/vehicles"
              className="text-xs font-semibold text-[#007BFF] hover:text-[#1746D1] inline-flex items-center gap-0.5 transition-colors"
            >
              View All
              <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          {popularVehicles.length === 0 ? (
            <div className="py-10 text-center flex flex-col items-center justify-center">
              <div className="h-11 w-11 rounded-2xl glass-icon-tile text-[#00A9DA]/60 flex items-center justify-center mb-2.5">
                <Car className="h-5 w-5" />
              </div>
              <p className="text-xs text-[#52657F]">No vehicle jobs recorded yet</p>
              <Link href="/vehicles" className="text-xs text-[#007BFF] font-semibold mt-2 hover:underline">
                + Register Vehicle
              </Link>
            </div>
          ) : (
            <div className="space-y-2.5 pt-3 flex-1 flex flex-col justify-around">
              {popularVehicles.map((v, i) => {
                const totalVCount = popularVehicles.reduce((acc, curr) => acc + curr.count, 0) || 1;
                const pct = Math.round((v.count / totalVCount) * 100);

                return (
                  <Link
                    key={i}
                    href="/vehicles"
                    className="p-2.5 rounded-xl bg-white/60 dark:bg-white/[0.03] hover:bg-white/95 dark:hover:bg-white/[0.06] border border-white/80 dark:border-white/5 transition-all group"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="h-7 w-7 rounded-lg bg-[#E8F3FF] dark:bg-sky-950/60 flex items-center justify-center shrink-0 text-[#007BFF]">
                          <Car className="h-3.5 w-3.5" />
                        </div>
                        <p className="text-[12.5px] font-semibold text-[#101D36] dark:text-slate-100 truncate">
                          {v.make} {v.model}
                        </p>
                      </div>
                      <span className="text-[11px] font-semibold text-[#0068F5] tabular-nums shrink-0">
                        {v.count} ({pct}%)
                      </span>
                    </div>
                    <div className="mt-2 h-1.5 w-full rounded-full bg-[#E3EEF9] dark:bg-slate-800 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-[#007BFF] to-[#38BDF8]"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ───────────────────────────────────────────────────────────────────────
          5. BOTTOM SECTION: RECENT JOB CARDS TABLE + FINANCIAL SUMMARY & QUICK ACTIONS
      ──────────────────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left Column: Recent Job Cards Table (lg:col-span-8) */}
        <div className="lg:col-span-8 glass-card p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between pb-4 border-b border-[#D7E4F3]/75 dark:border-white/10">
            <div className="flex items-center gap-2.5">
              <div className="h-9 w-9 rounded-xl glass-icon-tile text-[#007BFF] flex items-center justify-center">
                <FileText className="h-4 w-4" />
              </div>
              <h2 className="font-heading text-[16px] font-semibold text-[#101D36] dark:text-slate-100">
                Recent Job Cards
              </h2>
            </div>
            <Link
              href="/job-cards"
              className="text-xs font-semibold text-[#007BFF] hover:text-[#1746D1] inline-flex items-center gap-0.5 transition-colors"
            >
              View All
              <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          {recentJobCards.length === 0 ? (
            <div className="py-14 text-center flex flex-col items-center justify-center">
              <div className="h-12 w-12 rounded-2xl glass-icon-tile text-[#007BFF]/60 flex items-center justify-center mb-3">
                <FileText className="h-6 w-6" />
              </div>
              <p className="text-sm font-semibold text-[#101D36] dark:text-slate-200">No Job Cards Yet</p>
              <p className="text-xs text-[#5E738E] mt-1 max-w-sm">
                Create your first workshop repair order to start tracking jobs, services, and technician progress.
              </p>
              <Button
                render={<Link href="/job-cards/new" />}
                className="mt-4 glass-btn-primary text-white text-xs font-semibold rounded-xl h-9 px-4"
              >
                <Plus className="h-3.5 w-3.5 mr-1" /> Create Job Card
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto pt-2">
              <table className="w-full text-left text-[13px]">
                <thead>
                  <tr className="border-b border-[#D7E4F3]/80 text-[11px] font-semibold text-[#5E738E] uppercase tracking-wider">
                    <th className="py-2.5 pr-2">Job Card</th>
                    <th className="py-2.5 px-2">Customer</th>
                    <th className="py-2.5 px-2">Vehicle</th>
                    <th className="py-2.5 px-2">Complaint</th>
                    <th className="py-2.5 px-2 text-right">Amount</th>
                    <th className="py-2.5 px-2 text-center">Status</th>
                    <th className="py-2.5 px-2">Date</th>
                    <th className="py-2.5 pl-2 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#D7E4F3]/55">
                  {recentJobCards.map((jc: any) => {
                    const statusColors: Record<string, string> = {
                      new: "bg-[#E8F3FF] text-[#0068F5] border-[#B8D9FF]",
                      in_progress: "bg-amber-50 text-amber-700 border-amber-200",
                      waiting: "bg-purple-50 text-purple-700 border-purple-200",
                      completed: "bg-emerald-50 text-emerald-700 border-emerald-200",
                      cancelled: "bg-rose-50 text-rose-700 border-rose-200",
                    };
                    const statusLabel: Record<string, string> = {
                      new: "New",
                      in_progress: "In Progress",
                      waiting: "Waiting",
                      completed: "Completed",
                      cancelled: "Cancelled",
                    };

                    return (
                      <tr key={jc.id} className="hover:bg-[#EBF4FF]/70 dark:hover:bg-white/[0.04] transition-colors">
                        <td className="py-3 pr-2 font-semibold text-[#0068F5] whitespace-nowrap tabular-nums">
                          {jc.job_card_number}
                        </td>
                        <td className="py-3 px-2 font-semibold text-[#101D36] dark:text-slate-100 whitespace-nowrap">
                          {jc.customer?.name || "Customer"}
                        </td>
                        <td className="py-3 px-2 text-[#52657F] dark:text-slate-300 whitespace-nowrap">
                          {jc.vehicle ? `${jc.vehicle.make} ${jc.vehicle.model}` : "Vehicle"}
                        </td>
                        <td className="py-3 px-2 text-[#5E738E] truncate max-w-[160px]">
                          {jc.customer_complaint || "Service check"}
                        </td>
                        <td className="py-3 px-2 text-right font-semibold text-[#101D36] dark:text-slate-100 tabular-nums whitespace-nowrap">
                          {formatCurrency(Number(jc.total || 0))}
                        </td>
                        <td className="py-3 px-2 text-center whitespace-nowrap">
                          <span className={`inline-flex px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${statusColors[jc.status] || "bg-slate-50 text-slate-600 border-slate-200"}`}>
                            {statusLabel[jc.status] || jc.status}
                          </span>
                        </td>
                        <td className="py-3 px-2 text-[#5E738E] whitespace-nowrap text-xs tabular-nums">
                          {jc.date ? formatDate(jc.date) : "Recent"}
                        </td>
                        <td className="py-3 pl-2 text-right whitespace-nowrap">
                          <Link
                            href={`/job-cards/${jc.id}`}
                            className="inline-flex p-1.5 rounded-xl text-[#52657F] hover:text-[#007BFF] hover:bg-[#E8F3FF] transition-colors"
                            title="View Job Card"
                          >
                            <Eye className="h-4 w-4" />
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Right Column: Financial Summary & Quick Actions (lg:col-span-4) */}
        <div className="lg:col-span-4 space-y-5">
          {/* Card A: Financial Summary Card */}
          <div className="glass-card p-5">
            <div className="flex items-center gap-2.5 pb-3.5 border-b border-[#D7E4F3]/75 dark:border-white/10">
              <div className="h-9 w-9 rounded-xl glass-icon-tile text-[#007BFF] flex items-center justify-center">
                <Receipt className="h-4 w-4" />
              </div>
              <h2 className="font-heading text-[16px] font-semibold text-[#101D36] dark:text-slate-100">
                Financial Summary
              </h2>
            </div>
            <div className="pt-3.5 space-y-3">
              <div className="p-3 rounded-xl bg-white/65 dark:bg-white/[0.03] border border-white/90 dark:border-white/10">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-[#52657F] dark:text-slate-400 font-medium">Total Revenue</span>
                  <span className="text-emerald-600 font-semibold">Live</span>
                </div>
                <p className="font-heading text-[20px] font-bold text-[#101D36] dark:text-slate-100 tabular-nums mt-0.5">
                  {formatCurrency(metrics?.totalSales || 0)}
                </p>
              </div>

              <div className="p-3 rounded-xl bg-white/65 dark:bg-white/[0.03] border border-white/90 dark:border-white/10">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-[#52657F] dark:text-slate-400 font-medium">Total Expenses</span>
                  <span className="text-amber-600 font-semibold">Live</span>
                </div>
                <p className="font-heading text-[20px] font-bold text-[#101D36] dark:text-slate-100 tabular-nums mt-0.5">
                  {formatCurrency(metrics?.expenses || 0)}
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-gradient-to-r from-[#EBF4FF] to-[#F3FAFF] dark:from-blue-950/40 dark:to-sky-950/30 border border-[#C6DDF7] dark:border-sky-800/40">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-[#101D36] dark:text-slate-200 font-semibold">Net Profit</span>
                  <span className="text-emerald-600 font-semibold">Live</span>
                </div>
                <p className={`font-heading text-[22px] font-bold tabular-nums mt-0.5 ${netProfitVal >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600"}`}>
                  {formatCurrency(netProfitVal)}
                </p>
              </div>
            </div>
          </div>

          {/* Card B: Quick Actions Grid */}
          <div className="glass-card p-5">
            <div className="flex items-center gap-2.5 pb-3.5 border-b border-[#D7E4F3]/75 dark:border-white/10">
              <div className="h-9 w-9 rounded-xl glass-icon-tile text-[#007BFF] flex items-center justify-center">
                <Sparkles className="h-4 w-4" />
              </div>
              <h2 className="font-heading text-[16px] font-semibold text-[#101D36] dark:text-slate-100">
                Quick Actions
              </h2>
            </div>
            <div className="grid grid-cols-2 gap-3 pt-3.5">
              <Link
                href="/job-cards/new"
                className="col-span-1 p-3.5 rounded-2xl glass-btn-primary text-white font-semibold text-xs flex flex-col items-center justify-center gap-1.5 transition-all text-center"
              >
                <Plus className="h-5 w-5" />
                <span>Create Job Card</span>
              </Link>
              <button
                type="button"
                onClick={() => setCombinedModalOpen(true)}
                className="col-span-1 p-3.5 rounded-2xl glass-btn-secondary font-semibold text-xs flex flex-col items-center justify-center gap-1.5 transition-all text-center cursor-pointer"
              >
                <UserPlus className="h-5 w-5 text-[#007BFF]" />
                <span>Add Customer</span>
              </button>
              <Link
                href="/vehicles"
                className="col-span-1 p-3.5 rounded-2xl glass-btn-secondary font-semibold text-xs flex flex-col items-center justify-center gap-1.5 transition-all text-center"
              >
                <Car className="h-5 w-5 text-[#0095FF]" />
                <span>Add Vehicle</span>
              </Link>
              <Link
                href="/parts"
                className="col-span-1 p-3.5 rounded-2xl glass-btn-secondary font-semibold text-xs flex flex-col items-center justify-center gap-1.5 transition-all text-center"
              >
                <Package className="h-5 w-5 text-[#00A9DA]" />
                <span>Add Part</span>
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* ───────────────────────────────────────────────────────────────────────
          6. MODAL: COMBINED CUSTOMER & VEHICLE
      ──────────────────────────────────────────────────────────────────────── */}
      <CombinedCustomerVehicleModal
        open={combinedModalOpen}
        onOpenChange={setCombinedModalOpen}
        onSuccess={() => fetchMetrics(true)}
      />
    </div>
  );
}

export default DashboardView;
