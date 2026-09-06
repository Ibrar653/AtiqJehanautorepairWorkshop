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
  getLocalMembers,
} from "@/lib/services/workspace-service";
import { getUsers, updateUserAccessControls } from "@/lib/services/user-service";
import { DEFAULT_WORKSPACE_ID, PRIMARY_OWNER_EMAIL } from "@/lib/constants";
import type { Workspace, User } from "@/types/database";

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
  const [subTab, setSubTab] = useState<"active" | "archived">("active");

  // Modals
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [selectedWorkspace, setSelectedWorkspace] = useState<Workspace | null>(null);

  // Direct Delete Modal state (Requirement 8, 9, 10)
  const [deleteTargetWorkspace, setDeleteTargetWorkspace] = useState<Workspace | null>(null);
  const [typedDeleteName, setTypedDeleteName] = useState("");
  const [deletingWorkspace, setDeletingWorkspace] = useState(false);

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

  // Top Stats calculation (Requirement 2)
  const activeCount = useMemo(
    () => workspaces.filter((w) => w.status === "active").length,
    [workspaces]
  );
  const archivedCount = useMemo(
    () => workspaces.filter((w) => w.status === "archived").length,
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

  // Filter workspaces based on search and active/archived subtab
  const filteredWorkspaces = useMemo(() => {
    return workspaces.filter((ws) => {
      if (subTab === "active" && ws.status === "archived") return false;
      if (subTab === "archived" && ws.status !== "archived") return false;

      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        ws.name.toLowerCase().includes(q) ||
        (ws.business_name && ws.business_name.toLowerCase().includes(q)) ||
        (ws.owner_name && ws.owner_name.toLowerCase().includes(q)) ||
        (ws.owner_email && ws.owner_email.toLowerCase().includes(q)) ||
        (ws.email && ws.email.toLowerCase().includes(q))
      );
    });
  }, [workspaces, searchQuery, subTab]);

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
        <div className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              Total Workspaces
            </p>
            <p className="text-2xl font-bold font-mono tabular-nums text-slate-900 mt-0.5">
              {workspaces.length}
            </p>
          </div>
          <div className="w-9 h-9 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center">
            <Building2 className="w-4 h-4" />
          </div>
        </div>

        <div className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-semibold text-emerald-700 uppercase tracking-wider">
              Active Workspaces
            </p>
            <p className="text-2xl font-bold font-mono tabular-nums text-emerald-700 mt-0.5">
              {activeCount}
            </p>
          </div>
          <div className="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <CheckCircle2 className="w-4 h-4" />
          </div>
        </div>

        <div className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-semibold text-amber-700 uppercase tracking-wider">
              Archived Workspaces
            </p>
            <p className="text-2xl font-bold font-mono tabular-nums text-amber-700 mt-0.5">
              {archivedCount}
            </p>
          </div>
          <div className="w-9 h-9 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
            <Archive className="w-4 h-4" />
          </div>
        </div>

        <div className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-semibold text-blue-700 uppercase tracking-wider">
              Total Workspace Users
            </p>
            <p className="text-2xl font-bold font-mono tabular-nums text-blue-700 mt-0.5">
              {totalWorkspaceUsers}
            </p>
          </div>
          <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
            <Users className="w-4 h-4" />
          </div>
        </div>
      </div>

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

          {/* Subtabs: Active vs Archived Workspaces (Requirement 20) */}
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
              onClick={() => setSubTab("archived")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
                subTab === "archived"
                  ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-xs"
                  : "bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-400"
              }`}
            >
              <span>Archived Workspaces</span>
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full font-black ${
                  subTab === "archived"
                    ? "bg-white/20 text-white dark:bg-black/20 dark:text-black"
                    : "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-400"
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
              <thead className="bg-slate-50/80 text-slate-600 font-semibold text-[11px] uppercase tracking-wider border-b border-slate-200/80 sticky top-0 z-10">
                <tr className="h-10">
                  <th className="py-2 px-4">Workspace Name</th>
                  <th className="py-2 px-4">Workspace Owner</th>
                  <th className="py-2 px-4">Owner Email</th>
                  <th className="py-2 px-4">Status</th>
                  <th className="py-2 px-4">Users</th>
                  <th className="py-2 px-4">Created Date</th>
                  <th className="py-2 px-4">Last Activity</th>
                  <th className="py-2 px-4 text-right w-[200px] whitespace-nowrap">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredWorkspaces.map((ws) => {
                  const isCurrent = ws.id === currentWorkspace.id;
                  const isPrimary = ws.id === DEFAULT_WORKSPACE_ID;
                  const ownerName = ws.owner_name || "Assigned Operator";
                  const ownerEmail = ws.owner_email || ws.email || "owner@email.com";
                  const activeMembersForWs = getLocalMembers().filter(
                    (m) => m.workspace_id === ws.id && m.status === "active"
                  );
                  const wsUsersCount = activeMembersForWs.length;

                  return (
                    <tr
                      key={ws.id}
                      className={`h-12 transition-colors hover:bg-slate-50/70 dark:hover:bg-slate-800/30 ${
                        isCurrent ? "bg-purple-50/30 dark:bg-purple-950/20" : ""
                      }`}
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
                              <span className="font-bold text-slate-900 dark:text-slate-100">
                                {ws.name}
                              </span>
                              {isPrimary ? (
                                <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-300 text-[10px] font-black uppercase">
                                  PRIMARY WORKSPACE
                                </Badge>
                              ) : (
                                <Badge className="bg-purple-100 text-purple-800 dark:bg-purple-900/60 dark:text-purple-300 text-[10px] font-black uppercase">
                                  SECONDARY
                                </Badge>
                              )}
                              {isCurrent && (
                                <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 text-[10px] font-black">
                                  Active Session
                                </Badge>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-400 mt-0.5">
                              {ws.business_name || ws.address || "Sharjah, UAE"}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Workspace Owner */}
                      <td className="py-2.5 px-4">
                        <span className="font-bold text-slate-800 dark:text-slate-200">
                          {ownerName}
                        </span>
                      </td>

                      {/* Owner Email */}
                      <td className="py-2.5 px-4">
                        <span className="font-mono text-slate-600 dark:text-slate-400 text-[11px]">
                          {ownerEmail}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="py-2.5 px-4">
                        <Badge
                          className={`text-[10px] uppercase font-black ${
                            ws.status === "active"
                              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"
                              : ws.status === "archived"
                              ? "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300"
                              : "bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300"
                          }`}
                        >
                          {ws.status}
                        </Badge>
                      </td>

                      {/* Users Count (Requirement 3) */}
                      <td className="py-2.5 px-4">
                        <span className="font-bold text-slate-900 dark:text-slate-100 font-mono tabular-nums">
                          {wsUsersCount} {wsUsersCount === 1 ? "User" : "Users"}
                        </span>
                      </td>

                      {/* Created Date */}
                      <td className="py-2.5 px-4 text-slate-500 text-[11px]">
                        {ws.created_at ? new Date(ws.created_at).toLocaleDateString() : "2024-01-01"}
                      </td>

                      {/* Last Activity */}
                      <td className="py-2.5 px-4 text-slate-500 text-[11px]">
                        {ws.last_activity ? (
                          <span className="flex items-center gap-1 text-slate-700 dark:text-slate-300">
                            <Clock className="w-3 h-3 text-slate-400" />
                            {new Date(ws.last_activity).toLocaleDateString()}
                          </span>
                        ) : (
                          <span className="text-slate-400 italic">Recently active</span>
                        )}
                      </td>

                      {/* Actions (Requirement 4) */}
                      <td className="py-2.5 px-4 text-right w-[200px] whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          {!isCurrent && ws.status !== "archived" && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => switchWorkspace(ws.id)}
                              className="text-xs h-8 border-slate-200 hover:bg-purple-50 hover:text-purple-700 font-semibold"
                            >
                              <ArrowRight className="w-3.5 h-3.5 mr-1" /> Open
                            </Button>
                          )}

                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleOpenManageUsers(ws)}
                            className="text-xs h-8 border-slate-200 hover:bg-slate-100 font-semibold text-slate-700 dark:text-slate-300"
                          >
                            <Users className="w-3.5 h-3.5 mr-1 text-blue-600" /> Manage Access
                          </Button>

                          {isPlatformOwner && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setSelectedWorkspace(ws)}
                              className="text-xs h-8 border-slate-200 hover:bg-blue-50 hover:text-blue-700 font-bold"
                            >
                              <Sliders className="w-3.5 h-3.5 mr-1" /> Manage
                            </Button>
                          )}

                          {isPlatformOwner && (
                            <DropdownMenu>
                              <DropdownMenuTrigger className="h-8 w-8 inline-flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">
                                <MoreVertical className="w-3.5 h-3.5" />
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="text-xs">
                                <DropdownMenuLabel>Workspace Actions</DropdownMenuLabel>
                                {!isCurrent && ws.status !== "archived" && (
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
    </div>
  );
}
