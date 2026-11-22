"use client";

import React from "react";
import Link from "next/link";
import { Download, ExternalLink, Loader2, Printer, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { InvoicePrintView } from "@/components/invoices/invoice-print-view";
import { JobCardPrintView } from "@/components/job-cards/job-card-print-view";
import type { DocumentActionRef } from "@/lib/ai/types";

interface AIDocumentPreviewModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  docRef: DocumentActionRef | null;
  record: any | null;
  loading: boolean;
  downloading: boolean;
  onDownloadPdf: () => void;
  pdfContainerRef: React.RefObject<HTMLDivElement | null>;
  offscreenDoc: { ref: DocumentActionRef; record: any } | null;
}

export function AIDocumentPreviewModal({
  open,
  onOpenChange,
  docRef,
  record,
  loading,
  downloading,
  onDownloadPdf,
  pdfContainerRef,
  offscreenDoc,
}: AIDocumentPreviewModalProps) {
  const href = docRef
    ? docRef.type === "invoice"
      ? `/invoices/${docRef.id}`
      : `/job-cards/${docRef.id}`
    : "#";

  const handlePrint = () => {
    window.print();
  };

  return (
    <>
      {/* Clean A4 Print-Only Container (outside Dialog so @media print renders only the official A4 document) */}
      {open && record && docRef && (
        <div className="hidden print:block print-only bg-white">
          {docRef.type === "invoice" ? (
            <InvoicePrintView invoice={record} />
          ) : (
            <JobCardPrintView jobCard={record} />
          )}
        </div>
      )}

      {/* Hidden Offscreen High-Res PDF Capture Container */}
      <div
        aria-hidden="true"
        className="fixed -left-[9999px] top-0 w-[794px] bg-white pointer-events-none select-none no-print"
      >
        <div ref={pdfContainerRef} className="w-[794px] bg-white">
          {offscreenDoc?.record && offscreenDoc.ref.type === "invoice" && (
            <InvoicePrintView invoice={offscreenDoc.record} isForPdf />
          )}
          {offscreenDoc?.record && offscreenDoc.ref.type === "job_card" && (
            <JobCardPrintView jobCard={offscreenDoc.record} isForPdf />
          )}
        </div>
      </div>

      {/* Interactive A4 Print Preview Modal */}
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl w-[95vw] max-h-[92vh] p-0 overflow-hidden flex flex-col glass-panel no-print">
          <DialogHeader className="px-5 py-3.5 border-b border-[#D7E4F3] dark:border-[#24385A] flex flex-row items-center justify-between gap-3 shrink-0 bg-white/75 dark:bg-[#101C34]/90">
            <DialogTitle className="text-sm font-bold text-[#101D36] dark:text-slate-100 truncate">
              {docRef?.label || "Document Print Preview"}
            </DialogTitle>

            <div className="flex items-center gap-2 shrink-0 pr-6">
              {docRef && (
                <Link href={href}>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 rounded-xl text-xs glass-btn-secondary cursor-pointer"
                  >
                    <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                    Open Record
                  </Button>
                </Link>
              )}

              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={loading || !record}
                onClick={handlePrint}
                className="h-8 rounded-xl text-xs glass-btn-secondary cursor-pointer"
              >
                <Printer className="h-3.5 w-3.5 mr-1.5" />
                Print A4
              </Button>

              <Button
                type="button"
                size="sm"
                disabled={loading || downloading || !record}
                onClick={onDownloadPdf}
                className="h-8 rounded-xl text-xs glass-btn-primary text-white cursor-pointer"
              >
                {downloading ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                ) : (
                  <Download className="h-3.5 w-3.5 mr-1.5" />
                )}
                Download PDF
              </Button>
            </div>
          </DialogHeader>

          <div className="flex-1 overflow-auto p-4 sm:p-6 bg-slate-100/90 dark:bg-[#081020]">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-20 gap-3 text-sm text-[#52657F] dark:text-slate-300">
                <Loader2 className="h-7 w-7 animate-spin text-[#007BFF]" />
                <span>Loading official A4 workshop document...</span>
              </div>
            ) : !record || !docRef ? (
              <div className="flex flex-col items-center justify-center py-16 gap-2 text-sm text-slate-500">
                <X className="h-6 w-6 text-red-500" />
                <span>Document record could not be loaded.</span>
              </div>
            ) : (
              <div className="mx-auto max-w-[794px] bg-white shadow-xl rounded-lg overflow-hidden border border-slate-200">
                {docRef.type === "invoice" ? (
                  <InvoicePrintView invoice={record} />
                ) : (
                  <JobCardPrintView jobCard={record} />
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
