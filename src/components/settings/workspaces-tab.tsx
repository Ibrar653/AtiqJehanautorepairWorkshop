"use client";

import React, { useState, useMemo } from "react";
import { useWorkspace } from "@/lib/context/workspace-context";
import { useAuth } from "@/lib/context/auth-context";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Building2,
  Plus,
  Search,
  CheckCircle2,
  Shield,
  ArrowRight,
  RefreshCw,
  Clock,
  Sparkles,
  Layers,
  Power,
  Sliders,
  Users,
  Archive,
  RotateCcw,
  AlertTriangle,
  UserMinus,
  ShieldCheck,
  Mail,
  Loader2,
  Trash2,
  MoreVertical,
  Calendar,
  Lock,
  Unlock,
  Ban,
  AlertCircle,
} from "lucide-react";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CreateWorkspaceModal } from "./create-workspace-modal";
import { WorkspaceOwnerPanelModal } from "./workspace-owner-panel-modal";
import { ManageUserAccessModal } from "./manage-user-access-modal";
import {
  archiveWorkspace,
  restoreWorkspace,
  deleteWorkspace,
  suspendWorkspace,
  reactivateWorkspace,
  suspendWorkspaceOwner,
  restoreWorkspaceOwner,
  removeWorkspaceUser,
  restoreWorkspaceUser,
  approveWorkspace,
  rejectWorkspace,
  renewWorkspaceAccess,
  formatTimeRemaining,
  isMembershipExpired,
  calculateAccessExpiry,
  getLocalMembers,
} from "@/lib/services/workspace-service";
import { getUsers, updateUserAccessControls } from "@/lib/services/user-service";
import { DEFAULT_WORKSPACE_ID, PRIMARY_OWNER_EMAIL } from "@/lib/constants";
import type { Workspace, User, WorkspaceMember } from "@/types/database";

const RENEW_DURATION_OPTIONS = [
  { value: "7_days", label: "7 Days" },
  { value: "30_days", label: "30 Days" },
  { value: "3_months", label: "3 Months" },
  { value: "6_months", label: "6 Months" },
  { value: "1_year", label: "1 Year" },
  { value: "custom", label: "Custom Expiry Date" },
  { value: "no_expiry", label: "No Expiry" },
];

interface WorkspacesTabProps {
  embedded?: boolean;
}

