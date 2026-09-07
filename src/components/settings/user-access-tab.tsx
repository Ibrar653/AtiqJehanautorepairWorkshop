"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Users,
  Shield,
  Plus,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Edit2,
  Trash2,
  Power,
  UserCheck,
  UserX,
  Mail,
  Lock,
  KeyRound,
  Eye,
  ShieldAlert,
  Clock,
  Search,
  Sliders,
  RotateCcw,
  UserMinus,
  Sparkles,
  MoreVertical,
  Crown,
  UserPlus,
  Send,
  Building,
  Check,
  X,
  AlertTriangle,
  FileCheck,
  DollarSign,
  ShieldCheck,
  Layers,
  History,
  Calendar,
} from "lucide-react";
import {
  getUsers,
  updateUser,
  deleteUser,
  getUserActivityLogs,
  updateUserAccessControls,
  terminateUserSessions,
  sendStaffInvitation,
} from "@/lib/services/user-service";
import {
  removeWorkspaceOwner,
  removeWorkspaceUser,
  restoreWorkspaceUser,
} from "@/lib/services/workspace-service";
import {
  getAccessRequests,
  approveAccessRequest,
  rejectAccessRequest,
} from "@/lib/services/access-request-service";
import {
  getApprovalRequests,
  approveRequest as approveTransactionRequest,
  rejectRequest as rejectTransactionRequest,
} from "@/lib/services/approval-service";
import { usePermissions } from "@/lib/context/auth-context";
import { useWorkspace } from "@/lib/context/workspace-context";
import {
  USER_ROLES,
  STAFF_USER_ROLES,
  ALL_APP_MODULES,
  PRIMARY_OWNER_EMAIL,
  getUserHierarchyLevel,
  HIERARCHY_BADGE_CONFIG,
  DATA_ACCESS_SCOPES,
} from "@/lib/constants";
import {
  getWorkspaceInvitations,
  resendWorkspaceInvitation,
  regenerateInvitationCode,
  revokeWorkspaceInvitation,
} from "@/lib/services/workspace-invitation-service";
import type {
  User,
  UserRole,
  UserStatus,
  AppModule,
  AccessRequest,
  ApprovalRequest,
  UserActivityLog,
  WorkspaceInvitation,
} from "@/types/database";
import { ManageUserAccessModal } from "@/components/settings/manage-user-access-modal";
import { InviteStaffModal } from "@/components/settings/invite-staff-modal";
import { UserActivityModal } from "@/components/settings/user-activity-modal";
import { Checkbox } from "@/components/ui/checkbox";
import { BulkActionBar } from "@/components/shared/bulk-action-bar";
import { RecordDeleteDialog } from "@/components/shared/record-delete-dialog";

type AccessSubTab =
  | "users"
  | "roles"
  | "profiles"
  | "invitations"
  | "access_requests"
  | "approvals"
  | "activity"
  | "security";

