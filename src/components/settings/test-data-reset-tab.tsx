"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertTriangle,
  ArrowDownToLine,
  CheckCircle2,
  Database,
  FileSpreadsheet,
  History,
  Loader2,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  Users,
  Car,
  Wrench,
  Receipt,
  CreditCard,
  ShoppingBag,
  Package,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useWorkspace } from "@/lib/context/workspace-context";
import { usePermissions } from "@/lib/context/auth-context";
import { DEFAULT_WORKSPACE_ID, DEFAULT_WORKSPACE_NAME } from "@/lib/constants";
import {
  getWorkspaceTestCounts,
  exportWorkspaceDataBackup,
  resetSelectedTestData,
  executeFreshStart,
  WorkspaceTestCounts,
} from "@/lib/services/test-data-reset-service";

interface ResetModuleOption {
  id: string;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  countKey: keyof Omit<WorkspaceTestCounts, "totalTestRecords">;
}

const RESET_MODULES: ResetModuleOption[] = [
  {
    id: "customers",
    label: "Customers",
    description: "Customer directory profiles & contact details",
    icon: Users,
    countKey: "customers",
  },
  {
    id: "vehicles",
    label: "Vehicles",
    description: "Registered vehicle cards, plate numbers & VINs",
    icon: Car,
    countKey: "vehicles",
  },
  {
    id: "job_cards",
    label: "Job Cards",
    description: "Repair orders, diagnostics & service job card items",
    icon: Wrench,
    countKey: "jobCards",
  },
  {
    id: "invoices",
    label: "Invoices",
    description: "Tax invoices, bill line items & PDF references",
    icon: Receipt,
    countKey: "invoices",
  },
  {
    id: "payments",
    label: "Payments",
    description: "Customer cash, card & bank payment records",
    icon: CreditCard,
    countKey: "payments",
  },
  {
    id: "expenses",
    label: "Expenses",
    description: "Workshop operational expenses, bills & vouchers",
    icon: FileSpreadsheet,
    countKey: "expenses",
  },
  {
    id: "purchases",
    label: "Purchases",
    description: "Spare part purchase orders & supplier bills",
    icon: ShoppingBag,
    countKey: "purchases",
  },
  {
    id: "ledger_transactions",
    label: "Ledger Transactions",
    description: "Journal entries, postings & customer/supplier balances",
    icon: History,
    countKey: "ledgerTransactions",
  },
  {
    id: "inventory_transactions",
    label: "Inventory Test Transactions",
    description: "Stock in/out test movements & balance adjustments",
    icon: Package,
    countKey: "inventoryTransactions",
  },
  {
    id: "recycle_bin",
    label: "Recycle Bin Test Records",
    description: "Audit history and soft-deleted test records",
    icon: Trash2,
    countKey: "recycleBinRecords",
  },
];

