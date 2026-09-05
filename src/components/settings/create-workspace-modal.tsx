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
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Building2,
  Mail,
  User,
  Phone,
  Globe,
  Coins,
  MapPin,
  FileSpreadsheet,
  Loader2,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  Sparkles,
  ArrowRight,
  ArrowLeft,
  Copy,
  Check,
  Shield,
  KeyRound,
  DollarSign,
  Crown,
  Briefcase,
  Layers,
  Send,
} from "lucide-react";
import { useWorkspace } from "@/lib/context/workspace-context";
import {
  createWorkspaceInvitation,
  resendWorkspaceInvitation,
} from "@/lib/services/workspace-invitation-service";
import {
  getDefaultPermissionsForRole,
  getDefaultDataScope,
  getDefaultFinancialVisibility,
  getDefaultApprovalLimits,
  PRIMARY_OWNER_EMAIL,
} from "@/lib/constants";
import type {
  Workspace,
  WorkspaceStatus,
  WorkspaceInvitationStatus,
  UserRole,
  AppModule,
  UserModulePermission,
  DataAccessScope,
  FinancialVisibilitySettings,
  UserApprovalLimits,
} from "@/types/database";

const WORKSPACE_MODULES: { id: AppModule; label: string }[] = [
  { id: "dashboard", label: "Dashboard" },
  { id: "customers", label: "Customers" },
  { id: "job_cards", label: "Job Cards" },
  { id: "services", label: "Services" },
  { id: "spare_parts", label: "Spare Parts" },
  { id: "inventory", label: "Inventory" },
  { id: "suppliers", label: "Suppliers" },
  { id: "purchases", label: "Purchases" },
  { id: "invoices", label: "Invoices" },
  { id: "payments", label: "Payments" },
  { id: "expenses", label: "Expenses" },
  { id: "accounts", label: "Accounts / Ledger" },
  { id: "reports", label: "Reports" },
  { id: "recycle_bin", label: "Recycle Bin" },
  { id: "settings", label: "Settings" },
  { id: "user_access", label: "User Access" },
];

interface CreateWorkspaceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated?: (workspace: Workspace) => void;
}

type WizardStep = 1 | 2 | 3 | 4 | 5;

const ROLE_OPTIONS: { role: UserRole; title: string; desc: string; badge: string }[] = [
  {
    role: "owner",
    title: "Workspace Owner",
    desc: "Full administrative authority over this workspace. Cannot alter platform settings.",
    badge: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300",
  },
  {
    role: "admin",
    title: "Admin",
    desc: "Operational administration, staff management, and full workshop oversight.",
    badge: "bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300",
  },
  {
    role: "manager",
    title: "Manager",
    desc: "Customer intake, job card workflow, parts assignment, and invoicing.",
    badge: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  },
  {
    role: "accountant",
    title: "Accountant",
    desc: "Billing, general ledger, expense tracking, bank balances, and VAT audits.",
    badge: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  },
  {
    role: "receptionist",
    title: "Receptionist",
    desc: "Front-desk customer intake, service estimates, and POS payment settlement.",
    badge: "bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300",
  },
  {
    role: "storekeeper",
    title: "Storekeeper",
    desc: "Parts catalog, inventory landed costs, and supplier purchase orders.",
    badge: "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300",
  },
  {
    role: "mechanic",
    title: "Mechanic",
    desc: "Assigned job cards only. Financial margins and costs hidden.",
    badge: "bg-cyan-100 text-cyan-800 dark:bg-cyan-950 dark:text-cyan-300",
  },
  {
    role: "viewer",
    title: "Viewer",
    desc: "Read-only inspection rights without modification privileges.",
    badge: "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300",
  },
  {
    role: "custom",
    title: "Custom Access",
    desc: "Manually configure exact module actions and financial capabilities.",
    badge: "bg-pink-100 text-pink-800 dark:bg-pink-950 dark:text-pink-300",
  },
];

