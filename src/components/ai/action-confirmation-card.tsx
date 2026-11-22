"use client";

import React, { useState } from "react";
import {
  AlertTriangle,
  Car,
  CheckCircle2,
  Edit3,
  FileText,
  Loader2,
  Plus,
  Receipt,
  ShieldCheck,
  Trash2,
  UserCheck,
  UserPlus,
  Wrench,
  X,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { calculateTotal, cn, formatCurrency } from "@/lib/utils";
import type { ActionConfirmationPayload, PlannedLineItem } from "@/lib/ai/types";

interface ActionConfirmationCardProps {
  payload: ActionConfirmationPayload;
  status: "pending" | "confirmed" | "cancelled" | "executed" | "failed";
  executing?: boolean;
  onConfirm: (updatedPayload: ActionConfirmationPayload) => void;
  onCancel: () => void;
}

function createFreshIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `wf-${crypto.randomUUID()}`;
  }
  return `wf-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function recalculatePayload(draft: ActionConfirmationPayload): ActionConfirmationPayload {
  const recalculatedItems: PlannedLineItem[] = draft.items.map((item) => {
    const qty = Math.max(0.01, Number(item.quantity) || 1);
    const unitPrice = Math.max(0, Number(item.unit_price) || 0);
    const labour = Math.max(0, Number(item.labour_charge) || 0);
    const totalPrice = Number((qty * unitPrice + labour).toFixed(2));
    return {
      ...item,
      quantity: qty,
      unit_price: unitPrice,
      labour_charge: labour,
      total_price: totalPrice,
    };
  });

  const subtotal = Number(
    recalculatedItems.reduce((sum, it) => sum + it.total_price, 0).toFixed(2)
  );
  const discount = Math.max(0, Math.min(subtotal, Number(draft.financials.discount) || 0));
  const vatRate = Math.max(0, Math.min(100, Number(draft.financials.vat_rate) || 0));
  const totals = calculateTotal(subtotal, discount, vatRate);

  return {
    ...draft,
    items: recalculatedItems,
    financials: {
      subtotal,
      discount,
      discount_type: "fixed",
      taxable_amount: totals.discountedSubtotal,
      vat_rate: vatRate,
      vat_amount: totals.vatAmount,
      grand_total: totals.total,
    },
  };
}

export function ActionConfirmationCard({
  payload,
  status,
  executing = false,
  onConfirm,
  onCancel,
}: ActionConfirmationCardProps) {
  const [draft, setDraft] = useState<ActionConfirmationPayload>(() => recalculatePayload(payload));
  const [isEditing, setIsEditing] = useState(false);

  const isLocked = status !== "pending" || executing;

  const updateDraft = (updater: (prev: ActionConfirmationPayload) => ActionConfirmationPayload) => {
    setDraft((prev) => recalculatePayload(updater(prev)));
  };

  const handleSelectDuplicateCustomer = (dup: { id: string; name: string; mobile?: string | null }) => {
    updateDraft((prev) => ({
      ...prev,
      idempotency_key: createFreshIdempotencyKey(),
      customer: {
        ...prev.customer,
        existing_id: dup.id,
        name: dup.name,
        mobile: dup.mobile || prev.customer.mobile,
        will_create: false,
      },
    }));
  };

  const handleSwitchToNewCustomer = () => {
    updateDraft((prev) => ({
      ...prev,
      idempotency_key: createFreshIdempotencyKey(),
      customer: {
        ...prev.customer,
        existing_id: null,
        will_create: true,
      },
    }));
  };

  const handleConfirmClick = () => {
    const finalPayload = recalculatePayload(draft);
    onConfirm(finalPayload);
  };

  const statusBadge = {
    pending: {
      label: "Awaiting Confirmation",
      className: "bg-amber-100/90 text-amber-800 border-amber-300 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-700/60",
    },
    confirmed: {
      label: "Executing Workflow",
      className: "bg-blue-100/90 text-blue-800 border-blue-300 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-700/60",
    },
    executed: {
      label: "Executed Successfully",
      className: "bg-emerald-100/90 text-emerald-800 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-700/60",
    },
    cancelled: {
      label: "Cancelled",
      className: "bg-slate-100 text-slate-600 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700",
    },
    failed: {
      label: "Execution Failed",
      className: "bg-red-100/90 text-red-700 border-red-300 dark:bg-red-950/60 dark:text-red-300 dark:border-red-700/60",
    },
  }[status];

  const hasDuplicates =
    draft.customer.will_create &&
    Array.isArray(draft.customer.possible_duplicates) &&
    draft.customer.possible_duplicates.length > 0;

  return (
    <div className="mt-3 rounded-2xl border border-indigo-200/80 dark:border-indigo-700/50 bg-white/90 dark:bg-[#101C34]/95 shadow-[var(--glass-shadow-md)] overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 bg-gradient-to-r from-[#7C3AED]/10 via-[#007BFF]/10 to-[#00C8F8]/10 border-b border-indigo-100 dark:border-indigo-800/60 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-[#6338F5] to-[#007BFF] text-white flex items-center justify-center shrink-0 shadow-xs">
            <ShieldCheck className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-wider text-[#4F46E5] dark:text-sky-400">
              Workflow Confirmation Preview
            </p>
            <h4 className="text-[13.5px] font-bold text-[#101D36] dark:text-slate-100 truncate">
              {draft.summary_title}
            </h4>
          </div>
        </div>

        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold shrink-0",
            statusBadge.className
          )}
        >
          {status === "executed" && <CheckCircle2 className="h-3 w-3" />}
          {status === "cancelled" && <XCircle className="h-3 w-3" />}
          {executing && <Loader2 className="h-3 w-3 animate-spin" />}
          {statusBadge.label}
        </span>
      </div>

      {/* Body */}
      <div className="p-4 space-y-4 text-[13px]">
        {/* Duplicate Customer Warning Banner */}
        {hasDuplicates && status === "pending" && (
          <div className="rounded-xl border border-amber-300/90 bg-amber-50/90 dark:bg-amber-950/40 dark:border-amber-700/60 p-3 space-y-2">
            <div className="flex items-start gap-2 text-amber-900 dark:text-amber-200">
              <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div className="text-xs leading-relaxed">
                <p className="font-bold">Possible Existing Customer Found</p>
                <p>
                  To prevent accidental duplicate records, select an existing customer below or keep
                  creating a new profile.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              {draft.customer.possible_duplicates?.map((dup) => (
                <button
                  key={dup.id}
                  type="button"
                  onClick={() => handleSelectDuplicateCustomer(dup)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-white dark:bg-slate-900 border border-amber-300 dark:border-amber-700 px-2.5 py-1 text-xs font-semibold text-[#101D36] dark:text-slate-100 hover:border-[#007BFF] hover:text-[#007BFF] cursor-pointer transition-colors"
                >
                  <UserCheck className="h-3.5 w-3.5 text-emerald-600" />
                  Use Existing: {dup.name}
                  {dup.mobile ? ` (${dup.mobile})` : ""}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Warnings from server planner */}
        {draft.warnings && draft.warnings.length > 0 && (
          <div className="rounded-xl border border-blue-200/80 bg-blue-50/70 dark:bg-blue-950/30 dark:border-blue-800/60 px-3 py-2 text-xs text-blue-900 dark:text-blue-200 space-y-1">
            {draft.warnings.map((w, i) => (
              <p key={i} className="flex items-start gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
                <span>{w}</span>
              </p>
            ))}
          </div>
        )}

        {/* Customer & Vehicle Summary Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Customer Box */}
          <div className="rounded-xl border border-[#D7E4F3] dark:border-[#24385A] bg-[#F7FBFF] dark:bg-[#14223B]/70 p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-[#52657F] dark:text-slate-400">
                {draft.customer.will_create ? (
                  <UserPlus className="h-3.5 w-3.5 text-indigo-600 dark:text-sky-400" />
                ) : (
                  <UserCheck className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                )}
                Customer
              </span>
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase",
                  draft.customer.will_create
                    ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-950/70 dark:text-indigo-300"
                    : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/70 dark:text-emerald-300"
                )}
              >
                {draft.customer.will_create ? "New Record" : "Existing Match"}
              </span>
            </div>

            {isEditing && !isLocked ? (
              <div className="space-y-2">
                <Input
                  value={draft.customer.name}
                  onChange={(e) =>
                    updateDraft((prev) => ({
                      ...prev,
                      idempotency_key: createFreshIdempotencyKey(),
                      customer: { ...prev.customer, name: e.target.value },
                    }))
                  }
                  placeholder="Customer Name"
                  className="h-8 text-xs"
                />
                <Input
                  value={draft.customer.mobile || ""}
                  onChange={(e) =>
                    updateDraft((prev) => ({
                      ...prev,
                      idempotency_key: createFreshIdempotencyKey(),
                      customer: { ...prev.customer, mobile: e.target.value },
                    }))
                  }
                  placeholder="Mobile Number"
                  className="h-8 text-xs"
                />
                {!draft.customer.will_create && (
                  <button
                    type="button"
                    onClick={handleSwitchToNewCustomer}
                    className="text-[11px] font-semibold text-[#007BFF] hover:underline cursor-pointer"
                  >
                    Create as brand-new customer instead
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-0.5">
                <p className="font-bold text-[#101D36] dark:text-slate-100">
                  {draft.customer.name}
                </p>
                {draft.customer.mobile && (
                  <p className="text-xs text-[#52657F] dark:text-slate-300">
                    Mobile: {draft.customer.mobile}
                  </p>
                )}
                {draft.customer.company_name && (
                  <p className="text-xs text-[#52657F] dark:text-slate-300">
                    Company: {draft.customer.company_name}
                  </p>
                )}
                {draft.customer.trn_number && (
                  <p className="text-xs text-[#52657F] dark:text-slate-300">
                    TRN: {draft.customer.trn_number}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Vehicle Box */}
          {draft.vehicle && (
            <div className="rounded-xl border border-[#D7E4F3] dark:border-[#24385A] bg-[#F7FBFF] dark:bg-[#14223B]/70 p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-[#52657F] dark:text-slate-400">
                  <Car className="h-3.5 w-3.5 text-[#007BFF] dark:text-sky-400" />
                  Vehicle
                </span>
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase",
                    draft.vehicle.will_create
                      ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-950/70 dark:text-indigo-300"
                      : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/70 dark:text-emerald-300"
                  )}
                >
                  {draft.vehicle.will_create ? "New Vehicle" : "Existing Match"}
                </span>
              </div>

              {isEditing && !isLocked ? (
                <div className="grid grid-cols-2 gap-1.5">
                  <Input
                    value={draft.vehicle.make}
                    onChange={(e) =>
                      updateDraft((prev) => ({
                        ...prev,
                        idempotency_key: createFreshIdempotencyKey(),
                        vehicle: prev.vehicle
                          ? { ...prev.vehicle, make: e.target.value }
                          : null,
                      }))
                    }
                    placeholder="Make"
                    className="h-8 text-xs"
                  />
                  <Input
                    value={draft.vehicle.model}
                    onChange={(e) =>
                      updateDraft((prev) => ({
                        ...prev,
                        idempotency_key: createFreshIdempotencyKey(),
                        vehicle: prev.vehicle
                          ? { ...prev.vehicle, model: e.target.value }
                          : null,
                      }))
                    }
                    placeholder="Model"
                    className="h-8 text-xs"
                  />
                  <Input
                    value={draft.vehicle.registration_number || ""}
                    onChange={(e) =>
                      updateDraft((prev) => ({
                        ...prev,
                        idempotency_key: createFreshIdempotencyKey(),
                        vehicle: prev.vehicle
                          ? { ...prev.vehicle, registration_number: e.target.value }
                          : null,
                      }))
                    }
                    placeholder="Plate Number"
                    className="h-8 text-xs"
                  />
                  <Input
                    type="number"
                    value={draft.vehicle.year ?? ""}
                    onChange={(e) =>
                      updateDraft((prev) => ({
                        ...prev,
                        idempotency_key: createFreshIdempotencyKey(),
                        vehicle: prev.vehicle
                          ? {
                              ...prev.vehicle,
                              year: e.target.value ? Number(e.target.value) : null,
                            }
                          : null,
                      }))
                    }
                    placeholder="Year"
                    className="h-8 text-xs"
                  />
                </div>
              ) : (
                <div className="space-y-0.5">
                  <p className="font-bold text-[#101D36] dark:text-slate-100">
                    {[draft.vehicle.make, draft.vehicle.model, draft.vehicle.year]
                      .filter(Boolean)
                      .join(" ")}
                  </p>
                  {draft.vehicle.registration_number && (
                    <p className="text-xs text-[#52657F] dark:text-slate-300">
                      Plate: <span className="font-semibold">{draft.vehicle.registration_number}</span>
                    </p>
                  )}
                  {draft.vehicle.chassis_vin && (
                    <p className="text-xs text-[#52657F] dark:text-slate-300">
                      VIN: {draft.vehicle.chassis_vin}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Line Items Table */}
        {draft.items.length > 0 && (
          <div className="rounded-xl border border-[#D7E4F3] dark:border-[#24385A] overflow-hidden">
            <div className="px-3 py-2 bg-[#EFF6FF] dark:bg-[#14223B] border-b border-[#D7E4F3] dark:border-[#24385A] flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-[#52657F] dark:text-slate-300">
                <Wrench className="h-3.5 w-3.5 text-[#007BFF]" />
                Services & Parts ({draft.items.length})
              </span>
              {isEditing && !isLocked && (
                <button
                  type="button"
                  onClick={() =>
                    updateDraft((prev) => ({
                      ...prev,
                      idempotency_key: createFreshIdempotencyKey(),
                      items: [
                        ...prev.items,
                        {
                          item_type: "service",
                          description: "Additional Service",
                          quantity: 1,
                          unit_price: 0,
                          labour_charge: 0,
                          total_price: 0,
                        },
                      ],
                    }))
                  }
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#007BFF] hover:underline cursor-pointer"
                >
                  <Plus className="h-3 w-3" /> Add Item
                </button>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-white/70 dark:bg-[#0F1B33] text-[#52657F] dark:text-slate-400 border-b border-[#E2ECF8] dark:border-[#24385A]">
                    <th className="text-left px-3 py-2 font-semibold">Item</th>
                    <th className="text-right px-2 py-2 font-semibold w-16">Qty</th>
                    <th className="text-right px-2 py-2 font-semibold w-28">Rate (AED)</th>
                    <th className="text-right px-3 py-2 font-semibold w-28">Total</th>
                    {isEditing && !isLocked && <th className="w-8 px-1" />}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E7F0FA] dark:divide-[#1E3152]">
                  {draft.items.map((item, idx) => (
                    <tr key={idx} className="bg-white/50 dark:bg-transparent">
                      <td className="px-3 py-2">
                        {isEditing && !isLocked ? (
                          <Input
                            value={item.description}
                            onChange={(e) =>
                              updateDraft((prev) => ({
                                ...prev,
                                idempotency_key: createFreshIdempotencyKey(),
                                items: prev.items.map((it, i) =>
                                  i === idx ? { ...it, description: e.target.value } : it
                                ),
                              }))
                            }
                            className="h-7 text-xs"
                          />
                        ) : (
                          <div>
                            <p className="font-semibold text-[#101D36] dark:text-slate-100">
                              {item.description}
                            </p>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <span className="text-[10px] uppercase font-bold text-[#647B97] dark:text-slate-400">
                                {item.item_type}
                              </span>
                              {item.matched_catalog_name && (
                                <span className="text-[10px] rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 px-1.5 py-0.2 border border-emerald-200/70 dark:border-emerald-800/60">
                                  Catalog Match
                                </span>
                              )}
                            </div>
                          </div>
                        )}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums">
                        {isEditing && !isLocked ? (
                          <Input
                            type="number"
                            min={1}
                            step="1"
                            value={item.quantity}
                            onChange={(e) =>
                              updateDraft((prev) => ({
                                ...prev,
                                idempotency_key: createFreshIdempotencyKey(),
                                items: prev.items.map((it, i) =>
                                  i === idx ? { ...it, quantity: Number(e.target.value) || 1 } : it
                                ),
                              }))
                            }
                            className="h-7 text-xs text-right"
                          />
                        ) : (
                          item.quantity
                        )}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums">
                        {isEditing && !isLocked ? (
                          <Input
                            type="number"
                            min={0}
                            step="0.01"
                            value={item.unit_price}
                            onChange={(e) =>
                              updateDraft((prev) => ({
                                ...prev,
                                idempotency_key: createFreshIdempotencyKey(),
                                items: prev.items.map((it, i) =>
                                  i === idx ? { ...it, unit_price: Number(e.target.value) || 0 } : it
                                ),
                              }))
                            }
                            className="h-7 text-xs text-right"
                          />
                        ) : (
                          formatCurrency(item.unit_price)
                        )}
                      </td>
                      <td className="px-3 py-2 text-right font-semibold text-[#101D36] dark:text-slate-100 tabular-nums">
                        {formatCurrency(item.total_price)}
                      </td>
                      {isEditing && !isLocked && (
                        <td className="px-1 py-2 text-center">
                          {draft.items.length > 1 && (
                            <button
                              type="button"
                              onClick={() =>
                                updateDraft((prev) => ({
                                  ...prev,
                                  idempotency_key: createFreshIdempotencyKey(),
                                  items: prev.items.filter((_, i) => i !== idx),
                                }))
                              }
                              className="p-1 text-slate-400 hover:text-red-600 cursor-pointer"
                              title="Remove item"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Financial Summary Box (Always Shows Discount & VAT) */}
        {(draft.items.length > 0 || draft.job_card?.will_create || draft.invoice?.will_create) && (
          <div className="rounded-xl border border-[#CFE0F3] dark:border-[#294066] bg-gradient-to-br from-[#F4F9FF] to-[#EAF3FF] dark:from-[#12203A] dark:to-[#0E1930] p-3.5 space-y-2">
            <div className="flex items-center justify-between text-xs text-[#52657F] dark:text-slate-300">
              <span>Subtotal</span>
              <span className="font-semibold text-[#101D36] dark:text-slate-100 tabular-nums">
                {formatCurrency(draft.financials.subtotal)}
              </span>
            </div>

            <div className="flex items-center justify-between text-xs text-[#52657F] dark:text-slate-300 gap-3">
              <span>Discount</span>
              {isEditing && !isLocked ? (
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] text-slate-400">AED</span>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={draft.financials.discount}
                    onChange={(e) =>
                      updateDraft((prev) => ({
                        ...prev,
                        idempotency_key: createFreshIdempotencyKey(),
                        financials: {
                          ...prev.financials,
                          discount: Number(e.target.value) || 0,
                        },
                      }))
                    }
                    className="h-7 w-24 text-xs text-right"
                  />
                </div>
              ) : (
                <span className="font-semibold text-rose-600 dark:text-rose-400 tabular-nums">
                  -{formatCurrency(draft.financials.discount)}
                </span>
              )}
            </div>

            <div className="flex items-center justify-between text-xs text-[#52657F] dark:text-slate-300 gap-3">
              <div className="flex items-center gap-2">
                <span>VAT ({draft.financials.vat_rate}%)</span>
                {isEditing && !isLocked && (
                  <div className="inline-flex rounded-lg border border-[#CFE0F3] dark:border-[#2C446E] overflow-hidden">
                    {[0, 5].map((rate) => (
                      <button
                        key={rate}
                        type="button"
                        onClick={() =>
                          updateDraft((prev) => ({
                            ...prev,
                            idempotency_key: createFreshIdempotencyKey(),
                            financials: { ...prev.financials, vat_rate: rate },
                          }))
                        }
                        className={cn(
                          "px-2 py-0.5 text-[11px] font-bold cursor-pointer",
                          draft.financials.vat_rate === rate
                            ? "bg-[#007BFF] text-white"
                            : "bg-white dark:bg-slate-900 text-[#52657F] dark:text-slate-300"
                        )}
                      >
                        {rate}%
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <span className="font-semibold text-[#101D36] dark:text-slate-100 tabular-nums">
                {formatCurrency(draft.financials.vat_amount)}
              </span>
            </div>

            <div className="pt-2 mt-1 border-t border-[#CFE0F3] dark:border-[#2B436B] flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-[#101D36] dark:text-slate-100">
                Grand Total
              </span>
              <span className="text-base font-extrabold text-[#0068F5] dark:text-sky-400 tabular-nums">
                {formatCurrency(draft.financials.grand_total)}
              </span>
            </div>
          </div>
        )}

        {/* Proposed Actions Checklist */}
        {draft.proposed_actions.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-[11px] font-bold uppercase tracking-wider text-[#52657F] dark:text-slate-400 flex items-center gap-1.5">
              <Receipt className="h-3.5 w-3.5 text-[#6338F5] dark:text-sky-400" />
              Exact ERP Actions To Execute
            </p>
            <ul className="space-y-1">
              {draft.proposed_actions.map((step, i) => (
                <li
                  key={i}
                  className="flex items-start gap-2 text-xs text-[#1E3256] dark:text-slate-200"
                >
                  <span className="h-4 w-4 rounded-full bg-indigo-100 dark:bg-indigo-950/70 text-[#4F46E5] dark:text-sky-300 text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                    {i + 1}
                  </span>
                  <span>{step}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Action Buttons */}
        {status === "pending" && (
          <div className="pt-2 border-t border-[#E2ECF8] dark:border-[#223556] flex flex-wrap items-center justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={executing}
              onClick={onCancel}
              className="rounded-xl text-slate-600 hover:text-red-600 hover:bg-red-50/80 dark:text-slate-300 dark:hover:bg-red-950/40 cursor-pointer"
            >
              <X className="h-3.5 w-3.5 mr-1.5" />
              Cancel
            </Button>

            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={executing}
              onClick={() => setIsEditing((v) => !v)}
              className="rounded-xl glass-btn-secondary cursor-pointer"
            >
              <Edit3 className="h-3.5 w-3.5 mr-1.5" />
              {isEditing ? "Done Editing" : "Edit Details"}
            </Button>

            <Button
              type="button"
              size="sm"
              disabled={executing || !draft.customer.name.trim()}
              onClick={handleConfirmClick}
              className="ai-generate-btn rounded-xl text-white font-semibold px-4 cursor-pointer"
            >
              {executing ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin relative z-10" />
                  <span className="relative z-10">Executing...</span>
                </>
              ) : (
                <>
                  <FileText className="h-3.5 w-3.5 mr-1.5 relative z-10" />
                  <span className="relative z-10">Confirm & Execute</span>
                </>
              )}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
