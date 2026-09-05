"use client";

import React, { useState } from "react";
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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  STAFF_USER_ROLES,
  ALL_APP_MODULES,
  MODULE_SECTIONS,
  PROTECTED_ACTIONS,
  DATA_ACCESS_SCOPES,
  FINANCIAL_VISIBILITY_FIELDS,
  getDefaultPermissionsForRole,
  getDefaultDataScope,
  getDefaultFinancialVisibility,
  getDefaultApprovalLimits,
  sanitizePermissionDependencies,
} from "@/lib/constants";
import { createUser, sendStaffInvitation } from "@/lib/services/user-service";
import { useWorkspace } from "@/lib/context/workspace-context";
import type {
  User,
  UserRole,
  UserStatus,
  AppModule,
  UserModulePermission,
  DataAccessScope,
  FinancialVisibilitySettings,
  UserApprovalLimits,
} from "@/types/database";
import {
  UserPlus,
  Mail,
  ShieldCheck,
  ShieldAlert,
  ArrowRight,
  ArrowLeft,
  Check,
  Lock,
  Calendar,
  AlertTriangle,
  Building,
  DollarSign,
  KeyRound,
  FileCheck,
  Send,
  User as UserIcon,
} from "lucide-react";

interface InviteStaffModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUserInvited: (newUser: User) => void;
  currentOperator: { id: string; name: string };
}

type WizardStep = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

const WIZARD_STEPS = [
  { step: 1, title: "Identity", short: "User Details" },
  { step: 2, title: "Role", short: "Assign Role" },
  { step: 3, title: "Modules", short: "Select Modules" },
  { step: 4, title: "Permissions", short: "Actions & CRUD" },
  { step: 5, title: "Data Scope", short: "Access Scope" },
  { step: 6, title: "Financial", short: "Financial Data" },
  { step: 7, title: "Limits", short: "Approval Limits" },
  { step: 8, title: "Review", short: "Review & Send" },
] as const;

