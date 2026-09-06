"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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

  return (
    <div className="space-y-6 pb-12">
      {/* ───────────────────────────────────────────────────────────────────────
          1. DASHBOARD HEADER & ACTIONS
      ──────────────────────────────────────────────────────────────────────── */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl lg:text-[26px] font-bold text-slate-900 tracking-tight">
              Workshop Executive Dashboard
            </h1>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
              AED &bull; Live
            </span>
          </div>
          <p className="text-[13.5px] text-slate-500 font-normal mt-0.5">
            Real-time workshop performance, financial metrics &amp; active repair orders.
          </p>
        </div>

        {/* Right side existing actions */}
        <div className="flex flex-wrap items-center gap-2.5">
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchMetrics(true)}
            disabled={refreshing}
            className="h-10 px-3 text-xs font-semibold rounded-xl border-slate-200 bg-white hover:bg-slate-50 text-slate-700 gap-1.5 shadow-2xs"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin text-blue-600" : ""}`} />
            Live Revalidate
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setCombinedModalOpen(true)}
            className="h-10 px-3.5 text-xs font-semibold rounded-xl border-slate-200 bg-white hover:bg-slate-50 text-slate-700 gap-1.5 shadow-2xs"
          >
            <UserPlus className="h-3.5 w-3.5 text-blue-600" />
            Add Customer &amp; Vehicle
          </Button>

          <Button
            render={<Link href="/job-cards/new" />}
            className="h-10 px-4 text-xs font-semibold rounded-xl bg-blue-600 hover:bg-blue-700 text-white gap-1.5 shadow-xs transition-colors"
          >
            <Plus className="h-4 w-4" />
            Create Job Card
          </Button>
        </div>
      </div>

      {/* ───────────────────────────────────────────────────────────────────────
          2. DATE FILTER (COMPACT PREMIUM SEGMENTED CONTROL)
      ──────────────────────────────────────────────────────────────────────── */}
      <div className="bg-white p-3 rounded-2xl border border-slate-200/90 shadow-2xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-1 overflow-x-auto p-0.5">
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
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap flex items-center gap-1.5 ${
                  period === p.key
                    ? "bg-blue-600 text-white shadow-xs"
                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-100/70"
                }`}
              >
                {p.key === "custom" && <Calendar className="h-3.5 w-3.5" />}
                {p.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 px-2 text-xs font-medium self-end sm:self-center">
            {period === "custom" && customRange.startDate && customRange.endDate ? (
              <div className="flex items-center gap-1.5 bg-blue-50 text-blue-700 font-semibold px-2.5 py-1 rounded-xl border border-blue-200/80">
                <Calendar className="h-3.5 w-3.5 text-blue-600" />
                <span className="font-mono tabular-nums">
                  {customRange.startDate} to {customRange.endDate}
                </span>
                <button
                  type="button"
                  onClick={() => setShowCustomRangePicker((prev) => !prev)}
                  className="ml-1 text-[11px] underline text-blue-600 hover:text-blue-800 cursor-pointer"
                  title="Modify date range"
                >
                  Edit
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-slate-500">
                <Calendar className="h-3.5 w-3.5 text-slate-400" />
                <span>
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
            className="pt-3 border-t border-slate-100 flex flex-wrap items-end gap-3.5 animate-in fade-in-50 duration-150"
          >
            <div className="space-y-1">
              <Label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">
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
                className="h-9 text-xs w-40 rounded-xl border-slate-200 bg-white font-mono tabular-nums shadow-2xs"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">
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
                className="h-9 text-xs w-40 rounded-xl border-slate-200 bg-white font-mono tabular-nums shadow-2xs"
              />
            </div>

            <div className="flex items-center gap-2">
              <Button
                type="submit"
                size="sm"
                className="bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl shadow-2xs h-9 px-4 text-xs gap-1.5 transition-colors cursor-pointer"
              >
                <Check className="h-3.5 w-3.5" />
                Apply Range
              </Button>

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleCancelCustomRange}
                className="rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-semibold h-9 px-3 text-xs shadow-2xs cursor-pointer"
              >
                Cancel
              </Button>

              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleResetCustomRange}
                className="text-slate-500 hover:text-slate-700 text-xs h-9 px-2.5 rounded-xl hover:bg-slate-100 cursor-pointer"
              >
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

      {/* ───────────────────────────────────────────────────────────────────────
          3. TOP 8 METRICS KPI CARDS (2 Rows of 4 Cards on Desktop)
      ──────────────────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total Sales */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-2xs hover:shadow-xs transition-all flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Total Sales
            </p>
            <div className="h-8 w-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
              <DollarSign className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3">
            <h3 className="text-2xl font-bold text-slate-900 font-mono tracking-tight">
              {formatCurrency(metrics?.totalSales || 0)}
            </h3>
            <p className="text-[11px] text-slate-400 font-medium mt-1">
              Invoice &amp; POS turnover
            </p>
          </div>
        </div>

        {/* Card 2: Service Sales */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-2xs hover:shadow-xs transition-all flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Service Sales
            </p>
            <div className="h-8 w-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
              <Wrench className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3">
            <h3 className="text-2xl font-bold text-slate-900 font-mono tracking-tight">
              {formatCurrency(metrics?.serviceSales || 0)}
            </h3>
            <p className="text-[11px] text-slate-400 font-medium mt-1">
              Labor &amp; workshop repairs
            </p>
          </div>
        </div>

        {/* Card 3: Spare Parts Sales */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-2xs hover:shadow-xs transition-all flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Spare Parts Sales
            </p>
            <div className="h-8 w-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
              <Package className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3">
            <h3 className="text-2xl font-bold text-slate-900 font-mono tracking-tight">
              {formatCurrency(metrics?.partsSales || 0)}
            </h3>
            <p className="text-[11px] text-slate-400 font-medium mt-1">
              OEM &amp; aftermarket components
            </p>
          </div>
        </div>

        {/* Card 4: Outstanding */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-2xs hover:shadow-xs transition-all flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Outstanding
            </p>
            <div className="h-8 w-8 rounded-lg bg-red-50 text-red-600 flex items-center justify-center shrink-0">
              <Clock className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3">
            <h3 className={`text-2xl font-bold font-mono tracking-tight ${Number(metrics?.outstandingCredit || 0) > 0 ? "text-red-600" : "text-slate-900"}`}>
              {formatCurrency(metrics?.outstandingCredit || 0)}
            </h3>
            <p className="text-[11px] text-slate-400 font-medium mt-1">
              Unsettled customer balances
            </p>
          </div>
        </div>

        {/* Card 5: Expenses */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-2xs hover:shadow-xs transition-all flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Expenses
            </p>
            <div className="h-8 w-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
              <Receipt className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3">
            <h3 className="text-2xl font-bold text-slate-900 font-mono tracking-tight">
              {formatCurrency(metrics?.expenses || 0)}
            </h3>
            <p className="text-[11px] text-slate-400 font-medium mt-1">
              Operational overheads &amp; utilities
            </p>
          </div>
        </div>

        {/* Card 6: Net Profit */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-2xs hover:shadow-xs transition-all flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Net Profit
            </p>
            <div className="h-8 w-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
              <TrendingUp className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3">
            <h3 className={`text-2xl font-bold font-mono tracking-tight ${Number(metrics?.netProfit || 0) >= 0 ? "text-emerald-600" : "text-red-600"}`}>
              {formatCurrency(metrics?.netProfit || 0)}
            </h3>
            <p className="text-[11px] text-slate-400 font-medium mt-1">
              Net operating workshop margin
            </p>
          </div>
        </div>

        {/* Card 7: Open Jobs */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-2xs hover:shadow-xs transition-all flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Open Jobs
            </p>
            <div className="h-8 w-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
              <FileText className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3">
            <h3 className="text-2xl font-bold text-slate-900 font-mono tracking-tight">
              {metrics?.openJobs ?? (newJobsCount + inProgressCount + waitingCount)}
            </h3>
            <p className="text-[11px] text-slate-400 font-medium mt-1">
              Active repairs on workshop lifts
            </p>
          </div>
        </div>

        {/* Card 8: Completed Jobs */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-2xs hover:shadow-xs transition-all flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Completed Jobs
            </p>
            <div className="h-8 w-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
              <CheckCircle2 className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3">
            <h3 className="text-2xl font-bold text-emerald-600 font-mono tracking-tight">
              {metrics?.completedJobs ?? completedCount}
            </h3>
            <p className="text-[11px] text-slate-400 font-medium mt-1">
              Finished &amp; ready for invoice
            </p>
          </div>
        </div>
      </div>

      {/* ───────────────────────────────────────────────────────────────────────
          4. MIDDLE SECTION: FINANCIAL OVERVIEW & PERFORMANCE + JOB CARD STATUS + POPULAR VEHICLES
      ──────────────────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Column 1: Financial Overview & Performance (lg:col-span-6) */}
        <div className="lg:col-span-6 bg-white rounded-2xl border border-slate-200/90 p-5 shadow-2xs flex flex-col justify-between">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-100 gap-3">
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                <BarChart3 className="h-4 w-4" />
              </div>
              <h2 className="text-[15px] font-bold text-slate-900">
                Financial Overview &amp; Performance
              </h2>
            </div>

            {/* Compact Tabs: Sales, Expenses, Profit */}
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
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
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                    activeRevenueTab === tab.id
                      ? "bg-white text-blue-600 shadow-2xs"
                      : "text-slate-500 hover:text-slate-900"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Revenue Bars / Empty State */}
          {Number(metrics?.totalSales || 0) === 0 && Number(metrics?.expenses || 0) === 0 ? (
            <div className="py-16 text-center text-slate-400 flex flex-col items-center justify-center">
              <BarChart3 className="h-10 w-10 text-slate-200 mb-2 stroke-1" />
              <p className="text-xs font-medium text-slate-600">No financial transactions recorded for this period</p>
              <p className="text-[11px] text-slate-400 mt-0.5">Generate your first invoice or register expenses to view performance trends.</p>
            </div>
          ) : (
            <div className="pt-4 flex-1 flex flex-col justify-end">
              <div className="flex items-center gap-4 text-[11px] font-medium text-slate-500 mb-4">
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-blue-600" /> Service Sales
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" /> Parts Sales
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-slate-400" /> Period Trend
                </span>
              </div>

              {/* Bar visualization */}
              <div className="h-44 flex items-end justify-between gap-2 pt-4 border-b border-slate-100 pb-2">
                {[
                  { label: "Cycle 1", service: 25, parts: 15 },
                  { label: "Cycle 2", service: 35, parts: 20 },
                  { label: "Cycle 3", service: 45, parts: 30 },
                  { label: "Cycle 4", service: 55, parts: 35 },
                  { label: "Cycle 5", service: 65, parts: 45 },
                  { label: "Cycle 6", service: 75, parts: 50 },
                ].map((d, idx) => (
                  <div key={idx} className="flex-1 flex flex-col items-center gap-2 h-full justify-end">
                    <div className="w-full max-w-[28px] bg-slate-100 rounded-t-md overflow-hidden flex flex-col justify-end h-full">
                      <div
                        style={{ height: `${d.parts}%` }}
                        className="w-full bg-emerald-500"
                      />
                      <div
                        style={{ height: `${d.service}%` }}
                        className="w-full bg-blue-600"
                      />
                    </div>
                    <span className="text-[10px] font-semibold text-slate-400">
                      {d.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Column 2: Job Card Status Donut (lg:col-span-3) */}
        <div className="lg:col-span-3 bg-white rounded-2xl border border-slate-200/90 p-5 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center gap-2.5 pb-3 border-b border-slate-100">
            <div className="h-8 w-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
              <Users className="h-4 w-4" />
            </div>
            <h2 className="text-[15px] font-bold text-slate-900">Job Card Status</h2>
          </div>

          <div className="py-4 flex items-center justify-center">
            {/* Donut representation */}
            <div className="relative w-32 h-32 flex items-center justify-center">
              <svg viewBox="0 0 36 36" className="w-32 h-32 transform -rotate-90">
                <circle cx="18" cy="18" r="14" fill="transparent" stroke="#E2E8F0" strokeWidth="4" />
                {totalJobsCount > 0 ? (
                  <>
                    <circle cx="18" cy="18" r="14" fill="transparent" stroke="#2563EB" strokeWidth="4" strokeDasharray={`${Math.round((newJobsCount / totalJobsCount) * 100)} 100`} strokeDashoffset="0" />
                    <circle cx="18" cy="18" r="14" fill="transparent" stroke="#F59E0B" strokeWidth="4" strokeDasharray={`${Math.round((inProgressCount / totalJobsCount) * 100)} 100`} strokeDashoffset={`-${Math.round((newJobsCount / totalJobsCount) * 100)}`} />
                    <circle cx="18" cy="18" r="14" fill="transparent" stroke="#10B981" strokeWidth="4" strokeDasharray={`${Math.round((completedCount / totalJobsCount) * 100)} 100`} strokeDashoffset={`-${Math.round(((newJobsCount + inProgressCount) / totalJobsCount) * 100)}`} />
                  </>
                ) : null}
              </svg>
              <div className="absolute flex flex-col items-center justify-center text-center">
                <span className="text-xl font-extrabold text-slate-900 leading-none">
                  {totalJobsCount}
                </span>
                <span className="text-[9.5px] font-semibold text-slate-400 uppercase mt-0.5">
                  Total Jobs
                </span>
              </div>
            </div>
          </div>

          {/* Status Breakdown Legend */}
          <div className="space-y-1.5 pt-2 border-t border-slate-100 text-xs">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-slate-600 font-medium">
                <span className="h-2.5 w-2.5 rounded-full bg-blue-600" /> New
              </span>
              <span className="font-bold text-slate-900">{newJobsCount}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-slate-600 font-medium">
                <span className="h-2.5 w-2.5 rounded-full bg-amber-500" /> In Progress
              </span>
              <span className="font-bold text-slate-900">{inProgressCount}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-slate-600 font-medium">
                <span className="h-2.5 w-2.5 rounded-full bg-purple-500" /> Waiting
              </span>
              <span className="font-bold text-slate-900">{waitingCount}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-slate-600 font-medium">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> Completed
              </span>
              <span className="font-bold text-slate-900">{completedCount}</span>
            </div>
          </div>
        </div>

        {/* Column 3: Popular Vehicles (lg:col-span-3) */}
        <div className="lg:col-span-3 bg-white rounded-2xl border border-slate-200/90 p-5 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                <Car className="h-4 w-4" />
              </div>
              <h2 className="text-[15px] font-bold text-slate-900">Popular Vehicles</h2>
            </div>
            <Link href="/vehicles" className="text-xs font-bold text-blue-600 hover:text-blue-800 transition-colors">
              View All
            </Link>
          </div>

          {popularVehicles.length === 0 ? (
            <div className="py-10 text-center text-slate-400 flex flex-col items-center justify-center">
              <Car className="h-8 w-8 text-slate-200 mb-2 stroke-1" />
              <p className="text-xs text-slate-500">No vehicle jobs recorded yet</p>
              <Link href="/vehicles" className="text-xs text-blue-600 font-bold mt-2">
                + Register Vehicle
              </Link>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 py-1 flex-1 flex flex-col justify-around">
              {popularVehicles.map((v, i) => {
                const totalVCount = popularVehicles.reduce((acc, curr) => acc + curr.count, 0) || 1;
                const pct = Math.round((v.count / totalVCount) * 100);

                return (
                  <Link
                    key={i}
                    href="/vehicles"
                    className="py-2 flex items-center justify-between hover:bg-slate-50 rounded-xl px-1.5 transition-colors group"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="h-7 w-7 rounded-lg bg-slate-100 flex items-center justify-center shrink-0 group-hover:bg-blue-50 text-slate-600 group-hover:text-blue-600 transition-colors">
                        <Car className="h-3.5 w-3.5" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-slate-900 truncate">
                          {v.make} {v.model}
                        </p>
                        <p className="text-[10.5px] text-slate-400 font-medium">
                          {v.count} Jobs &bull; {pct}%
                        </p>
                      </div>
                    </div>
                    <ChevronRight className="h-3.5 w-3.5 text-slate-300 group-hover:text-blue-600 transition-colors shrink-0" />
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
        <div className="lg:col-span-8 bg-white rounded-2xl border border-slate-200/90 p-5 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between pb-4 border-b border-slate-100">
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                <FileText className="h-4 w-4" />
              </div>
              <h2 className="text-[15px] font-bold text-slate-900">Recent Job Cards</h2>
            </div>
            <Link href="/job-cards" className="text-xs font-bold text-blue-600 hover:text-blue-800 transition-colors">
              View All
            </Link>
          </div>

          {/* Table or Empty State */}
          {recentJobCards.length === 0 ? (
            <div className="py-14 text-center text-slate-400 flex flex-col items-center justify-center">
              <FileText className="h-10 w-10 text-slate-200 mb-2 stroke-1" />
              <p className="text-sm font-bold text-slate-700">No Job Cards Yet</p>
              <p className="text-xs text-slate-400 mt-1 max-w-sm">
                Create your first workshop repair order to start tracking jobs, services, and technician progress.
              </p>
              <Button
                render={<Link href="/job-cards/new" />}
                className="mt-4 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl h-9 px-4"
              >
                <Plus className="h-3.5 w-3.5 mr-1" /> Create Job Card
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto pt-2">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-100 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                    <th className="py-2.5 pr-2">#</th>
                    <th className="py-2.5 px-2">Customer</th>
                    <th className="py-2.5 px-2">Vehicle</th>
                    <th className="py-2.5 px-2">Complaint</th>
                    <th className="py-2.5 px-2 text-right">Amount</th>
                    <th className="py-2.5 px-2 text-center">Status</th>
                    <th className="py-2.5 px-2">Date</th>
                    <th className="py-2.5 pl-2 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {recentJobCards.map((jc: any) => {
                    const statusColors: Record<string, string> = {
                      new: "bg-blue-50 text-blue-700 border-blue-200",
                      in_progress: "bg-amber-50 text-amber-700 border-amber-200",
                      waiting: "bg-purple-50 text-purple-700 border-purple-200",
                      completed: "bg-emerald-50 text-emerald-700 border-emerald-200",
                      cancelled: "bg-red-50 text-red-700 border-red-200",
                    };
                    const statusLabel: Record<string, string> = {
                      new: "New",
                      in_progress: "In Progress",
                      waiting: "Waiting",
                      completed: "Completed",
                      cancelled: "Cancelled",
                    };

                    return (
                      <tr key={jc.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3 pr-2 font-bold text-blue-600 whitespace-nowrap">
                          {jc.job_card_number}
                        </td>
                        <td className="py-3 px-2 font-semibold text-slate-900 whitespace-nowrap">
                          {jc.customer?.name || "Customer"}
                        </td>
                        <td className="py-3 px-2 text-slate-600 whitespace-nowrap">
                          {jc.vehicle ? `${jc.vehicle.make} ${jc.vehicle.model}` : "Vehicle"}
                        </td>
                        <td className="py-3 px-2 text-slate-500 truncate max-w-[140px]">
                          {jc.customer_complaint || "Service check"}
                        </td>
                        <td className="py-3 px-2 text-right font-bold text-slate-900 tabular-nums whitespace-nowrap">
                          AED {Number(jc.total || 0).toLocaleString()}
                        </td>
                        <td className="py-3 px-2 text-center whitespace-nowrap">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-[10.5px] font-bold border ${statusColors[jc.status] || "bg-slate-50 text-slate-600 border-slate-200"}`}>
                            {statusLabel[jc.status] || jc.status}
                          </span>
                        </td>
                        <td className="py-3 px-2 text-slate-400 whitespace-nowrap text-[11px]">
                          {jc.date ? formatDate(jc.date) : "Recent"}
                        </td>
                        <td className="py-3 pl-2 text-right whitespace-nowrap">
                          <Link
                            href={`/job-cards/${jc.id}`}
                            className="inline-flex p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
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
          <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-2xs">
            <div className="flex items-center gap-2.5 pb-3 border-b border-slate-100">
              <div className="h-8 w-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                <Receipt className="h-4 w-4" />
              </div>
              <h2 className="text-[15px] font-bold text-slate-900">Financial Summary</h2>
            </div>
            <div className="pt-3 space-y-3">
              <div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500 font-medium">Total Revenue</span>
                  <span className="text-emerald-600 font-bold flex items-center gap-0.5">
                    Live
                  </span>
                </div>
                <p className="text-lg font-extrabold text-slate-900 font-mono mt-0.5">
                  {formatCurrency(metrics?.totalSales || 0)}
                </p>
              </div>

              <div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500 font-medium">Total Expenses</span>
                  <span className="text-amber-600 font-bold flex items-center gap-0.5">
                    Live
                  </span>
                </div>
                <p className="text-lg font-extrabold text-slate-900 font-mono mt-0.5">
                  {formatCurrency(metrics?.expenses || 0)}
                </p>
              </div>

              <div className="pt-2 border-t border-slate-100">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-700 font-bold">Net Profit</span>
                  <span className="text-emerald-600 font-bold flex items-center gap-0.5">
                    Live
                  </span>
                </div>
                <p className={`text-xl font-extrabold font-mono mt-0.5 ${Number(metrics?.netProfit || 0) >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                  {formatCurrency(metrics?.netProfit || 0)}
                </p>
              </div>
            </div>
          </div>

          {/* Card B: Quick Actions Grid */}
          <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-2xs">
            <div className="flex items-center gap-2.5 pb-3 border-b border-slate-100">
              <div className="h-8 w-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                <Sparkles className="h-4 w-4" />
              </div>
              <h2 className="text-[15px] font-bold text-slate-900">Quick Actions</h2>
            </div>
            <div className="grid grid-cols-2 gap-3 pt-3">
              <Link
                href="/job-cards/new"
                className="col-span-1 p-3.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex flex-col items-center justify-center gap-1.5 transition-all shadow-xs text-center"
              >
                <Plus className="h-5 w-5" />
                <span>Create Job Card</span>
              </Link>
              <button
                type="button"
                onClick={() => setCombinedModalOpen(true)}
                className="col-span-1 p-3.5 rounded-xl bg-slate-50 hover:bg-blue-50 hover:text-blue-600 text-slate-700 font-bold text-xs flex flex-col items-center justify-center gap-1.5 border border-slate-200/80 transition-all text-center"
              >
                <UserPlus className="h-5 w-5 text-blue-600" />
                <span>Add Customer</span>
              </button>
              <Link
                href="/vehicles"
                className="col-span-1 p-3.5 rounded-xl bg-slate-50 hover:bg-blue-50 hover:text-blue-600 text-slate-700 font-bold text-xs flex flex-col items-center justify-center gap-1.5 border border-slate-200/80 transition-all text-center"
              >
                <Car className="h-5 w-5 text-blue-600" />
                <span>Add Vehicle</span>
              </Link>
              <Link
                href="/parts"
                className="col-span-1 p-3.5 rounded-xl bg-slate-50 hover:bg-blue-50 hover:text-blue-600 text-slate-700 font-bold text-xs flex flex-col items-center justify-center gap-1.5 border border-slate-200/80 transition-all text-center"
              >
                <Package className="h-5 w-5 text-blue-600" />
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
