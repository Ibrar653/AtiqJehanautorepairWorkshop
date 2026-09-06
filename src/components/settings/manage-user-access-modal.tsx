"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  MODULE_SECTIONS,
  ALL_APP_MODULES,
  PROTECTED_ACTIONS,
  PRIMARY_OWNER_EMAIL,
  getUserHierarchyLevel,
  HIERARCHY_BADGE_CONFIG,
  getFullOperationalPermissions,
  getFinanceOnlyPermissions,
  getWorkshopOperationsPermissions,
  getInventoryOnlyPermissions,
  getViewOnlyPermissions,
  getEmptyPermissions,
  getDefaultPermissionsForRole,
  sanitizePermissionDependencies,
  STAFF_USER_ROLES,
  DATA_ACCESS_SCOPES,
  FINANCIAL_VISIBILITY_FIELDS,
  getDefaultFinancialVisibility,
  getDefaultApprovalLimits,
  getDefaultDataScope,
} from "@/lib/constants";
import {
  getUserPermissions,
  saveUserPermissions,
  comparePermissionsWithRole,
} from "@/lib/services/user-service";
import type {
  User,
  UserRole,
  AppModule,
  UserModulePermission,
  ProtectionRiskLevel,
  DataAccessScope,
  FinancialVisibilitySettings,
  UserApprovalLimits,
} from "@/types/database";
import {
  Shield,
  ShieldAlert,
  ShieldCheck,
  Check,
  X,
  AlertTriangle,
  Search,
  Sliders,
  Copy,
  RotateCcw,
  Sparkles,
  Lock,
  Eye,
  FileCheck,
  Layers,
  ArrowRight,
  Info,
  Calendar,
  Clock,
  User as UserIcon,
  Crown,
  DollarSign,
  Briefcase,
  Wrench,
  Package,
  FileText,
  BarChart3,
  Settings as SettingsIcon,
  ChevronRight,
  Building,
  KeyRound,
  FileWarning,
} from "lucide-react";

interface ManageUserAccessModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetUser: User | null;
  allStaffUsers: User[];
  currentOperator: { id: string; name: string };
  onPermissionsSaved: () => void;
}

type NavigationTab = "module" | "scope" | "financial" | "limits";