export function InviteStaffModal({
  isOpen,
  onClose,
  onUserInvited,
  currentOperator,
}: InviteStaffModalProps) {
  const { currentWorkspace } = useWorkspace();
  const [currentStep, setCurrentStep] = useState<WizardStep>(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Step 1: User Details
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [phone, setPhone] = useState("");
  const [accessExpiryDate, setAccessExpiryDate] = useState("");

  // Step 2: Role
  const [role, setRole] = useState<UserRole>("manager");

  // Step 3 & 4: Modules & Permissions
  const [permissions, setPermissions] = useState<Record<AppModule, UserModulePermission>>(() =>
    getDefaultPermissionsForRole("manager")
  );

  // Step 5: Data Scope
  const [dataScope, setDataScope] = useState<DataAccessScope>("all");

  // Step 6: Financial Visibility
  const [financialVisibility, setFinancialVisibility] = useState<FinancialVisibilitySettings>(() =>
    getDefaultFinancialVisibility("manager")
  );

  // Step 7: Approval Limits
  const [approvalLimits, setApprovalLimits] = useState<UserApprovalLimits>(() =>
    getDefaultApprovalLimits("manager")
  );

  // Delivery Method
  const [deliveryMethod, setDeliveryMethod] = useState<"invite_link" | "password">("invite_link");
  const [temporaryPassword, setTemporaryPassword] = useState("");

  // Handle Role Change -> auto-populate templates
  const handleRoleChange = (newRole: UserRole) => {
    setRole(newRole);
    setPermissions(getDefaultPermissionsForRole(newRole));
    setDataScope(getDefaultDataScope(newRole));
    setFinancialVisibility(getDefaultFinancialVisibility(newRole));
    setApprovalLimits(getDefaultApprovalLimits(newRole));
  };

  const handleModuleToggle = (mod: AppModule, value: boolean) => {
    setPermissions((prev) => {
      const current = prev[mod] || {
        module: mod,
        access: false,
        can_view: false,
        can_create: false,
        can_edit: false,
        can_delete: false,
        can_print: false,
        can_export: false,
      };

      const updated = value
        ? { ...current, access: true, can_view: true }
        : {
            ...current,
            access: false,
            can_view: false,
            can_create: false,
            can_edit: false,
            can_delete: false,
            can_print: false,
            can_export: false,
          };

      return {
        ...prev,
        [mod]: sanitizePermissionDependencies(updated),
      };
    });
  };

  const handleActionToggle = (
    mod: AppModule,
    action: keyof Omit<UserModulePermission, "id" | "user_id" | "module" | "protected_actions">,
    value: boolean
  ) => {
    setPermissions((prev) => {
      const current = prev[mod] || {
        module: mod,
        access: false,
        can_view: false,
        can_create: false,
        can_edit: false,
        can_delete: false,
        can_print: false,
        can_export: false,
      };
      const updated = { ...current, [action]: value };
      return {
        ...prev,
        [mod]: sanitizePermissionDependencies(updated),
      };
    });
  };

  const handleNext = () => {
    setError(null);
    if (currentStep === 1) {
      if (!fullName.trim()) {
        setError("Please enter the user's full name.");
        return;
      }
      if (!email.trim() || !email.includes("@")) {
        setError("Please provide a valid corporate or operational email address.");
        return;
      }
    }
    setCurrentStep((prev) => Math.min(prev + 1, 8) as WizardStep);
  };

  const handleBack = () => {
    setError(null);
    setCurrentStep((prev) => Math.max(prev - 1, 1) as WizardStep);
  };

  const handleCompleteInvitation = async () => {
    setLoading(true);
    setError(null);

    try {
      const userPayload = {
        email: email.trim().toLowerCase(),
        full_name: fullName.trim(),
        role,
        job_title: jobTitle.trim() || undefined,
        phone: phone.trim() || undefined,
        status: "invited" as UserStatus,
        data_scope: dataScope,
        financial_visibility: financialVisibility,
        approval_limits: approvalLimits,
        access_expiry_date: accessExpiryDate ? new Date(accessExpiryDate).toISOString() : null,
        workspace_id: currentWorkspace?.id,
      };

      const result = await createUser(userPayload, permissions, currentOperator);
      if (!result.success || !result.user) {
        setError(result.error || "Failed to create staff account.");
        setLoading(false);
        return;
      }

      await sendStaffInvitation(result.user, deliveryMethod, temporaryPassword || undefined);
      onUserInvited(result.user);
      onClose();
    } catch (err: any) {
      setError(err?.message || "An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  };

  const enabledModulesCount = Object.values(permissions).filter((p) => p.access).length;
  const sensitiveCount = Object.values(permissions).filter(
    (p) => p.can_void || p.can_journal || p.can_reverse
  ).length;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl w-[95vw] h-[85vh] p-0 flex flex-col bg-card border border-border shadow-md overflow-hidden rounded-[10px]">
        {/* ─── Header & Progress Bar ─────────────────────────────────────── */}
        <DialogHeader className="px-6 py-4 bg-card border-b border-border shrink-0">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center border border-primary/20">
                <UserPlus className="h-4 w-4" />
              </div>
              <div>
                <DialogTitle className="text-section text-foreground font-semibold">
                  Invite & Provision Staff User
                </DialogTitle>
                <DialogDescription className="text-caption text-muted-foreground">
                  Step {currentStep} of 8: {WIZARD_STEPS[currentStep - 1].short}
                </DialogDescription>
              </div>
            </div>

            <Badge variant="outline" className="text-[11px] font-semibold rounded-[6px] bg-muted/50 border-border">
              {currentWorkspace?.name || "ATIQ JEHAN"}
            </Badge>
          </div>

          {/* Stepper Dots */}
          <div className="flex items-center gap-1">
            {WIZARD_STEPS.map((s) => (
              <div
                key={s.step}
                className={`h-1 flex-1 rounded-full transition-colors duration-150 ${
                  s.step === currentStep
                    ? "bg-primary"
                    : s.step < currentStep
                    ? "bg-emerald-600"
                    : "bg-muted"
                }`}
              />
            ))}
          </div>
        </DialogHeader>

        {/* ─── Body Area ─────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto p-6">
          {error && (
            <div className="mb-4 p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-lg text-xs text-red-700 dark:text-red-400 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-red-600" />
              <span>{error}</span>
            </div>
          )}

          {/* STEP 1: User Details */}
          {currentStep === 1 && (
            <div className="space-y-4 max-w-xl mx-auto">
              <div className="border-b pb-2">
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  Staff Identity & Contact
                </h3>
                <p className="text-xs text-slate-500">
                  Enter primary identity information for this workshop employee.
                </p>
              </div>

              <div className="space-y-3 text-xs">
                <div className="space-y-1">
                  <Label className="text-xs font-semibold">Full Name *</Label>
                  <Input
                    placeholder="e.g. Ahmed Khan"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="text-xs h-9"
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-semibold">Corporate Email Address *</Label>
                  <Input
                    type="email"
                    placeholder="ahmed@atiqjehan.ae"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="text-xs h-9"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold">Job Title</Label>
                    <Input
                      placeholder="e.g. Service Advisor"
                      value={jobTitle}
                      onChange={(e) => setJobTitle(e.target.value)}
                      className="text-xs h-9"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold">Phone Number</Label>
                    <Input
                      placeholder="+971 50 000 0000"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="text-xs h-9"
                    />
                  </div>
                </div>

                <div className="space-y-1 pt-2">
                  <Label className="text-xs font-semibold">Access Expiry Date (Optional)</Label>
                  <Input
                    type="date"
                    value={accessExpiryDate}
                    onChange={(e) => setAccessExpiryDate(e.target.value)}
                    className="text-xs h-9"
                  />
                  <p className="text-[11px] text-slate-400">Leave blank for permanent permanent access.</p>
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: Role */}
          {currentStep === 2 && (
            <div className="space-y-4 max-w-xl mx-auto">
              <div className="border-b pb-2">
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  Select Role Template
                </h3>
                <p className="text-xs text-slate-500">
                  The role provides baseline defaults for permissions, data scope, and limits.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {STAFF_USER_ROLES.map((r) => (
                  <div
                    key={r.value}
                    onClick={() => handleRoleChange(r.value)}
                    className={`p-3.5 rounded-xl border text-xs cursor-pointer transition-all ${
                      role === r.value
                        ? "bg-blue-50/60 dark:bg-blue-950/40 border-blue-600 text-blue-950 dark:text-blue-200 shadow-sm"
                        : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:border-slate-300"
                    }`}
                  >
                    <div className="flex items-center justify-between font-bold mb-1">
                      <span>{r.label}</span>
                      {role === r.value && <Check className="w-4 h-4 text-blue-600" />}
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                      {r.description}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* STEP 3: Modules */}
          {currentStep === 3 && (
            <div className="space-y-4 max-w-2xl mx-auto">
              <div className="border-b pb-2">
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  Module Authorizations
                </h3>
                <p className="text-xs text-slate-500">
                  Select which workshop modules will appear in the staff member's sidebar.
                </p>
              </div>

              <div className="space-y-4">
                {MODULE_SECTIONS.map((sec) => (
                  <div key={sec.id} className="p-3.5 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                      {sec.shortTitle}
                    </h4>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {sec.modules.map((modId) => {
                        const def = ALL_APP_MODULES.find((m) => m.id === modId);
                        const isAllowed = Boolean(permissions[modId]?.access);
                        return (
                          <div
                            key={modId}
                            onClick={() => handleModuleToggle(modId, !isAllowed)}
                            className={`p-2.5 rounded-lg border text-xs cursor-pointer flex items-center justify-between transition-colors ${
                              isAllowed
                                ? "bg-blue-50/50 dark:bg-blue-950/30 border-blue-300 dark:border-blue-900 font-semibold text-blue-900 dark:text-blue-200"
                                : "bg-slate-50/50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400"
                            }`}
                          >
                            <span className="truncate">{def?.label || modId}</span>
                            <Switch checked={isAllowed} onCheckedChange={(val) => handleModuleToggle(modId, val)} />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* STEP 4: Action Permissions */}
          {currentStep === 4 && (
            <div className="space-y-4 max-w-2xl mx-auto">
              <div className="border-b pb-2">
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  Granular Action Permissions
                </h3>
                <p className="text-xs text-slate-500">
                  Fine-tune View, Create, Edit, Delete, and Print capabilities across enabled modules.
                </p>
              </div>

              <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-1">
                {ALL_APP_MODULES.filter((m) => permissions[m.id]?.access).map((m) => {
                  const perm = permissions[m.id];
                  return (
                    <div key={m.id} className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 text-xs">
                      <div className="font-bold text-slate-800 dark:text-slate-200 mb-2">
                        {m.label}
                      </div>
                      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                        {[
                          { key: "can_view", label: "View" },
                          { key: "can_create", label: "Create" },
                          { key: "can_edit", label: "Edit" },
                          { key: "can_delete", label: "Delete" },
                          { key: "can_print", label: "Print" },
                          { key: "can_export", label: "Export" },
                        ].map(({ key, label }) => (
                          <label key={key} className="flex items-center gap-1.5 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={Boolean((perm as any)[key])}
                              onChange={(e) => handleActionToggle(m.id, key as any, e.target.checked)}
                              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                            />
                            <span>{label}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* STEP 5: Data Scope */}
          {currentStep === 5 && (
            <div className="space-y-4 max-w-xl mx-auto">
              <div className="border-b pb-2">
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  Data Access Scope
                </h3>
                <p className="text-xs text-slate-500">
                  Enforces server-side boundaries on which records this staff user can inspect.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-3">
                {DATA_ACCESS_SCOPES.map((scope) => (
                  <div
                    key={scope.value}
                    onClick={() => setDataScope(scope.value)}
                    className={`p-3.5 rounded-xl border text-xs cursor-pointer transition-all ${
                      dataScope === scope.value
                        ? "bg-blue-50/60 dark:bg-blue-950/40 border-blue-600 text-blue-950 dark:text-blue-200 shadow-sm"
                        : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:border-slate-300"
                    }`}
                  >
                    <div className="flex items-center justify-between font-bold mb-1">
                      <span>{scope.label}</span>
                      {dataScope === scope.value && <Check className="w-4 h-4 text-blue-600" />}
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      {scope.description}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* STEP 6: Financial Visibility */}
          {currentStep === 6 && (
            <div className="space-y-4 max-w-xl mx-auto">
              <div className="border-b pb-2">
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  Financial Data Visibility Controls
                </h3>
                <p className="text-xs text-slate-500">
                  Select which financial amounts, margins, and accounts this user can view.
                </p>
              </div>

              <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-1">
                {FINANCIAL_VISIBILITY_FIELDS.map((f) => (
                  <div
                    key={f.key}
                    className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 text-xs"
                  >
                    <div>
                      <div className="font-bold text-slate-800 dark:text-slate-200">{f.label}</div>
                      <div className="text-[11px] text-slate-500">{f.description}</div>
                    </div>
                    <Switch
                      checked={Boolean(financialVisibility[f.key])}
                      onCheckedChange={(val) =>
                        setFinancialVisibility((prev) => ({ ...prev, [f.key]: val }))
                      }
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* STEP 7: Limits & Approvals */}
          {currentStep === 7 && (
            <div className="space-y-4 max-w-xl mx-auto">
              <div className="border-b pb-2">
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  Transaction Limits & Approval Thresholds
                </h3>
                <p className="text-xs text-slate-500">
                  Amounts above these limits require explicit Owner approval before posting.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1">
                  <Label className="text-xs font-semibold">Expense Limit (AED)</Label>
                  <Input
                    type="number"
                    value={approvalLimits.expense_approval_limit}
                    onChange={(e) =>
                      setApprovalLimits((prev) => ({
                        ...prev,
                        expense_approval_limit: Number(e.target.value) || 0,
                      }))
                    }
                    className="text-xs h-8"
                  />
                </div>
                <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1">
                  <Label className="text-xs font-semibold">Transfer Limit (AED)</Label>
                  <Input
                    type="number"
                    value={approvalLimits.transfer_money_limit}
                    onChange={(e) =>
                      setApprovalLimits((prev) => ({
                        ...prev,
                        transfer_money_limit: Number(e.target.value) || 0,
                      }))
                    }
                    className="text-xs h-8"
                  />
                </div>
                <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1">
                  <Label className="text-xs font-semibold">Max Discount (%)</Label>
                  <Input
                    type="number"
                    value={approvalLimits.discount_limit_percentage}
                    onChange={(e) =>
                      setApprovalLimits((prev) => ({
                        ...prev,
                        discount_limit_percentage: Number(e.target.value) || 0,
                      }))
                    }
                    className="text-xs h-8"
                  />
                </div>
                <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1">
                  <Label className="text-xs font-semibold">Stock Variance Limit</Label>
                  <Input
                    type="number"
                    value={approvalLimits.manual_stock_adjustment_max_units}
                    onChange={(e) =>
                      setApprovalLimits((prev) => ({
                        ...prev,
                        manual_stock_adjustment_max_units: Number(e.target.value) || 0,
                      }))
                    }
                    className="text-xs h-8"
                  />
                </div>
              </div>

              <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs">
                <span className="font-semibold">Authorize Direct Invoice Voiding</span>
                <Switch
                  checked={Boolean(approvalLimits.can_void_invoice)}
                  onCheckedChange={(val) =>
                    setApprovalLimits((prev) => ({ ...prev, can_void_invoice: val }))
                  }
                />
              </div>
            </div>
          )}

          {/* STEP 8: Review & Send */}
          {currentStep === 8 && (
            <div className="space-y-4 max-w-xl mx-auto">
              <div className="border-b pb-2">
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  Access Review
                </h3>
                <p className="text-xs text-slate-500">
                  Review all delegated permissions and credentials before sending the invitation.
                </p>
              </div>

              <div className="p-4 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3 text-xs">
                <div className="flex justify-between items-center pb-2 border-b">
                  <span className="text-slate-500">User:</span>
                  <span className="font-bold text-slate-900 dark:text-slate-100">{fullName}</span>
                </div>
                <div className="flex justify-between items-center pb-2 border-b">
                  <span className="text-slate-500">Email:</span>
                  <span className="font-medium text-slate-700 dark:text-slate-300">{email}</span>
                </div>
                <div className="flex justify-between items-center pb-2 border-b">
                  <span className="text-slate-500">Role:</span>
                  <span className="font-bold uppercase text-blue-600">{role}</span>
                </div>
                <div className="flex justify-between items-center pb-2 border-b">
                  <span className="text-slate-500">Workspace:</span>
                  <span className="font-medium text-slate-700 dark:text-slate-300">
                    {currentWorkspace?.name || "ATIQ JEHAN AUTO REPAIR"}
                  </span>
                </div>
                <div className="flex justify-between items-center pb-2 border-b">
                  <span className="text-slate-500">Modules:</span>
                  <span className="font-bold text-emerald-600">{enabledModulesCount} Enabled</span>
                </div>
                <div className="flex justify-between items-center pb-2 border-b">
                  <span className="text-slate-500">Data Scope:</span>
                  <span className="font-bold text-purple-600 capitalize">{dataScope}</span>
                </div>
                <div className="flex justify-between items-center pb-2 border-b">
                  <span className="text-slate-500">Transfer Limit:</span>
                  <span className="font-bold">AED {approvalLimits.transfer_money_limit}</span>
                </div>
                <div className="flex justify-between items-center pb-2 border-b">
                  <span className="text-slate-500">Sensitive Permissions:</span>
                  <span className="font-bold text-amber-600">{sensitiveCount}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">Access Expiry:</span>
                  <span className="font-medium">{accessExpiryDate ? accessExpiryDate : "No Expiry"}</span>
                </div>
              </div>

              {/* Delivery method options */}
              <div className="p-3 bg-slate-100/60 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2 text-xs">
                <Label className="font-semibold text-xs">Invitation Delivery Method</Label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="delivery"
                      checked={deliveryMethod === "invite_link"}
                      onChange={() => setDeliveryMethod("invite_link")}
                    />
                    <span>Email Invitation Link</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="delivery"
                      checked={deliveryMethod === "password"}
                      onChange={() => setDeliveryMethod("password")}
                    />
                    <span>Direct Password Setup</span>
                  </label>
                </div>
                {deliveryMethod === "password" && (
                  <div className="pt-1">
                    <Input
                      type="password"
                      placeholder="Set initial temporary password..."
                      value={temporaryPassword}
                      onChange={(e) => setTemporaryPassword(e.target.value)}
                      className="text-xs h-8"
                    />
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ─── Footer Controls ───────────────────────────────────────────── */}
        <DialogFooter className="px-6 py-3 bg-card border-t border-border flex items-center justify-between shrink-0">
          <div>
            {currentStep > 1 && (
              <Button variant="outline" size="sm" onClick={handleBack} disabled={loading} className="gap-1.5 text-xs h-9 rounded-lg border-border">
                <ArrowLeft className="w-3.5 h-3.5" /> Back
              </Button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={onClose} disabled={loading} className="text-xs h-9 rounded-lg">
              Cancel
            </Button>
            {currentStep < 8 ? (
              <Button size="sm" onClick={handleNext} className="bg-primary hover:bg-primary/90 text-primary-foreground gap-1.5 text-xs h-9 rounded-lg shadow-xs">
                Next <ArrowRight className="w-3.5 h-3.5" />
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={handleCompleteInvitation}
                disabled={loading}
                className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 text-xs h-9 rounded-lg shadow-xs"
              >
                <Send className="w-3.5 h-3.5" />
                {loading ? "Sending Invitation..." : "Send Invitation"}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
