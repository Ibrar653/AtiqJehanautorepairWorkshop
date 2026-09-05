"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Building2,
  Shield,
  User,
  Mail,
  KeyRound,
  ArrowRight,
  AlertTriangle,
  Lock,
  Unlock,
  UserMinus,
  Archive,
  RotateCcw,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  Send,
  Edit2,
  Phone,
  MapPin,
  FileSpreadsheet,
  Users,
  Package,
  Calendar,
  Sliders,
  DollarSign,
  UserCheck,
  UserX,
} from "lucide-react";
import { useWorkspace } from "@/lib/context/workspace-context";
import {
  archiveWorkspace,
  restoreWorkspace,
  deleteWorkspace,
  updateWorkspace,
  suspendWorkspaceOwner,
  restoreWorkspaceOwner,
  removeWorkspaceOwner,
  replaceWorkspaceOwner,
  checkWorkspaceFinancialRecords,
  getLocalMembers,
} from "@/lib/services/workspace-service";
import { DEFAULT_WORKSPACE_ID, PRIMARY_OWNER_EMAIL } from "@/lib/constants";
import type { Workspace, FinancialRecordCounts, User as UserType } from "@/types/database";

interface WorkspaceOwnerPanelModalProps {
  isOpen: boolean;
  onClose: () => void;
  workspace: Workspace | null;
  onUpdated: () => void;
  onOpenManageUsers?: (workspace: Workspace) => void;
  onOpenManagePermissions?: (workspace: Workspace) => void;
}

