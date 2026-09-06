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
          title="Invoices"
          description="Manage workshop billing, customer balances and invoice payment status."
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
                className="h-9 gap-1.5 text-xs font-semibold border-border/80 hover:bg-slate-50 dark:hover:bg-slate-800 shadow-2xs rounded-lg"
                title="Refresh invoices"
              >
                <RefreshCw className="h-3.5 w-3.5" /> Refresh
              </Button>
              <Button
                size="sm"
                onClick={handleOpenConvertModal}
                className="h-9 gap-1.5 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white shadow-xs px-3.5 rounded-lg"
              >
                <Plus className="h-4 w-4" /> + Create Invoice
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
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bg-card border border-border/80 rounded-xl p-4 shadow-xs flex flex-col justify-between h-full hover:border-border transition-colors">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Total Invoiced
              </span>
              <div className="h-7 w-7 rounded-lg bg-blue-50 dark:bg-blue-950/50 flex items-center justify-center text-blue-600">
                <FileText className="h-3.5 w-3.5" />
              </div>
            </div>
            <div className="mt-3">
              <div className="text-2xl font-bold font-mono tracking-tight text-foreground">
                {formatCurrency(kpis.totalSalesValue)}
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">
                From {kpis.totalInvoicesCount} generated invoice(s)
              </div>
            </div>
          </div>

          <div className="bg-card border border-border/80 rounded-xl p-4 shadow-xs flex flex-col justify-between h-full hover:border-border transition-colors">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Paid / Collected
              </span>
              <div className="h-7 w-7 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 flex items-center justify-center text-emerald-600">
                <CheckCircle2 className="h-3.5 w-3.5" />
              </div>
            </div>
            <div className="mt-3">
              <div className="text-2xl font-bold font-mono tracking-tight text-emerald-600 dark:text-emerald-400">
                {formatCurrency(kpis.totalPaidValue)}
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">
                Settled customer payments
              </div>
            </div>
          </div>

          <div className="bg-card border border-border/80 rounded-xl p-4 shadow-xs flex flex-col justify-between h-full hover:border-border transition-colors">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Outstanding Balance
              </span>
              <div className="h-7 w-7 rounded-lg bg-rose-50 dark:bg-rose-950/50 flex items-center justify-center text-rose-600">
                <AlertTriangle className="h-3.5 w-3.5" />
              </div>
            </div>
            <div className="mt-3">
              <div className={`text-2xl font-bold font-mono tracking-tight ${kpis.totalOutstandingBalance > 0 ? "text-rose-600 dark:text-rose-400" : "text-foreground"}`}>
                {formatCurrency(kpis.totalOutstandingBalance)}
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">
                Pending receivables
              </div>
            </div>
          </div>

          <div className="bg-card border border-border/80 rounded-xl p-4 shadow-xs flex flex-col justify-between h-full hover:border-border transition-colors">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Total Invoices
              </span>
              <div className="h-7 w-7 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-muted-foreground">
                <Receipt className="h-3.5 w-3.5" />
              </div>
            </div>
            <div className="mt-3">
              <div className="text-2xl font-bold font-mono tracking-tight text-foreground">
                {totalCount}
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">
                Total documents recorded
              </div>
            </div>
          </div>
        </div>

        {/* ─── Search & Filter Bar ─── */}
        <div className="bg-card border border-border/80 rounded-xl p-3 shadow-xs flex flex-col md:flex-row items-center justify-between gap-3">
          <div className="relative w-full md:w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search by invoice #, customer, phone, vehicle..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-8.5 text-xs bg-muted/40 border-border/70 focus:bg-background transition-colors"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground"
              >
                ✕
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
            {/* Date Filter Dropdown */}
            <select
              value={dateFilter}
              onChange={(e) => {
                setDateFilter(e.target.value as any);
                setCurrentPage(1);
              }}
              className="h-8.5 rounded-lg border border-border/80 bg-background px-2.5 text-xs font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-primary shadow-2xs"
            >
              <option value="all">All Dates</option>
              <option value="today">Today</option>
              <option value="this_month">This Month</option>
              <option value="custom">Custom Range...</option>
            </select>

            {/* Status Filter Segmented Control */}
            <div className="flex items-center gap-1 bg-muted/40 p-1 rounded-lg border border-border/70 overflow-x-auto">
              {[
                { key: "all", label: "All Status" },
                { key: "paid", label: "Paid" },
                { key: "partially_paid", label: "Partial" },
                { key: "credit", label: "Unpaid" },
                { key: "void", label: "Void" },
              ].map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => {
                    setStatusFilter(tab.key);
                    setCurrentPage(1);
                  }}
                  className={`h-7 px-3 rounded-md text-xs font-semibold whitespace-nowrap transition-all ${
                    statusFilter === tab.key
                      ? "bg-background text-foreground shadow-2xs border border-border/60"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Custom Date Range Picker */}
        {dateFilter === "custom" && (
          <div className="bg-card border border-border/80 rounded-xl p-3 shadow-xs flex flex-wrap items-center gap-3 text-xs">
            <div className="flex items-center gap-2">
              <Label className="text-xs font-semibold text-muted-foreground">Start Date:</Label>
              <Input
                type="date"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
                className="h-8 text-xs w-36"
              />
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-xs font-semibold text-muted-foreground">End Date:</Label>
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
              className="h-8 text-xs px-3 font-semibold bg-blue-600 hover:bg-blue-700 text-white"
            >
              Apply Filter
            </Button>
          </div>
        )}

        {/* ─── Invoices Data Table ─── */}
        <div className="bg-card border border-border/80 rounded-xl shadow-xs overflow-hidden">
          {loading ? (
            <div className="py-20 text-center text-muted-foreground">
              <Loader2 className="h-7 w-7 mx-auto animate-spin mb-3 text-primary" />
              <p className="font-semibold text-xs">Loading invoices...</p>
            </div>
          ) : invoices.length > 0 ? (
            <div className="overflow-x-auto min-w-full">
              {selectedInvoiceIds.length > 0 && (
                <div className="bg-blue-50/80 dark:bg-blue-950/40 p-2.5 px-4 border-b border-blue-200 dark:border-blue-900/50 flex items-center justify-between text-xs text-blue-900 dark:text-blue-200">
                  <span className="font-semibold">
                    {selectedInvoiceIds.length} invoice{selectedInvoiceIds.length > 1 ? "s" : ""} selected
                  </span>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="destructive"
                      size="sm"
                      className="h-7 text-xs font-semibold"
                      onClick={handleRequestBulkDelete}
                    >
                      <Trash2 className="h-3 w-3 mr-1.5" /> Delete Selected
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs text-muted-foreground hover:text-foreground"
                      onClick={() => setSelectedInvoiceIds([])}
                    >
                      Clear Selection
                    </Button>
                  </div>
                </div>
              )}
              <Table className="w-full text-xs min-w-[1100px]">
                <TableHeader>
                  <TableRow className="h-10 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider bg-slate-50/75 dark:bg-slate-800/40 border-b border-border/70">
                    <TableHead className="w-[44px] pl-4">
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
                    <TableHead className="font-semibold text-foreground">Invoice No</TableHead>
                    <TableHead className="font-semibold text-foreground min-w-[180px]">Customer</TableHead>
                    <TableHead className="font-semibold text-foreground min-w-[170px]">Vehicle</TableHead>
                    <TableHead className="font-semibold text-foreground">Job Card</TableHead>
                    <TableHead className="font-semibold text-foreground">Date</TableHead>
                    <TableHead className="text-right font-semibold text-foreground">Total (AED)</TableHead>
                    <TableHead className="text-right font-semibold text-foreground">Paid (AED)</TableHead>
                    <TableHead className="text-right font-semibold text-foreground">Balance (AED)</TableHead>
                    <TableHead className="text-center font-semibold text-foreground">Payment Status</TableHead>
                    <TableHead className="w-[105px] min-w-[105px] text-right pr-4 font-semibold text-foreground">Actions</TableHead>
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
                        className={`h-13 border-b border-border/40 hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors ${
                          isVoid ? "opacity-60 bg-slate-50/30" : ""
                        } ${selectedInvoiceIds.includes(inv.id) ? "bg-blue-50/40 dark:bg-blue-950/20" : ""}`}
                      >
                        <TableCell className="pl-4 py-2.5">
                          <Checkbox
                            checked={selectedInvoiceIds.includes(inv.id)}
                            onCheckedChange={() => handleToggleSelectInvoice(inv.id)}
                            aria-label={`Select invoice ${inv.invoice_number}`}
                          />
                        </TableCell>

                        <TableCell className="font-mono font-bold text-xs py-2.5">
                          <button
                            type="button"
                            onClick={() => handleOpenDetails(inv.id)}
                            className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 hover:underline inline-flex items-center gap-1"
                          >
                            {inv.invoice_number}
                          </button>
                        </TableCell>

                        <TableCell className="py-2.5">
                          <div className="font-semibold text-foreground leading-tight">
                            {inv.customer?.name || "Cash Customer"}
                          </div>
                          {(inv.customer?.mobile || inv.customer?.company_name) && (
                            <div className="text-[11px] text-muted-foreground font-mono leading-tight mt-0.5">
                              {inv.customer?.mobile || inv.customer?.company_name}
                            </div>
                          )}
                        </TableCell>

                        <TableCell className="py-2.5">
                          {inv.vehicle ? (
                            <div>
                              <div className="font-semibold text-foreground leading-tight">
                                {inv.vehicle.make} {inv.vehicle.model}
                              </div>
                              <div className="text-[11px] font-mono text-muted-foreground font-bold leading-tight mt-0.5">
                                {inv.vehicle.registration_number || "—"}
                              </div>
                            </div>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>

                        <TableCell className="py-2.5">
                          {inv.job_card ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-mono font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                              {inv.job_card.job_card_number}
                            </span>
                          ) : (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
                        </TableCell>

                        <TableCell className="font-mono text-muted-foreground text-xs py-2.5 whitespace-nowrap">
                          {formatDate(inv.created_at || inv.date)}
                        </TableCell>

                        <TableCell className="text-right font-mono font-bold text-foreground py-2.5 whitespace-nowrap">
                          {formatCurrency(tot)}
                        </TableCell>

                        <TableCell className="text-right font-mono font-bold text-emerald-600 dark:text-emerald-400 py-2.5 whitespace-nowrap">
                          {formatCurrency(paid)}
                        </TableCell>

                        <TableCell className={`text-right font-mono font-bold py-2.5 whitespace-nowrap ${bal > 0 && !isVoid ? "text-rose-600 dark:text-rose-400" : "text-muted-foreground"}`}>
                          {formatCurrency(bal)}
                        </TableCell>

                        <TableCell className="text-center py-2.5">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider border ${
                              isVoid
                                ? "bg-slate-100 text-slate-600 border-slate-300 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700"
                                : bal === 0 || inv.payment_status === "paid"
                                ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800/40"
                                : paid > 0
                                ? "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800/40"
                                : "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/30 dark:text-rose-400 dark:border-rose-800/40"
                            }`}
                          >
                            {isVoid
                              ? "VOID"
                              : bal === 0 || inv.payment_status === "paid"
                              ? "PAID"
                              : paid > 0
                              ? "PARTIAL"
                              : "UNPAID"}
                          </span>
                        </TableCell>

                        <TableCell className="w-[105px] min-w-[105px] text-right pr-4 py-2.5">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleOpenDetails(inv.id)}
                              className="h-8 px-2 text-xs text-blue-600 hover:text-blue-800 hover:bg-blue-50 dark:hover:bg-blue-950/50"
                              title="View invoice breakdown"
                            >
                              <Eye className="h-3.5 w-3.5 mr-1" /> View
                            </Button>

                            <DropdownMenu>
                              <DropdownMenuTrigger className="h-8 w-8 inline-flex items-center justify-center rounded-lg border border-border/80 text-muted-foreground hover:text-foreground hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors focus:outline-none">
                                <MoreVertical className="h-3.5 w-3.5" />
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-48 text-xs">
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
            <div className="flex flex-col items-center justify-center py-10 px-4 min-h-[220px] max-h-[280px] text-center">
              <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-muted-foreground/70 mb-3">
                <FileText className="h-5 w-5" />
              </div>
              <p className="text-sm font-bold text-foreground">No tax invoice records found</p>
              <p className="text-xs text-muted-foreground mt-1 max-w-sm">
                Invoices are generated when converting completed Job Cards or creating new customer invoices.
              </p>
              <div className="flex items-center gap-2 mt-4">
                <Button
                  size="sm"
                  onClick={handleOpenConvertModal}
                  className="h-8 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs"
                >
                  <Plus className="h-3.5 w-3.5 mr-1.5" /> + Create Invoice
                </Button>
              </div>
            </div>
          )}

          {/* Pagination Footer */}
          {totalPages > 1 && (
            <div className="p-3.5 border-t border-border flex items-center justify-between text-xs text-muted-foreground bg-slate-50/50 dark:bg-slate-800/30">
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
                  className="h-8 text-xs font-medium border-border/80"
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
                  className="h-8 text-xs font-medium border-border/80"
                >
                  Next <ChevronRight className="h-3.5 w-3.5 ml-1" />
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 1. INVOICE DETAILS MODAL                                                  */}
      {/* ========================================================================= */}
      <Dialog open={detailsModalOpen} onOpenChange={setDetailsModalOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto bg-background text-foreground">
          <DialogHeader className="border-b pb-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <DialogTitle className="flex items-center gap-2 text-base font-bold text-foreground">
                  <Receipt className="h-5 w-5 text-blue-600 shrink-0" />
                  Tax Invoice #{selectedInvoice?.invoice_number || ""}
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                  Itemized services, spare parts catalog, VAT calculations, and split payment ledger.
                </DialogDescription>
              </div>
              {selectedInvoice && (
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-muted-foreground">
                    {formatDate(selectedInvoice.created_at || selectedInvoice.date)}
                  </span>
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider border ${
                      selectedInvoice.payment_status === "void" || selectedInvoice.is_void
                        ? "bg-slate-100 text-slate-600 border-slate-300 dark:bg-slate-800 dark:text-slate-400"
                        : selectedInvoice.balance === 0 || selectedInvoice.payment_status === "paid"
                        ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800/40"
                        : Number(selectedInvoice.paid) > 0
                        ? "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800/40"
                        : "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/30 dark:text-rose-400 dark:border-rose-800/40"
                    }`}
                  >
                    {selectedInvoice.payment_status === "void" || selectedInvoice.is_void
                      ? "VOID"
                      : selectedInvoice.balance === 0 || selectedInvoice.payment_status === "paid"
                      ? "PAID"
                      : Number(selectedInvoice.paid) > 0
                      ? "PARTIAL"
                      : "UNPAID"}
                  </span>
                </div>
              )}
            </div>
          </DialogHeader>

          {loadingDetails ? (
            <div className="py-20 text-center text-muted-foreground">
              <Loader2 className="h-8 w-8 mx-auto animate-spin mb-3 text-blue-600" />
              <p className="font-medium text-sm">Loading invoice details...</p>
            </div>
          ) : selectedInvoice ? (
            <div className="space-y-4 pt-1">
              {/* Customer & Vehicle Panels */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                {/* CUSTOMER */}
                <div className="p-3.5 bg-slate-50/70 dark:bg-slate-800/40 rounded-xl border border-border/80">
                  <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider block mb-1">
                    Customer Information
                  </span>
                  <div className="font-bold text-foreground text-sm">
                    {selectedInvoice.customer?.name || "Cash Customer"}
                  </div>
                  {selectedInvoice.customer?.company_name && (
                    <div className="text-[11px] text-muted-foreground font-medium mt-0.5">
                      {selectedInvoice.customer.company_name}
                    </div>
                  )}
                  <div className="text-xs text-muted-foreground font-mono mt-1">
                    Phone: {selectedInvoice.customer?.mobile || "—"}
                  </div>
                  {selectedInvoice.customer?.trn && (
                    <div className="text-[11px] font-mono text-blue-600 font-bold mt-1">
                      TRN: {selectedInvoice.customer.trn}
                    </div>
                  )}
                </div>

                {/* VEHICLE */}
                <div className="p-3.5 bg-slate-50/70 dark:bg-slate-800/40 rounded-xl border border-border/80">
                  <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider block mb-1">
                    Vehicle Specifications
                  </span>
                  {selectedInvoice.vehicle ? (
                    <div>
                      <div className="font-bold text-foreground text-sm">
                        {selectedInvoice.vehicle.make} {selectedInvoice.vehicle.model}
                        {selectedInvoice.vehicle.year ? ` (${selectedInvoice.vehicle.year})` : ""}
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="font-mono font-bold text-xs bg-slate-200/80 dark:bg-slate-700 px-2 py-0.5 rounded text-foreground">
                          {selectedInvoice.vehicle.registration_number || "No Plate"}
                        </span>
                        {selectedInvoice.vehicle.color && (
                          <span className="text-xs text-muted-foreground">
                            Color: {selectedInvoice.vehicle.color}
                          </span>
                        )}
                      </div>
                      {selectedInvoice.vehicle.vin && (
                        <div className="text-[11px] font-mono text-muted-foreground mt-1">
                          VIN: {selectedInvoice.vehicle.vin}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-muted-foreground">— No vehicle linked —</div>
                  )}
                </div>
              </div>

              {/* SERVICES */}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-foreground mb-1.5 flex items-center gap-1.5">
                  <Wrench className="h-3.5 w-3.5 text-blue-600" /> Labor &amp; Workshop Services
                </h4>
                <div className="border border-border/80 rounded-xl overflow-hidden shadow-2xs">
                  <Table className="text-xs">
                    <TableHeader>
                      <TableRow className="bg-slate-50/80 dark:bg-slate-800/50 text-[11px] font-semibold text-muted-foreground">
                        <TableHead className="w-12 text-center">#</TableHead>
                        <TableHead>Service Description</TableHead>
                        <TableHead className="text-right w-28">Rate (AED)</TableHead>
                        <TableHead className="text-right w-28 pr-4">Amount (AED)</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(selectedInvoice.items || []).filter((it: any) => it.item_type === "service" || !it.item_type).length > 0 ? (
                        (selectedInvoice.items || [])
                          .filter((it: any) => it.item_type === "service" || !it.item_type)
                          .map((it: any, i: number) => (
                            <TableRow key={i} className="h-10 border-b border-border/40">
                              <TableCell className="text-center font-mono text-muted-foreground">{i + 1}</TableCell>
                              <TableCell className="font-semibold text-foreground">{it.description}</TableCell>
                              <TableCell className="text-right font-mono text-muted-foreground">{formatCurrency(it.unit_price)}</TableCell>
                              <TableCell className="text-right font-mono font-bold text-foreground pr-4">{formatCurrency(it.total_price)}</TableCell>
                            </TableRow>
                          ))
                      ) : (
                        <TableRow>
                          <TableCell colSpan={4} className="text-center py-3 text-xs text-muted-foreground">
                            No service line items recorded
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>

              {/* SPARE PARTS */}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-foreground mb-1.5 flex items-center gap-1.5">
                  <Package className="h-3.5 w-3.5 text-indigo-600" /> Spare Parts &amp; Materials
                </h4>
                <div className="border border-border/80 rounded-xl overflow-hidden shadow-2xs">
                  <Table className="text-xs">
                    <TableHeader>
                      <TableRow className="bg-slate-50/80 dark:bg-slate-800/50 text-[11px] font-semibold text-muted-foreground">
                        <TableHead className="w-12 text-center">#</TableHead>
                        <TableHead>Part Description</TableHead>
                        <TableHead className="text-center w-20">Qty</TableHead>
                        <TableHead className="text-right w-28">Unit Price</TableHead>
                        <TableHead className="text-right w-28 pr-4">Total (AED)</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(selectedInvoice.items || []).filter((it: any) => it.item_type === "part").length > 0 ? (
                        (selectedInvoice.items || [])
                          .filter((it: any) => it.item_type === "part")
                          .map((it: any, i: number) => (
                            <TableRow key={i} className="h-10 border-b border-border/40">
                              <TableCell className="text-center font-mono text-muted-foreground">{i + 1}</TableCell>
                              <TableCell className="font-semibold text-foreground">{it.description}</TableCell>
                              <TableCell className="text-center font-mono font-bold">{it.quantity}</TableCell>
                              <TableCell className="text-right font-mono text-muted-foreground">{formatCurrency(it.unit_price)}</TableCell>
                              <TableCell className="text-right font-mono font-bold text-foreground pr-4">{formatCurrency(it.total_price)}</TableCell>
                            </TableRow>
                          ))
                      ) : (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center py-3 text-xs text-muted-foreground">
                            No spare part line items recorded
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>

              {/* PAYMENT SUMMARY - Dominant Total */}
              <div className="bg-slate-50/80 dark:bg-slate-800/40 border border-border/80 rounded-xl p-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
                  <div className="space-y-1.5 text-xs">
                    <div className="flex justify-between text-muted-foreground">
                      <span>Subtotal:</span>
                      <span className="font-mono font-semibold text-foreground">{formatCurrency(selectedInvoice.subtotal)}</span>
                    </div>
                    {Number(selectedInvoice.discount_amount) > 0 && (
                      <div className="flex justify-between text-rose-600">
                        <span>Discount:</span>
                        <span className="font-mono font-semibold">-{formatCurrency(selectedInvoice.discount_amount)}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-muted-foreground">
                      <span>VAT ({selectedInvoice.vat_rate || 5}%):</span>
                      <span className="font-mono font-semibold text-foreground">{formatCurrency(selectedInvoice.vat_amount)}</span>
                    </div>
                    <div className="flex justify-between text-muted-foreground pt-1 border-t">
                      <span>Paid Amount:</span>
                      <span className="font-mono font-bold text-emerald-600">{formatCurrency(selectedInvoice.paid || 0)}</span>
                    </div>
                    <div className="flex justify-between text-muted-foreground">
                      <span>Balance Due:</span>
                      <span className={`font-mono font-bold ${selectedInvoice.balance > 0 ? "text-rose-600" : "text-emerald-600"}`}>
                        {formatCurrency(selectedInvoice.balance || 0)}
                      </span>
                    </div>
                  </div>

                  {/* Dominant Total Box */}
                  <div className="bg-blue-600 text-white p-4 rounded-xl flex flex-col justify-between items-center text-center shadow-sm">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-blue-100">
                      Total Invoice Amount
                    </span>
                    <div className="text-2xl font-bold font-mono tracking-tight my-1">
                      {formatCurrency(selectedInvoice.total)}
                    </div>
                    <span className="text-[10px] text-blue-200">
                      Inclusive of 5% UAE VAT
                    </span>
                  </div>
                </div>
              </div>

              {/* Payment Transactions History */}
              {selectedInvoice.payments && selectedInvoice.payments.length > 0 && (
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-foreground mb-1.5 flex items-center gap-1.5">
                    <CreditCard className="h-3.5 w-3.5 text-emerald-600" /> Recorded Payment Ledger
                  </h4>
                  <div className="border border-border/80 rounded-xl overflow-hidden shadow-2xs">
                    <Table className="text-xs">
                      <TableHeader>
                        <TableRow className="bg-slate-50/80 dark:bg-slate-800/50 text-[11px] font-semibold text-muted-foreground">
                          <TableHead>Payment Date</TableHead>
                          <TableHead>Method</TableHead>
                          <TableHead>Reference</TableHead>
                          <TableHead className="text-right pr-4">Amount</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {selectedInvoice.payments.map((pm: any, idx: number) => (
                          <TableRow key={idx} className="h-10 border-b border-border/40">
                            <TableCell className="font-mono text-muted-foreground">{formatDate(pm.payment_date || pm.created_at)}</TableCell>
                            <TableCell className="uppercase font-semibold text-xs">{pm.payment_method}</TableCell>
                            <TableCell className="font-mono text-muted-foreground">{pm.reference_number || "Direct"}</TableCell>
                            <TableCell className="text-right font-mono font-bold text-emerald-600 pr-4">
                              {formatCurrency(pm.amount)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}
            </div>
          ) : null}

          <DialogFooter className="pt-3 border-t flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleTriggerPrint(selectedInvoice)}
                className="h-8.5 text-xs font-semibold border-border/80 hover:bg-slate-50 gap-1.5"
              >
                <Printer className="h-3.5 w-3.5 text-slate-600" /> Print A4
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={() => handleWhatsAppShare(selectedInvoice)}
                className="h-8.5 text-xs font-semibold border-border/80 hover:bg-emerald-50 text-emerald-700 dark:text-emerald-400 gap-1.5"
              >
                <MessageSquare className="h-3.5 w-3.5" /> WhatsApp
              </Button>

              {selectedInvoice && selectedInvoice.balance > 0 && !selectedInvoice.is_void && canEdit && (
                <Button
                  size="sm"
                  onClick={() => handleOpenRecordPayment(selectedInvoice)}
                  className="h-8.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs gap-1.5 shadow-xs"
                >
                  <CreditCard className="h-3.5 w-3.5" /> Receive Payment
                </Button>
              )}
            </div>
            <Button variant="outline" size="sm" onClick={() => setDetailsModalOpen(false)} className="h-8.5 text-xs font-medium border-border/80">
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