export function TestDataResetTab() {
  const { currentWorkspace, isPlatformOwner } = useWorkspace();
  const { user, isOwner } = usePermissions();
  const activeWorkspaceId = currentWorkspace?.id || DEFAULT_WORKSPACE_ID;
  const activeWorkspaceName = currentWorkspace?.name || DEFAULT_WORKSPACE_NAME;

  const [counts, setCounts] = useState<WorkspaceTestCounts | null>(null);
  const [loadingCounts, setLoadingCounts] = useState(true);
  const [selectedModules, setSelectedModules] = useState<string[]>([]);
  const [toast, setToast] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Dialog State
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [isFreshStart, setIsFreshStart] = useState(false);
  const [confirmInput, setConfirmInput] = useState("");
  const [isExecuting, setIsExecuting] = useState(false);
  const [backupDownloaded, setBackupDownloaded] = useState(false);

  // Refresh counts
  const loadCounts = useCallback(async () => {
    setLoadingCounts(true);
    try {
      const data = await getWorkspaceTestCounts(activeWorkspaceId);
      setCounts(data);
    } catch (e) {
      console.error("Failed to load test counts:", e);
    } finally {
      setLoadingCounts(false);
    }
  }, [activeWorkspaceId]);

  useEffect(() => {
    loadCounts();
  }, [loadCounts]);

  const handleToggleModule = (id: string) => {
    setSelectedModules((prev) =>
      prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]
    );
  };

  const handleSelectAllOperational = () => {
    setSelectedModules(RESET_MODULES.map((m) => m.id));
  };

  const handleClearSelection = () => {
    setSelectedModules([]);
  };

  const handleDownloadBackup = async () => {
    try {
      const jsonString = await exportWorkspaceDataBackup(activeWorkspaceId);
      const blob = new Blob([jsonString], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `atiq-jehan-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setBackupDownloaded(true);
      setToast({
        type: "success",
        text: "Database backup export downloaded successfully.",
      });
    } catch (err: any) {
      setToast({
        type: "error",
        text: err.message || "Failed to download backup",
      });
    }
  };

  const handleOpenResetSelectedModal = () => {
    if (selectedModules.length === 0) return;
    setIsFreshStart(false);
    setConfirmInput("");
    setConfirmModalOpen(true);
  };

  const handleOpenFreshStartModal = () => {
    setIsFreshStart(true);
    setConfirmInput("");
    setConfirmModalOpen(true);
  };

  const isConfirmed = confirmInput.trim().toUpperCase() === "RESET ATIQ JEHAN";

  const handleExecuteReset = async () => {
    if (!isConfirmed || isExecuting) return;
    setIsExecuting(true);
    try {
      if (isFreshStart) {
        const res = await executeFreshStart(activeWorkspaceId, user?.full_name || "Primary Owner");
        setToast({
          type: "success",
          text: res.message,
        });
      } else {
        const res = await resetSelectedTestData(
          activeWorkspaceId,
          selectedModules,
          user?.full_name || "Primary Owner"
        );
        setToast({
          type: "success",
          text: res.message,
        });
      }

      setConfirmModalOpen(false);
      setConfirmInput("");
      setSelectedModules([]);
      await loadCounts();
    } catch (err: any) {
      console.error("Reset error:", err);
      setToast({
        type: "error",
        text: err.message || "Failed to execute reset",
      });
    } finally {
      setIsExecuting(false);
    }
  };

  if (!isOwner && !isPlatformOwner) {
    return (
      <Card className="border-red-200 bg-red-50/50">
        <CardContent className="p-8 text-center space-y-3">
          <ShieldAlert className="h-10 w-10 text-red-500 mx-auto" />
          <h3 className="text-base font-bold text-red-900">Access Restricted</h3>
          <p className="text-xs text-red-700">
            The Test Data Reset section is exclusively restricted to the Primary Workspace Owner and Super Admin.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* ─── Notification Toast ─── */}
      {toast && (
        <div
          className={`flex items-center justify-between p-4 rounded-xl border text-xs font-semibold ${
            toast.type === "success"
              ? "bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800"
              : "bg-red-50 text-red-800 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800"
          }`}
        >
          <div className="flex items-center gap-2">
            {toast.type === "success" ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertTriangle className="h-4 w-4 text-red-600 shrink-0" />
            )}
            <span>{toast.text}</span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setToast(null)}
            className="h-6 text-xs p-1 hover:bg-transparent"
          >
            Dismiss
          </Button>
        </div>
      )}

      {/* ─── Target Workspace Isolation Verification Banner ─── */}
      <Card className="border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/60 shadow-xs">
        <CardContent className="p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="bg-rose-100 text-rose-800 dark:bg-rose-950/80 dark:text-rose-300 text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full flex items-center gap-1">
                <ShieldAlert className="h-3 w-3 text-rose-600" />
                Primary Owner Only
              </span>
              <span className="text-xs font-semibold text-slate-500">
                Data Management &amp; System Sanitization
              </span>
            </div>
            <h2 className="text-lg font-black text-slate-900 dark:text-slate-100">
              RESET ATIQ JEHAN TEST DATA
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-400 max-w-2xl">
              Target Workspace:{" "}
              <strong className="text-slate-900 dark:text-slate-200 font-bold font-mono">
                {activeWorkspaceName} ({activeWorkspaceId})
              </strong>
              . Secondary workspaces (e.g. <em>ibrar</em>) and system master configurations are strictly protected and never touched.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleDownloadBackup}
              className="text-xs font-semibold h-9 gap-1.5 border-slate-300 dark:border-slate-700 hover:bg-white dark:hover:bg-slate-800"
            >
              <ArrowDownToLine className="h-3.5 w-3.5 text-blue-600" />
              Download Backup (JSON)
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={loadCounts}
              disabled={loadingCounts}
              className="text-xs h-9 gap-1 border-slate-300 dark:border-slate-700"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loadingCounts ? "animate-spin" : ""}`} />
              Refresh Counts
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ─── Operational Test Data Records Count Grid ─── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
            Current Test Operational Data ({counts?.totalTestRecords || 0} Total Records)
          </h3>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleSelectAllOperational}
              className="text-xs font-semibold text-blue-600 dark:text-blue-400 h-7 px-2 hover:bg-blue-50"
            >
              Select Operational Test Data
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleClearSelection}
              className="text-xs font-semibold text-slate-500 h-7 px-2 hover:bg-slate-100"
            >
              Clear Selection
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {RESET_MODULES.map((mod) => {
            const isSelected = selectedModules.includes(mod.id);
            const count = counts ? counts[mod.countKey] : 0;
            const Icon = mod.icon;

            return (
              <div
                key={mod.id}
                onClick={() => handleToggleModule(mod.id)}
                className={`p-3.5 rounded-xl border transition-all cursor-pointer select-none space-y-2 relative ${
                  isSelected
                    ? "border-rose-500 bg-rose-50/50 dark:bg-rose-950/20 shadow-xs"
                    : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-300"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => handleToggleModule(mod.id)}
                      className="border-slate-400 data-[state=checked]:bg-rose-600 data-[state=checked]:border-rose-600"
                    />
                    <Icon className={`h-4 w-4 ${isSelected ? "text-rose-600" : "text-slate-500"}`} />
                  </div>
                  <span
                    className={`font-mono text-sm font-bold ${
                      count > 0 ? "text-slate-900 dark:text-slate-100" : "text-slate-400"
                    }`}
                  >
                    {loadingCounts ? "..." : count}
                  </span>
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-900 dark:text-slate-100">
                    {mod.label}
                  </div>
                  <p className="text-[11px] text-slate-500 line-clamp-1 mt-0.5">
                    {mod.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Selected Action Trigger */}
        <div className="flex items-center justify-between pt-1">
          <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">
            {selectedModules.length} module(s) selected for targeted cleanup
          </span>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={handleOpenResetSelectedModal}
            disabled={selectedModules.length === 0}
            className="text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white gap-1.5 h-9 px-4"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Reset Selected Data ({selectedModules.length})
          </Button>
        </div>
      </div>

      {/* ─── ONE-CLICK FRESH START HERO CARD ─── */}
      <Card className="border-2 border-rose-200 dark:border-rose-900/60 bg-gradient-to-br from-rose-50/50 via-white to-amber-50/30 dark:from-rose-950/20 dark:via-slate-900 dark:to-slate-900 shadow-sm">
        <CardHeader className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="bg-rose-600 text-white text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full flex items-center gap-1">
              <RotateCcw className="h-3 w-3" />
              One-Click Fresh Start
            </span>
            <span className="text-xs font-bold text-rose-700 dark:text-rose-400 uppercase tracking-wider">
              Zero Operational Transactions
            </span>
          </div>
          <CardTitle className="text-lg font-black tracking-tight text-slate-900 dark:text-slate-100">
            FRESH START — REMOVE ALL TEST ENTRIES
          </CardTitle>
          <CardDescription className="text-xs text-slate-600 dark:text-slate-400">
            Instantly wipe all test transactions from ATIQ JEHAN AUTO REPAIR so you can enter real workshop customers, vehicles, and jobs from scratch.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            {/* What will be removed */}
            <div className="p-3.5 rounded-lg border border-rose-200 bg-white dark:bg-slate-900/80 dark:border-rose-900/40 space-y-2">
              <div className="font-bold text-rose-700 dark:text-rose-400 flex items-center gap-1.5">
                <Trash2 className="h-3.5 w-3.5 text-rose-600" />
                Will Be Removed (Operational Test Data):
              </div>
              <ul className="space-y-1 text-slate-600 dark:text-slate-400 list-disc list-inside text-[11px]">
                <li>All Customers, Vehicles &amp; Contact profiles (→ 0)</li>
                <li>All Job Cards, diagnostic notes &amp; line items (→ 0)</li>
                <li>All Invoices, invoice items &amp; test VAT bills (→ 0)</li>
                <li>All Payment records, cash allocations &amp; collections (→ AED 0.00)</li>
                <li>All Expenses, purchase orders &amp; supplier bills (→ 0)</li>
                <li>All Ledger transactions, test journals &amp; receivables (→ AED 0.00)</li>
                <li>All Inventory test movements &amp; recycle-bin records</li>
              </ul>
            </div>

            {/* What will be kept */}
            <div className="p-3.5 rounded-lg border border-emerald-200 bg-white dark:bg-slate-900/80 dark:border-emerald-900/40 space-y-2">
              <div className="font-bold text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                Will Be Kept (System Masters &amp; Setup):
              </div>
              <ul className="space-y-1 text-slate-600 dark:text-slate-400 list-disc list-inside text-[11px]">
                <li>ATIQ JEHAN AUTO REPAIR workspace identity &amp; TRN details</li>
                <li>Owner login credentials &amp; Supabase Auth users</li>
                <li>Staff user accounts, delegated roles &amp; permissions</li>
                <li>Master Services Catalog &amp; predefined labor rates</li>
                <li>Master Spare Parts item definitions &amp; barcodes</li>
                <li>Master Suppliers directory &amp; contact database</li>
                <li>Chart of Accounts structure &amp; Bank Account definitions</li>
                <li>Secondary workspace <strong>ibrar</strong> (completely untouched)</li>
              </ul>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2 border-t border-rose-100 dark:border-rose-950">
            <div className="text-xs text-slate-500 flex items-center gap-1.5">
              <Database className="h-3.5 w-3.5 text-slate-400" />
              <span>Target workspace: <strong className="text-slate-800 dark:text-slate-200">{activeWorkspaceName}</strong></span>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              {!backupDownloaded && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleDownloadBackup}
                  className="text-xs h-9 font-semibold border-slate-300 w-full sm:w-auto"
                >
                  <ArrowDownToLine className="h-3.5 w-3.5 mr-1 text-blue-600" />
                  Save Backup First
                </Button>
              )}
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={handleOpenFreshStartModal}
                className="text-xs h-9 font-black bg-rose-600 hover:bg-rose-700 text-white gap-1.5 px-5 shadow-sm w-full sm:w-auto"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Start Fresh Reset
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ─── Confirmation Modal Requiring 'RESET ATIQ JEHAN' ─── */}
      <Dialog open={confirmModalOpen} onOpenChange={setConfirmModalOpen}>
        <DialogContent className="max-w-md border-rose-300 dark:border-rose-900 shadow-2xl">
          <DialogHeader className="space-y-2">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center h-10 w-10 rounded-full bg-rose-100 text-rose-600 dark:bg-rose-950/60 dark:text-rose-400 shrink-0">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div>
                <DialogTitle className="text-base font-black text-rose-600 dark:text-rose-400">
                  {isFreshStart
                    ? "CONFIRM COMPLETE FRESH START?"
                    : "RESET SELECTED TEST MODULES?"}
                </DialogTitle>
                <DialogDescription className="text-xs text-slate-500">
                  Target Workspace: {activeWorkspaceName}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-3 py-2 text-xs">
            <div className="p-3 rounded-lg border border-rose-200 bg-rose-50/60 dark:bg-rose-950/30 dark:border-rose-900/50 space-y-1.5">
              <p className="font-bold text-rose-900 dark:text-rose-200">
                {isFreshStart
                  ? "All operational test records will be permanently erased:"
                  : `The following test categories will be wiped from ${activeWorkspaceName}:`}
              </p>
              <div className="text-[11px] text-rose-800 dark:text-rose-300 font-mono">
                {isFreshStart
                  ? `Customers (${counts?.customers || 0}), Vehicles (${counts?.vehicles || 0}), Job Cards (${counts?.jobCards || 0}), Invoices (${counts?.invoices || 0}), Payments (${counts?.payments || 0}), Expenses (${counts?.expenses || 0}), Purchases (${counts?.purchases || 0}), Ledger Txns (${counts?.ledgerTransactions || 0})`
                  : selectedModules
                      .map((id) => RESET_MODULES.find((m) => m.id === id)?.label)
                      .join(", ")}
              </div>
            </div>

            <p className="text-slate-600 dark:text-slate-400 leading-relaxed text-[11px]">
              This action is destructive and irreversible. Secondary workspaces and master configurations will remain intact.
            </p>

            <div className="space-y-1.5 pt-1">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Type <span className="font-mono font-bold text-rose-600 dark:text-rose-400">RESET ATIQ JEHAN</span> to confirm:
              </label>
              <Input
                value={confirmInput}
                onChange={(e) => setConfirmInput(e.target.value)}
                placeholder="Type RESET ATIQ JEHAN"
                className="font-mono text-xs uppercase tracking-wider border-rose-300 focus:ring-rose-500 h-9"
                autoFocus
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setConfirmModalOpen(false)}
              disabled={isExecuting}
              className="text-xs h-9"
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={handleExecuteReset}
              disabled={!isConfirmed || isExecuting}
              className="text-xs h-9 font-bold bg-rose-600 hover:bg-rose-700 text-white gap-1.5 shadow-sm"
            >
              {isExecuting ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Executing Reset...
                </>
              ) : (
                <>
                  <Trash2 className="h-3.5 w-3.5" />
                  {isFreshStart ? "Execute Fresh Start" : "Reset Selected Data"}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