export function CreateWorkspaceModal({ isOpen, onClose, onCreated }: CreateWorkspaceModalProps) {
  const { createWorkspace } = useWorkspace();

  // Wizard Navigation
  const [currentStep, setCurrentStep] = useState<WizardStep>(1);

  // STEP 1: Business Details
  const [name, setName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [country, setCountry] = useState("United Arab Emirates");
  const [currency, setCurrency] = useState("AED");
  const [trn, setTrn] = useState("");
  const [logoUrl, setLogoUrl] = useState("");

  // STEP 2: Assign User & Credentials
  const [assignedFullName, setAssignedFullName] = useState("");
  const [assignedEmail, setAssignedEmail] = useState("");
  const [assignedPhone, setAssignedPhone] = useState("");
  const [assignedJobTitle, setAssignedJobTitle] = useState("");
  const [credentialMethod, setCredentialMethod] = useState<"invite" | "temp_password">("invite");
  const [tempPassword, setTempPassword] = useState("");

  // STEP 3: Access Level (Defaults to Workspace Owner)
  const [selectedRole, setSelectedRole] = useState<UserRole>("owner");

  // STEP 4: Module Access & Permissions
  const [permissions, setPermissions] = useState<Record<AppModule, UserModulePermission>>(() =>
    getDefaultPermissionsForRole("owner")
  );
  const [dataScope, setDataScope] = useState<DataAccessScope>("all");
  const [financialVisibility, setFinancialVisibility] = useState<Partial<FinancialVisibilitySettings>>(
    () => getDefaultFinancialVisibility("owner")
  );
  const [approvalLimits, setApprovalLimits] = useState<Partial<UserApprovalLimits>>(() =>
    getDefaultApprovalLimits("owner")
  );

  // Submission & Results
  const [submitting, setSubmitting] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [failedInvId, setFailedInvId] = useState<string | null>(null);
  const [invitationSuccess, setInvitationSuccess] = useState<{
    workspace: Workspace;
    email: string;
    role: UserRole;
    oneTimeCode: string;
    inviteLink: string;
    status: WorkspaceInvitationStatus;
    alreadyExists?: boolean;
    sentMessage?: string;
    generatedTempPassword?: string;
  } | null>(null);

  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedTempPass, setCopiedTempPass] = useState(false);

  // Update permissions when role changes in Step 3
  const handleRoleSelect = (role: UserRole) => {
    setSelectedRole(role);
    setPermissions(getDefaultPermissionsForRole(role));
    setDataScope(getDefaultDataScope(role));
    setFinancialVisibility(getDefaultFinancialVisibility(role));
    setApprovalLimits(getDefaultApprovalLimits(role));
  };

  const resetAll = () => {
    setCurrentStep(1);
    setName("");
    setBusinessName("");
    setPhone("");
    setAddress("");
    setCountry("United Arab Emirates");
    setCurrency("AED");
    setTrn("");
    setLogoUrl("");
    setAssignedFullName("");
    setAssignedEmail("");
    setAssignedPhone("");
    setAssignedJobTitle("");
    setCredentialMethod("invite");
    setTempPassword("");
    setSelectedRole("owner");
    setPermissions(getDefaultPermissionsForRole("owner"));
    setDataScope("all");
    setFinancialVisibility(getDefaultFinancialVisibility("owner"));
    setApprovalLimits(getDefaultApprovalLimits("owner"));
    setError(null);
    setFailedInvId(null);
    setInvitationSuccess(null);
    setCopiedCode(false);
    setCopiedLink(false);
    setCopiedTempPass(false);
  };

  const handleNext = () => {
    setError(null);
    if (currentStep === 1) {
      if (!name.trim()) {
        setError("Please enter a Workspace / Business Name.");
        return;
      }
      setCurrentStep(2);
    } else if (currentStep === 2) {
      if (!assignedFullName.trim()) {
        setError("Please enter the user's Full Name.");
        return;
      }
      if (!assignedEmail.trim() || !assignedEmail.includes("@")) {
        setError("Please enter a valid work email address.");
        return;
      }
      setCurrentStep(3);
    } else if (currentStep === 3) {
      setCurrentStep(4);
    } else if (currentStep === 4) {
      setCurrentStep(5);
    }
  };

  const handleBack = () => {
    setError(null);
    if (currentStep > 1) {
      setCurrentStep((prev) => (prev - 1) as WizardStep);
    }
  };

  // Toggle Module Master Switch
  const handleModuleAccessToggle = (mod: AppModule, enabled: boolean) => {
    setPermissions((prev) => ({
      ...prev,
      [mod]: {
        ...prev[mod],
        access: enabled,
        can_view: enabled ? prev[mod]?.can_view ?? true : false,
        can_create: enabled ? prev[mod]?.can_create ?? false : false,
        can_edit: enabled ? prev[mod]?.can_edit ?? false : false,
        can_delete: enabled ? prev[mod]?.can_delete ?? false : false,
        can_print: enabled ? prev[mod]?.can_print ?? false : false,
        can_export: enabled ? prev[mod]?.can_export ?? false : false,
      },
    }));
  };

  // Toggle Granular Action
  const handleActionToggle = (
    mod: AppModule,
    action: keyof Omit<UserModulePermission, "module" | "access">,
    enabled: boolean
  ) => {
    setPermissions((prev) => {
      const current = prev[mod] || { module: mod, access: true };
      return {
        ...prev,
        [mod]: {
          ...current,
          access: true,
          [action]: enabled,
        },
      };
    });
  };

  // Retry sending invitation for failed email
  const handleRetryInvitation = async () => {
    if (!failedInvId) return;
    setRetrying(true);
    setError(null);
    try {
      const res = await resendWorkspaceInvitation(failedInvId);
      if (res.success) {
        setFailedInvId(null);
        setError(null);
        alert(res.message || "Invitation email successfully resent!");
      } else {
        setError(`Invitation could not be sent: ${res.error}`);
      }
    } catch (e: any) {
      setError(`Retry failed: ${e?.message || "Unknown error"}`);
    } finally {
      setRetrying(false);
    }
  };

  // Final Submission: Create Workspace & Send Invitation
  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);
    setFailedInvId(null);

    try {
      // 1. Create Workspace
      const wsRes = await createWorkspace({
        name: name.trim(),
        business_name: (businessName || name).trim(),
        owner_name: assignedFullName.trim(),
        owner_email: assignedEmail.trim().toLowerCase(),
        phone: phone.trim() || undefined,
        country: country.trim() || "United Arab Emirates",
        currency: currency.trim() || "AED",
        address: address.trim() || undefined,
        trn: trn.trim() || undefined,
        status: "active",
      });

      if (!wsRes.success || !wsRes.workspace) {
        setError(wsRes.error || "Failed to create workspace.");
        setSubmitting(false);
        return;
      }

      const createdWs = wsRes.workspace;

      // 2. Dispatch Invitation via Supabase Auth Admin
      const invRes = await createWorkspaceInvitation({
        workspace_id: createdWs.id,
        workspace_name: createdWs.name,
        email: assignedEmail.trim().toLowerCase(),
        full_name: assignedFullName.trim(),
        role: selectedRole,
        permissions,
        data_scope: dataScope,
        financial_visibility: financialVisibility,
        approval_limits: approvalLimits,
        invited_by: "Primary Owner",
      });

      // Existing User Handling (Requirement 7)
      if (invRes.success && invRes.already_exists) {
        setInvitationSuccess({
          workspace: createdWs,
          email: assignedEmail.trim().toLowerCase(),
          role: selectedRole,
          oneTimeCode: invRes.invitation?.one_time_code || "EXISTING-USER",
          inviteLink: invRes.invitation?.invite_link || "/login",
          status: "accepted",
          alreadyExists: true,
          sentMessage: "User already has an account. Workspace access has been assigned.",
        });
        if (onCreated) onCreated(createdWs);
        return;
      }

      // Email Delivery Failure Handling (Requirement 8)
      if (!invRes.success || invRes.invitation?.status === "failed") {
        const errorMsg = invRes.error || "Invitation could not be sent: email delivery failed.";
        setError(errorMsg);
        setFailedInvId(invRes.invitation?.id || null);
        setSubmitting(false);
        return;
      }

      let generatedPass: string | undefined = undefined;
      if (credentialMethod === "temp_password") {
        let pass = tempPassword.trim();
        if (!pass) {
          const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
          let rand = "";
          for (let i = 0; i < 8; i++) rand += chars.charAt(Math.floor(Math.random() * chars.length));
          pass = `Temp-${rand.slice(0, 4)}-${rand.slice(4, 8)}!`;
        }
        generatedPass = pass;
      }

      // Success: Credentials dispatched or generated!
      setInvitationSuccess({
        workspace: createdWs,
        email: assignedEmail.trim().toLowerCase(),
        role: selectedRole,
        oneTimeCode: invRes.invitation?.one_time_code || "",
        inviteLink: invRes.invitation?.invite_link || "",
        status: invRes.invitation?.status || "sent",
        sentMessage: invRes.message || `Official credentials created for ${assignedEmail}.`,
        generatedTempPassword: generatedPass,
      });

      if (onCreated) {
        onCreated(createdWs);
      }
    } catch (err: any) {
      setError(err?.message || "An unexpected error occurred.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCopyCode = () => {
    if (!invitationSuccess?.oneTimeCode) return;
    navigator.clipboard.writeText(invitationSuccess.oneTimeCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2500);
  };

  const handleCopyLink = () => {
    if (!invitationSuccess?.inviteLink) return;
    navigator.clipboard.writeText(invitationSuccess.inviteLink);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  const enabledModulesCount = Object.values(permissions).filter((p) => p.access).length;

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          resetAll();
          onClose();
        }
      }}
    >
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 p-6">
        {/* If Invitation is Successful, show the One-Time Code Dialog */}
        {invitationSuccess ? (
          <div className="space-y-6 py-2">
            <div className="text-center space-y-2">
              <div className="w-14 h-14 bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 rounded-full flex items-center justify-center mx-auto shadow-inner">
                <CheckCircle2 className="w-7 h-7" />
              </div>
              <DialogTitle className="text-xl font-black text-slate-900 dark:text-slate-100">
                {invitationSuccess.alreadyExists
                  ? "Workspace Created & Staff Account Assigned!"
                  : "Workspace Created & Invitation Dispatched!"}
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500 max-w-md mx-auto">
                {invitationSuccess.alreadyExists
                  ? "The user already has an existing account. Workspace access and role permissions have been assigned directly."
                  : "The official Supabase Auth invitation email has been dispatched to the user's inbox with a secure activation link."}
              </DialogDescription>
            </div>

            {/* Summary Details */}
            <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-200 dark:border-slate-700 text-xs space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-500">Workspace:</span>
                <span className="font-bold text-slate-900 dark:text-slate-100">
                  {invitationSuccess.workspace.name}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Invited User:</span>
                <span className="font-semibold">{invitationSuccess.email}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Assigned Role:</span>
                <Badge variant="outline" className="text-[10px] uppercase font-bold">
                  {invitationSuccess.role}
                </Badge>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Status:</span>
                {invitationSuccess.alreadyExists ? (
                  <Badge className="bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300 text-[10px] uppercase font-bold">
                    Active (Existing Account)
                  </Badge>
                ) : (
                  <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 text-[10px] uppercase font-bold">
                    Invitation Dispatched
                  </Badge>
                )}
              </div>
            </div>

            {/* TEMPORARY PASSWORD (Requirement 1 & 2) */}
            {invitationSuccess.generatedTempPassword && (
              <div className="p-4 bg-purple-50/60 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800 rounded-xl space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-purple-900 dark:text-purple-200 flex items-center gap-1.5">
                    <KeyRound className="w-4 h-4 text-purple-600" />
                    Temporary Password Credentials
                  </span>
                  <Badge variant="outline" className="text-[10px] border-purple-300 text-purple-700">
                    Change Required On First Login
                  </Badge>
                </div>
                <p className="text-[11px] text-slate-600 dark:text-slate-400">
                  Share this temporary password with the Second Workspace Owner. For security, this password is never stored in plaintext and will not be displayed again.
                </p>

                <div className="flex items-center gap-2">
                  <div className="flex-1 bg-white dark:bg-slate-900 border border-purple-200 dark:border-purple-800 rounded-lg p-2.5 font-mono font-black text-lg text-center tracking-widest text-purple-700 dark:text-purple-300 select-all">
                    {invitationSuccess.generatedTempPassword}
                  </div>
                  <Button
                    onClick={() => {
                      navigator.clipboard.writeText(invitationSuccess.generatedTempPassword || "");
                      setCopiedTempPass(true);
                      setTimeout(() => setCopiedTempPass(false), 2500);
                    }}
                    className="bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs gap-1.5 h-11 px-4"
                  >
                    {copiedTempPass ? <Check className="w-4 h-4 text-emerald-300" /> : <Copy className="w-4 h-4" />}
                    {copiedTempPass ? "Copied!" : "Copy Password"}
                  </Button>
                </div>
              </div>
            )}

            {/* ONE-TIME ACCESS CODE (Crucial Requirement) */}
            <div className="p-4 bg-blue-50/60 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 rounded-xl space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-blue-900 dark:text-blue-200 flex items-center gap-1.5">
                  <KeyRound className="w-4 h-4 text-blue-600" />
                  Secure One-Time Activation Code
                </span>
                <Badge variant="outline" className="text-[10px] border-blue-300 text-blue-700">
                  Valid 72 Hours
                </Badge>
              </div>
              <p className="text-[11px] text-slate-600 dark:text-slate-400">
                Share this code with the user if they activate manually at login. This code is single-use and expires after account activation.
              </p>

              <div className="flex items-center gap-2">
                <div className="flex-1 bg-white dark:bg-slate-900 border border-blue-200 dark:border-blue-800 rounded-lg p-2.5 font-mono font-black text-lg text-center tracking-widest text-blue-700 dark:text-blue-400 select-all">
                  {invitationSuccess.oneTimeCode}
                </div>
                <Button
                  onClick={handleCopyCode}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs gap-1.5 h-11 px-4"
                >
                  {copiedCode ? <Check className="w-4 h-4 text-emerald-300" /> : <Copy className="w-4 h-4" />}
                  {copiedCode ? "Copied!" : "Copy Code"}
                </Button>
              </div>
            </div>

            {/* Direct Activation Link */}
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-500">Direct Invitation Link:</Label>
              <div className="flex items-center gap-2">
                <Input
                  readOnly
                  value={invitationSuccess.inviteLink}
                  className="text-xs font-mono h-9 bg-slate-50 dark:bg-slate-800 select-all"
                />
                <Button
                  variant="outline"
                  onClick={handleCopyLink}
                  className="text-xs font-semibold h-9 shrink-0 gap-1.5"
                >
                  {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiedLink ? "Copied" : "Copy Link"}
                </Button>
              </div>
            </div>

            <DialogFooter className="pt-2">
              <Button
                onClick={() => {
                  resetAll();
                  onClose();
                }}
                className="w-full bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 text-white font-bold text-xs h-10"
              >
                Done
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <>
            {/* Wizard Header & Stepper */}
            <DialogHeader className="pb-2 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center justify-between">
                <div>
                  <DialogTitle className="text-base font-black flex items-center gap-2 text-slate-900 dark:text-slate-100">
                    <Building2 className="w-5 h-5 text-blue-600" />
                    Create Business Workspace &amp; Invite User
                  </DialogTitle>
                  <DialogDescription className="text-xs text-slate-500 mt-0.5">
                    Step {currentStep} of 5:{" "}
                    {currentStep === 1 && "Business Details"}
                    {currentStep === 2 && "Assign User"}
                    {currentStep === 3 && "Access Level & Role Template"}
                    {currentStep === 4 && "Module Access & Granular Permissions"}
                    {currentStep === 5 && "Review & Send Invitation"}
                  </DialogDescription>
                </div>
                <Badge variant="outline" className="text-[10px] font-bold uppercase">
                  Multi-Tenant
                </Badge>
              </div>

              {/* Step indicator bar */}
              <div className="grid grid-cols-5 gap-1.5 pt-3">
                {[1, 2, 3, 4, 5].map((st) => (
                  <div
                    key={st}
                    className={`h-1.5 rounded-full transition-all ${
                      st <= currentStep
                        ? "bg-blue-600"
                        : "bg-slate-100 dark:bg-slate-800"
                    }`}
                  />
                ))}
              </div>
            </DialogHeader>

            {error && (
              <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-xl flex items-center justify-between gap-2 text-xs font-semibold text-red-700 dark:text-red-400">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{error}</span>
                </div>
                {failedInvId && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={handleRetryInvitation}
                    disabled={retrying}
                    className="h-7 text-xs font-bold border-red-300 text-red-700 hover:bg-red-100 shrink-0"
                  >
                    {retrying ? "Retrying..." : "Retry Invitation"}
                  </Button>
                )}
              </div>
            )}

            {/* ─── STEP 1: BUSINESS DETAILS ─────────────────────────────────── */}
            {currentStep === 1 && (
              <div className="space-y-4 py-2">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                      <Building2 className="w-3.5 h-3.5 text-blue-600" />
                      Workspace / Business Name *
                    </Label>
                    <Input
                      placeholder="e.g. Al Baraka Auto Care"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="text-xs h-9"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                      Legal Business Name (Optional)
                    </Label>
                    <Input
                      placeholder="e.g. Al Baraka Auto Care LLC"
                      value={businessName}
                      onChange={(e) => setBusinessName(e.target.value)}
                      className="text-xs h-9"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                      <Phone className="w-3.5 h-3.5 text-slate-400" />
                      Business Phone
                    </Label>
                    <Input
                      placeholder="+971 50 123 4567"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="text-xs h-9"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                      <Globe className="w-3.5 h-3.5 text-slate-400" />
                      Country
                    </Label>
                    <Input
                      value={country}
                      onChange={(e) => setCountry(e.target.value)}
                      className="text-xs h-9"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                      <Coins className="w-3.5 h-3.5 text-slate-400" />
                      Currency
                    </Label>
                    <Input
                      value={currency}
                      onChange={(e) => setCurrency(e.target.value)}
                      className="text-xs h-9 font-bold"
                    />
                  </div>

                  <div className="space-y-1.5 sm:col-span-2">
                    <Label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-slate-400" />
                      Physical Address
                    </Label>
                    <Input
                      placeholder="e.g. Musaffah M-14, Abu Dhabi, UAE"
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      className="text-xs h-9"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                      <FileSpreadsheet className="w-3.5 h-3.5 text-slate-400" />
                      TRN / Tax Number
                    </Label>
                    <Input
                      placeholder="100XXXXXXXXXXXX"
                      value={trn}
                      onChange={(e) => setTrn(e.target.value)}
                      className="text-xs h-9"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                      Logo URL (Optional)
                    </Label>
                    <Input
                      placeholder="https://..."
                      value={logoUrl}
                      onChange={(e) => setLogoUrl(e.target.value)}
                      className="text-xs h-9"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* ─── STEP 2: ASSIGN USER ───────────────────────────────────────── */}
            {currentStep === 2 && (
              <div className="space-y-4 py-2">
                <div className="p-3 bg-blue-50/50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900 rounded-xl text-xs text-blue-900 dark:text-blue-300 space-y-1">
                  <p className="font-bold flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-blue-600" />
                    Assign Workspace Operator
                  </p>
                  <p className="text-[11px] text-slate-600 dark:text-slate-400">
                    This user will receive an invitation email and secure code to set up their own account and password. They will not have access to ATIQ JEHAN records.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5 text-blue-600" />
                      Full Name *
                    </Label>
                    <Input
                      placeholder="e.g. Ahmed Khan"
                      value={assignedFullName}
                      onChange={(e) => setAssignedFullName(e.target.value)}
                      className="text-xs h-9"
                    />
                  </div>

                  <div className="space-y-1.5 sm:col-span-2">
                    <Label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                      <Mail className="w-3.5 h-3.5 text-blue-600" />
                      Work Email *
                    </Label>
                    <Input
                      type="email"
                      placeholder="e.g. ahmed@example.com"
                      value={assignedEmail}
                      onChange={(e) => setAssignedEmail(e.target.value)}
                      className="text-xs h-9"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                      <Phone className="w-3.5 h-3.5 text-slate-400" />
                      Mobile Phone
                    </Label>
                    <Input
                      placeholder="+971 55 123 4567"
                      value={assignedPhone}
                      onChange={(e) => setAssignedPhone(e.target.value)}
                      className="text-xs h-9"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                      <Briefcase className="w-3.5 h-3.5 text-slate-400" />
                      Job Title
                    </Label>
                    <Input
                      placeholder="e.g. General Manager / Workshop Lead"
                      value={assignedJobTitle}
                      onChange={(e) => setAssignedJobTitle(e.target.value)}
                      className="text-xs h-9"
                    />
                  </div>

                  {/* Credential Method Selector (Requirement 1 & 2) */}
                  <div className="space-y-2 sm:col-span-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                    <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                      Login Authentication &amp; Password Setup *
                    </Label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div
                        onClick={() => setCredentialMethod("invite")}
                        className={`p-3 rounded-xl border cursor-pointer transition-all ${
                          credentialMethod === "invite"
                            ? "border-blue-600 bg-blue-50/50 dark:bg-blue-950/30 text-blue-900 dark:text-blue-100 ring-1 ring-blue-600"
                            : "border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50"
                        }`}
                      >
                        <div className="flex items-center gap-2 font-bold text-xs">
                          <Mail className="w-4 h-4 text-blue-600" />
                          Send Invitation Link (Recommended)
                        </div>
                        <p className="text-[11px] text-slate-500 mt-1">
                          Dispatches an invitation link/email where the owner securely creates their own private password.
                        </p>
                      </div>

                      <div
                        onClick={() => setCredentialMethod("temp_password")}
                        className={`p-3 rounded-xl border cursor-pointer transition-all ${
                          credentialMethod === "temp_password"
                            ? "border-blue-600 bg-blue-50/50 dark:bg-blue-950/30 text-blue-900 dark:text-blue-100 ring-1 ring-blue-600"
                            : "border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50"
                        }`}
                      >
                        <div className="flex items-center gap-2 font-bold text-xs">
                          <KeyRound className="w-4 h-4 text-purple-600" />
                          Set / Auto-Generate Temporary Password
                        </div>
                        <p className="text-[11px] text-slate-500 mt-1">
                          Creates account with temporary credentials. User must change their password on first login.
                        </p>
                      </div>
                    </div>

                    {credentialMethod === "temp_password" && (
                      <div className="pt-2 space-y-1.5">
                        <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                          Temporary Password (Optional - leave blank to auto-generate)
                        </Label>
                        <Input
                          type="text"
                          placeholder="Leave blank to auto-generate secure temporary password"
                          value={tempPassword}
                          onChange={(e) => setTempPassword(e.target.value)}
                          className="text-xs h-9 font-mono"
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* ─── STEP 3: ACCESS LEVEL ─────────────────────────────────────── */}
            {currentStep === 3 && (
              <div className="space-y-3 py-2">
                <p className="text-xs text-slate-500">
                  Select a baseline role template. You can customize exact module and CRUD action access in the next step.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {ROLE_OPTIONS.map((opt) => {
                    const isSelected = selectedRole === opt.role;
                    return (
                      <div
                        key={opt.role}
                        onClick={() => handleRoleSelect(opt.role)}
                        className={`p-3 rounded-xl border transition-all cursor-pointer flex flex-col justify-between ${
                          isSelected
                            ? "border-blue-600 bg-blue-50/40 dark:bg-blue-950/30 ring-1 ring-blue-600"
                            : "border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/60"
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-bold text-xs text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                            {opt.role === "owner" && <Crown className="w-3.5 h-3.5 text-blue-600" />}
                            {opt.title}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider ${opt.badge}`}
                          >
                            {opt.role}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-2">
                          {opt.desc}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ─── STEP 4: MODULE ACCESS & PERMISSIONS ──────────────────────── */}
            {currentStep === 4 && (
              <div className="space-y-4 py-2">
                <div className="flex items-center justify-between bg-slate-50 dark:bg-slate-800/50 p-2.5 rounded-xl border text-xs">
                  <span className="text-slate-600 dark:text-slate-300 font-semibold">
                    Role Template Applied:{" "}
                    <span className="font-black text-blue-600 uppercase">{selectedRole}</span>
                  </span>
                  <Badge variant="outline" className="text-[11px]">
                    {enabledModulesCount} of {WORKSPACE_MODULES.length} Modules Enabled
                  </Badge>
                </div>

                {/* Modules List */}
                <div className="space-y-2 max-h-[45vh] overflow-y-auto pr-1">
                  {WORKSPACE_MODULES.map((m) => {
                    const mod = m.id;
                    const modPerm = permissions[mod] || { module: mod, access: false };
                    const isModActive = modPerm.access;

                    return (
                      <div
                        key={mod}
                        className={`p-3 rounded-xl border transition-all ${
                          isModActive
                            ? "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                            : "border-slate-100 dark:border-slate-800/60 bg-slate-50/50 dark:bg-slate-950/40 opacity-75"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
                              {m.label}
                            </span>
                            <Badge
                              variant="outline"
                              className={`text-[9px] uppercase ${
                                isModActive ? "border-emerald-300 text-emerald-700" : "text-slate-400"
                              }`}
                            >
                              {isModActive ? "Enabled" : "Disabled"}
                            </Badge>
                          </div>
                          <Switch
                            checked={isModActive}
                            onCheckedChange={(checked) => handleModuleAccessToggle(mod, checked)}
                          />
                        </div>

                        {/* Granular Action Pills */}
                        {isModActive && (
                          <div className="pt-2.5 mt-2 border-t border-slate-100 dark:border-slate-800 flex flex-wrap gap-1.5">
                            {(["can_view", "can_create", "can_edit", "can_delete", "can_print", "can_export"] as const).map(
                              (actionKey) => {
                                const actionLabel = actionKey.replace("can_", "");
                                const isActionOn = Boolean(modPerm[actionKey]);
                                return (
                                  <button
                                    type="button"
                                    key={actionKey}
                                    onClick={() => handleActionToggle(mod, actionKey, !isActionOn)}
                                    className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase transition-colors ${
                                      isActionOn
                                        ? "bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-300 border border-blue-300"
                                        : "bg-slate-100 dark:bg-slate-800 text-slate-400 border border-slate-200 dark:border-slate-700"
                                    }`}
                                  >
                                    {actionLabel}
                                  </button>
                                );
                              }
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ─── STEP 5: ACCESS REVIEW ─────────────────────────────────────── */}
            {currentStep === 5 && (
              <div className="space-y-4 py-2">
                <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden shadow-xs">
                  <div className="bg-slate-50 dark:bg-slate-800/80 px-4 py-3 border-b border-slate-200 dark:border-slate-700">
                    <h4 className="text-xs font-black uppercase text-slate-600 dark:text-slate-300 tracking-wider">
                      Pre-Flight Summary Review
                    </h4>
                  </div>

                  <div className="p-4 space-y-3 text-xs bg-white dark:bg-slate-900">
                    <div className="grid grid-cols-2 gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
                      <div>
                        <span className="text-slate-500 text-[11px]">Target Workspace:</span>
                        <p className="font-black text-sm text-slate-900 dark:text-slate-100">{name}</p>
                      </div>
                      <div>
                        <span className="text-slate-500 text-[11px]">Assigned Role:</span>
                        <p className="font-bold text-sm text-blue-600 uppercase">{selectedRole}</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
                      <div>
                        <span className="text-slate-500 text-[11px]">Assigned User:</span>
                        <p className="font-bold text-slate-800 dark:text-slate-200">{assignedFullName}</p>
                      </div>
                      <div>
                        <span className="text-slate-500 text-[11px]">Invitation Email:</span>
                        <p className="font-bold text-slate-800 dark:text-slate-200">{assignedEmail}</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
                      <div>
                        <span className="text-slate-500 text-[11px]">Modules Enabled:</span>
                        <p className="font-bold text-emerald-600">
                          {enabledModulesCount} / {WORKSPACE_MODULES.length} Modules
                        </p>
                      </div>
                      <div>
                        <span className="text-slate-500 text-[11px]">Data Access Scope:</span>
                        <Badge variant="outline" className="text-[10px] uppercase font-bold mt-0.5">
                          {dataScope}
                        </Badge>
                      </div>
                    </div>

                    <div className="pt-1">
                      <span className="text-slate-500 text-[11px]">Activation Policy:</span>
                      <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5">
                        User will create their own password via link or code. Membership will remain{" "}
                        <span className="font-bold text-amber-600">PENDING</span> until activation.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ─── MODAL FOOTER CONTROLS ────────────────────────────────────── */}
            <DialogFooter className="flex items-center justify-between border-t border-slate-100 dark:border-slate-800 pt-4 mt-2">
              <div>
                {currentStep > 1 && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleBack}
                    disabled={submitting}
                    className="text-xs h-9 font-semibold gap-1"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" /> Back
                  </Button>
                )}
              </div>

              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    resetAll();
                    onClose();
                  }}
                  disabled={submitting}
                  className="text-xs h-9"
                >
                  Cancel
                </Button>

                {currentStep < 5 ? (
                  <Button
                    type="button"
                    onClick={handleNext}
                    className="bg-blue-600 hover:bg-blue-700 text-white text-xs h-9 font-bold gap-1 px-4 shadow-sm"
                  >
                    Next <ArrowRight className="w-3.5 h-3.5" />
                  </Button>
                ) : (
                  <Button
                    type="button"
                    onClick={handleSubmit}
                    disabled={submitting}
                    className="bg-blue-600 hover:bg-blue-700 text-white text-xs h-9 font-bold gap-1.5 px-4 shadow-sm"
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        Creating Workspace...
                      </>
                    ) : (
                      <>
                        <Send className="w-3.5 h-3.5" />
                        Create Workspace &amp; Send Invitation
                      </>
                    )}
                  </Button>
                )}
              </div>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
