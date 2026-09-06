"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { getJobCardById, updateJobCardStatus } from "@/lib/services/job-card-service";
import { getInvoiceByJobCardId, generateInvoiceFromJobCard } from "@/lib/services/invoice-service";
import {
  getAttachmentsByJobCard,
  addJobCardAttachment,
  deleteJobCardAttachment,
  uploadJobCardFile,
} from "@/lib/services/document-service";
import type { JobCardWithRelations, JobCardStatus, JobCardAttachment, DocumentType } from "@/types/database";
import { JobCardPrintView } from "@/components/job-cards/job-card-print-view";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  Printer,
  Pencil,
  Loader2,
  AlertCircle,
  CheckCircle2,
  FileText,
  User,
  Car,
  Wrench,
  Package,
  Download,
  Paperclip,
  Image as ImageIcon,
  Plus,
  Trash2,
  Eye,
  Sparkles,
  DollarSign,
  Calendar,
} from "lucide-react";
import { formatAmount, formatDate } from "@/lib/utils";

interface JobCardDetailViewProps {
  id: string;
}

export function JobCardDetailView({ id }: JobCardDetailViewProps) {
  const searchParams = useSearchParams();
  const [jobCard, setJobCard] = useState<JobCardWithRelations | null>(null);
  const [attachments, setAttachments] = useState<JobCardAttachment[]>([]);
  const [existingInvoice, setExistingInvoice] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [convertingInvoice, setConvertingInvoice] = useState(false);
  const [toastMessage, setToastMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Attachment Modal state
  const [attachmentModalOpen, setAttachmentModalOpen] = useState(false);
  const [attDocType, setAttDocType] = useState<DocumentType>("vehicle_photo");
  const [attDescription, setAttDescription] = useState("");
  const [attFile, setAttFile] = useState<File | null>(null);
  const [attUploading, setAttUploading] = useState(false);

  // Preview Modal
  const [previewDoc, setPreviewDoc] = useState<JobCardAttachment | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [data, atts, inv] = await Promise.all([
        getJobCardById(id),
        getAttachmentsByJobCard(id),
        getInvoiceByJobCardId(id),
      ]);
      setJobCard(data);
      setAttachments(atts || []);
      setExistingInvoice(inv || null);
    } catch (err: any) {
      console.error(err);
      setToastMessage({ type: "error", text: err.message || "Failed to load job card" });
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Auto-print if opened with ?print=true
  useEffect(() => {
    if (!loading && jobCard && searchParams.get("print") === "true") {
      const timer = setTimeout(() => {
        window.print();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [loading, jobCard, searchParams]);

  const handleStatusChange = async (newStatus: JobCardStatus) => {
    if (!jobCard) return;
    setUpdatingStatus(true);
    try {
      await updateJobCardStatus(id, newStatus);
      setToastMessage({
        type: "success",
        text: `Job card status updated to "${newStatus.replace("_", " ").toUpperCase()}".`,
      });
      loadData();
    } catch (err: any) {
      setToastMessage({ type: "error", text: err.message || "Failed to update status" });
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handleConvertToInvoice = async () => {
    if (!jobCard) return;
    setConvertingInvoice(true);
    try {
      const inv = await generateInvoiceFromJobCard(jobCard.id);
      setExistingInvoice(inv);
      setToastMessage({
        type: "success",
        text: `Invoice #${inv.invoice_number} successfully generated from Job Card!`,
      });
    } catch (err: any) {
      console.error(err);
      setToastMessage({ type: "error", text: err.message || "Failed to convert job card to invoice" });
    } finally {
      setConvertingInvoice(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleAddAttachmentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!attFile) return;
    setAttUploading(true);
    try {
      const uploaded = await uploadJobCardFile(attFile, "job-card-attachments");
      await addJobCardAttachment(id, {
        document_type: attDocType,
        file_url: uploaded.fileUrl,
        file_name: uploaded.fileName,
        file_type: uploaded.fileType,
        file_size: uploaded.fileSize,
        description: attDescription.trim() || null,
      });
      setToastMessage({ type: "success", text: "Attachment added successfully." });
      setAttachmentModalOpen(false);
      setAttFile(null);
      setAttDescription("");
      loadData();
    } catch (err: any) {
      setToastMessage({ type: "error", text: err.message || "Failed to upload file" });
    } finally {
      setAttUploading(false);
    }
  };

  const handleDeleteAttachment = async (attachmentId: string) => {
    if (!confirm("Are you sure you want to delete this attachment?")) return;
    try {
      await deleteJobCardAttachment(attachmentId);
      setAttachments((prev) => prev.filter((a) => a.id !== attachmentId));
      setToastMessage({ type: "success", text: "Attachment removed." });
    } catch (err: any) {
      setToastMessage({ type: "error", text: err.message || "Failed to delete attachment" });
    }
  };

  if (loading) {
    return (
      <div className="py-24 text-center text-muted-foreground">
        <Loader2 className="h-8 w-8 mx-auto animate-spin mb-3 text-primary" />
        <p className="text-xs font-medium">Loading job card record...</p>
      </div>
    );
  }

  if (!jobCard) {
    return (
      <div className="py-20 text-center text-muted-foreground">
        <AlertCircle className="h-10 w-10 mx-auto text-rose-500 mb-3" />
        <h3 className="text-base font-bold text-foreground">Job Card Not Found</h3>
        <p className="text-xs text-muted-foreground mt-1 mb-4">The requested job card record does not exist or was removed.</p>
        <Button render={<Link href="/job-cards" />} className="text-xs font-semibold rounded-lg h-9">
          Back to Job Cards
        </Button>
      </div>
    );
  }

  const serviceItems = (jobCard.items || []).filter((it) => it.item_type === "service");
  const partItems = (jobCard.items || []).filter((it) => it.item_type === "part");

  const serviceSubtotal = serviceItems.reduce(
    (sum, it) => sum + (Number(it.quantity) || 1) * (Number(it.unit_price) || 0),
    0
  );
  const labourSubtotal = serviceItems.reduce(
    (sum, it) => sum + (Number(it.labour_charge) || 0),
    0
  );
  const partsSubtotal = partItems.reduce(
    (sum, it) => sum + (Number(it.total_price) || 0),
    0
  );

  const getStatusBadge = (st: JobCardStatus) => {
    switch (st) {
      case "new":
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800">
            New
          </span>
        );
      case "in_progress":
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800">
            In Progress
          </span>
        );
      case "waiting":
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-50 text-purple-700 border border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800">
            Waiting
          </span>
        );
      case "completed":
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800">
            Completed
          </span>
        );
      case "cancelled":
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800">
            Cancelled
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-muted text-muted-foreground border border-border">
            {st}
          </span>
        );
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12">
      {/* Top Action Bar (hidden during browser print) */}
      <div className="no-print space-y-4">
        <PageHeader
          title={`Job Card: ${jobCard.job_card_number}`}
          description={`Order Date: ${formatDate(jobCard.date || jobCard.created_at)} • Order ID: ${jobCard.id.slice(0, 8)}`}
          breadcrumbs={[
            { label: "Dashboard", href: "/" },
            { label: "Job Cards", href: "/job-cards" },
            { label: jobCard.job_card_number },
          ]}
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                render={<Link href={`/job-cards/${id}/edit`} />}
                className="h-9 px-3.5 text-xs font-semibold rounded-lg border-border"
              >
                <Pencil className="mr-1.5 h-3.5 w-3.5 text-muted-foreground" /> Edit Job Card
              </Button>
              <Button
                variant="outline"
                onClick={handlePrint}
                className="h-9 px-3.5 text-xs font-semibold rounded-lg border-border gap-1.5"
              >
                <Printer className="h-3.5 w-3.5 text-muted-foreground" /> Print Sheet
              </Button>
              <Button
                variant="outline"
                onClick={handlePrint}
                className="h-9 px-3.5 text-xs font-semibold rounded-lg border-border gap-1.5"
                title="Save or export clean A4 PDF"
              >
                <Download className="h-3.5 w-3.5 text-muted-foreground" /> Export PDF
              </Button>
              {existingInvoice ? (
                <Button
                  render={<Link href={`/invoices?invoice_id=${existingInvoice.id}`} />}
                  className="h-9 px-4 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs"
                >
                  <FileText className="mr-1.5 h-3.5 w-3.5" /> View Invoice (#{existingInvoice.invoice_number})
                </Button>
              ) : (
                <Button
                  disabled={convertingInvoice}
                  onClick={handleConvertToInvoice}
                  className="h-9 px-4 text-xs font-semibold rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground shadow-xs"
                >
                  {convertingInvoice ? (
                    <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> Generating...</>
                  ) : (
                    <><FileText className="mr-1.5 h-3.5 w-3.5" /> Convert to Invoice</>
                  )}
                </Button>
              )}
            </div>
          }
        />

        {toastMessage && (
          <div
            className={`flex items-center justify-between p-3.5 rounded-xl border text-sm transition-all ${
              toastMessage.type === "success"
                ? "bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-800"
                : "bg-rose-50 text-rose-800 border-rose-200 dark:bg-rose-950/30 dark:text-rose-300 dark:border-rose-800"
            }`}
          >
            <div className="flex items-center gap-2">
              {toastMessage.type === "success" ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
              ) : (
                <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
              )}
              <span className="font-medium">{toastMessage.text}</span>
            </div>
            <button onClick={() => setToastMessage(null)} className="text-xs hover:underline font-medium text-muted-foreground">
              Dismiss
            </button>
          </div>
        )}

        {/* Status Transition Control Bar */}
        <Card className="border border-border/80 shadow-xs bg-card rounded-xl">
          <CardContent className="p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Status:</span>
                {getStatusBadge(jobCard.status)}
              </div>
              <div className="flex items-center gap-2 border-l border-border pl-3">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Payment:</span>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-muted text-foreground border border-border uppercase">
                  {jobCard.payment_status || "Pending"}
                </span>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-muted-foreground mr-1 font-medium">Update Status:</span>
              <Button
                size="sm"
                variant={jobCard.status === "new" ? "default" : "outline"}
                disabled={updatingStatus}
                onClick={() => handleStatusChange("new")}
                className="h-7 px-2.5 text-xs font-medium rounded-md"
              >
                New
              </Button>
              <Button
                size="sm"
                variant={jobCard.status === "in_progress" ? "default" : "outline"}
                disabled={updatingStatus}
                onClick={() => handleStatusChange("in_progress")}
                className="h-7 px-2.5 text-xs font-medium rounded-md"
              >
                In Progress
              </Button>
              <Button
                size="sm"
                variant={jobCard.status === "waiting" ? "default" : "outline"}
                disabled={updatingStatus}
                onClick={() => handleStatusChange("waiting")}
                className="h-7 px-2.5 text-xs font-medium rounded-md"
              >
                Waiting
              </Button>
              <Button
                size="sm"
                variant={jobCard.status === "completed" ? "default" : "outline"}
                disabled={updatingStatus}
                onClick={() => handleStatusChange("completed")}
                className="h-7 px-2.5 text-xs font-medium rounded-md"
              >
                Completed
              </Button>
              <Button
                size="sm"
                variant={jobCard.status === "cancelled" ? "destructive" : "outline"}
                disabled={updatingStatus}
                onClick={() => handleStatusChange("cancelled")}
                className="h-7 px-2.5 text-xs font-medium rounded-md"
              >
                Cancelled
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Structured Screen Job Sheet (Hidden during browser print) */}
      <div className="no-print p-8 rounded-xl border border-border/80 bg-card text-card-foreground shadow-xs space-y-6">
        {/* Document Header with Professional Workshop Branding */}
        <div className="flex flex-col md:flex-row justify-between border-b border-border pb-6 gap-4">
          <div>
            <h2 className="text-lg font-bold tracking-tight text-foreground uppercase">
              ATIQ JEHAN AUTO REPAIR &amp; USED SPARE PARTS L.L.C.
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5 font-medium">Specialized Auto Repairing, Maintenance &amp; Diagnostic Workshop</p>
            <p className="text-xs text-muted-foreground mt-0.5">Al Dhafra Region, Madinat Zayed, MZE16, ST 04 • Tel: +971-501233517, +971-501517497</p>
            <p className="text-xs font-mono text-primary font-semibold mt-1">TRN: 100456789000003</p>
          </div>
          <div className="md:text-right">
            <span className="text-[11px] font-bold text-primary uppercase tracking-wider bg-primary/10 border border-primary/20 px-2.5 py-1 rounded-full">
              WORKSHOP JOB CARD
            </span>
            <p className="text-2xl font-bold text-primary mt-2 font-mono">{jobCard.job_card_number}</p>
            {jobCard.invoice_number && (
              <div className="mt-1 inline-block border border-border px-2.5 py-0.5 font-bold text-xs bg-muted text-foreground rounded font-mono">
                INVOICE NO: <span className="font-bold text-primary ml-1">{jobCard.invoice_number}</span>
              </div>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              Order Date: <span className="font-semibold text-foreground">{formatDate(jobCard.date || jobCard.created_at)}</span>
            </p>
          </div>
        </div>

        {/* Section A: Customer & Vehicle Information Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Customer Details Box */}
          <div className="p-4 rounded-xl border border-border/80 bg-muted/20 space-y-2 text-xs">
            <div className="flex items-center justify-between border-b border-border/60 pb-2">
              <span className="font-bold text-foreground text-xs uppercase tracking-wider flex items-center gap-1.5">
                <User className="h-3.5 w-3.5 text-primary" /> Customer Owner Details
              </span>
              {jobCard.customer_id && (
                <Link href={`/customers/${jobCard.customer_id}`} className="text-primary hover:underline text-[11px] font-medium">
                  View Profile →
                </Link>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3 pt-1">
              <div>
                <span className="text-muted-foreground uppercase text-[10px] font-semibold">Customer Name:</span>
                <p className="font-bold text-foreground text-xs">{jobCard.customer?.name || "N/A"}</p>
                {jobCard.customer?.company_name && (
                  <p className="text-[11px] text-muted-foreground mt-0.5">{jobCard.customer.company_name}</p>
                )}
              </div>
              <div>
                <span className="text-muted-foreground uppercase text-[10px] font-semibold">TRN Number:</span>
                <p className="font-mono font-bold text-primary mt-0.5">{jobCard.customer?.trn_number || "—"}</p>
              </div>
              <div>
                <span className="text-muted-foreground uppercase text-[10px] font-semibold">Mobile Phone:</span>
                <p className="font-semibold font-mono text-foreground">{jobCard.customer?.mobile || "N/A"}</p>
              </div>
              <div>
                <span className="text-muted-foreground uppercase text-[10px] font-semibold">Address / Emirate:</span>
                <p className="font-medium text-foreground">{jobCard.customer?.address || "UAE"}</p>
              </div>
            </div>
          </div>

          {/* Vehicle Specifications Box */}
          <div className="p-4 rounded-xl border border-border/80 bg-muted/20 space-y-2 text-xs">
            <div className="flex items-center justify-between border-b border-border/60 pb-2">
              <span className="font-bold text-foreground text-xs uppercase tracking-wider flex items-center gap-1.5">
                <Car className="h-3.5 w-3.5 text-primary" /> Vehicle Specifications
              </span>
              {jobCard.vehicle_id && (
                <Link href={`/vehicles/${jobCard.vehicle_id}`} className="text-primary hover:underline text-[11px] font-medium">
                  View Vehicle →
                </Link>
              )}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-1">
              <div>
                <span className="text-muted-foreground uppercase text-[10px] font-semibold">Vehicle:</span>
                <p className="font-bold text-foreground text-xs">
                  {jobCard.vehicle?.make} {jobCard.vehicle?.model}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground uppercase text-[10px] font-semibold">Year:</span>
                <p className="font-bold text-foreground text-xs font-mono">{jobCard.vehicle?.year || "N/A"}</p>
              </div>
              <div>
                <span className="text-muted-foreground uppercase text-[10px] font-semibold">Color:</span>
                <p className="font-bold text-foreground text-xs">{jobCard.vehicle?.color || "N/A"}</p>
              </div>
              <div>
                <span className="text-muted-foreground uppercase text-[10px] font-semibold">Plate Number:</span>
                <p className="font-bold text-primary text-xs font-mono">{jobCard.vehicle?.registration_number || "N/A"}</p>
              </div>
              <div>
                <span className="text-muted-foreground uppercase text-[10px] font-semibold">Chassis / VIN:</span>
                <p className="font-mono text-xs text-muted-foreground break-all">{jobCard.vehicle?.chassis_vin || "N/A"}</p>
              </div>
              <div>
                <span className="text-muted-foreground uppercase text-[10px] font-semibold">Mileage:</span>
                <p className="font-bold text-foreground font-mono">
                  {jobCard.mileage_in
                    ? `${jobCard.mileage_in.toLocaleString()} KM`
                    : jobCard.vehicle?.mileage
                    ? `${jobCard.vehicle.mileage.toLocaleString()} KM`
                    : "N/A"}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Section B: Customer Complaints, Mechanic Assignment & Workshop Findings */}
        <div className="p-4 rounded-xl border border-border/80 bg-muted/10 space-y-3 text-xs">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <span className="font-bold text-foreground uppercase tracking-wide text-xs">
                Customer Complaint / Reported Issue:
              </span>
              <p className="mt-1 text-foreground whitespace-pre-wrap leading-relaxed">
                {jobCard.customer_complaint || "No specific customer complaint documented."}
              </p>
            </div>
            <div>
              <span className="font-bold text-foreground uppercase tracking-wide text-xs">
                Assigned Mechanic &amp; Workshop Notes:
              </span>
              <p className="mt-1 text-foreground font-semibold">
                Technician: <span className="text-primary font-bold">{jobCard.assigned_mechanic || "Unassigned"}</span>
              </p>
              <p className="mt-1 text-muted-foreground whitespace-pre-wrap leading-relaxed">
                {jobCard.notes || "No internal supervisor notes recorded."}
              </p>
            </div>
          </div>

          {/* Work Details / Findings */}
          <div className="pt-3 border-t border-border/60">
            <span className="font-bold text-foreground uppercase tracking-wide text-xs flex items-center gap-1.5 text-primary">
              <Sparkles className="h-3.5 w-3.5" /> Work Details &amp; Technician Findings:
            </span>
            <p className="mt-1 text-xs bg-background p-3 rounded-lg border border-border text-foreground whitespace-pre-wrap leading-relaxed">
              {jobCard.work_details || "Standard diagnostic and workshop maintenance procedures completed."}
            </p>
          </div>
        </div>

        {/* Section C: Services & Labour Breakdown Table */}
        <div className="space-y-3">
          <h4 className="font-bold text-xs uppercase tracking-wider text-foreground flex items-center gap-2">
            <Wrench className="h-4 w-4 text-primary" /> Services &amp; Labour Breakdown ({serviceItems.length})
          </h4>
          {serviceItems.length > 0 ? (
            <div className="border border-border/80 rounded-xl overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50 hover:bg-muted/50 border-b border-border h-10">
                    <TableHead className="font-semibold text-foreground text-xs uppercase tracking-wider w-[45%]">Service Description / Scope</TableHead>
                    <TableHead className="font-semibold text-foreground text-xs uppercase tracking-wider w-[10%] text-center">Qty</TableHead>
                    <TableHead className="font-semibold text-foreground text-xs uppercase tracking-wider w-[15%] text-right">Unit Rate</TableHead>
                    <TableHead className="font-semibold text-foreground text-xs uppercase tracking-wider w-[15%] text-right">Labour</TableHead>
                    <TableHead className="font-semibold text-foreground text-xs uppercase tracking-wider w-[15%] text-right pr-4">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="divide-y divide-border/60">
                  {serviceItems.map((item) => (
                    <TableRow key={item.id} className="h-11 hover:bg-muted/30 transition-colors">
                      <TableCell className="font-medium text-foreground text-xs">{item.description}</TableCell>
                      <TableCell className="text-center text-xs font-mono">{item.quantity}</TableCell>
                      <TableCell className="text-right font-mono text-xs">{formatAmount(item.unit_price)}</TableCell>
                      <TableCell className="text-right font-mono text-xs">{formatAmount(item.labour_charge || 0)}</TableCell>
                      <TableCell className="text-right font-bold font-mono text-foreground text-xs pr-4">
                        {formatAmount(item.total_price)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground italic py-2">No service lines recorded.</p>
          )}
        </div>

        {/* Section D: Spare Parts Breakdown Table */}
        <div className="space-y-3">
          <h4 className="font-bold text-xs uppercase tracking-wider text-foreground flex items-center gap-2">
            <Package className="h-4 w-4 text-primary" /> Spare Parts Installed ({partItems.length})
          </h4>
          {partItems.length > 0 ? (
            <div className="border border-border/80 rounded-xl overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50 hover:bg-muted/50 border-b border-border h-10">
                    <TableHead className="font-semibold text-foreground text-xs uppercase tracking-wider w-[50%]">Spare Part Name / Code</TableHead>
                    <TableHead className="font-semibold text-foreground text-xs uppercase tracking-wider w-[15%] text-center">Qty Used</TableHead>
                    <TableHead className="font-semibold text-foreground text-xs uppercase tracking-wider w-[15%] text-right">Unit Price</TableHead>
                    <TableHead className="font-semibold text-foreground text-xs uppercase tracking-wider w-[20%] text-right pr-4">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="divide-y divide-border/60">
                  {partItems.map((item) => (
                    <TableRow key={item.id} className="h-11 hover:bg-muted/30 transition-colors">
                      <TableCell className="font-medium text-foreground text-xs">
                        <div className="flex items-center gap-2">
                          <span>{item.description}</span>
                          {item.part_id ? (
                            <span className="inline-flex items-center text-[10px] font-semibold px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/40 dark:text-blue-300">
                              Inventory
                            </span>
                          ) : (
                            <span className="inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-border">
                              Custom Part
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-center font-mono font-bold text-foreground text-xs">{item.quantity}</TableCell>
                      <TableCell className="text-right font-mono text-xs">{formatAmount(item.unit_price)}</TableCell>
                      <TableCell className="text-right font-bold font-mono text-foreground text-xs pr-4">
                        {formatAmount(item.total_price)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground italic py-2">No spare parts recorded on this job card.</p>
          )}
        </div>

        {/* Section E: Attachments Section */}
        <div className="space-y-3 border-t border-border pt-4">
          <div className="flex items-center justify-between">
            <h4 className="font-bold text-xs uppercase tracking-wider text-foreground flex items-center gap-2">
              <Paperclip className="h-4 w-4 text-primary" /> Attachments &amp; Inspection Scans ({attachments.length})
            </h4>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setAttachmentModalOpen(true)}
              className="h-8 px-3 text-xs font-semibold rounded-lg border-border"
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" /> Add Attachment
            </Button>
          </div>

          {attachments.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {attachments.map((att) => (
                <div key={att.id} className="p-3 rounded-xl border border-border/80 bg-muted/20 space-y-2 text-xs">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      {att.file_type.includes("pdf") ? (
                        <FileText className="h-5 w-5 text-primary shrink-0" />
                      ) : (
                        <ImageIcon className="h-5 w-5 text-emerald-500 shrink-0" />
                      )}
                      <div className="min-w-0">
                        <p className="font-bold truncate text-foreground">{att.file_name}</p>
                        <span className="inline-block px-1.5 py-0.5 rounded text-[9px] bg-primary/10 text-primary uppercase font-bold mt-0.5">
                          {att.document_type.replace("_", " ")}
                        </span>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteAttachment(att.id)}
                      className="h-6 w-6 p-0 text-muted-foreground hover:text-rose-600 shrink-0"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  {att.description && <p className="text-[11px] text-muted-foreground line-clamp-2">{att.description}</p>}
                  <div className="flex items-center justify-between pt-2 border-t border-border/60 text-[10px] text-muted-foreground">
                    <span>{(att.file_size / 1024 / 1024).toFixed(2)} MB</span>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setPreviewDoc(att)}
                        className="h-6 px-2 text-[10px] gap-1 text-primary hover:text-primary"
                      >
                        <Eye className="h-3 w-3" /> View
                      </Button>
                      <a
                        href={att.file_url}
                        download={att.file_name}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 font-semibold text-primary hover:underline"
                      >
                        <Download className="h-3 w-3" /> Download
                      </a>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-4 text-center rounded-xl border border-dashed border-border/80 text-xs text-muted-foreground">
              No files or photos attached to this job card. Click "Add Attachment" to upload vehicle photos, inspection reports, or parts invoices.
            </div>
          )}
        </div>

        {/* Section F: Financial Summary & Auto-Calculated Totals Panel */}
        <div className="border-t border-border pt-4 flex flex-col md:flex-row justify-between items-start gap-6">
          <div className="text-xs text-muted-foreground space-y-1.5 max-w-md">
            <p className="font-bold text-foreground uppercase tracking-wider text-[11px]">Workshop Terms &amp; Conditions:</p>
            <p>1. Repair estimates are subject to initial mechanical inspection.</p>
            <p>2. Replaced parts warranty applies for 7 days unless specified otherwise.</p>
            <p>3. Vehicle release is subject to full settlement of the final tax invoice.</p>
          </div>

          <div className="w-full md:w-84 p-5 rounded-xl border border-border/80 bg-muted/20 space-y-2 text-xs">
            <div className="flex justify-between text-muted-foreground">
              <span>Services Total:</span>
              <span className="font-medium text-foreground font-mono">{formatAmount(serviceSubtotal)}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Labour Total:</span>
              <span className="font-medium text-foreground font-mono">{formatAmount(labourSubtotal)}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Parts Total:</span>
              <span className="font-medium text-foreground font-mono">{formatAmount(partsSubtotal)}</span>
            </div>
            <div className="border-t border-border/60 pt-2 flex justify-between font-semibold">
              <span>Subtotal:</span>
              <span className="font-bold text-foreground font-mono">{formatAmount(jobCard.subtotal)}</span>
            </div>
            {Number(jobCard.discount) > 0 && (
              <div className="flex justify-between text-emerald-600 dark:text-emerald-400 font-medium">
                <span>Discount:</span>
                <span className="font-mono">-{formatAmount(jobCard.discount)}</span>
              </div>
            )}
            <div className="flex justify-between text-muted-foreground">
              <span>VAT ({jobCard.vat_rate}%):</span>
              <span className="font-medium text-foreground font-mono">{formatAmount(jobCard.vat_amount)}</span>
            </div>
            <div className="border-t border-border pt-2 bg-primary/10 p-3 rounded-lg flex justify-between text-sm font-bold text-primary">
              <span className="uppercase tracking-wider">Total Amount:</span>
              <span className="font-mono font-bold text-base">AED {formatAmount(jobCard.total)}</span>
            </div>
            <div className="flex justify-between text-xs text-muted-foreground pt-1">
              <span>Paid Amount:</span>
              <span className="font-semibold text-emerald-600 dark:text-emerald-400 font-mono">{formatAmount(jobCard.paid || 0)}</span>
            </div>
            <div className="flex justify-between text-xs font-bold text-amber-600 dark:text-amber-400">
              <span>Outstanding Balance:</span>
              <span className="font-mono">{formatAmount(jobCard.balance)}</span>
            </div>
          </div>
        </div>

        {/* Section G: Signatures Section */}
        <div className="pt-6 border-t border-border">
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-bold text-xs uppercase tracking-wider text-foreground">Signatures</h4>
            <span className="text-[11px] text-muted-foreground">Authorized Workshop &amp; Customer Manual Signature Area</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 text-xs">
            {/* Workshop Authorized Signature */}
            <div className="p-4 rounded-xl border border-border/80 bg-muted/20 flex flex-col justify-between min-h-[110px]">
              <div>
                <p className="font-bold text-xs uppercase tracking-wider text-foreground">
                  ATIQ JEHAN AUTO REPAIR
                </p>
                <p className="text-[11px] text-muted-foreground font-medium mt-0.5">
                  Authorized Signature &amp; Stamp
                </p>
              </div>
              <div className="pt-8">
                <div className="border-b-2 border-dashed border-border/80 w-full"></div>
              </div>
            </div>

            {/* Customer Signature */}
            <div className="p-4 rounded-xl border border-border/80 bg-muted/20 flex flex-col justify-between min-h-[110px]">
              <div>
                <p className="font-bold text-xs uppercase tracking-wider text-foreground">
                  CUSTOMER
                </p>
                <p className="text-[11px] text-muted-foreground font-medium mt-0.5">
                  Customer Acceptance Signature
                </p>
              </div>
              <div className="pt-8">
                <div className="border-b-2 border-dashed border-border/80 w-full"></div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Clean A4 Printable Template (Visible only when printing) */}
      <JobCardPrintView jobCard={jobCard} />

      {/* Upload Attachment Dialog */}
      <Dialog open={attachmentModalOpen} onOpenChange={setAttachmentModalOpen}>
        <DialogContent className="sm:max-w-md bg-card border border-border shadow-lg rounded-xl p-6">
          <DialogTitle className="flex items-center gap-2 text-base font-bold text-foreground">
            <Paperclip className="h-4 w-4 text-primary" /> Add Job Card Attachment
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Attach vehicle damage photos, paper inspection scans, or supplier part invoices.
          </DialogDescription>
          <form onSubmit={handleAddAttachmentSubmit} className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Document Type</label>
              <select
                value={attDocType}
                onChange={(e) => setAttDocType(e.target.value as DocumentType)}
                className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-1 text-xs shadow-xs font-medium"
              >
                <option value="vehicle_photo">Vehicle Photo (Before / After)</option>
                <option value="inspection_photo">Inspection Scan / Diagnostic Report</option>
                <option value="supplier_document">Supplier Invoice / Parts Slip</option>
                <option value="paper_job_card">Paper Job Card Scan</option>
                <option value="other">Other Document</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Document Description (Optional)</label>
              <input
                type="text"
                placeholder="e.g. Front bumper collision damage photo"
                value={attDescription}
                onChange={(e) => setAttDescription(e.target.value)}
                className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-1 text-xs shadow-xs"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Select File (Images, PDF)</label>
              <input
                type="file"
                accept="image/*,.pdf"
                required
                onChange={(e) => setAttFile(e.target.files?.[0] || null)}
                className="flex w-full rounded-lg border border-input bg-background p-2 text-xs file:mr-2 file:rounded-md file:border-0 file:bg-primary/10 file:px-2 file:py-1 file:text-xs file:font-semibold file:text-primary cursor-pointer"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <Button
                type="button"
                variant="outline"
                onClick={() => setAttachmentModalOpen(false)}
                className="h-9 px-4 text-xs font-medium rounded-lg"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={attUploading || !attFile}
                className="h-9 px-4 text-xs font-semibold rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground shadow-xs"
              >
                {attUploading ? (
                  <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> Uploading...</>
                ) : (
                  "Upload File"
                )}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Document Preview Modal */}
      {previewDoc && (
        <Dialog open={!!previewDoc} onOpenChange={() => setPreviewDoc(null)}>
          <DialogContent className="max-w-3xl bg-card border border-border shadow-xl rounded-xl p-6">
            <DialogTitle className="text-base font-bold text-foreground">Attachment Preview</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              {previewDoc.file_name} • {(previewDoc.file_size / 1024 / 1024).toFixed(2)} MB
            </DialogDescription>
            <div className="mt-4 flex flex-col items-center justify-center border border-border rounded-xl p-2 bg-muted/20 max-h-[70vh] overflow-auto">
              {previewDoc.file_type.includes("pdf") ? (
                <iframe src={previewDoc.file_url} className="w-full h-[550px] rounded-lg border" />
              ) : (
                <img src={previewDoc.file_url} alt="Attachment preview" className="max-w-full max-h-[500px] object-contain rounded-lg" />
              )}
            </div>
            <div className="flex justify-between items-center mt-4 pt-3 border-t border-border">
              <Button
                variant="outline"
                render={<a href={previewDoc.file_url} target="_blank" rel="noopener noreferrer" download />}
                className="h-9 px-4 text-xs font-medium rounded-lg"
              >
                <Download className="mr-1.5 h-3.5 w-3.5" /> Download
              </Button>
              <Button
                onClick={() => setPreviewDoc(null)}
                className="h-9 px-4 text-xs font-semibold rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground"
              >
                Close Preview
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

export default JobCardDetailView;
