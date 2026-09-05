"use client";

import React, { useState, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AlertTriangle, Loader2, ShieldAlert, Trash2 } from "lucide-react";

export interface ForceDeleteInvoiceModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoices: any[];
  onConfirmForceDelete: () => Promise<void>;
  isDeleting?: boolean;
}

export function ForceDeleteInvoiceModal({
  open,
  onOpenChange,
  invoices,
  onConfirmForceDelete,
  isDeleting = false,
}: ForceDeleteInvoiceModalProps) {
  const [confirmText, setConfirmText] = useState("");

  const isSingle = invoices.length === 1;
  const singleInvoice = invoices[0];

  const totalPaymentAmount = useMemo(() => {
    return invoices.reduce((sum, inv) => {
      const paid = Number(inv.paid) || 0;
      return sum + paid;
    }, 0);
  }, [invoices]);

  const invoiceNumbersText = useMemo(() => {
    if (invoices.length === 0) return "";
    if (isSingle) return singleInvoice?.invoice_number || "Invoice";
    if (invoices.length <= 3) {
      return invoices.map((i) => `#${i.invoice_number}`).join(", ");
    }
    return `${invoices.slice(0, 3).map((i) => `#${i.invoice_number}`).join(", ")} and ${invoices.length - 3} more`;
  }, [invoices, isSingle, singleInvoice]);

  const isConfirmed = confirmText.trim().toUpperCase() === "DELETE";

  const handleClose = () => {
    setConfirmText("");
    onOpenChange(false);
  };

  const handleConfirm = async () => {
    if (!isConfirmed || isDeleting) return;
    await onConfirmForceDelete();
    setConfirmText("");
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md border-rose-200 dark:border-rose-900 shadow-2xl">
        <DialogHeader className="space-y-2">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center h-10 w-10 rounded-full bg-rose-100 text-rose-600 dark:bg-rose-950/60 dark:text-rose-400 shrink-0">
              <ShieldAlert className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-base font-bold text-rose-600 dark:text-rose-400">
                {isSingle
                  ? "PERMANENTLY DELETE TEST INVOICE?"
                  : `PERMANENTLY DELETE ${invoices.length} TEST INVOICES?`}
              </DialogTitle>
              <DialogDescription className="text-xs text-rose-700/80 dark:text-rose-300/80 font-semibold">
                Owner / Super Admin Force Cleanup Mode
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Target Invoice & Payment Details */}
          <div className="p-3.5 rounded-lg border border-rose-200 bg-rose-50/70 dark:bg-rose-950/30 dark:border-rose-900/50 space-y-2 text-xs">
            <div className="flex justify-between items-center pb-1.5 border-b border-rose-200 dark:border-rose-900/50">
              <span className="text-rose-800 dark:text-rose-300 font-semibold">
                {isSingle ? "Invoice:" : "Selected Invoices:"}
              </span>
              <span className="font-mono font-bold text-rose-900 dark:text-rose-100">
                {isSingle ? `#${invoiceNumbersText}` : invoiceNumbersText}
              </span>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-rose-800 dark:text-rose-300 font-semibold">
                {isSingle ? "Payment:" : "Total Linked Payments:"}
              </span>
              <span className="font-mono font-bold text-rose-900 dark:text-rose-100">
                AED {totalPaymentAmount.toFixed(2)}
              </span>
            </div>
          </div>

          {/* Explicit Caution Warning */}
          <div className="p-3 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-900/50 text-amber-900 dark:text-amber-200 text-xs flex items-start gap-2.5">
            <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-bold">Warning:</p>
              <p className="leading-relaxed">
                This will permanently remove this test invoice and its linked test financial records.
              </p>
              <p className="text-[11px] text-amber-800/80 dark:text-amber-300/80">
                All associated payments, ledger journal entries, line items, and document references will be eradicated. Customer outstanding and cash balances will be recalculated.
              </p>
            </div>
          </div>

          {/* Typing confirmation requirement */}
          <div className="space-y-1.5 pt-1">
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              Type <span className="font-mono font-bold text-rose-600 dark:text-rose-400">DELETE</span> to confirm:
            </label>
            <Input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="Type DELETE"
              className="font-mono text-sm uppercase tracking-wider border-rose-300 focus:ring-rose-500"
              autoFocus
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0 pt-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleClose}
            disabled={isDeleting}
            className="text-xs h-9"
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={handleConfirm}
            disabled={!isConfirmed || isDeleting}
            className="text-xs h-9 font-bold bg-rose-600 hover:bg-rose-700 text-white gap-1.5 shadow-sm"
          >
            {isDeleting ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Removing Test Records...
              </>
            ) : (
              <>
                <Trash2 className="h-3.5 w-3.5" />
                Permanently Delete
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