export function ManageUserAccessModal({
  isOpen,
  onClose,
  targetUser,
  allStaffUsers,
  currentOperator,
  onPermissionsSaved,
}: ManageUserAccessModalProps) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<NavigationTab>("module");
  const [selectedModule, setSelectedModule] = useState<AppModule>("dashboard");
  const [searchQuery, setSearchQuery] = useState("");
  const [changeReason, setChangeReason] = useState("");

  // Permissions state
  const [permissions, setPermissions] = useState<Record<AppModule, UserModulePermission>>({} as any);
  const [originalPermissions, setOriginalPermissions] = useState<Record<AppModule, UserModulePermission>>({} as any);

  // Delegated Access Controls state
  const [dataScope, setDataScope] = useState<DataAccessScope>("all");
  const [financialVisibility, setFinancialVisibility] = useState<FinancialVisibilitySettings>({
    view_selling_prices: true,
    view_purchase_prices: false,
    view_cost_price: false,
    view_profit: false,
    view_customer_outstanding: true,
    view_supplier_outstanding: false,
    view_cash_balance: false,
    view_bank_balances: false,
    view_owner_capital: false,
    view_full_ledger: false,
  });
  const [approvalLimits, setApprovalLimits] = useState<UserApprovalLimits>({
    expense_approval_limit: 1000,
    transfer_money_limit: 2000,
    payment_approval_limit: 5000,
    discount_limit_percentage: 10,
    manual_stock_adjustment_max_units: 10,
    can_void_invoice: false,
  });
  const [accessStartDate, setAccessStartDate] = useState<string>("");
  const [accessExpiryDate, setAccessExpiryDate] = useState<string>("");

  const isOwner = useMemo(() => {
    if (!targetUser) return false;
    return (
      targetUser.email.toLowerCase() === PRIMARY_OWNER_EMAIL.toLowerCase() ||
      targetUser.role === "owner" ||
      targetUser.id === "usr-owner-001"
    );
  }, [targetUser]);

  // Load user data on open
  useEffect(() => {
    if (!targetUser || !isOpen) return;

    setLoading(true);
    setChangeReason("");
    setDataScope(targetUser.data_scope || getDefaultDataScope(targetUser.role || "viewer"));
    setFinancialVisibility(
      (targetUser.financial_visibility as FinancialVisibilitySettings) ||
        getDefaultFinancialVisibility(targetUser.role || "viewer")
    );
    setApprovalLimits(
      (targetUser.approval_limits as UserApprovalLimits) ||
        getDefaultApprovalLimits(targetUser.role || "viewer")
    );
    setAccessStartDate(targetUser.access_start_date ? targetUser.access_start_date.slice(0, 10) : "");
    setAccessExpiryDate(targetUser.access_expiry_date ? targetUser.access_expiry_date.slice(0, 10) : "");

    getUserPermissions(targetUser.id)
      .then((perms) => {
        setPermissions(perms);
        setOriginalPermissions(JSON.parse(JSON.stringify(perms)));
      })
      .finally(() => {
        setLoading(false);
      });
  }, [targetUser, isOpen]);

  // Handle Action Permission Change
  const handleActionToggle = (
    module: AppModule,
    action: keyof Omit<UserModulePermission, "id" | "user_id" | "module" | "protected_actions">,
    value: boolean
  ) => {
    if (isOwner) return;

    setPermissions((prev) => {
      const current = prev[module] || {
        module,
        access: false,
        can_view: false,
        can_create: false,
        can_edit: false,
        can_delete: false,
        can_print: false,
        can_export: false,
      };

      const updated = {
        ...current,
        [action]: value,
      };

      const sanitized = sanitizePermissionDependencies(updated);
      return {
        ...prev,
        [module]: sanitized,
      };
    });
  };

  // Handle Master Module Toggle
  const handleModuleAccessToggle = (module: AppModule, value: boolean) => {
    if (isOwner) return;

    setPermissions((prev) => {
      const current = prev[module] || {
        module,
        access: false,
        can_view: false,
        can_create: false,
        can_edit: false,
        can_delete: false,
        can_print: false,
        can_export: false,
      };

      let updated: UserModulePermission;
      if (value) {
        updated = {
          ...current,
          access: true,
          can_view: true,
        };
      } else {
        updated = {
          ...current,
          access: false,
          can_view: false,
          can_create: false,
          can_edit: false,
          can_delete: false,
          can_print: false,
          can_export: false,
          can_approve: false,
          can_transfer: false,
          can_journal: false,
          can_reverse: false,
          can_finalize: false,
          can_record_payment: false,
          can_void: false,
          can_view_bank_balance: false,
        };
      }

      const sanitized = sanitizePermissionDependencies(updated);
      return {
        ...prev,
        [module]: sanitized,
      };
    });
  };

  // Handle Protected Action Toggle
  const handleProtectedActionToggle = (module: AppModule, actionKey: string, value: boolean) => {
    if (isOwner) return;

    setPermissions((prev) => {
      const current = prev[module] || {
        module,
        access: false,
        can_view: false,
        can_create: false,
        can_edit: false,
        can_delete: false,
        can_print: false,
        can_export: false,
      };

      const protectedMap = { ...(current.protected_actions || {}) };
      protectedMap[actionKey] = value;

      const updated: UserModulePermission = {
        ...current,
        access: value ? true : current.access,
        can_view: value ? true : current.can_view,
        protected_actions: protectedMap,
      };

      if (actionKey === "transfer_money") updated.can_transfer = value;
      if (actionKey === "manual_journal") updated.can_journal = value;
      if (actionKey === "reverse_transaction") updated.can_reverse = value;
      if (actionKey === "finalize_purchase") updated.can_finalize = value;
      if (actionKey === "record_payment") updated.can_record_payment = value;
      if (actionKey === "void_invoice") updated.can_void = value;
      if (actionKey === "view_bank_balances") updated.can_view_bank_balance = value;

      const sanitized = sanitizePermissionDependencies(updated);
      return {
        ...prev,
        [module]: sanitized,
      };
    });
  };

  // Preset Handlers
  const handleApplyPreset = (type: "full_ops" | "view_only" | "finance" | "workshop" | "inventory" | "clear") => {
    if (isOwner) return;
    let next: Record<AppModule, UserModulePermission>;
    switch (type) {
      case "full_ops":
        next = getFullOperationalPermissions();
        break;
      case "view_only":
        next = getViewOnlyPermissions();
        break;
      case "finance":
        next = getFinanceOnlyPermissions();
        break;
      case "workshop":
        next = getWorkshopOperationsPermissions();
        break;
      case "inventory":
        next = getInventoryOnlyPermissions();
        break;
      case "clear":
        next = getEmptyPermissions();
        break;
    }
    setPermissions(next);
  };

  const handleApplyRoleTemplate = (role: UserRole) => {
    if (isOwner) return;
    setPermissions(getDefaultPermissionsForRole(role));
    setDataScope(getDefaultDataScope(role));
    setFinancialVisibility(getDefaultFinancialVisibility(role));
    setApprovalLimits(getDefaultApprovalLimits(role));
  };

  const handleCopyFromUser = (sourceUserId: string) => {
    if (isOwner || !sourceUserId) return;
    setLoading(true);
    getUserPermissions(sourceUserId)
      .then((sourcePerms) => {
        setPermissions(sourcePerms);
        const srcUser = allStaffUsers.find((u) => u.id === sourceUserId);
        if (srcUser) {
          if (srcUser.data_scope) setDataScope(srcUser.data_scope);
          if (srcUser.financial_visibility) setFinancialVisibility(srcUser.financial_visibility as any);
          if (srcUser.approval_limits) setApprovalLimits(srcUser.approval_limits as any);
        }
      })
      .finally(() => setLoading(false));
  };

  // Metrics computation for live right sidebar
  const metrics = useMemo(() => {
    let enabledModules = 0;
    let readActions = 0;
    let createActions = 0;
    let deleteActions = 0;
    let financialActionCount = 0;
    let sensitiveCount = 0;

    for (const mod of ALL_APP_MODULES) {
      const p = permissions[mod.id];
      if (!p) continue;
      if (p.access) {
        enabledModules++;
        if (p.can_view) readActions++;
        if (p.can_create) createActions++;
        if (p.can_delete) deleteActions++;
      }

      if (p.can_transfer || p.can_journal || p.can_reverse || p.can_record_payment) {
        financialActionCount++;
      }
      if (p.can_void || p.can_journal || p.can_reverse) {
        sensitiveCount++;
      }
    }

    return {
      enabledModules,
      totalModules: ALL_APP_MODULES.length,
      readActions,
      createActions,
      deleteActions,
      financialActionCount,
      sensitiveCount,
    };
  }, [permissions]);

  // Compute deviations from standard role template
  const deviations = useMemo(() => {
    if (!targetUser) return [];
    return comparePermissionsWithRole(permissions, targetUser.role || "viewer");
  }, [permissions, targetUser]);

  // Save changes
  const handleSave = async () => {
    if (!targetUser) return;
    if (isOwner) {
      onClose();
      return;
    }

    setSaving(true);
    try {
      const res = await saveUserPermissions(
        targetUser.id,
        permissions,
        currentOperator,
        changeReason.trim() || undefined,
        {
          data_scope: dataScope,
          financial_visibility: financialVisibility,
          approval_limits: approvalLimits,
          access_start_date: accessStartDate ? new Date(accessStartDate).toISOString() : null,
          access_expiry_date: accessExpiryDate ? new Date(accessExpiryDate).toISOString() : null,
        }
      );

      if (res.success) {
        onPermissionsSaved();
        onClose();
      } else {
        alert(res.error || "Failed to update permissions.");
      }
    } catch (e: any) {
      alert("Error saving permissions: " + (e?.message || e));
    } finally {
      setSaving(false);
    }
  };

  if (!targetUser) return null;

  const currentModDef = ALL_APP_MODULES.find((m) => m.id === selectedModule) || ALL_APP_MODULES[0];
  const currentModPerm = permissions[selectedModule] || {
    module: selectedModule,
    access: false,
    can_view: false,
    can_create: false,
    can_edit: false,
    can_delete: false,
    can_print: false,
    can_export: false,
  };
  const modProtectedActions = PROTECTED_ACTIONS.filter((pa) => pa.module === selectedModule);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-6xl w-[95vw] h-[90vh] p-0 flex flex-col bg-slate-50 dark:bg-slate-950 border border-slate-200/90 dark:border-slate-800 shadow-xl overflow-hidden rounded-2xl">
        {/* ─── 1. Header Banner ─────────────────────────────────────────── */}
        <DialogHeader className="px-6 py-4 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex flex-row items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-blue-600/10 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 flex items-center justify-center border border-blue-200 dark:border-blue-800 shrink-0">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                Manage Delegated Access & Permissions
                {isOwner && (
                  <Badge className="bg-blue-900 text-white border-blue-950 text-[10px] gap-1">
                    <Crown className="w-3 h-3" /> Primary Owner
                  </Badge>
                )}
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500 dark:text-slate-400">
                Configure module authorizations, financial visibility, data scope, and transaction limits for{" "}
                <strong className="text-slate-900 dark:text-slate-200">{targetUser.full_name}</strong> ({targetUser.email})
              </DialogDescription>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Select
              onValueChange={(val) => {
                if (typeof val === "string" && val) handleApplyRoleTemplate(val as UserRole);
              }}
              disabled={isOwner}
            >
              <SelectTrigger className="h-8 text-xs w-36 bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700">
                <SelectValue placeholder="Apply Role..." />
              </SelectTrigger>
              <SelectContent>
                {STAFF_USER_ROLES.map((r) => (
                  <SelectItem key={r.value} value={r.value} className="text-xs">
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              onValueChange={(val) => {
                if (typeof val === "string" && val) handleCopyFromUser(val);
              }}
              disabled={isOwner}
            >
              <SelectTrigger className="h-8 text-xs w-36 bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700">
                <SelectValue placeholder="Copy From..." />
              </SelectTrigger>
              <SelectContent>
                {allStaffUsers
                  .filter((u) => u.id !== targetUser.id)
                  .map((u) => (
                    <SelectItem key={u.id} value={u.id} className="text-xs">
                      {u.full_name} ({u.role})
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
        </DialogHeader>

        {/* ─── 2. Quick Presets Bar ────────────────────────────────────────── */}
        <div className="px-6 py-2 bg-slate-100/70 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 text-xs shrink-0 overflow-x-auto">
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mr-1">Presets:</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleApplyPreset("full_ops")}
              disabled={isOwner}
              className="h-6 text-[11px] px-2 bg-white dark:bg-slate-800 hover:bg-blue-50 hover:text-blue-600"
            >
              Full Operational
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleApplyPreset("workshop")}
              disabled={isOwner}
              className="h-6 text-[11px] px-2 bg-white dark:bg-slate-800 hover:bg-emerald-50 hover:text-emerald-600"
            >
              Workshop Ops
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleApplyPreset("finance")}
              disabled={isOwner}
              className="h-6 text-[11px] px-2 bg-white dark:bg-slate-800 hover:bg-amber-50 hover:text-amber-600"
            >
              Finance Team
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleApplyPreset("inventory")}
              disabled={isOwner}
              className="h-6 text-[11px] px-2 bg-white dark:bg-slate-800"
            >
              Inventory Staff
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleApplyPreset("view_only")}
              disabled={isOwner}
              className="h-6 text-[11px] px-2 bg-white dark:bg-slate-800"
            >
              View Only
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleApplyPreset("clear")}
              disabled={isOwner}
              className="h-6 text-[11px] px-2 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30"
            >
              Clear All
            </Button>
          </div>

          <div className="relative w-48 shrink-0">
            <Search className="absolute left-2 top-1.5 h-3.5 w-3.5 text-slate-400" />
            <Input
              placeholder="Find module..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-7 h-6 text-xs bg-white dark:bg-slate-800"
            />
          </div>
        </div>

        {/* ─── 3. Main 3-Column Work Area ──────────────────────────────────── */}
        <div className="flex-1 grid grid-cols-1 md:grid-cols-12 overflow-hidden">
          {/* Column A: Left Navigation (4 cols) */}
          <div className="md:col-span-3 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-y-auto p-3 space-y-4">
            {/* Global Delegated Controls Section */}
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-2 mb-1.5">
                Delegated Governance
              </p>
              <div className="space-y-1">
                <button
                  onClick={() => setActiveTab("scope")}
                  className={`w-full text-left px-2.5 py-2 rounded-lg text-xs font-medium flex items-center justify-between transition-colors ${
                    activeTab === "scope"
                      ? "bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 font-bold border border-blue-200 dark:border-blue-900"
                      : "text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <Building className="w-3.5 h-3.5 text-blue-600" />
                    Data Scope & Expiry
                  </span>
                  <Badge variant="outline" className="text-[10px] uppercase">
                    {dataScope}
                  </Badge>
                </button>

                <button
                  onClick={() => setActiveTab("financial")}
                  className={`w-full text-left px-2.5 py-2 rounded-lg text-xs font-medium flex items-center justify-between transition-colors ${
                    activeTab === "financial"
                      ? "bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 font-bold border border-blue-200 dark:border-blue-900"
                      : "text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <DollarSign className="w-3.5 h-3.5 text-amber-600" />
                    Financial Visibility
                  </span>
                  <Badge variant="outline" className="text-[10px]">
                    10 Rules
                  </Badge>
                </button>

                <button
                  onClick={() => setActiveTab("limits")}
                  className={`w-full text-left px-2.5 py-2 rounded-lg text-xs font-medium flex items-center justify-between transition-colors ${
                    activeTab === "limits"
                      ? "bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 font-bold border border-blue-200 dark:border-blue-900"
                      : "text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <KeyRound className="w-3.5 h-3.5 text-purple-600" />
                    Approval Limits
                  </span>
                  <Badge variant="outline" className="text-[10px]">
                    Limits Active
                  </Badge>
                </button>
              </div>
            </div>

            {/* Software Module Groups */}
            {MODULE_SECTIONS.map((sec) => {
              const matchingModules = sec.modules.filter((m) => {
                if (!searchQuery) return true;
                const def = ALL_APP_MODULES.find((mod) => mod.id === m);
                return (
                  def?.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
                  m.toLowerCase().includes(searchQuery.toLowerCase())
                );
              });

              if (matchingModules.length === 0) return null;

              return (
                <div key={sec.id}>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-2 mb-1.5 truncate">
                    {sec.shortTitle}
                  </p>
                  <div className="space-y-1">
                    {matchingModules.map((modId) => {
                      const modDef = ALL_APP_MODULES.find((m) => m.id === modId);
                      const isModActive = Boolean(permissions[modId]?.access);
                      const isSelected = activeTab === "module" && selectedModule === modId;

                      return (
                        <button
                          key={modId}
                          onClick={() => {
                            setActiveTab("module");
                            setSelectedModule(modId);
                          }}
                          className={`w-full text-left px-2.5 py-2 rounded-lg text-xs font-medium flex items-center justify-between transition-colors ${
                            isSelected
                              ? "bg-blue-600 text-white shadow-sm font-semibold"
                              : "text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/60"
                          }`}
                        >
                          <span className="truncate">{modDef?.label || modId}</span>
                          <span
                            className={`h-2 w-2 rounded-full shrink-0 ${
                              isModActive
                                ? isSelected
                                  ? "bg-emerald-300"
                                  : "bg-emerald-500"
                                : isSelected
                                ? "bg-slate-400"
                                : "bg-slate-300 dark:bg-slate-700"
                            }`}
                          />
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Column B: Center Configuration (6 cols) */}
          <div className="md:col-span-6 bg-slate-50/50 dark:bg-slate-950 p-6 overflow-y-auto space-y-6">
            {activeTab === "module" && (
              <div className="space-y-6">
                {/* Module Header Card */}
                <div className="p-4 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                        {currentModDef.label}
                      </h3>
                      <Badge variant="outline" className="text-[10px] uppercase">
                        {currentModDef.sectionId.replace("section_", "")}
                      </Badge>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {currentModDef.description}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                      Module Access
                    </span>
                    <Switch
                      checked={Boolean(currentModPerm.access)}
                      onCheckedChange={(val) => handleModuleAccessToggle(selectedModule, val)}
                      disabled={isOwner}
                    />
                  </div>
                </div>

                {/* Core Actions Grid */}
                <div className="p-4 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
                  <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                    Core Operational Actions
                  </h4>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {[
                      { key: "can_view", label: "View / Inspect" },
                      { key: "can_create", label: "Create Record" },
                      { key: "can_edit", label: "Edit / Update" },
                      { key: "can_delete", label: "Delete / Trash" },
                      { key: "can_print", label: "Print Receipt / Invoice" },
                      { key: "can_export", label: "Export Excel / CSV" },
                    ].map(({ key, label }) => {
                      const isEnabled = Boolean((currentModPerm as any)[key]);
                      return (
                        <div
                          key={key}
                          className={`p-3 rounded-lg border text-xs flex items-center justify-between transition-colors ${
                            !currentModPerm.access
                              ? "opacity-40 bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800"
                              : isEnabled
                              ? "bg-blue-50/50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-900"
                              : "bg-slate-50/50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700"
                          }`}
                        >
                          <span className="font-medium text-slate-800 dark:text-slate-200">{label}</span>
                          <Switch
                            checked={isEnabled}
                            onCheckedChange={(val) =>
                              handleActionToggle(selectedModule, key as any, val)
                            }
                            disabled={isOwner || !currentModPerm.access}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Protected & Sensitive Actions */}
                {modProtectedActions.length > 0 && (
                  <div className="p-4 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
                    <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                      <Lock className="w-3.5 h-3.5 text-amber-500" />
                      Sensitive & Protected Actions
                    </h4>

                    <div className="space-y-2.5">
                      {modProtectedActions.map((pa) => {
                        const isActionActive = Boolean(currentModPerm.protected_actions?.[pa.key]);
                        return (
                          <div
                            key={pa.key}
                            className={`p-3 rounded-lg border text-xs flex items-center justify-between gap-3 ${
                              isActionActive
                                ? "bg-amber-50/50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900"
                                : "bg-slate-50/40 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700"
                            }`}
                          >
                            <div className="space-y-0.5">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-slate-900 dark:text-slate-100">
                                  {pa.label}
                                </span>
                                <Badge
                                  variant="outline"
                                  className={`text-[9px] uppercase ${
                                    pa.riskLevel === "ADMIN_ONLY"
                                      ? "text-rose-600 border-rose-200"
                                      : pa.riskLevel === "FINANCIAL"
                                      ? "text-purple-600 border-purple-200"
                                      : "text-amber-600 border-amber-200"
                                  }`}
                                >
                                  {pa.riskLevel}
                                </Badge>
                              </div>
                              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                                {pa.description}
                              </p>
                            </div>

                            <Switch
                              checked={isActionActive}
                              onCheckedChange={(val) =>
                                handleProtectedActionToggle(selectedModule, pa.key, val)
                              }
                              disabled={isOwner || (!currentModPerm.access && !isActionActive)}
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* TAB: Data Access Scope & Expiry */}
            {activeTab === "scope" && (
              <div className="space-y-6">
                <div className="p-4 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                    <Building className="w-4 h-4 text-blue-600" />
                    Data Access Scope
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Controls the boundary of records this staff member can query in customers, job cards, and invoices.
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                    {DATA_ACCESS_SCOPES.map((scope) => (
                      <div
                        key={scope.value}
                        onClick={() => !isOwner && setDataScope(scope.value)}
                        className={`p-3.5 rounded-xl border text-xs cursor-pointer transition-all ${
                          dataScope === scope.value
                            ? "bg-blue-50/60 dark:bg-blue-950/40 border-blue-500 text-blue-950 dark:text-blue-200 shadow-sm"
                            : "bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-slate-300"
                        }`}
                      >
                        <div className="flex items-center justify-between font-bold mb-1">
                          <span>{scope.label}</span>
                          {dataScope === scope.value && (
                            <Check className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                          )}
                        </div>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                          {scope.description}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="p-4 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-purple-600" />
                    Temporary Access Window
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Define an optional validity window. When the expiry date is reached, access is automatically blocked while maintaining complete audit logs.
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                        Access Starts On:
                      </label>
                      <Input
                        type="date"
                        value={accessStartDate}
                        onChange={(e) => setAccessStartDate(e.target.value)}
                        disabled={isOwner}
                        className="text-xs h-8"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                        Access Expires On:
                      </label>
                      <Input
                        type="date"
                        value={accessExpiryDate}
                        onChange={(e) => setAccessExpiryDate(e.target.value)}
                        disabled={isOwner}
                        className="text-xs h-8"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB: Financial Visibility */}
            {activeTab === "financial" && (
              <div className="space-y-4">
                <div className="p-4 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-1">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                    <DollarSign className="w-4 h-4 text-amber-600" />
                    Financial Data Visibility Controls
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Select exactly which financial metrics, margins, and bank accounts this user is authorized to inspect.
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-2.5">
                  {FINANCIAL_VISIBILITY_FIELDS.map((f) => {
                    const isAllowed = Boolean(financialVisibility[f.key]);
                    return (
                      <div
                        key={f.key}
                        className={`p-3.5 rounded-xl border text-xs flex items-center justify-between gap-3 ${
                          isAllowed
                            ? "bg-amber-50/40 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900"
                            : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800"
                        }`}
                      >
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-900 dark:text-slate-100">
                              {f.label}
                            </span>
                            <Badge variant="outline" className="text-[9px] uppercase">
                              {f.risk}
                            </Badge>
                          </div>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400">
                            {f.description}
                          </p>
                        </div>

                        <Switch
                          checked={isAllowed}
                          onCheckedChange={(val) =>
                            setFinancialVisibility((prev) => ({ ...prev, [f.key]: val }))
                          }
                          disabled={isOwner}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* TAB: Transaction Approval Limits */}
            {activeTab === "limits" && (
              <div className="space-y-4">
                <div className="p-4 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-1">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                    <KeyRound className="w-4 h-4 text-purple-600" />
                    Transaction Approval Limits
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Transactions exceeding these thresholds are automatically routed to the Owner for pending review.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="p-4 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1.5">
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                      Expense Approval Limit (AED)
                    </label>
                    <Input
                      type="number"
                      value={approvalLimits.expense_approval_limit}
                      onChange={(e) =>
                        setApprovalLimits((prev) => ({
                          ...prev,
                          expense_approval_limit: Number(e.target.value) || 0,
                        }))
                      }
                      disabled={isOwner}
                      className="text-xs h-8"
                    />
                    <p className="text-[10px] text-slate-400">Expenses above this require Owner signoff</p>
                  </div>

                  <div className="p-4 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1.5">
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                      Money Transfer Limit (AED)
                    </label>
                    <Input
                      type="number"
                      value={approvalLimits.transfer_money_limit}
                      onChange={(e) =>
                        setApprovalLimits((prev) => ({
                          ...prev,
                          transfer_money_limit: Number(e.target.value) || 0,
                        }))
                      }
                      disabled={isOwner}
                      className="text-xs h-8"
                    />
                    <p className="text-[10px] text-slate-400">Inter-bank & cash transfers threshold</p>
                  </div>

                  <div className="p-4 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1.5">
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                      Max Discount Authorized (%)
                    </label>
                    <Input
                      type="number"
                      value={approvalLimits.discount_limit_percentage}
                      onChange={(e) =>
                        setApprovalLimits((prev) => ({
                          ...prev,
                          discount_limit_percentage: Number(e.target.value) || 0,
                        }))
                      }
                      disabled={isOwner}
                      className="text-xs h-8"
                    />
                    <p className="text-[10px] text-slate-400">Discounts above this require Owner approval</p>
                  </div>

                  <div className="p-4 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1.5">
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                      Manual Stock Adjustment Limit (Units)
                    </label>
                    <Input
                      type="number"
                      value={approvalLimits.manual_stock_adjustment_max_units}
                      onChange={(e) =>
                        setApprovalLimits((prev) => ({
                          ...prev,
                          manual_stock_adjustment_max_units: Number(e.target.value) || 0,
                        }))
                      }
                      disabled={isOwner}
                      className="text-xs h-8"
                    />
                    <p className="text-[10px] text-slate-400">Max spare parts variance allowed without PO</p>
                  </div>
                </div>

                <div className="p-4 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center justify-between">
                  <div className="space-y-0.5">
                    <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
                      Invoice Voiding Authorized
                    </span>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Allow this staff member to directly cancel posted VAT invoices without approval.
                    </p>
                  </div>
                  <Switch
                    checked={Boolean(approvalLimits.can_void_invoice)}
                    onCheckedChange={(val) =>
                      setApprovalLimits((prev) => ({ ...prev, can_void_invoice: val }))
                    }
                    disabled={isOwner}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Column C: Right Live Summary & Differences (3 cols) */}
          <div className="md:col-span-3 border-l border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 overflow-y-auto space-y-5">
            <div>
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                Live Access Summary
              </h4>

              <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2 text-xs">
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">Role:</span>
                  <span className="font-bold text-slate-900 dark:text-slate-100 uppercase">
                    {targetUser.role}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">Modules:</span>
                  <span className="font-bold text-blue-600">
                    {metrics.enabledModules} / {metrics.totalModules}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">Read Actions:</span>
                  <span className="font-semibold text-slate-700 dark:text-slate-300">
                    {metrics.readActions}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">Create Actions:</span>
                  <span className="font-semibold text-slate-700 dark:text-slate-300">
                    {metrics.createActions}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">Delete Actions:</span>
                  <span className="font-semibold text-slate-700 dark:text-slate-300">
                    {metrics.deleteActions}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">Financial Actions:</span>
                  <span className="font-semibold text-amber-600">
                    {metrics.financialActionCount}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">Data Scope:</span>
                  <span className="font-bold text-purple-600 capitalize">{dataScope}</span>
                </div>
              </div>
            </div>

            {/* Template Deviations / Overrides */}
            <div>
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                Template Comparison
              </h4>
              {deviations.length === 0 ? (
                <div className="p-3 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-xl text-xs text-emerald-800 dark:text-emerald-300 flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Matches Standard {targetUser.role.toUpperCase()} Template</span>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-amber-600 font-bold">{deviations.length} Custom Overrides</span>
                    <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-300">
                      Modified
                    </Badge>
                  </div>
                  <div className="max-h-40 overflow-y-auto space-y-1 p-2 bg-amber-50/40 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 rounded-lg text-[11px] text-slate-700 dark:text-slate-300">
                    {deviations.map((d, i) => (
                      <div key={i} className="flex items-start gap-1">
                        <span className="text-amber-600 shrink-0">&bull;</span>
                        <span className="leading-tight">{d}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Reason for change */}
            <div className="space-y-1.5 pt-1">
              <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300">
                Audit Reason (Optional):
              </label>
              <Input
                placeholder="e.g. Approved temporary accountant promotion..."
                value={changeReason}
                onChange={(e) => setChangeReason(e.target.value)}
                disabled={isOwner}
                className="text-xs h-8"
              />
            </div>
          </div>
        </div>

        {/* ─── 4. Footer ──────────────────────────────────────────────────── */}
        <DialogFooter className="px-6 py-3 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0">
          <div className="text-xs text-slate-400">
            All modifications are recorded permanently in the Workspace Security Audit Log.
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onClose}
              disabled={saving}
              className="rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-semibold h-10 px-4 shadow-2xs transition-colors text-xs"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={saving || isOwner}
              className="bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl shadow-2xs h-10 px-4 transition-colors text-xs gap-1.5"
            >
              {saving ? "Applying Changes..." : "Save Delegated Access"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