export function UserAccessTab() {
  const { currentWorkspace } = useWorkspace();
  const { user: currentUser, isOwner } = usePermissions();

  const [activeSubTab, setActiveSubTab] = useState<AccessSubTab>("users");
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [accessRequests, setAccessRequests] = useState<AccessRequest[]>([]);
  const [approvalRequests, setApprovalRequests] = useState<ApprovalRequest[]>([]);
  const [activityLogs, setActivityLogs] = useState<UserActivityLog[]>([]);

  // Filters & search
  const [searchFilter, setSearchFilter] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("active");

  // Modals
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [manageAccessUser, setManageAccessUser] = useState<User | null>(null);
  const [activityModalUser, setActivityModalUser] = useState<User | null>(null);
  const [removeAccessModalUser, setRemoveAccessModalUser] = useState<User | null>(null);
  const [deleteUserModalUser, setDeleteUserModalUser] = useState<User | null>(null);
  const [actionProcessing, setActionProcessing] = useState(false);

  // Bulk Selection State for Staff Users
  const [selectedStaffUserIds, setSelectedStaffUserIds] = useState<string[]>([]);
  const [bulkDeleteDialogOpen, setBulkDeleteDialogOpen] = useState(false);
  const [bulkDeletingStaff, setBulkDeletingStaff] = useState(false);
  const [workspaceInvitations, setWorkspaceInvitations] = useState<WorkspaceInvitation[]>([]);
  const [regeneratedCodeModal, setRegeneratedCodeModal] = useState<{
    open: boolean;
    code: string;
    email: string;
  } | null>(null);

  // Rejection Dialog State
  const [rejectDialog, setRejectDialog] = useState<{
    open: boolean;
    type: "access" | "approval";
    id: string;
    title: string;
    reason: string;
  }>({
    open: false,
    type: "access",
    id: "",
    title: "",
    reason: "",
  });

  const [toast, setToast] = useState<{ type: "success" | "error" | "info"; text: string } | null>(
    null
  );

  const showToast = (type: "success" | "error" | "info", text: string) => {
    setToast({ type, text });
    setTimeout(() => setToast(null), 4500);
  };

  // Load all data
  const refreshData = useCallback(async () => {
    setLoading(true);
    try {
      const [uList, accReqs, apprReqs, logs, invs] = await Promise.all([
        getUsers(currentWorkspace?.id),
        getAccessRequests(currentWorkspace?.id),
        getApprovalRequests(currentWorkspace?.id),
        getUserActivityLogs(),
        getWorkspaceInvitations(currentWorkspace?.id),
      ]);
      setUsers(uList);
      setAccessRequests(accReqs);
      setApprovalRequests(apprReqs);
      setActivityLogs(logs);
      setWorkspaceInvitations(invs);
    } catch (e: any) {
      console.warn("Failed to load user access data:", e);
    } finally {
      setLoading(false);
    }
  }, [currentWorkspace?.id]);

  useEffect(() => {
    refreshData();
  }, [refreshData]);

  // Metric Computations for Top Summary Cards (Requirement 1, 3, 4, 5)
  // Primary Platform Owner is the system administrator and protected, not removable normal staff
  const staffUsers = users.filter(
    (u) =>
      u.email.toLowerCase() !== PRIMARY_OWNER_EMAIL.toLowerCase() &&
      u.id !== "usr-owner-001"
  );

  const totalStaff = staffUsers.filter((u) => u.status !== "deleted").length;
  const activeStaff = staffUsers.filter(
    (u) =>
      (u.status === "active" || (!u.status && u.is_active)) &&
      u.membership_status !== "removed" &&
      u.membership_status !== "suspended" &&
      (u.membership_status as string) !== "pending" &&
      (u.membership_status as string) !== "invited"
  ).length;
  const pendingInvitations =
    staffUsers.filter(
      (u) =>
        u.status === "invited" ||
        u.membership_status === "pending" ||
        u.membership_status === "invited"
    ).length + workspaceInvitations.filter((i) => i.status === "pending").length;
  const suspendedStaff = staffUsers.filter(
    (u) =>
      (u.status === "suspended" || u.membership_status === "suspended") &&
      u.status !== "deleted"
  ).length;
  const removedStaff = staffUsers.filter(
    (u) =>
      u.status === "removed" ||
      u.membership_status === "removed" ||
      u.status === "deleted"
  ).length;

  const pendingAccessReqCount = accessRequests.filter((r) => r.status === "pending").length;
  const pendingApprovalsCount = approvalRequests.filter((r) => r.status === "pending").length;

  // Filtered user list
  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      const q = searchFilter.toLowerCase();
      const matchesQuery =
        !q ||
        u.full_name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        (u.phone && u.phone.includes(q)) ||
        (u.job_title && u.job_title.toLowerCase().includes(q));

      const matchesRole = roleFilter === "all" || u.role === roleFilter;

      const isAccountDeleted = u.status === "deleted";
      const isRemoved = u.status === "removed" || u.membership_status === "removed" || isAccountDeleted;
      const isSuspended = u.status === "suspended" || u.membership_status === "suspended";
      const isPending = u.status === "invited" || u.membership_status === "pending" || u.membership_status === "invited";
      const isActive = !isRemoved && !isSuspended && !isPending && (u.status === "active" || !u.status);

      let matchesStatus = true;
      if (statusFilter === "active") {
        matchesStatus = isActive;
      } else if (statusFilter === "pending") {
        matchesStatus = isPending;
      } else if (statusFilter === "suspended") {
        matchesStatus = isSuspended;
      } else if (statusFilter === "removed") {
        matchesStatus = isRemoved;
      } else if (statusFilter === "all") {
        matchesStatus = true;
      }

      return matchesQuery && matchesRole && matchesStatus;
    });
  }, [users, searchFilter, roleFilter, statusFilter]);

  // Primary Owner Safety Identifier
  const isUserPrimaryOwner = useCallback((u: User) => {
    return (
      u.email.toLowerCase() === PRIMARY_OWNER_EMAIL.toLowerCase() ||
      u.id === "usr-owner-001"
    );
  }, []);

  // Visible selectable staff (excludes primary owner)
  const selectableUsers = useMemo(() => {
    return filteredUsers.filter((u) => !isUserPrimaryOwner(u));
  }, [filteredUsers, isUserPrimaryOwner]);

  // Selection Handlers
  const handleSelectAllStaff = (checked: boolean) => {
    if (checked) {
      setSelectedStaffUserIds(selectableUsers.map((u) => u.id));
    } else {
      setSelectedStaffUserIds([]);
    }
  };

  const handleToggleSelectStaff = (id: string) => {
    setSelectedStaffUserIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  // Bulk Staff Actions
  const handleBulkSuspend = async () => {
    if (selectedStaffUserIds.length === 0) return;
    const targets = users.filter((u) => selectedStaffUserIds.includes(u.id) && !isUserPrimaryOwner(u));
    setBulkDeletingStaff(true);
    try {
      for (const u of targets) {
        await updateUserAccessControls(
          u.id,
          { status: "suspended" },
          { id: currentUser?.id || "usr-owner-001", name: currentUser?.full_name || "Primary Owner" },
          "Bulk staff suspension"
        );
      }
      showToast("success", `${targets.length} staff member(s) suspended.`);
      setSelectedStaffUserIds([]);
      await refreshData();
    } catch (err: any) {
      showToast("error", err.message || "Failed to suspend selected users.");
    } finally {
      setBulkDeletingStaff(false);
    }
  };

  const handleBulkRemoveAccess = async () => {
    if (selectedStaffUserIds.length === 0 || !currentWorkspace) return;
    const targets = users.filter((u) => selectedStaffUserIds.includes(u.id) && !isUserPrimaryOwner(u));
    setBulkDeletingStaff(true);
    try {
      for (const u of targets) {
        await removeWorkspaceUser(currentWorkspace.id, u.id, currentUser?.id || "usr-owner-001");
      }
      showToast("success", `Removed workspace access for ${targets.length} staff member(s).`);
      setSelectedStaffUserIds([]);
      await refreshData();
    } catch (err: any) {
      showToast("error", err.message || "Failed to remove access for selected users.");
    } finally {
      setBulkDeletingStaff(false);
    }
  };

  const handleRequestBulkDeleteStaff = () => {
    if (selectedStaffUserIds.length === 0) return;
    setBulkDeleteDialogOpen(true);
  };

  const handleConfirmBulkDeleteStaff = async () => {
    const targets = users.filter((u) => selectedStaffUserIds.includes(u.id) && !isUserPrimaryOwner(u));
    if (targets.length === 0) return;
    setBulkDeletingStaff(true);
    try {
      for (const u of targets) {
        await deleteUser(u.id, {
          id: currentUser?.id || "usr-owner-001",
          name: currentUser?.full_name || "Primary Owner",
          role: currentUser?.role || "owner",
        });
      }
      showToast("success", `${targets.length} staff login account(s) deleted. Historical records preserved.`);
      setBulkDeleteDialogOpen(false);
      setSelectedStaffUserIds([]);
      await refreshData();
    } catch (err: any) {
      showToast("error", err.message || "Failed to delete staff accounts.");
    } finally {
      setBulkDeletingStaff(false);
    }
  };

  // Actions
  const handleToggleSuspend = async (targetUser: User) => {
    if (targetUser.email.toLowerCase() === PRIMARY_OWNER_EMAIL.toLowerCase()) {
      showToast("error", "The Primary Owner account cannot be suspended or restricted.");
      return;
    }

    const currentStatus = targetUser.status || "active";
    const newStatus: UserStatus = currentStatus === "suspended" ? "active" : "suspended";

    const res = await updateUserAccessControls(
      targetUser.id,
      { status: newStatus },
      { id: currentUser?.id || "usr-owner-001", name: currentUser?.full_name || "Primary Owner" },
      `Toggled status to ${newStatus}`
    );

    if (res.success) {
      showToast(
        "success",
        `User ${targetUser.full_name} is now ${newStatus.toUpperCase()}.`
      );
      refreshData();
    } else {
      showToast("error", res.error || "Failed to change user status.");
    }
  };

  const handleOpenRemoveAccess = (targetUser: User) => {
    if (targetUser.email.toLowerCase() === PRIMARY_OWNER_EMAIL.toLowerCase()) {
      showToast("error", "The Primary Platform Owner access cannot be removed.");
      return;
    }
    setRemoveAccessModalUser(targetUser);
  };

  const handleConfirmRemoveAccess = async () => {
    if (!removeAccessModalUser) return;
    setActionProcessing(true);
    try {
      const res = await removeWorkspaceUser(
        currentWorkspace.id,
        removeAccessModalUser.id || removeAccessModalUser.email,
        currentUser?.full_name || "Primary Owner"
      );
      if (res.success) {
        showToast(
          "success",
          `Removed ${removeAccessModalUser.full_name}'s access to ${currentWorkspace.name}. Historical records remain intact.`
        );
        await refreshData();
      } else {
        showToast("error", res.error || "Failed to remove user access.");
      }
    } finally {
      setActionProcessing(false);
      setRemoveAccessModalUser(null);
    }
  };

  const handleRestoreAccess = async (targetUser: User) => {
    setActionProcessing(true);
    try {
      const res = await restoreWorkspaceUser(
        currentWorkspace.id,
        targetUser.id || targetUser.email,
        currentUser?.full_name || "Primary Owner"
      );
      if (res.success) {
        showToast(
          "success",
          `Restored access for ${targetUser.full_name} in ${currentWorkspace.name}.`
        );
        await refreshData();
      } else {
        showToast("error", res.error || "Failed to restore access.");
      }
    } finally {
      setActionProcessing(false);
    }
  };

  const handleOpenDeleteUser = (targetUser: User) => {
    if (targetUser.email.toLowerCase() === PRIMARY_OWNER_EMAIL.toLowerCase()) {
      showToast("error", "The Primary Platform Owner account cannot be deleted.");
      return;
    }
    setDeleteUserModalUser(targetUser);
  };

  const handleConfirmDeleteUser = async () => {
    if (!deleteUserModalUser) return;
    setActionProcessing(true);
    try {
      const res = await deleteUser(deleteUserModalUser.id, {
        id: currentUser?.id || "usr-owner-001",
        name: currentUser?.full_name || "Primary Owner",
        role: currentUser?.role || "owner",
      });
      if (res.success) {
        showToast(
          "success",
          `User login account for ${deleteUserModalUser.full_name} has been deleted. Historical workshop & financial records preserved.`
        );
        await refreshData();
      } else {
        showToast("error", res.error || "Failed to delete user account.");
      }
    } finally {
      setActionProcessing(false);
      setDeleteUserModalUser(null);
    }
  };

  const handleTerminateSessions = async (targetUser: User) => {
    const res = await terminateUserSessions(
      targetUser.id,
      { id: currentUser?.id || "usr-owner-001", name: currentUser?.full_name || "Primary Owner" }
    );
    showToast("success", res.message);
  };

  const handleResendInvite = async (targetUser: User) => {
    await sendStaffInvitation(targetUser.email, targetUser.role, targetUser.full_name);
    showToast("success", `Invitation link resent to ${targetUser.email}.`);
  };

  const handleResendWsInvite = async (inv: WorkspaceInvitation) => {
    const res = await resendWorkspaceInvitation(inv.id);
    if (res.success) {
      showToast("success", res.message || `Invitation resent to ${inv.email}.`);
      refreshData();
    } else {
      showToast("error", res.error || "Failed to resend invitation.");
    }
  };

  const handleRegenerateWsCode = async (inv: WorkspaceInvitation) => {
    const res = await regenerateInvitationCode(inv.id);
    if (res.success && res.new_code) {
      setRegeneratedCodeModal({
        open: true,
        code: res.new_code,
        email: inv.email,
      });
      refreshData();
    } else {
      showToast("error", res.error || "Failed to regenerate code.");
    }
  };

  const handleRevokeWsInvite = async (inv: WorkspaceInvitation) => {
    if (!confirm(`Are you sure you want to revoke the invitation for ${inv.email}?`)) return;
    const res = await revokeWorkspaceInvitation(inv.id);
    if (res.success) {
      showToast("success", `Invitation for ${inv.email} revoked.`);
      refreshData();
    } else {
      showToast("error", res.error || "Failed to revoke invitation.");
    }
  };

  const handleApproveAccessRequest = async (req: AccessRequest) => {
    const res = await approveAccessRequest(req.id, {
      id: currentUser?.id || "usr-owner-001",
      name: currentUser?.full_name || "Primary Owner",
    });
    if (res.success) {
      showToast("success", `Approved access to ${req.requested_module.toUpperCase()} for ${req.user_name}.`);
      refreshData();
    } else {
      showToast("error", res.error || "Failed to approve request.");
    }
  };

  const handleApproveTransaction = async (req: ApprovalRequest) => {
    const res = await approveTransactionRequest(req.id, {
      id: currentUser?.id || "usr-owner-001",
      name: currentUser?.full_name || "Primary Owner",
    });
    if (res.success) {
      showToast("success", `Approved transaction ${req.request_type} (${req.amount ? `AED ${req.amount}` : "Standard"}).`);
      refreshData();
    } else {
      showToast("error", res.error || "Failed to approve transaction.");
    }
  };

  const handleConfirmReject = async () => {
    if (!rejectDialog.reason.trim()) {
      alert("Please enter a brief rejection reason for the audit trail.");
      return;
    }

    if (rejectDialog.type === "access") {
      await rejectAccessRequest(
        rejectDialog.id,
        { id: currentUser?.id || "usr-owner-001", name: currentUser?.full_name || "Primary Owner" },
        rejectDialog.reason
      );
      showToast("info", "Access request rejected.");
    } else {
      await rejectTransactionRequest(
        rejectDialog.id,
        { id: currentUser?.id || "usr-owner-001", name: currentUser?.full_name || "Primary Owner" },
        rejectDialog.reason
      );
      showToast("info", "Transaction request rejected.");
    }

    setRejectDialog({ open: false, type: "access", id: "", title: "", reason: "" });
    refreshData();
  };

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {toast && (
        <div
          className={`p-4 rounded-xl text-xs font-semibold flex items-center justify-between shadow-lg transition-all animate-in fade-in-50 ${
            toast.type === "success"
              ? "bg-emerald-600 text-white"
              : toast.type === "error"
              ? "bg-rose-600 text-white"
              : "bg-blue-600 text-white"
          }`}
        >
          <div className="flex items-center gap-2">
            {toast.type === "success" && <CheckCircle2 className="w-4 h-4" />}
            {toast.type === "error" && <AlertCircle className="w-4 h-4" />}
            {toast.type === "info" && <Shield className="w-4 h-4" />}
            <span>{toast.text}</span>
          </div>
          <button onClick={() => setToast(null)} className="text-white/80 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ─── 1. TOP 5 SUMMARY CARDS (Requirement 1 & Section 1) ───────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 p-5 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-[#64748B] dark:text-slate-400 uppercase tracking-[0.03em]">Total Staff</span>
            <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-950/50 text-blue-600 flex items-center justify-center shrink-0">
              <Users className="w-[18px] h-[18px]" aria-hidden="true" />
            </div>
          </div>
          <p className="text-[22px] sm:text-[24px] font-bold font-mono tracking-tight text-[#0F172A] dark:text-slate-100 tabular-nums leading-tight mt-2">
            {totalStaff}
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 p-5 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-[#64748B] dark:text-slate-400 uppercase tracking-[0.03em]">Active Staff</span>
            <div className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 flex items-center justify-center shrink-0">
              <UserCheck className="w-[18px] h-[18px]" aria-hidden="true" />
            </div>
          </div>
          <p className="text-[22px] sm:text-[24px] font-bold font-mono tracking-tight text-emerald-700 dark:text-emerald-400 tabular-nums leading-tight mt-2">
            {activeStaff}
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 p-5 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-[#64748B] dark:text-slate-400 uppercase tracking-[0.03em]">Pending Invites</span>
            <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-950/50 text-blue-600 flex items-center justify-center shrink-0">
              <Mail className="w-[18px] h-[18px]" aria-hidden="true" />
            </div>
          </div>
          <p className="text-[22px] sm:text-[24px] font-bold font-mono tracking-tight text-blue-700 dark:text-blue-400 tabular-nums leading-tight mt-2">
            {pendingInvitations}
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 p-5 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-[#64748B] dark:text-slate-400 uppercase tracking-[0.03em]">Suspended Staff</span>
            <div className="w-9 h-9 rounded-xl bg-amber-50 dark:bg-amber-950/50 text-amber-600 flex items-center justify-center shrink-0">
              <UserX className="w-[18px] h-[18px]" aria-hidden="true" />
            </div>
          </div>
          <p className="text-[22px] sm:text-[24px] font-bold font-mono tracking-tight text-amber-700 dark:text-amber-400 tabular-nums leading-tight mt-2">
            {suspendedStaff}
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 p-5 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-[#64748B] dark:text-slate-400 uppercase tracking-[0.03em]">Removed Staff</span>
            <div className="w-9 h-9 rounded-xl bg-rose-50 dark:bg-rose-950/50 text-rose-600 flex items-center justify-center shrink-0">
              <UserMinus className="w-[18px] h-[18px]" aria-hidden="true" />
            </div>
          </div>
          <p className="text-[22px] sm:text-[24px] font-bold font-mono tracking-tight text-rose-700 dark:text-rose-400 tabular-nums leading-tight mt-2">
            {removedStaff}
          </p>
        </div>
      </div>

      {/* ─── 2. MAIN SUBTABS NAVIGATION ───────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white dark:bg-slate-900 p-2.5 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-2xs">
        <div className="flex flex-wrap items-center gap-1.5">
          {[
            { id: "users", label: "Users", icon: Users, badge: totalStaff },
            { id: "roles", label: "Roles", icon: Shield },
            { id: "profiles", label: "Permission Profiles", icon: Sliders },
            { id: "invitations", label: "Invitations", icon: Mail, badge: pendingInvitations || undefined },
            {
              id: "access_requests",
              label: "Access Requests",
              icon: KeyRound,
              badge: pendingAccessReqCount || undefined,
              badgeColor: "bg-amber-500",
            },
            {
              id: "approvals",
              label: "Pending Approvals",
              icon: FileCheck,
              badge: pendingApprovalsCount || undefined,
              badgeColor: "bg-rose-500",
            },
            { id: "activity", label: "Activity Log", icon: History },
            { id: "security", label: "Security & Lockout", icon: Lock },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeSubTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveSubTab(tab.id as AccessSubTab)}
                className={`px-3.5 h-9 rounded-xl text-[12px] font-semibold flex items-center gap-2 transition-all ${
                  isActive
                    ? "bg-blue-600 text-white shadow-2xs"
                    : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60"
                }`}
              >
                <span className="inline-flex items-center justify-center shrink-0" aria-hidden="true">
                  <Icon className="w-3.5 h-3.5" />
                </span>
                <span>{tab.label}</span>
                {tab.badge !== undefined && (
                  <span
                    className={`ml-1 px-1.5 py-0.5 rounded-lg text-[10px] font-bold ${
                      isActive
                        ? "bg-white/20 text-white"
                        : tab.badgeColor
                        ? `${tab.badgeColor} text-white`
                        : "bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300"
                    }`}
                  >
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={refreshData}
            className="h-9 text-xs px-3.5 rounded-xl border-slate-200 font-semibold gap-1.5 hover:bg-slate-50"
          >
            <RotateCcw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>

          <Button
            size="sm"
            onClick={() => setInviteModalOpen(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white h-9 text-xs font-semibold rounded-xl shadow-2xs gap-1.5 px-4"
          >
            <UserPlus className="w-3.5 h-3.5" /> + Invite Staff
          </Button>
        </div>
      </div>

      {/* ─── 3. SUBTAB CONTENTS ───────────────────────────────────────────── */}

      {/* SUBTAB 1: USERS LIST */}
      {activeSubTab === "users" && (
        <div className="space-y-4">
          {/* Status Filter Pills (Requirement 4 & 5) */}
          <div className="flex flex-wrap items-center gap-2 bg-white dark:bg-slate-900 p-3 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-2xs">
            {[
              {
                id: "active",
                label: "Active Staff",
                count: activeStaff,
                color: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-400",
              },
              {
                id: "pending",
                label: "Pending",
                count: pendingInvitations,
                color: "bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-400",
              },
              {
                id: "suspended",
                label: "Suspended",
                count: suspendedStaff,
                color: "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-400",
              },
              {
                id: "removed",
                label: "Removed Staff",
                count: removedStaff,
                color: "bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-400",
              },
              {
                id: "all",
                label: "All Records",
                count: users.length,
                color: "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300",
              },
            ].map((f) => {
              const isSelected = statusFilter === f.id;
              return (
                <button
                  key={f.id}
                  onClick={() => setStatusFilter(f.id)}
                  className={`px-3.5 h-8.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-2 ${
                    isSelected
                      ? "bg-blue-600 text-white shadow-2xs hover:bg-blue-700"
                      : "bg-white dark:bg-slate-900 border border-slate-200 text-slate-600 dark:border-slate-800 dark:text-slate-400 hover:text-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800"
                  }`}
                >
                  <span>{f.label}</span>
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded-md font-black ${
                      isSelected
                        ? "bg-white/20 text-white dark:bg-white/30 dark:text-white"
                        : f.color
                    }`}
                  >
                    {f.count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Removed Users Historical Preservation Banner */}
          {statusFilter === "removed" && (
            <div className="p-4 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 rounded-2xl flex items-center justify-between text-xs text-amber-900 dark:text-amber-200 shadow-2xs">
              <div className="flex items-center gap-2.5">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>
                  <strong>Removed Users Archive:</strong> These staff users no longer have access to <strong>{currentWorkspace.name}</strong>. In accordance with safety policies, all historical Job Cards, Invoices, Payments, and Audit Logs created by them remain 100% intact.
                </span>
              </div>
            </div>
          )}

          {/* Search and Secondary Role Filter */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-3.5 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-2xs">
            <div className="flex flex-1 items-center gap-2">
              <div className="relative flex-1 max-w-sm">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <Input
                  placeholder="Search by name, email, role, phone..."
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                  className="pl-8 h-10 text-xs rounded-xl border-slate-200"
                />
              </div>

              <select
                aria-label="Role Filter"
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                className="h-10 text-xs px-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl font-medium"
              >
                <option value="all">All Roles</option>
                {USER_ROLES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* User Table (Requirement 2) */}
          <div className="border border-slate-200/90 dark:border-slate-800 shadow-2xs bg-white dark:bg-slate-900 overflow-hidden rounded-2xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-50/80 hover:bg-slate-50/80 border-b border-slate-200/80 text-slate-500 font-bold text-[11px] uppercase tracking-wider sticky top-0 z-10 h-11">
                  <tr>
                    <th className="w-[40px] pl-4 py-2">
                      <Checkbox
                        checked={
                          selectableUsers.length > 0 && selectedStaffUserIds.length === selectableUsers.length
                            ? true
                            : selectedStaffUserIds.length > 0
                            ? "indeterminate"
                            : false
                        }
                        disabled={selectableUsers.length === 0}
                        onCheckedChange={handleSelectAllStaff}
                        aria-label="Select all visible staff"
                      />
                    </th>
                    <th className="px-4 py-2 min-w-[200px] text-[11px] font-bold text-slate-500 uppercase tracking-wider">Staff Identity</th>
                    <th className="px-3 py-2 text-[11px] font-bold text-slate-500 uppercase tracking-wider">Role</th>
                    <th className="px-3 py-2 text-[11px] font-bold text-slate-500 uppercase tracking-wider">Workspace</th>
                    <th className="px-3 py-2 text-[11px] font-bold text-slate-500 uppercase tracking-wider">Status</th>
                    <th className="px-3 py-2 text-[11px] font-bold text-slate-500 uppercase tracking-wider">Last Login</th>
                    <th className="px-3 py-2 text-[11px] font-bold text-slate-500 uppercase tracking-wider">Access Expiry</th>
                    <th className="px-4 py-2 text-right w-[150px] whitespace-nowrap text-[11px] font-bold text-slate-500 uppercase tracking-wider pr-4">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredUsers.map((u) => {
                    const isPrimaryOwner = isUserPrimaryOwner(u);
                    const currentStatus: UserStatus =
                      u.status || (u.is_active ? "active" : "disabled");
                    const hierarchy = getUserHierarchyLevel(u);
                    const hConfig = HIERARCHY_BADGE_CONFIG[hierarchy];

                    return (
                      <tr
                        key={u.id}
                        className={`h-12 hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors border-b border-slate-100 dark:border-slate-800 ${
                          selectedStaffUserIds.includes(u.id) ? "bg-blue-50/40 dark:bg-blue-950/20" : ""
                        } ${
                          currentStatus === "suspended"
                            ? "bg-amber-50/20 dark:bg-amber-950/10"
                            : currentStatus === "removed" || currentStatus === "deleted"
                            ? "bg-rose-50/20 dark:bg-rose-950/10 opacity-80"
                            : currentStatus === "expired"
                            ? "bg-rose-50/20 dark:bg-rose-950/10"
                            : ""
                        }`}
                      >
                        <td className="pl-4 py-3">
                          {isPrimaryOwner ? (
                            <span title="Primary Owner account is protected and cannot be selected or deleted">
                              <Checkbox checked={false} disabled aria-label="Primary Owner protected" />
                            </span>
                          ) : (
                            <Checkbox
                              checked={selectedStaffUserIds.includes(u.id)}
                              onCheckedChange={() => handleToggleSelectStaff(u.id)}
                              aria-label={`Select ${u.full_name}`}
                            />
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            <div
                              className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs uppercase shrink-0 ${
                                isPrimaryOwner
                                  ? "bg-blue-600 text-white shadow-2xs"
                                  : currentStatus === "removed"
                                  ? "bg-rose-100 text-rose-700 dark:bg-rose-950/50"
                                  : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300"
                              }`}
                            >
                              {u.full_name.slice(0, 2)}
                            </div>
                            <div className="min-w-0">
                              <div className="font-bold text-slate-900 dark:text-slate-100 truncate flex items-center gap-1.5">
                                <span>{u.full_name}</span>
                                {isPrimaryOwner && (
                                  <Badge className="text-[9px] px-1.5 py-0.5 bg-blue-100 text-blue-800 border-blue-200 rounded-md">
                                    Owner
                                  </Badge>
                                )}
                              </div>
                              <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate flex items-center gap-1">
                                <Mail className="w-3 h-3 shrink-0" />
                                {u.email}
                              </div>
                              {u.removed_at && (
                                <div className="text-[10px] text-rose-500 font-medium">
                                  Removed: {new Date(u.removed_at).toLocaleDateString()}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-wider border ${hConfig.bg} ${hConfig.text} ${hConfig.border}`}
                          >
                            {hierarchy === "PRIMARY_OWNER" && (
                              <Crown className="h-2.5 w-2.5 mr-1" />
                            )}
                            {u.role}
                          </span>
                        </td>
                        <td className="px-3 py-3 font-medium text-slate-700 dark:text-slate-300">
                          {currentWorkspace?.name || "ATIQ JEHAN"}
                        </td>
                        <td className="px-3 py-3">
                          <Badge
                            className={`text-[10px] uppercase font-bold rounded-lg ${
                              currentStatus === "active"
                                ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-400 border-emerald-200"
                                : currentStatus === "invited"
                                ? "bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-400 border-blue-200"
                                : currentStatus === "suspended"
                                ? "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-400 border-amber-200"
                                : currentStatus === "removed"
                                ? "bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-400 border-rose-200"
                                : currentStatus === "deleted"
                                ? "bg-slate-200 text-slate-800 dark:bg-slate-800 dark:text-slate-300 border-slate-300"
                                : currentStatus === "expired"
                                ? "bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-400 border-rose-200"
                                : "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300"
                            }`}
                          >
                            {currentStatus}
                          </Badge>
                        </td>
                        <td className="px-3 py-3 text-slate-600 dark:text-slate-400 text-[11px] font-mono tabular-nums">
                          {u.last_login_at ? (
                            <span className="font-medium text-slate-700 dark:text-slate-300">
                              {new Date(u.last_login_at).toLocaleDateString()}
                            </span>
                          ) : (
                            <span className="text-slate-400">Never</span>
                          )}
                        </td>
                        <td className="px-3 py-3 text-slate-600 dark:text-slate-400 text-[11px] font-mono tabular-nums">
                          {u.access_expiry_date ? (
                            <span className="font-medium text-amber-600 dark:text-amber-400">
                              {new Date(u.access_expiry_date).toLocaleDateString()}
                            </span>
                          ) : (
                            <span className="text-slate-400">No Expiry</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right pr-4">
                          <div className="flex items-center justify-end gap-1.5">
                            {currentStatus === "removed" ? (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleRestoreAccess(u)}
                                disabled={actionProcessing}
                                className="h-8 text-xs px-3 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-300 font-semibold gap-1.5"
                              >
                                <RotateCcw className="w-3.5 h-3.5" /> Restore Access
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setManageAccessUser(u)}
                                className="h-8 text-xs px-3 rounded-xl bg-blue-50/50 hover:bg-blue-100 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800 font-semibold"
                              >
                                Manage Access
                              </Button>
                            )}

                            {!isPrimaryOwner && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleOpenDeleteUser(u)}
                                title="Delete User Account"
                                className="h-8 w-8 p-0 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            )}

                            <DropdownMenu>
                              <DropdownMenuTrigger className="h-8 w-8 inline-flex items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                                <MoreVertical className="w-4 h-4" />
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="text-xs rounded-xl shadow-lg border-slate-200">
                                <DropdownMenuLabel>Staff Actions</DropdownMenuLabel>
                                <DropdownMenuItem onClick={() => setManageAccessUser(u)}>
                                  <Sliders className="w-3.5 h-3.5 mr-2" /> Edit Permissions
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => setActivityModalUser(u)}>
                                  <History className="w-3.5 h-3.5 mr-2" /> View Activity
                                </DropdownMenuItem>
                                {currentStatus === "invited" && (
                                  <DropdownMenuItem onClick={() => handleResendInvite(u)}>
                                    <Send className="w-3.5 h-3.5 mr-2" /> Resend Invitation
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuItem onClick={() => handleTerminateSessions(u)}>
                                  <KeyRound className="w-3.5 h-3.5 mr-2" /> Terminate Active Sessions
                                </DropdownMenuItem>
                                {!isPrimaryOwner && (
                                  <>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                      onClick={() => handleToggleSuspend(u)}
                                      className={
                                        currentStatus === "suspended"
                                          ? "text-emerald-600 font-semibold"
                                          : "text-amber-600 font-semibold"
                                      }
                                    >
                                      <Power className="w-3.5 h-3.5 mr-2" />
                                      {currentStatus === "suspended" ? "Reactivate Staff" : "Suspend Access"}
                                    </DropdownMenuItem>
                                    {currentStatus === "removed" ? (
                                      <DropdownMenuItem
                                        onClick={() => handleRestoreAccess(u)}
                                        className="text-emerald-600 font-semibold"
                                      >
                                        <RotateCcw className="w-3.5 h-3.5 mr-2" /> Restore Access
                                      </DropdownMenuItem>
                                    ) : (
                                      <DropdownMenuItem
                                        onClick={() => handleOpenRemoveAccess(u)}
                                        className="text-orange-600 font-semibold"
                                      >
                                        <UserMinus className="w-3.5 h-3.5 mr-2" /> Remove Access
                                      </DropdownMenuItem>
                                    )}
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                      onClick={() => handleOpenDeleteUser(u)}
                                      className="text-rose-600 font-semibold"
                                    >
                                      <Trash2 className="w-3.5 h-3.5 mr-2 text-rose-600" /> Delete Login Account
                                    </DropdownMenuItem>
                                  </>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </td>
                      </tr>
                    );
                  })}

                  {filteredUsers.length === 0 && (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-slate-400">
                        No {statusFilter === "all" ? "" : statusFilter} users found matching your filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* SUBTAB 2: ROLES & TEMPLATES */}
      {activeSubTab === "roles" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {STAFF_USER_ROLES.map((r) => (
            <Card key={r.value} className="rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-2xs bg-white dark:bg-slate-900">
              <CardHeader className="p-5 pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-bold flex items-center gap-2">
                    <div className="h-8 w-8 rounded-xl bg-blue-50 dark:bg-blue-950/50 flex items-center justify-center text-blue-600">
                      <Shield className="w-4 h-4" />
                    </div>
                    {r.label}
                  </CardTitle>
                  <Badge variant="outline" className="text-[10px] uppercase font-bold rounded-lg">
                    Role Template
                  </Badge>
                </div>
                <CardDescription className="text-xs mt-1">{r.description}</CardDescription>
              </CardHeader>
              <CardContent className="p-5 pt-0 space-y-2 text-xs text-slate-600 dark:text-slate-400">
                <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-100 dark:border-slate-800">
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    Governance Scope:{" "}
                  </span>
                  {r.value === "manager"
                    ? "Full operational oversight across all repair floor activities."
                    : r.value === "accountant"
                    ? "Billing, general ledger, payment settlements, and VAT audit returns."
                    : r.value === "receptionist"
                    ? "Customer intake, job cards, service quotes, and POS invoice settlement."
                    : r.value === "storekeeper"
                    ? "Parts catalog, inventory landed costs, and supplier purchase orders."
                    : r.value === "mechanic"
                    ? "Assigned job cards inspection, repair notes, and labor service progress."
                    : "Read-only inspection rights where authorized."}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* SUBTAB 3: PERMISSION PROFILES */}
      {activeSubTab === "profiles" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[
            {
              title: "Full Operational Access",
              desc: "Complete workshop operations, inventory, and billing without owner security rights.",
              modules: 13,
              risk: "Standard Operational",
              color: "text-blue-600",
            },
            {
              title: "Workshop Operations",
              desc: "Customers, vehicles, repair orders, and labor services catalog.",
              modules: 4,
              risk: "Low Risk",
              color: "text-emerald-600",
            },
            {
              title: "Finance & Accounts",
              desc: "Invoices, payments, overhead expenses, bank ledger, and VAT reports.",
              modules: 6,
              risk: "Financial Protected",
              color: "text-amber-600",
            },
            {
              title: "Inventory & Purchasing",
              desc: "Spare parts catalog, stock levels, suppliers, and vendor purchase orders.",
              modules: 5,
              risk: "Sensitive Assets",
              color: "text-purple-600",
            },
            {
              title: "View Only Compliance",
              desc: "Read-only inspection rights for auditors and compliance inspectors.",
              modules: 5,
              risk: "Read Only",
              color: "text-slate-600",
            },
          ].map((profile, i) => (
            <Card key={i} className="rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-2xs bg-white dark:bg-slate-900">
              <CardHeader className="p-5 pb-3">
                <CardTitle className={`text-sm font-bold ${profile.color}`}>
                  {profile.title}
                </CardTitle>
                <CardDescription className="text-xs mt-1">{profile.desc}</CardDescription>
              </CardHeader>
              <CardContent className="p-5 pt-0 space-y-2 text-xs">
                <div className="flex justify-between items-center text-slate-500">
                  <span>Modules Included:</span>
                  <span className="font-bold text-slate-800 dark:text-slate-200 font-mono">
                    {profile.modules} Modules
                  </span>
                </div>
                <div className="flex justify-between items-center text-slate-500">
                  <span>Security Tier:</span>
                  <Badge variant="outline" className="text-[10px] font-bold rounded-lg">
                    {profile.risk}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* SUBTAB 4: INVITATIONS (REQUIREMENT 13) */}
      {activeSubTab === "invitations" && (
        <Card className="rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-2xs bg-white dark:bg-slate-900 overflow-hidden">
          <CardContent className="p-0">
            {workspaceInvitations.length === 0 && users.filter((u) => u.status === "invited").length === 0 ? (
              <div className="min-h-[220px] max-h-[280px] flex flex-col items-center justify-center p-6 text-center text-slate-500">
                <div className="h-12 w-12 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-3">
                  <Mail className="h-6 w-6 text-slate-400" />
                </div>
                <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">No pending staff or workspace invitations.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-50/80 dark:bg-slate-800/80 border-b border-slate-200/80 text-slate-500 font-bold uppercase text-[11px] tracking-wider h-11">
                    <tr>
                      <th className="px-4 py-3">Invited User</th>
                      <th className="px-3 py-3">Email</th>
                      <th className="px-3 py-3">Workspace</th>
                      <th className="px-3 py-3">Role</th>
                      <th className="px-3 py-3">Invited By</th>
                      <th className="px-3 py-3">Sent Date</th>
                      <th className="px-3 py-3">Expires</th>
                      <th className="px-3 py-3">Status</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {/* Workspace Invitations */}
                    {workspaceInvitations.map((inv) => (
                      <tr key={inv.id} className="h-12 hover:bg-slate-50/60 transition-colors">
                        <td className="px-4 py-3 font-bold text-slate-900 dark:text-slate-100">
                          {inv.invited_user_name}
                        </td>
                        <td className="px-3 py-3 text-slate-600 dark:text-slate-400">
                          {inv.email}
                        </td>
                        <td className="px-3 py-3">
                          <span className="font-semibold text-slate-800 dark:text-slate-200">
                            {inv.workspace?.name || "Target Workspace"}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          <Badge variant="outline" className="text-[10px] uppercase font-bold rounded-md">
                            {inv.role}
                          </Badge>
                        </td>
                        <td className="px-3 py-3 text-slate-500">{inv.invited_by}</td>
                        <td className="px-3 py-3 text-slate-500 font-mono">
                          {new Date(inv.created_at).toLocaleDateString()}
                        </td>
                        <td className="px-3 py-3 text-slate-500 font-mono">
                          {new Date(inv.expires_at).toLocaleDateString()}
                        </td>
                        <td className="px-3 py-3">
                          <Badge
                            title={inv.error_message || undefined}
                            className={`text-[10px] uppercase font-bold rounded-md ${
                              inv.status === "accepted"
                                ? "bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300"
                                : inv.status === "sent"
                                ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                                : inv.status === "pending"
                                ? "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300"
                                : inv.status === "failed"
                                ? "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300"
                                : inv.status === "revoked"
                                ? "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300"
                                : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                            }`}
                          >
                            {inv.status}
                          </Badge>
                          {inv.status === "failed" && inv.error_message && (
                            <p className="text-[10px] text-red-600 dark:text-red-400 truncate max-w-[140px] mt-0.5" title={inv.error_message}>
                              {inv.error_message}
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {inv.status === "failed" && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleResendWsInvite(inv)}
                                className="h-8 text-xs px-2.5 rounded-xl text-red-700 border-red-200 hover:bg-red-50 font-semibold"
                                title="Retry sending invitation email via Supabase Auth"
                              >
                                Retry
                              </Button>
                            )}

                            {(inv.status === "sent" || inv.status === "pending") && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleResendWsInvite(inv)}
                                className="h-8 text-xs px-2.5 rounded-xl font-semibold border-slate-200 bg-white hover:bg-slate-50 text-slate-700"
                                title="Resend invitation email via Supabase Auth"
                              >
                                Resend
                              </Button>
                            )}

                            {inv.status !== "accepted" && inv.status !== "revoked" && (
                              <>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleRegenerateWsCode(inv)}
                                  className="h-8 text-xs px-2.5 rounded-xl text-blue-600 border-blue-200 hover:bg-blue-50 font-semibold"
                                  title="Generate new One-Time Activation Code"
                                >
                                  <KeyRound className="w-3 h-3 mr-1" /> Code
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleRevokeWsInvite(inv)}
                                  className="h-8 text-xs px-2.5 rounded-xl text-red-600 hover:bg-red-50 font-semibold"
                                  title="Revoke Invitation"
                                >
                                  Revoke
                                </Button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}

                    {/* Staff Users in invited status */}
                    {users
                      .filter((u) => u.status === "invited" && !workspaceInvitations.some((i) => i.email.toLowerCase() === u.email.toLowerCase()))
                      .map((u) => (
                        <tr key={u.id} className="h-12 hover:bg-slate-50/60 transition-colors">
                          <td className="px-4 py-3 font-bold text-slate-900 dark:text-slate-100">{u.full_name}</td>
                          <td className="px-3 py-3 text-slate-600">{u.email}</td>
                          <td className="px-3 py-3 text-slate-500">HQ Primary</td>
                          <td className="px-3 py-3 uppercase text-xs font-semibold">{u.role}</td>
                          <td className="px-3 py-3 text-slate-500">Primary Owner</td>
                          <td className="px-3 py-3 text-slate-500 font-mono">{new Date(u.created_at).toLocaleDateString()}</td>
                          <td className="px-3 py-3 text-slate-500">72 Hours</td>
                          <td className="px-3 py-3">
                            <Badge className="bg-blue-100 text-blue-800 text-[10px] font-bold rounded-md">Pending</Badge>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleResendInvite(u)}
                              className="h-8 text-xs px-2.5 rounded-xl font-semibold border-slate-200 bg-white hover:bg-slate-50 text-slate-700"
                            >
                              Resend
                            </Button>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* SUBTAB 5: ACCESS REQUESTS QUEUE */}
      {activeSubTab === "access_requests" && (
        <Card className="rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-2xs bg-white dark:bg-slate-900 overflow-hidden">
          <CardContent className="p-0">
            {accessRequests.length === 0 ? (
              <div className="min-h-[220px] max-h-[280px] flex flex-col items-center justify-center p-6 text-center text-slate-500">
                <div className="h-12 w-12 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-3">
                  <CheckCircle2 className="h-6 w-6 text-emerald-500" />
                </div>
                <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">No pending access requests.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-50/80 dark:bg-slate-800/80 border-b border-slate-200/80 text-slate-500 font-bold uppercase text-[11px] tracking-wider h-11">
                    <tr>
                      <th className="px-4 py-3">Staff Member</th>
                      <th className="px-3 py-3">Requested Module</th>
                      <th className="px-3 py-3">Action</th>
                      <th className="px-4 py-3">Reason</th>
                      <th className="px-3 py-3">Status</th>
                      <th className="px-4 py-3 text-right">Review</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {accessRequests.map((req) => (
                      <tr key={req.id} className="h-12 hover:bg-slate-50/60 transition-colors">
                        <td className="px-4 py-3">
                          <div className="font-bold text-slate-900 dark:text-slate-100">{req.user_name}</div>
                          <div className="text-[11px] text-slate-500">{req.user_email}</div>
                        </td>
                        <td className="px-3 py-3 font-semibold uppercase text-blue-600">
                          {req.requested_module}
                        </td>
                        <td className="px-3 py-3 uppercase">{req.requested_action}</td>
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-400 max-w-xs truncate">
                          {req.reason || "Operational need"}
                        </td>
                        <td className="px-3 py-3">
                          <Badge
                            className={`text-[10px] uppercase font-bold rounded-md ${
                              req.status === "approved"
                                ? "bg-emerald-100 text-emerald-800"
                                : req.status === "rejected"
                                ? "bg-rose-100 text-rose-800"
                                : "bg-amber-100 text-amber-800"
                            }`}
                          >
                            {req.status}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-right">
                          {req.status === "pending" ? (
                            <div className="flex items-center justify-end gap-1.5">
                              <Button
                                size="sm"
                                onClick={() => handleApproveAccessRequest(req)}
                                className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-3 rounded-xl shadow-2xs"
                              >
                                Approve
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  setRejectDialog({
                                    open: true,
                                    type: "access",
                                    id: req.id,
                                    title: `Reject Access for ${req.user_name}`,
                                    reason: "",
                                  })
                                }
                                className="h-8 text-xs text-rose-600 hover:bg-rose-50 border-rose-200 px-3 rounded-xl font-semibold"
                              >
                                Reject
                              </Button>
                            </div>
                          ) : (
                            <span className="text-[11px] text-slate-400">
                              Reviewed by {req.reviewed_by || "Owner"}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* SUBTAB 6: PENDING APPROVALS QUEUE */}
      {activeSubTab === "approvals" && (
        <Card className="rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-2xs bg-white dark:bg-slate-900 overflow-hidden">
          <CardContent className="p-0">
            {approvalRequests.length === 0 ? (
              <div className="min-h-[220px] max-h-[280px] flex flex-col items-center justify-center p-6 text-center text-slate-500">
                <div className="h-12 w-12 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-3">
                  <CheckCircle2 className="h-6 w-6 text-emerald-500" />
                </div>
                <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">No pending transactions requiring owner signoff.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-50/80 dark:bg-slate-800/80 border-b border-slate-200/80 text-slate-500 font-bold uppercase text-[11px] tracking-wider h-11">
                    <tr>
                      <th className="px-4 py-3">Initiated By</th>
                      <th className="px-3 py-3">Transaction Type</th>
                      <th className="px-3 py-3 text-right">Amount</th>
                      <th className="px-3 py-3">Status</th>
                      <th className="px-4 py-3 text-right">Signoff</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {approvalRequests.map((req) => (
                      <tr key={req.id} className="h-12 hover:bg-slate-50/60 transition-colors">
                        <td className="px-4 py-3 font-semibold text-slate-900 dark:text-slate-100">{req.user_name}</td>
                        <td className="px-3 py-3 font-bold uppercase text-slate-800 dark:text-slate-200">
                          {req.request_type.replace("_", " ")}
                        </td>
                        <td className="px-3 py-3 text-right font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100">
                          {req.amount !== null && req.amount !== undefined ? `${req.currency || "AED"} ${req.amount.toLocaleString()}` : "N/A"}
                        </td>
                        <td className="px-3 py-3">
                          <Badge
                            className={`text-[10px] uppercase font-bold rounded-md ${
                              req.status === "approved"
                                ? "bg-emerald-100 text-emerald-800"
                                : req.status === "rejected"
                                ? "bg-rose-100 text-rose-800"
                                : "bg-amber-100 text-amber-800"
                            }`}
                          >
                            {req.status}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-right">
                          {req.status === "pending" ? (
                            <div className="flex items-center justify-end gap-1.5">
                              <Button
                                size="sm"
                                onClick={() => handleApproveTransaction(req)}
                                className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-3 rounded-xl shadow-2xs"
                              >
                                Approve
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  setRejectDialog({
                                    open: true,
                                    type: "approval",
                                    id: req.id,
                                    title: `Reject Transaction for ${req.user_name}`,
                                    reason: "",
                                  })
                                }
                                className="h-8 text-xs text-rose-600 hover:bg-rose-50 border-rose-200 px-3 rounded-xl font-semibold"
                              >
                                Reject
                              </Button>
                            </div>
                          ) : (
                            <span className="text-[11px] text-slate-400">
                              Reviewed by {req.reviewed_by || "Owner"}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* SUBTAB 7: ACTIVITY LOG */}
      {activeSubTab === "activity" && (
        <Card className="rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-2xs bg-white dark:bg-slate-900 overflow-hidden">
          <CardContent className="p-0">
            <div className="overflow-x-auto max-h-[60vh]">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-50/80 dark:bg-slate-800/80 border-b border-slate-200/80 text-slate-500 font-bold uppercase text-[11px] tracking-wider sticky top-0 h-11">
                  <tr>
                    <th className="px-4 py-3">Timestamp</th>
                    <th className="px-3 py-3">User</th>
                    <th className="px-3 py-3">Module</th>
                    <th className="px-3 py-3">Action</th>
                    <th className="px-4 py-3">Description</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {activityLogs.map((log) => (
                    <tr key={log.id} className="h-12 hover:bg-slate-50/60 transition-colors">
                      <td className="px-4 py-2.5 text-slate-400 text-[11px] whitespace-nowrap font-mono">
                        {new Date(log.timestamp).toLocaleString()}
                      </td>
                      <td className="px-3 py-2.5 font-bold text-slate-900 dark:text-slate-100">{log.user_name}</td>
                      <td className="px-3 py-2.5 uppercase font-medium text-slate-600 dark:text-slate-400">
                        {log.module}
                      </td>
                      <td className="px-3 py-2.5">
                        <Badge variant="outline" className="text-[10px] uppercase font-bold rounded-md">
                          {log.action}
                        </Badge>
                      </td>
                      <td className="px-4 py-2.5 text-slate-700 dark:text-slate-300">
                        {log.description}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* SUBTAB 8: SECURITY & LOCKOUT */}
      {activeSubTab === "security" && (
        <div className="space-y-4 max-w-3xl">
          <Card className="rounded-2xl border border-blue-200 dark:border-blue-900 bg-blue-50/20 dark:bg-blue-950/20 shadow-2xs">
            <CardHeader className="p-5 pb-3">
              <CardTitle className="text-sm font-bold flex items-center gap-2 text-blue-900 dark:text-blue-200">
                <div className="h-8 w-8 rounded-xl bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center text-blue-600">
                  <Crown className="w-4 h-4" />
                </div>
                Primary Owner Lockout Protection Active
              </CardTitle>
              <CardDescription className="text-xs mt-1">
                Guaranteed permanent administrative authority for {PRIMARY_OWNER_EMAIL}.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-5 pt-0 space-y-2 text-xs text-slate-700 dark:text-slate-300">
              <p>
                The Primary Owner account has permanent, hard-coded safety protections ensuring that:
              </p>
              <ul className="list-disc pl-5 space-y-1 text-[11px] text-slate-600 dark:text-slate-400">
                <li>The Primary Owner cannot be disabled, suspended, expired, or deleted.</li>
                <li>The Primary Owner cannot be demoted to staff or viewer.</li>
                <li>Module permissions for the Owner cannot be restricted.</li>
              </ul>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xs">
            <CardHeader className="p-5 pb-3">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <div className="h-8 w-8 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-600">
                  <Lock className="w-4 h-4" />
                </div>
                Session &amp; 2FA Governance
              </CardTitle>
            </CardHeader>
            <CardContent className="p-5 pt-0 space-y-3 text-xs text-slate-600 dark:text-slate-400">
              <p>
                Staff sessions can be remotely invalidated at any time via the User Actions menu.
                Temporary access automatically revokes operational access at 23:59 on the designated expiry date.
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Modals */}
      <InviteStaffModal
        isOpen={inviteModalOpen}
        onClose={() => setInviteModalOpen(false)}
        onUserInvited={() => {
          showToast("success", "Staff member invited successfully.");
          refreshData();
        }}
        currentOperator={{
          id: currentUser?.id || "usr-owner-001",
          name: currentUser?.full_name || "Primary Owner",
        }}
      />

      {manageAccessUser && (
        <ManageUserAccessModal
          isOpen={Boolean(manageAccessUser)}
          onClose={() => setManageAccessUser(null)}
          targetUser={manageAccessUser}
          allStaffUsers={users}
          currentOperator={{
            id: currentUser?.id || "usr-owner-001",
            name: currentUser?.full_name || "Primary Owner",
          }}
          onPermissionsSaved={() => {
            showToast("success", `Delegated access saved for ${manageAccessUser.full_name}.`);
            refreshData();
          }}
        />
      )}

      {activityModalUser && (
        <UserActivityModal
          open={Boolean(activityModalUser)}
          onOpenChange={(open) => !open && setActivityModalUser(null)}
          user={activityModalUser}
        />
      )}

      {/* Rejection Reason Modal */}
      {rejectDialog.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <Card className="max-w-md w-full bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-xl overflow-hidden">
            <CardHeader className="p-5 pb-3">
              <CardTitle className="text-sm font-bold text-slate-900 dark:text-slate-100">
                {rejectDialog.title}
              </CardTitle>
              <CardDescription className="text-xs mt-1">
                Provide an audit explanation for declining this request.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-5 pt-2 space-y-3">
              <Input
                placeholder="e.g. Transaction exceeds authorized monthly budget allocation..."
                value={rejectDialog.reason}
                onChange={(e) =>
                  setRejectDialog((prev) => ({ ...prev, reason: e.target.value }))
                }
                className="h-10 text-xs rounded-xl border-slate-200"
              />
              <div className="flex items-center justify-end gap-2 pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setRejectDialog({ open: false, type: "access", id: "", title: "", reason: "" })
                  }
                  className="rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-semibold h-10 px-4 shadow-2xs transition-colors text-xs"
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleConfirmReject}
                  className="bg-rose-600 hover:bg-rose-700 text-white font-semibold text-xs h-10 px-4 rounded-xl shadow-2xs transition-colors"
                >
                  Confirm Rejection
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Regenerated Code Modal */}
      {regeneratedCodeModal && (
        <Dialog
          open={regeneratedCodeModal.open}
          onOpenChange={(open) => !open && setRegeneratedCodeModal(null)}
        >
          <DialogContent className="max-w-md bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-xl rounded-2xl p-6">
            <DialogHeader className="pb-2">
              <DialogTitle className="text-base font-bold flex items-center gap-2 text-slate-900 dark:text-slate-100">
                <KeyRound className="w-5 h-5 text-blue-600" />
                New One-Time Activation Code
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500">
                A fresh one-time activation code has been generated for {regeneratedCodeModal.email}. Previous codes have been invalidated.
              </DialogDescription>
            </DialogHeader>

            <div className="p-4 bg-blue-50/50 dark:bg-blue-950/20 border border-blue-200/80 dark:border-blue-800 rounded-xl my-2 text-center">
              <span className="text-[11px] font-bold text-blue-600 uppercase tracking-wider block mb-1">
                One-Time Activation Code
              </span>
              <p className="font-mono font-bold text-2xl tracking-widest text-blue-600 select-all">
                {regeneratedCodeModal.code}
              </p>
            </div>

            <DialogFooter className="pt-2">
              <Button
                onClick={() => {
                  navigator.clipboard.writeText(regeneratedCodeModal.code);
                  showToast("success", "Code copied to clipboard!");
                  setRegeneratedCodeModal(null);
                }}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs h-10 rounded-xl shadow-2xs transition-colors"
              >
                Copy Code &amp; Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* ─── REMOVE ACCESS CONFIRMATION MODAL (Requirement 3 & 4) ─── */}
      {removeAccessModalUser && (
        <Dialog
          open={Boolean(removeAccessModalUser)}
          onOpenChange={(open) => !open && setRemoveAccessModalUser(null)}
        >
          <DialogContent className="max-w-md bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-xl rounded-2xl p-6">
            <DialogHeader className="pb-2">
              <DialogTitle className="text-base font-bold flex items-center gap-2 text-slate-900 dark:text-slate-100">
                <UserMinus className="w-5 h-5 text-amber-600" />
                Remove Access
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500">
                Remove this user&apos;s access to this workspace?
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-2">
              <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 text-xs space-y-1">
                <p><span className="text-slate-500">User:</span> <strong>{removeAccessModalUser.full_name}</strong></p>
                <p><span className="text-slate-500">Email:</span> <strong>{removeAccessModalUser.email}</strong></p>
                <p><span className="text-slate-500">Workspace:</span> <strong>{currentWorkspace.name}</strong></p>
                <p><span className="text-slate-500">Role:</span> <strong className="uppercase">{removeAccessModalUser.role}</strong></p>
              </div>

              <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-xl text-xs text-amber-800 dark:text-amber-300 space-y-1">
                <div className="flex items-center gap-1.5 font-bold">
                  <ShieldCheck className="w-4 h-4 text-amber-600 shrink-0" />
                  Historical Data Preserved
                </div>
                <p className="text-[11px] text-amber-700 dark:text-amber-400">
                  All historical records (Job Cards, Invoices, Payments, Audit Logs) created by this user will remain 100% intact with their original authorship attribution preserved.
                </p>
              </div>
            </div>

            <DialogFooter className="gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setRemoveAccessModalUser(null)}
                disabled={actionProcessing}
                className="rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-semibold h-10 px-4 shadow-2xs transition-colors text-xs"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleConfirmRemoveAccess}
                disabled={actionProcessing}
                className="bg-orange-600 hover:bg-orange-700 text-white font-semibold text-xs h-10 px-4 rounded-xl shadow-2xs gap-1.5 transition-colors"
              >
                {actionProcessing && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Remove Access
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* ─── DELETE USER CONFIRMATION MODAL (Requirement 6, 7 & 9) ─── */}
      {deleteUserModalUser && (
        <Dialog
          open={Boolean(deleteUserModalUser)}
          onOpenChange={(open) => !open && setDeleteUserModalUser(null)}
        >
          <DialogContent className="max-w-md bg-white dark:bg-slate-900 p-6 border border-rose-200 dark:border-rose-900 shadow-xl rounded-2xl">
            <DialogHeader className="pb-2">
              <DialogTitle className="text-base font-bold flex items-center gap-2 text-rose-600">
                <Trash2 className="w-5 h-5 text-rose-600" />
                DELETE USER
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500">
                Permanently deactivate this user&apos;s software login account.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-2">
              <div className="p-3 bg-rose-50/40 dark:bg-rose-950/20 rounded-xl border border-rose-200 dark:border-rose-900/60 text-xs space-y-1">
                <p><span className="text-slate-500">User:</span> <strong>{deleteUserModalUser.full_name}</strong></p>
                <p><span className="text-slate-500">Email:</span> <strong>{deleteUserModalUser.email}</strong></p>
                <p><span className="text-slate-500">Current Role:</span> <strong className="uppercase">{deleteUserModalUser.role}</strong></p>
              </div>

              <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-xl text-xs text-amber-800 dark:text-amber-300 space-y-1">
                <p className="font-bold">
                  &ldquo;This will remove this user&apos;s software login access. Historical workshop and financial records created by this user will be preserved.&rdquo;
                </p>
                <p className="text-[11px] text-amber-700 dark:text-amber-400">
                  Past invoices, job cards, expenses, inventory movements, and ledger entries will keep this user&apos;s name and ID.
                </p>
              </div>
            </div>

            <DialogFooter className="gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDeleteUserModalUser(null)}
                disabled={actionProcessing}
                className="rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-semibold h-10 px-4 shadow-2xs transition-colors text-xs"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleConfirmDeleteUser}
                disabled={actionProcessing}
                className="bg-rose-600 hover:bg-rose-700 text-white font-semibold text-xs h-10 px-4 rounded-xl shadow-2xs gap-1.5 transition-colors"
              >
                {actionProcessing && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Delete User
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Floating Bulk Action Bar for Staff Users */}
      {activeSubTab === "users" && (
        <>
          <BulkActionBar
            selectedCount={selectedStaffUserIds.length}
            onClearSelection={() => setSelectedStaffUserIds([])}
            onDeleteSelected={handleRequestBulkDeleteStaff}
            deleteLabel="Delete Accounts"
            isDeleting={bulkDeletingStaff}
            customActions={[
              {
                label: "Suspend",
                icon: <Power className="h-3.5 w-3.5 text-amber-600" />,
                onClick: handleBulkSuspend,
                variant: "outline",
                className: "text-amber-700 hover:bg-amber-50 border-amber-300",
              },
              {
                label: "Remove Access",
                icon: <UserMinus className="h-3.5 w-3.5 text-orange-600" />,
                onClick: handleBulkRemoveAccess,
                variant: "outline",
                className: "text-orange-700 hover:bg-orange-50 border-orange-300",
              },
            ]}
          />

          <RecordDeleteDialog
            open={bulkDeleteDialogOpen}
            onOpenChange={setBulkDeleteDialogOpen}
            recordType="Staff Account"
            recordTypePlural="Staff Accounts"
            recordCount={selectedStaffUserIds.length}
            onConfirmDelete={handleConfirmBulkDeleteStaff}
            isDeleting={bulkDeletingStaff}
          />
        </>
      )}
    </div>
  );
}

export default UserAccessTab;
