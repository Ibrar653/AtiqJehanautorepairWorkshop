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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
            <span>System & Administration</span>
            <span>/</span>
            <span className="text-foreground font-medium">Recycle Bin</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Trash2 className="w-6 h-6 text-rose-600" />
            Recycle Bin &amp; Audit Log
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Safely restore soft-deleted records, inspect deletion sources, and monitor irreversible audit history
          </p>
        </div>

        {/* View Mode Toggle: Active vs History */}
        <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg border">
          <Button
            size="sm"
            variant={viewMode === "active" ? "default" : "ghost"}
            onClick={() => {
              setViewMode("active");
              setCurrentPage(1);
            }}
            className={`text-xs h-8 gap-1.5 ${
              viewMode === "active" ? "bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white" : ""
            }`}
          >
            <Trash2 className="w-3.5 h-3.5 text-rose-500" />
            Deleted Records ({counts.totalDeleted})
          </Button>

          <Button
            size="sm"
            variant={viewMode === "history" ? "default" : "ghost"}
            onClick={() => {
              setViewMode("history");
              setCurrentPage(1);
            }}
            className={`text-xs h-8 gap-1.5 ${
              viewMode === "history" ? "bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white" : ""
            }`}
          >
            <History className="w-3.5 h-3.5 text-indigo-500" />
            Audit History
          </Button>
        </div>
      </div>

      {/* ─── SUMMARY COUNT METRIC CARDS ───────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <Card className="border-l-4 border-l-rose-500 shadow-sm bg-white dark:bg-slate-900">
          <CardContent className="p-3">
            <p className="text-[11px] text-muted-foreground uppercase font-semibold flex items-center justify-between">
              <span>Total Deleted</span>
              <Trash2 className="w-3.5 h-3.5 text-rose-500" />
            </p>
            <p className="text-xl font-bold font-mono text-rose-700 dark:text-rose-400 mt-1">
              {counts.totalDeleted}
            </p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-amber-500 shadow-sm bg-white dark:bg-slate-900">
          <CardContent className="p-3">
            <p className="text-[11px] text-muted-foreground uppercase font-semibold flex items-center justify-between">
              <span>Deleted Today</span>
              <Clock className="w-3.5 h-3.5 text-amber-500" />
            </p>
            <p className="text-xl font-bold font-mono text-amber-700 dark:text-amber-400 mt-1">
              {counts.deletedToday}
            </p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-blue-500 shadow-sm bg-white dark:bg-slate-900">
          <CardContent className="p-3">
            <p className="text-[11px] text-muted-foreground uppercase font-semibold flex items-center justify-between">
              <span>Customers</span>
              <Users className="w-3.5 h-3.5 text-blue-500" />
            </p>
            <p className="text-xl font-bold font-mono text-blue-700 dark:text-blue-400 mt-1">
              {counts.customers}
            </p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-indigo-500 shadow-sm bg-white dark:bg-slate-900">
          <CardContent className="p-3">
            <p className="text-[11px] text-muted-foreground uppercase font-semibold flex items-center justify-between">
              <span>Job Cards</span>
              <ClipboardList className="w-3.5 h-3.5 text-indigo-500" />
            </p>
            <p className="text-xl font-bold font-mono text-indigo-700 dark:text-indigo-400 mt-1">
              {counts.jobCards}
            </p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-purple-500 shadow-sm bg-white dark:bg-slate-900">
          <CardContent className="p-3">
            <p className="text-[11px] text-muted-foreground uppercase font-semibold flex items-center justify-between">
              <span>Spare Parts</span>
              <Package className="w-3.5 h-3.5 text-purple-500" />
            </p>
            <p className="text-xl font-bold font-mono text-purple-700 dark:text-purple-400 mt-1">
              {counts.spareParts}
            </p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-slate-400 shadow-sm bg-white dark:bg-slate-900">
          <CardContent className="p-3">
            <p className="text-[11px] text-muted-foreground uppercase font-semibold flex items-center justify-between">
              <span>Other</span>
              <Layers className="w-3.5 h-3.5 text-slate-500" />
            </p>
            <p className="text-xl font-bold font-mono text-slate-700 dark:text-slate-300 mt-1">
              {counts.other}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* ─── SEARCH & FILTER CONTROLS BAR ─────────────────────────────────── */}
      <Card className="p-3.5 shadow-sm space-y-3 bg-white dark:bg-slate-900 border">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
          {/* Universal Search Bar */}
          <div className="md:col-span-6 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              type="text"
              placeholder="Search Recycle Bin... (e.g. Customer, Phone, Vehicle, VIN, Job Card, Invoice, Part, Supplier...)"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="pl-9 text-xs h-9"
            />
            {searchInput && (
              <button
                onClick={() => setSearchInput("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
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
              <SelectTrigger className="text-xs h-9">
                <div className="flex items-center gap-1.5 truncate">
                  <Calendar className="w-3.5 h-3.5 text-slate-500" />
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
              <SelectContent>
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
              <SelectTrigger className="text-xs h-9">
                <div className="flex items-center gap-1.5 truncate">
                  <ArrowUpDown className="w-3.5 h-3.5 text-slate-500" />
                  <span>
                    {sortBy === "newest" && "Sort: Newest First"}
                    {sortBy === "oldest" && "Sort: Oldest First"}
                    {sortBy === "name_asc" && "Sort: Name A–Z"}
                    {sortBy === "record_type" && "Sort: Record Type"}
                  </span>
                </div>
              </SelectTrigger>
              <SelectContent>
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
          <div className="flex flex-wrap items-center gap-3 pt-2 border-t text-xs">
            <span className="text-muted-foreground font-semibold">Custom Range:</span>
            <div className="flex items-center gap-2">
              <Label className="text-[11px]">From:</Label>
              <Input
                type="date"
                value={customStartDate}
                onChange={(e) => {
                  setCustomStartDate(e.target.value);
                  setCurrentPage(1);
                }}
                className="h-8 text-xs w-36"
              />
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-[11px]">To:</Label>
              <Input
                type="date"
                value={customEndDate}
                onChange={(e) => {
                  setCustomEndDate(e.target.value);
                  setCurrentPage(1);
                }}
                className="h-8 text-xs w-36"
              />
            </div>
          </div>
        )}

        {/* Record Type Filters / Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pt-1 pb-0.5 scrollbar-none">
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
                className={`text-xs h-7 px-2.5 rounded-full flex-shrink-0 gap-1 ${
                  isSelected
                    ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <Icon className="w-3 h-3" />
                <span>{f.label}</span>
              </Button>
            );
          })}
        </div>
      </Card>

      {/* ─── TAB 1: ACTIVE DELETED RECORDS TABLE ───────────────────────────── */}
      {viewMode === "active" && (
        <Card className="shadow-sm overflow-hidden border">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50 dark:bg-slate-800/80">
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
                  <TableHead className="text-xs font-semibold w-[130px]">Deleted Date</TableHead>
                  <TableHead className="text-xs font-semibold w-[120px]">Record Type</TableHead>
                  <TableHead className="text-xs font-semibold min-w-[180px]">Record / Name</TableHead>
                  <TableHead className="text-xs font-semibold min-w-[150px]">Reference</TableHead>
                  <TableHead className="text-xs font-semibold w-[140px]">Deleted From</TableHead>
                  <TableHead className="text-xs font-semibold w-[120px]">Deleted By</TableHead>
                  <TableHead className="text-xs font-semibold w-[90px]">Status</TableHead>
                  <TableHead className="text-xs font-semibold text-right w-[150px]">Actions</TableHead>
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
                      <Trash2 className="w-10 h-10 mx-auto text-slate-300 mb-2" />
                      <p className="font-semibold text-slate-700 dark:text-slate-300">No deleted record found.</p>
                      <p className="text-[11px] text-slate-400 mt-0.5">
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
                      className={`hover:bg-slate-50/70 dark:hover:bg-slate-800/50 ${
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
                      <TableCell className="text-xs font-mono text-muted-foreground">
                        {formatDate(item.deleted_at)}
                      </TableCell>

                      {/* Record Type */}
                      <TableCell>
                        <Badge variant="outline" className="text-[10px] uppercase font-mono px-1.5 py-0">
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
                        <span className="inline-flex items-center gap-1 font-medium text-slate-700 dark:text-slate-300">
                          <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                          {item.source_module}
                        </span>
                      </TableCell>

                      {/* Deleted By */}
                      <TableCell className="text-xs font-medium text-slate-600 dark:text-slate-400 truncate max-w-[120px]">
                        {item.deleted_by || "Admin"}
                      </TableCell>

                      {/* Status */}
                      <TableCell>
                        <Badge variant="outline" className="text-[10px] border-rose-300 text-rose-700 bg-rose-50 dark:bg-rose-950/40">
                          Deleted
                        </Badge>
                      </TableCell>

                      {/* Actions */}
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {/* View Details */}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openDetailsModal(item)}
                            className="h-7 w-7 p-0 text-slate-500 hover:text-blue-600"
                            title="View Record Details"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </Button>

                          {/* Restore */}
                          {canRestore && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => openRestoreModal(item)}
                              className="h-7 px-2 text-xs border-emerald-300 text-emerald-700 hover:bg-emerald-50 gap-1"
                              title="Restore to active module"
                            >
                              <RotateCcw className="w-3 h-3" />
                              Restore
                            </Button>
                          )}

                          {/* Permanent Delete */}
                          {canManage && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openPermanentModal(item)}
                              className="h-7 w-7 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                              title="Permanently Delete (Owner/Admin Only)"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
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
            <div className="p-3 border-t bg-slate-50/50 dark:bg-slate-800/40 flex items-center justify-between text-xs text-muted-foreground">
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
                  className="h-7 text-xs px-2"
                >
                  <ChevronLeft className="w-3.5 h-3.5 mr-1" /> Previous
                </Button>
                <span>
                  Page {currentPage} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  className="h-7 text-xs px-2"
                >
                  Next <ChevronRight className="w-3.5 h-3.5 ml-1" />
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* ─── TAB 2: AUDIT HISTORY TABLE ───────────────────────────────────── */}
      {viewMode === "history" && (
        <Card className="shadow-sm overflow-hidden border">
          <div className="p-3.5 border-b bg-slate-50/70 dark:bg-slate-800/50 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold flex items-center gap-2 text-slate-900 dark:text-slate-100">
                <History className="w-4 h-4 text-indigo-600" />
                Recycle Bin Event Audit History
              </h3>
              <p className="text-[11px] text-muted-foreground">
                Permanent chronological record of every deletion, restoration, and blocked action. Preserved even after restoration.
              </p>
            </div>
            <span className="text-xs text-muted-foreground">
              Total Logged Events: <strong>{historyEvents.length}</strong>
            </span>
          </div>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50 dark:bg-slate-800/80">
                  <TableHead className="text-xs font-semibold w-[140px]">Event Date</TableHead>
                  <TableHead className="text-xs font-semibold w-[120px]">Record Type</TableHead>
                  <TableHead className="text-xs font-semibold min-w-[180px]">Record Name / Ref</TableHead>
                  <TableHead className="text-xs font-semibold w-[130px]">Action</TableHead>
                  <TableHead className="text-xs font-semibold w-[130px]">Performed By</TableHead>
                  <TableHead className="text-xs font-semibold w-[130px]">Source Module</TableHead>
                  <TableHead className="text-xs font-semibold min-w-[200px]">Details / Reason</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-16 text-xs text-muted-foreground">
                      <Loader2 className="w-6 h-6 mx-auto animate-spin text-indigo-600 mb-2" />
                      Loading audit history...
                    </TableCell>
                  </TableRow>
                ) : paginatedHistory.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-16 text-xs text-muted-foreground">
                      <History className="w-10 h-10 mx-auto text-slate-300 mb-2" />
                      <p className="font-semibold text-slate-700 dark:text-slate-300">No audit history events found.</p>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Deletion and restoration events will be logged here permanently.
                      </p>
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedHistory.map((ev) => (
                    <TableRow key={ev.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/50">
                      <TableCell className="text-xs font-mono text-muted-foreground">
                        {formatDate(ev.performed_at)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px] uppercase font-mono px-1.5 py-0">
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
                          <Badge variant="outline" className="text-[10px] border-amber-300 text-amber-700 bg-amber-50 dark:bg-amber-950/40">
                            Deleted
                          </Badge>
                        )}
                        {ev.action === "RESTORED" && (
                          <Badge variant="outline" className="text-[10px] border-emerald-300 text-emerald-700 bg-emerald-50 dark:bg-emerald-950/40">
                            Restored
                          </Badge>
                        )}
                        {ev.action === "PERMANENTLY_DELETED" && (
                          <Badge variant="outline" className="text-[10px] border-slate-300 text-slate-700 bg-slate-100 dark:bg-slate-800">
                            Permanently Deleted
                          </Badge>
                        )}
                        {ev.action === "DELETE_BLOCKED" && (
                          <Badge variant="outline" className="text-[10px] border-rose-300 text-rose-700 bg-rose-50 dark:bg-rose-950/40">
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
                      <TableCell className="text-xs text-muted-foreground">
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
            <div className="p-3 border-t bg-slate-50/50 dark:bg-slate-800/40 flex items-center justify-between text-xs text-muted-foreground">
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
                  className="h-7 text-xs px-2"
                >
                  <ChevronLeft className="w-3.5 h-3.5 mr-1" /> Previous
                </Button>
                <span>
                  Page {currentPage} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  className="h-7 text-xs px-2"
                >
                  Next <ChevronRight className="w-3.5 h-3.5 ml-1" />
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* ─── MODAL: VIEW DETAILS WITH EMBEDDED ACTIVITY TIMELINE ─────────── */}
      <Dialog open={detailsDialogOpen} onOpenChange={setDetailsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          {selectedDetailItem && (
            <div className="space-y-4">
              <div className="border-b pb-3 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="uppercase text-[10px] font-mono">
                      {selectedDetailItem.type.replace("_", " ")}
                    </Badge>
                    <DialogTitle className="text-lg font-bold text-slate-900 dark:text-slate-100">
                      {selectedDetailItem.nameOrNumber}
                    </DialogTitle>
                  </div>
                  <DialogDescription className="text-xs mt-1">
                    Deleted from <strong>{selectedDetailItem.source_module}</strong> on{" "}
                    {formatDate(selectedDetailItem.deleted_at)} by {selectedDetailItem.deleted_by || "Admin"}
                  </DialogDescription>
                </div>
              </div>

              {/* Key Attributes Grid */}
              <div className="grid grid-cols-2 gap-3 p-3 bg-slate-50 dark:bg-slate-800/60 rounded-lg text-xs">
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
                <div className="col-span-2 border-t pt-2 mt-1">
                  <span className="text-[10px] text-muted-foreground uppercase font-semibold block">Record Summary</span>
                  <p className="text-xs text-slate-700 dark:text-slate-300 mt-0.5">
                    {selectedDetailItem.details}
                  </p>
                </div>
              </div>

              {/* Activity History Timeline */}
              <div className="space-y-2 border-t pt-3">
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
                        className="p-2.5 rounded bg-slate-50 dark:bg-slate-800/40 border text-xs flex items-center justify-between"
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

              <DialogFooter className="pt-3 border-t flex flex-row items-center justify-between">
                <div>
                  {canManage && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        openPermanentModal(selectedDetailItem);
                      }}
                      className="text-xs text-red-600 hover:bg-red-50 hover:text-red-700 gap-1.5"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Permanent Delete
                    </Button>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => setDetailsDialogOpen(false)}>
                    Close
                  </Button>
                  {canRestore && (
                    <Button
                      size="sm"
                      onClick={() => {
                        openRestoreModal(selectedDetailItem);
                      }}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 text-xs"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
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
        <DialogContent className="max-w-md">
          {itemToRestore && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-950 flex items-center justify-center text-emerald-600">
                  <RotateCcw className="w-5 h-5" />
                </div>
                <div>
                  <DialogTitle className="text-base font-bold">Restore Deleted Record</DialogTitle>
                  <DialogDescription className="text-xs">
                    Return this record to its active section
                  </DialogDescription>
                </div>
              </div>

              <div className="p-3 bg-emerald-50 dark:bg-emerald-950/30 rounded-lg border border-emerald-200 dark:border-emerald-900 text-xs space-y-1">
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

              <p className="text-xs text-muted-foreground">
                All historical links and associations (such as customer vehicle links or job card line items) will be restored intact.
              </p>

              <DialogFooter className="pt-2">
                <Button variant="outline" size="sm" onClick={() => setRestoreDialogOpen(false)}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  disabled={actionLoading}
                  onClick={handleConfirmRestore}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
                >
                  {actionLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Confirm &amp; Restore
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ─── MODAL: PERMANENT DELETE CONFIRMATION ──────────────────────────── */}
      <Dialog open={permanentDialogOpen} onOpenChange={setPermanentDialogOpen}>
        <DialogContent className="max-w-md">
          {itemToPurge && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-950 flex items-center justify-center text-red-600">
                  <Trash2 className="w-5 h-5" />
                </div>
                <div>
                  <DialogTitle className="text-base font-bold text-red-600">
                    Permanently Delete Record
                  </DialogTitle>
                  <DialogDescription className="text-xs font-semibold text-rose-600">
                    This action cannot be undone.
                  </DialogDescription>
                </div>
              </div>

              {/* Financial History Block Warning */}
              {financialBlockMessage ? (
                <div className="p-3 bg-red-50 dark:bg-red-950/40 rounded-lg border border-red-300 dark:border-red-900 text-xs space-y-2">
                  <div className="flex items-start gap-2">
                    <ShieldAlert className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold text-red-800 dark:text-red-200">
                        Deletion Blocked: Financial Integrity Protection
                      </p>
                      <p className="text-red-700 dark:text-red-300 mt-1">
                        {financialBlockMessage}
                      </p>
                    </div>
                  </div>
                  <p className="text-[11px] text-muted-foreground border-t border-red-200 dark:border-red-800 pt-1.5">
                    Records linked to tax invoices, ledger entries, or posted financial transactions cannot be erased to preserve UAE audit trail compliance.
                  </p>
                </div>
              ) : (
                <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-lg border text-xs space-y-1">
                  <p className="text-muted-foreground">You are about to permanently purge:</p>
                  <p className="font-bold text-sm text-slate-900 dark:text-slate-100">{itemToPurge.nameOrNumber}</p>
                  <p className="text-[11px] text-muted-foreground">
                    Module: {itemToPurge.source_module} &bull; Ref: {itemToPurge.reference}
                  </p>
                </div>
              )}

              <DialogFooter className="pt-2">
                <Button variant="outline" size="sm" onClick={() => setPermanentDialogOpen(false)}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  disabled={Boolean(financialBlockMessage) || actionLoading}
                  onClick={handleConfirmPurge}
                  className="bg-red-600 hover:bg-red-700 text-white gap-1.5"
                >
                  {actionLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
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
