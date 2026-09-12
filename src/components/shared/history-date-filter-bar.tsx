"use client";

import { useState } from "react";
import {
  HISTORY_DATE_FILTER_OPTIONS,
  type HistoryDateFilterPreset,
} from "@/lib/date-filters";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar, Filter, X } from "lucide-react";

interface HistoryDateFilterBarProps {
  preset: HistoryDateFilterPreset;
  onPresetChange: (preset: HistoryDateFilterPreset) => void;
  fromDate: string;
  toDate: string;
  onCustomRangeApply: (from: string, to: string) => void;
  onClear: () => void;
  className?: string;
}

export function HistoryDateFilterBar({
  preset,
  onPresetChange,
  fromDate,
  toDate,
  onCustomRangeApply,
  onClear,
  className = "",
}: HistoryDateFilterBarProps) {
  const [localFrom, setLocalFrom] = useState(fromDate || "");
  const [localTo, setLocalTo] = useState(toDate || "");

  const handleApply = () => {
    onCustomRangeApply(localFrom, localTo);
  };

  const handleClear = () => {
    setLocalFrom("");
    setLocalTo("");
    onClear();
  };

  return (
    <div className={`space-y-2.5 ${className}`}>
      {/* Quick Filter Chips */}
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1 mr-1">
          <Calendar className="h-3.5 w-3.5 text-primary" /> Period:
        </span>
        {HISTORY_DATE_FILTER_OPTIONS.map((opt) => {
          const isActive = preset === opt.key;
          return (
            <button
              key={opt.key}
              type="button"
              onClick={() => {
                onPresetChange(opt.key);
                if (opt.key !== "custom") {
                  setLocalFrom("");
                  setLocalTo("");
                }
              }}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                isActive
                  ? "bg-slate-900 text-white shadow-2xs dark:bg-blue-600"
                  : "bg-slate-100 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>

      {/* Custom Range Picker Drawer */}
      {preset === "custom" && (
        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700/80 flex flex-wrap items-end gap-3 text-xs animate-in fade-in-50 duration-150">
          <div className="space-y-1">
            <Label htmlFor="hist-from-date" className="text-[11px] font-bold text-slate-600 dark:text-slate-300">
              From Date
            </Label>
            <Input
              id="hist-from-date"
              type="date"
              value={localFrom}
              onChange={(e) => setLocalFrom(e.target.value)}
              className="h-8 text-xs font-mono bg-white dark:bg-slate-900 w-36"
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="hist-to-date" className="text-[11px] font-bold text-slate-600 dark:text-slate-300">
              To Date (Inclusive)
            </Label>
            <Input
              id="hist-to-date"
              type="date"
              value={localTo}
              onChange={(e) => setLocalTo(e.target.value)}
              className="h-8 text-xs font-mono bg-white dark:bg-slate-900 w-36"
            />
          </div>

          <div className="flex items-center gap-1.5">
            <Button
              type="button"
              size="sm"
              onClick={handleApply}
              disabled={!localFrom && !localTo}
              className="h-8 px-3 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white"
            >
              <Filter className="h-3 w-3 mr-1" /> Apply
            </Button>

            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={handleClear}
              className="h-8 px-2.5 text-xs text-slate-600 dark:text-slate-400"
            >
              <X className="h-3 w-3 mr-1" /> Clear
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
