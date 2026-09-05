"use client";

import { useState } from "react";
import type { DashboardPeriod } from "@/lib/services/dashboard-service";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar, Filter, Check } from "lucide-react";

interface DashboardDateFilterProps {
  currentPeriod: DashboardPeriod;
  customStartDate: string;
  customEndDate: string;
  onPeriodChange: (period: DashboardPeriod) => void;
  onCustomRangeApply: (startDate: string, endDate: string) => void;
}

const PERIOD_OPTIONS: { value: DashboardPeriod; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "this_week", label: "This Week" },
  { value: "this_month", label: "This Month" },
  { value: "last_month", label: "Last Month" },
  { value: "this_year", label: "This Year" },
  { value: "custom", label: "Custom Range" },
];

export function DashboardDateFilter({
  currentPeriod,
  customStartDate,
  customEndDate,
  onPeriodChange,
  onCustomRangeApply,
}: DashboardDateFilterProps) {
  const [showCustomInputs, setShowCustomInputs] = useState(currentPeriod === "custom");
  const [from, setFrom] = useState(customStartDate || new Date().toISOString().slice(0, 10));
  const [to, setTo] = useState(customEndDate || new Date().toISOString().slice(0, 10));

  const handleSelectPeriod = (p: DashboardPeriod) => {
    if (p === "custom") {
      setShowCustomInputs(true);
      onPeriodChange("custom");
    } else {
      setShowCustomInputs(false);
      onPeriodChange(p);
    }
  };

  const handleApplyCustom = (e: React.FormEvent) => {
    e.preventDefault();
    if (from && to) {
      onCustomRangeApply(from, to);
    }
  };

  return (
    <div className="space-y-3">
      <div className="inline-flex flex-wrap items-center gap-1 p-1 bg-muted/60 rounded-lg border border-border">
        <div className="flex items-center gap-1.5 px-2.5 text-caption font-semibold text-muted-foreground">
          <Calendar className="h-3.5 w-3.5 text-primary" />
          <span className="hidden sm:inline">Period:</span>
        </div>

        {PERIOD_OPTIONS.map((opt) => {
          const isActive = currentPeriod === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => handleSelectPeriod(opt.value)}
              className={`h-7 px-2.5 text-caption font-medium rounded-md transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-1 ${
                isActive
                  ? "bg-card text-foreground shadow-xs font-semibold border border-border/60"
                  : "text-muted-foreground hover:text-foreground hover:bg-card/40"
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>

      {showCustomInputs && (
        <form
          onSubmit={handleApplyCustom}
          className="flex flex-wrap items-end gap-3 p-3 bg-card rounded-[10px] border border-border shadow-xs animate-in fade-in-50 duration-150"
        >
          <div className="space-y-1">
            <Label htmlFor="df-from" className="text-caption font-medium text-foreground">
              From Date
            </Label>
            <Input
              id="df-from"
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              required
              className="h-8 text-xs w-36 bg-background rounded-lg border-border tabular-nums"
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="df-to" className="text-caption font-medium text-foreground">
              To Date
            </Label>
            <Input
              id="df-to"
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              required
              className="h-8 text-xs w-36 bg-background rounded-lg border-border tabular-nums"
            />
          </div>

          <Button type="submit" size="sm" className="h-8 text-xs font-medium gap-1.5 rounded-lg">
            <Check className="h-3.5 w-3.5" /> Apply Range
          </Button>
        </form>
      )}
    </div>
  );
}
