"use client";

import { useState, useEffect, useCallback } from "react";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Users,
  Shield,
  ShieldCheck,
  Building,
  Building2,
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
  FileSpreadsheet,
  Check,
  RotateCcw,
  Sparkles,
  Phone,
  Briefcase,
  AlertTriangle,
  History,
  MoreVertical,
  Layers,
  Crown,
  UserPlus,
  Palette,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  getUsers,
  createUser,
  updateUser,
  deleteUser,
  sendPasswordResetEmail,
  sendStaffInvitation,
  getUserPermissions,
  saveUserPermissions,
  getUserActivityLogs,
} from "@/lib/services/user-service";
import { usePermissions } from "@/lib/context/auth-context";
import {
  USER_ROLES,
  STAFF_USER_ROLES,
  ALL_APP_MODULES,
  getDefaultPermissionsForRole,
  getAllPermissionsEnabled,
  getEmptyPermissions,
  COMPANY_FULL_NAME,
  APP_NAME,
  DEFAULT_VAT_RATE,
  CURRENCY,
  PRIMARY_OWNER_EMAIL,
  getUserHierarchyLevel,
  HIERARCHY_BADGE_CONFIG,
} from "@/lib/constants";
import type { User, UserRole, UserStatus, AppModule, UserModulePermission } from "@/types/database";
import { ManageUserAccessModal } from "@/components/settings/manage-user-access-modal";
import { InviteStaffModal } from "@/components/settings/invite-staff-modal";
import { PermissionsMatrix } from "@/components/settings/permissions-matrix";
import { UserActivityModal } from "@/components/settings/user-activity-modal";
import { UserAccessTab } from "@/components/settings/user-access-tab";
import { WorkspacesTab } from "@/components/settings/workspaces-tab";
import { TestDataResetTab } from "@/components/settings/test-data-reset-tab";
import { AppearanceThemeTab } from "@/components/settings/appearance-theme-tab";
import { useWorkspace } from "@/lib/context/workspace-context";


const roleBadgeColors: Record<UserRole, string> = {
  owner: "bg-blue-100 text-blue-900 border-blue-300 font-bold dark:bg-blue-900/40 dark:text-blue-300",
  manager: "bg-emerald-100 text-emerald-900 border-emerald-300 font-semibold dark:bg-emerald-900/40 dark:text-emerald-300",
  accountant: "bg-amber-100 text-amber-900 border-amber-300 font-semibold dark:bg-amber-900/40 dark:text-amber-300",
  receptionist: "bg-purple-100 text-purple-900 border-purple-300 font-medium dark:bg-purple-900/40 dark:text-purple-300",
  storekeeper: "bg-orange-100 text-orange-900 border-orange-300 font-medium dark:bg-orange-900/40 dark:text-orange-300",
  mechanic: "bg-cyan-100 text-cyan-900 border-cyan-300 font-medium dark:bg-cyan-900/40 dark:text-cyan-300",
  viewer: "bg-slate-100 text-slate-800 border-slate-300 dark:bg-slate-800 dark:text-slate-300",
  admin: "bg-indigo-100 text-indigo-900 border-indigo-300 font-bold dark:bg-indigo-900/40 dark:text-indigo-300",
  custom: "bg-pink-100 text-pink-900 border-pink-300 font-medium dark:bg-pink-900/40 dark:text-pink-300",
};

