"use client";

import { useState, useEffect, useCallback, useTransition } from "react";
import { usePermissions } from "@/lib/context/auth-context";
import {
  getExpenses,
  getExpenseSummaryMetrics,
  getExpenseReportData,
  getAllCategories,
  recordExpense,
  updateExpense,
  softDeleteExpense,
  uploadExpenseReceipt,
  type ExpenseSummaryMetrics,
  type ExpenseReportData,
} from "@/lib/services/expense-service";
import type { Expense, ExpensePaymentMethod } from "@/types/database";
import { DEFAULT_EXPENSE_CATEGORIES, EXPENSE_PAYMENT_METHODS } from "@/lib/constants";
import { PageHeader } from "@/components/shared/page-header";
import { SearchInput } from "@/components/shared/search-input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Receipt,
  Plus,
  BarChart3,
  Calendar,
  Wallet,
  Building2,
  CalendarDays,
  FileText,
  Trash2,
  Edit,
  Eye,
  Paperclip,
  Upload,
  X,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Search,
  Filter,
  RefreshCw,
  Printer,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Banknote,
  DollarSign,
  BookOpen,
  MoreVertical,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { BulkActionBar } from "@/components/shared/bulk-action-bar";
import { RecordDeleteDialog } from "@/components/shared/record-delete-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function ExpensesView() {
  const { user, role, isOwner, isManager, isViewer, canDelete: authCanDelete, canEdit: authCanEdit } = usePermissions();
  const canDelete = isOwner || role === "admin" || authCanDelete;
  const canEdit = !isViewer && authCanEdit;
  const canAdd = !isViewer;

  const [isPending, startTransition] = useTransition();

  // ─── Filter & Search State ──────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [paymentMethodFilter, setPaymentMethodFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState<"today" | "this_week" | "this_month" | "last_month" | "this_year" | "custom" | "all">("this_month");
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 20;

  // ─── Data State ─────────────────────────────────────────────────────────────
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [metrics, setMetrics] = useState<ExpenseSummaryMetrics>({
    todayTotal: 0,
    thisMonthTotal: 0,
    thisYearTotal: 0,
    totalExpensesCount: 0,
  });
  const [availableCategories, setAvailableCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [toastMessage, setToastMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // ─── Form Dialog State ──────────────────────────────────────────────────────
  const [formDialogOpen, setFormDialogOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [formLoading, setFormLoading] = useState(false);

  // Form Fields
  const [formDate, setFormDate] = useState(new Date().toISOString().slice(0, 10));
  const [formCategory, setFormCategory] = useState("Miscellaneous");
  const [isCustomCategory, setIsCustomCategory] = useState(false);
  const [customCategoryInput, setCustomCategoryInput] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formAmount, setFormAmount] = useState("");
  const [formPaymentMethod, setFormPaymentMethod] = useState<string>("cash");
  const [formPaidTo, setFormPaidTo] = useState("");
  const [formReference, setFormReference] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [formAttachmentPath, setFormAttachmentPath] = useState<string | null>(null);
  const [formAttachmentName, setFormAttachmentName] = useState<string | null>(null);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);

  // ─── View Details Dialog State ──────────────────────────────────────────────
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [selectedExpense, setSelectedExpense] = useState<Expense | null>(null);

  // ─── Delete & Selection State ───────────────────────────────────────────────
  const [selectedExpenseIds, setSelectedExpenseIds] = useState<string[]>([]);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [expensesToDelete, setExpensesToDelete] = useState<Expense[]>([]);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // ─── Report Dialog State ────────────────────────────────────────────────────
  const [reportDialogOpen, setReportDialogOpen] = useState(false);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportData, setReportData] = useState<ExpenseReportData | null>(null);
  const [reportStartDate, setReportStartDate] = useState(
    `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}-01`
  );
  const [reportEndDate, setReportEndDate] = useState(new Date().toISOString().slice(0, 10));

  // ─── Data Loaders ───────────────────────────────────────────────────────────
  const loadExpenses = useCallback(async () => {
    setLoading(true);
    try {
      const [res, summaryMetrics] = await Promise.all([
        getExpenses({
          search: searchQuery,
          category: categoryFilter,
          paymentMethod: paymentMethodFilter,
          dateFilter,
          startDate: customStartDate,
          endDate: customEndDate,
          page,
          limit: pageSize,
        }),
        getExpenseSummaryMetrics(),
      ]);

      setExpenses(res.expenses);
      setTotalCount(res.total);
      setMetrics(summaryMetrics);
      setAvailableCategories(getAllCategories());
    } catch (err: any) {
      console.error("Failed to load expenses:", err);
      setToastMessage({ type: "error", text: err.message || "Failed to load expenses." });
    } finally {
      setLoading(false);
    }
  }, [searchQuery, categoryFilter, paymentMethodFilter, dateFilter, customStartDate, customEndDate, page]);

  useEffect(() => {
    loadExpenses();
  }, [loadExpenses]);

  // Toast Timer
  useEffect(() => {
    if (toastMessage) {
      const timer = setTimeout(() => setToastMessage(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [toastMessage]);

  // ─── Form Open/Close Handlers ───────────────────────────────────────────────
  const openAddDialog = () => {
    setEditingExpense(null);
    setFormDate(new Date().toISOString().slice(0, 10));
    setFormCategory("Fuel");
    setIsCustomCategory(false);
    setCustomCategoryInput("");
    setFormDescription("");
    setFormAmount("");
    setFormPaymentMethod("cash");
    setFormPaidTo("");
    setFormReference("");
    setFormNotes("");
    setFormAttachmentPath(null);
    setFormAttachmentName(null);
    setFormDialogOpen(true);
  };

  const openEditDialog = (exp: Expense) => {
    setEditingExpense(exp);
    setFormDate(exp.date || exp.expense_date || new Date().toISOString().slice(0, 10));
    const isStandard = (DEFAULT_EXPENSE_CATEGORIES as readonly string[]).includes(exp.category);
    if (isStandard) {
      setFormCategory(exp.category);
      setIsCustomCategory(false);
      setCustomCategoryInput("");
    } else {
      setFormCategory("__custom__");
      setIsCustomCategory(true);
      setCustomCategoryInput(exp.category);
    }
    setFormDescription(exp.description || "");
    setFormAmount(String(exp.amount || ""));
    setFormPaymentMethod(exp.payment_method === "bank" ? "bank_transfer" : exp.payment_method || "cash");
    setFormPaidTo(exp.paid_to || "");
    setFormReference(exp.reference_number || "");
    setFormNotes(exp.notes || "");
    setFormAttachmentPath(exp.attachment_path || null);
    setFormAttachmentName(exp.attachment_path ? "Attached Receipt" : null);
    setFormDialogOpen(true);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate size (max 8MB)
    if (file.size > 8 * 1024 * 1024) {
      setToastMessage({ type: "error", text: "Receipt attachment cannot exceed 8 MB." });
      return;
    }

    setUploadingAttachment(true);
    try {
      const res = await uploadExpenseReceipt(file);
      setFormAttachmentPath(res.fileUrl);
      setFormAttachmentName(res.fileName);
      setToastMessage({ type: "success", text: "Receipt attached successfully." });
    } catch (err: any) {
      setToastMessage({ type: "error", text: err.message || "Failed to upload receipt." });
    } finally {
      setUploadingAttachment(false);
    }
  };

  const handleSaveExpense = async (e: React.FormEvent) => {
    e.preventDefault();

    const amt = parseFloat(formAmount);
    if (isNaN(amt) || amt <= 0) {
      setToastMessage({ type: "error", text: "Please enter a valid expense amount greater than 0." });
      return;
    }

    const resolvedCategory = isCustomCategory ? customCategoryInput.trim() : formCategory;
    if (!resolvedCategory) {
      setToastMessage({ type: "error", text: "Please specify an expense category." });
      return;
    }

    if (!formDescription.trim()) {
      setToastMessage({ type: "error", text: "Please provide an expense description." });
      return;
    }

    setFormLoading(true);
    try {
      if (editingExpense) {
        await updateExpense(editingExpense.id, {
          date: formDate,
          category: resolvedCategory,
          description: formDescription.trim(),
          amount: amt,
          payment_method: formPaymentMethod,
          paid_to: formPaidTo.trim() || null,
          reference_number: formReference.trim() || null,
          notes: formNotes.trim() || null,
          attachment_path: formAttachmentPath,
        });
        setToastMessage({ type: "success", text: `Expense of AED ${amt.toFixed(2)} updated successfully.` });
      } else {
        await recordExpense({
          date: formDate,
          category: resolvedCategory,
          description: formDescription.trim(),
          amount: amt,
          payment_method: formPaymentMethod,
          paid_to: formPaidTo.trim() || null,
          reference_number: formReference.trim() || null,
          notes: formNotes.trim() || null,
          attachment_path: formAttachmentPath,
          created_by: user?.email || "Staff",
        });
        setToastMessage({ type: "success", text: `Expense of AED ${amt.toFixed(2)} recorded successfully.` });
      }

      setFormDialogOpen(false);
      loadExpenses();
    } catch (err: any) {
      setToastMessage({ type: "error", text: err.message || "Failed to save expense." });
    } finally {
      setFormLoading(false);
    }
  };

  // ─── Checkbox Selection Handlers ──────────────────────────────────────────
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedExpenseIds(expenses.map((e) => e.id));
    } else {
      setSelectedExpenseIds([]);
    }
  };

  const handleToggleSelectExpense = (id: string) => {
    setSelectedExpenseIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  // ─── Delete Handlers ────────────────────────────────────────────────────────
  const openDeleteDialog = (exp: Expense) => {
    setExpensesToDelete([exp]);
    setDeleteDialogOpen(true);
  };

  const handleRequestBulkDelete = () => {
    if (selectedExpenseIds.length === 0) return;
    const targets = expenses.filter((e) => selectedExpenseIds.includes(e.id));
    setExpensesToDelete(targets);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (expensesToDelete.length === 0) return;
    setDeleteLoading(true);
    try {
      for (const exp of expensesToDelete) {
        await softDeleteExpense(exp.id, user?.email || "Admin");
      }
      setToastMessage({
        type: "success",
        text: `${expensesToDelete.length} expense${expensesToDelete.length > 1 ? "s" : ""} moved to Recycle Bin.`,
      });
      setDeleteDialogOpen(false);
      setExpensesToDelete([]);
      setSelectedExpenseIds([]);
      loadExpenses();
    } catch (err: any) {
      setToastMessage({ type: "error", text: err.message || "Failed to delete expense." });
    } finally {
      setDeleteLoading(false);
    }
  };

  // ─── Report Loader ──────────────────────────────────────────────────────────
  const handleOpenReport = async () => {
    setReportDialogOpen(true);
    setReportLoading(true);
    try {
      const data = await getExpenseReportData(reportStartDate, reportEndDate);
      setReportData(data);
    } catch (err: any) {
      console.error(err);
    } finally {
      setReportLoading(false);
    }
  };

  const handleRefreshReport = async () => {
    setReportLoading(true);
    try {
      const data = await getExpenseReportData(reportStartDate, reportEndDate);
      setReportData(data);
    } catch (err: any) {
      console.error(err);
    } finally {
      setReportLoading(false);
    }
  };

  // Helper formatting functions
  const formatCurrency = (amt: number) => {
    return new Intl.NumberFormat("en-AE", {
      style: "currency",
      currency: "AED",
      minimumFractionDigits: 2,
    }).format(amt);
  };

  const getMethodBadge = (method: string) => {
    switch (method) {
      case "cash":
        return <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">Cash</Badge>;
      case "bank":
      case "bank_transfer":
        return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">Bank Transfer</Badge>;
      case "credit_card":
        return <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">Credit Card</Badge>;
      default:
        return <Badge variant="outline" className="bg-slate-50 text-slate-700 border-slate-200">Other</Badge>;
    }
  };

  const totalPages = Math.ceil(totalCount / pageSize) || 1;

  return (
    <div className="space-y-6">
      {/* Toast Notification Alert */}
      {toastMessage && (
        <div
          className={`fixed top-4 right-4 z-50 flex items-center gap-3 p-4 rounded-xl shadow-lg border text-sm font-medium transition-all ${
            toastMessage.type === "success"
              ? "bg-emerald-50 text-emerald-900 border-emerald-200 dark:bg-emerald-950/80 dark:text-emerald-100"
              : "bg-rose-50 text-rose-900 border-rose-200 dark:bg-rose-950/80 dark:text-rose-100"
          }`}
        >
          {toastMessage.type === "success" ? (
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
          ) : (
            <AlertCircle className="h-5 w-5 text-rose-600" />
          )}
          <span>{toastMessage.text}</span>
          <button onClick={() => setToastMessage(null)} className="ml-2 hover:opacity-75">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <PageHeader
          title="Expenses"
          description="Track and manage workshop operations, utilities, tools, and vendor disbursements"
          breadcrumbs={[
            { label: "Dashboard", href: "/" },
            { label: "Expenses" },
          ]}
        />
        <div className="flex items-center gap-2.5">
          <Button
            variant="outline"
            className="gap-2 border-slate-300 dark:border-slate-700"
            onClick={handleOpenReport}
          >
            <BarChart3 className="h-4 w-4 text-blue-600" />
            <span>Expense Report</span>
          </Button>

          {canAdd && (
            <Button
              className="gap-2 bg-blue-600 hover:bg-blue-700 text-white shadow-sm"
              onClick={openAddDialog}
            >
              <Plus className="h-4 w-4" />
              <span>Add Expense</span>
            </Button>
          )}
        </div>
      </div>

      {/* ─── 1. TOP SUMMARY METRIC CARDS ─── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Today */}
        <Card className="border border-slate-200/80 dark:border-slate-800 shadow-sm bg-gradient-to-br from-white to-slate-50/50 dark:from-slate-900 dark:to-slate-900/60">
          <CardContent className="p-5 flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Total Expenses Today
              </p>
              <p className="text-2xl font-bold tracking-tight text-foreground font-mono">
                {formatCurrency(metrics.todayTotal)}
              </p>
              <p className="text-[11px] text-muted-foreground flex items-center gap-1 mt-1">
                <Calendar className="h-3 w-3 text-slate-400" />
                <span>Recorded operations today</span>
              </p>
            </div>
            <div className="h-12 w-12 rounded-2xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 flex items-center justify-center border border-amber-200/60 dark:border-amber-800/40">
              <CalendarDays className="h-6 w-6" />
            </div>
          </CardContent>
        </Card>

        {/* This Month */}
        <Card className="border border-slate-200/80 dark:border-slate-800 shadow-sm bg-gradient-to-br from-white to-slate-50/50 dark:from-slate-900 dark:to-slate-900/60">
          <CardContent className="p-5 flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Total Expenses This Month
              </p>
              <p className="text-2xl font-bold tracking-tight text-blue-600 dark:text-blue-400 font-mono">
                {formatCurrency(metrics.thisMonthTotal)}
              </p>
              <p className="text-[11px] text-muted-foreground flex items-center gap-1 mt-1">
                <Wallet className="h-3 w-3 text-slate-400" />
                <span>Net monthly cash outflow</span>
              </p>
            </div>
            <div className="h-12 w-12 rounded-2xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 flex items-center justify-center border border-blue-200/60 dark:border-blue-800/40">
              <Receipt className="h-6 w-6" />
            </div>
          </CardContent>
        </Card>

        {/* This Year */}
        <Card className="border border-slate-200/80 dark:border-slate-800 shadow-sm bg-gradient-to-br from-white to-slate-50/50 dark:from-slate-900 dark:to-slate-900/60">
          <CardContent className="p-5 flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Total Expenses This Year
              </p>
              <p className="text-2xl font-bold tracking-tight text-foreground font-mono">
                {formatCurrency(metrics.thisYearTotal)}
              </p>
              <p className="text-[11px] text-muted-foreground flex items-center gap-1 mt-1">
                <Building2 className="h-3 w-3 text-slate-400" />
                <span>Cumulative {new Date().getFullYear()} expenses</span>
              </p>
            </div>
            <div className="h-12 w-12 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 flex items-center justify-center border border-emerald-200/60 dark:border-emerald-800/40">
              <Building2 className="h-6 w-6" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ─── 2. SEARCH & FILTER CONTROLS ─── */}
      <Card className="border border-slate-200/80 dark:border-slate-800 shadow-sm">
        <CardContent className="p-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
            {/* Search Input */}
            <div className="md:col-span-4">
              <SearchInput
                placeholder="Search description, vendor, reference, category..."
                value={searchQuery}
                onChange={(q) => {
                  setSearchQuery(q);
                  setPage(1);
                }}
              />
            </div>

            {/* Date Range Quick Selector */}
            <div className="md:col-span-3">
              <Select
                value={dateFilter}
                onValueChange={(val: any) => {
                  setDateFilter(val);
                  setPage(1);
                }}
              >
                <SelectTrigger className="w-full text-xs">
                  <SelectValue placeholder="Date Range" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="today">Today</SelectItem>
                  <SelectItem value="this_week">This Week</SelectItem>
                  <SelectItem value="this_month">This Month</SelectItem>
                  <SelectItem value="last_month">Last Month</SelectItem>
                  <SelectItem value="this_year">This Year</SelectItem>
                  <SelectItem value="all">All Dates</SelectItem>
                  <SelectItem value="custom">Custom Range...</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Category Filter */}
            <div className="md:col-span-3">
              <Select
                value={categoryFilter}
                onValueChange={(val) => {
                  if (val) {
                    setCategoryFilter(val);
                    setPage(1);
                  }
                }}
              >
                <SelectTrigger className="w-full text-xs">
                  <SelectValue placeholder="All Categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {availableCategories.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {cat}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Payment Method Filter */}
            <div className="md:col-span-2">
              <Select
                value={paymentMethodFilter}
                onValueChange={(val) => {
                  if (val) {
                    setPaymentMethodFilter(val);
                    setPage(1);
                  }
                }}
              >
                <SelectTrigger className="w-full text-xs">
                  <SelectValue placeholder="Payment Method" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Methods</SelectItem>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                  <SelectItem value="credit_card">Credit Card</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Custom Date Range Row */}
          {dateFilter === "custom" && (
            <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-dashed">
              <div className="flex items-center gap-2">
                <Label className="text-xs text-muted-foreground whitespace-nowrap">From:</Label>
                <Input
                  type="date"
                  className="h-8 text-xs w-40"
                  value={customStartDate}
                  onChange={(e) => {
                    setCustomStartDate(e.target.value);
                    setPage(1);
                  }}
                />
              </div>
              <div className="flex items-center gap-2">
                <Label className="text-xs text-muted-foreground whitespace-nowrap">To:</Label>
                <Input
                  type="date"
                  className="h-8 text-xs w-40"
                  value={customEndDate}
                  onChange={(e) => {
                    setCustomEndDate(e.target.value);
                    setPage(1);
                  }}
                />
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-xs text-muted-foreground"
                onClick={() => {
                  setCustomStartDate("");
                  setCustomEndDate("");
                  setDateFilter("this_month");
                  setPage(1);
                }}
              >
                Reset Dates
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ─── 3. EXPENSES TABLE ─── */}
      <Card className="border border-slate-200/80 dark:border-slate-800 shadow-sm overflow-hidden bg-white dark:bg-slate-900">
        <CardContent className="p-0">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-24 text-slate-400">
              <Loader2 className="h-8 w-8 animate-spin text-blue-600 mb-2" />
              <p className="text-sm font-medium">Loading workshop expenses...</p>
            </div>
          ) : expenses.length === 0 ? (
            <div className="text-center py-20 px-4">
              <Receipt className="h-12 w-12 mx-auto text-slate-300 dark:text-slate-600 mb-3" />
              <h3 className="text-base font-semibold text-foreground">No Expenses Found</h3>
              <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">
                No expense entries match your selected date range and filters.
              </p>
              {canAdd && (
                <Button className="mt-4 gap-2 bg-blue-600 hover:bg-blue-700 text-white" onClick={openAddDialog}>
                  <Plus className="h-4 w-4" />
                  <span>Record First Expense</span>
                </Button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50/80 dark:bg-slate-800/60 hover:bg-slate-50/80">
                    <TableHead className="w-[40px] pl-4">
                      <Checkbox
                        checked={
                          expenses.length > 0 && selectedExpenseIds.length === expenses.length
                            ? true
                            : selectedExpenseIds.length > 0
                            ? "indeterminate"
                            : false
                        }
                        onCheckedChange={handleSelectAll}
                        aria-label="Select all visible expenses"
                      />
                    </TableHead>
                    <TableHead className="w-[110px] text-xs font-semibold text-slate-700 dark:text-slate-200">Date</TableHead>
                    <TableHead className="w-[160px] text-xs font-semibold text-slate-700 dark:text-slate-200">Category</TableHead>
                    <TableHead className="min-w-[220px] text-xs font-semibold text-slate-700 dark:text-slate-200">Description</TableHead>
                    <TableHead className="min-w-[150px] text-xs font-semibold text-slate-700 dark:text-slate-200">Paid To / Vendor</TableHead>
                    <TableHead className="text-right w-[140px] text-xs font-semibold text-slate-700 dark:text-slate-200">Amount</TableHead>
                    <TableHead className="w-[130px] text-xs font-semibold text-slate-700 dark:text-slate-200">Payment</TableHead>
                    <TableHead className="w-[130px] text-xs font-semibold text-slate-700 dark:text-slate-200">Reference</TableHead>
                    <TableHead className="w-[120px] text-xs font-semibold text-slate-700 dark:text-slate-200">Receipt</TableHead>
                    <TableHead className="w-[80px] text-right pr-4 text-xs font-semibold text-slate-700 dark:text-slate-200">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {expenses.map((exp) => (
                    <TableRow
                      key={exp.id}
                      className={`hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors ${
                        selectedExpenseIds.includes(exp.id) ? "bg-blue-50/40 dark:bg-blue-950/20" : ""
                      }`}
                    >
                      <TableCell className="pl-4">
                        <Checkbox
                          checked={selectedExpenseIds.includes(exp.id)}
                          onCheckedChange={() => handleToggleSelectExpense(exp.id)}
                          aria-label={`Select expense ${exp.description || exp.id}`}
                        />
                      </TableCell>
                      {/* Date */}
                      <TableCell className="font-mono text-xs text-foreground font-medium whitespace-nowrap">
                        {exp.date || exp.expense_date || (exp.created_at ? exp.created_at.slice(0, 10) : "N/A")}
                      </TableCell>

                      {/* Category */}
                      <TableCell>
                        <Badge variant="secondary" className="font-medium text-[11px] bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                          {exp.category}
                        </Badge>
                      </TableCell>

                      {/* Description */}
                      <TableCell>
                        <p className="text-xs font-medium text-foreground line-clamp-2">
                          {exp.description || "—"}
                        </p>
                      </TableCell>

                      {/* Paid To */}
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {exp.paid_to || "—"}
                      </TableCell>

                      {/* Amount */}
                      <TableCell className="text-right font-mono font-bold text-xs text-foreground whitespace-nowrap">
                        {formatCurrency(Number(exp.amount) || 0)}
                      </TableCell>

                      {/* Payment Method */}
                      <TableCell className="whitespace-nowrap">
                        {getMethodBadge(exp.payment_method)}
                      </TableCell>

                      {/* Reference */}
                      <TableCell className="text-xs font-mono text-muted-foreground whitespace-nowrap">
                        {exp.reference_number || "—"}
                      </TableCell>

                      {/* Receipt Attachment */}
                      <TableCell className="whitespace-nowrap">
                        {exp.attachment_path ? (
                          <a
                            href={exp.attachment_path}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700 font-medium hover:underline"
                          >
                            <Paperclip className="h-3.5 w-3.5" />
                            <span>View File</span>
                          </a>
                        ) : (
                          <span className="text-xs text-muted-foreground/40">No file</span>
                        )}
                      </TableCell>

                      {/* Actions */}
                      <TableCell className="text-right pr-4 whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1">
                          {/* View */}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-slate-600 hover:text-slate-900 dark:text-slate-300"
                            onClick={() => {
                              setSelectedExpense(exp);
                              setViewDialogOpen(true);
                            }}
                            title="View Details"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>

                          <DropdownMenu>
                            <DropdownMenuTrigger className="h-8 w-8 inline-flex items-center justify-center rounded-md border border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 focus:outline-none">
                              <MoreVertical className="h-3.5 w-3.5" />
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48 text-xs">
                              <DropdownMenuLabel>Expense Actions</DropdownMenuLabel>
                              <DropdownMenuItem
                                onClick={() => {
                                  setSelectedExpense(exp);
                                  setViewDialogOpen(true);
                                }}
                              >
                                <Eye className="h-3.5 w-3.5 mr-2 text-blue-600" /> View Details
                              </DropdownMenuItem>
                              {canEdit && (
                                <DropdownMenuItem onClick={() => openEditDialog(exp)}>
                                  <Edit className="h-3.5 w-3.5 mr-2 text-slate-600" /> Edit Expense
                                </DropdownMenuItem>
                              )}
                              {canDelete && (
                                <>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    onClick={() => openDeleteDialog(exp)}
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
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Pagination Controls */}
          {totalCount > pageSize && (
            <div className="flex items-center justify-between px-4 py-3 border-t text-xs text-muted-foreground">
              <div>
                Showing {(page - 1) * pageSize + 1} to {Math.min(page * pageSize, totalCount)} of {totalCount} expenses
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="h-8 text-xs gap-1"
                >
                  <ChevronLeft className="h-3.5 w-3.5" /> Previous
                </Button>
                <span className="font-medium text-foreground px-2">
                  Page {page} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="h-8 text-xs gap-1"
                >
                  Next <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ─── 4. ADD / EDIT EXPENSE MODAL ─── */}
      <Dialog open={formDialogOpen} onOpenChange={setFormDialogOpen}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <form onSubmit={handleSaveExpense} className="space-y-4">
            <DialogTitle className="text-base font-bold text-foreground">
              {editingExpense ? "Edit Expense" : "Record New Expense"}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Fill in the details below to log a workshop operational cost.
            </DialogDescription>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              {/* Expense Date */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Expense Date *</Label>
                <Input
                  type="date"
                  required
                  value={formDate}
                  onChange={(e) => setFormDate(e.target.value)}
                  className="text-xs h-9"
                />
              </div>

              {/* Amount (AED) */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Amount (AED) *</Label>
                <div className="relative">
                  <span className="absolute left-3 top-2 text-xs font-bold text-muted-foreground">AED</span>
                  <Input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    placeholder="0.00"
                    value={formAmount}
                    onChange={(e) => setFormAmount(e.target.value)}
                    className="text-xs h-9 pl-12 font-mono font-bold"
                  />
                </div>
              </div>

              {/* Category */}
              <div className="space-y-1.5 sm:col-span-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-semibold">Category *</Label>
                  <button
                    type="button"
                    className="text-[11px] text-blue-600 hover:underline font-medium"
                    onClick={() => {
                      setIsCustomCategory(!isCustomCategory);
                      if (!isCustomCategory) {
                        setFormCategory("__custom__");
                      } else {
                        setFormCategory("Miscellaneous");
                      }
                    }}
                  >
                    {isCustomCategory ? "Choose from standard categories" : "+ Add Custom Category"}
                  </button>
                </div>

                {!isCustomCategory ? (
                  <Select
                    value={formCategory}
                    onValueChange={(val) => {
                      if (val) setFormCategory(val);
                    }}
                  >
                    <SelectTrigger className="text-xs h-9">
                      <SelectValue placeholder="Select Category" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableCategories.map((cat) => (
                        <SelectItem key={cat} value={cat}>
                          {cat}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    placeholder="Enter custom category name (e.g. Municipal License)"
                    value={customCategoryInput}
                    onChange={(e) => setCustomCategoryInput(e.target.value)}
                    required
                    className="text-xs h-9"
                  />
                )}
              </div>

              {/* Description */}
              <div className="space-y-1.5 sm:col-span-2">
                <Label className="text-xs font-semibold">Description *</Label>
                <Input
                  required
                  placeholder="e.g. DEWA electricity payment, Engine hoist maintenance, etc."
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  className="text-xs h-9"
                />
              </div>

              {/* Payment Method */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Payment Method *</Label>
                <Select
                  value={formPaymentMethod}
                  onValueChange={(val) => {
                    if (val) setFormPaymentMethod(val);
                  }}
                >
                  <SelectTrigger className="text-xs h-9">
                    <SelectValue placeholder="Payment Method" />
                  </SelectTrigger>
                  <SelectContent>
                    {EXPENSE_PAYMENT_METHODS.map((method) => (
                      <SelectItem key={method.value} value={method.value}>
                        {method.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Paid To / Vendor */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Paid To / Vendor</Label>
                <Input
                  placeholder="e.g. ADNOC, DEWA, Al Futtaim Tools"
                  value={formPaidTo}
                  onChange={(e) => setFormPaidTo(e.target.value)}
                  className="text-xs h-9"
                />
              </div>

              {/* Reference / Receipt No */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Reference / Receipt No</Label>
                <Input
                  placeholder="e.g. INV-9042, TXN-5481"
                  value={formReference}
                  onChange={(e) => setFormReference(e.target.value)}
                  className="text-xs h-9 font-mono"
                />
              </div>

              {/* Ledger Integration: Expense Account & Paid From Account */}
              <div className="sm:col-span-2 p-3 bg-blue-50/60 dark:bg-blue-950/30 rounded-lg border border-blue-200/80 dark:border-blue-900/50 space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-blue-900 dark:text-blue-200">
                  <BookOpen className="w-3.5 h-3.5 text-blue-600" />
                  <span>Double-Entry Accounts / Ledger Integration</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-0.5">
                  <div className="space-y-1">
                    <Label className="text-[11px] font-medium text-slate-600 dark:text-slate-400">Expense Account (Debit)</Label>
                    <div className="text-xs font-medium px-2.5 py-1.5 bg-white dark:bg-slate-900 border rounded flex items-center justify-between">
                      <span className="truncate">{formCategory ? `${formCategory} Expense` : "Miscellaneous Expense"}</span>
                      <Badge variant="outline" className="text-[10px] font-mono shrink-0 ml-1.5 bg-slate-50 dark:bg-slate-800">5000s</Badge>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px] font-medium text-slate-600 dark:text-slate-400">Paid From Account (Credit)</Label>
                    <div className="text-xs font-medium px-2.5 py-1.5 bg-white dark:bg-slate-900 border rounded flex items-center justify-between">
                      <span className="truncate">
                        {formPaymentMethod === "cash"
                          ? "1001 - Cash on Hand"
                          : "1002 - Main Bank Account (ADCB)"}
                      </span>
                      <Badge variant="outline" className="text-[10px] font-mono shrink-0 ml-1.5 bg-slate-50 dark:bg-slate-800">
                        {formPaymentMethod === "cash" ? "Cash" : "Bank"}
                      </Badge>
                    </div>
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                  Automatically posts balanced double-entry transaction to Workshop Ledger on save.
                </p>
              </div>

              {/* Optional Attachment / Receipt */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Attachment / Receipt (Optional)</Label>
                {formAttachmentPath ? (
                  <div className="flex items-center justify-between p-2 rounded-lg border bg-slate-50 dark:bg-slate-800 text-xs">
                    <div className="flex items-center gap-2 truncate">
                      <Paperclip className="h-3.5 w-3.5 text-blue-600 flex-shrink-0" />
                      <span className="truncate font-medium">{formAttachmentName || "Attached Receipt"}</span>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-rose-600 hover:text-rose-700"
                      onClick={() => {
                        setFormAttachmentPath(null);
                        setFormAttachmentName(null);
                      }}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ) : (
                  <div className="relative">
                    <input
                      type="file"
                      id="expense-receipt-file"
                      className="hidden"
                      accept=".jpg,.jpeg,.png,.pdf"
                      onChange={handleFileUpload}
                      disabled={uploadingAttachment}
                    />
                    <label
                      htmlFor="expense-receipt-file"
                      className="flex items-center justify-center gap-2 h-9 px-3 rounded-md border border-dashed border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer text-xs font-medium text-slate-600 dark:text-slate-300"
                    >
                      {uploadingAttachment ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-600" />
                      ) : (
                        <Upload className="h-3.5 w-3.5 text-blue-600" />
                      )}
                      <span>{uploadingAttachment ? "Uploading..." : "Upload Receipt (JPG, PNG, PDF)"}</span>
                    </label>
                  </div>
                )}
              </div>

              {/* Notes */}
              <div className="space-y-1.5 sm:col-span-2">
                <Label className="text-xs font-semibold">Notes / Additional Details</Label>
                <Textarea
                  rows={2}
                  placeholder="Optional internal remarks or billing comments"
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  className="text-xs resize-none"
                />
              </div>
            </div>

            <DialogFooter className="pt-3 border-t">
              <Button
                type="button"
                variant="outline"
                onClick={() => setFormDialogOpen(false)}
                disabled={formLoading}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="bg-blue-600 hover:bg-blue-700 text-white"
                disabled={formLoading}
              >
                {formLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Saving...
                  </>
                ) : editingExpense ? (
                  "Update Expense"
                ) : (
                  "Save Expense"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ─── 5. VIEW EXPENSE DETAILS MODAL ─── */}
      <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
        <DialogContent className="max-w-md">
          {selectedExpense && (
            <div className="space-y-4 text-xs">
              <div className="flex items-center justify-between pb-3 border-b">
                <div>
                  <DialogTitle className="text-base font-bold text-foreground">Expense Record</DialogTitle>
                  <p className="text-[11px] text-muted-foreground font-mono mt-0.5">
                    ID: {selectedExpense.id}
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-lg font-mono font-bold text-blue-600">
                    {formatCurrency(Number(selectedExpense.amount) || 0)}
                  </span>
                  <div className="mt-1">{getMethodBadge(selectedExpense.payment_method)}</div>
                </div>
              </div>

              <div className="space-y-2.5">
                <div className="grid grid-cols-2 gap-2 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-muted-foreground">Date</span>
                    <p className="font-semibold text-foreground font-mono mt-0.5">
                      {selectedExpense.date || selectedExpense.expense_date || "—"}
                    </p>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-bold text-muted-foreground">Category</span>
                    <p className="font-semibold text-foreground mt-0.5">{selectedExpense.category}</p>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-bold text-muted-foreground">Paid To / Vendor</span>
                    <p className="font-semibold text-foreground mt-0.5">{selectedExpense.paid_to || "—"}</p>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-bold text-muted-foreground">Reference No</span>
                    <p className="font-semibold text-foreground font-mono mt-0.5">
                      {selectedExpense.reference_number || "—"}
                    </p>
                  </div>
                </div>

                <div>
                  <span className="text-[10px] uppercase font-bold text-muted-foreground">Description</span>
                  <p className="text-xs font-medium text-foreground mt-1 p-2 rounded-lg bg-slate-50 dark:bg-slate-800/40 border">
                    {selectedExpense.description || "No description provided."}
                  </p>
                </div>

                {selectedExpense.notes && (
                  <div>
                    <span className="text-[10px] uppercase font-bold text-muted-foreground">Notes</span>
                    <p className="text-xs text-muted-foreground mt-1 p-2 rounded-lg bg-slate-50 dark:bg-slate-800/40 border">
                      {selectedExpense.notes}
                    </p>
                  </div>
                )}

                {selectedExpense.attachment_path && (
                  <div>
                    <span className="text-[10px] uppercase font-bold text-muted-foreground">Receipt Attachment</span>
                    <div className="mt-1 p-3 rounded-lg border bg-blue-50/50 dark:bg-blue-950/20 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Paperclip className="h-4 w-4 text-blue-600" />
                        <span className="font-medium text-foreground">Receipt document on file</span>
                      </div>
                      <a
                        href={selectedExpense.attachment_path}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs font-semibold text-blue-600 hover:underline"
                      >
                        Open Attachment
                      </a>
                    </div>
                  </div>
                )}
              </div>

              <DialogFooter className="pt-2">
                <Button variant="outline" onClick={() => setViewDialogOpen(false)} className="w-full">
                  Close
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ─── 6. UNIFIED DELETE CONFIRMATION MODAL ─── */}
      <RecordDeleteDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        recordType="Expense"
        recordTypePlural="Expenses"
        recordCount={expensesToDelete.length}
        singleRecordIdentifier={expensesToDelete[0]?.description || (expensesToDelete[0] ? `AED ${Number(expensesToDelete[0].amount).toFixed(2)}` : undefined)}
        onConfirmDelete={handleConfirmDelete}
        isDeleting={deleteLoading}
      />

      {/* Floating Bulk Action Bar */}
      <BulkActionBar
        selectedCount={selectedExpenseIds.length}
        onClearSelection={() => setSelectedExpenseIds([])}
        onDeleteSelected={handleRequestBulkDelete}
        deleteLabel="Delete Selected"
        isDeleting={deleteLoading}
      />

      {/* ─── 7. COMPREHENSIVE EXPENSE REPORT MODAL ─── */}
      <Dialog open={reportDialogOpen} onOpenChange={setReportDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <div className="space-y-4">
            <div className="flex items-center justify-between pb-3 border-b">
              <div>
                <DialogTitle className="text-base font-bold text-foreground">Workshop Expense Report</DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground">
                  Breakdown of operational expenditures by category and payment method
                </DialogDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 text-xs print:hidden"
                onClick={() => window.print()}
              >
                <Printer className="h-3.5 w-3.5" />
                <span>Print Report</span>
              </Button>
            </div>

            {/* Date Range Selector */}
            <div className="flex flex-wrap items-center gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border text-xs">
              <div className="flex items-center gap-2">
                <Label className="text-xs font-semibold">Start Date:</Label>
                <Input
                  type="date"
                  value={reportStartDate}
                  onChange={(e) => setReportStartDate(e.target.value)}
                  className="h-8 text-xs w-36"
                />
              </div>
              <div className="flex items-center gap-2">
                <Label className="text-xs font-semibold">End Date:</Label>
                <Input
                  type="date"
                  value={reportEndDate}
                  onChange={(e) => setReportEndDate(e.target.value)}
                  className="h-8 text-xs w-36"
                />
              </div>
              <Button
                size="sm"
                className="h-8 text-xs gap-1 bg-blue-600 hover:bg-blue-700 text-white"
                onClick={handleRefreshReport}
                disabled={reportLoading}
              >
                {reportLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                <span>Calculate</span>
              </Button>
            </div>

            {reportLoading ? (
              <div className="py-16 text-center text-slate-400">
                <Loader2 className="h-8 w-8 animate-spin mx-auto text-blue-600 mb-2" />
                <p className="text-xs font-medium">Generating financial audit metrics...</p>
              </div>
            ) : reportData ? (
              <div className="space-y-5">
                {/* Total Highlight */}
                <div className="p-4 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-700 text-white flex items-center justify-between shadow-sm">
                  <div>
                    <span className="text-xs uppercase tracking-wider text-blue-100 font-semibold">Total Expenses In Period</span>
                    <p className="text-2xl font-bold font-mono mt-0.5">
                      {formatCurrency(reportData.totalExpenses)}
                    </p>
                  </div>
                  <div className="text-right text-xs text-blue-100">
                    <p className="font-semibold">{reportData.expensesCount} transactions</p>
                    <p className="text-[11px] opacity-80">{reportData.startDate} to {reportData.endDate}</p>
                  </div>
                </div>

                {/* Category Breakdown */}
                <div className="space-y-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-foreground">
                    Category Breakdown
                  </h4>
                  {reportData.categoryBreakdown.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic">No expenses recorded in this period.</p>
                  ) : (
                    <div className="border rounded-xl overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-slate-50 dark:bg-slate-800 hover:bg-slate-50">
                            <TableHead className="text-xs font-semibold">Category</TableHead>
                            <TableHead className="text-center text-xs font-semibold w-20">Count</TableHead>
                            <TableHead className="text-right text-xs font-semibold w-28">Amount</TableHead>
                            <TableHead className="text-right text-xs font-semibold w-24">Share</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {reportData.categoryBreakdown.map((item) => (
                            <TableRow key={item.category} className="text-xs">
                              <TableCell className="font-medium text-foreground">{item.category}</TableCell>
                              <TableCell className="text-center font-mono text-muted-foreground">{item.count}</TableCell>
                              <TableCell className="text-right font-mono font-bold text-foreground">
                                {formatCurrency(item.amount)}
                              </TableCell>
                              <TableCell className="text-right font-mono text-muted-foreground">
                                {item.percentage}%
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>

                {/* Payment Method Breakdown */}
                <div className="space-y-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-foreground">
                    Payment Method Breakdown
                  </h4>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {reportData.paymentMethodBreakdown.map((pm) => (
                      <div key={pm.paymentMethod} className="p-3 rounded-xl border bg-slate-50 dark:bg-slate-800 text-xs">
                        <span className="text-[10px] uppercase font-bold text-muted-foreground">{pm.label}</span>
                        <p className="text-sm font-bold font-mono text-foreground mt-1">
                          {formatCurrency(pm.amount)}
                        </p>
                        <p className="text-[11px] text-muted-foreground font-mono mt-0.5">
                          {pm.count} txns ({pm.percentage}%)
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}

            <DialogFooter className="pt-3 border-t">
              <Button variant="outline" onClick={() => setReportDialogOpen(false)}>
                Close
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
