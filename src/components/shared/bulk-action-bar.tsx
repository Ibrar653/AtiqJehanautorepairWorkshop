"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { Trash2, X, CheckSquare } from "lucide-react";

export interface BulkActionItem {
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  variant?: "default" | "outline" | "secondary" | "destructive";
  className?: string;
}

export interface BulkActionBarProps {
  selectedCount: number;
  totalVisibleCount?: number;
  onDeleteSelected?: () => void;
  deleteLabel?: string;
  onClearSelection: () => void;
  customActions?: BulkActionItem[];
  isDeleting?: boolean;
}

export function BulkActionBar({
  selectedCount,
  onDeleteSelected,
  deleteLabel = "Delete Selected",
  onClearSelection,
  customActions,
  isDeleting = false,
}: BulkActionBarProps) {
  if (selectedCount === 0) return null;

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 animate-in fade-in slide-in-from-bottom-5 duration-200">
      <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 shadow-2xl backdrop-blur-md">
        {/* Count Badge */}
        <div className="flex items-center gap-2 pr-3 border-r border-slate-200 dark:border-slate-800">
          <span className="flex items-center justify-center h-6 min-w-6 px-1.5 rounded-full text-xs font-bold bg-blue-600 text-white font-mono shadow-xs">
            {selectedCount}
          </span>
          <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
            Selected
          </span>
        </div>

        {/* Custom Actions (e.g. Restore, Suspend) */}
        {customActions?.map((action, idx) => (
          <Button
            key={idx}
            size="sm"
            variant={action.variant || "outline"}
            onClick={action.onClick}
            disabled={isDeleting}
            className={`h-8 text-xs font-semibold gap-1.5 shadow-xs ${action.className || ""}`}
          >
            {action.icon}
            {action.label}
          </Button>
        ))}

        {/* Primary Delete Selected Action */}
        {onDeleteSelected && (
          <Button
            size="sm"
            variant="destructive"
            onClick={onDeleteSelected}
            disabled={isDeleting}
            className="h-8 text-xs font-bold gap-1.5 bg-rose-600 hover:bg-rose-700 text-white shadow-xs"
          >
            <Trash2 className="h-3.5 w-3.5" />
            {deleteLabel}
          </Button>
        )}

        {/* Clear Selection */}
        <Button
          size="sm"
          variant="ghost"
          onClick={onClearSelection}
          disabled={isDeleting}
          className="h-8 text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 gap-1 px-2"
          title="Deselect all records"
        >
          <X className="h-3.5 w-3.5" />
          Clear
        </Button>
      </div>
    </div>
  );
}