export default function SettingsPage() {
  const { user: currentUser, isOwner } = usePermissions();
  const { isPlatformOwner } = useWorkspace();
  const [activeTab, setActiveTab] = useState("user_access");
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Filters
  const [searchFilter, setSearchFilter] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // ─── Add Staff User Modal State ───
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [addModalTab, setAddModalTab] = useState<"profile" | "permissions">("profile");
  const [newFullName, setNewFullName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newJobTitle, setNewJobTitle] = useState("");
  const [newRole, setNewRole] = useState<UserRole>("manager");
  const [newStatus, setNewStatus] = useState<UserStatus>("active");
  const [newExpiryDate, setNewExpiryDate] = useState("");
  const [newNotes, setNewNotes] = useState("");
  const [newInviteMode, setNewInviteMode] = useState<"invite" | "password">("invite");
  const [newPassword, setNewPassword] = useState("");
  const [newPermissions, setNewPermissions] = useState<Record<AppModule, UserModulePermission>>(
    getDefaultPermissionsForRole("manager")
  );
  const [savingUser, setSavingUser] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // ─── Enterprise Delegated Access Modals ───
  const [manageAccessModalOpen, setManageAccessModalOpen] = useState(false);
  const [selectedManageUser, setSelectedManageUser] = useState<User | null>(null);
  const [inviteModalOpen, setInviteModalOpen] = useState(false);

  // ─── Edit Permissions Modal State ───
  const [editPermsModalOpen, setEditPermsModalOpen] = useState(false);
  const [editingPermsUser, setEditingPermsUser] = useState<User | null>(null);
  const [editingPermsMatrix, setEditingPermsMatrix] = useState<Record<AppModule, UserModulePermission>>(
    getEmptyPermissions()
  );
  const [savingPerms, setSavingPerms] = useState(false);

  // ─── View Permissions Modal State ───
  const [viewPermsModalOpen, setViewPermsModalOpen] = useState(false);
  const [viewingPermsUser, setViewingPermsUser] = useState<User | null>(null);
  const [viewingPermsMatrix, setViewingPermsMatrix] = useState<Record<AppModule, UserModulePermission>>(
    getEmptyPermissions()
  );

  // ─── Change Role Modal State ───
  const [editRoleModalOpen, setEditRoleModalOpen] = useState(false);
  const [roleUser, setRoleUser] = useState<User | null>(null);
  const [selectedRole, setSelectedRole] = useState<UserRole>("manager");
  const [resetPermsWithRole, setResetPermsWithRole] = useState(true);
  const [updatingRole, setUpdatingRole] = useState(false);

  // ─── Activity Modal State ───
  const [activityModalOpen, setActivityModalOpen] = useState(false);
  const [activityUser, setActivityUser] = useState<User | null>(null);

  // ─── Delete Confirmation Modal State ───
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<User | null>(null);
  const [deleting, setDeleting] = useState(false);

  // ─── Password / Invite Dispatch State ───
  const [dispatchingEmail, setDispatchingEmail] = useState<string | null>(null);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getUsers();
      setUsers(data);
    } catch (err: any) {
      console.error("Failed to load users:", err);
      setToast({ type: "error", text: "Failed to load staff accounts." });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  // When role changes in Add modal, update default permissions template
  const handleNewRoleChange = (role: UserRole) => {
    setNewRole(role);
    setNewPermissions(getDefaultPermissionsForRole(role));
  };

  // ─── Add Staff User Handler ───
  const handleCreateStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFullName.trim()) {
      setFormError("Full Name is required.");
      setAddModalTab("profile");
      return;
    }
    if (!newEmail.trim() || !newEmail.includes("@")) {
      setFormError("A valid work email address is required.");
      setAddModalTab("profile");
      return;
    }
    if (newInviteMode === "password" && !newPassword.trim()) {
      setFormError("Please provide a temporary password or select 'Send Invitation Link'.");
      setAddModalTab("profile");
      return;
    }

    setSavingUser(true);
    setFormError(null);

    const operatorObj = currentUser
      ? { id: currentUser.id, name: currentUser.full_name, role: currentUser.role }
      : { id: "usr-owner-001", name: "Workshop Owner", role: "owner" as UserRole };

    const res = await createUser({
      full_name: newFullName.trim(),
      email: newEmail.trim(),
      role: newRole,
      status: newStatus,
      phone: newPhone.trim() || undefined,
      job_title: newJobTitle.trim() || undefined,
      access_expiry_date: newExpiryDate || undefined,
      notes: newNotes.trim() || undefined,
      permissions: newPermissions,
      password: newInviteMode === "password" ? newPassword.trim() : undefined,
      creatorRole: currentUser?.role,
      operator: operatorObj,
    });

    setSavingUser(false);

    if (res.error) {
      setFormError(res.error);
      return;
    }

    // Send invitation email if invite mode selected
    if (newInviteMode === "invite") {
      await sendStaffInvitation(newEmail.trim(), newRole, newFullName.trim());
    }

    setAddModalOpen(false);
    // Reset form
    setNewFullName("");
    setNewEmail("");
    setNewPhone("");
    setNewJobTitle("");
    setNewRole("manager");
    setNewStatus("active");
    setNewExpiryDate("");
    setNewNotes("");
    setNewPassword("");
    setNewPermissions(getDefaultPermissionsForRole("manager"));
    setAddModalTab("profile");

    setToast({
      type: "success",
      text: `Staff user "${res.user?.full_name}" created successfully with role ${newRole.toUpperCase()}.`,
    });
    loadUsers();
  };

  // ─── Open Edit Permissions Modal ───
  const handleOpenEditPermissions = async (targetUser: User) => {
    if (targetUser.email.toLowerCase() === PRIMARY_OWNER_EMAIL.toLowerCase()) {
      setToast({
        type: "error",
        text: "The Primary Owner account has permanent unrestricted full access and cannot be restricted.",
      });
      return;
    }
    setEditingPermsUser(targetUser);
    const perms = await getUserPermissions(targetUser.id);
    setEditingPermsMatrix(perms);
    setEditPermsModalOpen(true);
  };

  // ─── Save Edit Permissions ───
  const handleSavePermissions = async () => {
    if (!editingPermsUser) return;
    setSavingPerms(true);

    const operatorObj = currentUser
      ? { id: currentUser.id, name: currentUser.full_name }
      : { id: "usr-owner-001", name: "Workshop Owner" };

    const res = await saveUserPermissions(editingPermsUser.id, editingPermsMatrix, operatorObj);
    setSavingPerms(false);

    if (res.error) {
      setToast({ type: "error", text: res.error });
      return;
    }

    setEditPermsModalOpen(false);
    setToast({
      type: "success",
      text: `Permissions updated and audited for ${editingPermsUser.full_name} (${editingPermsUser.email}).`,
    });
    loadUsers();
  };

  // ─── Open View Permissions Modal ───
  const handleOpenViewPermissions = async (targetUser: User) => {
    setViewingPermsUser(targetUser);
    const perms = await getUserPermissions(targetUser.id);
    setViewingPermsMatrix(perms);
    setViewPermsModalOpen(true);
  };

  // ─── Open Change Role Modal ───
  const handleOpenChangeRole = (targetUser: User) => {
    if (targetUser.email.toLowerCase() === PRIMARY_OWNER_EMAIL.toLowerCase()) {
      setToast({ type: "error", text: "The Primary Owner role cannot be changed." });
      return;
    }
    setRoleUser(targetUser);
    setSelectedRole(targetUser.role);
    setResetPermsWithRole(true);
    setEditRoleModalOpen(true);
  };

  // ─── Save Role Change ───
  const handleSaveRoleChange = async () => {
    if (!roleUser) return;
    setUpdatingRole(true);

    const operatorObj = currentUser
      ? { id: currentUser.id, name: currentUser.full_name, role: currentUser.role }
      : { id: "usr-owner-001", name: "Workshop Owner", role: "owner" as UserRole };

    const res = await updateUser(roleUser.id, { role: selectedRole }, operatorObj);

    if (res.error) {
      setUpdatingRole(false);
      setToast({ type: "error", text: res.error });
      return;
    }

    // Optionally reset permissions to new role template
    if (resetPermsWithRole) {
      const templatePerms = getDefaultPermissionsForRole(selectedRole);
      await saveUserPermissions(roleUser.id, templatePerms, {
        id: operatorObj.id,
        name: operatorObj.name,
      });
    }

    setUpdatingRole(false);
    setEditRoleModalOpen(false);
    setToast({
      type: "success",
      text: `Role changed to ${selectedRole.toUpperCase()} for ${roleUser.full_name}.`,
    });
    loadUsers();
  };

  // ─── Quick Status Toggle (Activate / Suspend) ───
  const handleToggleStatus = async (targetUser: User) => {
    if (targetUser.email.toLowerCase() === PRIMARY_OWNER_EMAIL.toLowerCase()) {
      setToast({ type: "error", text: "The Primary Owner account cannot be suspended or deactivated." });
      return;
    }

    const currentStatus = targetUser.status || (targetUser.is_active ? "active" : "disabled");
    const newStatus: UserStatus = currentStatus === "active" ? "suspended" : "active";

    const operatorObj = currentUser
      ? { id: currentUser.id, name: currentUser.full_name, role: currentUser.role }
      : { id: "usr-owner-001", name: "Workshop Owner", role: "owner" as UserRole };

    const res = await updateUser(targetUser.id, { status: newStatus }, operatorObj);

    if (res.error) {
      setToast({ type: "error", text: res.error });
      return;
    }

    setToast({
      type: "success",
      text: `Account for ${targetUser.full_name} set to ${newStatus.toUpperCase()}.`,
    });
    loadUsers();
  };

  // ─── Dispatch Password Setup / Reset Link ───
  const handleDispatchPassword = async (targetUser: User) => {
    setDispatchingEmail(targetUser.email);
    const res = await sendStaffInvitation(targetUser.email, targetUser.role, targetUser.full_name);
    setDispatchingEmail(null);

    if (res.error) {
      setToast({ type: "error", text: res.error });
      return;
    }

    setToast({
      type: "success",
      text: `Password setup & invitation dispatched to ${targetUser.email}.`,
    });
  };

  // ─── Confirm Delete User ───
  const handleConfirmDelete = async () => {
    if (!userToDelete) return;
    setDeleting(true);

    const operatorObj = currentUser
      ? { id: currentUser.id, name: currentUser.full_name, role: currentUser.role }
      : { id: "usr-owner-001", name: "Workshop Owner", role: "owner" as UserRole };

    const res = await deleteUser(userToDelete.id, operatorObj);
    setDeleting(false);
    setDeleteModalOpen(false);
    setUserToDelete(null);

    if (res.error) {
      setToast({ type: "error", text: res.error });
      return;
    }

    setToast({ type: "success", text: "Staff account removed from system." });
    loadUsers();
  };

  // Filtered Users List
  const filteredUsers = users.filter((u) => {
    const q = searchFilter.toLowerCase();
    const matchesSearch =
      !searchFilter ||
      u.full_name.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      (u.phone && u.phone.toLowerCase().includes(q)) ||
      (u.job_title && u.job_title.toLowerCase().includes(q));

    const matchesRole = roleFilter === "all" || u.role === roleFilter;

    const uStatus = u.status || (u.is_active ? "active" : "disabled");
    const matchesStatus = statusFilter === "all" || uStatus === statusFilter;

    return matchesSearch && matchesRole && matchesStatus;
  });

  // Count metrics
  const activeCount = users.filter((u) => (u.status || (u.is_active ? "active" : "disabled")) === "active").length;
  const invitedCount = users.filter((u) => u.status === "invited").length;
  const suspendedCount = users.filter((u) => (u.status || (u.is_active ? "active" : "disabled")) === "suspended").length;
  const disabledCount = users.filter((u) => (u.status || (u.is_active ? "active" : "disabled")) === "disabled").length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="Manage workshop configuration, staff user access, permissions, and business workspaces."
        breadcrumbs={[
          { label: "System & Administration" },
          { label: "Settings" },
        ]}
      />

      {/* Toast Banner */}
      {toast && (
        <div
          className={`flex items-center justify-between p-4 rounded-2xl border text-xs font-semibold shadow-2xs animate-in fade-in-50 ${
            toast.type === "success"
              ? "bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-950/40 dark:border-emerald-800 dark:text-emerald-300"
              : "bg-red-50 border-red-200 text-red-800 dark:bg-red-950/40 dark:border-red-800 dark:text-red-300"
          }`}
        >
          <div className="flex items-center gap-2.5">
            {toast.type === "success" ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="h-4 w-4 text-red-600 shrink-0" />
            )}
            <span>{toast.text}</span>
          </div>
          <button
            onClick={() => setToast(null)}
            className="text-[11px] underline hover:opacity-75 cursor-pointer ml-4 font-semibold"
          >
            Dismiss
          </button>
        </div>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        {/* Navigation Tabs Bar — Horizontal scrollable on small screens, clean single row on desktop */}
        <div className="w-full overflow-x-auto pb-1 no-scrollbar">
          <TabsList className="bg-slate-100/90 dark:bg-slate-800/80 p-1.5 rounded-2xl border border-slate-200/90 dark:border-slate-700/80 flex items-center justify-start gap-1.5 w-max min-w-full shadow-2xs">
            <TabsTrigger
              value="user_access"
              className="group flex-shrink-0 inline-flex items-center justify-center gap-[7px] px-4 h-10 rounded-xl font-semibold text-[12.5px] leading-none text-[#475569] dark:text-slate-400 hover:text-[#0F172A] dark:hover:text-slate-200 data-active:bg-white data-active:text-[#0F172A] data-active:shadow-xs data-[state=active]:bg-white data-[state=active]:text-[#0F172A] data-[state=active]:shadow-xs dark:data-active:bg-slate-900 dark:data-active:text-white dark:data-[state=active]:bg-slate-900 dark:data-[state=active]:text-white transition-all whitespace-nowrap"
            >
              <span className="inline-flex items-center justify-center shrink-0 text-slate-400 dark:text-slate-500 group-hover:text-slate-600 dark:group-hover:text-slate-300 group-data-active:text-blue-600 group-data-[state=active]:text-blue-600 transition-colors" aria-hidden="true">
                <ShieldCheck className="w-[15px] h-[15px] stroke-[1.8]" />
              </span>
              <span>User Access &amp; Permissions</span>
            </TabsTrigger>

            <TabsTrigger
              value="activity_audit"
              className="group flex-shrink-0 inline-flex items-center justify-center gap-[7px] px-4 h-10 rounded-xl font-semibold text-[12.5px] leading-none text-[#475569] dark:text-slate-400 hover:text-[#0F172A] dark:hover:text-slate-200 data-active:bg-white data-active:text-[#0F172A] data-active:shadow-xs data-[state=active]:bg-white data-[state=active]:text-[#0F172A] data-[state=active]:shadow-xs dark:data-active:bg-slate-900 dark:data-active:text-white dark:data-[state=active]:bg-slate-900 dark:data-[state=active]:text-white transition-all whitespace-nowrap"
            >
              <span className="inline-flex items-center justify-center shrink-0 text-slate-400 dark:text-slate-500 group-hover:text-slate-600 dark:group-hover:text-slate-300 group-data-active:text-blue-600 group-data-[state=active]:text-blue-600 transition-colors" aria-hidden="true">
                <History className="w-[15px] h-[15px] stroke-[1.8]" />
              </span>
              <span>Activity &amp; Audit Logs</span>
            </TabsTrigger>

            <TabsTrigger
              value="security"
              className="group flex-shrink-0 inline-flex items-center justify-center gap-[7px] px-4 h-10 rounded-xl font-semibold text-[12.5px] leading-none text-[#475569] dark:text-slate-400 hover:text-[#0F172A] dark:hover:text-slate-200 data-active:bg-white data-active:text-[#0F172A] data-active:shadow-xs data-[state=active]:bg-white data-[state=active]:text-[#0F172A] data-[state=active]:shadow-xs dark:data-active:bg-slate-900 dark:data-active:text-white dark:data-[state=active]:bg-slate-900 dark:data-[state=active]:text-white transition-all whitespace-nowrap"
            >
              <span className="inline-flex items-center justify-center shrink-0 text-slate-400 dark:text-slate-500 group-hover:text-slate-600 dark:group-hover:text-slate-300 group-data-active:text-blue-600 group-data-[state=active]:text-blue-600 transition-colors" aria-hidden="true">
                <Shield className="w-[15px] h-[15px] stroke-[1.8]" />
              </span>
              <span>Role Templates &amp; Policies</span>
            </TabsTrigger>

            <TabsTrigger
              value="workshop"
              className="group flex-shrink-0 inline-flex items-center justify-center gap-[7px] px-4 h-10 rounded-xl font-semibold text-[12.5px] leading-none text-[#475569] dark:text-slate-400 hover:text-[#0F172A] dark:hover:text-slate-200 data-active:bg-white data-active:text-[#0F172A] data-active:shadow-xs data-[state=active]:bg-white data-[state=active]:text-[#0F172A] data-[state=active]:shadow-xs dark:data-active:bg-slate-900 dark:data-active:text-white dark:data-[state=active]:bg-slate-900 dark:data-[state=active]:text-white transition-all whitespace-nowrap"
            >
              <span className="inline-flex items-center justify-center shrink-0 text-slate-400 dark:text-slate-500 group-hover:text-slate-600 dark:group-hover:text-slate-300 group-data-active:text-blue-600 group-data-[state=active]:text-blue-600 transition-colors" aria-hidden="true">
                <Building2 className="w-[15px] h-[15px] stroke-[1.8]" />
              </span>
              <span>Workspace Details &amp; VAT</span>
            </TabsTrigger>

            <TabsTrigger
              value="appearance"
              className="group flex-shrink-0 inline-flex items-center justify-center gap-[7px] px-4 h-10 rounded-xl font-semibold text-[12.5px] leading-none text-[#475569] dark:text-slate-400 hover:text-[#0F172A] dark:hover:text-slate-200 data-active:bg-white data-active:text-[#0F172A] data-active:shadow-xs data-[state=active]:bg-white data-[state=active]:text-[#0F172A] data-[state=active]:shadow-xs dark:data-active:bg-slate-900 dark:data-active:text-white dark:data-[state=active]:bg-slate-900 dark:data-[state=active]:text-white transition-all whitespace-nowrap"
            >
              <span className="inline-flex items-center justify-center shrink-0 text-slate-400 dark:text-slate-500 group-hover:text-slate-600 dark:group-hover:text-slate-300 group-data-active:text-blue-600 group-data-[state=active]:text-blue-600 transition-colors" aria-hidden="true">
                <Palette className="w-[15px] h-[15px] stroke-[1.8]" />
              </span>
              <span>Appearance &amp; Theme</span>
            </TabsTrigger>

            {isPlatformOwner && (
              <TabsTrigger
                value="workspaces"
                className="group flex-shrink-0 inline-flex items-center justify-center gap-[7px] px-4 h-10 rounded-xl font-semibold text-[12.5px] leading-none text-[#475569] dark:text-slate-400 hover:text-[#0F172A] dark:hover:text-slate-200 data-active:bg-white data-active:text-purple-700 data-active:shadow-xs data-[state=active]:bg-white data-[state=active]:text-purple-700 data-[state=active]:shadow-xs dark:data-active:bg-slate-900 dark:data-active:text-purple-300 dark:data-[state=active]:bg-slate-900 dark:data-[state=active]:text-purple-300 transition-all whitespace-nowrap"
              >
                <span className="inline-flex items-center justify-center shrink-0 text-slate-400 dark:text-slate-500 group-hover:text-slate-600 dark:group-hover:text-slate-300 group-data-active:text-purple-600 group-data-[state=active]:text-purple-600 transition-colors" aria-hidden="true">
                  <Building className="w-[15px] h-[15px] stroke-[1.8]" />
                </span>
                <span>Workspaces &amp; Businesses</span>
                <span className="inline-flex items-center ml-2 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-[0.03em] bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border border-purple-200/80 dark:border-purple-800/80">
                  SUPER ADMIN
                </span>
              </TabsTrigger>
            )}
          </TabsList>
        </div>

        {/* Administration Action Area (Test Data Reset) — Right aligned below navigation, above KPI cards */}
        {isPlatformOwner && (
          <div className="flex items-center justify-end -mt-1 mb-2">
            <button
              type="button"
              onClick={() => setActiveTab("test_reset")}
              className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-all cursor-pointer ${
                activeTab === "test_reset"
                  ? "bg-rose-50 dark:bg-rose-950/40 border-rose-300 dark:border-rose-800 text-rose-700 dark:text-rose-300 shadow-xs"
                  : "bg-white dark:bg-slate-900 border-slate-200/90 dark:border-slate-800 text-rose-600 dark:text-rose-400 hover:bg-rose-50/70 dark:hover:bg-rose-950/30 hover:border-rose-300 shadow-2xs"
              }`}
              title="Reset workshop test records (Owner Only)"
            >
              <RotateCcw className="w-3.5 h-3.5 shrink-0 text-rose-600 dark:text-rose-400" aria-hidden="true" />
              <span className="text-[12px] font-semibold text-rose-600 dark:text-rose-400">
                Test Data Reset
              </span>
              <span className="inline-flex items-center text-[9px] font-bold uppercase tracking-[0.03em] px-2 py-0.5 rounded-full bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
                OWNER ONLY
              </span>
            </button>
          </div>
        )}

        {/* ─── TAB 1: USER ACCESS & SECURITY (ENTERPRISE DELEGATED ACCESS) ─── */}
        <TabsContent value="user_access">
          <UserAccessTab />
        </TabsContent>

        {/* ─── TAB 2: ACTIVITY & AUDIT LOGS ───────────────────────────────── */}
        <TabsContent value="activity_audit">
          <Card className="border border-slate-200/90 dark:border-slate-800 shadow-2xs bg-white dark:bg-slate-900 rounded-2xl overflow-hidden">
            <CardHeader className="flex flex-row items-center justify-between p-6 border-b border-slate-100 dark:border-slate-800">
              <div>
                <CardTitle className="text-base font-bold flex items-center gap-2 text-slate-900 dark:text-slate-100">
                  <History className="w-5 h-5 text-blue-600" />
                  Workshop Staff Activity &amp; Audit Trail
                </CardTitle>
                <CardDescription className="text-xs text-slate-500 mt-1">
                  Full security history: logins, job cards, financial transactions, status changes, and permission modifications
                </CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setActivityUser(null);
                  setActivityModalOpen(true);
                }}
                className="text-xs h-10 px-4 rounded-xl border-slate-200 font-semibold gap-2"
              >
                <Eye className="w-4 h-4" /> Open Full Audit Explorer
              </Button>
            </CardHeader>
            <CardContent className="p-6">
              <p className="text-xs text-slate-600 dark:text-slate-400 mb-5 leading-relaxed">
                Click below to launch the dedicated audit inspector to search, filter, and trace operational logs across all workshop staff.
              </p>
              <Button
                onClick={() => {
                  setActivityUser(null);
                  setActivityModalOpen(true);
                }}
                className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl shadow-2xs h-10 px-5 gap-2"
              >
                <History className="w-4 h-4" /> Launch Activity &amp; Permission Audit Log Modal
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── TAB 3: WORKSHOP DETAILS & VAT ──────────────────────────────── */}
        <TabsContent value="workshop">
          <Card className="border border-slate-200/90 dark:border-slate-800 shadow-2xs bg-white dark:bg-slate-900 rounded-2xl overflow-hidden">
            <CardHeader className="p-6 border-b border-slate-100 dark:border-slate-800">
              <CardTitle className="text-base font-bold text-slate-900 dark:text-slate-100">Workshop Business Profile &amp; VAT Settings</CardTitle>
              <CardDescription className="text-xs text-slate-500 mt-1">
                Official business registration and tax invoicing credentials in the UAE
              </CardDescription>
            </CardHeader>
            <CardContent className="p-6 space-y-4 max-w-xl">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">Company Full Name</Label>
                <Input value={COMPANY_FULL_NAME} readOnly className="text-xs h-10 rounded-xl border-slate-200 bg-slate-50/60 dark:bg-slate-800 font-medium" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">Trade License TRN</Label>
                  <Input value="100482910400003" readOnly className="text-xs h-10 rounded-xl border-slate-200 bg-slate-50/60 dark:bg-slate-800 font-mono font-medium" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">Standard UAE VAT Rate</Label>
                  <Input value={`${DEFAULT_VAT_RATE}%`} readOnly className="text-xs h-10 rounded-xl border-slate-200 bg-slate-50/60 dark:bg-slate-800 font-medium" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">Operating Currency</Label>
                  <Input value={CURRENCY} readOnly className="text-xs h-10 rounded-xl border-slate-200 bg-slate-50/60 dark:bg-slate-800 font-medium" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">Primary Workshop Email</Label>
                  <Input value={PRIMARY_OWNER_EMAIL} readOnly className="text-xs h-10 rounded-xl border-slate-200 bg-slate-50/60 dark:bg-slate-800 font-medium" />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">Workshop Facility Location</Label>
                <Input value="Industrial Area 4, Sharjah, United Arab Emirates" readOnly className="text-xs h-10 rounded-xl border-slate-200 bg-slate-50/60 dark:bg-slate-800 font-medium" />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── TAB: APPEARANCE & THEME ─────────────────────────────────────── */}
        <TabsContent value="appearance">
          <AppearanceThemeTab />
        </TabsContent>

        {/* ─── TAB 4: ROLE MATRIX & POLICIES ──────────────────────────────── */}
        <TabsContent value="security">
          <Card className="border border-slate-200/90 dark:border-slate-800 shadow-2xs bg-white dark:bg-slate-900 rounded-2xl overflow-hidden">
            <CardHeader className="p-6 border-b border-slate-100 dark:border-slate-800">
              <CardTitle className="text-base font-bold text-slate-900 dark:text-slate-100">Role Templates Reference &amp; Protected Actions</CardTitle>
              <CardDescription className="text-xs text-slate-500 mt-1">
                Default templates and strict security rules governing Owner and Staff accounts
              </CardDescription>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {USER_ROLES.map((r) => (
                  <div key={r.value} className="p-4 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-lg text-xs border uppercase font-bold ${roleBadgeColors[r.value]}`}>
                        {r.label}
                      </span>
                      {r.value === "owner" && (
                        <span className="text-[10px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-lg border border-blue-200">
                          Unrestricted Access
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                      {r.description}
                    </p>
                  </div>
                ))}
              </div>

              <div className="p-4 rounded-xl border border-amber-200 bg-amber-50/40 dark:bg-amber-950/20 dark:border-amber-900/60 text-xs text-amber-900 dark:text-amber-300 space-y-2 mt-4">
                <div className="font-bold flex items-center gap-1.5">
                  <ShieldAlert className="w-4 h-4 text-amber-600" />
                  Owner Lockout Protection Policy
                </div>
                <p className="leading-relaxed">
                  The primary Owner account (<strong>{PRIMARY_OWNER_EMAIL}</strong>) is permanently protected by software-level lockout safeguards. Staff members cannot demote, suspend, or delete the Owner. The Owner account cannot accidentally delete itself.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        {isPlatformOwner && (
          <TabsContent value="workspaces">
            <WorkspacesTab />
          </TabsContent>
        )}
        {isPlatformOwner && (
          <TabsContent value="test_reset">
            <TestDataResetTab />
          </TabsContent>
        )}
      </Tabs>


      {/* ────────────────────────────────────────────────────────────────────
          MODAL: ADD STAFF USER
         ──────────────────────────────────────────────────────────────────── */}
      <Dialog open={addModalOpen} onOpenChange={setAddModalOpen}>
        <DialogContent className="max-w-4xl w-full max-h-[90vh] flex flex-col p-6 gap-4 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 rounded-2xl border border-slate-200/90 shadow-xl">
          <DialogHeader className="border-b border-slate-100 dark:border-slate-800 pb-3">
            <DialogTitle className="text-lg font-bold flex items-center gap-2">
              <Plus className="w-5 h-5 text-blue-600" />
              Add New Staff User Account
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Create a staff profile and configure their exact module and action permissions.
            </DialogDescription>
          </DialogHeader>

          {/* Tab buttons for Add User */}
          <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-2">
            <button
              type="button"
              onClick={() => setAddModalTab("profile")}
              className={`px-3.5 py-2 text-xs font-bold rounded-xl transition-colors flex items-center gap-1.5 ${
                addModalTab === "profile"
                  ? "bg-blue-600 text-white shadow-2xs"
                  : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200/60"
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              1. Staff Profile Details
            </button>
            <button
              type="button"
              onClick={() => setAddModalTab("permissions")}
              className={`px-3.5 py-2 text-xs font-bold rounded-xl transition-colors flex items-center gap-1.5 ${
                addModalTab === "permissions"
                  ? "bg-blue-600 text-white shadow-2xs"
                  : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200/60"
              }`}
            >
              <Sliders className="w-3.5 h-3.5" />
              2. Module &amp; Granular Permissions
            </button>
          </div>

          {formError && (
            <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 rounded-xl text-xs font-semibold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          <form onSubmit={handleCreateStaff} className="flex-1 flex flex-col min-h-0">
            <div className="flex-1 overflow-y-auto pr-1">
              {addModalTab === "profile" ? (
                <div className="space-y-4 py-2">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-bold">Full Name *</Label>
                      <Input
                        placeholder="e.g. Tariq Mahmood"
                        value={newFullName}
                        onChange={(e) => setNewFullName(e.target.value)}
                        className="text-xs h-10 rounded-xl border-slate-200"
                        required
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs font-bold">Work Email *</Label>
                      <Input
                        type="email"
                        placeholder="e.g. tariq@atiqjehan.ae"
                        value={newEmail}
                        onChange={(e) => setNewEmail(e.target.value)}
                        className="text-xs h-10 rounded-xl border-slate-200"
                        required
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-bold">Phone Number</Label>
                      <Input
                        placeholder="e.g. +971 52 123 4567"
                        value={newPhone}
                        onChange={(e) => setNewPhone(e.target.value)}
                        className="text-xs h-10 rounded-xl border-slate-200"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs font-bold">Job Title</Label>
                      <Input
                        placeholder="e.g. Workshop Service Advisor"
                        value={newJobTitle}
                        onChange={(e) => setNewJobTitle(e.target.value)}
                        className="text-xs h-10 rounded-xl border-slate-200"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-bold">Assigned Role *</Label>
                      <select
                        aria-label="Select role for new staff user"
                        value={newRole}
                        onChange={(e) => handleNewRoleChange(e.target.value as UserRole)}
                        className="w-full h-10 text-xs px-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-800 dark:text-slate-200 font-semibold"
                      >
                        {STAFF_USER_ROLES.map((r) => (
                          <option key={r.value} value={r.value}>
                            {r.label} ({r.description})
                          </option>
                        ))}
                      </select>
                      <p className="text-[11px] text-slate-500">
                        Choosing a role automatically initializes standard default permissions in Tab 2.
                      </p>
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs font-bold">Initial Account Status *</Label>
                      <select
                        aria-label="Select initial account status"
                        value={newStatus}
                        onChange={(e) => setNewStatus(e.target.value as UserStatus)}
                        className="w-full h-10 text-xs px-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-800 dark:text-slate-200 font-semibold"
                      >
                        <option value="active">Active (Full login enabled)</option>
                        <option value="suspended">Suspended (Login blocked)</option>
                        <option value="disabled">Disabled</option>
                      </select>
                    </div>
                  </div>

                  {/* Password / Invitation Option */}
                  <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 space-y-3">
                    <Label className="text-xs font-bold flex items-center gap-1.5">
                      <KeyRound className="w-4 h-4 text-blue-600" />
                      Login Credential Delivery
                    </Label>

                    <div className="flex items-center gap-6">
                      <label className="flex items-center gap-2 cursor-pointer text-xs font-medium">
                        <input
                          type="radio"
                          name="invite_mode"
                          checked={newInviteMode === "invite"}
                          onChange={() => setNewInviteMode("invite")}
                          className="text-blue-600 focus:ring-blue-500"
                        />
                        <span>Send Invitation &amp; Password Setup Link to Email (Recommended)</span>
                      </label>

                      <label className="flex items-center gap-2 cursor-pointer text-xs font-medium">
                        <input
                          type="radio"
                          name="invite_mode"
                          checked={newInviteMode === "password"}
                          onChange={() => setNewInviteMode("password")}
                          className="text-blue-600 focus:ring-blue-500"
                        />
                        <span>Set Temporary Password Manually</span>
                      </label>
                    </div>

                    {newInviteMode === "password" && (
                      <div className="pt-2 max-w-sm">
                        <Label className="text-xs font-bold">Temporary Password *</Label>
                        <Input
                          type="password"
                          placeholder="At least 6 characters"
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          className="text-xs h-10 rounded-xl border-slate-200 mt-1"
                        />
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-bold">Access Expiry Date (Optional)</Label>
                      <Input
                        type="date"
                        value={newExpiryDate}
                        onChange={(e) => setNewExpiryDate(e.target.value)}
                        className="text-xs h-10 rounded-xl border-slate-200"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs font-bold">Administrative Notes</Label>
                      <Input
                        placeholder="Internal notes regarding staff responsibilities..."
                        value={newNotes}
                        onChange={(e) => setNewNotes(e.target.value)}
                        className="text-xs h-10 rounded-xl border-slate-200"
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="py-2 space-y-2">
                  <div className="flex items-center justify-between p-3 bg-blue-50/50 dark:bg-blue-950/20 rounded-xl border border-blue-100 dark:border-blue-900/40 text-xs text-blue-900 dark:text-blue-300">
                    <span className="flex items-center gap-1.5 font-semibold">
                      <Sliders className="w-4 h-4 text-blue-600" />
                      Current Role Template Applied: <strong className="uppercase">{newRole}</strong>
                    </span>
                    <span className="text-[11px] text-blue-700 dark:text-blue-400 font-medium">
                      Customize toggles as needed before creating user
                    </span>
                  </div>

                  <PermissionsMatrix
                    permissions={newPermissions}
                    onChange={setNewPermissions}
                    baseRole={newRole}
                  />
                </div>
              )}
            </div>

            <DialogFooter className="border-t border-slate-100 dark:border-slate-800 pt-3 mt-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                {addModalTab === "profile" ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setAddModalTab("permissions")}
                    className="text-xs h-10 px-4 rounded-xl border-slate-200 font-semibold"
                  >
                    Next: Review Permissions &rarr;
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setAddModalTab("profile")}
                    className="text-xs h-10 px-4 rounded-xl border-slate-200 font-semibold"
                  >
                    &larr; Back to Profile
                  </Button>
                )}
              </div>

              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setAddModalOpen(false)}
                  className="text-xs h-10 px-4 rounded-xl border-slate-200 font-semibold"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={savingUser}
                  className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl shadow-2xs gap-1.5 h-10 px-5"
                >
                  {savingUser && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Save &amp; Create Staff User
                </Button>
              </div>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ────────────────────────────────────────────────────────────────────
          MODAL: EDIT GRANULAR PERMISSIONS
         ──────────────────────────────────────────────────────────────────── */}
      <Dialog open={editPermsModalOpen} onOpenChange={setEditPermsModalOpen}>
        <DialogContent className="max-w-5xl w-full max-h-[90vh] flex flex-col p-6 gap-4 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 rounded-2xl border border-slate-200/90 shadow-xl">
          <DialogHeader className="border-b border-slate-100 dark:border-slate-800 pb-3">
            <div className="flex items-center justify-between">
              <div>
                <DialogTitle className="text-lg font-bold flex items-center gap-2">
                  <Sliders className="w-5 h-5 text-blue-600" />
                  Edit Granular Permissions: {editingPermsUser?.full_name}
                </DialogTitle>
                <DialogDescription className="text-xs text-slate-500 mt-0.5">
                  Email: {editingPermsUser?.email} &bull; Role:{" "}
                  <span className="font-bold uppercase text-slate-700 dark:text-slate-300">
                    {editingPermsUser?.role}
                  </span>
                </DialogDescription>
              </div>
              <span className="text-[11px] px-2.5 py-1 bg-purple-50 text-purple-700 dark:bg-purple-950/50 dark:text-purple-300 rounded-xl border border-purple-200 dark:border-purple-800 font-semibold">
                Audit Trail Enabled
              </span>
            </div>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto pr-1">
            <PermissionsMatrix
              permissions={editingPermsMatrix}
              onChange={setEditingPermsMatrix}
              baseRole={editingPermsUser?.role}
            />
          </div>

          <DialogFooter className="border-t border-slate-100 dark:border-slate-800 pt-3 flex items-center justify-between">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                if (editingPermsUser) {
                  setEditingPermsMatrix(getDefaultPermissionsForRole(editingPermsUser.role));
                }
              }}
              className="text-xs h-10 px-4 rounded-xl border-slate-200 font-semibold gap-1.5"
            >
              <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
              Reset to Role Defaults
            </Button>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setEditPermsModalOpen(false)}
                className="text-xs h-10 px-4 rounded-xl border-slate-200 font-semibold"
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleSavePermissions}
                disabled={savingPerms}
                className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl shadow-2xs gap-1.5 h-10 px-5"
              >
                {savingPerms && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Save Changes &amp; Log Audit
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ────────────────────────────────────────────────────────────────────
          MODAL: VIEW READ-ONLY PERMISSIONS
         ──────────────────────────────────────────────────────────────────── */}
      <Dialog open={viewPermsModalOpen} onOpenChange={setViewPermsModalOpen}>
        <DialogContent className="max-w-4xl w-full max-h-[85vh] flex flex-col p-6 gap-4 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 rounded-2xl border border-slate-200/90 shadow-xl">
          <DialogHeader className="border-b border-slate-100 dark:border-slate-800 pb-3">
            <DialogTitle className="text-lg font-bold flex items-center gap-2">
              <Eye className="w-5 h-5 text-blue-600" />
              View Permissions: {viewingPermsUser?.full_name}
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Role: <strong className="uppercase">{viewingPermsUser?.role}</strong> &bull; Email: {viewingPermsUser?.email}
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto pr-1">
            <PermissionsMatrix
              permissions={viewingPermsMatrix}
              readOnly={true}
              showBulkControls={false}
            />
          </div>

          <DialogFooter className="border-t border-slate-100 dark:border-slate-800 pt-3">
            <Button
              type="button"
              size="sm"
              onClick={() => setViewPermsModalOpen(false)}
              className="text-xs h-10 px-4 rounded-xl border-slate-200 font-semibold"
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ────────────────────────────────────────────────────────────────────
          MODAL: CHANGE ROLE
         ──────────────────────────────────────────────────────────────────── */}
      <Dialog open={editRoleModalOpen} onOpenChange={setEditRoleModalOpen}>
        <DialogContent className="max-w-md w-full p-6 gap-4 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 rounded-2xl border border-slate-200/90 shadow-xl">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <Edit2 className="w-4 h-4 text-blue-600" />
              Change Staff Role: {roleUser?.full_name}
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Select a new operational role template for this staff member.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-bold">Select New Role</Label>
              <select
                aria-label="Select new role"
                value={selectedRole}
                onChange={(e) => setSelectedRole(e.target.value as UserRole)}
                className="w-full h-10 text-xs px-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-800 dark:text-slate-200 font-semibold"
              >
                {STAFF_USER_ROLES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label} &mdash; {r.description}
                  </option>
                ))}
              </select>
            </div>

            <label className="flex items-start gap-2.5 p-3 rounded-xl border border-blue-100 dark:border-blue-900/60 bg-blue-50/40 dark:bg-blue-950/20 cursor-pointer">
              <input
                type="checkbox"
                checked={resetPermsWithRole}
                onChange={(e) => setResetPermsWithRole(e.target.checked)}
                className="mt-0.5 rounded border-blue-300 text-blue-600 focus:ring-blue-500"
              />
              <div className="text-xs text-slate-700 dark:text-slate-300">
                <span className="font-bold block text-blue-900 dark:text-blue-200">
                  Reset module permissions to {selectedRole.toUpperCase()} defaults
                </span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                  Recommended: Replaces any existing custom permissions with the standard template for this role.
                </span>
              </div>
            </label>
          </div>

          <DialogFooter className="gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setEditRoleModalOpen(false)}
              className="text-xs h-10 px-4 rounded-xl border-slate-200 font-semibold"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleSaveRoleChange}
              disabled={updatingRole}
              className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl shadow-2xs gap-1.5 h-10 px-5"
            >
              {updatingRole && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Update Role
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ────────────────────────────────────────────────────────────────────
          MODAL: DELETE CONFIRMATION
         ──────────────────────────────────────────────────────────────────── */}
      <Dialog open={deleteModalOpen} onOpenChange={setDeleteModalOpen}>
        <DialogContent className="max-w-md w-full p-6 gap-4 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 rounded-2xl border border-slate-200/90 shadow-xl">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-red-600 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-600" />
              Remove Staff Access
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Remove this user&apos;s access to this workspace?
            </DialogDescription>
          </DialogHeader>

          <div className="p-3.5 bg-red-50 dark:bg-red-950/40 rounded-xl border border-red-200 dark:border-red-800 text-xs space-y-1">
            <p className="font-bold text-red-900 dark:text-red-200">{userToDelete?.full_name}</p>
            <p className="text-red-700 dark:text-red-300 font-mono text-[11px]">{userToDelete?.email}</p>
            <p className="text-slate-600 dark:text-slate-400 text-[11px] mt-1">
              Role: <span className="uppercase font-bold">{userToDelete?.role}</span>
            </p>
          </div>

          <p className="text-xs text-slate-500 leading-relaxed">
            Historical workshop and financial records created by this user will be preserved.
          </p>

          <DialogFooter className="gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setDeleteModalOpen(false)}
              className="text-xs h-10 px-4 rounded-xl border-slate-200 font-semibold"
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={handleConfirmDelete}
              disabled={deleting}
              className="text-xs font-semibold rounded-xl shadow-2xs gap-1.5 h-10 px-5 bg-red-600 hover:bg-red-700 text-white"
            >
              {deleting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Remove Access
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ────────────────────────────────────────────────────────────────────
          MODAL: USER ACTIVITY & PERMISSION HISTORY
         ──────────────────────────────────────────────────────────────────── */}
      <UserActivityModal
        open={activityModalOpen}
        onOpenChange={setActivityModalOpen}
        user={activityUser}
      />

      {/* ────────────────────────────────────────────────────────────────────
          ENTERPRISE: MANAGE USER ACCESS (Amazon Seller Central style)
         ──────────────────────────────────────────────────────────────────── */}
      <ManageUserAccessModal
        isOpen={manageAccessModalOpen}
        onClose={() => setManageAccessModalOpen(false)}
        targetUser={selectedManageUser}
        allStaffUsers={users}
        currentOperator={
          currentUser
            ? { id: currentUser.id, name: currentUser.full_name }
            : { id: "usr-owner-001", name: "Workshop Owner" }
        }
        onPermissionsSaved={() => {
          loadUsers();
          setToast({ type: "success", text: "User access permissions saved and audit logged." });
        }}
      />

      {/* ────────────────────────────────────────────────────────────────────
          ENTERPRISE: INVITE USER WIZARD (3-Step Delegated Access Flow)
         ──────────────────────────────────────────────────────────────────── */}
      <InviteStaffModal
        isOpen={inviteModalOpen}
        onClose={() => setInviteModalOpen(false)}
        currentOperator={
          currentUser
            ? { id: currentUser.id, name: currentUser.full_name }
            : { id: "usr-owner-001", name: "Workshop Owner" }
        }
        onUserInvited={(newUser) => {
          loadUsers();
          setToast({ type: "success", text: `Staff invitation created for ${newUser.full_name}.` });
        }}
      />
    </div>
  );
}

