"use client";

import React, { useState } from "react";
import { ALL_APP_MODULES, STAFF_USER_ROLES, getDefaultPermissionsForRole, getAllPermissionsEnabled, getEmptyPermissions, getViewOnlyPermissions } from "@/lib/constants";
import type { AppModule, UserModulePermission, UserRole } from "@/types/database";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  LayoutDashboard,
  Users,
  ClipboardList,
  Wrench,
  Cog,
  Package,
  Truck,
  ShoppingCart,
  FileText,
  CreditCard,
  Receipt,
  BookOpen,
  BarChart3,
  Trash2,
  Settings,
  Shield,
  Check,
  X,
  Lock,
  Copy,
  RotateCcw,
  Eye,
  ShieldAlert,
  Sliders,
  DollarSign,
  Info,
} from "lucide-react";

const MODULE_ICONS: Record<AppModule, React.ElementType> = {
  dashboard: LayoutDashboard,
  customers: Users,
  job_cards: ClipboardList,
  services: Wrench,
  spare_parts: Cog,
  inventory: Package,
  suppliers: Truck,
  purchases: ShoppingCart,
  invoices: FileText,
  payments: CreditCard,
  expenses: Receipt,
  accounts: BookOpen,
  reports: BarChart3,
  recycle_bin: Trash2,
  settings: Settings,
  user_access: Shield,
};

interface PermissionsMatrixProps {
  permissions: Record<AppModule, UserModulePermission>;
  onChange?: (updated: Record<AppModule, UserModulePermission>) => void;
  readOnly?: boolean;
  baseRole?: UserRole;
  showBulkControls?: boolean;
}

