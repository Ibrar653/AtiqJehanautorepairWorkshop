"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  getInvoices,
  getInvoiceById,
  recordInvoicePayment,
  voidInvoice,
  generateInvoiceFromJobCard,
} from "@/lib/services/invoice-service";
import { getJobCards } from "@/lib/services/job-card-service";
import type { Invoice, Payment, PaymentStatus, PaymentMethod } from "@/types/database";
import { usePermissions } from "@/lib/context/auth-context";
import { PageHeader } from "@/components/shared/page-header";
import { InvoicePrintView } from "@/components/invoices/invoice-print-view";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  FileText,
  Search,
  Plus,
  Printer,
  Download,
  CreditCard,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  DollarSign,
  ChevronLeft,
  ChevronRight,
  Eye,
  Calendar,
  Sparkles,
  RefreshCw,
  SlidersHorizontal,
  XCircle,
  Receipt,
  User,
  Car,
  Phone,
  Building2,
  Ban,
  ArrowUpDown,
  TrendingDown,
  TrendingUp,
  Package,
  Wrench,
  AlertCircle,
  MoreVertical,
  Trash2,
  MessageSquare,
  X,
  Edit3,
} from "lucide-react";
import { formatCurrency, formatDate, formatAmount } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import { BulkActionBar } from "@/components/shared/bulk-action-bar";
import { RecordDeleteDialog } from "@/components/shared/record-delete-dialog";
import { softDeleteInvoice } from "@/lib/services/recycle-bin-service";
import { ForceDeleteInvoiceModal } from "./force-delete-invoice-modal";
import { bulkForceDeleteTestInvoices } from "@/lib/services/force-delete-invoice-service";
import { useWorkspace } from "@/lib/context/workspace-context";
import { DEFAULT_WORKSPACE_ID } from "@/lib/constants";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function InvoicesView() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user, isOwner, isManager, canEdit, canDelete } = usePermissions();
  const { currentWorkspace } = useWorkspace();
  const activeWorkspaceId = currentWorkspace?.id || DEFAULT_WORKSPACE_ID;


  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 15;

  // Owner Force Delete State
  const [forceDeleteModalOpen, setForceDeleteModalOpen] = useState(false);
  const [forceDeleting, setForceDeleting] = useState(false);


  // Filters & Search State
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [dateFilter, setDateFilter] = useState<"all" | "today" | "this_month" | "custom">("all");
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");

  // ─── View Invoice Details Modal ───
  const [detailsModalOpen, setDetailsModalOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<any | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

  // ─── Record Payment Modal ───
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [paymentInvoice, setPaymentInvoice] = useState<any | null>(null);
  const [payAmount, setPayAmount] = useState<number | "">("");
  const [payMethod, setPayMethod] = useState<PaymentMethod>("cash");
  const [payRef, setPayRef] = useState("");
  const [payNotes, setPayNotes] = useState("");
  const [payDate, setPayDate] = useState(new Date().toISOString().slice(0, 10));
  const [submittingPayment, setSubmittingPayment] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [paymentSuccess, setPaymentSuccess] = useState<string | null>(null);

  // ─── Void Invoice Modal ───
  const [voidModalOpen, setVoidModalOpen] = useState(false);
  const [invoiceToVoid, setInvoiceToVoid] = useState<any | null>(null);
  const [voidReason, setVoidReason] = useState("");
  const [voidingInvoice, setVoidingInvoice] = useState(false);
  const [voidError, setVoidError] = useState<string | null>(null);

  // ─── Convert Job Card Modal ───
  const [convertModalOpen, setConvertModalOpen] = useState(false);
  const [availableJobCards, setAvailableJobCards] = useState<any[]>([]);
  const [selectedJobCardId, setSelectedJobCardId] = useState("");
  const [converting, setConverting] = useState(false);
  const [convertError, setConvertError] = useState<string | null>(null);

  // ─── Print Invoice Target ───
  const [printInvoice, setPrintInvoice] = useState<any | null>(null);

  // ─── Bulk & Single Delete State ───
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState<string[]>([]);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [invoicesToDelete, setInvoicesToDelete] = useState<any[]>([]);
  const [isFinancialBlocked, setIsFinancialBlocked] = useState(false);
  const [financialBlockMessage, setFinancialBlockMessage] = useState<string | null>(null);
  const [deletingInvoices, setDeletingInvoices] = useState(false);
  const [toastMessage, setToastMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Debounce search input
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedQuery(searchQuery);
      setCurrentPage(1);
    }, 250);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  // Load Invoices
  const loadInvoicesList = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getInvoices({
        query: debouncedQuery,
        statusFilter,
        dateFilter,
        startDate: customStartDate || undefined,
        endDate: customEndDate || undefined,
        page: currentPage,
        limit: pageSize,
      });
      setInvoices(res.invoices);
      setTotalCount(res.total);
    } catch (e) {
      console.error("Error loading invoices:", e);
    } finally {
      setLoading(false);
    }
  }, [debouncedQuery, statusFilter, dateFilter, customStartDate, customEndDate, currentPage, pageSize]);

  useEffect(() => {
    loadInvoicesList();
  }, [loadInvoicesList]);

  // Handle URL query for auto-opening invoice details (e.g. ?invoice_id=...)
  useEffect(() => {
    const urlInvoiceId = searchParams.get("invoice_id");
    if (urlInvoiceId) {
      handleOpenDetails(urlInvoiceId);
    }
  }, [searchParams]);

  // KPIs
  const kpis = useMemo(() => {
    const activeInvoices = invoices.filter((inv) => !inv.is_void && inv.payment_status !== "void");
    const totalInvoicesCount = totalCount;
    const totalSalesValue = activeInvoices.reduce((sum, inv) => sum + (Number(inv.total) || 0), 0);
    const totalPaidValue = activeInvoices.reduce((sum, inv) => sum + (Number(inv.paid) || 0), 0);
    const totalOutstandingBalance = activeInvoices.reduce((sum, inv) => sum + (Number(inv.balance) || 0), 0);

    return { totalInvoicesCount, totalSalesValue, totalPaidValue, totalOutstandingBalance };
  }, [invoices, totalCount]);

  // Open Details Modal
  const handleOpenDetails = async (invoiceId: string) => {
    setDetailsModalOpen(true);
    setLoadingDetails(true);
    try {
      const data = await getInvoiceById(invoiceId);
      setSelectedInvoice(data);
      setPrintInvoice(data);
    } catch (e) {
      console.error("Error loading invoice details:", e);
    } finally {
      setLoadingDetails(false);
    }
  };

  // Open Record Payment Modal
  const handleOpenRecordPayment = (inv: any) => {
    setPaymentInvoice(inv);
    const bal = Number(inv.balance !== undefined ? inv.balance : inv.total - (inv.paid || 0));
    setPayAmount(bal > 0 ? bal : "");
    setPayMethod("cash");
    setPayRef("REC-" + Math.floor(1000 + Math.random() * 9000));
    setPayNotes("");
    setPayDate(new Date().toISOString().slice(0, 10));
    setPaymentError(null);
    setPaymentSuccess(null);
    setPaymentModalOpen(true);
  };

  // Submit Record Payment
  const handleSavePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!paymentInvoice) return;

    const amt = Number(payAmount);
    if (isNaN(amt) || amt <= 0) {
      setPaymentError("Please enter a valid payment amount greater than zero.");
      return;
    }

    setSubmittingPayment(true);
    setPaymentError(null);

    try {
      await recordInvoicePayment(
        paymentInvoice.id,
        amt,
        payMethod,
        payRef.trim() || null,
        payNotes.trim() || null,
        payDate,
        user?.full_name || "Owner"
      );

      setPaymentSuccess(`Payment of ${formatCurrency(amt)} recorded successfully!`);
      await loadInvoicesList();

      if (detailsModalOpen && selectedInvoice?.id === paymentInvoice.id) {
        const refreshed = await getInvoiceById(paymentInvoice.id);
        setSelectedInvoice(refreshed);
        setPrintInvoice(refreshed);
      }

      setTimeout(() => {
        setPaymentModalOpen(false);
        setPaymentSuccess(null);
      }, 1200);
    } catch (err: any) {
      setPaymentError(err.message || "Failed to record payment.");
    } finally {
      setSubmittingPayment(false);
    }
  };

  // Open Void Modal
  const handleOpenVoidModal = (inv: any) => {
    setInvoiceToVoid(inv);
    setVoidReason("");
    setVoidError(null);
    setVoidModalOpen(true);
  };

  // Submit Void Invoice
  const handleConfirmVoid = async () => {
    if (!invoiceToVoid) return;
    if (!voidReason.trim()) {
      setVoidError("Please provide a reason for voiding this invoice.");
      return;
    }

    setVoidingInvoice(true);
    setVoidError(null);

    try {
      await voidInvoice(invoiceToVoid.id, voidReason.trim(), user?.full_name || "Owner");
      await loadInvoicesList();

      if (detailsModalOpen && selectedInvoice?.id === invoiceToVoid.id) {
        const refreshed = await getInvoiceById(invoiceToVoid.id);
        setSelectedInvoice(refreshed);
        setPrintInvoice(refreshed);
      }

      setVoidModalOpen(false);
    } catch (err: any) {
      setVoidError(err.message || "Failed to void invoice.");
    } finally {
      setVoidingInvoice(false);
    }
  };

  // WhatsApp share
  const handleWhatsAppShare = (inv: any) => {
    const mobile = inv.customer?.mobile || "";
    const cleanMobile = mobile.replace(/[^0-9]/g, "");
    const text = encodeURIComponent(
      `Hello ${inv.customer?.name || "Valued Customer"},\nYour Invoice #${inv.invoice_number} from ATIQ JEHAN AUTO REPAIR for amount AED ${Number(inv.total || 0).toFixed(2)} is ready.\nBalance Due: AED ${Number(inv.balance !== undefined ? inv.balance : inv.total - (inv.paid || 0)).toFixed(2)}.\nThank you for your business!`
    );
    window.open(`https://wa.me/${cleanMobile}?text=${text}`, "_blank");
  };

  // Selection handlers
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedInvoiceIds(invoices.map((i) => i.id));
    } else {
      setSelectedInvoiceIds([]);
    }
  };

  const handleToggleSelectInvoice = (id: string) => {
    setSelectedInvoiceIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  // Financial safety check: invoice cannot be deleted if paid > 0 or has recorded payments
  const checkInvoiceDeleteable = (inv: any) => {
    const paid = Number(inv.paid) || 0;
    if (paid > 0) {
      return {
        canDelete: false,
        reason: `Invoice #${inv.invoice_number} has recorded payments of ${formatCurrency(paid)} and cannot be deleted directly.`,
      };
    }
    if (inv.payment_status === "paid" || inv.payment_status === "partially_paid") {
      return {
        canDelete: false,
        reason: `Invoice #${inv.invoice_number} has financial transactions recorded and cannot be deleted directly.`,
      };
    }
    return { canDelete: true };
  };

  const handleRequestSingleDelete = (inv: any) => {
    const check = checkInvoiceDeleteable(inv);
    setInvoicesToDelete([inv]);
    if (!check.canDelete) {
      setIsFinancialBlocked(true);
      setFinancialBlockMessage(check.reason || "This invoice has financial transactions and cannot be deleted directly.");
    } else {
      setIsFinancialBlocked(false);
      setFinancialBlockMessage(null);
    }
    setDeleteDialogOpen(true);
  };

  const handleRequestBulkDelete = () => {
    if (selectedInvoiceIds.length === 0) return;
    const targets = invoices.filter((i) => selectedInvoiceIds.includes(i.id));
    const blocked = targets.find((i) => !checkInvoiceDeleteable(i).canDelete);

    setInvoicesToDelete(targets);
    if (blocked) {
      setIsFinancialBlocked(true);
      setFinancialBlockMessage(
        `Invoice #${blocked.invoice_number} has financial transactions (recorded payments) and cannot be deleted directly.`
      );
    } else {
      setIsFinancialBlocked(false);
      setFinancialBlockMessage(null);
    }
    setDeleteDialogOpen(true);
  };

  const handleConfirmDeleteInvoices = async () => {
    if (invoicesToDelete.length === 0 || isFinancialBlocked) return;
    setDeletingInvoices(true);
    try {
      for (const inv of invoicesToDelete) {
        await softDeleteInvoice(inv.id, user?.full_name || "Owner");
      }
      const count = invoicesToDelete.length;
      setSelectedInvoiceIds([]);
      setDeleteDialogOpen(false);
      setInvoicesToDelete([]);
      await loadInvoicesList();
      setToastMessage({
        type: "success",
        text: `${count} invoice${count > 1 ? "s" : ""} moved to Recycle Bin.`,
      });
    } catch (err: any) {
      console.error("Error deleting invoices:", err);
      setToastMessage({
        type: "error",
        text: err.message || "Failed to delete invoices",
      });
    } finally {
      setDeletingInvoices(false);
    }
  };

  const handleConfirmForceDelete = async () => {
    if (invoicesToDelete.length === 0) return;
    setForceDeleting(true);
    try {
      const ids = invoicesToDelete.map((i) => i.id);
      const res = await bulkForceDeleteTestInvoices(
        ids,
        activeWorkspaceId,
        user?.full_name || "Primary Owner"
      );

      setToastMessage({
        type: "success",
        text: `Permanently removed ${res.totalDeleted} test invoice(s) and cleared AED ${res.totalPaymentsRemoved.toFixed(2)} in linked test payments.`,
      });

      setSelectedInvoiceIds([]);
      setInvoicesToDelete([]);
      setForceDeleteModalOpen(false);
      setDeleteDialogOpen(false);
      await loadInvoicesList();
    } catch (err: any) {
      console.error("Force delete error:", err);
      setToastMessage({
        type: "error",
        text: err.message || "Failed to force delete test invoice(s)",
      });
    } finally {
      setForceDeleting(false);
    }
  };


  // Open Convert Job Card Modal
  const handleOpenConvertModal = async () => {
    setConvertError(null);
    setSelectedJobCardId("");
    setConvertModalOpen(true);

    try {
      const res = await getJobCards({ search: "", status: "all", page: 1, limit: 100 });
      setAvailableJobCards(res.jobCards || []);
      if (res.jobCards && res.jobCards.length > 0) {
        setSelectedJobCardId(res.jobCards[0].id);
      }
    } catch (e) {
      console.warn("Could not load job cards for conversion:", e);
    }
  };

  // Submit Convert Job Card
  const handleConvertJobCard = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedJobCardId) {
      setConvertError("Please select a Job Card to convert.");
      return;
    }

    setConverting(true);
    setConvertError(null);

    try {
      const inv = await generateInvoiceFromJobCard(selectedJobCardId, user?.full_name || "Owner");
      await loadInvoicesList();
      setConvertModalOpen(false);
      handleOpenDetails(inv.id);
    } catch (err: any) {
      setConvertError(err.message || "Failed to convert job card.");
    } finally {
      setConverting(false);
    }
  };

  // Direct Print Invoice
  const handleTriggerPrint = (inv: any) => {
    setPrintInvoice(inv);
    setTimeout(() => {
      window.print();
    }, 200);
  };

  const totalPages = Math.ceil(totalCount / pageSize);

  return (
    <div className="space-y-6">
      {/* ─── Hidden A4 Printable Invoice ─── */}
      {printInvoice && <InvoicePrintView invoice={printInvoice} />}

      {/* ─── Screen UI (Hidden during print) ─── */}
      <div className="no-print space-y-6">
        <PageHeader
          title="Tax Invoices"
          description="Manage customer billing, VAT calculations, split payment collections, and official A4 tax invoices."
          breadcrumbs={[
            { label: "Dashboard", href: "/" },
            { label: "Invoices" },
          ]}
          actions={
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={loadInvoicesList}
                className="h-9 gap-1.5 text-xs font-semibold"
                title="Refresh invoices"
              >
                <RefreshCw className="h-3.5 w-3.5" /> Refresh
              </Button>
              <Button
                size="sm"
                onClick={handleOpenConvertModal}
                className="h-9 gap-1.5 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"
              >
                <Plus className="h-4 w-4" /> Convert Job Card
              </Button>
            </div>
          }
        />

        {/* ─── Notification Toast Banner ─── */}
        {toastMessage && (
          <div
            className={`flex items-center justify-between p-3.5 rounded-xl border text-xs font-semibold ${
              toastMessage.type === "success"
                ? "bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800"
                : "bg-red-50 text-red-800 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800"
            }`}
          >
            <div className="flex items-center gap-2">
              {toastMessage.type === "success" ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              ) : (
                <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400 shrink-0" />
              )}
              <span>{toastMessage.text}</span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setToastMessage(null)}
              className="h-6 w-6 p-0 hover:bg-transparent"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}

        {/* ─── Top Financial KPI Cards ─── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <Card className="border border-border shadow-xs bg-card rounded-[10px]">
            <CardHeader className="flex flex-row items-center justify-between pb-2 p-5">
              <CardTitle className="text-eyebrow text-muted-foreground uppercase">
                Total Invoiced Sales
              </CardTitle>
              <div className="h-8 w-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <FileText className="h-4 w-4" />
              </div>
            </CardHeader>
            <CardContent className="p-5 pt-0">
              <div className="text-metric text-foreground">
                {formatCurrency(kpis.totalSalesValue)}
              </div>
              <p className="text-caption text-muted-foreground mt-1">
                From {kpis.totalInvoicesCount} active invoice(s)
              </p>
            </CardContent>
          </Card>

          <Card className="border border-border shadow-xs bg-card rounded-[10px]">
            <CardHeader className="flex flex-row items-center justify-between pb-2 p-5">
              <CardTitle className="text-eyebrow text-muted-foreground uppercase">
                Total Collected / Paid
              </CardTitle>
              <div className="h-8 w-8 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                <TrendingUp className="h-4 w-4" />
              </div>
            </CardHeader>
            <CardContent className="p-5 pt-0">
              <div className="text-metric text-emerald-600 dark:text-emerald-400">
                {formatCurrency(kpis.totalPaidValue)}
              </div>
              <p className="text-caption text-muted-foreground mt-1">Cash, Card &amp; Bank Collections</p>
            </CardContent>
          </Card>

          <Card className="border border-border shadow-xs bg-card rounded-[10px]">
            <CardHeader className="flex flex-row items-center justify-between pb-2 p-5">
              <CardTitle className="text-eyebrow text-muted-foreground uppercase">
                Customer Outstanding
              </CardTitle>
              <div className="h-8 w-8 rounded-lg bg-red-500/10 text-red-600 dark:text-red-400 flex items-center justify-center shrink-0">
                <TrendingDown className="h-4 w-4" />
              </div>
            </CardHeader>
            <CardContent className="p-5 pt-0">
              <div className="text-metric text-red-600 dark:text-red-400">
                {formatCurrency(kpis.totalOutstandingBalance)}
              </div>
              <p className="text-caption text-muted-foreground mt-1">Total pending customer receivables</p>
            </CardContent>
          </Card>

          <Card className="border border-border shadow-xs bg-card rounded-[10px]">
            <CardHeader className="flex flex-row items-center justify-between pb-2 p-5">
              <CardTitle className="text-eyebrow text-muted-foreground uppercase">
                Total Invoices
              </CardTitle>
              <div className="h-8 w-8 rounded-lg bg-muted text-muted-foreground flex items-center justify-center shrink-0">
                <Receipt className="h-4 w-4" />
              </div>
            </CardHeader>
            <CardContent className="p-5 pt-0">
              <div className="text-metric text-foreground">
                {totalCount}
              </div>
              <p className="text-caption text-muted-foreground mt-1">Tax invoice documents generated</p>
            </CardContent>
          </Card>
        </div>

        {/* ─── Search & Filter Bar ─── */}
        <Card className="border border-border shadow-xs bg-card rounded-[10px]">
          <CardContent className="p-4 space-y-3">
            <div className="flex flex-col md:flex-row items-center gap-3">
              {/* Search Box */}
              <div className="relative flex-1 w-full">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type="search"
                  placeholder="Search by Invoice No, Customer, Phone, Vehicle VIN or Plate..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 text-xs h-9 w-full rounded-lg border-border"
                />
              </div>

              {/* Status Filter Tabs */}
              <div className="inline-flex items-center gap-1 bg-muted/60 p-1 rounded-lg border border-border/50 overflow-x-auto w-full md:w-auto">
                {[
                  { key: "all", label: "All" },
                  { key: "paid", label: "Paid" },
                  { key: "partially_paid", label: "Partially Paid" },
                  { key: "credit", label: "Pending" },
                  { key: "void", label: "Void" },
                ].map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => {
                      setStatusFilter(tab.key);
                      setCurrentPage(1);
                    }}
                    className={`h-7 px-2.5 text-caption font-medium rounded-md whitespace-nowrap transition-all duration-150 ${
                      statusFilter === tab.key
                        ? "bg-card text-foreground shadow-xs font-semibold border border-border/60"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Date Filter Dropdown */}
              <div className="flex items-center gap-2 w-full md:w-auto">
                <select
                  value={dateFilter}
                  onChange={(e) => {
                    setDateFilter(e.target.value as any);
                    setCurrentPage(1);
                  }}
                  className="h-9 px-3 text-xs rounded-md border border-input bg-background font-medium focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  <option value="all">All Dates</option>
                  <option value="today">Today</option>
                  <option value="this_month">This Month</option>
                  <option value="custom">Custom Range</option>
                </select>
              </div>
            </div>

            {/* Custom Date Range Picker (shown when custom is selected) */}
            {dateFilter === "custom" && (
              <div className="flex flex-wrap items-center gap-3 pt-2 border-t text-xs">
                <div className="flex items-center gap-2">
                  <Label className="text-xs font-semibold">Start Date:</Label>
                  <Input
                    type="date"
                    value={customStartDate}
                    onChange={(e) => setCustomStartDate(e.target.value)}
                    className="h-8 text-xs w-36"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Label className="text-xs font-semibold">End Date:</Label>
                  <Input
                    type="date"
                    value={customEndDate}
                    onChange={(e) => setCustomEndDate(e.target.value)}
                    className="h-8 text-xs w-36"
                  />
                </div>
                <Button
                  size="sm"
                  onClick={loadInvoicesList}
                  className="h-8 text-xs px-3 font-semibold"
                >
                  Apply Date Range
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ─── Invoices Data Table ─── */}
        <Card className="border shadow-sm overflow-hidden">
          <CardContent className="p-0">
            {loading ? (
              <div className="py-24 text-center text-muted-foreground">
                <Loader2 className="h-8 w-8 mx-auto animate-spin mb-3 text-blue-600" />
                <p className="font-medium text-sm">Loading tax invoices...</p>
              </div>
            ) : invoices.length > 0 ? (
              <div className="overflow-x-auto">
                {selectedInvoiceIds.length > 0 && (
                  <div className="bg-slate-50 p-2 border-b flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-600">
                      {selectedInvoiceIds.length} items selected
                    </span>
                    <Button
                      variant="destructive"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={handleRequestBulkDelete}
                    >
                      <Trash2 className="h-3 w-3 mr-1.5" /> Delete Selected
                    </Button>
                  </div>
                )}
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50/70 dark:bg-slate-800/40 text-xs">
                      <TableHead className="w-[40px] pl-4">
                        <Checkbox
                          checked={
                            invoices.length > 0 && selectedInvoiceIds.length === invoices.length
                              ? true
                              : selectedInvoiceIds.length > 0
                              ? "indeterminate"
                              : false
                          }
                          onCheckedChange={handleSelectAll}
                          aria-label="Select all visible invoices"
                        />
                      </TableHead>
                      <TableHead className="font-bold text-foreground">Invoice</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead className="min-w-[180px]">Customer</TableHead>
                      <TableHead className="min-w-[180px]">Vehicle</TableHead>
                      <TableHead className="text-right">Total (AED)</TableHead>
                      <TableHead className="text-right">Paid (AED)</TableHead>
                      <TableHead className="text-right">Balance</TableHead>
                      <TableHead className="text-center w-[120px]">Status</TableHead>
                      <TableHead className="text-right pr-4 w-[160px]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {invoices.map((inv) => {
                      const tot = Number(inv.total) || 0;
                      const paid = Number(inv.paid) || 0;
                      const bal = Number(inv.balance !== undefined ? inv.balance : Math.max(0, tot - paid));
                      const isVoid = inv.payment_status === "void" || inv.is_void;

                      return (
                        <TableRow
                          key={inv.id}
                          className={`text-xs hover:bg-slate-50/70 dark:hover:bg-slate-800/50 transition-colors ${
                            isVoid ? "opacity-60 bg-slate-50/30" : ""
                          } ${selectedInvoiceIds.includes(inv.id) ? "bg-blue-50/40 dark:bg-blue-950/20" : ""}`}
                        >
                          <TableCell className="pl-4 py-3">
                            <Checkbox
                              checked={selectedInvoiceIds.includes(inv.id)}
                              onCheckedChange={() => handleToggleSelectInvoice(inv.id)}
                              aria-label={`Select invoice ${inv.invoice_number}`}
                            />
                          </TableCell>
                          <TableCell className="font-mono font-bold py-3 text-foreground">
                            <span className="cursor-pointer hover:underline text-blue-600" onClick={() => handleOpenDetails(inv.id)}>
                              {inv.invoice_number}
                            </span>
                            {inv.job_card && (
                              <span className="block text-[10px] font-mono text-muted-foreground font-normal">
                                JC: {inv.job_card.job_card_number}
                              </span>
                            )}
                          </TableCell>

                          <TableCell className="font-mono text-muted-foreground py-3">
                            {formatDate(inv.created_at || inv.date)}
                          </TableCell>

                          <TableCell className="py-3">
                            <div className="font-semibold text-foreground">{inv.customer?.name || "Cash Customer"}</div>
                            <div className="text-[11px] text-muted-foreground font-mono">
                              {inv.customer?.mobile || inv.customer?.company_name || "—"}
                            </div>
                          </TableCell>

                          <TableCell className="py-3">
                            {inv.vehicle ? (
                              <div>
                                <span className="font-semibold text-foreground">
                                  {inv.vehicle.make} {inv.vehicle.model}
                                </span>
                                <span className="block text-[11px] font-mono text-muted-foreground font-bold">
                                  {inv.vehicle.registration_number || "—"}
                                </span>
                              </div>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>

                          <TableCell className="text-right font-mono font-bold py-3 text-foreground">
                            {formatCurrency(tot)}
                          </TableCell>

                          <TableCell className="text-right font-mono font-bold text-emerald-600 dark:text-emerald-400 py-3">
                            {formatCurrency(paid)}
                          </TableCell>

                          <TableCell className="text-right font-mono font-black py-3">
                            <span className={bal > 0 && !isVoid ? "text-rose-600 dark:text-rose-400" : "text-emerald-600"}>
                              {formatCurrency(bal)}
                            </span>
                          </TableCell>

                          <TableCell className="text-center py-3">
                            <span
                              className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                                isVoid
                                  ? "bg-slate-100 text-slate-600 border-slate-300"
                                  : bal === 0 || inv.payment_status === "paid"
                                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                  : paid > 0
                                  ? "bg-amber-50 text-amber-700 border-amber-200"
                                  : "bg-rose-50 text-rose-700 border-rose-200"
                              }`}
                            >
                              {isVoid
                                ? "VOID"
                                : bal === 0 || inv.payment_status === "paid"
                                ? "PAID"
                                : paid > 0
                                ? "PARTIAL"
                                : "PENDING"}
                            </span>
                          </TableCell>

                          <TableCell className="text-right pr-4 py-3">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleOpenDetails(inv.id)}
                                className="h-8 px-2 text-xs text-blue-600 hover:text-blue-800 hover:bg-blue-50"
                                title="View invoice breakdown"
                              >
                                <Eye className="h-3.5 w-3.5 mr-1" /> View
                              </Button>

                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleTriggerPrint(inv)}
                                className="h-8 px-2 text-xs text-slate-700 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                                title="Print official A4 invoice"
                              >
                                <Printer className="h-3.5 w-3.5 mr-1" /> Print
                              </Button>

                              <DropdownMenu>
                                <DropdownMenuTrigger className="h-8 w-8 inline-flex items-center justify-center rounded-md border border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 focus:outline-none">
                                  <MoreVertical className="h-3.5 w-3.5" />
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-44 text-xs">
                                  <DropdownMenuLabel>Invoice Actions</DropdownMenuLabel>
                                  <DropdownMenuItem onClick={() => handleOpenDetails(inv.id)}>
                                    <Eye className="h-3.5 w-3.5 mr-2 text-blue-600" /> View Details
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => handleTriggerPrint(inv)}>
                                    <Printer className="h-3.5 w-3.5 mr-2 text-slate-600" /> Print A4
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => handleWhatsAppShare(inv)}>
                                    <MessageSquare className="h-3.5 w-3.5 mr-2 text-emerald-600" /> WhatsApp
                                  </DropdownMenuItem>

                                  {bal > 0 && !isVoid && canEdit && (
                                    <DropdownMenuItem onClick={() => handleOpenRecordPayment(inv)}>
                                      <CreditCard className="h-3.5 w-3.5 mr-2 text-emerald-600" /> Record Payment
                                    </DropdownMenuItem>
                                  )}

                                  {!isVoid && (isOwner || isManager || canDelete) && (
                                    <DropdownMenuItem
                                      onClick={() => handleOpenVoidModal(inv)}
                                      className="text-amber-600"
                                    >
                                      <Ban className="h-3.5 w-3.5 mr-2" /> Void Invoice
                                    </DropdownMenuItem>
                                  )}

                                  {(isOwner || isManager || canDelete) && (
                                    <>
                                      <DropdownMenuSeparator />
                                      <DropdownMenuItem
                                        onClick={() => handleRequestSingleDelete(inv)}
                                        className="text-rose-600 hover:text-rose-700 font-semibold focus:text-rose-600"
                                      >
                                        <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete
                                      </DropdownMenuItem>
                                    </>
                                  )}
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="py-20 text-center text-muted-foreground space-y-2">
                <FileText className="h-10 w-10 mx-auto text-muted-foreground/40" />
                <p className="text-sm font-semibold text-foreground">No tax invoice records found</p>
                <p className="text-xs max-w-sm mx-auto">
                  Invoices are automatically generated when converting completed Job Cards or creating new customer invoices.
                </p>
              </div>
            )}
          </CardContent>

          {/* Pagination Footer */}
          {totalPages > 1 && (
            <div className="p-4 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
              <span>
                Showing {(currentPage - 1) * pageSize + 1} to{" "}
                {Math.min(currentPage * pageSize, totalCount)} of {totalCount} invoices
              </span>
              <div className="flex items-center gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="h-8 text-xs"
                >
                  <ChevronLeft className="h-3.5 w-3.5 mr-1" /> Previous
                </Button>
                <span className="font-semibold px-2 font-mono">
                  {currentPage} / {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage >= totalPages}
                  className="h-8 text-xs"
                >
                  Next <ChevronRight className="h-3.5 w-3.5 ml-1" />
                </Button>
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* ========================================================================= */}
      {/* 1. INVOICE DETAILS MODAL                                                  */}
      {/* ========================================================================= */}
      <Dialog open={detailsModalOpen} onOpenChange={setDetailsModalOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between text-base font-bold text-foreground">
              <span className="flex items-center gap-2">
                <Receipt className="h-5 w-5 text-blue-600" />
                Tax Invoice {selectedInvoice?.invoice_number ? `#${selectedInvoice.invoice_number}` : ""}
              </span>
              {selectedInvoice && (
                <span className="text-xs font-mono font-normal text-muted-foreground">
                  Date: {formatDate(selectedInvoice.created_at || selectedInvoice.date)}
                </span>
              )}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Itemized services, spare parts catalog breakdown, VAT calculations, and split payment ledger.
            </DialogDescription>
          </DialogHeader>

          {loadingDetails ? (
            <div className="py-20 text-center text-muted-foreground">
              <Loader2 className="h-8 w-8 mx-auto animate-spin mb-3 text-blue-600" />
              <p className="font-medium text-sm">Loading invoice details...</p>
            </div>
          ) : selectedInvoice ? (
            <div className="space-y-4 pt-1">
              {/* Customer & Vehicle Info Header */}
              <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border text-xs grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <span className="text-muted-foreground block text-[10px] uppercase font-bold">Customer</span>
                  <span className="font-bold text-foreground">{selectedInvoice.customer?.name || "Cash Customer"}</span>
                  {selectedInvoice.customer?.company_name && (
                    <span className="block text-[11px] text-muted-foreground">{selectedInvoice.customer.company_name}</span>
                  )}
                </div>
                <div>
                  <span className="text-muted-foreground block text-[10px] uppercase font-bold">Vehicle</span>
                  <span className="font-bold text-foreground">
                    {selectedInvoice.vehicle ? `${selectedInvoice.vehicle.make} ${selectedInvoice.vehicle.model}` : "—"}
                  </span>
                  <span className="block text-[11px] font-mono font-bold text-blue-600">
                    {selectedInvoice.vehicle?.registration_number || "—"}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[10px] uppercase font-bold">Total Invoiced</span>
                  <span className="font-mono font-black text-foreground text-sm">
                    {formatCurrency(selectedInvoice.total)}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[10px] uppercase font-bold">Remaining Balance</span>
                  <span
                    className={`font-mono font-black text-sm ${
                      selectedInvoice.balance > 0 ? "text-rose-600" : "text-emerald-600"
                    }`}
                  >
                    {formatCurrency(selectedInvoice.balance || 0)}
                  </span>
                </div>
              </div>

              {/* Separate Services & Parts Item Tables */}
              {/* 1. Services */}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-foreground mb-1.5 flex items-center gap-1">
                  <Wrench className="h-3.5 w-3.5 text-blue-600" /> Labor &amp; Workshop Services
                </h4>
                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-slate-50 dark:bg-slate-800/60 text-xs font-bold">
                        <TableHead className="w-12 text-center">S.No</TableHead>
                        <TableHead>Service Description</TableHead>
                        <TableHead className="text-right w-28">Rate</TableHead>
                        <TableHead className="text-right w-28 pr-3">Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(selectedInvoice.items || []).filter((it: any) => it.item_type === "service" || !it.item_type).length > 0 ? (
                        (selectedInvoice.items || [])
                          .filter((it: any) => it.item_type === "service" || !it.item_type)
                          .map((it: any, i: number) => (
                            <TableRow key={i} className="text-xs border-b">
                              <TableCell className="text-center font-mono text-muted-foreground">{i + 1}</TableCell>
                              <TableCell className="font-semibold text-foreground">{it.description}</TableCell>
                              <TableCell className="text-right font-mono">{formatCurrency(it.unit_price)}</TableCell>
                              <TableCell className="text-right font-mono font-bold pr-3">{formatCurrency(it.total_price)}</TableCell>
                            </TableRow>
                          ))
                      ) : (
                        <TableRow>
                          <TableCell colSpan={4} className="text-center py-3 text-xs text-muted-foreground">
                            No service line items
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>

              {/* 2. Spare Parts */}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-foreground mb-1.5 flex items-center gap-1">
                  <Package className="h-3.5 w-3.5 text-emerald-600" /> Spare Parts &amp; Materials
                </h4>
                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-slate-50 dark:bg-slate-800/60 text-xs font-bold">
                        <TableHead className="w-12 text-center">S.No</TableHead>
                        <TableHead>Part Description</TableHead>
                        <TableHead className="text-center w-20">Qty</TableHead>
                        <TableHead className="text-right w-28">Unit Price</TableHead>
                        <TableHead className="text-right w-28 pr-3">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(selectedInvoice.items || []).filter((it: any) => it.item_type === "part").length > 0 ? (
                        (selectedInvoice.items || [])
                          .filter((it: any) => it.item_type === "part")
                          .map((it: any, i: number) => (
                            <TableRow key={i} className="text-xs border-b">
                              <TableCell className="text-center font-mono text-muted-foreground">{i + 1}</TableCell>
                              <TableCell className="font-semibold text-foreground">{it.description}</TableCell>
                              <TableCell className="text-center font-mono font-bold">{it.quantity}</TableCell>
                              <TableCell className="text-right font-mono">{formatCurrency(it.unit_price)}</TableCell>
                              <TableCell className="text-right font-mono font-bold pr-3">{formatCurrency(it.total_price)}</TableCell>
                            </TableRow>
                          ))
                      ) : (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center py-3 text-xs text-muted-foreground">
                            No spare part line items
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>

              {/* Financial Calculation Summary Table */}
              <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border text-xs grid grid-cols-2 sm:grid-cols-5 gap-2 text-center">
                <div className="p-2 bg-white dark:bg-slate-900 rounded-lg border">
                  <span className="text-muted-foreground block text-[10px] uppercase font-bold">Subtotal</span>
                  <span className="font-mono font-bold text-foreground text-xs">{formatCurrency(selectedInvoice.subtotal)}</span>
                </div>
                <div className="p-2 bg-white dark:bg-slate-900 rounded-lg border">
                  <span className="text-muted-foreground block text-[10px] uppercase font-bold">VAT ({selectedInvoice.vat_rate || 5}%)</span>
                  <span className="font-mono font-bold text-foreground text-xs">{formatCurrency(selectedInvoice.vat_amount)}</span>
                </div>
                <div className="p-2 bg-white dark:bg-slate-900 rounded-lg border">
                  <span className="text-muted-foreground block text-[10px] uppercase font-bold">Total Amount</span>
                  <span className="font-mono font-black text-foreground text-xs">{formatCurrency(selectedInvoice.total)}</span>
                </div>
                <div className="p-2 bg-white dark:bg-slate-900 rounded-lg border">
                  <span className="text-muted-foreground block text-[10px] uppercase font-bold">Paid Amount</span>
                  <span className="font-mono font-black text-emerald-600 text-xs">{formatCurrency(selectedInvoice.paid || 0)}</span>
                </div>
                <div className="p-2 bg-white dark:bg-slate-900 rounded-lg border">
                  <span className="text-muted-foreground block text-[10px] uppercase font-bold">Balance Due</span>
                  <span className={`font-mono font-black text-xs ${selectedInvoice.balance > 0 ? "text-rose-600" : "text-emerald-600"}`}>
                    {formatCurrency(selectedInvoice.balance || 0)}
                  </span>
                </div>
              </div>

              {/* Payment History Ledger */}
              {selectedInvoice.payments && selectedInvoice.payments.length > 0 && (
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-foreground mb-1.5 flex items-center gap-1">
                    <CreditCard className="h-3.5 w-3.5 text-emerald-600" /> Payment Transactions
                  </h4>
                  <div className="border rounded-lg overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-slate-50 dark:bg-slate-800/60 text-xs font-bold">
                          <TableHead>Payment Date</TableHead>
                          <TableHead>Method</TableHead>
                          <TableHead>Reference</TableHead>
                          <TableHead className="text-right pr-3">Amount</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {selectedInvoice.payments.map((pm: any, idx: number) => (
                          <TableRow key={idx} className="text-xs border-b">
                            <TableCell className="font-mono">{formatDate(pm.payment_date || pm.created_at)}</TableCell>
                            <TableCell className="uppercase font-semibold">{pm.payment_method}</TableCell>
                            <TableCell className="font-mono text-muted-foreground">{pm.reference_number || "Direct"}</TableCell>
                            <TableCell className="text-right font-mono font-bold text-emerald-600 pr-3">
                              {formatCurrency(pm.amount)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}

              {/* Signatures Section on Screen */}
              <div className="pt-3 border-t">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-bold text-xs uppercase tracking-wider text-foreground">Signatures</h4>
                  <span className="text-[11px] text-muted-foreground">Authorized Workshop &amp; Customer Manual Signature Area</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  {/* LEFT: ATIQ JEHAN AUTO REPAIR */}
                  <div className="p-3 rounded-xl border bg-slate-50 dark:bg-slate-800/40 flex flex-col justify-between min-h-[90px]">
                    <div>
                      <p className="font-bold text-xs uppercase tracking-wider text-foreground">
                        ATIQ JEHAN AUTO REPAIR
                      </p>
                      <p className="text-[11px] text-muted-foreground font-medium mt-0.5">
                        Authorized Signature
                      </p>
                    </div>
                    <div className="pt-6">
                      <div className="border-b-2 border-dashed border-muted-foreground/40 w-full"></div>
                    </div>
                  </div>

                  {/* RIGHT: CUSTOMER */}
                  <div className="p-3 rounded-xl border bg-slate-50 dark:bg-slate-800/40 flex flex-col justify-between min-h-[90px]">
                    <div>
                      <p className="font-bold text-xs uppercase tracking-wider text-foreground">
                        CUSTOMER
                      </p>
                      <p className="text-[11px] text-muted-foreground font-medium mt-0.5">
                        Customer Signature
                      </p>
                    </div>
                    <div className="pt-6">
                      <div className="border-b-2 border-dashed border-muted-foreground/40 w-full"></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          <DialogFooter className="pt-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Button
                variant="default"
                size="sm"
                onClick={() => handleTriggerPrint(selectedInvoice)}
                className="text-xs font-bold bg-slate-800 hover:bg-slate-900 text-white gap-1.5"
              >
                <Printer className="h-3.5 w-3.5" /> Print A4 Invoice
              </Button>

              {selectedInvoice && selectedInvoice.balance > 0 && !selectedInvoice.is_void && canEdit && (
                <Button
                  size="sm"
                  onClick={() => handleOpenRecordPayment(selectedInvoice)}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs gap-1"
                >
                  <CreditCard className="h-3.5 w-3.5" /> Record Payment
                </Button>
              )}
            </div>
            <Button variant="outline" size="sm" onClick={() => setDetailsModalOpen(false)} className="text-xs">
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ========================================================================= */}
      {/* 2. RECORD PAYMENT MODAL DIALOG                                            */}
      {/* ========================================================================= */}
      <Dialog open={paymentModalOpen} onOpenChange={setPaymentModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-bold text-foreground">
              <CreditCard className="h-5 w-5 text-emerald-600" /> Record Invoice Payment
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Add payment for Invoice #{paymentInvoice?.invoice_number}. Multiple split payments are preserved in the ledger.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSavePayment} className="space-y-4 pt-1">
            {paymentError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-md text-xs font-semibold text-rose-700 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>{paymentError}</span>
              </div>
            )}

            {paymentSuccess && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-md text-xs font-semibold text-emerald-700 flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <span>{paymentSuccess}</span>
              </div>
            )}

            <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg border text-xs grid grid-cols-2 gap-2">
              <div>
                <span className="text-muted-foreground block text-[10px] uppercase font-bold">Total Invoiced:</span>
                <span className="font-mono font-bold text-foreground">{formatCurrency(paymentInvoice?.total || 0)}</span>
              </div>
              <div>
                <span className="text-muted-foreground block text-[10px] uppercase font-bold">Remaining Balance:</span>
                <span className="font-mono font-black text-rose-600">{formatCurrency(paymentInvoice?.balance || 0)}</span>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Payment Amount (AED) *</Label>
              <Input
                type="number"
                min="0.01"
                step="0.01"
                required
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value === "" ? "" : Number(e.target.value))}
                placeholder="0.00"
                className="font-mono font-bold text-sm h-9"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Payment Method *</Label>
                <select
                  value={payMethod}
                  onChange={(e) => setPayMethod(e.target.value as PaymentMethod)}
                  className="w-full h-9 px-3 text-xs rounded-md border border-input bg-background font-medium focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  <option value="cash">Cash</option>
                  <option value="bank_transfer">Bank Transfer</option>
                  <option value="credit_card">Credit Card</option>
                  <option value="cheque">Cheque</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Payment Date</Label>
                <Input
                  type="date"
                  value={payDate}
                  onChange={(e) => setPayDate(e.target.value)}
                  className="text-xs h-9"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Reference / Receipt Number</Label>
              <Input
                type="text"
                placeholder="e.g. TR-98234, Cash Slip #01"
                value={payRef}
                onChange={(e) => setPayRef(e.target.value)}
                className="text-xs h-9"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Payment Notes</Label>
              <Input
                type="text"
                placeholder="Optional notes or remarks"
                value={payNotes}
                onChange={(e) => setPayNotes(e.target.value)}
                className="text-xs h-9"
              />
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setPaymentModalOpen(false)}
                disabled={submittingPayment}
                className="text-xs"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={submittingPayment}
                className="text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {submittingPayment ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <CheckCircle2 className="h-3.5 w-3.5 mr-1" />}
                Confirm Payment
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ========================================================================= */}
      {/* 3. VOID INVOICE MODAL DIALOG                                              */}
      {/* ========================================================================= */}
      <Dialog open={voidModalOpen} onOpenChange={setVoidModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-bold text-rose-600">
              <Ban className="h-5 w-5" /> Void Tax Invoice
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Are you sure you want to void Invoice #{invoiceToVoid?.invoice_number}? This will cancel outstanding receivables while preserving payment history for financial audits.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 pt-2">
            {voidError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-md text-xs font-semibold text-rose-700 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>{voidError}</span>
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Reason for Voiding *</Label>
              <Textarea
                required
                placeholder="Explain why this invoice is being voided (e.g. Duplicate order, incorrect billing rate, customer cancellation)..."
                value={voidReason}
                onChange={(e) => setVoidReason(e.target.value)}
                className="text-xs min-h-[80px]"
              />
            </div>
          </div>

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setVoidModalOpen(false)}
              disabled={voidingInvoice}
              className="text-xs"
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={voidingInvoice}
              onClick={handleConfirmVoid}
              className="text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white"
            >
              {voidingInvoice ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Ban className="h-3.5 w-3.5 mr-1" />}
              Confirm Void Invoice
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ========================================================================= */}
      {/* 4. CONVERT JOB CARD MODAL DIALOG                                          */}
      {/* ========================================================================= */}
      <Dialog open={convertModalOpen} onOpenChange={setConvertModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-bold text-foreground">
              <Plus className="h-5 w-5 text-emerald-600" /> Convert Job Card to Invoice
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Select an existing Job Card to instantly generate its official Tax Invoice with auto-populated services and spare parts.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleConvertJobCard} className="space-y-4 pt-1">
            {convertError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-md text-xs font-semibold text-rose-700 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>{convertError}</span>
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Select Job Card *</Label>
              <select
                required
                value={selectedJobCardId}
                onChange={(e) => setSelectedJobCardId(e.target.value)}
                className="w-full h-9 px-3 text-xs rounded-md border border-input bg-background font-medium focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="" disabled>
                  -- Select a Job Card --
                </option>
                {availableJobCards.map((jc) => (
                  <option key={jc.id} value={jc.id}>
                    {jc.job_card_number} — {jc.customer?.name || "Customer"} ({formatCurrency(jc.total)})
                  </option>
                ))}
              </select>
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setConvertModalOpen(false)}
                disabled={converting}
                className="text-xs"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={converting || !selectedJobCardId}
                className="text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {converting ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <FileText className="h-3.5 w-3.5 mr-1" />}
                Generate Invoice
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Sticky Bulk Action Bar */}
      <BulkActionBar
        selectedCount={selectedInvoiceIds.length}
        onDeleteSelected={handleRequestBulkDelete}
        onClearSelection={() => setSelectedInvoiceIds([])}
        isDeleting={deletingInvoices}
        customActions={
          isOwner
            ? [
                {
                  label: "Force Delete Test Invoices",
                  icon: <Trash2 className="h-3.5 w-3.5 text-rose-500" />,
                  onClick: () => {
                    const targets = invoices.filter((i) => selectedInvoiceIds.includes(i.id));
                    setInvoicesToDelete(targets);
                    setForceDeleteModalOpen(true);
                  },
                  variant: "outline",
                  className: "text-rose-600 hover:bg-rose-50 border-rose-300 font-bold",
                },
              ]
            : undefined
        }
      />

      {/* Confirmation & Financial Safety Delete Dialog */}
      <RecordDeleteDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        recordType="Invoice"
        recordTypePlural="Invoices"
        recordCount={invoicesToDelete.length}
        singleRecordIdentifier={invoicesToDelete[0]?.invoice_number}
        isFinancialBlocked={isFinancialBlocked}
        financialBlockMessage={financialBlockMessage || undefined}
        onVoidInstead={() => {
          if (invoicesToDelete[0]) handleOpenVoidModal(invoicesToDelete[0]);
        }}
        isOwner={isOwner}
        onForceDeleteTest={() => {
          setDeleteDialogOpen(false);
          setForceDeleteModalOpen(true);
        }}
        forceDeleteButtonLabel={
          invoicesToDelete.length > 1
            ? "Force Delete Selected Test Invoices"
            : "Force Delete Test Invoice"
        }
        onConfirmDelete={handleConfirmDeleteInvoices}
        isDeleting={deletingInvoices}
      />

      {/* Owner Force Delete Confirmation Modal */}
      <ForceDeleteInvoiceModal
        open={forceDeleteModalOpen}
        onOpenChange={setForceDeleteModalOpen}
        invoices={invoicesToDelete}
        onConfirmForceDelete={handleConfirmForceDelete}
        isDeleting={forceDeleting}
      />

    </div>
  );
}
