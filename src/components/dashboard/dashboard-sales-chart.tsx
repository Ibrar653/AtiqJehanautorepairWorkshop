"use client";

import { useState } from "react";
import { formatCurrency } from "@/lib/utils";
import { BarChart3, TrendingUp, DollarSign, Receipt } from "lucide-react";

interface DashboardSalesChartProps {
  chartData: {
    labels: string[];
    salesSeries: number[];
    expensesSeries: number[];
    profitSeries: number[];
  };
  totalSales: number;
  totalExpenses: number;
  netProfit: number;
  serviceSales: number;
  partsSales: number;
  isProfitDataIncomplete?: boolean;
}

export function DashboardSalesChart({
  chartData,
  totalSales,
  totalExpenses,
  netProfit,
  serviceSales,
  partsSales,
  isProfitDataIncomplete,
}: DashboardSalesChartProps) {
  const [activeTab, setActiveTab] = useState<"overview" | "sales" | "expenses" | "profit">("overview");

  const labels = chartData.labels || [];
  const sales = chartData.salesSeries || [];
  const expenses = chartData.expensesSeries || [];
  const profits = chartData.profitSeries || [];

  // Calculate highest value for relative bar scaling
  const maxVal = Math.max(
    ...sales,
    ...expenses,
    ...profits.map((p) => Math.abs(p)),
    totalSales,
    totalExpenses,
    100
  );

  return (
    <div className="rounded-xl border border-border bg-card shadow-xs overflow-hidden">
      {/* Header with Title and View Mode Tabs */}
      <div className="p-5 pb-4 border-b border-border/80 flex flex-row items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2.5 text-[15px] sm:text-[16px] font-bold text-foreground">
          <div className="h-7 w-7 rounded-md bg-primary/10 text-primary flex items-center justify-center">
            <BarChart3 className="h-4 w-4" />
          </div>
          <span>Financial Overview &amp; Performance</span>
        </div>

        {/* View Mode Tabs */}
        <div className="flex items-center gap-1 bg-slate-100/90 dark:bg-muted/70 p-1 rounded-lg border border-border/70 text-xs">
          <button
            type="button"
            onClick={() => setActiveTab("overview")}
            className={`h-7 text-[12px] font-medium px-3 rounded-md transition-all duration-150 ${
              activeTab === "overview"
                ? "bg-card text-foreground shadow-xs font-semibold border border-border/80"
                : "text-muted-foreground hover:text-foreground hover:bg-card/50"
            }`}
          >
            Overview
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("sales")}
            className={`h-7 text-[12px] font-medium px-3 rounded-md transition-all duration-150 ${
              activeTab === "sales"
                ? "bg-card text-primary shadow-xs font-semibold border border-border/80"
                : "text-muted-foreground hover:text-foreground hover:bg-card/50"
            }`}
          >
            Sales
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("expenses")}
            className={`h-7 text-[12px] font-medium px-3 rounded-md transition-all duration-150 ${
              activeTab === "expenses"
                ? "bg-card text-rose-600 dark:text-rose-400 shadow-xs font-semibold border border-border/80"
                : "text-muted-foreground hover:text-foreground hover:bg-card/50"
            }`}
          >
            Expenses
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("profit")}
            className={`h-7 text-[12px] font-medium px-3 rounded-md transition-all duration-150 ${
              activeTab === "profit"
                ? "bg-card text-emerald-600 dark:text-emerald-400 shadow-xs font-semibold border border-border/80"
                : "text-muted-foreground hover:text-foreground hover:bg-card/50"
            }`}
          >
            Profit
          </button>
        </div>
      </div>

      <div className="p-5 space-y-6">
        {/* KPI Summary Strip — Compact white summary cards with subtle semantic accents */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
          {/* Total Revenue */}
          <div className="p-4 rounded-xl border border-border bg-card shadow-xs flex flex-col justify-between space-y-2">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Total Revenue</span>
              <div className="h-7 w-7 rounded-md bg-blue-50 text-blue-600 border border-blue-100/80 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-900/40 flex items-center justify-center">
                <DollarSign className="h-3.5 w-3.5" />
              </div>
            </div>
            <div>
              <p className="text-[22px] font-bold tracking-tight text-foreground tabular-nums">{formatCurrency(totalSales)}</p>
              <p className="text-[11.5px] text-muted-foreground tabular-nums mt-0.5">
                Services: {formatCurrency(serviceSales)} • Parts: {formatCurrency(partsSales)}
              </p>
            </div>
          </div>

          {/* Total Expenses */}
          <div className="p-4 rounded-xl border border-border bg-card shadow-xs flex flex-col justify-between space-y-2">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Total Expenses</span>
              <div className="h-7 w-7 rounded-md bg-rose-50 text-rose-600 border border-rose-100/80 dark:bg-rose-950/40 dark:text-rose-400 dark:border-rose-900/40 flex items-center justify-center">
                <Receipt className="h-3.5 w-3.5" />
              </div>
            </div>
            <div>
              <p className="text-[22px] font-bold tracking-tight text-rose-600 dark:text-rose-400 tabular-nums">
                {formatCurrency(totalExpenses)}
              </p>
              <p className="text-[11.5px] text-muted-foreground mt-0.5">Operational &amp; procurement costs</p>
            </div>
          </div>

          {/* Net Profit */}
          <div className="p-4 rounded-xl border border-border bg-card shadow-xs flex flex-col justify-between space-y-2">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Net Profit</span>
              <div className="h-7 w-7 rounded-md bg-emerald-50 text-emerald-600 border border-emerald-100/80 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-900/40 flex items-center justify-center">
                <TrendingUp className="h-3.5 w-3.5" />
              </div>
            </div>
            <div>
              {isProfitDataIncomplete ? (
                <p className="text-sm font-semibold text-amber-600 dark:text-amber-400 pt-1">
                  Profit data incomplete
                </p>
              ) : (
                <p className="text-[22px] font-bold tracking-tight text-emerald-600 dark:text-emerald-400 tabular-nums">
                  {formatCurrency(netProfit)}
                </p>
              )}
              <p className="text-[11.5px] text-muted-foreground tabular-nums mt-0.5">
                Margin: {totalSales > 0 && !isProfitDataIncomplete ? `${Math.round((netProfit / totalSales) * 100)}%` : "—"}
              </p>
            </div>
          </div>
        </div>

        {/* Activity Breakdown Timeline Bars */}
        <div className="space-y-3">
          <div className="flex items-center justify-between text-[11.5px] text-muted-foreground font-semibold px-1">
            <span className="uppercase tracking-wider">Activity Breakdown</span>
            <span className="tabular-nums">Scale Max: {formatCurrency(maxVal)}</span>
          </div>

          {labels.length > 0 && labels.some((_, idx) => (sales[idx] || 0) !== 0 || (expenses[idx] || 0) !== 0 || (profits[idx] || 0) !== 0) ? (
            <div className="space-y-2.5 pt-1">
              {labels.map((lbl, idx) => {
                const sVal = sales[idx] || 0;
                const eVal = expenses[idx] || 0;
                const pVal = profits[idx] || 0;

                const sPct = Math.min(100, Math.max(4, (sVal / maxVal) * 100));
                const ePct = Math.min(100, Math.max(4, (eVal / maxVal) * 100));
                const pPct = Math.min(100, Math.max(4, (Math.abs(pVal) / maxVal) * 100));

                return (
                  <div key={lbl + idx} className="space-y-1.5 p-3 rounded-lg bg-muted/20 border border-border text-caption">
                    <div className="flex items-center justify-between font-mono font-medium text-foreground">
                      <span className="text-xs">{lbl}</span>
                      <div className="flex items-center gap-3 text-caption tabular-nums">
                        {(activeTab === "overview" || activeTab === "sales") && (
                          <span className="text-primary font-medium">Sales: {formatCurrency(sVal)}</span>
                        )}
                        {(activeTab === "overview" || activeTab === "expenses") && (
                          <span className="text-rose-600 dark:text-rose-400 font-medium">Exp: {formatCurrency(eVal)}</span>
                        )}
                        {(activeTab === "overview" || activeTab === "profit") && (
                          <span className={`font-medium ${pVal >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}`}>
                            Profit: {formatCurrency(pVal)}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="space-y-1">
                      {(activeTab === "overview" || activeTab === "sales") && (
                        <div className="h-2 w-full bg-muted/80 rounded-full overflow-hidden flex">
                          <div
                            style={{ width: `${sPct}%` }}
                            className="bg-primary h-full rounded-full transition-all duration-150 ease-out"
                            title={`Sales: ${formatCurrency(sVal)}`}
                          />
                        </div>
                      )}

                      {(activeTab === "overview" || activeTab === "expenses") && (
                        <div className="h-2 w-full bg-muted/80 rounded-full overflow-hidden flex">
                          <div
                            style={{ width: `${ePct}%` }}
                            className="bg-rose-500 h-full rounded-full transition-all duration-150 ease-out"
                            title={`Expenses: ${formatCurrency(eVal)}`}
                          />
                        </div>
                      )}

                      {(activeTab === "overview" || activeTab === "profit") && (
                        <div className="h-2 w-full bg-muted/80 rounded-full overflow-hidden flex">
                          <div
                            style={{ width: `${pPct}%` }}
                            className={`${
                              pVal >= 0 ? "bg-emerald-500" : "bg-amber-500"
                            } h-full rounded-full transition-all duration-150 ease-out`}
                            title={`Profit: ${formatCurrency(pVal)}`}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="py-8 px-6 rounded-xl border border-dashed border-border/80 bg-muted/10 flex flex-col items-center justify-center text-center">
              <div className="h-9 w-9 rounded-lg bg-muted/60 text-muted-foreground flex items-center justify-center mb-2">
                <BarChart3 className="h-4 w-4 stroke-1.5" />
              </div>
              <p className="text-[13px] font-semibold text-foreground">No activity recorded for the selected period.</p>
              <p className="text-[11.5px] text-muted-foreground mt-0.5">Change date filters or record transactions to populate financial metrics.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
