"use client";

import { cn, formatCurrency } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";

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

const variantStyles = {
  default: "bg-card border-border",
  primary: "bg-card border-border",
  success: "bg-card border-border",
  warning: "bg-card border-border",
  danger: "bg-card border-border",
};

const iconVariantStyles = {
  default: "bg-muted/60 text-muted-foreground",
  primary: "bg-blue-500/[0.08] text-primary",
  success: "bg-emerald-500/[0.08] text-emerald-600 dark:text-emerald-400",
  warning: "bg-amber-500/[0.08] text-amber-600 dark:text-amber-400",
  danger: "bg-red-500/[0.08] text-red-600 dark:text-red-400",
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
    <Card className={cn("h-full border border-border shadow-xs bg-card transition-colors duration-150", variantStyles[variant])}>
      <CardContent className="p-5 flex flex-col justify-between h-full">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1.5 min-w-0">
            <p className="text-eyebrow text-muted-foreground truncate">
              {title}
            </p>
            <p className="text-metric text-foreground truncate">{displayValue}</p>
          </div>
          <div
            className={cn(
              "h-8 w-8 rounded-lg flex items-center justify-center shrink-0 [&>svg]:h-4 [&>svg]:w-4",
              iconVariantStyles[variant]
            )}
          >
            {icon}
          </div>
        </div>
        {(description || trend) && (
          <div className="mt-3 pt-2.5 border-t border-border/50 flex items-center justify-between gap-2 text-caption">
            {description && (
              <span className="text-caption text-muted-foreground truncate">{description}</span>
            )}
            {trend && (
              <div className="flex items-center gap-1 shrink-0 font-medium tabular-nums">
                <span
                  className={cn(
                    trend.isPositive ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"
                  )}
                >
                  {trend.isPositive ? "↑" : "↓"} {Math.abs(trend.value)}%
                </span>
                <span className="text-caption text-muted-foreground">vs last month</span>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
