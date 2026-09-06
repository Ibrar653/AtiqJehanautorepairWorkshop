"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  getRecycleBinItems,
  getRecycleBinSummaryCounts,
  getRecycleBinHistory,
  getRecordActivityHistory,
  restoreRecord,
  permanentlyDelete,
  checkFinancialLinkage,
  type RecycleBinItem,
  type RecycleBinRecordType,
  type RecycleBinTabType,
  type RecycleBinDateFilter,
  type RecycleBinSortOption,
  type RecycleBinSummaryCounts,
  type RecycleBinHistoryEvent,
} from "@/lib/services/recycle-bin-service";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { BulkActionBar } from "@/components/shared/bulk-action-bar";
import { RecordDeleteDialog } from "@/components/shared/record-delete-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Trash2,
  RotateCcw,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Users,
  Car,
  ClipboardList,
  Receipt,
  ShieldAlert,
  Search,
  Calendar,
  Filter,
  Clock,
  ArrowUpDown,
  Eye,
  Layers,
  FileText,
  Wrench,
  Package,
  Truck,
  ShoppingCart,
  CreditCard,
  BookOpen,
  ShieldCheck,
  History,
  X,
  ChevronLeft,
  ChevronRight,
  Info,
} from "lucide-react";
import { formatDate } from "@/lib/utils";
import { usePermissions } from "@/lib/context/auth-context";

// ─── MODULE TABS DEFINITION ──────────────────────────────────────────────────

const MODULE_FILTERS: { id: RecycleBinTabType; label: string; icon: any }[] = [
  { id: "all", label: "All Records", icon: Layers },
  { id: "customers", label: "Customers", icon: Users },
  { id: "vehicles", label: "Vehicles", icon: Car },
  { id: "job_cards", label: "Job Cards", icon: ClipboardList },
  { id: "services", label: "Services", icon: Wrench },
  { id: "parts", label: "Spare Parts", icon: Package },
  { id: "suppliers", label: "Suppliers", icon: Truck },
  { id: "purchases", label: "Purchases", icon: ShoppingCart },
  { id: "invoices", label: "Invoices", icon: FileText },
  { id: "payments", label: "Payments", icon: CreditCard },
  { id: "expenses", label: "Expenses", icon: Receipt },
  { id: "ledger_accounts", label: "Accounts / Ledger", icon: BookOpen },
];

