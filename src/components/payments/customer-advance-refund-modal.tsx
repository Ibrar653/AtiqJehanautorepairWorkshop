"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AlertCircle, CheckCircle2, RotateCcw } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { postCustomerAdvanceRefundLedger } from "@/lib/services/ledger-service";

interface CustomerAdvanceRefundModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: any | null;
  onSuccess: (updatedOrder: any) => void;
}

export function CustomerAdvanceRefundModal({
  open,
  onOpenChange,
  order,
  onSuccess,
}: CustomerAdvanceRefundModalProps) {
  const [refundAmount, setRefundAmount] = useState<number | "">("");
  const [refundMethod, setRefundMethod] = useState<string>("cash");
  const [refundReason, setRefundReason] = useState("");
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!order) return null;

  const maxRefund = Number(order.remaining_amount !== undefined ? order.remaining_amount : order.advance_amount || 0);

  const handleRefund = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = Number(refundAmount);
    if (!amt || amt <= 0) {
      setError("Please enter a valid refund amount greater than 0.");
      return;
    }
    if (amt > maxRefund) {
      setError(`Refund amount cannot exceed remaining balance of ${formatCurrency(maxRefund)}.`);
      return;
    }

    setProcessing(true);
    setError(null);

    try {
      // Sync to double-entry ledger
      try {
        await postCustomerAdvanceRefundLedger({
          id: order.id,
          advance_number: order.order_number || order.id,
          customer_name: order.customer_name,
          amount: amt,
          payment_method: refundMethod,
          date: new Date().toISOString().slice(0, 10),
          created_by: "Cashier",
        });
      } catch (ledgerErr) {
        console.warn("Ledger posting warning for refund:", ledgerErr);
      }

      const updated = {
        ...order,
        remaining_amount: Math.max(0, maxRefund - amt),
        status: amt >= maxRefund ? "refunded" : "partially_used",
        refund_amount: (Number(order.refund_amount) || 0) + amt,
        refund_notes: refundReason,
      };

      onSuccess(updated);
      onOpenChange(false);
    } catch (err: any) {
      setError(err.message || "Failed to process refund.");
    } finally {
      setProcessing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md bg-background text-foreground">
        <DialogHeader className="border-b pb-3">
          <DialogTitle className="flex items-center gap-2 text-base font-bold text-foreground">
            <RotateCcw className="h-5 w-5 text-rose-600 shrink-0" />
            Refund Customer Advance
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Refund unused customer deposit for Order #{order.order_number || order.id}.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleRefund} className="space-y-4 pt-1">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs font-semibold text-rose-700 flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-border/80 text-xs grid grid-cols-2 gap-2">
            <div>
              <span className="text-muted-foreground block text-[10px] uppercase font-bold">Customer:</span>
              <span className="font-bold text-foreground">{order.customer_name || "Customer"}</span>
            </div>
            <div>
              <span className="text-muted-foreground block text-[10px] uppercase font-bold">Available to Refund:</span>
              <span className="font-mono font-bold text-emerald-600 text-sm">{formatCurrency(maxRefund)}</span>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Refund Amount (AED) *</Label>
            <Input
              type="number"
              min="0.01"
              max={maxRefund}
              step="0.01"
              required
              value={refundAmount}
              onChange={(e) => setRefundAmount(e.target.value === "" ? "" : Number(e.target.value))}
              placeholder={`Max: ${maxRefund}`}
              className="font-mono font-bold text-sm h-9"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Refund Payment Method *</Label>
            <select
              value={refundMethod}
              onChange={(e) => setRefundMethod(e.target.value)}
              className="w-full h-9 px-3 text-xs rounded-lg border border-border/80 bg-background font-medium focus:outline-none focus:ring-1 focus:ring-primary shadow-2xs"
            >
              <option value="cash">Cash Outflow</option>
              <option value="bank">Bank Transfer</option>
              <option value="card">Card Reversal</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Reason for Refund</Label>
            <Textarea
              value={refundReason}
              onChange={(e) => setRefundReason(e.target.value)}
              placeholder="e.g. Job cancelled or customer deposit returned..."
              className="text-xs h-18 resize-none"
            />
          </div>

          <DialogFooter className="pt-3 border-t flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              className="h-8 text-xs font-medium border-border/80"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={processing || maxRefund <= 0}
              className="h-8 text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white shadow-xs"
            >
              {processing ? "Processing..." : "Confirm Refund"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
