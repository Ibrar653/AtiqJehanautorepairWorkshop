"use client";

import React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Ban, Loader2, Trash2 } from "lucide-react";

export interface RecordDeleteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recordType: string;
  recordTypePlural?: string;
  recordCount: number;
  singleRecordIdentifier?: string;
  isFinancialBlocked?: boolean;
  financialBlockMessage?: string;
  onVoidInstead?: () => void;
  voidButtonLabel?: string;
  isOwner?: boolean;
  onForceDeleteTest?: () => void;
  forceDeleteButtonLabel?: string;
  onConfirmDelete: () => Promise<void> | void;
  isDeleting?: boolean;
}

export function RecordDeleteDialog({
  open,
  onOpenChange,
  recordType,
  recordTypePlural,
  recordCount,
  singleRecordIdentifier,
  isFinancialBlocked = false,
  financialBlockMessage,
  onVoidInstead,
  voidButtonLabel = "Void Invoice",
  isOwner = false,
  onForceDeleteTest,
  forceDeleteButtonLabel = "Force Delete Test Invoice",
  onConfirmDelete,
  isDeleting = false,
}: RecordDeleteDialogProps) {

  const plural = recordTypePlural || `${recordType}s`;
  const isSingle = recordCount <= 1;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md sm:max-w-lg bg-card border border-border shadow-md rounded-[10px] p-6">
        <DialogHeader className="space-y-2">
          <div className="flex items-center gap-3">
            <div
              className={`flex items-center justify-center h-8 w-8 rounded-lg shrink-0 ${
                isFinancialBlocked
                  ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                  : "bg-red-500/10 text-red-600 dark:text-red-400"
              }`}
            >
              {isFinancialBlocked ? (
                <AlertTriangle className="h-4 w-4" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
            </div>
            <div>
              <DialogTitle className="text-section font-semibold text-foreground">
                {isFinancialBlocked
                  ? "FINANCIAL RECORD PROTECTED"
                  : isSingle
                  ? `DELETE ${recordType.toUpperCase()}?`
                  : `DELETE ${recordCount} SELECTED ${plural.toUpperCase()}?`}
              </DialogTitle>
              <DialogDescription className="text-caption text-muted-foreground">
                {isFinancialBlocked
                  ? "Cannot perform direct permanent or soft deletion on financial items."
                  : isSingle
                  ? "Confirm removing this record from active operations."
                  : "Confirm removing all selected records from active operations."}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="py-3 text-sm space-y-3">
          {isFinancialBlocked ? (
            <div className="p-3.5 rounded-lg border border-amber-500/20 bg-amber-500/[0.06] text-amber-700 dark:text-amber-300 space-y-2 text-caption leading-relaxed">
              <p className="font-semibold flex items-center gap-1.5">
                <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
                Protected Accounting Posting
              </p>
              <p>
                {financialBlockMessage ||
                  "This record has financial transactions and cannot be deleted directly."}
              </p>
              <p className="text-[11px] text-amber-700/80 dark:text-amber-300/80">
                To cancel this document without violating financial ledger balance, use the official Void / Reverse procedure.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {isSingle && singleRecordIdentifier && (
                <div className="px-3 py-2 rounded-md bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 font-mono text-xs text-slate-800 dark:text-slate-200 font-bold">
                  {recordType}: {singleRecordIdentifier}
                </div>
              )}
              <p className="text-slate-600 dark:text-slate-400 text-xs">
                {isSingle
                  ? "This record will be moved to the Recycle Bin. You can restore it anytime or permanently delete it later."
                  : `You are about to remove ${recordCount} selected ${plural.toLowerCase()}. They will be moved to the Recycle Bin.`}
              </p>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={isDeleting}
            className="text-xs h-9"
          >
            Cancel
          </Button>

          {isFinancialBlocked ? (
            <div className="flex flex-wrap items-center gap-2 justify-end">
              {onVoidInstead && (
                <Button
                  type="button"
                  size="sm"
                  onClick={() => {
                    onOpenChange(false);
                    onVoidInstead();
                  }}
                  className="text-xs h-9 bg-amber-600 hover:bg-amber-700 text-white font-semibold gap-1.5"
                >
                  <Ban className="h-3.5 w-3.5" />
                  {voidButtonLabel}
                </Button>
              )}
              {isOwner && onForceDeleteTest && (
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  onClick={() => {
                    onOpenChange(false);
                    onForceDeleteTest();
                  }}
                  className="text-xs h-9 bg-rose-600 hover:bg-rose-700 text-white font-bold gap-1.5 shadow-sm"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  {forceDeleteButtonLabel}
                </Button>
              )}
            </div>
          ) : (

            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={onConfirmDelete}
              disabled={isDeleting}
              className="text-xs h-9 font-bold bg-rose-600 hover:bg-rose-700 text-white gap-1.5 shadow-xs"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Removing...
                </>
              ) : (
                <>
                  <Trash2 className="h-3.5 w-3.5" />
                  {isSingle ? "Delete" : `Delete ${recordCount} ${plural}`}
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
