"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";
import { BarChart3, TrendingUp, TrendingDown, DollarSign, Receipt, PieChart } from "lucide-react";

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
    <Card className="rounded-[10px] border border-border shadow-xs bg-card">
      <CardHeader className="p-5 pb-4 border-b border-border flex flex-row items-center justify-between flex-wrap gap-3">
        <CardTitle className="flex items-center gap-2 text-section text-foreground">
          <BarChart3 className="h-4 w-4 text-primary" />
          <span>Financial Overview &amp; Performance</span>
        </CardTitle>

        {/* View Mode Tabs */}
        <div className="flex items-center gap-1 bg-muted/60 p-1 rounded-lg border border-border/50 text-xs">
          <button
            type="button"
            onClick={() => setActiveTab("overview")}
            className={`h-7 text-caption font-medium px-2.5 rounded-md transition-all duration-150 ${
              activeTab === "overview"
                ? "bg-card text-foreground shadow-xs font-semibold border border-border/60"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Overview
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("sales")}
            className={`h-7 text-caption font-medium px-2.5 rounded-md transition-all duration-150 ${
              activeTab === "sales"
                ? "bg-card text-primary shadow-xs font-semibold border border-border/60"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Sales
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("expenses")}
            className={`h-7 text-caption font-medium px-2.5 rounded-md transition-all duration-150 ${
              activeTab === "expenses"
                ? "bg-card text-red-600 dark:text-red-400 shadow-xs font-semibold border border-border/60"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Expenses
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("profit")}
            className={`h-7 text-caption font-medium px-2.5 rounded-md transition-all duration-150 ${
              activeTab === "profit"
                ? "bg-card text-emerald-600 dark:text-emerald-400 shadow-xs font-semibold border border-border/60"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Profit
          </button>
        </div>
      </CardHeader>

      <CardContent className="p-5 space-y-6">
        {/* KPI Summary Strip */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="p-3.5 rounded-lg border border-border bg-muted/30 space-y-1">
            <div className="flex items-center justify-between text-caption text-muted-foreground">
              <span className="font-semibold text-eyebrow">Total Revenue</span>
              <DollarSign className="h-3.5 w-3.5 text-primary" />
            </div>
            <p className="text-xl font-semibold tracking-tight text-foreground tabular-nums">{formatCurrency(totalSales)}</p>
            <p className="text-caption text-muted-foreground tabular-nums">
              Services: {formatCurrency(serviceSales)} • Parts: {formatCurrency(partsSales)}
            </p>
          </div>

          <div className="p-3.5 rounded-lg border border-border bg-muted/30 space-y-1">
            <div className="flex items-center justify-between text-caption text-muted-foreground">
              <span className="font-semibold text-eyebrow">Total Expenses</span>
              <Receipt className="h-3.5 w-3.5 text-red-500" />
            </div>
            <p className="text-xl font-semibold tracking-tight text-red-600 dark:text-red-400 tabular-nums">
              {formatCurrency(totalExpenses)}
            </p>
            <p className="text-caption text-muted-foreground">Operational &amp; procurement costs</p>
          </div>

          <div className="p-3.5 rounded-lg border border-border bg-muted/30 space-y-1">
            <div className="flex items-center justify-between text-caption text-muted-foreground">
              <span className="font-semibold text-eyebrow">Net Profit</span>
              <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
            </div>
            {isProfitDataIncomplete ? (
              <p className="text-sm font-semibold text-amber-600 dark:text-amber-400 pt-1">
                Profit data incomplete
              </p>
            ) : (
              <p className="text-xl font-semibold tracking-tight text-emerald-600 dark:text-emerald-400 tabular-nums">
                {formatCurrency(netProfit)}
              </p>
            )}
            <p className="text-caption text-muted-foreground tabular-nums">
              Margin: {totalSales > 0 && !isProfitDataIncomplete ? `${Math.round((netProfit / totalSales) * 100)}%` : "—"}
            </p>
          </div>
        </div>

        {/* Visual Timeline Bar Chart */}
        <div className="space-y-3">
          <div className="flex items-center justify-between text-caption text-muted-foreground font-semibold px-1">
            <span>Activity Breakdown</span>
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
                          <span className="text-red-600 dark:text-red-400 font-medium">Exp: {formatCurrency(eVal)}</span>
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
                            className="bg-red-500 h-full rounded-full transition-all duration-150 ease-out"
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
            <div className="h-44 flex flex-col items-center justify-center gap-2 text-muted-foreground text-caption rounded-lg border border-dashed border-border/80 p-6 text-center">
              <BarChart3 className="h-8 w-8 text-muted-foreground/40 stroke-1" />
              <span>No activity recorded for the selected period.</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