export function WorkspacesTab({ embedded = false }: WorkspacesTabProps) {
  const {
    workspaces,
    currentWorkspace,
    switchWorkspace,
    isPlatformOwner,
    refreshWorkspaces,
  } = useWorkspace();
  const { user: currentUser } = useAuth();

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState("");
  const [subTab, setSubTab] = useState<"active" | "pending" | "archived">("active");

  // Modals
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [selectedWorkspace, setSelectedWorkspace] = useState<Workspace | null>(null);

  // Renew Access Modal State (PART 9)
  const [renewTargetWorkspace, setRenewTargetWorkspace] = useState<Workspace | null>(null);
  const [renewDuration, setRenewDuration] = useState<string>("30_days");
  const [renewCustomDate, setRenewCustomDate] = useState<string>("");
  const [renewingAccess, setRenewingAccess] = useState<boolean>(false);

  // Direct Delete Modal state (Requirement 8, 9, 10)
  const [deleteTargetWorkspace, setDeleteTargetWorkspace] = useState<Workspace | null>(null);
  const [typedDeleteName, setTypedDeleteName] = useState("");
  const [deletingWorkspace, setDeletingWorkspace] = useState(false);

  // Reject Workspace Modal state (Requirement 9, 11)
  const [rejectTargetWorkspace, setRejectTargetWorkspace] = useState<Workspace | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [rejectingWorkspace, setRejectingWorkspace] = useState(false);

  // Manage Users / Manage Access scoped modal
  const [manageUsersWorkspace, setManageUsersWorkspace] = useState<Workspace | null>(null);
  const [managePermissionsUser, setManagePermissionsUser] = useState<User | null>(null);
  const [workspaceStaff, setWorkspaceStaff] = useState<User[]>([]);
  const [loadingStaff, setLoadingStaff] = useState(false);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);

  // Remove Access confirmation modal
  const [removeConfirmStaff, setRemoveConfirmStaff] = useState<User | null>(null);

  // Notifications
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const showToast = (type: "success" | "error", message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4500);
  };

  // Top Stats calculation (Requirement 2 & 9)
  const activeCount = useMemo(
    () => workspaces.filter((w) => w.status === "active").length,
    [workspaces]
  );
  const pendingWorkspaces = useMemo(
    () => workspaces.filter((w) => w.status === "pending"),
    [workspaces]
  );
  const pendingCount = pendingWorkspaces.length;
  const archivedCount = useMemo(
    () => workspaces.filter((w) => w.status === "archived" || w.status === "rejected").length,
    [workspaces]
  );

  const totalWorkspaceUsers = useMemo(() => {
    try {
      const members = getLocalMembers();
      return members.filter((m) => m.status === "active").length;
    } catch {
      return 1;
    }
  }, [workspaces, manageUsersWorkspace]);

  // Filter workspaces based on search and active/pending/archived subtab
  const filteredWorkspaces = useMemo(() => {
    return workspaces.filter((ws) => {
      if (subTab === "active" && ws.status !== "active") return false;
      if (subTab === "pending" && ws.status !== "pending") return false;
      if (subTab === "archived" && ws.status !== "archived" && ws.status !== "rejected") return false;

      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        ws.name.toLowerCase().includes(q) ||
        (ws.workspace_code && ws.workspace_code.toLowerCase().includes(q)) ||
        (ws.code && ws.code.toLowerCase().includes(q)) ||
        (ws.business_name && ws.business_name.toLowerCase().includes(q)) ||
        (ws.owner_name && ws.owner_name.toLowerCase().includes(q)) ||
        (ws.owner_email && ws.owner_email.toLowerCase().includes(q)) ||
        (ws.email && ws.email.toLowerCase().includes(q))
      );
    });
  }, [workspaces, searchQuery, subTab]);

  // Approve Workspace (Requirement 10)
  const handleApproveWorkspace = async (ws: Workspace) => {
    setLoadingAction(ws.id);
    try {
      const res = await approveWorkspace(ws.id);
      if (res.success) {
        showToast("success", `Workspace "${ws.name}" approved and activated!`);
        await refreshWorkspaces();
      } else {
        showToast("error", res.error || "Failed to approve workspace.");
      }
    } catch (e: any) {
      showToast("error", e.message || "Approval failed.");
    } finally {
      setLoadingAction(null);
    }
  };

  // Reject Workspace (Requirement 11)
  const handleConfirmRejectWorkspace = async () => {
    if (!rejectTargetWorkspace) return;
    setRejectingWorkspace(true);
    try {
      const res = await rejectWorkspace(rejectTargetWorkspace.id, rejectionReason.trim());
      if (res.success) {
        showToast("success", `Workspace "${rejectTargetWorkspace.name}" rejected.`);
        setRejectTargetWorkspace(null);
        setRejectionReason("");
        await refreshWorkspaces();
      } else {
        showToast("error", res.error || "Failed to reject workspace.");
      }
    } catch (e: any) {
      showToast("error", e.message || "Rejection failed.");
    } finally {
      setRejectingWorkspace(false);
    }
  };

  // Open Manage Users / Manage Access modal scoped to a specific workspace (Requirement 5 & 15)
  const handleOpenManageUsers = async (workspace: Workspace) => {
    setManageUsersWorkspace(workspace);
    setLoadingStaff(true);
    try {
      const staff = await getUsers(workspace.id);
      setWorkspaceStaff(staff);
    } catch (e: any) {
      showToast("error", "Failed to load workspace staff.");
    } finally {
      setLoadingStaff(false);
    }
  };

  // Suspend / Reactivate staff access in workspace
  const handleToggleStaffSuspend = async (user: User) => {
    if (!manageUsersWorkspace) return;
    setLoadingAction(user.id);
    try {
      const isSuspended = user.status === "suspended" || user.membership_status === "suspended";
      const newStatus = isSuspended ? "active" : "suspended";

      await updateUserAccessControls(
        user.id,
        { status: newStatus },
        { id: currentUser?.id || "usr-owner-001", name: currentUser?.full_name || "Primary Owner" }
      );

      showToast("success", `Staff member access ${isSuspended ? "reactivated" : "suspended"}.`);
      const updatedStaff = await getUsers(manageUsersWorkspace.id);
      setWorkspaceStaff(updatedStaff);
    } catch (e: any) {
      showToast("error", e.message || "Failed to update staff status.");
    } finally {
      setLoadingAction(null);
    }
  };

  // Remove staff access from workspace (Requirement 5 & 15)
  const handleConfirmRemoveStaff = async () => {
    if (!manageUsersWorkspace || !removeConfirmStaff) return;
    setLoadingAction(removeConfirmStaff.id);
    try {
      const res = await removeWorkspaceUser(
        manageUsersWorkspace.id,
        removeConfirmStaff.id,
        currentUser?.full_name || "Primary Owner"
      );

      if (res.success) {
        showToast(
          "success",
          `Removed ${removeConfirmStaff.full_name}'s access to ${manageUsersWorkspace.name}. Historical records preserved.`
        );
        setRemoveConfirmStaff(null);
        const updatedStaff = await getUsers(manageUsersWorkspace.id);
        setWorkspaceStaff(updatedStaff);
      } else {
        showToast("error", res.error || "Failed to remove staff access.");
      }
    } catch (e: any) {
      showToast("error", e.message || "Failed to remove staff access.");
    } finally {
      setLoadingAction(null);
    }
  };

  // Restore staff access to workspace
  const handleRestoreStaffToWorkspace = async (user: User) => {
    if (!manageUsersWorkspace) return;
    setLoadingAction(user.id);
    try {
      const res = await restoreWorkspaceUser(
        manageUsersWorkspace.id,
        user.id,
        currentUser?.full_name || "Primary Owner"
      );

      if (res.success) {
        showToast("success", `Restored ${user.full_name}'s access to ${manageUsersWorkspace.name}.`);
        const updatedStaff = await getUsers(manageUsersWorkspace.id);
        setWorkspaceStaff(updatedStaff);
      } else {
        showToast("error", res.error || "Failed to restore access.");
      }
    } catch (e: any) {
      showToast("error", e.message || "Failed to restore access.");
    } finally {
      setLoadingAction(null);
    }
  };

  // Renew Workspace Access (PART 9)
  const handleConfirmRenewAccess = async () => {
    if (!renewTargetWorkspace) return;
    setRenewingAccess(true);
    try {
      const res = await renewWorkspaceAccess({
        workspace_id: renewTargetWorkspace.id,
        user_email: renewTargetWorkspace.owner_email || renewTargetWorkspace.email || undefined,
        duration: renewDuration,
        custom_expiry_date: renewDuration === "custom" && renewCustomDate ? new Date(renewCustomDate).toISOString() : undefined,
        renewed_by: currentUser?.full_name || "Primary Owner",
      });

      if (res.success) {
        showToast("success", `Workspace access for "${renewTargetWorkspace.name}" has been successfully renewed.`);
        setRenewTargetWorkspace(null);
        setRenewCustomDate("");
        await refreshWorkspaces();
      } else {
        showToast("error", res.error || "Failed to renew access.");
      }
    } catch (e: any) {
      showToast("error", e.message || "Failed to renew workspace access.");
    } finally {
      setRenewingAccess(false);
    }
  };

  // Suspend / Reactivate Workspace (Requirement 4)
  const handleToggleWorkspaceSuspend = async (ws: Workspace) => {
    if (ws.id === DEFAULT_WORKSPACE_ID) {
      showToast("error", "The primary default headquarters workspace cannot be suspended.");
      return;
    }
    setLoadingAction(ws.id);
    try {
      if (ws.status === "suspended") {
        await reactivateWorkspace(ws.id, currentUser?.full_name || "Primary Owner");
        showToast("success", `Workspace "${ws.name}" reactivated successfully.`);
      } else {
        await suspendWorkspace(ws.id, currentUser?.full_name || "Primary Owner");
        showToast("success", `Workspace "${ws.name}" has been suspended.`);
      }
      refreshWorkspaces();
    } catch (e: any) {
      showToast("error", e?.message || "Failed to update workspace status.");
    } finally {
      setLoadingAction(null);
    }
  };

  // Direct Permanent Delete Confirmation Handler (Requirement 8, 9, 10, 12)
  const handleConfirmDeleteWorkspace = async () => {
    if (!deleteTargetWorkspace) return;
    if (deleteTargetWorkspace.id === DEFAULT_WORKSPACE_ID) {
      showToast("error", "The primary default headquarters workspace is permanently protected.");
      return;
    }
    if (typedDeleteName.trim().toLowerCase() !== deleteTargetWorkspace.name.trim().toLowerCase()) {
      showToast("error", "Workspace name confirmation does not match.");
      return;
    }

    setDeletingWorkspace(true);
    try {
      const res = await deleteWorkspace(
        deleteTargetWorkspace.id,
        typedDeleteName.trim(),
        currentUser?.full_name || "Primary Owner"
      );
      if (res.success) {
        showToast("success", `Workspace "${deleteTargetWorkspace.name}" has been permanently deleted.`);
        setDeleteTargetWorkspace(null);
        setTypedDeleteName("");
        refreshWorkspaces();
      } else {
        showToast("error", res.error || "Failed to delete workspace.");
      }
    } catch (e: any) {
      showToast("error", e?.message || "Workspace deletion failed.");
    } finally {
      setDeletingWorkspace(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {toast && (
        <div
          className={`p-3 rounded-xl border text-xs font-semibold flex items-center justify-between shadow-md transition-all ${
            toast.type === "success"
              ? "bg-emerald-50 text-emerald-800 border-emerald-200"
              : "bg-red-50 text-red-800 border-red-200"
          }`}
        >
          <span>{toast.message}</span>
          <button
            onClick={() => setToast(null)}
            className="text-slate-400 hover:text-slate-700 ml-3"
          >
            ✕
          </button>
        </div>
      )}

      {/* ─── 1. TOP STATS CARDS (Requirement 2) ───────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
        <div className="bg-white dark:bg-[#172033] border border-slate-200/80 dark:border-[#273449] rounded-xl p-4 shadow-xs flex items-center justify-between">
          <div className="flex flex-col justify-center min-w-0">
            <p className="text-[11px] font-semibold text-[#64748B] dark:text-slate-400 uppercase tracking-[0.03em]">
              Total Workspaces
            </p>
            <p className="text-[22px] sm:text-[24px] font-bold text-[#0F172A] dark:text-slate-100 font-mono tabular-nums leading-tight mt-0.5">
              {workspaces.length}
            </p>
          </div>
          <div className="w-9 h-9 rounded-lg bg-purple-50 dark:bg-purple-950/50 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0">
            <Building2 className="w-[18px] h-[18px]" aria-hidden="true" />
          </div>
        </div>

        <div className="bg-white dark:bg-[#172033] border border-slate-200/80 dark:border-[#273449] rounded-xl p-4 shadow-xs flex items-center justify-between">
          <div className="flex flex-col justify-center min-w-0">
            <p className="text-[11px] font-semibold text-[#64748B] dark:text-slate-400 uppercase tracking-[0.03em]">
              Active Workspaces
            </p>
            <p className="text-[22px] sm:text-[24px] font-bold text-emerald-600 dark:text-emerald-400 font-mono tabular-nums leading-tight mt-0.5">
              {activeCount}
            </p>
          </div>
          <div className="w-9 h-9 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-[18px] h-[18px]" aria-hidden="true" />
          </div>
        </div>

        <div className="bg-white dark:bg-[#172033] border border-slate-200/80 dark:border-[#273449] rounded-xl p-4 shadow-xs flex items-center justify-between">
          <div className="flex flex-col justify-center min-w-0">
            <p className="text-[11px] font-semibold text-[#64748B] dark:text-slate-400 uppercase tracking-[0.03em]">
              Pending Approvals
            </p>
            <p className="text-[22px] sm:text-[24px] font-bold text-amber-600 dark:text-amber-400 font-mono tabular-nums leading-tight mt-0.5">
              {pendingCount}
            </p>
          </div>
          <div className="w-9 h-9 rounded-lg bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
            <Clock className="w-[18px] h-[18px]" aria-hidden="true" />
          </div>
        </div>

        <div className="bg-white dark:bg-[#172033] border border-slate-200/80 dark:border-[#273449] rounded-xl p-4 shadow-xs flex items-center justify-between">
          <div className="flex flex-col justify-center min-w-0">
            <p className="text-[11px] font-semibold text-[#64748B] dark:text-slate-400 uppercase tracking-[0.03em]">
              Total Workspace Users
            </p>
            <p className="text-[22px] sm:text-[24px] font-bold text-blue-600 dark:text-blue-400 font-mono tabular-nums leading-tight mt-0.5">
              {totalWorkspaceUsers}
            </p>
          </div>
          <div className="w-9 h-9 rounded-lg bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
            <Users className="w-[18px] h-[18px]" aria-hidden="true" />
          </div>
        </div>
      </div>

      {/* ─── PENDING OWNER APPROVALS SECTION (Requirement 9) ──────────────── */}
      {isPlatformOwner && pendingCount > 0 && (
        <Card className="border-2 border-amber-300 bg-amber-50/50 dark:bg-amber-950/20 shadow-sm rounded-xl overflow-hidden">
          <CardHeader className="pb-3 border-b border-amber-200/80">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center font-bold">
                  <AlertCircle className="w-4 h-4" />
                </div>
                <div>
                  <CardTitle className="text-sm font-black text-amber-950 dark:text-amber-100 flex items-center gap-2">
                    Pending Workspace Approvals
                    <Badge className="bg-amber-200 text-amber-950 border border-amber-300 text-[10px] font-black">
                      {pendingCount} AWAITING APPROVAL
                    </Badge>
                  </CardTitle>
                  <CardDescription className="text-xs text-amber-800 dark:text-amber-300">
                    Review newly created workspaces and approve or reject access.
                  </CardDescription>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-amber-100/60 dark:bg-amber-950/40 text-[#64748B] dark:text-slate-400 font-bold text-[10.5px] uppercase tracking-[0.04em] border-b border-amber-200 dark:border-amber-800">
                  <tr className="h-10">
                    <th className="py-2.5 px-4 font-bold">Workspace Name</th>
                    <th className="py-2.5 px-4 font-bold">Workspace Code</th>
                    <th className="py-2.5 px-4 font-bold">Owner Email</th>
                    <th className="py-2.5 px-4 font-bold">Role</th>
                    <th className="py-2.5 px-4 font-bold">Created Date</th>
                    <th className="py-2.5 px-4 font-bold">Status</th>
                    <th className="py-2.5 px-4 text-right font-bold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-amber-100/80 dark:divide-amber-950/40 bg-white dark:bg-slate-900 text-[12.5px] text-[#334155] dark:text-slate-300">
                  {pendingWorkspaces.map((ws) => (
                    <tr key={ws.id} className="h-12 hover:bg-amber-50/40 dark:hover:bg-amber-950/20 transition-colors">
                      <td className="py-2.5 px-4">
                        <span className="text-[13px] font-bold text-[#0F172A] dark:text-slate-100 block">
                          {ws.name}
                        </span>
                        {ws.business_name && ws.business_name !== ws.name && (
                          <span className="text-[11px] text-[#64748B] dark:text-slate-400 mt-0.5 block">
                            {ws.business_name}
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-4 font-mono font-bold text-[11.5px] text-blue-600 dark:text-blue-400">
                        {ws.workspace_code || ws.code || "PENDING"}
                      </td>
                      <td className="py-2.5 px-4">
                        <span className="font-mono text-[#64748B] dark:text-slate-400 text-[11.5px] block">
                          {ws.owner_email || ws.email || "N/A"}
                        </span>
                        {ws.owner_name && (
                          <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium block mt-0.5">
                            {ws.owner_name}
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-4 font-semibold text-[11px] text-slate-700 dark:text-slate-300 uppercase">
                        Owner
                      </td>
                      <td className="py-2.5 px-4 text-[#64748B] dark:text-slate-400 text-[11px]">
                        {ws.created_at ? new Date(ws.created_at).toLocaleDateString() : "Today"}
                      </td>
                      <td className="py-2.5 px-4">
                        <Badge className="bg-amber-50 text-amber-800 border border-amber-300 dark:bg-amber-950/60 dark:text-amber-300 text-[10px] font-bold uppercase tracking-wider">
                          Pending Approval
                        </Badge>
                      </td>
                      <td className="py-2.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            size="sm"
                            onClick={() => handleApproveWorkspace(ws)}
                            disabled={loadingAction === ws.id}
                            className="text-[12px] h-8 px-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold gap-1.5 shadow-xs"
                          >
                            {loadingAction === ws.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                            ) : (
                              <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                            )}
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setRejectTargetWorkspace(ws);
                              setRejectionReason("");
                            }}
                            disabled={loadingAction === ws.id}
                            className="text-[12px] h-8 px-2.5 border-red-200 text-red-600 hover:bg-red-50 font-semibold gap-1.5"
                          >
                            <Ban className="w-3.5 h-3.5" aria-hidden="true" /> Reject
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ─── 2. WORKSPACES DIRECTORY TABLE (Requirement 3 & 4) ────────────── */}
      <Card className="border border-slate-200/80 shadow-xs bg-white rounded-xl overflow-hidden">
        <CardHeader className="pb-3 border-b border-slate-100 dark:border-slate-800">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base font-black flex items-center gap-2 text-slate-900 dark:text-slate-100">
                <Building2 className="w-5 h-5 text-purple-600" />
                Workspaces &amp; Businesses
              </CardTitle>
              <CardDescription className="text-xs text-slate-500 mt-0.5">
                Independent business workshop locations, assigned staff rosters, and owner controls.
              </CardDescription>
            </div>

            <div className="flex items-center gap-2">
              <div className="relative w-56">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <Input
                  placeholder="Search workspaces..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="text-xs h-8 pl-8"
                />
              </div>

              {isPlatformOwner && (
                <Button
                  onClick={() => setCreateModalOpen(true)}
                  className="bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold h-8 gap-1 shadow-xs"
                >
                  <Plus className="w-3.5 h-3.5" /> Create Workspace
                </Button>
              )}
            </div>
          </div>

          {/* Subtabs: Active, Pending, Archived Workspaces */}
          <div className="flex items-center gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
            <button
              onClick={() => setSubTab("active")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
                subTab === "active"
                  ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-xs"
                  : "bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-400"
              }`}
            >
              <span>Active Workspaces</span>
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full font-black ${
                  subTab === "active"
                    ? "bg-white/20 text-white dark:bg-black/20 dark:text-black"
                    : "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-400"
                }`}
              >
                {activeCount}
              </span>
            </button>

            <button
              onClick={() => setSubTab("pending")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
                subTab === "pending"
                  ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-xs"
                  : "bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-400"
              }`}
            >
              <span>Pending Approval</span>
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full font-black ${
                  subTab === "pending"
                    ? "bg-white/20 text-white dark:bg-black/20 dark:text-black"
                    : "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-400"
                }`}
              >
                {pendingCount}
              </span>
            </button>

            <button
              onClick={() => setSubTab("archived")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
                subTab === "archived"
                  ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-xs"
                  : "bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-400"
              }`}
            >
              <span>Archived / Rejected</span>
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full font-black ${
                  subTab === "archived"
                    ? "bg-white/20 text-white dark:bg-black/20 dark:text-black"
                    : "bg-slate-200 text-slate-800 dark:bg-slate-800 dark:text-slate-300"
                }`}
              >
                {archivedCount}
              </span>
            </button>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/80 dark:bg-slate-900/80 text-[#64748B] dark:text-slate-400 font-bold text-[10.5px] uppercase tracking-[0.04em] border-b border-slate-200/80 dark:border-slate-800 sticky top-0 z-10">
                <tr className="h-10">
                  <th className="py-2.5 px-4 font-bold">Workspace</th>
                  <th className="py-2.5 px-4 font-bold">Owner</th>
                  <th className="py-2.5 px-4 font-bold">Owner Email</th>
                  <th className="py-2.5 px-4 font-bold">Status</th>
                  <th className="py-2.5 px-4 font-bold">Access Starts</th>
                  <th className="py-2.5 px-4 font-bold">Access Expires</th>
                  <th className="py-2.5 px-4 font-bold">Time Remaining</th>
                  <th className="py-2.5 px-4 font-bold">Users</th>
                  <th className="py-2.5 px-4 text-right w-[220px] whitespace-nowrap font-bold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-[12.5px] text-[#334155] dark:text-slate-300">
                {filteredWorkspaces.map((ws) => {
                  const isCurrent = ws.id === currentWorkspace.id;
                  const isPrimary = ws.id === DEFAULT_WORKSPACE_ID;
                  const ownerName = ws.owner_name || "Assigned Operator";
                  const ownerEmail = ws.owner_email || ws.email || "owner@email.com";
                  const allMembersForWs = getLocalMembers().filter((m) => m.workspace_id === ws.id);
                  const activeMembersForWs = allMembersForWs.filter((m) => m.status === "active");
                  const wsUsersCount = activeMembersForWs.length;

                  // Find owner member record for access duration info
                  const ownerMember = allMembersForWs.find(
                    (m) =>
                      m.is_workspace_owner ||
                      m.role === "owner" ||
                      (ownerEmail && m.user_id?.toLowerCase() === ownerEmail.toLowerCase())
                  );

                  const isExpired =
                    isMembershipExpired(ownerMember?.access_expires_at, ownerMember?.status || ws.status);

                  return (
                    <tr
                      key={ws.id}
                      className={`h-12 transition-colors hover:bg-slate-50/70 dark:hover:bg-slate-800/30 ${
                        isCurrent ? "bg-purple-50/30 dark:bg-purple-950/20" : ""
                      } ${isExpired ? "bg-rose-50/20 dark:bg-rose-950/10" : ""}`}
                    >
                      {/* Workspace Name */}
                      <td className="py-2.5 px-4">
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs shrink-0 ${
                              isPrimary
                                ? "bg-blue-600 text-white shadow-xs"
                                : "bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300"
                            }`}
                          >
                            {ws.name.slice(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="text-[13px] font-bold text-[#0F172A] dark:text-slate-100">
                                {ws.name}
                              </span>
                              {isPrimary ? (
                                <Badge className="bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 border border-blue-200 dark:border-blue-800 text-[9.5px] font-bold uppercase tracking-wider">
                                  PRIMARY WORKSPACE
                                </Badge>
                              ) : (
                                <Badge className="bg-purple-50 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300 border border-purple-200 dark:border-purple-800 text-[9.5px] font-bold uppercase tracking-wider">
                                  SECONDARY
                                </Badge>
                              )}
                              {isCurrent && (
                                <Badge className="bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 text-[9.5px] font-bold">
                                  Active Session
                                </Badge>
                              )}
                            </div>
                            <div className="text-[11px] text-[#64748B] dark:text-slate-400 mt-0.5">
                              {ws.business_name || ws.address || "Sharjah, UAE"}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Workspace Owner */}
                      <td className="py-2.5 px-4">
                        <span className="text-[12px] font-semibold text-slate-800 dark:text-slate-200">
                          {ownerName}
                        </span>
                      </td>

                      {/* Owner Email */}
                      <td className="py-2.5 px-4">
                        <span className="font-mono text-[#64748B] dark:text-slate-400 text-[11.5px]">
                          {ownerEmail}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="py-2.5 px-4">
                        {isExpired ? (
                          <Badge className="bg-rose-100 text-rose-800 border border-rose-300 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800 text-[10px] uppercase font-bold tracking-wider">
                            EXPIRED
                          </Badge>
                        ) : (
                          <Badge
                            className={`text-[10px] uppercase font-bold tracking-wider ${
                              ws.status === "active"
                                ? "bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800"
                                : ws.status === "pending"
                                ? "bg-amber-50 text-amber-800 border border-amber-300 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800"
                                : ws.status === "archived"
                                ? "bg-slate-100 text-slate-700 border border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700"
                                : "bg-red-50 text-red-700 border border-red-200 dark:bg-red-950/60 dark:text-red-300 dark:border-red-800"
                            }`}
                          >
                            {ws.status === "pending" ? "Pending Approval" : ws.status}
                          </Badge>
                        )}
                      </td>

                      {/* Access Starts */}
                      <td className="py-2.5 px-4 text-[#64748B] dark:text-slate-400 text-[11px] font-mono">
                        {ownerMember?.access_starts_at
                          ? new Date(ownerMember.access_starts_at).toLocaleDateString()
                          : ws.created_at
                          ? new Date(ws.created_at).toLocaleDateString()
                          : "-"}
                      </td>

                      {/* Access Expires */}
                      <td className="py-2.5 px-4 text-[11px] font-mono">
                        {ownerMember?.access_expires_at ? (
                          <span
                            className={
                              isExpired
                                ? "text-rose-600 font-bold dark:text-rose-400"
                                : "text-slate-700 dark:text-slate-300 font-medium"
                            }
                          >
                            {new Date(ownerMember.access_expires_at).toLocaleDateString()}
                          </span>
                        ) : (
                          <span className="text-slate-400">No Expiry</span>
                        )}
                      </td>

                      {/* Time Remaining */}
                      <td className="py-2.5 px-4 text-[11px]">
                        {(() => {
                          if (!ownerMember?.access_expires_at) {
                            return <span className="text-slate-400 text-[10px]">Unlimited</span>;
                          }
                          const rem = formatTimeRemaining(ownerMember.access_expires_at);
                          return (
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                isExpired || rem.isExpired
                                  ? "bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300"
                                  : rem.isWarning
                                  ? "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 animate-pulse"
                                  : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                              }`}
                            >
                              {rem.text}
                            </span>
                          );
                        })()}
                      </td>

                      {/* Users Count (Requirement 3) */}
                      <td className="py-2.5 px-4">
                        <span className="text-[12px] font-semibold text-[#0F172A] dark:text-slate-100 font-mono tabular-nums">
                          {wsUsersCount} {wsUsersCount === 1 ? "User" : "Users"}
                        </span>
                      </td>

                      {/* Actions (Requirement 4, 9, 11) */}
                      <td className="py-2.5 px-4 text-right w-[220px] whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* If Workspace is Pending, show direct Approve / Reject actions */}
                          {ws.status === "pending" && isPlatformOwner ? (
                            <>
                              <Button
                                size="sm"
                                onClick={() => handleApproveWorkspace(ws)}
                                disabled={loadingAction === ws.id}
                                className="text-[12px] h-8 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold gap-1.5 shadow-xs px-2.5"
                              >
                                {loadingAction === ws.id ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                                ) : (
                                  <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                                )}
                                Approve
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setRejectTargetWorkspace(ws);
                                  setRejectionReason("");
                                }}
                                disabled={loadingAction === ws.id}
                                className="text-[12px] h-8 border-red-200 text-red-600 hover:bg-red-50 font-semibold gap-1.5 px-2.5"
                              >
                                <Ban className="w-3.5 h-3.5" aria-hidden="true" /> Reject
                              </Button>
                            </>
                          ) : (
                            <>
                              {!isCurrent && ws.status === "active" && !isExpired && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => switchWorkspace(ws.id)}
                                  className="text-[12px] h-8 border-slate-200 hover:bg-purple-50 hover:text-purple-700 font-semibold px-2.5"
                                >
                                  <ArrowRight className="w-3.5 h-3.5 mr-1" aria-hidden="true" /> Open
                                </Button>
                              )}

                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleOpenManageUsers(ws)}
                                className="text-[12px] h-8 border-slate-200 hover:bg-slate-100 font-semibold text-slate-700 dark:text-slate-300 px-2.5"
                              >
                                <Users className="w-3.5 h-3.5 mr-1 text-blue-600" aria-hidden="true" /> Access
                              </Button>

                              {isPlatformOwner && !isPrimary && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    setRenewTargetWorkspace(ws);
                                    setRenewDuration("30_days");
                                    setRenewCustomDate("");
                                  }}
                                  className="text-[12px] h-8 border-amber-200 text-amber-700 hover:bg-amber-50 font-semibold px-2.5 gap-1"
                                >
                                  <Clock className="w-3.5 h-3.5 text-amber-600" aria-hidden="true" /> Renew
                                </Button>
                              )}

                              {isPlatformOwner && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => setSelectedWorkspace(ws)}
                                  className="text-[12px] h-8 border-slate-200 hover:bg-blue-50 hover:text-blue-700 font-semibold px-2.5"
                                >
                                  <Sliders className="w-3.5 h-3.5 mr-1" aria-hidden="true" /> Manage
                                </Button>
                              )}

                              {isPlatformOwner && (
                                <DropdownMenu>
                                  <DropdownMenuTrigger className="h-8 w-8 inline-flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer">
                                    <MoreVertical className="w-3.5 h-3.5" aria-hidden="true" />
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end" className="text-xs">
                                    <DropdownMenuLabel>Workspace Actions</DropdownMenuLabel>
                                    {!isCurrent && ws.status === "active" && (
                                      <DropdownMenuItem onClick={() => switchWorkspace(ws.id)}>
                                        <ArrowRight className="w-3.5 h-3.5 mr-2" /> Open Workspace
                                      </DropdownMenuItem>
                                    )}
                                    <DropdownMenuItem onClick={() => setSelectedWorkspace(ws)}>
                                      <Sliders className="w-3.5 h-3.5 mr-2" /> Manage Workspace
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => handleOpenManageUsers(ws)}>
                                      <Users className="w-3.5 h-3.5 mr-2 text-blue-600" /> Manage Access &amp; Users
                                    </DropdownMenuItem>
                                    {!isPrimary && (
                                      <>
                                        <DropdownMenuSeparator />
                                        {/* Suspend / Reactivate Workspace (Requirement 4) */}
                                        {ws.status === "suspended" ? (
                                          <DropdownMenuItem
                                            onClick={() => handleToggleWorkspaceSuspend(ws)}
                                            className="text-emerald-600 font-semibold cursor-pointer"
                                          >
                                            <CheckCircle2 className="w-3.5 h-3.5 mr-2 text-emerald-600" /> Reactivate Workspace
                                          </DropdownMenuItem>
                                        ) : ws.status === "active" ? (
                                          <DropdownMenuItem
                                            onClick={() => handleToggleWorkspaceSuspend(ws)}
                                            className="text-amber-600 font-semibold cursor-pointer"
                                          >
                                            <Ban className="w-3.5 h-3.5 mr-2 text-amber-600" /> Suspend Workspace
                                          </DropdownMenuItem>
                                        ) : null}

                                        {/* Archive / Restore Workspace (Requirement 4, 10) */}
                                        {ws.status === "archived" ? (
                                          <DropdownMenuItem
                                            onClick={async () => {
                                              await restoreWorkspace(ws.id, currentUser?.full_name || "Primary Owner");
                                              refreshWorkspaces();
                                            }}
                                            className="text-emerald-600 font-semibold cursor-pointer"
                                          >
                                            <RotateCcw className="w-3.5 h-3.5 mr-2 text-emerald-600" /> Restore Workspace
                                          </DropdownMenuItem>
                                        ) : (
                                          <DropdownMenuItem
                                            onClick={async () => {
                                              await archiveWorkspace(ws.id, currentUser?.full_name || "Primary Owner");
                                              refreshWorkspaces();
                                            }}
                                            className="text-amber-600 font-semibold cursor-pointer"
                                          >
                                            <Archive className="w-3.5 h-3.5 mr-2 text-amber-600" /> Archive Workspace
                                          </DropdownMenuItem>
                                        )}

                                        {/* Direct Delete Workspace (Requirement 4, 8, 9) */}
                                        <DropdownMenuItem
                                          onClick={() => {
                                            setDeleteTargetWorkspace(ws);
                                            setTypedDeleteName("");
                                          }}
                                          className="text-rose-600 font-semibold cursor-pointer"
                                        >
                                          <Trash2 className="w-3.5 h-3.5 mr-2 text-rose-600" /> Delete Workspace
                                        </DropdownMenuItem>
                                      </>
                                    )}
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}

                {filteredWorkspaces.length === 0 && (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-slate-400">
                      No {subTab} workspaces found matching &quot;{searchQuery}&quot;.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Creation Modal */}
      <CreateWorkspaceModal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        onCreated={() => {
          setCreateModalOpen(false);
          refreshWorkspaces();
        }}
      />

      {/* Workspace Owner Panel Modal (Requirement 16) */}
      <WorkspaceOwnerPanelModal
        isOpen={!!selectedWorkspace}
        workspace={selectedWorkspace}
        onClose={() => setSelectedWorkspace(null)}
        onUpdated={() => {
          refreshWorkspaces();
          if (selectedWorkspace) {
            const updated = workspaces.find((w) => w.id === selectedWorkspace.id);
            setSelectedWorkspace(updated || null);
          }
        }}
        onOpenManageUsers={(ws) => handleOpenManageUsers(ws)}
      />

      {/* ─── 3. MANAGE ACCESS & USERS MODAL (Requirement 5 & 15) ───────────── */}
      {manageUsersWorkspace && (
        <Dialog
          open={Boolean(manageUsersWorkspace)}
          onOpenChange={(open) => !open && setManageUsersWorkspace(null)}
        >
          <DialogContent className="max-w-3xl bg-white dark:bg-slate-900 p-6">
            <DialogHeader className="pb-2">
              <DialogTitle className="text-base font-black flex items-center gap-2 text-slate-900 dark:text-slate-100">
                <Users className="w-5 h-5 text-blue-600" />
                Manage Access: {manageUsersWorkspace.name}
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500">
                Control permissions and access for staff members assigned strictly to <strong>{manageUsersWorkspace.name}</strong>.
              </DialogDescription>
            </DialogHeader>

            <div className="py-3">
              {loadingStaff ? (
                <div className="py-12 flex flex-col items-center justify-center text-slate-400 text-xs">
                  <Loader2 className="w-6 h-6 animate-spin mb-2 text-blue-600" />
                  Loading workspace staff members...
                </div>
              ) : workspaceStaff.length === 0 ? (
                <div className="py-8 text-center text-slate-400 text-xs bg-slate-50 dark:bg-slate-800/40 rounded-xl">
                  No staff members currently assigned to this workspace.
                </div>
              ) : (
                <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-bold uppercase tracking-wider text-[10px]">
                      <tr>
                        <th className="px-3 py-2.5">Name</th>
                        <th className="px-3 py-2.5">Email</th>
                        <th className="px-3 py-2.5">Role</th>
                        <th className="px-3 py-2.5">Status</th>
                        <th className="px-3 py-2.5">Permissions</th>
                        <th className="px-3 py-2.5">Last Login</th>
                        <th className="px-3 py-2.5 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {workspaceStaff.map((u) => {
                        const isPrimary = u.email.toLowerCase() === PRIMARY_OWNER_EMAIL.toLowerCase();
                        const isRemoved = u.membership_status === "removed";
                        const isSuspended = u.status === "suspended" || u.membership_status === "suspended";

                        return (
                          <tr key={u.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                            {/* Name */}
                            <td className="px-3 py-2.5 font-bold text-slate-900 dark:text-slate-100">
                              {u.full_name}
                            </td>

                            {/* Email */}
                            <td className="px-3 py-2.5 font-mono text-[11px] text-slate-500">
                              {u.email}
                            </td>

                            {/* Role */}
                            <td className="px-3 py-2.5">
                              <Badge variant="outline" className="text-[10px] uppercase font-bold">
                                {u.role}
                              </Badge>
                            </td>

                            {/* Status */}
                            <td className="px-3 py-2.5">
                              <Badge
                                className={`text-[10px] uppercase font-bold ${
                                  isRemoved
                                    ? "bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-400"
                                    : isSuspended
                                    ? "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-400"
                                    : "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-400"
                                }`}
                              >
                                {isRemoved ? "Removed" : isSuspended ? "Suspended" : "Active"}
                              </Badge>
                            </td>

                            {/* Permissions (Requirement 5) */}
                            <td className="px-3 py-2.5">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setManagePermissionsUser(u)}
                                className="h-6 text-[11px] font-bold text-purple-700 border-purple-200 hover:bg-purple-50"
                              >
                                <Sliders className="w-3 h-3 mr-1" /> Manage Permissions
                              </Button>
                            </td>

                            {/* Last Login */}
                            <td className="px-3 py-2.5 text-slate-500 text-[11px]">
                              {u.last_login_at
                                ? new Date(u.last_login_at).toLocaleDateString()
                                : "Never logged in"}
                            </td>

                            {/* Actions (Requirement 5: Manage Permissions, Suspend Access, Remove Access) */}
                            <td className="px-3 py-2.5 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                {isRemoved ? (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    disabled={loadingAction === u.id}
                                    onClick={() => handleRestoreStaffToWorkspace(u)}
                                    className="h-7 text-xs px-2 bg-emerald-50 text-emerald-700 border-emerald-300 font-bold gap-1"
                                  >
                                    <RotateCcw className="w-3 h-3" /> Restore Access
                                  </Button>
                                ) : (
                                  <>
                                    {!isPrimary && (
                                      <>
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          disabled={loadingAction === u.id}
                                          onClick={() => handleToggleStaffSuspend(u)}
                                          className={`h-7 text-xs px-2 font-semibold ${
                                            isSuspended ? "text-emerald-600" : "text-amber-600"
                                          }`}
                                        >
                                          {isSuspended ? "Reactivate" : "Suspend Access"}
                                        </Button>

                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          disabled={loadingAction === u.id}
                                          onClick={() => setRemoveConfirmStaff(u)}
                                          className="h-7 text-xs px-2 font-bold text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-950/40"
                                        >
                                          <UserMinus className="w-3 h-3 mr-1" /> Remove Access
                                        </Button>
                                      </>
                                    )}
                                    {isPrimary && (
                                      <span className="text-[11px] text-slate-400 italic">Primary Owner</span>
                                    )}
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setManageUsersWorkspace(null)}
                className="text-xs h-8"
              >
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* ─── 4. CONFIRM REMOVE ACCESS MODAL (Requirement 5 & 7) ────────────── */}
      {removeConfirmStaff && manageUsersWorkspace && (
        <Dialog open={Boolean(removeConfirmStaff)} onOpenChange={(open) => !open && setRemoveConfirmStaff(null)}>
          <DialogContent className="max-w-md bg-white dark:bg-slate-900 p-6">
            <DialogHeader>
              <DialogTitle className="text-base font-bold text-red-600 flex items-center gap-2">
                <UserMinus className="w-4 h-4" />
                Remove Workspace Access
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500">
                Remove this user&apos;s access to <strong>{manageUsersWorkspace.name}</strong>?
              </DialogDescription>
            </DialogHeader>

            <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 text-xs space-y-2">
              <div className="flex items-center gap-2 font-bold text-slate-800 dark:text-slate-200">
                <span>{removeConfirmStaff.full_name}</span>
                <span className="text-slate-400 font-mono text-[11px]">({removeConfirmStaff.email})</span>
              </div>
              <p className="text-slate-600 dark:text-slate-300 text-[11px]">
                • The user will immediately lose access to this workspace.
                <br />
                • Access to any other assigned workspaces remains active.
                <br />
                • Historical job cards, invoices, and audit records created by this user are strictly preserved.
              </p>
            </div>

            <DialogFooter className="gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setRemoveConfirmStaff(null)}
                className="text-xs h-8"
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="sm"
                disabled={loadingAction === removeConfirmStaff.id}
                onClick={handleConfirmRemoveStaff}
                className="text-xs font-bold h-8 bg-red-600 hover:bg-red-700"
              >
                {loadingAction === removeConfirmStaff.id ? "Removing..." : "Remove Access"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* ─── 5. MANAGE PERMISSIONS MODAL (Requirement 5) ───────────────────── */}
      {managePermissionsUser && (
        <ManageUserAccessModal
          isOpen={Boolean(managePermissionsUser)}
          onClose={() => setManagePermissionsUser(null)}
          targetUser={managePermissionsUser}
          allStaffUsers={workspaceStaff}
          currentOperator={{
            id: currentUser?.id || "usr-owner-001",
            name: currentUser?.full_name || "Primary Owner",
          }}
          onPermissionsSaved={async () => {
            showToast("success", `Permissions updated for ${managePermissionsUser.full_name}.`);
            if (manageUsersWorkspace) {
              const updatedStaff = await getUsers(manageUsersWorkspace.id);
              setWorkspaceStaff(updatedStaff);
            }
          }}
        />
      )}

      {/* ─── 6. DELETE WORKSPACE CONFIRMATION MODAL (Requirements 8, 9, 10, 12) ─── */}
      {deleteTargetWorkspace && (
        <Dialog
          open={Boolean(deleteTargetWorkspace)}
          onOpenChange={(open) => {
            if (!open) {
              setDeleteTargetWorkspace(null);
              setTypedDeleteName("");
            }
          }}
        >
          <DialogContent className="max-w-md bg-white dark:bg-slate-900 p-6">
            <DialogHeader>
              <DialogTitle className="text-base font-black text-red-600 flex items-center gap-2">
                <Trash2 className="w-4 h-4" />
                DELETE WORKSPACE
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500">
                Workspace: <strong>{deleteTargetWorkspace.name}</strong>
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-2 text-xs">
              <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-xl space-y-1 text-red-800 dark:text-red-300">
                <p className="font-bold flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-red-600 shrink-0" />
                  Warning: Permanent Workspace Deletion
                </p>
                <p className="text-[11px] text-red-700 dark:text-red-400">
                  This action will permanently delete this workspace and revoke access for all member accounts in this workspace. This action cannot be undone.
                </p>
              </div>

              <p className="text-[11px] text-slate-500">
                Tip: You can Archive this workspace instead if you want to preserve its historical data and restore it later.
              </p>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  To confirm permanent deletion, type the exact workspace name:{" "}
                  <span className="font-mono text-red-600 font-black select-all">
                    {deleteTargetWorkspace.name}
                  </span>
                </Label>
                <Input
                  value={typedDeleteName}
                  onChange={(e) => setTypedDeleteName(e.target.value)}
                  placeholder={`Type "${deleteTargetWorkspace.name}" here`}
                  className="text-xs font-bold h-9"
                  autoFocus
                />
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setDeleteTargetWorkspace(null);
                  setTypedDeleteName("");
                }}
                className="text-xs h-8"
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="sm"
                disabled={
                  deletingWorkspace ||
                  typedDeleteName.trim().toLowerCase() !== deleteTargetWorkspace.name.trim().toLowerCase()
                }
                onClick={handleConfirmDeleteWorkspace}
                className="text-xs font-bold h-8 bg-red-600 hover:bg-red-700"
              >
                {deletingWorkspace ? "Deleting..." : "Delete Permanently"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* ─── 7. REJECT WORKSPACE CONFIRMATION MODAL (Requirement 11) ───────── */}
      {rejectTargetWorkspace && (
        <Dialog
          open={Boolean(rejectTargetWorkspace)}
          onOpenChange={(open) => {
            if (!open) {
              setRejectTargetWorkspace(null);
              setRejectionReason("");
            }
          }}
        >
          <DialogContent className="max-w-md bg-white dark:bg-slate-900 p-6">
            <DialogHeader>
              <DialogTitle className="text-base font-black text-red-600 flex items-center gap-2">
                <Ban className="w-4 h-4" />
                Reject Workspace Request
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500">
                Workspace: <strong>{rejectTargetWorkspace.name}</strong> ({rejectTargetWorkspace.workspace_code || rejectTargetWorkspace.code || "PENDING"})
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-2 text-xs">
              <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-xl space-y-1 text-red-800 dark:text-red-300">
                <p className="font-bold flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-red-600 shrink-0" />
                  Workspace Rejection
                </p>
                <p className="text-[11px] text-red-700 dark:text-red-400">
                  This workspace will be marked as rejected. The user will be informed with the rejection reason upon sign-in attempt and denied access to business data.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Rejection Reason (Optional):
                </Label>
                <Input
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  placeholder="e.g. Incomplete business verification, duplicate entry, etc."
                  className="text-xs h-9"
                  autoFocus
                />
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setRejectTargetWorkspace(null);
                  setRejectionReason("");
                }}
                className="text-xs h-8"
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="sm"
                disabled={rejectingWorkspace}
                onClick={handleConfirmRejectWorkspace}
                className="text-xs font-bold h-8 bg-red-600 hover:bg-red-700"
              >
                {rejectingWorkspace ? (
                  <>
                    <Loader2 className="w-3 h-3 animate-spin mr-1" /> Rejecting...
                  </>
                ) : (
                  "Confirm Rejection"
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* ─── 8. RENEW WORKSPACE ACCESS MODAL (PART 9) ───────────────────────── */}
      {renewTargetWorkspace && (
        <Dialog
          open={Boolean(renewTargetWorkspace)}
          onOpenChange={(open) => {
            if (!open) {
              setRenewTargetWorkspace(null);
              setRenewCustomDate("");
            }
          }}
        >
          <DialogContent className="max-w-md bg-white dark:bg-slate-900 p-6">
            <DialogHeader>
              <DialogTitle className="text-base font-black text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Clock className="w-4 h-4 text-blue-600" />
                Renew Workspace Access
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500">
                Extend access duration for this workspace. User can log in with their existing credentials.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3.5 py-2 text-xs">
              {/* Target Details Card */}
              <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">Workspace:</span>
                  <span className="font-bold text-slate-900 dark:text-slate-100">
                    {renewTargetWorkspace.name}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">Workspace Owner:</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    {renewTargetWorkspace.owner_name || "Owner"} ({renewTargetWorkspace.owner_email || renewTargetWorkspace.email})
                  </span>
                </div>
                <div className="flex justify-between items-center pt-1 border-t border-slate-200 dark:border-slate-700">
                  <span className="text-slate-500">Previous Expiry:</span>
                  <span className="font-mono text-slate-700 dark:text-slate-300 font-semibold">
                    {(() => {
                      const m = getLocalMembers().find((mem) => mem.workspace_id === renewTargetWorkspace.id && (mem.is_workspace_owner || mem.role === "owner"));
                      return m?.access_expires_at
                        ? new Date(m.access_expires_at).toLocaleString()
                        : "No Expiry (Indefinite)";
                    })()}
                  </span>
                </div>
              </div>

              {/* Duration Options */}
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Select New Duration *
                </Label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                  {RENEW_DURATION_OPTIONS.map((opt) => {
                    const isSelected = renewDuration === opt.value;
                    return (
                      <div
                        key={opt.value}
                        onClick={() => setRenewDuration(opt.value)}
                        className={`p-2 rounded-lg border text-center cursor-pointer transition-all ${
                          isSelected
                            ? "border-blue-600 bg-blue-50/80 dark:bg-blue-950/40 text-blue-900 dark:text-blue-100 ring-1 ring-blue-600 font-bold"
                            : "border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300"
                        }`}
                      >
                        <div className="text-[11px] font-bold">{opt.label}</div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Custom Date Input */}
              {renewDuration === "custom" && (
                <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700 space-y-1 animate-in fade-in-50">
                  <Label className="text-[11px] font-bold text-slate-700 dark:text-slate-300">
                    New Expiry Date &amp; Time *
                  </Label>
                  <Input
                    type="datetime-local"
                    value={renewCustomDate}
                    onChange={(e) => setRenewCustomDate(e.target.value)}
                    className="text-xs h-9"
                    min={new Date().toISOString().slice(0, 16)}
                  />
                </div>
              )}

              {/* Real-Time Expiry Calculation Summary */}
              <div className="p-3 bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 rounded-xl space-y-1 text-xs text-blue-950 dark:text-blue-200">
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 dark:text-slate-400">New Access Starts:</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">Immediately (Now)</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 dark:text-slate-400">New Access Expires:</span>
                  <span className="font-bold text-blue-700 dark:text-blue-300 font-mono">
                    {renewDuration === "no_expiry"
                      ? "Never (No Expiry)"
                      : renewDuration === "custom" && renewCustomDate
                      ? new Date(renewCustomDate).toLocaleString()
                      : calculateAccessExpiry(renewDuration).expiresAt
                      ? new Date(calculateAccessExpiry(renewDuration).expiresAt!).toLocaleString()
                      : "No Expiry"}
                  </span>
                </div>
              </div>
            </div>

            <DialogFooter className="gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setRenewTargetWorkspace(null);
                  setRenewCustomDate("");
                }}
                disabled={renewingAccess}
                className="text-xs h-8"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={renewingAccess || (renewDuration === "custom" && !renewCustomDate)}
                onClick={handleConfirmRenewAccess}
                className="text-xs font-bold h-8 bg-blue-600 hover:bg-blue-700 text-white gap-1.5"
              >
                {renewingAccess ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Renewing...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5" /> Confirm Renewal
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