export function PermissionsMatrix({
  permissions,
  onChange,
  readOnly = false,
  baseRole,
  showBulkControls = true,
}: PermissionsMatrixProps) {
  const [selectedRoleCopy, setSelectedRoleCopy] = useState<UserRole | "">("");

  const updateModule = (modId: AppModule, field: keyof UserModulePermission, value: boolean) => {
    if (readOnly || !onChange) return;
    const current = permissions[modId] || {
      module: modId,
      access: false,
      can_view: false,
      can_create: false,
      can_edit: false,
      can_delete: false,
      can_print: false,
      can_export: false,
    };

    const updatedModule = { ...current, [field]: value };

    // If access is turned OFF, keep other flags or reset
    if (field === "access" && !value) {
      // access turned off
    } else if (field === "access" && value) {
      // access turned ON, ensure view is ON by default
      if (!updatedModule.can_view) updatedModule.can_view = true;
    }

    // If any granular action is turned ON, ensure access is ON
    if (field !== "access" && value && !updatedModule.access) {
      updatedModule.access = true;
    }

    onChange({
      ...permissions,
      [modId]: updatedModule,
    });
  };

  const handleSelectAll = () => {
    if (readOnly || !onChange) return;
    onChange(getAllPermissionsEnabled());
  };

  const handleClearAll = () => {
    if (readOnly || !onChange) return;
    onChange(getEmptyPermissions());
  };

  const handleViewOnly = () => {
    if (readOnly || !onChange) return;
    // Enable View on currently active modules or all
    const activeMods = ALL_APP_MODULES.filter((m) => permissions[m.id]?.access).map((m) => m.id);
    onChange(getViewOnlyPermissions(activeMods.length > 0 ? activeMods : undefined));
  };

  const handleCopyFromRole = (role: UserRole) => {
    if (readOnly || !onChange) return;
    onChange(getDefaultPermissionsForRole(role));
    setSelectedRoleCopy("");
  };

  return (
    <div className="space-y-4">
      {/* Top Presets / Bulk Toolbar */}
      {showBulkControls && !readOnly && (
        <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-muted/40 rounded-[10px] border border-border">
          <div className="flex items-center gap-1.5 text-caption text-muted-foreground font-semibold">
            <Sliders className="w-4 h-4 text-primary" />
            <span>Permission Presets:</span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleSelectAll}
              className="h-8 text-xs px-2.5 bg-card border-border hover:bg-muted/50 text-foreground rounded-lg shadow-xs"
            >
              <Check className="w-3.5 h-3.5 mr-1 text-emerald-600" />
              Select All
            </Button>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleClearAll}
              className="h-8 text-xs px-2.5 bg-card border-border hover:bg-muted/50 text-foreground rounded-lg shadow-xs"
            >
              <X className="w-3.5 h-3.5 mr-1 text-red-600" />
              Clear All
            </Button>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleViewOnly}
              className="h-8 text-xs px-2.5 bg-card border-border hover:bg-muted/50 text-foreground rounded-lg shadow-xs"
            >
              <Eye className="w-3.5 h-3.5 mr-1 text-amber-600" />
              View Only
            </Button>

            {/* Copy from role selector */}
            <div className="flex items-center gap-1">
              <select
                aria-label="Copy permissions from role template"
                value={selectedRoleCopy}
                onChange={(e) => {
                  if (e.target.value) handleCopyFromRole(e.target.value as UserRole);
                }}
                className="h-8 text-xs px-2.5 py-0 bg-card border border-border rounded-lg text-foreground font-medium focus:outline-none focus:ring-2 focus:ring-primary/40"
              >
                <option value="">Copy From Role Template...</option>
                {STAFF_USER_ROLES.map((r) => (
                  <option key={r.value} value={r.value}>
                    Template: {r.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Permission Matrix Grid */}
      <div className="border border-border rounded-[10px] overflow-hidden bg-card shadow-xs">
        <div className="overflow-x-auto max-h-[580px] overflow-y-auto">
          <table className="w-full text-left text-table border-collapse">
            <thead className="bg-muted/70 sticky top-0 z-10 text-foreground font-semibold border-b border-border text-table-head shadow-xs">
              <tr>
                <th className="px-4 py-3 min-w-[200px]">Software Module</th>
                <th className="px-3 py-3 text-center w-24">Module Access</th>
                <th className="px-3 py-3 text-center w-16">View</th>
                <th className="px-3 py-3 text-center w-16">Create</th>
                <th className="px-3 py-3 text-center w-16">Edit</th>
                <th className="px-3 py-3 text-center w-16">Delete</th>
                <th className="px-3 py-3 text-center w-16">Print</th>
                <th className="px-3 py-3 text-center w-16">Export</th>
                <th className="px-4 py-3 min-w-[220px]">Protected Financial / Action Controls</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {ALL_APP_MODULES.map((mod) => {
                const IconComponent = MODULE_ICONS[mod.id] || LayoutDashboard;
                const p = permissions[mod.id] || {
                  module: mod.id,
                  access: false,
                  can_view: false,
                  can_create: false,
                  can_edit: false,
                  can_delete: false,
                  can_print: false,
                  can_export: false,
                };

                const isAccessOn = Boolean(p.access);

                return (
                  <tr
                    key={mod.id}
                    className={`h-12 transition-colors duration-150 border-b border-border/50 ${
                      isAccessOn
                        ? "bg-card hover:bg-muted/30"
                        : "bg-muted/10 text-muted-foreground/60"
                    }`}
                  >
                    {/* Module info */}
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2.5">
                        <div
                          className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                            isAccessOn
                              ? mod.isFinancial
                                ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                                : "bg-primary/10 text-primary"
                              : "bg-muted text-muted-foreground"
                          }`}
                        >
                          <IconComponent className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="font-semibold text-foreground flex items-center gap-1.5">
                            {mod.label}
                            {mod.isFinancial && (
                              <span className="text-[10px] font-semibold text-amber-700 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded-[6px]">
                                Financial
                              </span>
                            )}
                            {mod.id === "user_access" && (
                              <span className="text-[10px] font-semibold text-red-700 bg-red-500/10 border border-red-500/20 px-1.5 py-0.5 rounded-[6px] flex items-center gap-0.5">
                                <Lock className="w-2.5 h-2.5" /> High Privilege
                              </span>
                            )}
                          </div>
                          <div className="text-caption text-muted-foreground truncate max-w-xs">
                            {mod.description}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Main Access ON/OFF */}
                    <td className="px-3 py-2.5 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <Switch
                          checked={isAccessOn}
                          disabled={readOnly}
                          onCheckedChange={(val) => updateModule(mod.id, "access", val)}
                        />
                        <span
                          className={`text-[11px] font-semibold uppercase tracking-wider ${
                            isAccessOn ? "text-primary" : "text-muted-foreground"
                          }`}
                        >
                          {isAccessOn ? "ON" : "OFF"}
                        </span>
                      </div>
                    </td>

                    {/* Granular: View */}
                    <td className="px-3 py-3 text-center">
                      <input
                        type="checkbox"
                        aria-label={`View ${mod.label}`}
                        checked={isAccessOn && Boolean(p.can_view)}
                        disabled={readOnly || !isAccessOn}
                        onChange={(e) => updateModule(mod.id, "can_view", e.target.checked)}
                        className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer disabled:opacity-40 w-4 h-4"
                      />
                    </td>

                    {/* Granular: Create */}
                    <td className="px-3 py-3 text-center">
                      <input
                        type="checkbox"
                        aria-label={`Create ${mod.label}`}
                        checked={isAccessOn && Boolean(p.can_create)}
                        disabled={readOnly || !isAccessOn}
                        onChange={(e) => updateModule(mod.id, "can_create", e.target.checked)}
                        className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer disabled:opacity-40 w-4 h-4"
                      />
                    </td>

                    {/* Granular: Edit */}
                    <td className="px-3 py-3 text-center">
                      <input
                        type="checkbox"
                        aria-label={`Edit ${mod.label}`}
                        checked={isAccessOn && Boolean(p.can_edit)}
                        disabled={readOnly || !isAccessOn}
                        onChange={(e) => updateModule(mod.id, "can_edit", e.target.checked)}
                        className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer disabled:opacity-40 w-4 h-4"
                      />
                    </td>

                    {/* Granular: Delete */}
                    <td className="px-3 py-3 text-center">
                      <input
                        type="checkbox"
                        aria-label={`Delete ${mod.label}`}
                        checked={isAccessOn && Boolean(p.can_delete)}
                        disabled={readOnly || !isAccessOn}
                        onChange={(e) => updateModule(mod.id, "can_delete", e.target.checked)}
                        className="rounded border-red-300 text-red-600 focus:ring-red-500 cursor-pointer disabled:opacity-40 w-4 h-4"
                      />
                    </td>

                    {/* Granular: Print */}
                    <td className="px-3 py-3 text-center">
                      <input
                        type="checkbox"
                        aria-label={`Print ${mod.label}`}
                        checked={isAccessOn && Boolean(p.can_print)}
                        disabled={readOnly || !isAccessOn}
                        onChange={(e) => updateModule(mod.id, "can_print", e.target.checked)}
                        className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer disabled:opacity-40 w-4 h-4"
                      />
                    </td>

                    {/* Granular: Export */}
                    <td className="px-3 py-3 text-center">
                      <input
                        type="checkbox"
                        aria-label={`Export ${mod.label}`}
                        checked={isAccessOn && Boolean(p.can_export)}
                        disabled={readOnly || !isAccessOn}
                        onChange={(e) => updateModule(mod.id, "can_export", e.target.checked)}
                        className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer disabled:opacity-40 w-4 h-4"
                      />
                    </td>

                    {/* Special Module-Specific / Financial Controls */}
                    <td className="px-4 py-2.5">
                      {mod.id === "accounts" && (
                        <div className="space-y-1.5 py-1">
                          <label className="flex items-center gap-1.5 cursor-pointer text-[11px]">
                            <input
                              type="checkbox"
                              checked={isAccessOn && Boolean(p.can_view_bank_balance)}
                              disabled={readOnly || !isAccessOn}
                              onChange={(e) => updateModule(mod.id, "can_view_bank_balance", e.target.checked)}
                              className="rounded border-slate-300 text-blue-600 w-3.5 h-3.5"
                            />
                            <span>View Bank Balances</span>
                          </label>

                          <label className="flex items-center gap-1.5 cursor-pointer text-[11px]">
                            <input
                              type="checkbox"
                              checked={isAccessOn && Boolean(p.can_transfer)}
                              disabled={readOnly || !isAccessOn}
                              onChange={(e) => updateModule(mod.id, "can_transfer", e.target.checked)}
                              className="rounded border-amber-400 text-amber-600 w-3.5 h-3.5"
                            />
                            <span className="font-semibold text-amber-700 dark:text-amber-400 flex items-center gap-1">
                              Transfer Money
                              <span className="text-[9px] px-1 bg-amber-100 text-amber-800 rounded font-normal">Owner Only Default</span>
                            </span>
                          </label>

                          <label className="flex items-center gap-1.5 cursor-pointer text-[11px]">
                            <input
                              type="checkbox"
                              checked={isAccessOn && Boolean(p.can_journal)}
                              disabled={readOnly || !isAccessOn}
                              onChange={(e) => updateModule(mod.id, "can_journal", e.target.checked)}
                              className="rounded border-amber-400 text-amber-600 w-3.5 h-3.5"
                            />
                            <span>Manual Journal Entry</span>
                          </label>

                          <label className="flex items-center gap-1.5 cursor-pointer text-[11px]">
                            <input
                              type="checkbox"
                              checked={isAccessOn && Boolean(p.can_reverse)}
                              disabled={readOnly || !isAccessOn}
                              onChange={(e) => updateModule(mod.id, "can_reverse", e.target.checked)}
                              className="rounded border-red-400 text-red-600 w-3.5 h-3.5"
                            />
                            <span className="font-semibold text-red-700 dark:text-red-400 flex items-center gap-1">
                              Reverse Transactions
                              <span className="text-[9px] px-1 bg-red-100 text-red-800 rounded font-normal">Owner Only Default</span>
                            </span>
                          </label>
                        </div>
                      )}

                      {mod.id === "invoices" && (
                        <div className="space-y-1.5 py-1">
                          <label className="flex items-center gap-1.5 cursor-pointer text-[11px]">
                            <input
                              type="checkbox"
                              checked={isAccessOn && Boolean(p.can_record_payment)}
                              disabled={readOnly || !isAccessOn}
                              onChange={(e) => updateModule(mod.id, "can_record_payment", e.target.checked)}
                              className="rounded border-slate-300 text-blue-600 w-3.5 h-3.5"
                            />
                            <span>Record Payment on Invoices</span>
                          </label>
                          <label className="flex items-center gap-1.5 cursor-pointer text-[11px]">
                            <input
                              type="checkbox"
                              checked={isAccessOn && Boolean(p.can_void)}
                              disabled={readOnly || !isAccessOn}
                              onChange={(e) => updateModule(mod.id, "can_void", e.target.checked)}
                              className="rounded border-red-300 text-red-600 w-3.5 h-3.5"
                            />
                            <span className="text-red-700 dark:text-red-400 font-medium">Void Invoices</span>
                          </label>
                        </div>
                      )}

                      {mod.id === "purchases" && (
                        <div className="py-1">
                          <label className="flex items-center gap-1.5 cursor-pointer text-[11px]">
                            <input
                              type="checkbox"
                              checked={isAccessOn && Boolean(p.can_finalize)}
                              disabled={readOnly || !isAccessOn}
                              onChange={(e) => updateModule(mod.id, "can_finalize", e.target.checked)}
                              className="rounded border-slate-300 text-blue-600 w-3.5 h-3.5"
                            />
                            <span>Finalize Purchase Orders &amp; Stock Receiving</span>
                          </label>
                        </div>
                      )}

                      {mod.id === "payments" && (
                        <div className="py-1">
                          <label className="flex items-center gap-1.5 cursor-pointer text-[11px]">
                            <input
                              type="checkbox"
                              checked={isAccessOn && Boolean(p.can_reverse)}
                              disabled={readOnly || !isAccessOn}
                              onChange={(e) => updateModule(mod.id, "can_reverse", e.target.checked)}
                              className="rounded border-red-300 text-red-600 w-3.5 h-3.5"
                            />
                            <span className="text-red-700 dark:text-red-400 font-medium">Reverse Received Payments</span>
                          </label>
                        </div>
                      )}

                      {mod.id !== "accounts" && mod.id !== "invoices" && mod.id !== "purchases" && mod.id !== "payments" && (
                        <span className="text-[11px] text-slate-400 italic">Standard CRUD permissions</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
