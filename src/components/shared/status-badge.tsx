"use client";

import { cn } from "@/lib/utils";
import { JOB_CARD_STATUSES, PAYMENT_STATUSES, PURCHASE_PAYMENT_STATUSES } from "@/lib/constants";

interface StatusBadgeProps {
  status: string;
  type?: "job_card" | "payment" | "purchase" | "general";
  className?: string;
}

// Universal soft semantic badge styling map
const STATUS_STYLE_MAP: Record<string, { label: string; color: string }> = {
  active: {
    label: "Active",
    color: "bg-emerald-50 text-emerald-700 border-emerald-200/80 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800/40",
  },
  paid: {
    label: "Paid",
    color: "bg-emerald-50 text-emerald-700 border-emerald-200/80 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800/40",
  },
  pending: {
    label: "Pending",
    color: "bg-amber-50 text-amber-700 border-amber-200/80 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800/40",
  },
  partial: {
    label: "Partial",
    color: "bg-amber-50 text-amber-700 border-amber-200/80 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800/40",
  },
  partially_paid: {
    label: "Partial",
    color: "bg-amber-50 text-amber-700 border-amber-200/80 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800/40",
  },
  completed: {
    label: "Completed",
    color: "bg-emerald-50 text-emerald-700 border-emerald-200/80 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800/40",
  },
  in_progress: {
    label: "In Progress",
    color: "bg-blue-50 text-blue-700 border-blue-200/80 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-800/40",
  },
  waiting: {
    label: "Waiting",
    color: "bg-purple-50 text-purple-700 border-purple-200/80 dark:bg-purple-950/40 dark:text-purple-400 dark:border-purple-800/40",
  },
  cancelled: {
    label: "Cancelled",
    color: "bg-rose-50 text-rose-700 border-rose-200/80 dark:bg-rose-950/40 dark:text-rose-400 dark:border-rose-800/40",
  },
  suspended: {
    label: "Suspended",
    color: "bg-slate-100 text-slate-700 border-slate-200/80 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700",
  },
  new: {
    label: "New",
    color: "bg-blue-50 text-blue-700 border-blue-200/80 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-800/40",
  },
  credit: {
    label: "Credit",
    color: "bg-rose-50 text-rose-700 border-rose-200/80 dark:bg-rose-950/40 dark:text-rose-400 dark:border-rose-800/40",
  },
  unpaid: {
    label: "Unpaid",
    color: "bg-rose-50 text-rose-700 border-rose-200/80 dark:bg-rose-950/40 dark:text-rose-400 dark:border-rose-800/40",
  },
};

export function StatusBadge({ status, type, className }: StatusBadgeProps) {
  const normStatus = (status || "").toLowerCase().replace(/\s+/g, "_");
  let config = STATUS_STYLE_MAP[normStatus];

  if (!config && type) {
    if (type === "job_card") {
      const match = JOB_CARD_STATUSES.find((s) => s.value === status);
      if (match) config = { label: match.label, color: match.color };
    } else if (type === "payment") {
      const match = PAYMENT_STATUSES.find((s) => s.value === status);
      if (match) config = { label: match.label, color: match.color };
    } else if (type === "purchase") {
      const match = PURCHASE_PAYMENT_STATUSES.find((s) => s.value === status);
      if (match) config = { label: match.label, color: match.color };
    }
  }

  const label = config?.label || status?.replace(/_/g, " ")?.replace(/\b\w/g, (c) => c.toUpperCase()) || "—";
  const color = config?.color || "bg-slate-100 text-slate-700 border-slate-200/80 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700";

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-[6px] border px-2 py-0.5 text-[11px] font-semibold tracking-normal transition-colors select-none",
        color,
        className
      )}
    >
      {label}
    </span>
  );
}
