"use client";

import { cn, formatCurrency } from "@/lib/utils";

interface StatCardProps {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  description?: string;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  variant?: "default" | "primary" | "success" | "warning" | "danger";
  isCurrency?: boolean;
}

const iconVariantStyles = {
  default: "bg-blue-50 text-blue-600 border border-blue-100/80 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-900/40",
  primary: "bg-blue-50 text-blue-600 border border-blue-100/80 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-900/40",
  success: "bg-emerald-50 text-emerald-600 border border-emerald-100/80 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-900/40",
  warning: "bg-amber-50 text-amber-600 border border-amber-100/80 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-900/40",
  danger: "bg-rose-50 text-rose-600 border border-rose-100/80 dark:bg-rose-950/40 dark:text-rose-400 dark:border-rose-900/40",
};

export function StatCard({
  title,
  value,
  icon,
  description,
  trend,
  variant = "default",
  isCurrency = false,
}: StatCardProps) {
  const displayValue = isCurrency ? formatCurrency(value as number) : value;

  return (
    <div className="h-full rounded-xl border border-border bg-card shadow-xs p-5 flex flex-col justify-between transition-colors duration-150 hover:border-slate-300 dark:hover:border-slate-700 select-none">
      <div>
        <div className="flex items-start justify-between gap-2">
          <p className="text-[11.5px] font-semibold text-muted-foreground uppercase tracking-wider truncate">
            {title}
          </p>
          <div
            className={cn(
              "h-8 w-8 rounded-lg flex items-center justify-center shrink-0 [&>svg]:h-4 [&>svg]:w-4",
              iconVariantStyles[variant]
            )}
          >
            {icon}
          </div>
        </div>
        <div className="mt-2.5">
          <p className="text-[26px] sm:text-[28px] font-bold text-foreground tabular-nums tracking-tight leading-none truncate">
            {displayValue}
          </p>
        </div>
      </div>
      {(description || trend) && (
        <div className="mt-3.5 pt-2.5 border-t border-border/60 flex items-center justify-between gap-2 text-[12px]">
          {description && (
            <span className="text-[12px] text-muted-foreground truncate">{description}</span>
          )}
          {trend && (
            <div className="flex items-center gap-1 shrink-0 font-medium tabular-nums text-[12px]">
              <span
                className={cn(
                  trend.isPositive ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
                )}
              >
                {trend.isPositive ? "↑" : "↓"} {Math.abs(trend.value)}%
              </span>
              <span className="text-[11px] text-muted-foreground">vs last month</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
