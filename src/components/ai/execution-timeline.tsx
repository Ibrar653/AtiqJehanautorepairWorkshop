"use client";

import React from "react";
import Link from "next/link";
import {
  AlertCircle,
  CheckCircle2,
  Circle,
  Download,
  ExternalLink,
  FileText,
  Loader2,
  Printer,
  ShieldCheck,
  SkipForward,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ActionExecutionResult, DocumentActionRef } from "@/lib/ai/types";

interface ExecutionTimelineProps {
  result?: ActionExecutionResult | null;
  executing?: boolean;
  downloadingDocId?: string | null;
  onPrintPreview: (doc: DocumentActionRef) => void;
  onDownloadPdf: (doc: DocumentActionRef) => void;
}

export function ExecutionTimeline({
  result,
  executing = false,
  downloadingDocId,
  onPrintPreview,
  onDownloadPdf,
}: ExecutionTimelineProps) {
  if (!executing && !result) return null;

  return (
    <div className="mt-3 rounded-2xl border border-[#CFE0F3] dark:border-[#263C61] bg-white/90 dark:bg-[#101C34]/95 shadow-[var(--glass-shadow-sm)] overflow-hidden">
      {/* Header */}
      <div
        className={cn(
          "px-4 py-2.5 border-b flex items-center justify-between gap-2",
          executing
            ? "bg-blue-50/80 dark:bg-blue-950/40 border-blue-200/80 dark:border-blue-800/60"
            : result?.success
            ? "bg-emerald-50/80 dark:bg-emerald-950/35 border-emerald-200/80 dark:border-emerald-800/60"
            : "bg-red-50/80 dark:bg-red-950/35 border-red-200/80 dark:border-red-800/60"
        )}
      >
        <div className="flex items-center gap-2">
          {executing ? (
            <Loader2 className="h-4 w-4 text-[#007BFF] animate-spin" />
          ) : result?.success ? (
            <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          ) : (
            <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
          )}
          <span className="text-xs font-bold text-[#101D36] dark:text-slate-100">
            {executing
              ? "Executing Confirmed Workshop Workflow..."
              : result?.success
              ? result.duplicate_prevented
                ? "Workflow Already Executed (Duplicate Prevented)"
                : "Workshop Workflow Completed"
              : "Workflow Execution Stopped"}
          </span>
        </div>

        {result?.created?.invoice_number && (
          <span className="rounded-full bg-white/90 dark:bg-slate-900 border border-emerald-200 dark:border-emerald-800 px-2.5 py-0.5 text-[11px] font-bold text-emerald-700 dark:text-emerald-300 tabular-nums">
            Invoice #{result.created.invoice_number}
          </span>
        )}
      </div>

      {/* Step Timeline */}
      <div className="p-4 space-y-3">
        {executing && !result ? (
          <div className="flex items-center gap-2.5 text-xs text-[#52657F] dark:text-slate-300">
            <Loader2 className="h-4 w-4 animate-spin text-[#007BFF]" />
            <span>
              Validating permissions, creating records with sequential numbering, and calculating exact VAT totals...
            </span>
          </div>
        ) : (
          <ol className="space-y-2.5">
            {result?.steps.map((step) => (
              <li key={step.id} className="flex items-start gap-2.5 text-xs">
                <span className="mt-0.5 shrink-0">
                  {step.status === "completed" ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  ) : step.status === "running" ? (
                    <Loader2 className="h-4 w-4 text-[#007BFF] animate-spin" />
                  ) : step.status === "failed" ? (
                    <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
                  ) : step.status === "skipped" ? (
                    <SkipForward className="h-4 w-4 text-slate-400" />
                  ) : (
                    <Circle className="h-4 w-4 text-slate-300 dark:text-slate-600" />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-[#101D36] dark:text-slate-100">
                    {step.label}
                  </p>
                  {step.detail && (
                    <p
                      className={cn(
                        "text-[11.5px] mt-0.5",
                        step.status === "failed"
                          ? "text-red-600 dark:text-red-400"
                          : "text-[#52657F] dark:text-slate-400"
                      )}
                    >
                      {step.detail}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ol>
        )}

        {result?.error && (
          <div className="rounded-xl bg-red-50/90 dark:bg-red-950/40 border border-red-200 dark:border-red-800/70 px-3 py-2 text-xs text-red-700 dark:text-red-300">
            {result.error}
          </div>
        )}

        {/* Document Action Bar */}
        {result?.documents && result.documents.length > 0 && (
          <div className="pt-3 border-t border-[#E2ECF8] dark:border-[#23375A] space-y-2">
            <p className="text-[11px] font-bold uppercase tracking-wider text-[#52657F] dark:text-slate-400">
              Generated Workshop Documents
            </p>
            <div className="flex flex-col gap-2">
              {result.documents.map((doc) => {
                const href =
                  doc.type === "invoice" ? `/invoices/${doc.id}` : `/job-cards/${doc.id}`;
                const isDownloading = downloadingDocId === doc.id;

                return (
                  <div
                    key={`${doc.type}-${doc.id}`}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#D7E4F3] dark:border-[#273E63] bg-[#F7FBFF] dark:bg-[#14223B]/80 px-3 py-2"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText className="h-4 w-4 text-[#007BFF] dark:text-sky-400 shrink-0" />
                      <span className="text-xs font-bold text-[#101D36] dark:text-slate-100 truncate">
                        {doc.label}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                      <Link href={href}>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 px-2.5 text-[11.5px] rounded-lg glass-btn-secondary cursor-pointer"
                        >
                          <ExternalLink className="h-3 w-3 mr-1" />
                          Open {doc.type === "invoice" ? "Invoice" : "Job Card"}
                        </Button>
                      </Link>

                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => onPrintPreview(doc)}
                        className="h-7 px-2.5 text-[11.5px] rounded-lg glass-btn-secondary cursor-pointer"
                      >
                        <Printer className="h-3 w-3 mr-1" />
                        Print {doc.type === "invoice" ? "Invoice" : "Job Card"}
                      </Button>

                      <Button
                        type="button"
                        size="sm"
                        disabled={isDownloading}
                        onClick={() => onDownloadPdf(doc)}
                        className="h-7 px-2.5 text-[11.5px] rounded-lg glass-btn-primary text-white cursor-pointer"
                      >
                        {isDownloading ? (
                          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                        ) : (
                          <Download className="h-3 w-3 mr-1" />
                        )}
                        Download PDF
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
