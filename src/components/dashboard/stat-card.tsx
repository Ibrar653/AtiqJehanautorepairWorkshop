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
  default: "neu-icon-box text-[#007BFF] dark:text-blue-400",
  primary: "neu-icon-box text-[#007BFF] dark:text-blue-400",
  success: "neu-icon-box text-emerald-600 dark:text-emerald-400",
  warning: "neu-icon-box text-amber-600 dark:text-amber-400",
  danger: "neu-icon-box text-rose-600 dark:text-rose-400",
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
    <div className="h-full neu-card p-5 flex flex-col justify-between transition-all duration-150 hover:-translate-y-0.5 select-none">
      <div>
        <div className="flex items-start justify-between gap-2">
          <p className="text-[12px] font-semibold text-[#526782] dark:text-muted-foreground tracking-wide truncate">
            {title}
          </p>
          <div
            className={cn(
              "h-9 w-9 rounded-xl flex items-center justify-center shrink-0 [&>svg]:h-4 [&>svg]:w-4",
              iconVariantStyles[variant]
            )}
          >
            {icon}
          </div>
        </div>
        <div className="mt-3">
          <p className="text-[26px] sm:text-[28px] font-bold text-[#102340] dark:text-foreground tabular-nums tracking-tight leading-none truncate">
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
