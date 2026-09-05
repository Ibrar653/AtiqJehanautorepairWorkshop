"use client";

import { cn } from "@/lib/utils";
import type { JobCardStatus, PaymentStatus, PurchasePaymentStatus } from "@/types/database";
import { JOB_CARD_STATUSES, PAYMENT_STATUSES, PURCHASE_PAYMENT_STATUSES } from "@/lib/constants";

interface StatusBadgeProps {
  status: string;
  type: "job_card" | "payment" | "purchase";
  className?: string;
}

export function StatusBadge({ status, type, className }: StatusBadgeProps) {
  let config: { label: string; color: string } | undefined;

  if (type === "job_card") {
    config = JOB_CARD_STATUSES.find((s) => s.value === status);
  } else if (type === "payment") {
    config = PAYMENT_STATUSES.find((s) => s.value === status);
  } else if (type === "purchase") {
    config = PURCHASE_PAYMENT_STATUSES.find((s) => s.value === status);
  }

  if (!config) {
    return <span className="text-xs text-muted-foreground">{status}</span>;
  }

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-[6px] px-2 py-0.5 text-[11px] font-semibold tracking-wide border border-transparent/10",
        config.color,
        className
      )}
    >
      {config.label}
    </span>
  );
}
