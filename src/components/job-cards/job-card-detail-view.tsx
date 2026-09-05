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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  Printer,
  Pencil,
  ArrowLeft,
  Loader2,
  AlertCircle,
  CheckCircle2,
  FileText,
  User,
  Car,
  Phone,
  Mail,
  MapPin,
  Hash,
  Wrench,
  Package,
  Clock,
  DollarSign,
  ShieldCheck,
  CreditCard,
  Download,
  Paperclip,
  Image as ImageIcon,
  ExternalLink,
  Plus,
  Trash2,
  Eye,
  Sparkles,
} from "lucide-react";
import { formatCurrency, formatAmount, formatDate } from "@/lib/utils";

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

      setToastMessage({ type: "success", text: "Attachment uploaded successfully." });
      setAttachmentModalOpen(false);
      setAttFile(null);
      setAttDescription("");
      loadData();
    } catch (err: any) {
      setToastMessage({ type: "error", text: err.message || "Failed to upload attachment." });
    } finally {
      setAttUploading(false);
    }
  };

  const handleDeleteAttachment = async (attId: string) => {
    if (!confirm("Are you sure you want to remove this attachment?")) return;
    try {
      await deleteJobCardAttachment(attId);
      setAttachments((prev) => prev.filter((a) => a.id !== attId));
      setToastMessage({ type: "success", text: "Attachment removed." });
    } catch (err: any) {
      setToastMessage({ type: "error", text: err.message || "Failed to remove attachment." });
    }
  };

  if (loading) {
    return (
      <div className="py-20 text-center text-muted-foreground">
        <Loader2 className="h-8 w-8 mx-auto animate-spin mb-3 text-primary" />
        <p>Loading repair job card...</p>
      </div>
    );
  }

  if (!jobCard) {
    return (
      <div className="py-20 text-center text-muted-foreground">
        <AlertCircle className="h-10 w-10 mx-auto text-destructive mb-3" />
        <h3 className="text-lg font-medium text-foreground">Job Card Not Found</h3>
        <p className="text-sm mt-1 mb-4">The requested job card record does not exist or was removed.</p>
        <Button render={<Link href="/job-cards" />}>Back to Job Cards Directory</Button>
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
        return <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-blue-500/10 text-blue-500 border border-blue-500/20">New</span>;
      case "in_progress":
        return <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-amber-500/10 text-amber-500 border border-amber-500/20">In Progress</span>;
      case "waiting":
        return <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-purple-500/10 text-purple-500 border border-purple-500/20">Waiting</span>;
      case "completed":
        return <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">Completed</span>;
      case "cancelled":
        return <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-red-500/10 text-red-500 border border-red-500/20">Cancelled</span>;
    }
  };

  const getPaymentStatusBadge = () => {
    const paid = Number(jobCard.paid) || 0;
    const total = Number(jobCard.total) || 0;
    if (paid >= total && total > 0) {
      return <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">Paid Full</span>;
    } else if (paid > 0) {
      return <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-amber-500/10 text-amber-500 border border-amber-500/20">Partially Paid</span>;
    }
    return <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-red-500/10 text-red-500 border border-red-500/20">Credit / Unpaid</span>;
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12">
      {/* Top Action Bar (hidden in print) */}
      <div className="no-print space-y-6">
        <PageHeader
          title={`Job Card: ${jobCard.job_card_number}`}
          description={`Order Date: ${formatDate(jobCard.date || jobCard.created_at)} • Created: ${formatDate(jobCard.created_at)}`}
          breadcrumbs={[
            { label: "Dashboard", href: "/" },
            { label: "Job Cards", href: "/job-cards" },
            { label: jobCard.job_card_number },
          ]}
          actions={
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" render={<Link href={`/job-cards/${id}/edit`} />}>
                <Pencil className="mr-2 h-4 w-4" /> Edit Job Card
              </Button>
              <Button variant="outline" onClick={handlePrint} className="gap-2">
                <Printer className="h-4 w-4" /> Print Job Card
              </Button>
              <Button variant="outline" onClick={handlePrint} className="gap-2" title="Save or export clean A4 PDF">
                <Download className="h-4 w-4" /> Download PDF
              </Button>
              {existingInvoice ? (
                <Button variant="default" className="bg-emerald-600 hover:bg-emerald-700 text-white" render={<Link href={`/invoices?invoice_id=${existingInvoice.id}`} />}>
                  <FileText className="mr-2 h-4 w-4" /> View Invoice ({existingInvoice.invoice_number})
                </Button>
              ) : (
                <Button variant="default" className="bg-blue-600 hover:bg-blue-700 text-white" disabled={convertingInvoice} onClick={handleConvertToInvoice}>
                  {convertingInvoice ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}
                  Convert to Invoice
                </Button>
              )}
            </div>
          }
        />

        {toastMessage && (
          <div
            className={`flex items-center justify-between p-4 rounded-xl border text-sm ${
              toastMessage.type === "success"
                ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400"
                : "bg-red-500/10 border-red-500/20 text-red-600 dark:text-red-400"
            }`}
          >
            <div className="flex items-center gap-2">
              {toastMessage.type === "success" ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
              <span>{toastMessage.text}</span>
            </div>
            <button onClick={() => setToastMessage(null)} className="text-xs hover:underline font-medium">
              Dismiss
            </button>
          </div>
        )}

        {/* Status Control Card */}
        <Card className="shadow-sm border">
          <CardContent className="p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-muted-foreground uppercase">Status:</span>
                {getStatusBadge(jobCard.status)}
              </div>
              <div className="flex items-center gap-2 border-l pl-4">
                <span className="text-xs font-semibold text-muted-foreground uppercase">Payment Status:</span>
                <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200 uppercase">
                  {jobCard.payment_status || "Pending"}
                </span>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-muted-foreground mr-1">Change Status:</span>
              <Button
                size="sm"
                variant={jobCard.status === "new" ? "default" : "outline"}
                disabled={updatingStatus}
                onClick={() => handleStatusChange("new")}
                className="h-8 text-xs"
              >
                New
              </Button>
              <Button
                size="sm"
                variant={jobCard.status === "in_progress" ? "default" : "outline"}
                disabled={updatingStatus}
                onClick={() => handleStatusChange("in_progress")}
                className="h-8 text-xs"
              >
                In Progress
              </Button>
              <Button
                size="sm"
                variant={jobCard.status === "waiting" ? "default" : "outline"}
                disabled={updatingStatus}
                onClick={() => handleStatusChange("waiting")}
                className="h-8 text-xs"
              >
                Waiting
              </Button>
              <Button
                size="sm"
                variant={jobCard.status === "completed" ? "default" : "outline"}
                disabled={updatingStatus}
                onClick={() => handleStatusChange("completed")}
                className="h-8 text-xs"
              >
                Completed
              </Button>
              <Button
                size="sm"
                variant={jobCard.status === "cancelled" ? "destructive" : "outline"}
                disabled={updatingStatus}
                onClick={() => handleStatusChange("cancelled")}
                className="h-8 text-xs"
              >
                Cancelled
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Screen Job Sheet (Hidden during print) */}
      <div className="no-print p-8 rounded-xl border bg-card text-card-foreground shadow-sm space-y-6">
        {/* Document Header with Workshop Branding */}
        <div className="flex flex-col md:flex-row justify-between border-b pb-6 gap-4">
          <div>
            <h2 className="text-xl font-black tracking-tight text-red-600 dark:text-red-500 uppercase">
              ATIQ JEHAN AUTO REPAIR &amp; USED SPARE PARTS L.L.C.
            </h2>
            <p className="text-xs text-muted-foreground mt-1 font-semibold">Specialized Auto Repairing, Maintenance &amp; Diagnostic Workshop</p>
            <p className="text-xs text-muted-foreground">Al Dhafra Region, Madinat Zayed, MZE16, ST 04 • Phone: +971-501233517, +971-501517497</p>
            <p className="text-xs font-mono text-muted-foreground">TRN: 100456789000003</p>
          </div>
          <div className="md:text-right">
            <span className="text-xs font-bold text-red-600 uppercase tracking-widest bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 px-2.5 py-1 rounded">
              WORKSHOP JOB CARD
            </span>
            <p className="text-2xl font-black text-red-600 dark:text-red-500 mt-2 font-mono">{jobCard.job_card_number}</p>
            {jobCard.invoice_number && (
              <div className="mt-1 inline-block border border-black dark:border-slate-600 px-2.5 py-0.5 font-bold text-xs bg-gray-50 dark:bg-slate-800 text-black dark:text-white rounded shadow-sm">
                INVOICE NO: <span className="font-mono font-black text-sm text-black dark:text-white ml-1">{jobCard.invoice_number}</span>
              </div>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              Order Date: <span className="font-semibold text-foreground">{formatDate(jobCard.date || jobCard.created_at)}</span>
            </p>
            <div className="mt-1.5 flex md:justify-end items-center gap-2 text-xs">
              <span className="text-muted-foreground font-semibold">Payment Status:</span>
              <span
                className={`font-black uppercase text-[11px] px-2.5 py-0.5 rounded border ${
                  /cash|bank\s*transfer|credit\s*card|paid/i.test(jobCard.payment_status || "Pending")
                    ? "bg-green-50 text-green-700 border-green-200 dark:bg-green-950/40 dark:text-green-300 dark:border-green-800"
                    : "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800"
                }`}
              >
                {jobCard.payment_status || "Pending"}
              </span>
            </div>
          </div>
        </div>

        {/* Customer & Vehicle Information Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Customer Details Box */}
          <div className="p-4 rounded-xl border bg-muted/20 space-y-2 text-xs">
            <h4 className="font-bold text-foreground text-sm flex items-center justify-between border-b pb-2">
              <span className="flex items-center gap-1.5">
                <User className="h-4 w-4 text-primary" /> Customer Owner Details
              </span>
              {jobCard.customer_id && (
                <Link href={`/customers/${jobCard.customer_id}`} className="text-primary hover:underline text-[11px]">
                  View Profile →
                </Link>
              )}
            </h4>
            <div className="grid grid-cols-2 gap-3 pt-1">
              <div>
                <span className="text-muted-foreground uppercase text-[10px] font-semibold">Customer Name:</span>
                <p className="font-bold text-foreground text-sm">{jobCard.customer?.name || "N/A"}</p>
                {jobCard.customer?.company_name && (
                  <p className="text-[11px] text-muted-foreground font-semibold mt-0.5">{jobCard.customer.company_name}</p>
                )}
              </div>
              <div>
                <span className="text-muted-foreground uppercase text-[10px] font-semibold">Company / Customer TRN No:</span>
                <p className="font-mono font-bold text-blue-600 dark:text-blue-400 mt-0.5">{jobCard.customer?.trn_number || "—"}</p>
              </div>
              <div>
                <span className="text-muted-foreground uppercase text-[10px] font-semibold">Mobile Phone:</span>
                <p className="font-semibold text-foreground">{jobCard.customer?.mobile || "N/A"}</p>
              </div>
              <div>
                <span className="text-muted-foreground uppercase text-[10px] font-semibold">Address / Emirate:</span>
                <p className="font-medium text-foreground">{jobCard.customer?.address || "UAE"}</p>
              </div>
            </div>
          </div>

          {/* Vehicle Specifications Box */}
          <div className="p-4 rounded-xl border bg-muted/20 space-y-2 text-xs">
            <h4 className="font-bold text-foreground text-sm flex items-center justify-between border-b pb-2">
              <span className="flex items-center gap-1.5">
                <Car className="h-4 w-4 text-primary" /> Vehicle Specifications
              </span>
              {jobCard.vehicle_id && (
                <Link href={`/vehicles/${jobCard.vehicle_id}`} className="text-primary hover:underline text-[11px]">
                  View Vehicle →
                </Link>
              )}
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-1">
              <div>
                <span className="text-muted-foreground uppercase text-[10px] font-semibold">Vehicle:</span>
                <p className="font-bold text-foreground text-sm">
                  {jobCard.vehicle?.make} {jobCard.vehicle?.model}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground uppercase text-[10px] font-semibold">Year:</span>
                <p className="font-bold text-foreground text-sm font-mono">{jobCard.vehicle?.year || "N/A"}</p>
              </div>
              <div>
                <span className="text-muted-foreground uppercase text-[10px] font-semibold">Color:</span>
                <p className="font-bold text-foreground text-sm">{jobCard.vehicle?.color || "N/A"}</p>
              </div>
              <div>
                <span className="text-muted-foreground uppercase text-[10px] font-semibold">Registration No:</span>
                <p className="font-bold text-primary text-sm font-mono">{jobCard.vehicle?.registration_number || "N/A"}</p>
              </div>
              <div>
                <span className="text-muted-foreground uppercase text-[10px] font-semibold">Chassis / VIN:</span>
                <p className="font-mono font-semibold text-foreground break-all">{jobCard.vehicle?.chassis_vin || "N/A"}</p>
              </div>
              <div>
                <span className="text-muted-foreground uppercase text-[10px] font-semibold">Mileage:</span>
                <p className="font-bold text-foreground">
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

        {/* Complaints, Mechanic Assignment & Work Details */}
        <div className="p-4 rounded-xl border bg-muted/10 space-y-4 text-xs">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <span className="font-bold text-foreground uppercase tracking-wide flex items-center gap-1.5">
                Customer Complaint / Reported Issue:
              </span>
              <p className="mt-1 text-foreground whitespace-pre-wrap leading-relaxed">
                {jobCard.customer_complaint || "No specific customer complaint documented."}
              </p>
            </div>
            <div>
              <span className="font-bold text-foreground uppercase tracking-wide flex items-center gap-1.5">
                Assigned Mechanic & Workshop Notes:
              </span>
              <p className="mt-1 text-foreground font-semibold">
                Technician: <span className="text-primary">{jobCard.assigned_mechanic || "Unassigned"}</span>
              </p>
              <p className="mt-1 text-muted-foreground whitespace-pre-wrap leading-relaxed">
                {jobCard.notes || "No internal supervisor notes recorded."}
              </p>
            </div>
          </div>

          {/* Work Details / Technician Notes */}
          <div className="pt-3 border-t">
            <span className="font-bold text-foreground uppercase tracking-wide flex items-center gap-1.5 text-primary">
              <Sparkles className="h-4 w-4" /> Work Details & Technician Findings:
            </span>
            <p className="mt-1 font-mono text-xs bg-background p-3 rounded-lg border text-foreground whitespace-pre-wrap leading-relaxed">
              {jobCard.work_details || "Standard diagnostic and workshop maintenance procedures completed."}
            </p>
          </div>
        </div>

        {/* Services & Labour Breakdown Table */}
        <div className="space-y-3">
          <h4 className="font-bold text-sm text-foreground flex items-center gap-2">
            <Wrench className="h-4 w-4 text-primary" /> Services & Labour Breakdown ({serviceItems.length})
          </h4>
          {serviceItems.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[45%]">Service Description / Scope</TableHead>
                  <TableHead className="w-[10%] text-center">Qty</TableHead>
                  <TableHead className="w-[15%] text-right">Unit Rate</TableHead>
                  <TableHead className="w-[15%] text-right">Labour</TableHead>
                  <TableHead className="w-[15%] text-right font-bold">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {serviceItems.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium text-foreground">{item.description}</TableCell>
                    <TableCell className="text-center">{item.quantity}</TableCell>
                    <TableCell className="text-right font-mono">{formatAmount(item.unit_price)}</TableCell>
                    <TableCell className="text-right font-mono">{formatAmount(item.labour_charge || 0)}</TableCell>
                    <TableCell className="text-right font-bold font-mono text-foreground">
                      {formatAmount(item.total_price)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-xs text-muted-foreground italic py-2">No service lines recorded.</p>
          )}
        </div>

        {/* Spare Parts Breakdown Table */}
        <div className="space-y-3">
          <h4 className="font-bold text-sm text-foreground flex items-center gap-2">
            <Package className="h-4 w-4 text-primary" /> Spare Parts Installed ({partItems.length})
          </h4>
          {partItems.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[50%]">Spare Part Name / Code</TableHead>
                  <TableHead className="w-[15%] text-center">Qty Used</TableHead>
                  <TableHead className="w-[15%] text-right">Unit Price</TableHead>
                  <TableHead className="w-[20%] text-right font-bold">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {partItems.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium text-foreground">
                      <div className="flex items-center gap-2">
                        <span>{item.description}</span>
                        {item.part_id ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/40 dark:text-blue-300">
                            Inventory Linked
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                            Custom Part
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-center font-mono font-bold text-foreground">{item.quantity}</TableCell>
                    <TableCell className="text-right font-mono">{formatAmount(item.unit_price)}</TableCell>
                    <TableCell className="text-right font-bold font-mono text-foreground">
                      {formatAmount(item.total_price)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-xs text-muted-foreground italic py-2">No spare parts recorded on this job card.</p>
          )}
        </div>

        {/* Attachments Section */}
        <div className="space-y-3 border-t pt-4">
          <div className="flex items-center justify-between">
            <h4 className="font-bold text-sm text-foreground flex items-center gap-2">
              <Paperclip className="h-4 w-4 text-primary" /> Attachments & Documents ({attachments.length})
            </h4>
            <Button size="sm" variant="outline" onClick={() => setAttachmentModalOpen(true)} className="gap-1 text-xs">
              <Plus className="h-3.5 w-3.5" /> Add Attachment
            </Button>
          </div>

          {attachments.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {attachments.map((att) => (
                <div key={att.id} className="p-3 rounded-lg border bg-muted/10 space-y-2 text-xs">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      {att.file_type.includes("pdf") ? (
                        <FileText className="h-5 w-5 text-primary shrink-0" />
                      ) : (
                        <ImageIcon className="h-5 w-5 text-emerald-500 shrink-0" />
                      )}
                      <div className="min-w-0">
                        <p className="font-bold truncate">{att.file_name}</p>
                        <span className="inline-block px-1.5 py-0.5 rounded text-[9px] bg-primary/10 text-primary uppercase font-bold mt-0.5">
                          {att.document_type.replace("_", " ")}
                        </span>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteAttachment(att.id)}
                      className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive shrink-0"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  {att.description && <p className="text-[11px] text-muted-foreground line-clamp-2">{att.description}</p>}
                  <div className="flex items-center justify-between pt-1 border-t text-[10px] text-muted-foreground">
                    <span>{(att.file_size / 1024 / 1024).toFixed(2)} MB</span>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setPreviewDoc(att)}
                        className="h-6 px-2 text-[10px] gap-1"
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
            <div className="p-4 text-center rounded-lg border border-dashed text-xs text-muted-foreground">
              No files or photos attached to this digital job card. Click "Add Attachment" to upload inspection photos or invoices.
            </div>
          )}
        </div>

        {/* Financial Summary & Auto-Calculated Totals Breakdown */}
        <div className="border-t pt-4 flex flex-col md:flex-row justify-between items-start gap-6">
          <div className="text-xs text-muted-foreground space-y-1.5 max-w-md">
            <p className="font-bold text-foreground uppercase tracking-wide">Workshop Terms & Warranties:</p>
            <p>1. Repair estimates are subject to initial mechanical inspection.</p>
            <p>2. Used spare parts carry a testing warranty of 7 days unless specified otherwise.</p>
            <p>3. Vehicle release requires settled invoice or pre-approved corporate payment terms.</p>
          </div>

          <div className="w-full md:w-80 p-4 rounded-xl border bg-muted/20 space-y-2 text-xs">
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
            <div className="border-t pt-2 flex justify-between font-semibold">
              <span>Subtotal:</span>
              <span className="font-bold text-foreground font-mono">{formatAmount(jobCard.subtotal)}</span>
            </div>
            {Number(jobCard.discount) > 0 && (
              <div className="flex justify-between text-emerald-600 font-medium">
                <span>Discount:</span>
                <span className="font-mono">-{formatAmount(jobCard.discount)}</span>
              </div>
            )}
            <div className="flex justify-between text-muted-foreground">
              <span>VAT ({jobCard.vat_rate}%):</span>
              <span className="font-medium text-foreground font-mono">{formatAmount(jobCard.vat_amount)}</span>
            </div>
            <div className="border-t-2 border-black dark:border-white bg-slate-100/80 dark:bg-slate-800/80 p-2.5 rounded-lg flex justify-between text-base font-black text-foreground">
              <span className="uppercase tracking-wide">Total Amount:</span>
              <span className="font-mono font-black">AED {formatAmount(jobCard.total)}</span>
            </div>
            <div className="flex justify-between text-xs text-muted-foreground pt-1 border-t">
              <span>Paid Amount:</span>
              <span className="font-semibold text-emerald-600 font-mono">{formatAmount(jobCard.paid || 0)}</span>
            </div>
            <div className="flex justify-between text-xs font-bold text-amber-600">
              <span>Outstanding Balance:</span>
              <span className="font-mono">{formatAmount(jobCard.balance)}</span>
            </div>
          </div>
        </div>

        {/* Signatures Section */}
        <div className="pt-6 border-t">
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-bold text-xs uppercase tracking-wider text-foreground">Signatures</h4>
            <span className="text-[11px] text-muted-foreground">Authorized Workshop &amp; Customer Manual Signature Area</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 text-xs">
            {/* LEFT: ATIQ JEHAN AUTO REPAIR */}
            <div className="p-4 rounded-xl border bg-muted/10 flex flex-col justify-between min-h-[110px]">
              <div>
                <p className="font-bold text-xs uppercase tracking-wider text-foreground">
                  ATIQ JEHAN AUTO REPAIR
                </p>
                <p className="text-[11px] text-muted-foreground font-medium mt-0.5">
                  Authorized Signature
                </p>
              </div>
              <div className="pt-8">
                <div className="border-b-2 border-dashed border-muted-foreground/40 w-full"></div>
              </div>
            </div>

            {/* RIGHT: CUSTOMER */}
            <div className="p-4 rounded-xl border bg-muted/10 flex flex-col justify-between min-h-[110px]">
              <div>
                <p className="font-bold text-xs uppercase tracking-wider text-foreground">
                  CUSTOMER
                </p>
                <p className="text-[11px] text-muted-foreground font-medium mt-0.5">
                  Customer Signature
                </p>
              </div>
              <div className="pt-8">
                <div className="border-b-2 border-dashed border-muted-foreground/40 w-full"></div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ─── Clean A4 Printable Template (Visible only when printing) ─── */}
      <JobCardPrintView jobCard={jobCard} />

      {/* Upload Attachment Dialog */}
      <Dialog open={attachmentModalOpen} onOpenChange={setAttachmentModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogTitle className="flex items-center gap-2">
            <Paperclip className="h-5 w-5 text-primary" /> Add Job Card Attachment
          </DialogTitle>
          <DialogDescription>
            Attach vehicle damage photos, paper inspection scans, or supplier part invoices.
          </DialogDescription>
          <form onSubmit={handleAddAttachmentSubmit} className="space-y-4 mt-2">
            <div className="space-y-2">
              <label className="text-xs font-semibold">Document Type</label>
              <select
                value={attDocType}
                onChange={(e) => setAttDocType(e.target.value as DocumentType)}
                className="flex h-9 w-full rounded-lg border border-input bg-background px-3 py-1 text-xs shadow-sm font-medium"
              >
                <option value="vehicle_photo">Vehicle Photo (Before / After)</option>
                <option value="inspection_photo">Inspection Scan / Diagnostic Report</option>
                <option value="supplier_document">Supplier Invoice / Parts Slip</option>
                <option value="paper_job_card">Paper Job Card Scan</option>
                <option value="other">Other Document</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold">File (PDF, PNG, JPG)</label>
              <input
                type="file"
                accept=".pdf,image/*"
                onChange={(e) => setAttFile(e.target.files?.[0] || null)}
                required
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-xs shadow-sm"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold">Description / Notes</label>
              <input
                type="text"
                placeholder="e.g. Front bumper damage photo before repair"
                value={attDescription}
                onChange={(e) => setAttDescription(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-xs shadow-sm"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button type="button" variant="outline" size="sm" onClick={() => setAttachmentModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={attUploading || !attFile}>
                {attUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Upload Attachment"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Document Preview Modal */}
      {previewDoc && (
        <Dialog open={!!previewDoc} onOpenChange={() => setPreviewDoc(null)}>
          <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
            <DialogTitle className="flex items-center justify-between pr-6">
              <span className="truncate">{previewDoc.file_name}</span>
            </DialogTitle>
            <DialogDescription>
              {previewDoc.document_type.replace("_", " ")} • {previewDoc.description || "No description"}
            </DialogDescription>
            <div className="mt-4 flex items-center justify-center p-4 bg-muted/20 rounded-lg min-h-[300px]">
              {previewDoc.file_type.includes("pdf") ? (
                <iframe src={previewDoc.file_url} className="w-full h-[500px] rounded border" title={previewDoc.file_name} />
              ) : (
                <img
                  src={previewDoc.file_url}
                  alt={previewDoc.file_name}
                  className="max-h-[500px] max-w-full rounded object-contain"
                />
              )}
            </div>
            <div className="flex justify-end gap-2 mt-4 pt-2 border-t">
              <a
                href={previewDoc.file_url}
                download={previewDoc.file_name}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center rounded-lg text-sm font-medium h-9 px-4 bg-primary text-primary-foreground hover:bg-primary/90 gap-2"
              >
                <Download className="h-4 w-4" /> Download File
              </a>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

export default JobCardDetailView;
