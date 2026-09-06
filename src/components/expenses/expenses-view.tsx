"use client";

import { useState, useEffect, useCallback, useTransition, useMemo } from "react";
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
import type { Expense } from "@/types/database";
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
  Trash2,
  Edit,
  Eye,
  Paperclip,
  Upload,
  X,
  Loader2,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  Printer,
  ChevronLeft,
  ChevronRight,
  MoreVertical,
  Layers,
  Tag,
  CreditCard,
  Banknote,
  DollarSign,
  TrendingDown,
  User,
  Clock,
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
  const { user, role, isOwner, canDelete: authCanDelete, canEdit: authCanEdit } = usePermissions();
  const canDelete = isOwner || role === "admin" || authCanDelete;
  const canEdit = !role?.includes("viewer") && authCanEdit;
  const canAdd = !role?.includes("viewer");

  const [, startTransition] = useTransition();

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

  // Compute Top Category from loaded expenses
  const topCategory = useMemo(() => {
    if (!expenses.length) return { name: "None", amount: 0 };
    const catMap: Record<string, number> = {};
    for (const exp of expenses) {
      const cat = exp.category || "Miscellaneous";
      catMap[cat] = (catMap[cat] || 0) + (Number(exp.amount) || 0);
    }
    let topName = "None";
    let maxVal = 0;
    for (const [cat, total] of Object.entries(catMap)) {
      if (total > maxVal) {
        maxVal = total;
        topName = cat;
      }
    }
    return { name: topName, amount: maxVal };
  }, [expenses]);

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
        return <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[11px] font-medium">Cash</Badge>;
      case "bank":
      case "bank_transfer":
        return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 text-[11px] font-medium">Bank Transfer</Badge>;
      case "credit_card":
        return <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200 text-[11px] font-medium">Credit Card</Badge>;
      default:
        return <Badge variant="outline" className="bg-slate-50 text-slate-700 border-slate-200 text-[11px] font-medium">Other</Badge>;
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

      {/* ─── Page Header ─── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <PageHeader
          title="Expenses"
          description="Track workshop operational costs and financial outflows."
          breadcrumbs={[
            { label: "Dashboard", href: "/" },
            { label: "Expenses" },
          ]}
        />
        <div className="flex items-center gap-2.5">
          <Button
            variant="outline"
            size="sm"
            onClick={loadExpenses}
            disabled={loading}
            className="h-9 gap-1.5 text-xs text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-800"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            <span>Refresh</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-9 gap-2 text-xs border-slate-300 dark:border-slate-700"
            onClick={handleOpenReport}
          >
            <BarChart3 className="h-3.5 w-3.5 text-blue-600" />
            <span>Expense Report</span>
          </Button>

          {canAdd && (
            <Button
              size="sm"
              className="h-9 gap-2 text-xs bg-blue-600 hover:bg-blue-700 text-white shadow-sm font-medium"
              onClick={openAddDialog}
            >
              <Plus className="h-4 w-4" />
              <span>Add Expense</span>
            </Button>
          )}
        </div>
      </div>

      {/* ─── 1. TOP SUMMARY KPI CARDS (4 Compact Cards) ─── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        {/* Expenses Today */}
        <Card className="border border-slate-200/80 dark:border-slate-800 shadow-xs bg-white dark:bg-slate-900 rounded-xl">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Expenses Today</span>
              <div className="h-7 w-7 rounded-lg bg-amber-50 dark:bg-amber-950/50 flex items-center justify-center">
                <CalendarDays className="h-3.5 w-3.5 text-amber-600" />
              </div>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-xl font-bold font-mono tracking-tight text-slate-900 dark:text-white tabular-nums">
                {formatCurrency(metrics.todayTotal)}
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mt-1 flex items-center gap-1">
              <Clock className="h-3 w-3 inline" /> Logged today
            </p>
          </CardContent>
        </Card>

        {/* This Month */}
        <Card className="border border-slate-200/80 dark:border-slate-800 shadow-xs bg-white dark:bg-slate-900 rounded-xl">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">This Month</span>
              <div className="h-7 w-7 rounded-lg bg-blue-50 dark:bg-blue-950/50 flex items-center justify-center">
                <Wallet className="h-3.5 w-3.5 text-blue-600" />
              </div>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-xl font-bold font-mono tracking-tight text-blue-600 dark:text-blue-400 tabular-nums">
                {formatCurrency(metrics.thisMonthTotal)}
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mt-1 flex items-center gap-1">
              <Receipt className="h-3 w-3 inline" /> Current monthly outflows
            </p>
          </CardContent>
        </Card>

        {/* Total Expenses (This Year) */}
        <Card className="border border-slate-200/80 dark:border-slate-800 shadow-xs bg-white dark:bg-slate-900 rounded-xl">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Expenses</span>
              <div className="h-7 w-7 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                <TrendingDown className="h-3.5 w-3.5 text-slate-600 dark:text-slate-300" />
              </div>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-xl font-bold font-mono tracking-tight text-slate-900 dark:text-white tabular-nums">
                {formatCurrency(metrics.thisYearTotal)}
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mt-1 flex items-center gap-1">
              <Building2 className="h-3 w-3 inline" /> Cumulative {new Date().getFullYear()}
            </p>
          </CardContent>
        </Card>

        {/* Top Category */}
        <Card className="border border-slate-200/80 dark:border-slate-800 shadow-xs bg-white dark:bg-slate-900 rounded-xl">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Top Category</span>
              <div className="h-7 w-7 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 flex items-center justify-center">
                <Tag className="h-3.5 w-3.5 text-emerald-600" />
              </div>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-lg font-bold tracking-tight text-slate-900 dark:text-white truncate">
                {topCategory.name}
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mt-1 font-mono tabular-nums">
              {topCategory.amount > 0 ? formatCurrency(topCategory.amount) : "No spend recorded"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* ─── 2. SEARCH & FILTER TOOLBAR ─── */}
      <div className="bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-2.5 items-center">
          {/* Search Input */}
          <div className="md:col-span-5">
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
              <SelectTrigger className="w-full text-xs h-9">
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
          <div className="md:col-span-2">
            <Select
              value={categoryFilter}
              onValueChange={(val) => {
                if (val) {
                  setCategoryFilter(val);
                  setPage(1);
                }
              }}
            >
              <SelectTrigger className="w-full text-xs h-9">
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
              <SelectTrigger className="w-full text-xs h-9">
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
          <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
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
      </div>

      {/* ─── 3. EXPENSES TABLE ─── */}
      <Card className="border border-slate-200/80 dark:border-slate-800 shadow-xs overflow-hidden bg-white dark:bg-slate-900 rounded-xl">
        <CardContent className="p-0">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-400">
              <Loader2 className="h-7 w-7 animate-spin text-blue-600 mb-2" />
              <p className="text-xs font-medium text-slate-500">Loading expenses...</p>
            </div>
          ) : expenses.length === 0 ? (
            <div className="text-center py-16 px-4">
              <Receipt className="h-10 w-10 mx-auto text-slate-300 dark:text-slate-600 mb-2.5" />
              <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">No expenses found</h3>
              <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                No expense records match your current date range and filters.
              </p>
              {canAdd && (
                <Button size="sm" className="mt-3.5 gap-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white" onClick={openAddDialog}>
                  <Plus className="h-3.5 w-3.5" />
                  <span>Add Expense</span>
                </Button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200/80 dark:border-slate-800 hover:bg-slate-50">
                    <TableHead className="w-[38px] pl-3.5">
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
                    <TableHead className="w-[100px] text-xs font-semibold text-slate-700 dark:text-slate-200">Date</TableHead>
                    <TableHead className="w-[150px] text-xs font-semibold text-slate-700 dark:text-slate-200">Category</TableHead>
                    <TableHead className="min-w-[200px] text-xs font-semibold text-slate-700 dark:text-slate-200">Description</TableHead>
                    <TableHead className="text-right w-[130px] text-xs font-semibold text-slate-700 dark:text-slate-200">Amount</TableHead>
                    <TableHead className="w-[120px] text-xs font-semibold text-slate-700 dark:text-slate-200">Payment Method</TableHead>
                    <TableHead className="min-w-[140px] text-xs font-semibold text-slate-700 dark:text-slate-200">Paid To</TableHead>
                    <TableHead className="w-[120px] text-xs font-semibold text-slate-700 dark:text-slate-200">Reference</TableHead>
                    <TableHead className="w-[110px] text-xs font-semibold text-slate-700 dark:text-slate-200">Created By</TableHead>
                    <TableHead className="w-[90px] min-w-[90px] text-right pr-4 text-xs font-semibold text-slate-700 dark:text-slate-200">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {expenses.map((exp) => (
                    <TableRow
                      key={exp.id}
                      className={`h-12 border-b border-slate-100 dark:border-slate-800/60 hover:bg-slate-50/70 dark:hover:bg-slate-800/50 transition-colors text-[13px] ${
                        selectedExpenseIds.includes(exp.id) ? "bg-blue-50/40 dark:bg-blue-950/20" : ""
                      }`}
                    >
                      <TableCell className="pl-3.5">
                        <Checkbox
                          checked={selectedExpenseIds.includes(exp.id)}
                          onCheckedChange={() => handleToggleSelectExpense(exp.id)}
                          aria-label={`Select expense ${exp.description || exp.id}`}
                        />
                      </TableCell>

                      {/* Date */}
                      <TableCell className="font-mono text-xs text-slate-700 dark:text-slate-300 whitespace-nowrap">
                        {exp.date || exp.expense_date || (exp.created_at ? exp.created_at.slice(0, 10) : "N/A")}
                      </TableCell>

                      {/* Category */}
                      <TableCell>
                        <Badge variant="secondary" className="font-medium text-[11px] bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-none gap-1 py-0.5">
                          <Tag className="h-2.5 w-2.5 text-slate-400" />
                          <span>{exp.category}</span>
                        </Badge>
                      </TableCell>

                      {/* Description */}
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium text-slate-900 dark:text-white line-clamp-1">
                            {exp.description || "—"}
                          </span>
                          {exp.attachment_path && (
                            <a
                              href={exp.attachment_path}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:text-blue-700 inline-flex items-center shrink-0"
                              title="View receipt attachment"
                            >
                              <Paperclip className="h-3 w-3" />
                            </a>
                          )}
                        </div>
                      </TableCell>

                      {/* Amount (Right Aligned, Tabular Nums) */}
                      <TableCell className="text-right font-mono font-bold text-xs text-slate-900 dark:text-white tabular-nums whitespace-nowrap">
                        {formatCurrency(Number(exp.amount) || 0)}
                      </TableCell>

                      {/* Payment Method */}
                      <TableCell className="whitespace-nowrap">
                        {getMethodBadge(exp.payment_method)}
                      </TableCell>

                      {/* Paid To */}
                      <TableCell className="text-xs text-slate-600 dark:text-slate-300 whitespace-nowrap">
                        {exp.paid_to || "—"}
                      </TableCell>

                      {/* Reference */}
                      <TableCell className="text-xs font-mono text-slate-500 whitespace-nowrap">
                        {exp.reference_number || "—"}
                      </TableCell>

                      {/* Created By */}
                      <TableCell className="text-xs text-slate-500 truncate max-w-[110px]" title={exp.created_by || "Staff"}>
                        {exp.created_by || "Staff"}
                      </TableCell>

                      {/* Actions (Unclipped) */}
                      <TableCell className="text-right pr-4 whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-slate-500 hover:text-slate-900 dark:text-slate-300"
                            onClick={() => {
                              setSelectedExpense(exp);
                              setViewDialogOpen(true);
                            }}
                            title="View Details"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </Button>

                          <DropdownMenu>
                            <DropdownMenuTrigger className="h-7 w-7 inline-flex items-center justify-center rounded-md border border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 focus:outline-none">
                              <MoreVertical className="h-3.5 w-3.5" />
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-44 text-xs">
                              <DropdownMenuLabel>Actions</DropdownMenuLabel>
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
            <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200/80 dark:border-slate-800 text-xs text-muted-foreground">
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

      {/* ─── 4. ADD / EDIT EXPENSE MODAL (Standardized Sections) ─── */}
      <Dialog open={formDialogOpen} onOpenChange={setFormDialogOpen}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto p-0 gap-0 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xl">
          <form onSubmit={handleSaveExpense}>
            <div className="p-5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
              <DialogTitle className="text-base font-bold text-foreground">
                {editingExpense ? "Edit Expense" : "Record Expense"}
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                Record workshop operational costs and financial outflows.
              </DialogDescription>
            </div>

            <div className="p-5 space-y-5 text-xs">
              {/* SECTION 1: EXPENSE DETAILS */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 pb-1 border-b border-slate-100 dark:border-slate-800">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    1. Expense Details
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  {/* Date */}
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">Date *</Label>
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
                    <Label className="text-xs font-medium">Amount (AED) *</Label>
                    <div className="relative">
                      <span className="absolute left-3 top-2.5 text-xs font-bold text-slate-400">AED</span>
                      <Input
                        type="number"
                        step="0.01"
                        min="0.01"
                        required
                        placeholder="0.00"
                        value={formAmount}
                        onChange={(e) => setFormAmount(e.target.value)}
                        className="text-xs h-9 pl-12 font-mono font-bold tabular-nums"
                      />
                    </div>
                  </div>

                  {/* Category */}
                  <div className="space-y-1.5 sm:col-span-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-medium">Category *</Label>
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
                        {isCustomCategory ? "Choose standard category" : "+ Add Custom Category"}
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
                    <Label className="text-xs font-medium">Description *</Label>
                    <Input
                      required
                      placeholder="e.g. Workshop compressor service, DEWA bill, Engine oil stock"
                      value={formDescription}
                      onChange={(e) => setFormDescription(e.target.value)}
                      className="text-xs h-9"
                    />
                  </div>
                </div>
              </div>

              {/* SECTION 2: PAYMENT */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 pb-1 border-b border-slate-100 dark:border-slate-800">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    2. Payment
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  {/* Payment Method */}
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">Payment Method *</Label>
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

                  {/* Paid To */}
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">Paid To / Vendor</Label>
                    <Input
                      placeholder="e.g. ADNOC, DEWA, Al Futtaim Tools"
                      value={formPaidTo}
                      onChange={(e) => setFormPaidTo(e.target.value)}
                      className="text-xs h-9"
                    />
                  </div>

                  {/* Reference */}
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label className="text-xs font-medium">Reference / Receipt Number</Label>
                    <Input
                      placeholder="e.g. INV-9042, TXN-5481"
                      value={formReference}
                      onChange={(e) => setFormReference(e.target.value)}
                      className="text-xs h-9 font-mono"
                    />
                  </div>

                  {/* Ledger Posting Info */}
                  <div className="sm:col-span-2 p-3 bg-slate-50 dark:bg-slate-800/40 rounded-lg border border-slate-200/80 dark:border-slate-700/60 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-slate-500">Debit (Expense)</span>
                      <span className="font-mono font-medium text-slate-700 dark:text-slate-300">
                        {formCategory || "General"} Expense
                      </span>
                    </div>
                    <div className="flex items-center justify-between mt-1 pt-1 border-t border-slate-200/50 dark:border-slate-700/50">
                      <span className="text-[11px] text-slate-500">Credit (Payment Source)</span>
                      <span className="font-mono font-medium text-slate-700 dark:text-slate-300">
                        {formPaymentMethod === "cash" ? "Cash on Hand" : "Bank Account"}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* SECTION 3: ADDITIONAL */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 pb-1 border-b border-slate-100 dark:border-slate-800">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    3. Additional
                  </span>
                </div>
                <div className="grid grid-cols-1 gap-3.5">
                  {/* Notes */}
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">Notes</Label>
                    <Textarea
                      rows={2}
                      placeholder="Optional remarks or additional details..."
                      value={formNotes}
                      onChange={(e) => setFormNotes(e.target.value)}
                      className="text-xs resize-none"
                    />
                  </div>

                  {/* Attachment */}
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">Attachment (Receipt)</Label>
                    {formAttachmentPath ? (
                      <div className="flex items-center justify-between p-2.5 rounded-lg border bg-slate-50 dark:bg-slate-800 text-xs">
                        <div className="flex items-center gap-2 truncate">
                          <Paperclip className="h-3.5 w-3.5 text-blue-600 shrink-0" />
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
                </div>
              </div>
            </div>

            <DialogFooter className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex items-center justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setFormDialogOpen(false)}
                disabled={formLoading}
                className="text-xs"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium"
                disabled={formLoading}
              >
                {formLoading ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
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
        <DialogContent className="max-w-md p-0 gap-0 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 shadow-xl">
          {selectedExpense && (
            <div>
              <div className="p-5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex items-center justify-between">
                <div>
                  <DialogTitle className="text-base font-bold text-foreground">Expense Record</DialogTitle>
                  <p className="text-[11px] text-muted-foreground font-mono mt-0.5">
                    ID: {selectedExpense.id}
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-lg font-mono font-bold text-blue-600 tabular-nums">
                    {formatCurrency(Number(selectedExpense.amount) || 0)}
                  </span>
                  <div className="mt-1">{getMethodBadge(selectedExpense.payment_method)}</div>
                </div>
              </div>

              <div className="p-5 space-y-3.5 text-xs">
                <div className="grid grid-cols-2 gap-2.5 p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700/60">
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
                    <span className="text-[10px] uppercase font-bold text-muted-foreground">Paid To</span>
                    <p className="font-semibold text-foreground mt-0.5">{selectedExpense.paid_to || "—"}</p>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-bold text-muted-foreground">Reference</span>
                    <p className="font-semibold text-foreground font-mono mt-0.5">
                      {selectedExpense.reference_number || "—"}
                    </p>
                  </div>
                </div>

                <div>
                  <span className="text-[10px] uppercase font-bold text-muted-foreground">Description</span>
                  <p className="text-xs font-medium text-foreground mt-1 p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-700/60">
                    {selectedExpense.description || "No description provided."}
                  </p>
                </div>

                {selectedExpense.notes && (
                  <div>
                    <span className="text-[10px] uppercase font-bold text-muted-foreground">Notes</span>
                    <p className="text-xs text-muted-foreground mt-1 p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-700/60">
                      {selectedExpense.notes}
                    </p>
                  </div>
                )}

                {selectedExpense.attachment_path && (
                  <div>
                    <span className="text-[10px] uppercase font-bold text-muted-foreground">Receipt Attachment</span>
                    <div className="mt-1 p-2.5 rounded-lg border border-blue-200 bg-blue-50/50 dark:bg-blue-950/20 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Paperclip className="h-4 w-4 text-blue-600" />
                        <span className="font-medium text-foreground">Receipt attached</span>
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

              <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
                <Button variant="outline" size="sm" onClick={() => setViewDialogOpen(false)} className="w-full text-xs">
                  Close
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ─── 6. DELETE DIALOG & BULK ACTION BAR ─── */}
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

      <BulkActionBar
        selectedCount={selectedExpenseIds.length}
        onClearSelection={() => setSelectedExpenseIds([])}
        onDeleteSelected={handleRequestBulkDelete}
        deleteLabel="Delete Selected"
        isDeleting={deleteLoading}
      />

      {/* ─── 7. EXPENSE REPORT MODAL ─── */}
      <Dialog open={reportDialogOpen} onOpenChange={setReportDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto p-0 gap-0 rounded-xl">
          <div className="p-5 border-b flex items-center justify-between bg-slate-50/50 dark:bg-slate-900/50">
            <div>
              <DialogTitle className="text-base font-bold text-foreground">Workshop Expense Report</DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">
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
              <span>Print</span>
            </Button>
          </div>

          <div className="p-5 space-y-4">
            {/* Date Range Selector */}
            <div className="flex flex-wrap items-center gap-3 p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 border text-xs">
              <div className="flex items-center gap-2">
                <Label className="text-xs font-semibold">Start:</Label>
                <Input
                  type="date"
                  value={reportStartDate}
                  onChange={(e) => setReportStartDate(e.target.value)}
                  className="h-8 text-xs w-36"
                />
              </div>
              <div className="flex items-center gap-2">
                <Label className="text-xs font-semibold">End:</Label>
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
              <div className="py-12 text-center text-slate-400">
                <Loader2 className="h-6 w-6 animate-spin mx-auto text-blue-600 mb-2" />
                <p className="text-xs font-medium">Generating financial audit metrics...</p>
              </div>
            ) : reportData ? (
              <div className="space-y-4">
                <div className="p-4 rounded-xl bg-blue-600 text-white flex items-center justify-between">
                  <div>
                    <span className="text-[11px] uppercase tracking-wider text-blue-100 font-semibold">Total Expenses In Period</span>
                    <p className="text-2xl font-bold font-mono mt-0.5 tabular-nums">
                      {formatCurrency(reportData.totalExpenses)}
                    </p>
                  </div>
                  <div className="text-right text-xs text-blue-100">
                    <p className="font-semibold">{reportData.expensesCount} transactions</p>
                    <p className="text-[11px] opacity-80">{reportData.startDate} to {reportData.endDate}</p>
                  </div>
                </div>

                <div className="space-y-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-foreground">
                    Category Breakdown
                  </h4>
                  {reportData.categoryBreakdown.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic">No expenses recorded in this period.</p>
                  ) : (
                    <div className="border rounded-lg overflow-hidden">
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
                              <TableCell className="text-right font-mono font-bold text-foreground tabular-nums">
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

                <div className="space-y-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-foreground">
                    Payment Method Breakdown
                  </h4>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    {reportData.paymentMethodBreakdown.map((pm) => (
                      <div key={pm.paymentMethod} className="p-3 rounded-lg border bg-slate-50 dark:bg-slate-800 text-xs">
                        <span className="text-[10px] uppercase font-bold text-muted-foreground">{pm.label}</span>
                        <p className="text-sm font-bold font-mono text-foreground mt-1 tabular-nums">
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
          </div>

          <DialogFooter className="p-4 border-t bg-slate-50/50 dark:bg-slate-900/50">
            <Button variant="outline" size="sm" onClick={() => setReportDialogOpen(false)} className="text-xs">
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
