import * as React from "react";
import { cn } from "@/lib/utils";

export interface EmptyStateProps {
  icon?: React.ComponentType<{ className?: string }>;
  title?: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({
  icon: Icon,
  title = "No records found",
  description = "No activity recorded for this period.",
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center p-8 text-center rounded-xl border border-dashed border-border/80 bg-card/50 my-2",
        className
      )}
    >
      {Icon && (
        <div className="h-10 w-10 rounded-lg bg-muted/70 text-muted-foreground flex items-center justify-center mb-3 shrink-0">
          <Icon className="h-5 w-5" />
        </div>
      )}
      <h4 className="text-[13.5px] font-semibold text-foreground leading-tight">{title}</h4>
      {description && (
        <p className="text-caption text-muted-foreground mt-1 max-w-sm">{description}</p>
      )}
      {action && <div className="mt-3.5">{action}</div>}
    </div>
  );
}