export function RecycleBinView() {
  const { user, isOwner, role, isViewer, canEdit } = usePermissions();
  const canManage = isOwner || role === "admin";
  const canRestore = canManage || (role === "manager" && canEdit);
  const currentUserDisplayName = user?.full_name || user?.email || (isOwner ? "Owner" : "Admin");

  // Main View Mode: 'active' (Deleted records) or 'history' (Audit log)
  const [viewMode, setViewMode] = useState<"active" | "history">("active");

  // Summary counts
  const [counts, setCounts] = useState<RecycleBinSummaryCounts>({
    totalDeleted: 0,
    deletedToday: 0,
    customers: 0,
    jobCards: 0,
    spareParts: 0,
    other: 0,
  });

  // Filter & Search State
  const [selectedModule, setSelectedModule] = useState<RecycleBinTabType>("all");
  const [searchInput, setSearchInput] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [dateFilter, setDateFilter] = useState<RecycleBinDateFilter>("all");
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");
  const [sortBy, setSortBy] = useState<RecycleBinSortOption>("newest");

  // Data State
  const [items, setItems] = useState<RecycleBinItem[]>([]);
  const [historyEvents, setHistoryEvents] = useState<RecycleBinHistoryEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [toastMessage, setToastMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 15;

  // Restore Modal State
  const [restoreDialogOpen, setRestoreDialogOpen] = useState(false);
  const [itemToRestore, setItemToRestore] = useState<RecycleBinItem | null>(null);

  // Permanent Delete Modal State
  const [permanentDialogOpen, setPermanentDialogOpen] = useState(false);
  const [itemToPurge, setItemToPurge] = useState<RecycleBinItem | null>(null);
  const [financialBlockMessage, setFinancialBlockMessage] = useState<string | null>(null);

  // Bulk Selection & Bulk Action State
  const [selectedItemKeys, setSelectedItemKeys] = useState<string[]>([]);
  const [bulkPurgeDialogOpen, setBulkPurgeDialogOpen] = useState(false);
  const [bulkActionLoading, setBulkActionLoading] = useState(false);
  const [bulkBlockedMessage, setBulkBlockedMessage] = useState<string | null>(null);

  // Details View Modal State
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);
  const [selectedDetailItem, setSelectedDetailItem] = useState<RecycleBinItem | null>(null);
  const [recordHistory, setRecordHistory] = useState<RecycleBinHistoryEvent[]>([]);
  const [recordHistoryLoading, setRecordHistoryLoading] = useState(false);

  // ─── 280ms Search Debounce ────────────────────────────────────────────────
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchInput.trim());
      setCurrentPage(1);
    }, 280);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // ─── Load Data ────────────────────────────────────────────────────────────
  const loadAllData = useCallback(async () => {
    setLoading(true);
    try {
      // 1. Fetch counts
      const c = await getRecycleBinSummaryCounts();
      setCounts(c);

      // 2. Fetch active items or history depending on mode
      if (viewMode === "active") {
        const data = await getRecycleBinItems(selectedModule, debouncedQuery, {
          dateFilter,
          startDate: customStartDate || undefined,
          endDate: customEndDate || undefined,
          sortBy,
        });
        setItems(data);
      } else {
        const hist = await getRecycleBinHistory({
          record_type: selectedModule === "all" ? undefined : selectedModule.replace(/s$/, ""),
          search: debouncedQuery,
          startDate: customStartDate || undefined,
          endDate: customEndDate || undefined,
        });
        setHistoryEvents(hist);
      }
    } catch (err: any) {
      console.error("Recycle bin load error:", err);
      setToastMessage({ type: "error", text: err.message || "Failed to load recycle bin records" });
    } finally {
      setLoading(false);
    }
  }, [viewMode, selectedModule, debouncedQuery, dateFilter, customStartDate, customEndDate, sortBy]);

  useEffect(() => {
    loadAllData();
  }, [loadAllData]);

  // Toast helper
  const showToast = (text: string, type: "success" | "error" = "success") => {
    setToastMessage({ type, text });
    setTimeout(() => setToastMessage(null), 4500);
  };

  // ─── Selection Handlers ───────────────────────────────────────────────────
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedItemKeys(paginatedItems.map((item) => `${item.type}:${item.id}`));
    } else {
      setSelectedItemKeys([]);
    }
  };

  const handleToggleSelectItem = (key: string) => {
    setSelectedItemKeys((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  // ─── Bulk Restore & Bulk Purge Handlers ───────────────────────────────────
  const handleBulkRestore = async () => {
    if (selectedItemKeys.length === 0) return;
    setBulkActionLoading(true);
    let successCount = 0;
    try {
      for (const key of selectedItemKeys) {
        const [type, id] = key.split(":");
        const res = await restoreRecord(type as any, id, currentUserDisplayName);
        if (res.success) successCount++;
      }
      showToast(`Restored ${successCount} record(s) successfully!`);
      setSelectedItemKeys([]);
      await loadAllData();
    } catch (err: any) {
      showToast(err.message || "Failed to restore some records", "error");
    } finally {
      setBulkActionLoading(false);
    }
  };

  const handleRequestBulkPurge = async () => {
    if (selectedItemKeys.length === 0) return;
    setBulkBlockedMessage(null);
    for (const key of selectedItemKeys) {
      const [type, id] = key.split(":");
      const linkage = await checkFinancialLinkage(type as any, id);
      if (linkage.hasHistory) {
        setBulkBlockedMessage(
          `One or more selected records (${linkage.reason || "financial transaction history"}) cannot be permanently erased to protect accounting integrity.`
        );
        break;
      }
    }
    setBulkPurgeDialogOpen(true);
  };

  const handleConfirmBulkPurge = async () => {
    if (selectedItemKeys.length === 0 || bulkBlockedMessage) return;
    setBulkActionLoading(true);
    let purgedCount = 0;
    try {
      for (const key of selectedItemKeys) {
        const [type, id] = key.split(":");
        const res = await permanentlyDelete(type as any, id, role, currentUserDisplayName);
        if (res.success) purgedCount++;
      }
      showToast(`Permanently deleted ${purgedCount} record(s).`);
      setBulkPurgeDialogOpen(false);
      setSelectedItemKeys([]);
      await loadAllData();
    } catch (err: any) {
      showToast(err.message || "Failed to permanently delete records", "error");
    } finally {
      setBulkActionLoading(false);
    }
  };

  // ─── Restore Handler ──────────────────────────────────────────────────────
  const openRestoreModal = (item: RecycleBinItem) => {
    setItemToRestore(item);
    setRestoreDialogOpen(true);
  };

  const handleConfirmRestore = async () => {
    if (!itemToRestore) return;
    setActionLoading(true);
    try {
      const res = await restoreRecord(itemToRestore.type, itemToRestore.id, currentUserDisplayName);
      if (!res.success) {
        showToast(res.error || "Failed to restore record", "error");
        return;
      }

      showToast(`Record "${itemToRestore.nameOrNumber}" restored successfully!`);
      setRestoreDialogOpen(false);
      setItemToRestore(null);
      if (detailsDialogOpen) setDetailsDialogOpen(false);
      loadAllData();
    } catch (err: any) {
      showToast(err.message || "Failed to restore record", "error");
    } finally {
      setActionLoading(false);
    }
  };

  // ─── Permanent Delete Handler ─────────────────────────────────────────────
  const openPermanentModal = async (item: RecycleBinItem) => {
    setItemToPurge(item);
    setFinancialBlockMessage(null);
    setPermanentDialogOpen(true);

    // Pre-check financial linkage
    const linkage = await checkFinancialLinkage(item.type, item.id);
    if (linkage.hasHistory) {
      setFinancialBlockMessage(
        linkage.reason || "This record has linked financial history and cannot be permanently deleted."
      );
    }
  };

  const handleConfirmPurge = async () => {
    if (!itemToPurge) return;
    if (financialBlockMessage) return;

    setActionLoading(true);
    try {
      const res = await permanentlyDelete(
        itemToPurge.type,
        itemToPurge.id,
        role,
        currentUserDisplayName
      );

      if (!res.success) {
        setFinancialBlockMessage(res.error || "Deletion blocked for safety reasons.");
        showToast(res.error || "Deletion blocked", "error");
        loadAllData();
        return;
      }

      showToast(`Record "${itemToPurge.nameOrNumber}" has been permanently purged.`);
      setPermanentDialogOpen(false);
      setItemToPurge(null);
      if (detailsDialogOpen) setDetailsDialogOpen(false);
      loadAllData();
    } catch (err: any) {
      showToast(err.message || "Failed to permanently delete record", "error");
    } finally {
      setActionLoading(false);
    }
  };

  // ─── Details View Handler ─────────────────────────────────────────────────
  const openDetailsModal = async (item: RecycleBinItem) => {
    setSelectedDetailItem(item);
    setDetailsDialogOpen(true);
    setRecordHistoryLoading(true);
    try {
      const hist = await getRecordActivityHistory(item.id);
      setRecordHistory(hist);
    } catch (err) {
      console.error("Failed to load record activity history", err);
    } finally {
      setRecordHistoryLoading(false);
    }
  };

  // ─── Pagination Slice ─────────────────────────────────────────────────────
  const totalPages = Math.max(1, Math.ceil((viewMode === "active" ? items.length : historyEvents.length) / pageSize));
  const paginatedItems = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return items.slice(start, start + pageSize);
  }, [items, currentPage]);

  const paginatedHistory = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return historyEvents.slice(start, start + pageSize);
  }, [historyEvents, currentPage]);

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {toastMessage && (
        <div
          className={`fixed top-4 right-4 z-50 p-4 rounded-lg shadow-lg flex items-center gap-3 text-sm max-w-md animate-in fade-in slide-in-from-top-4 duration-200 ${
            toastMessage.type === "success"
              ? "bg-emerald-600 text-white"
              : "bg-red-600 text-white"
          }`}
        >
          {toastMessage.type === "success" ? (
            <CheckCircle2 className="h-5 w-5 flex-shrink-0" />
          ) : (
            <AlertCircle className="h-5 w-5 flex-shrink-0" />
          )}
          <span className="font-medium">{toastMessage.text}</span>
          <button
            onClick={() => setToastMessage(null)}
            className="ml-auto p-1 text-white/80 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Page Header */}
      <PageHeader
        title="Recycle Bin"
        description="Review, restore or permanently remove deleted workshop records."
        breadcrumbs={[
          { label: "System & Administration" },
          { label: "Recycle Bin" },
        ]}
        actions={
          <div className="flex items-center gap-1.5 bg-slate-100/90 dark:bg-slate-800/80 p-1.5 rounded-2xl border border-slate-200/90 dark:border-slate-700/80 shadow-2xs">
            <Button
              size="sm"
              variant={viewMode === "active" ? "default" : "ghost"}
              onClick={() => {
                setViewMode("active");
                setCurrentPage(1);
              }}
              className={`text-xs h-9 px-4 rounded-xl gap-2 font-semibold transition-all ${
                viewMode === "active"
                  ? "bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-white"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
              }`}
            >
              <Trash2 className="w-4 h-4 text-rose-500" />
              Deleted Records ({counts.totalDeleted})
            </Button>

            <Button
              size="sm"
              variant={viewMode === "history" ? "default" : "ghost"}
              onClick={() => {
                setViewMode("history");
                setCurrentPage(1);
              }}
              className={`text-xs h-9 px-4 rounded-xl gap-2 font-semibold transition-all ${
                viewMode === "history"
                  ? "bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-white"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
              }`}
            >
              <History className="w-4 h-4 text-indigo-500" />
              Audit History
            </Button>
          </div>
        }
      />

      {/* ─── SUMMARY COUNT METRIC CARDS ───────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        {/* Card 1: Total Deleted */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 p-4 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Total Deleted</span>
            <div className="w-8 h-8 rounded-xl bg-rose-50 dark:bg-rose-950/50 text-rose-600 flex items-center justify-center">
              <Trash2 className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-bold font-mono tracking-tight text-rose-600 dark:text-rose-400 tabular-nums mt-2">
            {counts.totalDeleted}
          </p>
        </div>

        {/* Card 2: Deleted Today */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 p-4 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Deleted Today</span>
            <div className="w-8 h-8 rounded-xl bg-amber-50 dark:bg-amber-950/50 text-amber-600 flex items-center justify-center">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-bold font-mono tracking-tight text-amber-600 dark:text-amber-400 tabular-nums mt-2">
            {counts.deletedToday}
          </p>
        </div>

        {/* Card 3: Customers */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 p-4 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Customers</span>
            <div className="w-8 h-8 rounded-xl bg-blue-50 dark:bg-blue-950/50 text-blue-600 flex items-center justify-center">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-bold font-mono tracking-tight text-blue-600 dark:text-blue-400 tabular-nums mt-2">
            {counts.customers}
          </p>
        </div>

        {/* Card 4: Job Cards */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 p-4 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Job Cards</span>
            <div className="w-8 h-8 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 flex items-center justify-center">
              <ClipboardList className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-bold font-mono tracking-tight text-indigo-600 dark:text-indigo-400 tabular-nums mt-2">
            {counts.jobCards}
          </p>
        </div>

        {/* Card 5: Spare Parts */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 p-4 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Spare Parts</span>
            <div className="w-8 h-8 rounded-xl bg-purple-50 dark:bg-purple-950/50 text-purple-600 flex items-center justify-center">
              <Package className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-bold font-mono tracking-tight text-purple-600 dark:text-purple-400 tabular-nums mt-2">
            {counts.spareParts}
          </p>
        </div>

        {/* Card 6: Other */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 p-4 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Other</span>
            <div className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 flex items-center justify-center">
              <Layers className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-bold font-mono tracking-tight text-slate-700 dark:text-slate-300 tabular-nums mt-2">
            {counts.other}
          </p>
        </div>
      </div>

      {/* ─── SEARCH & FILTER CONTROLS BAR ─────────────────────────────────── */}
      <div className="p-4 rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xs space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
          {/* Universal Search Bar */}
          <div className="md:col-span-6 relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              type="text"
              placeholder="Search Recycle Bin... (e.g. Customer, Phone, Vehicle, VIN, Job Card, Invoice, Part, Supplier...)"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="pl-9 text-xs h-10 rounded-xl border-slate-200 bg-white dark:bg-slate-900 focus-visible:ring-1 focus-visible:ring-blue-500"
            />
            {searchInput && (
              <button
                onClick={() => setSearchInput("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Date Filter */}
          <div className="md:col-span-3">
            <Select
              value={dateFilter}
              onValueChange={(val) => {
                setDateFilter(val as RecycleBinDateFilter);
                setCurrentPage(1);
              }}
            >
              <SelectTrigger className="text-xs h-10 rounded-xl border-slate-200 bg-white dark:bg-slate-900">
                <div className="flex items-center gap-2 truncate">
                  <Calendar className="w-4 h-4 text-slate-500" />
                  <span>
                    {dateFilter === "all" && "Date: All Time"}
                    {dateFilter === "today" && "Date: Today"}
                    {dateFilter === "yesterday" && "Date: Yesterday"}
                    {dateFilter === "last_7_days" && "Date: Last 7 Days"}
                    {dateFilter === "this_month" && "Date: This Month"}
                    {dateFilter === "last_month" && "Date: Last Month"}
                    {dateFilter === "this_year" && "Date: This Year"}
                    {dateFilter === "custom" && "Date: Custom Range"}
                  </span>
                </div>
              </SelectTrigger>
              <SelectContent className="rounded-xl border-slate-200">
                <SelectItem value="all">All Time</SelectItem>
                <SelectItem value="today">Today</SelectItem>
                <SelectItem value="yesterday">Yesterday</SelectItem>
                <SelectItem value="last_7_days">Last 7 Days</SelectItem>
                <SelectItem value="this_month">This Month</SelectItem>
                <SelectItem value="last_month">Last Month</SelectItem>
                <SelectItem value="this_year">This Year</SelectItem>
                <SelectItem value="custom">Custom Date Range...</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Sort By (Only for Active View) */}
          <div className="md:col-span-3">
            <Select
              value={sortBy}
              onValueChange={(val) => {
                setSortBy(val as RecycleBinSortOption);
                setCurrentPage(1);
              }}
            >
              <SelectTrigger className="text-xs h-10 rounded-xl border-slate-200 bg-white dark:bg-slate-900">
                <div className="flex items-center gap-2 truncate">
                  <ArrowUpDown className="w-4 h-4 text-slate-500" />
                  <span>
                    {sortBy === "newest" && "Sort: Newest First"}
                    {sortBy === "oldest" && "Sort: Oldest First"}
                    {sortBy === "name_asc" && "Sort: Name A–Z"}
                    {sortBy === "record_type" && "Sort: Record Type"}
                  </span>
                </div>
              </SelectTrigger>
              <SelectContent className="rounded-xl border-slate-200">
                <SelectItem value="newest">Newest Deleted First</SelectItem>
                <SelectItem value="oldest">Oldest First</SelectItem>
                <SelectItem value="name_asc">Name A–Z</SelectItem>
                <SelectItem value="record_type">Record Type</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Custom Date Range Pickers (shown when custom is selected) */}
        {dateFilter === "custom" && (
          <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
            <span className="text-muted-foreground font-semibold">Custom Range:</span>
            <div className="flex items-center gap-2">
              <Label className="text-[11px] font-medium text-slate-600 dark:text-slate-400">From:</Label>
              <Input
                type="date"
                value={customStartDate}
                onChange={(e) => {
                  setCustomStartDate(e.target.value);
                  setCurrentPage(1);
                }}
                className="h-9 text-xs w-36 rounded-xl border-slate-200"
              />
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-[11px] font-medium text-slate-600 dark:text-slate-400">To:</Label>
              <Input
                type="date"
                value={customEndDate}
                onChange={(e) => {
                  setCustomEndDate(e.target.value);
                  setCurrentPage(1);
                }}
                className="h-9 text-xs w-36 rounded-xl border-slate-200"
              />
            </div>
          </div>
        )}

        {/* Record Type Filters / Pills */}
        <div className="flex items-center gap-2 overflow-x-auto pt-1 pb-0.5 scrollbar-none">
          {MODULE_FILTERS.map((f) => {
            const Icon = f.icon;
            const isSelected = selectedModule === f.id;
            return (
              <Button
                key={f.id}
                size="sm"
                variant={isSelected ? "default" : "outline"}
                onClick={() => {
                  setSelectedModule(f.id);
                  setCurrentPage(1);
                }}
                className={`text-xs h-8.5 px-3.5 rounded-xl flex-shrink-0 gap-1.5 font-semibold transition-all ${
                  isSelected
                    ? "bg-blue-600 text-white shadow-2xs hover:bg-blue-700"
                    : "bg-white dark:bg-slate-900 border-slate-200 text-slate-600 dark:text-slate-400 hover:text-slate-900 hover:bg-slate-50"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{f.label}</span>
              </Button>
            );
          })}
        </div>
      </div>

      {/* ─── TAB 1: ACTIVE DELETED RECORDS TABLE ───────────────────────────── */}
      {viewMode === "active" && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-2xs overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50/80 hover:bg-slate-50/80 dark:bg-slate-800/60 dark:hover:bg-slate-800/60 border-b border-slate-200/80 h-11 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  <TableHead className="w-[40px] pl-4">
                    <Checkbox
                      checked={
                        paginatedItems.length > 0 && selectedItemKeys.length === paginatedItems.length
                          ? true
                          : selectedItemKeys.length > 0
                          ? "indeterminate"
                          : false
                      }
                      onCheckedChange={handleSelectAll}
                      aria-label="Select all visible records"
                    />
                  </TableHead>
                  <TableHead className="text-[11px] font-bold text-slate-500 uppercase tracking-wider w-[130px]">Deleted Date</TableHead>
                  <TableHead className="text-[11px] font-bold text-slate-500 uppercase tracking-wider w-[120px]">Record Type</TableHead>
                  <TableHead className="text-[11px] font-bold text-slate-500 uppercase tracking-wider min-w-[180px]">Record / Name</TableHead>
                  <TableHead className="text-[11px] font-bold text-slate-500 uppercase tracking-wider min-w-[150px]">Reference</TableHead>
                  <TableHead className="text-[11px] font-bold text-slate-500 uppercase tracking-wider w-[140px]">Deleted From</TableHead>
                  <TableHead className="text-[11px] font-bold text-slate-500 uppercase tracking-wider w-[120px]">Deleted By</TableHead>
                  <TableHead className="text-[11px] font-bold text-slate-500 uppercase tracking-wider w-[90px]">Status</TableHead>
                  <TableHead className="text-[11px] font-bold text-slate-500 uppercase tracking-wider text-right w-[140px] pr-4">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-16 text-xs text-muted-foreground">
                      <Loader2 className="w-6 h-6 mx-auto animate-spin text-blue-600 mb-2" />
                      Loading deleted records...
                    </TableCell>
                  </TableRow>
                ) : paginatedItems.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-16 text-xs text-muted-foreground">
                      <div className="h-12 w-12 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto mb-3">
                        <Trash2 className="w-6 h-6 text-slate-400" />
                      </div>
                      <p className="font-semibold text-slate-700 dark:text-slate-300">No deleted record found.</p>
                      <p className="text-[11px] text-slate-400 mt-1 max-w-sm mx-auto">
                        {debouncedQuery
                          ? "Try modifying your search keywords or clearing filters."
                          : "Any records soft-deleted from workshop modules will appear here."}
                      </p>
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedItems.map((item) => (
                    <TableRow
                      key={`${item.type}-${item.id}`}
                      className={`h-12 hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors border-b border-slate-100 dark:border-slate-800/80 ${
                        selectedItemKeys.includes(`${item.type}:${item.id}`) ? "bg-blue-50/40 dark:bg-blue-950/20" : ""
                      }`}
                    >
                      {/* Checkbox */}
                      <TableCell className="pl-4">
                        <Checkbox
                          checked={selectedItemKeys.includes(`${item.type}:${item.id}`)}
                          onCheckedChange={() => handleToggleSelectItem(`${item.type}:${item.id}`)}
                          aria-label={`Select ${item.nameOrNumber}`}
                        />
                      </TableCell>
                      {/* Deleted Date */}
                      <TableCell className="text-xs font-mono text-muted-foreground tabular-nums">
                        {formatDate(item.deleted_at)}
                      </TableCell>

                      {/* Record Type */}
                      <TableCell>
                        <Badge variant="outline" className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-lg bg-slate-50 dark:bg-slate-800 border-slate-200">
                          {item.type.replace("_", " ")}
                        </Badge>
                      </TableCell>

                      {/* Record / Name */}
                      <TableCell className="text-xs font-bold text-slate-900 dark:text-slate-100">
                        {item.nameOrNumber}
                      </TableCell>

                      {/* Reference */}
                      <TableCell className="text-xs font-mono text-slate-600 dark:text-slate-400">
                        {item.reference || "—"}
                      </TableCell>

                      {/* Deleted From */}
                      <TableCell className="text-xs">
                        <span className="inline-flex items-center gap-1.5 font-medium text-slate-700 dark:text-slate-300">
                          <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                          {item.source_module}
                        </span>
                      </TableCell>

                      {/* Deleted By */}
                      <TableCell className="text-xs font-medium text-slate-600 dark:text-slate-400 truncate max-w-[120px]">
                        {item.deleted_by || "Admin"}
                      </TableCell>

                      {/* Status */}
                      <TableCell>
                        <Badge variant="outline" className="text-[10px] font-semibold rounded-lg border-rose-300 text-rose-700 bg-rose-50 dark:bg-rose-950/40">
                          Deleted
                        </Badge>
                      </TableCell>

                      {/* Actions */}
                      <TableCell className="text-right pr-4">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* View Details */}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openDetailsModal(item)}
                            className="h-8 w-8 p-0 rounded-xl text-slate-500 hover:text-blue-600 hover:bg-slate-100 transition-colors"
                            title="View Record Details"
                          >
                            <Eye className="w-4 h-4" />
                          </Button>

                          {/* Restore */}
                          {canRestore && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => openRestoreModal(item)}
                              className="h-8 px-3 text-xs rounded-xl border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800/60 dark:text-emerald-400 gap-1.5 font-semibold transition-colors"
                              title="Restore to active module"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                              Restore
                            </Button>
                          )}

                          {/* Permanent Delete */}
                          {canManage && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openPermanentModal(item)}
                              className="h-8 w-8 p-0 rounded-xl text-rose-500 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
                              title="Permanently Delete (Owner/Admin Only)"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination Controls */}
          {items.length > 0 && (
            <div className="p-3.5 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 flex items-center justify-between text-xs text-muted-foreground">
              <span>
                Showing {(currentPage - 1) * pageSize + 1}–
                {Math.min(currentPage * pageSize, items.length)} of {items.length} records
              </span>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  className="h-8 text-xs px-3 rounded-xl border-slate-200 hover:bg-slate-100"
                >
                  <ChevronLeft className="w-3.5 h-3.5 mr-1" /> Previous
                </Button>
                <span className="font-semibold text-slate-700 dark:text-slate-300">
                  Page {currentPage} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  className="h-8 text-xs px-3 rounded-xl border-slate-200 hover:bg-slate-100"
                >
                  Next <ChevronRight className="w-3.5 h-3.5 ml-1" />
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── TAB 2: AUDIT HISTORY TABLE ───────────────────────────────────── */}
      {viewMode === "history" && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-2xs overflow-hidden">
          <div className="p-4 border-b border-slate-200/80 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/60 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold flex items-center gap-2 text-slate-900 dark:text-slate-100">
                <History className="w-4 h-4 text-blue-600" />
                Recycle Bin Event Audit History
              </h3>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Permanent chronological record of every deletion, restoration, and blocked action. Preserved even after restoration.
              </p>
            </div>
            <span className="text-xs text-muted-foreground">
              Total Logged Events: <strong className="font-mono text-slate-800 dark:text-slate-200 font-bold">{historyEvents.length}</strong>
            </span>
          </div>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50/80 hover:bg-slate-50/80 dark:bg-slate-800/60 dark:hover:bg-slate-800/60 border-b border-slate-200/80 h-11 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  <TableHead className="text-[11px] font-bold text-slate-500 uppercase tracking-wider w-[140px] pl-4">Event Date</TableHead>
                  <TableHead className="text-[11px] font-bold text-slate-500 uppercase tracking-wider w-[120px]">Record Type</TableHead>
                  <TableHead className="text-[11px] font-bold text-slate-500 uppercase tracking-wider min-w-[180px]">Record Name / Ref</TableHead>
                  <TableHead className="text-[11px] font-bold text-slate-500 uppercase tracking-wider w-[130px]">Action</TableHead>
                  <TableHead className="text-[11px] font-bold text-slate-500 uppercase tracking-wider w-[130px]">Performed By</TableHead>
                  <TableHead className="text-[11px] font-bold text-slate-500 uppercase tracking-wider w-[130px]">Source Module</TableHead>
                  <TableHead className="text-[11px] font-bold text-slate-500 uppercase tracking-wider min-w-[200px] pr-4">Details / Reason</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-16 text-xs text-muted-foreground">
                      <Loader2 className="w-6 h-6 mx-auto animate-spin text-blue-600 mb-2" />
                      Loading audit history...
                    </TableCell>
                  </TableRow>
                ) : paginatedHistory.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-16 text-xs text-muted-foreground">
                      <div className="h-12 w-12 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto mb-3">
                        <History className="w-6 h-6 text-slate-400" />
                      </div>
                      <p className="font-semibold text-slate-700 dark:text-slate-300">No audit history events found.</p>
                      <p className="text-[11px] text-slate-400 mt-1 max-w-sm mx-auto">
                        Deletion and restoration events will be logged here permanently.
                      </p>
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedHistory.map((ev) => (
                    <TableRow key={ev.id} className="h-12 hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors border-b border-slate-100 dark:border-slate-800/80">
                      <TableCell className="text-xs font-mono text-muted-foreground tabular-nums pl-4">
                        {formatDate(ev.performed_at)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-lg bg-slate-50 dark:bg-slate-800 border-slate-200">
                          {ev.record_type.replace("_", " ")}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                        {ev.record_name}
                        {ev.record_reference && (
                          <span className="block font-mono text-[10px] text-muted-foreground font-normal">
                            Ref: {ev.record_reference}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        {ev.action === "DELETED" && (
                          <Badge variant="outline" className="text-[10px] font-semibold rounded-lg border-amber-300 text-amber-700 bg-amber-50 dark:bg-amber-950/40">
                            Deleted
                          </Badge>
                        )}
                        {ev.action === "RESTORED" && (
                          <Badge variant="outline" className="text-[10px] font-semibold rounded-lg border-emerald-300 text-emerald-700 bg-emerald-50 dark:bg-emerald-950/40">
                            Restored
                          </Badge>
                        )}
                        {ev.action === "PERMANENTLY_DELETED" && (
                          <Badge variant="outline" className="text-[10px] font-semibold rounded-lg border-slate-300 text-slate-700 bg-slate-100 dark:bg-slate-800">
                            Permanently Deleted
                          </Badge>
                        )}
                        {ev.action === "DELETE_BLOCKED" && (
                          <Badge variant="outline" className="text-[10px] font-semibold rounded-lg border-rose-300 text-rose-700 bg-rose-50 dark:bg-rose-950/40">
                            Delete Blocked
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-xs font-medium text-slate-700 dark:text-slate-300">
                        {ev.performed_by}
                      </TableCell>
                      <TableCell className="text-xs text-slate-600 dark:text-slate-400">
                        {ev.source_module}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground pr-4">
                        {ev.reason || (ev.action === "RESTORED" ? "Restored back to active records" : "Soft-deleted by user")}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination Controls */}
          {historyEvents.length > 0 && (
            <div className="p-3.5 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 flex items-center justify-between text-xs text-muted-foreground">
              <span>
                Showing {(currentPage - 1) * pageSize + 1}–
                {Math.min(currentPage * pageSize, historyEvents.length)} of {historyEvents.length} events
              </span>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  className="h-8 text-xs px-3 rounded-xl border-slate-200 hover:bg-slate-100"
                >
                  <ChevronLeft className="w-3.5 h-3.5 mr-1" /> Previous
                </Button>
                <span className="font-semibold text-slate-700 dark:text-slate-300">
                  Page {currentPage} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  className="h-8 text-xs px-3 rounded-xl border-slate-200 hover:bg-slate-100"
                >
                  Next <ChevronRight className="w-3.5 h-3.5 ml-1" />
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── MODAL: VIEW DETAILS WITH EMBEDDED ACTIVITY TIMELINE ─────────── */}
      <Dialog open={detailsDialogOpen} onOpenChange={setDetailsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto rounded-2xl border border-slate-200/90 shadow-xl p-6">
          {selectedDetailItem && (
            <div className="space-y-4">
              <div className="border-b border-slate-100 pb-3 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="uppercase text-[10px] font-mono px-2 py-0.5 rounded-lg">
                      {selectedDetailItem.type.replace("_", " ")}
                    </Badge>
                    <DialogTitle className="text-lg font-bold text-slate-900 dark:text-slate-100">
                      {selectedDetailItem.nameOrNumber}
                    </DialogTitle>
                  </div>
                  <DialogDescription className="text-xs mt-1 text-slate-500">
                    Deleted from <strong>{selectedDetailItem.source_module}</strong> on{" "}
                    {formatDate(selectedDetailItem.deleted_at)} by {selectedDetailItem.deleted_by || "Admin"}
                  </DialogDescription>
                </div>
              </div>

              {/* Key Attributes Grid */}
              <div className="grid grid-cols-2 gap-3 p-4 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-100 dark:border-slate-800 text-xs">
                <div>
                  <span className="text-[10px] text-muted-foreground uppercase font-semibold block">Reference</span>
                  <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                    {selectedDetailItem.reference || "None"}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-muted-foreground uppercase font-semibold block">Deleted From Module</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    {selectedDetailItem.source_module}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-muted-foreground uppercase font-semibold block">Deleted Timestamp</span>
                  <span className="font-mono text-slate-600 dark:text-slate-400">
                    {selectedDetailItem.deleted_at}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-muted-foreground uppercase font-semibold block">Deleted By User</span>
                  <span className="font-medium text-slate-800 dark:text-slate-200">
                    {selectedDetailItem.deleted_by || "Admin"}
                  </span>
                </div>
                <div className="col-span-2 border-t border-slate-200/80 pt-2 mt-1">
                  <span className="text-[10px] text-muted-foreground uppercase font-semibold block">Record Summary</span>
                  <p className="text-xs text-slate-700 dark:text-slate-300 mt-0.5">
                    {selectedDetailItem.details}
                  </p>
                </div>
              </div>

              {/* Activity History Timeline */}
              <div className="space-y-2 border-t border-slate-100 pt-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <History className="w-3.5 h-3.5 text-indigo-500" />
                  Activity History For This Record
                </h4>

                {recordHistoryLoading ? (
                  <div className="py-6 text-center text-xs text-muted-foreground">
                    <Loader2 className="w-4 h-4 animate-spin mx-auto text-indigo-600 mb-1" />
                    Loading event history...
                  </div>
                ) : recordHistory.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic py-2">
                    No previous events logged for this record.
                  </p>
                ) : (
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                    {recordHistory.map((ev) => (
                      <div
                        key={ev.id}
                        className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 text-xs flex items-center justify-between"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-slate-900 dark:text-slate-100">
                              {ev.action === "DELETED" && "Soft-Deleted"}
                              {ev.action === "RESTORED" && "Restored to Active"}
                              {ev.action === "DELETE_BLOCKED" && "Permanent Delete Blocked"}
                              {ev.action === "PERMANENTLY_DELETED" && "Permanently Purged"}
                            </span>
                            <span className="text-[10px] text-muted-foreground font-mono">
                              by {ev.performed_by}
                            </span>
                          </div>
                          {ev.reason && (
                            <p className="text-[11px] text-rose-600 dark:text-rose-400 mt-0.5">
                              {ev.reason}
                            </p>
                          )}
                        </div>
                        <span className="font-mono text-[10px] text-muted-foreground">
                          {formatDate(ev.performed_at)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <DialogFooter className="pt-3 border-t border-slate-100 flex flex-row items-center justify-between">
                <div>
                  {canManage && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        openPermanentModal(selectedDetailItem);
                      }}
                      className="text-xs h-10 px-3.5 rounded-xl text-rose-600 hover:bg-rose-50 hover:text-rose-700 gap-1.5 font-semibold"
                    >
                      <Trash2 className="w-4 h-4" />
                      Permanent Delete
                    </Button>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => setDetailsDialogOpen(false)} className="h-10 px-4 rounded-xl border-slate-200 font-semibold">
                    Close
                  </Button>
                  {canRestore && (
                    <Button
                      size="sm"
                      onClick={() => {
                        openRestoreModal(selectedDetailItem);
                      }}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 text-xs h-10 px-4 rounded-xl font-semibold shadow-2xs"
                    >
                      <RotateCcw className="w-4 h-4" />
                      Restore Record
                    </Button>
                  )}
                </div>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ─── MODAL: CONFIRM RESTORE ────────────────────────────────────────── */}
      <Dialog open={restoreDialogOpen} onOpenChange={setRestoreDialogOpen}>
        <DialogContent className="max-w-md rounded-2xl border border-slate-200/90 shadow-xl p-6">
          {itemToRestore && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-950 flex items-center justify-center text-emerald-600">
                  <RotateCcw className="w-5 h-5" />
                </div>
                <div>
                  <DialogTitle className="text-base font-bold text-slate-900 dark:text-slate-100">Restore Deleted Record</DialogTitle>
                  <DialogDescription className="text-xs text-slate-500 mt-0.5">
                    Return this record to its active section
                  </DialogDescription>
                </div>
              </div>

              <div className="p-4 bg-emerald-50 dark:bg-emerald-950/30 rounded-xl border border-emerald-200 dark:border-emerald-900 text-xs space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Record:</span>
                  <span className="font-bold text-slate-900 dark:text-slate-100">{itemToRestore.nameOrNumber}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Destination:</span>
                  <span className="font-semibold text-emerald-700 dark:text-emerald-400">{itemToRestore.source_module}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Original Reference:</span>
                  <span className="font-mono">{itemToRestore.reference || "None"}</span>
                </div>
              </div>

              <p className="text-xs text-muted-foreground leading-relaxed">
                All historical links and associations (such as customer vehicle links or job card line items) will be restored intact.
              </p>

              <DialogFooter className="pt-2">
                <Button variant="outline" size="sm" onClick={() => setRestoreDialogOpen(false)} className="h-10 px-4 rounded-xl border-slate-200 font-semibold">
                  Cancel
                </Button>
                <Button
                  size="sm"
                  disabled={actionLoading}
                  onClick={handleConfirmRestore}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 h-10 px-4 rounded-xl font-semibold shadow-2xs"
                >
                  {actionLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                  Confirm &amp; Restore
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ─── MODAL: PERMANENT DELETE CONFIRMATION ──────────────────────────── */}
      <Dialog open={permanentDialogOpen} onOpenChange={setPermanentDialogOpen}>
        <DialogContent className="max-w-md rounded-2xl border border-slate-200/90 shadow-xl p-6">
          {itemToPurge && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-rose-100 dark:bg-rose-950 flex items-center justify-center text-rose-600">
                  <Trash2 className="w-5 h-5" />
                </div>
                <div>
                  <DialogTitle className="text-base font-bold text-rose-600">
                    Permanently Delete Record
                  </DialogTitle>
                  <DialogDescription className="text-xs font-semibold text-rose-500 mt-0.5">
                    This action cannot be undone.
                  </DialogDescription>
                </div>
              </div>

              {/* Financial History Block Warning */}
              {financialBlockMessage ? (
                <div className="p-4 bg-rose-50 dark:bg-rose-950/40 rounded-xl border border-rose-300 dark:border-rose-900 text-xs space-y-2">
                  <div className="flex items-start gap-2.5">
                    <ShieldAlert className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold text-rose-800 dark:text-rose-200">
                        Deletion Blocked: Financial Integrity Protection
                      </p>
                      <p className="text-rose-700 dark:text-rose-300 mt-1">
                        {financialBlockMessage}
                      </p>
                    </div>
                  </div>
                  <p className="text-[11px] text-muted-foreground border-t border-rose-200 dark:border-rose-800 pt-2">
                    Records linked to tax invoices, ledger entries, or posted financial transactions cannot be erased to preserve UAE audit trail compliance.
                  </p>
                </div>
              ) : (
                <div className="p-4 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200 text-xs space-y-1.5">
                  <p className="text-muted-foreground">You are about to permanently purge:</p>
                  <p className="font-bold text-sm text-slate-900 dark:text-slate-100">{itemToPurge.nameOrNumber}</p>
                  <p className="text-[11px] text-muted-foreground">
                    Module: {itemToPurge.source_module} &bull; Ref: {itemToPurge.reference}
                  </p>
                </div>
              )}

              <DialogFooter className="pt-2">
                <Button variant="outline" size="sm" onClick={() => setPermanentDialogOpen(false)} className="h-10 px-4 rounded-xl border-slate-200 font-semibold">
                  Cancel
                </Button>
                <Button
                  size="sm"
                  disabled={Boolean(financialBlockMessage) || actionLoading}
                  onClick={handleConfirmPurge}
                  className="bg-rose-600 hover:bg-rose-700 text-white gap-1.5 h-10 px-4 rounded-xl font-semibold shadow-2xs"
                >
                  {actionLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                  Permanently Delete
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Floating Bulk Action Bar for Recycle Bin */}
      {viewMode === "active" && (
        <>
          <BulkActionBar
            selectedCount={selectedItemKeys.length}
            onClearSelection={() => setSelectedItemKeys([])}
            onDeleteSelected={canManage ? handleRequestBulkPurge : undefined}
            deleteLabel="Delete Permanently"
            isDeleting={bulkActionLoading}
            customActions={
              canRestore
                ? [
                    {
                      label: "Restore Selected",
                      icon: <RotateCcw className="h-3.5 w-3.5 text-emerald-600" />,
                      onClick: handleBulkRestore,
                      variant: "outline",
                      className: "text-emerald-700 hover:bg-emerald-50 border-emerald-300 font-bold",
                    },
                  ]
                : undefined
            }
          />

          <RecordDeleteDialog
            open={bulkPurgeDialogOpen}
            onOpenChange={setBulkPurgeDialogOpen}
            recordType="Recycle Bin Item"
            recordTypePlural="Recycle Bin Items"
            recordCount={selectedItemKeys.length}
            isFinancialBlocked={Boolean(bulkBlockedMessage)}
            financialBlockMessage={bulkBlockedMessage || undefined}
            onConfirmDelete={handleConfirmBulkPurge}
            isDeleting={bulkActionLoading}
          />
        </>
      )}
    </div>
  );
}

export default RecycleBinView;