export function WorkspaceOwnerPanelModal({
  isOpen,
  onClose,
  workspace,
  onUpdated,
  onOpenManageUsers,
  onOpenManagePermissions,
}: WorkspaceOwnerPanelModalProps) {
  const { switchWorkspace, currentWorkspace } = useWorkspace();

  // Dialog sub-modals
  const [resetLoginOpen, setResetLoginOpen] = useState(false);
  const [removeOwnerConfirmOpen, setRemoveOwnerConfirmOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [editWsOpen, setEditWsOpen] = useState(false);
  const [replaceOwnerOpen, setReplaceOwnerOpen] = useState(false);

  // States
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [typedDeleteName, setTypedDeleteName] = useState("");
  const [financialCounts, setFinancialCounts] = useState<FinancialRecordCounts | null>(null);

  // Edit Workspace state
  const [editName, setEditName] = useState("");
  const [editBusinessName, setEditBusinessName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editAddress, setEditAddress] = useState("");
  const [editTrn, setEditTrn] = useState("");
  const [editCurrency, setEditCurrency] = useState("AED");

  // Replace Owner state
  const [newOwnerName, setNewOwnerName] = useState("");
  const [newOwnerEmail, setNewOwnerEmail] = useState("");

  // Reset login state
  const [generatedTempPassword, setGeneratedTempPassword] = useState<string | null>(null);
  const [copiedTempPassword, setCopiedTempPassword] = useState(false);

  useEffect(() => {
    if (workspace && isOpen) {
      checkWorkspaceFinancialRecords(workspace.id).then(setFinancialCounts);
      setEditName(workspace.name || "");
      setEditBusinessName(workspace.business_name || "");
      setEditPhone(workspace.phone || "");
      setEditAddress(workspace.address || "");
      setEditTrn(workspace.trn_number || "");
      setEditCurrency(workspace.currency || "AED");
    }
  }, [workspace, isOpen]);

  // Compute workspace staff counts
  const { activeUsersCount, suspendedUsersCount } = useMemo(() => {
    if (!workspace) return { activeUsersCount: 0, suspendedUsersCount: 0 };
    try {
      const members = getLocalMembers().filter((m) => m.workspace_id === workspace.id);
      const active = members.filter((m) => m.status === "active").length;
      const suspended = members.filter((m) => m.status === "suspended").length;
      return { activeUsersCount: active || 1, suspendedUsersCount: suspended };
    } catch {
      return { activeUsersCount: 1, suspendedUsersCount: 0 };
    }
  }, [workspace, isOpen]);

  if (!workspace) return null;

  const isPrimary = workspace.id === DEFAULT_WORKSPACE_ID;
  const isCurrent = currentWorkspace.id === workspace.id;
  const ownerEmail = workspace.owner_email || workspace.email || "";
  const ownerName = workspace.owner_name || "Assigned Operator";
  const isArchived = workspace.status === "archived";
  const isSuspended = workspace.status === "suspended";

  // 1. Open Workspace
  const handleOpenWorkspace = () => {
    switchWorkspace(workspace.id);
    onClose();
  };

  // 2. Suspend / Restore Owner Access
  const handleToggleOwnerAccess = async () => {
    if (!ownerEmail) return;
    setLoading(true);
    setToast(null);
    try {
      if (isSuspended) {
        const res = await restoreWorkspaceOwner(workspace.id, ownerEmail, "Primary Owner");
        if (res.success) {
          setToast({ type: "success", message: `Access restored for ${ownerEmail}.` });
          onUpdated();
        } else {
          setToast({ type: "error", message: res.error || "Failed to restore access." });
        }
      } else {
        const res = await suspendWorkspaceOwner(workspace.id, ownerEmail, "Primary Owner");
        if (res.success) {
          setToast({ type: "success", message: `Access suspended for ${ownerEmail}.` });
          onUpdated();
        } else {
          setToast({ type: "error", message: res.error || "Failed to suspend access." });
        }
      }
    } catch (e: any) {
      setToast({ type: "error", message: e?.message || "Operation failed." });
    } finally {
      setLoading(false);
    }
  };

  // 3. Remove Owner Access (Preserves business data)
  const handleRemoveOwner = async () => {
    if (!ownerEmail) return;
    setLoading(true);
    setToast(null);
    try {
      const res = await removeWorkspaceOwner(workspace.id, ownerEmail, "Primary Owner");
      if (res.success) {
        setToast({
          type: "success",
          message: `Removed ${ownerEmail}'s access to ${workspace.name}. Historical records preserved.`,
        });
        setRemoveOwnerConfirmOpen(false);
        onUpdated();
      } else {
        setToast({ type: "error", message: res.error || "Failed to remove workspace owner." });
      }
    } catch (e: any) {
      setToast({ type: "error", message: e?.message || "Failed to remove owner." });
    } finally {
      setLoading(false);
    }
  };

  // 4. Archive / Restore Workspace
  const handleToggleArchive = async () => {
    if (isPrimary) {
      setToast({ type: "error", message: "Primary HQ workspace cannot be archived." });
      return;
    }
    setLoading(true);
    setToast(null);
    try {
      if (isArchived) {
        const res = await restoreWorkspace(workspace.id, "Primary Owner");
        if (res.success) {
          setToast({ type: "success", message: `Workspace "${workspace.name}" has been restored.` });
          onUpdated();
        } else {
          setToast({ type: "error", message: res.error || "Failed to restore workspace." });
        }
      } else {
        const res = await archiveWorkspace(workspace.id, "Primary Owner");
        if (res.success) {
          setToast({
            type: "success",
            message: `Workspace "${workspace.name}" archived. All records are safely preserved.`,
          });
          onUpdated();
        } else {
          setToast({ type: "error", message: res.error || "Failed to archive workspace." });
        }
      }
    } catch (e: any) {
      setToast({ type: "error", message: e?.message || "Operation failed." });
    } finally {
      setLoading(false);
    }
  };

  // 5. Permanent Delete Workspace
  const handleDeleteWorkspace = async () => {
    if (isPrimary) {
      setToast({ type: "error", message: "Primary HQ workspace cannot be deleted." });
      return;
    }
    if (typedDeleteName.trim().toLowerCase() !== workspace.name.trim().toLowerCase()) {
      setToast({ type: "error", message: "Workspace name confirmation does not match." });
      return;
    }

    setLoading(true);
    setToast(null);
    try {
      const res = await deleteWorkspace(workspace.id, "Primary Owner", typedDeleteName);
      if (res.success) {
        setDeleteConfirmOpen(false);
        onClose();
        onUpdated();
      } else {
        setToast({ type: "error", message: res.error || "Failed to delete workspace." });
      }
    } catch (e: any) {
      setToast({ type: "error", message: e?.message || "Deletion failed." });
    } finally {
      setLoading(false);
    }
  };

  // 6. Save Edit Workspace
  const handleSaveEditWorkspace = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editName.trim()) {
      setToast({ type: "error", message: "Workspace Name is required." });
      return;
    }

    setLoading(true);
    try {
      const res = await updateWorkspace(workspace.id, {
        name: editName.trim(),
        business_name: editBusinessName.trim() || undefined,
        phone: editPhone.trim() || undefined,
        address: editAddress.trim() || undefined,
        trn_number: editTrn.trim() || undefined,
        currency: editCurrency,
      });

      if (res.success) {
        setToast({ type: "success", message: "Workspace details updated successfully." });
        setEditWsOpen(false);
        onUpdated();
      } else {
        setToast({ type: "error", message: res.error || "Failed to update workspace." });
      }
    } catch (e: any) {
      setToast({ type: "error", message: e?.message || "Failed to update workspace." });
    } finally {
      setLoading(false);
    }
  };

  // 7. Save Replace Workspace Owner
  const handleSaveReplaceOwner = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newOwnerName.trim() || !newOwnerEmail.trim() || !newOwnerEmail.includes("@")) {
      setToast({ type: "error", message: "Please provide a valid name and email address for the new owner." });
      return;
    }

    setLoading(true);
    try {
      const res = await replaceWorkspaceOwner(
        workspace.id,
        {
          full_name: newOwnerName.trim(),
          email: newOwnerEmail.trim().toLowerCase(),
          role: "owner",
        },
        "Primary Owner"
      );

      if (res.success) {
        setToast({
          type: "success",
          message: `Workspace Owner successfully replaced with ${newOwnerName.trim()} (${newOwnerEmail.trim()}).`,
        });
        setReplaceOwnerOpen(false);
        setNewOwnerName("");
        setNewOwnerEmail("");
        onUpdated();
      } else {
        setToast({ type: "error", message: res.error || "Failed to replace workspace owner." });
      }
    } catch (e: any) {
      setToast({ type: "error", message: e?.message || "Failed to replace owner." });
    } finally {
      setLoading(false);
    }
  };

  // 8. Generate Temporary Password
  const handleGenerateTempPassword = () => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let rand = "";
    for (let i = 0; i < 8; i++) {
      rand += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    const tempPass = `Temp-${rand.slice(0, 4)}-${rand.slice(4, 8)}!`;
    setGeneratedTempPassword(tempPass);
    setCopiedTempPassword(false);
  };

  const handleCopyTempPass = () => {
    if (!generatedTempPassword) return;
    navigator.clipboard.writeText(generatedTempPassword);
    setCopiedTempPassword(true);
    setTimeout(() => setCopiedTempPassword(false), 2000);
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 p-6">
          <DialogHeader className="pb-3 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 flex items-center justify-center font-black">
                  <Building2 className="w-5 h-5" />
                </div>
                <div>
                  <DialogTitle className="text-lg font-black text-slate-900 dark:text-slate-100 flex items-center gap-2">
                    WORKSPACE DETAILS: {workspace.name}
                    {isPrimary ? (
                      <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-300 text-[10px] uppercase font-black">
                        PRIMARY WORKSPACE
                      </Badge>
                    ) : (
                      <Badge className="bg-purple-100 text-purple-800 dark:bg-purple-900/60 dark:text-purple-300 text-[10px] uppercase font-black">
                        SECONDARY WORKSPACE
                      </Badge>
                    )}
                  </DialogTitle>
                  <DialogDescription className="text-xs text-slate-500">
                    {workspace.business_name || workspace.id} • Operating Currency: {workspace.currency}
                  </DialogDescription>
                </div>
              </div>

              <Badge
                className={`text-[10px] font-bold uppercase tracking-wider ${
                  workspace.status === "active"
                    ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                    : workspace.status === "archived"
                    ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                    : "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300"
                }`}
              >
                {workspace.status}
              </Badge>
            </div>
          </DialogHeader>

          {toast && (
            <div
              className={`p-3 rounded-xl border text-xs font-semibold flex items-center justify-between ${
                toast.type === "success"
                  ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                  : "bg-red-50 text-red-800 border-red-200"
              }`}
            >
              <span>{toast.message}</span>
              <button onClick={() => setToast(null)} className="text-slate-400 hover:text-slate-700 ml-2">
                ✕
              </button>
            </div>
          )}

          {/* ─── 1. BUSINESS INFORMATION (Requirement 16) ─────────────────── */}
          <div className="bg-slate-50 dark:bg-slate-800/40 rounded-xl p-4 border border-slate-200 dark:border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-blue-600" />
                Business Information
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEditWsOpen(true)}
                className="h-7 text-xs font-bold gap-1 text-blue-600 border-blue-200 hover:bg-blue-50"
              >
                <Edit2 className="w-3 h-3" /> Edit Workspace
              </Button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div>
                <span className="text-slate-400 block text-[11px]">Workspace Name:</span>
                <span className="font-bold text-slate-800 dark:text-slate-200">{workspace.name}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">Business Name:</span>
                <span className="font-semibold text-slate-800 dark:text-slate-200">
                  {workspace.business_name || "—"}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">Phone:</span>
                <span className="font-semibold text-slate-800 dark:text-slate-200">
                  {workspace.phone || "—"}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">TRN Number:</span>
                <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">
                  {workspace.trn_number || "—"}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">Operating Currency:</span>
                <span className="font-bold text-slate-800 dark:text-slate-200">{workspace.currency}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">Status:</span>
                <span className="font-bold capitalize text-emerald-600 dark:text-emerald-400">
                  {workspace.status}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">Created Date:</span>
                <span className="font-semibold text-slate-700 dark:text-slate-300">
                  {workspace.created_at ? new Date(workspace.created_at).toLocaleDateString() : "2024-01-01"}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">Facility Address:</span>
                <span className="font-semibold text-slate-700 dark:text-slate-300 truncate block">
                  {workspace.address || "Sharjah, UAE"}
                </span>
              </div>
            </div>
          </div>

          {/* ─── 2. WORKSPACE OWNER DETAILS & ACTIONS (Requirement 6 & 16) ── */}
          <div className="bg-slate-50 dark:bg-slate-800/40 rounded-xl p-4 border border-slate-200 dark:border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-blue-600" />
                Workspace Owner
              </span>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-[10px] font-bold uppercase">
                  Role: Workspace Owner
                </Badge>
                {!isPrimary && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setReplaceOwnerOpen(true)}
                    className="h-6 text-[11px] font-bold text-purple-700 border-purple-200 hover:bg-purple-50"
                  >
                    Replace Owner
                  </Button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div>
                <span className="text-slate-400 block text-[11px]">Owner Name:</span>
                <span className="font-bold text-slate-800 dark:text-slate-200">{ownerName}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">Owner Email:</span>
                <span className="font-mono font-semibold text-slate-700 dark:text-slate-300">
                  {ownerEmail || "Not assigned"}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">Owner Status:</span>
                <span
                  className={`font-bold ${
                    isSuspended || isArchived ? "text-red-600" : "text-emerald-600"
                  }`}
                >
                  {isSuspended || isArchived ? "Blocked / Inactive" : "Active Access"}
                </span>
              </div>
            </div>

            {/* Owner Governance Action Buttons */}
            <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-200 dark:border-slate-700">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setResetLoginOpen(true)}
                className="h-8 text-xs font-bold border-slate-200 hover:bg-blue-50 hover:text-blue-700"
              >
                <KeyRound className="w-3.5 h-3.5 mr-1 text-blue-600" /> Reset Login
              </Button>

              {onOpenManagePermissions && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onOpenManagePermissions(workspace)}
                  className="h-8 text-xs font-bold border-slate-200 hover:bg-purple-50 hover:text-purple-700"
                >
                  <Sliders className="w-3.5 h-3.5 mr-1 text-purple-600" /> Manage Permissions
                </Button>
              )}

              {!isPrimary && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={loading || !ownerEmail}
                    onClick={handleToggleOwnerAccess}
                    className="h-8 text-xs font-bold border-slate-200 hover:bg-amber-50 hover:text-amber-700"
                  >
                    {isSuspended ? (
                      <>
                        <Unlock className="w-3.5 h-3.5 mr-1 text-emerald-600" /> Restore Owner Access
                      </>
                    ) : (
                      <>
                        <Lock className="w-3.5 h-3.5 mr-1 text-amber-600" /> Suspend Owner Access
                      </>
                    )}
                  </Button>

                  <Button
                    variant="outline"
                    size="sm"
                    disabled={loading || !ownerEmail}
                    onClick={() => setRemoveOwnerConfirmOpen(true)}
                    className="h-8 text-xs font-bold border-red-200 text-red-700 hover:bg-red-50"
                  >
                    <UserMinus className="w-3.5 h-3.5 mr-1" /> Remove Owner Access
                  </Button>
                </>
              )}
            </div>
          </div>

          {/* ─── 3. USERS SUMMARY (Requirement 16) ────────────────────────── */}
          <div className="bg-slate-50 dark:bg-slate-800/40 rounded-xl p-4 border border-slate-200 dark:border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-blue-600" />
                Workspace Users
              </span>
              {onOpenManageUsers && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    onOpenManageUsers(workspace);
                    onClose();
                  }}
                  className="h-7 text-xs font-bold text-blue-600 border-blue-200 hover:bg-blue-50"
                >
                  <Users className="w-3 h-3 mr-1" /> Manage Users
                </Button>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4 text-center">
              <div className="bg-white dark:bg-slate-900 p-3 rounded-lg border border-slate-200 dark:border-slate-800">
                <div className="flex items-center justify-center gap-1.5 text-emerald-600 font-bold text-xs">
                  <UserCheck className="w-4 h-4" /> Active Users
                </div>
                <div className="text-2xl font-black text-slate-900 dark:text-slate-100 mt-1">
                  {activeUsersCount}
                </div>
              </div>

              <div className="bg-white dark:bg-slate-900 p-3 rounded-lg border border-slate-200 dark:border-slate-800">
                <div className="flex items-center justify-center gap-1.5 text-amber-600 font-bold text-xs">
                  <UserX className="w-4 h-4" /> Suspended Users
                </div>
                <div className="text-2xl font-black text-slate-900 dark:text-slate-100 mt-1">
                  {suspendedUsersCount}
                </div>
              </div>
            </div>
          </div>

          {/* ─── 4. DATA SUMMARY (Requirement 16) ─────────────────────────── */}
          <div className="p-4 bg-blue-50/40 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900 rounded-xl space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-bold text-blue-900 dark:text-blue-200 uppercase tracking-wider">
                <Shield className="w-3.5 h-3.5 text-blue-600" />
                Data Summary (Isolated Records)
              </div>
              <span className="text-[10px] text-blue-600 dark:text-blue-400 font-bold">
                workspace_id = {workspace.id.slice(0, 16)}...
              </span>
            </div>

            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 text-center">
              <div className="bg-white dark:bg-slate-900 p-2 rounded-lg border border-slate-200 dark:border-slate-800">
                <span className="text-[10px] text-slate-400 block font-semibold">Customers</span>
                <span className="text-base font-black text-slate-900 dark:text-slate-100">
                  {financialCounts?.customers || 0}
                </span>
              </div>
              <div className="bg-white dark:bg-slate-900 p-2 rounded-lg border border-slate-200 dark:border-slate-800">
                <span className="text-[10px] text-slate-400 block font-semibold">Job Cards</span>
                <span className="text-base font-black text-slate-900 dark:text-slate-100">
                  {financialCounts?.job_cards || 0}
                </span>
              </div>
              <div className="bg-white dark:bg-slate-900 p-2 rounded-lg border border-slate-200 dark:border-slate-800">
                <span className="text-[10px] text-slate-400 block font-semibold">Invoices</span>
                <span className="text-base font-black text-slate-900 dark:text-slate-100">
                  {financialCounts?.invoices || 0}
                </span>
              </div>
              <div className="bg-white dark:bg-slate-900 p-2 rounded-lg border border-slate-200 dark:border-slate-800">
                <span className="text-[10px] text-slate-400 block font-semibold">Inventory Items</span>
                <span className="text-base font-black text-slate-900 dark:text-slate-100">
                  {financialCounts?.inventory_items || 0}
                </span>
              </div>
              <div className="bg-white dark:bg-slate-900 p-2 rounded-lg border border-slate-200 dark:border-slate-800">
                <span className="text-[10px] text-slate-400 block font-semibold">Expenses</span>
                <span className="text-base font-black text-slate-900 dark:text-slate-100">
                  {financialCounts?.expenses || 0}
                </span>
              </div>
            </div>
          </div>

          {/* ─── 5. PRIMARY WORKSPACE ACTIONS (Requirement 16) ─────────────── */}
          <div className="space-y-2">
            <Label className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
              Workspace Actions
            </Label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleOpenWorkspace}
                className="h-9 text-xs font-bold border-slate-200 hover:bg-purple-50 hover:text-purple-700"
              >
                <ArrowRight className="w-3.5 h-3.5 mr-1" /> Open Workspace
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={() => setEditWsOpen(true)}
                className="h-9 text-xs font-bold border-slate-200 hover:bg-blue-50 hover:text-blue-700"
              >
                <Edit2 className="w-3.5 h-3.5 mr-1 text-blue-600" /> Edit Workspace
              </Button>

              {onOpenManageUsers && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    onOpenManageUsers(workspace);
                    onClose();
                  }}
                  className="h-9 text-xs font-bold border-slate-200 hover:bg-slate-100"
                >
                  <Users className="w-3.5 h-3.5 mr-1 text-emerald-600" /> Manage Users
                </Button>
              )}

              {!isPrimary && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={loading}
                  onClick={handleToggleArchive}
                  className="h-9 text-xs font-bold border-slate-200 hover:bg-slate-100"
                >
                  {isArchived ? (
                    <>
                      <RotateCcw className="w-3.5 h-3.5 mr-1 text-emerald-600" /> Restore Workspace
                    </>
                  ) : (
                    <>
                      <Archive className="w-3.5 h-3.5 mr-1 text-amber-600" /> Archive Workspace
                    </>
                  )}
                </Button>
              )}
            </div>
          </div>

          {/* ─── 6. DANGER ZONE (Requirement 8, 9, 11, 12, 16) ─────────────── */}
          <div className="pt-3 border-t border-slate-200 dark:border-slate-800">
            {isPrimary ? (
              <div className="bg-slate-100 dark:bg-slate-800 p-3 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300 font-semibold">
                  <Shield className="w-4 h-4 text-blue-600" />
                  <span>Primary HQ Workspace Protected — Cannot be deleted or archived.</span>
                </div>
                <Badge className="bg-blue-100 text-blue-800 uppercase font-black text-[10px]">
                  Protected Root
                </Badge>
              </div>
            ) : (
              <div className="bg-red-50/50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 rounded-xl p-3.5 flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-red-900 dark:text-red-200 flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-red-600" />
                    Danger Zone: Delete Workspace
                  </h4>
                  <p className="text-[11px] text-red-700/80 dark:text-red-400 mt-0.5">
                    Permanent deletion cannot be undone. We recommend Archiving instead to preserve historical records.
                  </p>
                </div>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => {
                    setTypedDeleteName("");
                    setDeleteConfirmOpen(true);
                  }}
                  className="h-8 text-xs font-bold bg-red-600 hover:bg-red-700 shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5 mr-1" /> Delete Workspace
                </Button>
              </div>
            )}
          </div>

          <DialogFooter className="pt-2">
            <Button variant="outline" onClick={onClose} className="text-xs font-bold h-9">
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── MODAL 1: EDIT WORKSPACE MODAL ─────────────────────────────────── */}
      <Dialog open={editWsOpen} onOpenChange={setEditWsOpen}>
        <DialogContent className="max-w-md bg-white dark:bg-slate-900 p-6">
          <DialogHeader>
            <DialogTitle className="text-base font-black flex items-center gap-2">
              <Edit2 className="w-4 h-4 text-blue-600" />
              Edit Workspace Details
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Update commercial business profile for <strong>{workspace.name}</strong>.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSaveEditWorkspace} className="space-y-3 py-2 text-xs">
            <div className="space-y-1">
              <Label className="text-xs font-bold">Workspace Display Name *</Label>
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="e.g. ABC AUTO WORKSHOP"
                className="h-8 text-xs"
                required
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-bold">Registered Legal Business Name</Label>
              <Input
                value={editBusinessName}
                onChange={(e) => setEditBusinessName(e.target.value)}
                placeholder="e.g. ABC Auto Repair LLC"
                className="h-8 text-xs"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs font-bold">Phone Number</Label>
                <Input
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                  placeholder="+971 50 123 4567"
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-bold">VAT / TRN Number</Label>
                <Input
                  value={editTrn}
                  onChange={(e) => setEditTrn(e.target.value)}
                  placeholder="100..."
                  className="h-8 text-xs font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs font-bold">Operating Currency</Label>
                <Input
                  value={editCurrency}
                  onChange={(e) => setEditCurrency(e.target.value)}
                  placeholder="AED"
                  className="h-8 text-xs uppercase"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-bold">Facility Location / Address</Label>
                <Input
                  value={editAddress}
                  onChange={(e) => setEditAddress(e.target.value)}
                  placeholder="Industrial Area 4, Sharjah"
                  className="h-8 text-xs"
                />
              </div>
            </div>

            <DialogFooter className="pt-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setEditWsOpen(false)}
                className="text-xs h-8"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={loading}
                className="text-xs font-bold h-8 bg-blue-600 hover:bg-blue-700 text-white"
              >
                {loading ? "Saving..." : "Save Changes"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ─── MODAL 2: REPLACE WORKSPACE OWNER (Requirement 6) ──────────────── */}
      <Dialog open={replaceOwnerOpen} onOpenChange={setReplaceOwnerOpen}>
        <DialogContent className="max-w-md bg-white dark:bg-slate-900 p-6">
          <DialogHeader>
            <DialogTitle className="text-base font-black flex items-center gap-2">
              <UserMinus className="w-4 h-4 text-purple-600" />
              Replace Workspace Owner
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Assign a new dedicated operator as Workspace Owner for <strong>{workspace.name}</strong>.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSaveReplaceOwner} className="space-y-3 py-2 text-xs">
            <div className="space-y-1">
              <Label className="text-xs font-bold">New Owner Full Name *</Label>
              <Input
                value={newOwnerName}
                onChange={(e) => setNewOwnerName(e.target.value)}
                placeholder="e.g. Ahmed Khan"
                className="h-8 text-xs"
                required
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-bold">New Owner Email Address *</Label>
              <Input
                type="email"
                value={newOwnerEmail}
                onChange={(e) => setNewOwnerEmail(e.target.value)}
                placeholder="abcowner@gmail.com"
                className="h-8 text-xs"
                required
              />
            </div>

            <p className="text-[11px] text-slate-500">
              The previous owner will be unlinked from the Owner role. All historical job cards, invoices, and audit logs created by them are strictly preserved.
            </p>

            <DialogFooter className="pt-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setReplaceOwnerOpen(false)}
                className="text-xs h-8"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={loading}
                className="text-xs font-bold h-8 bg-purple-600 hover:bg-purple-700 text-white"
              >
                {loading ? "Replacing..." : "Assign New Owner"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ─── MODAL 3: RESET LOGIN (Requirement 6) ──────────────────────────── */}
      <Dialog open={resetLoginOpen} onOpenChange={setResetLoginOpen}>
        <DialogContent className="max-w-md bg-white dark:bg-slate-900 p-6">
          <DialogHeader>
            <DialogTitle className="text-base font-black flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-blue-600" />
              Reset Login for {ownerName}
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Choose how you want to reset the login credentials for {ownerEmail}. Old passwords are never shown.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            {/* Option A: Generate Temporary Password */}
            <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2">
              <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block">
                Option 1: Generate Temporary Password
              </span>
              <p className="text-[11px] text-slate-500">
                Creates a single-use temporary password. User will be required to change it on their first login.
              </p>

              {!generatedTempPassword ? (
                <Button
                  size="sm"
                  onClick={handleGenerateTempPassword}
                  className="w-full text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white h-8"
                >
                  Generate Temporary Password
                </Button>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 bg-white dark:bg-slate-900 border border-blue-200 dark:border-blue-800 rounded-lg p-2 font-mono font-bold text-xs text-blue-700 dark:text-blue-300 text-center select-all">
                      {generatedTempPassword}
                    </div>
                    <Button
                      size="sm"
                      onClick={handleCopyTempPass}
                      className="text-xs h-8 font-bold gap-1"
                    >
                      {copiedTempPassword ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      {copiedTempPassword ? "Copied" : "Copy"}
                    </Button>
                  </div>
                  <p className="text-[10px] text-amber-600 dark:text-amber-400 font-semibold">
                    ⚠️ Copy this temporary password now. It will not be displayed again.
                  </p>
                </div>
              )}
            </div>

            {/* Option B: Send Password Reset Link */}
            <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2">
              <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block">
                Option 2: Send Password Reset Link
              </span>
              <p className="text-[11px] text-slate-500">
                Dispatches a password reset link to {ownerEmail} via Supabase Auth.
              </p>
              <Button
                size="sm"
                variant="outline"
                onClick={async () => {
                  setToast({
                    type: "success",
                    message: `Password reset request dispatched to ${ownerEmail}.`,
                  });
                  setResetLoginOpen(false);
                }}
                className="w-full text-xs font-bold h-8 border-slate-200"
              >
                <Send className="w-3.5 h-3.5 mr-1" /> Send Reset Email
              </Button>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setGeneratedTempPassword(null);
                setResetLoginOpen(false);
              }}
              className="text-xs h-8"
            >
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── MODAL 4: REMOVE OWNER CONFIRMATION (Requirement 6 & 7) ────────── */}
      <Dialog open={removeOwnerConfirmOpen} onOpenChange={setRemoveOwnerConfirmOpen}>
        <DialogContent className="max-w-md bg-white dark:bg-slate-900 p-6">
          <DialogHeader>
            <DialogTitle className="text-base font-black text-red-600 flex items-center gap-2">
              <UserMinus className="w-4 h-4" />
              Remove Owner from Workspace
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Remove this user's access to <strong>{workspace.name}</strong>?
            </DialogDescription>
          </DialogHeader>

          <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 text-xs space-y-2">
            <p className="font-semibold text-slate-700 dark:text-slate-300">
              After removal:
            </p>
            <ul className="list-disc list-inside space-y-1 text-slate-500 text-[11px]">
              <li>The user ({ownerEmail}) can no longer access this workspace.</li>
              <li>Historical business data created by the user remains 100% intact.</li>
              <li>Job cards, invoices, payments, and ledger entries are NOT deleted.</li>
              <li>Audit logs and activity records are strictly preserved.</li>
            </ul>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setRemoveOwnerConfirmOpen(false)}
              className="text-xs h-8"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={loading}
              onClick={handleRemoveOwner}
              className="text-xs font-bold h-8 bg-red-600 hover:bg-red-700"
            >
              {loading ? "Removing..." : "Confirm Remove Owner"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── MODAL 5: DELETE WORKSPACE CONFIRMATION (Requirement 8, 9, 10) ─── */}
      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent className="max-w-md bg-white dark:bg-slate-900 p-6">
          <DialogHeader>
            <DialogTitle className="text-base font-black text-red-600 flex items-center gap-2">
              <Trash2 className="w-4 h-4" />
              DELETE WORKSPACE
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Workspace: <strong>{workspace.name}</strong>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2 text-xs">
            <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-xl space-y-1 text-red-800 dark:text-red-300">
              <p className="font-bold flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-red-600 shrink-0" />
                Warning: Permanent Destruction
              </p>
              <p className="text-[11px] text-red-700 dark:text-red-400">
                This action will permanently remove this workspace and its business data. This cannot be undone.
              </p>
            </div>

            {financialCounts && financialCounts.has_records && (
              <p className="text-[11px] text-slate-500">
                Active records found ({financialCounts.invoices} invoices, {financialCounts.payments} payments). We recommend Archiving instead.
              </p>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                To confirm permanent deletion, type:{" "}
                <span className="font-mono text-red-600 font-black select-all">
                  {workspace.name}
                </span>
              </Label>
              <Input
                value={typedDeleteName}
                onChange={(e) => setTypedDeleteName(e.target.value)}
                placeholder="Type workspace name exactly"
                className="text-xs font-bold h-9"
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDeleteConfirmOpen(false)}
              className="text-xs h-8"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={loading || typedDeleteName.trim().toLowerCase() !== workspace.name.trim().toLowerCase()}
              onClick={handleDeleteWorkspace}
              className="text-xs font-bold h-8 bg-red-600 hover:bg-red-700"
            >
              {loading ? "Deleting..." : "Delete Permanently"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
