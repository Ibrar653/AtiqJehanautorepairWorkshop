"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import {
  getDashboardData,
  getDateRangeForPeriod,
  type DashboardMetrics,
  type DashboardPeriod,
} from "@/lib/services/dashboard-service";
import { DashboardDateFilter } from "@/components/dashboard/dashboard-date-filter";
import { CombinedCustomerVehicleModal } from "@/components/shared/combined-customer-vehicle-modal";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { Button } from "@/components/ui/button";

const DashboardSalesChart = dynamic(
  () => import("@/components/dashboard/dashboard-sales-chart").then((mod) => mod.DashboardSalesChart),
  {
    loading: () => (
      <div className="h-[320px] rounded-[10px] bg-card border border-border p-5 shadow-xs animate-pulse" />
    ),
    ssr: false,
  }
);
import {
  DollarSign,
  Wrench,
  Cog,
  Receipt,
  TrendingUp,
  AlertTriangle,
  ClipboardList,
  CheckCircle2,
  Clock,
  Plus,
  RefreshCw,
  Loader2,
  UserPlus,
  ArrowRight,
  ShieldAlert,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { usePermissions } from "@/lib/context/auth-context";
import { useWorkspace } from "@/lib/context/workspace-context";

export function DashboardView() {
  const { isViewer, canEdit } = usePermissions();
  const { currentWorkspace } = useWorkspace();
  const [period, setPeriod] = useState<DashboardPeriod>("this_month");
  const [customRange, setCustomRange] = useState<{ startDate?: string; endDate?: string }>({});
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [combinedModalOpen, setCombinedModalOpen] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const fetchMetrics = useCallback(async (isManualRefresh = false) => {
    if (isManualRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const data = await getDashboardData(period, customRange, isManualRefresh, currentWorkspace?.id);
      setMetrics(data);
    } catch (err: any) {
      console.error("Dashboard fetch error:", err);
      setToast({ type: "error", text: "Failed to load dashboard metrics." });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [period, customRange, currentWorkspace?.id]);

  useEffect(() => {
    fetchMetrics();
  }, [fetchMetrics]);

  const activeRange = getDateRangeForPeriod(period, customRange);

  return (
    <div className="space-y-6">
      {/* Top Header Controls */}
      <PageHeader
        title="Workshop Executive Dashboard"
        description="Live operational metrics, repair sales breakdown, receivables, and real profit analytics"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchMetrics(true)}
              disabled={refreshing}
              className="text-xs h-9 font-medium border-border bg-card hover:bg-muted/50 text-foreground shadow-xs rounded-lg"
            >
              <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${refreshing ? "animate-spin text-primary" : "text-muted-foreground"}`} />
              {refreshing ? "Refreshing..." : "Live Revalidate"}
            </Button>
            {canEdit && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCombinedModalOpen(true)}
                  className="text-xs h-9 font-medium border-border bg-card hover:bg-muted/50 text-foreground shadow-xs rounded-lg"
                >
                  <UserPlus className="h-4 w-4 mr-1.5 text-primary" />
                  + Add Customer &amp; Vehicle
                </Button>
                <Link href="/job-cards/new">
                  <Button
                    size="sm"
                    className="bg-primary hover:bg-primary/90 text-primary-foreground font-medium text-xs h-9 shadow-xs rounded-lg"
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    + Create Job Card
                  </Button>
                </Link>
              </>
            )}
          </div>
        }
      />

      {/* Toast Alert */}
      {toast && (
        <div
          className={`flex items-center justify-between p-3 rounded-lg border text-caption font-medium shadow-xs ${
            toast.type === "success"
              ? "bg-emerald-500/[0.08] border-emerald-500/20 text-emerald-700 dark:text-emerald-300"
              : "bg-red-500/[0.08] border-red-500/20 text-red-700 dark:text-red-300"
          }`}
        >
          <span>{toast.text}</span>
          <button onClick={() => setToast(null)} className="underline font-semibold ml-2 hover:opacity-80">
            Dismiss
          </button>
        </div>
      )}

      {/* Interactive Date Range Filter Toolbar */}
      <DashboardDateFilter
        currentPeriod={period}
        customStartDate={activeRange.startDate}
        customEndDate={activeRange.endDate}
        onPeriodChange={(p) => {
          setPeriod(p);
        }}
        onCustomRangeApply={(from, to) => {
          setCustomRange({ startDate: from, endDate: to });
          setPeriod("custom");
        }}
      />

      {loading && !metrics ? (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-[104px] rounded-[10px] bg-card border border-border p-5 flex flex-col justify-between shadow-xs animate-pulse">
                <div className="flex justify-between items-start">
                  <div className="space-y-2">
                    <div className="h-3 w-20 bg-muted rounded" />
                    <div className="h-6 w-28 bg-muted rounded" />
                  </div>
                  <div className="h-8 w-8 rounded-lg bg-muted" />
                </div>
                <div className="h-2.5 w-36 bg-muted/60 rounded" />
              </div>
            ))}
          </div>
          <div className="h-[320px] rounded-[10px] bg-card border border-border p-5 shadow-xs animate-pulse" />
        </div>
      ) : metrics ? (
        <div className="space-y-6 animate-in fade-in-50 duration-150">
          {/* Low Stock Warning Banner */}
          {metrics.lowStockPartsCount > 0 && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 bg-amber-500/[0.06] border border-amber-500/20 rounded-[10px] text-caption shadow-xs">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-amber-500/10 rounded-lg text-amber-600 dark:text-amber-400 shrink-0">
                  <AlertTriangle className="h-4 w-4" />
                </div>
                <div>
                  <p className="font-semibold text-foreground text-sm">
                    {metrics.lowStockPartsCount} Spare Part{metrics.lowStockPartsCount > 1 ? "s" : ""} at or below Minimum Stock Level
                  </p>
                  <p className="text-muted-foreground text-caption mt-0.5">
                    Replenish stock from suppliers to prevent workshop repair delays.
                  </p>
                </div>
              </div>
              <Link href="/inventory">
                <Button
                  size="sm"
                  variant="outline"
                  className="border-border text-foreground hover:bg-muted/50 text-xs font-medium gap-1 shrink-0 h-8 rounded-lg shadow-xs"
                >
                  Manage Inventory <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              </Link>
            </div>
          )}

          {/* TOP 8 METRICS GRID */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            {/* 1. Total Sales */}
            <StatCard
              title="Total Sales"
              value={metrics.totalSales}
              icon={<DollarSign className="h-5 w-5" />}
              variant="primary"
              isCurrency
              description="Total billed repair revenue"
            />

            {/* 2. Service Sales */}
            <StatCard
              title="Service Sales"
              value={metrics.serviceSales}
              icon={<Wrench className="h-5 w-5" />}
              variant="default"
              isCurrency
              description="Labour & mechanic charges"
            />

            {/* 3. Spare Parts Sales */}
            <StatCard
              title="Spare Parts Sales"
              value={metrics.partsSales}
              icon={<Cog className="h-5 w-5" />}
              variant="default"
              isCurrency
              description="Installed replacement parts"
            />

            {/* 4. Outstanding */}
            <StatCard
              title="Outstanding"
              value={metrics.outstandingCredit}
              icon={<AlertTriangle className="h-5 w-5" />}
              variant={metrics.outstandingCredit > 0 ? "warning" : "default"}
              isCurrency
              description="Unpaid customer balance"
            />

            {/* 5. Expenses */}
            <StatCard
              title="Expenses"
              value={metrics.expenses}
              icon={<Receipt className="h-5 w-5" />}
              variant="danger"
              isCurrency
              description="Workshop operational costs"
            />

            {/* 6. Net Profit */}
            <StatCard
              title="Net Profit"
              value={
                metrics.isProfitDataIncomplete
                  ? "Profit data incomplete"
                  : metrics.netProfit
              }
              icon={<TrendingUp className="h-5 w-5" />}
              variant={metrics.netProfit >= 0 ? "success" : "danger"}
              isCurrency={!metrics.isProfitDataIncomplete}
              description={
                metrics.isProfitDataIncomplete
                  ? "Parts cost missing in catalog"
                  : `Gross Profit: ${formatCurrency(metrics.grossProfit)}`
              }
            />

            {/* 7. Open Jobs */}
            <StatCard
              title="Open Jobs"
              value={metrics.openJobs}
              icon={<Clock className="h-5 w-5" />}
              variant="warning"
              description="New, In Progress, Waiting"
            />

            {/* 8. Completed Jobs */}
            <StatCard
              title="Completed Jobs"
              value={metrics.completedJobs}
              icon={<CheckCircle2 className="h-5 w-5" />}
              variant="success"
              description="Finished repairs in period"
            />
          </div>

          {/* SALES OVERVIEW & PROFIT CHARTS */}
          <DashboardSalesChart
            chartData={metrics.chartData}
            totalSales={metrics.totalSales}
            totalExpenses={metrics.expenses}
            netProfit={metrics.netProfit}
            serviceSales={metrics.serviceSales}
            partsSales={metrics.partsSales}
            isProfitDataIncomplete={metrics.isProfitDataIncomplete}
          />
        </div>
      ) : null}

      {/* Unified Combined Customer & Vehicle Modal */}
      <CombinedCustomerVehicleModal
        open={combinedModalOpen}
        onOpenChange={setCombinedModalOpen}
        onSuccess={(cust, veh) => {
          setToast({
            type: "success",
            text: `Registered customer "${cust.name}" and vehicle "${veh.make} ${veh.model}".`,
          });
          fetchMetrics(true);
        }}
      />
    </div>
  );
}

export default DashboardView;
