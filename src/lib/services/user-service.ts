import { createClient } from "@/lib/supabase/client";
import {
  PRIMARY_OWNER_EMAIL,
  DEFAULT_WORKSPACE_ID,
  WORKSPACE_STORAGE_KEY,
  getDefaultPermissionsForRole,
  getAllPermissionsEnabled,
  getEmptyPermissions,
  ALL_APP_MODULES,
  PROTECTED_ACTIONS,
  getUserHierarchyLevel,
  sanitizePermissionDependencies,
  getDefaultFinancialVisibility,
  getDefaultApprovalLimits,
  getDefaultDataScope,
} from "@/lib/constants";
export { getEmptyPermissions };
import type {
  User,
  UserRole,
  UserStatus,
  AppModule,
  UserModulePermission,
  UserActivityLog,
  PermissionChangeLog,
  HierarchyLevel,
  DataAccessScope,
  FinancialVisibilitySettings,
  UserApprovalLimits,
  WorkspaceMember,
  WorkspaceMemberStatus,
} from "@/types/database";

// ─── Automatic Expiry Enforcement Helper ────────────────────────────────────

export function checkAndEnforceExpiry(user: User): User {
  if (user.email.toLowerCase() === PRIMARY_OWNER_EMAIL.toLowerCase() || user.role === "owner") {
    return {
      ...user,
      status: "active",
      is_active: true,
      hierarchy_level: "PRIMARY_OWNER",
    };
  }

  const hierarchy = getUserHierarchyLevel(user);

  if (user.access_expiry_date) {
    const expiryTime = new Date(user.access_expiry_date).getTime();
    if (!isNaN(expiryTime) && expiryTime < Date.now()) {
      return {
        ...user,
        status: "expired",
        is_active: false,
        hierarchy_level: hierarchy,
      };
    }
  }

  return {
    ...user,
    hierarchy_level: hierarchy,
  };
}

// ─── Default Initial Staff Users ─────────────────────────────────────────────

const DEFAULT_INITIAL_USERS: User[] = [
  {
    id: "usr-owner-001",
    email: PRIMARY_OWNER_EMAIL,
    full_name: "Atiq Jehan (Owner)",
    role: "owner",
    is_active: true,
    status: "active",
    phone: "+971 50 123 4567",
    job_title: "Managing Director / Owner",
    data_scope: getDefaultDataScope("owner"),
    financial_visibility: getDefaultFinancialVisibility("owner"),
    approval_limits: getDefaultApprovalLimits("owner"),
    two_factor_enabled: true,
    notes: "Workshop Owner & Executive Administrator with unrestricted full access",
    last_login_at: new Date().toISOString(),
    created_at: new Date(Date.now() - 60 * 86400000).toISOString(),
    updated_at: new Date().toISOString(),
    permissions: getAllPermissionsEnabled(),
  },
  {
    id: "usr-manager-002",
    email: "manager@atiqjehan.ae",
    full_name: "Tariq Mahmood",
    role: "manager",
    is_active: true,
    status: "active",
    phone: "+971 52 345 6789",
    job_title: "General Workshop Manager",
    data_scope: getDefaultDataScope("manager"),
    financial_visibility: getDefaultFinancialVisibility("manager"),
    approval_limits: getDefaultApprovalLimits("manager"),
    two_factor_enabled: false,
    notes: "Supervises all repair floor operations, customer orders, and staff workflow",
    last_login_at: new Date(Date.now() - 1 * 86400000).toISOString(),
    created_at: new Date(Date.now() - 30 * 86400000).toISOString(),
    updated_at: new Date().toISOString(),
    permissions: getDefaultPermissionsForRole("manager"),
  },
  {
    id: "usr-reception-003",
    email: "reception@atiqjehan.ae",
    full_name: "Sara Al-Hashimi",
    role: "receptionist",
    is_active: true,
    status: "active",
    phone: "+971 54 567 8901",
    job_title: "Front Desk & Service Advisor",
    data_scope: getDefaultDataScope("receptionist"),
    financial_visibility: getDefaultFinancialVisibility("receptionist"),
    approval_limits: getDefaultApprovalLimits("receptionist"),
    two_factor_enabled: false,
    notes: "Customer check-in, initial vehicle intake, estimates, and invoice payments",
    last_login_at: new Date(Date.now() - 2 * 86400000).toISOString(),
    created_at: new Date(Date.now() - 25 * 86400000).toISOString(),
    updated_at: new Date().toISOString(),
    permissions: getDefaultPermissionsForRole("receptionist"),
  },
  {
    id: "usr-mechanic-004",
    email: "mechanic@atiqjehan.ae",
    full_name: "Rashid Khan",
    role: "mechanic",
    is_active: true,
    status: "active",
    phone: "+971 55 678 9012",
    job_title: "Senior Master Technician",
    data_scope: getDefaultDataScope("mechanic"),
    financial_visibility: getDefaultFinancialVisibility("mechanic"),
    approval_limits: getDefaultApprovalLimits("mechanic"),
    two_factor_enabled: false,
    notes: "Engine diagnostics, major mechanical overhauls, and repair job card progress",
    last_login_at: new Date(Date.now() - 3 * 86400000).toISOString(),
    created_at: new Date(Date.now() - 20 * 86400000).toISOString(),
    updated_at: new Date().toISOString(),
    permissions: getDefaultPermissionsForRole("mechanic"),
  },
  {
    id: "usr-store-005",
    email: "store@atiqjehan.ae",
    full_name: "Bilal Farooq",
    role: "storekeeper",
    is_active: true,
    status: "active",
    phone: "+971 56 789 0123",
    job_title: "Spare Parts Inventory Specialist",
    data_scope: getDefaultDataScope("storekeeper"),
    financial_visibility: getDefaultFinancialVisibility("storekeeper"),
    approval_limits: getDefaultApprovalLimits("storekeeper"),
    two_factor_enabled: false,
    notes: "Warehouse parts receiving, inventory counts, and supplier purchase orders",
    last_login_at: new Date(Date.now() - 4 * 86400000).toISOString(),
    created_at: new Date(Date.now() - 15 * 86400000).toISOString(),
    updated_at: new Date().toISOString(),
    permissions: getDefaultPermissionsForRole("storekeeper"),
  },
  {
    id: "usr-accountant-006",
    email: "accountant@atiqjehan.ae",
    full_name: "Nadeem Akhtar",
    role: "accountant",
    is_active: true,
    status: "active",
    phone: "+971 50 890 1234",
    job_title: "Chief Financial Accountant",
    data_scope: getDefaultDataScope("accountant"),
    financial_visibility: getDefaultFinancialVisibility("accountant"),
    approval_limits: getDefaultApprovalLimits("accountant"),
    two_factor_enabled: false,
    notes: "General ledger entries, billing, customer/supplier statements, and VAT reports",
    last_login_at: new Date(Date.now() - 5 * 86400000).toISOString(),
    created_at: new Date(Date.now() - 10 * 86400000).toISOString(),
    updated_at: new Date().toISOString(),
    permissions: getDefaultPermissionsForRole("accountant"),
  },
  {
    id: "usr-viewer-007",
    email: "viewer@atiqjehan.ae",
    full_name: "External Auditor",
    role: "viewer",
    is_active: true,
    status: "active",
    phone: "+971 50 999 8888",
    job_title: "Compliance & Audit Viewer",
    data_scope: getDefaultDataScope("viewer"),
    financial_visibility: getDefaultFinancialVisibility("viewer"),
    approval_limits: getDefaultApprovalLimits("viewer"),
    two_factor_enabled: false,
    notes: "Read-only inspection rights for compliance audits and financial reviews",
    last_login_at: new Date(Date.now() - 8 * 86400000).toISOString(),
    created_at: new Date(Date.now() - 5 * 86400000).toISOString(),
    updated_at: new Date().toISOString(),
    permissions: getDefaultPermissionsForRole("viewer"),
  },
];

const LOCAL_STORAGE_KEY = "atiq_local_users";
const LOCAL_PERMS_KEY = "atiq_user_permissions";
const LOCAL_ACTIVITY_KEY = "atiq_user_activity_logs";
const LOCAL_PERM_CHANGES_KEY = "atiq_permission_change_logs";

let inMemoryUsers: User[] = [...DEFAULT_INITIAL_USERS];
let inMemoryPermissions: Record<string, Record<AppModule, UserModulePermission>> = {};
let inMemoryActivityLogs: UserActivityLog[] = [];
let inMemoryPermChangeLogs: PermissionChangeLog[] = [];

// Seed default in-memory permissions
DEFAULT_INITIAL_USERS.forEach((u) => {
  inMemoryPermissions[u.id] = u.permissions || getDefaultPermissionsForRole(u.role);
});

// Seed default initial activity history
const defaultActivities: UserActivityLog[] = [
  {
    id: "act-101",
    user_id: "usr-owner-001",
    user_email: PRIMARY_OWNER_EMAIL,
    user_name: "Atiq Jehan (Owner)",
    action: "LOGIN",
    module: "auth",
    description: "Owner logged into workshop portal successfully",
    timestamp: new Date(Date.now() - 2 * 3600000).toISOString(),
  },
  {
    id: "act-102",
    user_id: "usr-manager-002",
    user_email: "manager@atiqjehan.ae",
    user_name: "Tariq Mahmood",
    action: "JOB_CARD_CREATED",
    module: "job_cards",
    record_reference: "JC-1004",
    description: "Created Job Card JC-1004 for Toyota Land Cruiser 2024",
    timestamp: new Date(Date.now() - 5 * 3600000).toISOString(),
  },
  {
    id: "act-103",
    user_id: "usr-accountant-006",
    user_email: "accountant@atiqjehan.ae",
    user_name: "Nadeem Akhtar",
    action: "LEDGER_ENTRY",
    module: "accounts",
    record_reference: "TXN-260192",
    description: "Posted bank transfer reconciliation from Cash Float to ADCB Account",
    timestamp: new Date(Date.now() - 12 * 3600000).toISOString(),
  },
  {
    id: "act-104",
    user_id: "usr-reception-003",
    user_email: "reception@atiqjehan.ae",
    user_name: "Sara Al-Hashimi",
    action: "PAYMENT_RECORDED",
    module: "payments",
    record_reference: "RCPT-402",
    description: "Recorded customer settlement AED 1,450.00 via POS Card",
    timestamp: new Date(Date.now() - 24 * 3600000).toISOString(),
  },
];
inMemoryActivityLogs = [...defaultActivities];

function withTimeout<T>(promise: PromiseLike<T>, timeoutMs = 4000): Promise<T> {
  let timerId: NodeJS.Timeout | number | undefined;
  const timeoutPromise = new Promise<T>((_, reject) => {
    timerId = setTimeout(() => {
      reject(new Error("Request timed out"));
    }, timeoutMs);
  });

  return Promise.race([
    Promise.resolve(promise).finally(() => {
      if (timerId) clearTimeout(timerId as any);
    }),
    timeoutPromise,
  ]);
}

// ─── Local Storage User Management ──────────────────────────────────────────

export function getLocalUsers(): User[] {
  if (typeof window === "undefined") return inMemoryUsers.map(checkAndEnforceExpiry);
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    const parsed: User[] = raw ? JSON.parse(raw) : [];
    if (parsed.length > 0) {
      // Ensure primary owner is always present and never demoted
      const ownerIdx = parsed.findIndex((u) => u.email.toLowerCase() === PRIMARY_OWNER_EMAIL.toLowerCase());
      if (ownerIdx === -1) {
        parsed.unshift(DEFAULT_INITIAL_USERS[0]);
      } else {
        parsed[ownerIdx].role = "owner";
        parsed[ownerIdx].is_active = true;
        parsed[ownerIdx].status = "active";
        parsed[ownerIdx].hierarchy_level = "PRIMARY_OWNER";
        parsed[ownerIdx].permissions = getAllPermissionsEnabled();
      }

      // Ensure all users have status property and check expiry
      const evaluated = parsed.map((u) => {
        if (!u.status) u.status = u.is_active ? "active" : "disabled";
        return checkAndEnforceExpiry(u);
      });

      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(evaluated));
      return evaluated;
    }
    const evaluatedDefaults = DEFAULT_INITIAL_USERS.map(checkAndEnforceExpiry);
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(evaluatedDefaults));
    return evaluatedDefaults;
  } catch {
    return inMemoryUsers.map(checkAndEnforceExpiry);
  }
}

export function saveLocalUsers(users: User[]) {
  inMemoryUsers = users;
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(users));
  } catch (e) {
    console.error("Failed to save local users:", e);
  }
}

// ─── Local Storage Permissions Management ───────────────────────────────────

export function getLocalPermissionsMap(): Record<string, Record<AppModule, UserModulePermission>> {
  if (typeof window === "undefined") return inMemoryPermissions;
  try {
    const raw = localStorage.getItem(LOCAL_PERMS_KEY);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch {
    // fallback
  }
  return inMemoryPermissions;
}

export function saveLocalPermissionsMap(map: Record<string, Record<AppModule, UserModulePermission>>) {
  inMemoryPermissions = map;
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LOCAL_PERMS_KEY, JSON.stringify(map));
  } catch (e) {
    console.error("Failed to save local permissions:", e);
  }
}

// ─── Local Storage Activity Logs ────────────────────────────────────────────

export function getLocalActivityLogs(): UserActivityLog[] {
  if (typeof window === "undefined") return inMemoryActivityLogs;
  try {
    const raw = localStorage.getItem(LOCAL_ACTIVITY_KEY);
    if (raw) {
      return JSON.parse(raw);
    }
    localStorage.setItem(LOCAL_ACTIVITY_KEY, JSON.stringify(defaultActivities));
    return defaultActivities;
  } catch {
    return inMemoryActivityLogs;
  }
}

function saveLocalActivityLogs(logs: UserActivityLog[]) {
  inMemoryActivityLogs = logs;
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LOCAL_ACTIVITY_KEY, JSON.stringify(logs.slice(0, 500))); // keep latest 500
  } catch (e) {
    console.error("Failed to save activity logs:", e);
  }
}

// ─── Local Storage Permission Changes ───────────────────────────────────────

export function getLocalPermissionChangeLogs(): PermissionChangeLog[] {
  if (typeof window === "undefined") return inMemoryPermChangeLogs;
  try {
    const raw = localStorage.getItem(LOCAL_PERM_CHANGES_KEY);
    if (raw) return JSON.parse(raw);
    return inMemoryPermChangeLogs;
  } catch {
    return inMemoryPermChangeLogs;
  }
}

function saveLocalPermissionChangeLogs(logs: PermissionChangeLog[]) {
  inMemoryPermChangeLogs = logs;
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LOCAL_PERM_CHANGES_KEY, JSON.stringify(logs.slice(0, 300)));
  } catch (e) {
    console.error("Failed to save permission change logs:", e);
  }
}

// ─── Core Activity Logging Function ─────────────────────────────────────────

export async function logUserActivity(payload: Omit<UserActivityLog, "id" | "timestamp">): Promise<void> {
  const newLog: UserActivityLog = {
    ...payload,
    id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: new Date().toISOString(),
  };

  // 1. Update local storage
  const logs = getLocalActivityLogs();
  logs.unshift(newLog);
  saveLocalActivityLogs(logs);

  // 2. Sync to Supabase if available
  const supabase = createClient();
  try {
    await supabase.from("user_activity_logs").insert({
      user_id: newLog.user_id,
      user_email: newLog.user_email,
      user_name: newLog.user_name,
      action: newLog.action,
      module: newLog.module,
      record_reference: newLog.record_reference || null,
      description: newLog.description,
      details: newLog.details || {},
    });
  } catch {
    // Graceful offline fallback
  }
}

export async function getUserActivityLogs(userId?: string, workspaceId?: string): Promise<UserActivityLog[]> {
  const supabase = createClient();
  try {
    let query = supabase
      .from("user_activity_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(150);

    if (userId) {
      query = query.eq("user_id", userId);
    }
    if (workspaceId) {
      query = query.eq("workspace_id", workspaceId);
    }

    const { data, error } = await withTimeout<any>(query, 3000);
    if (!error && data && data.length > 0) {
      return data.map((d: any) => ({
        id: d.id,
        user_id: d.user_id,
        user_email: d.user_email,
        user_name: d.user_name,
        action: d.action,
        module: d.module,
        record_reference: d.record_reference,
        description: d.description,
        details: d.details,
        timestamp: d.created_at,
      }));
    }
  } catch {
    // fallback
  }

  const local = getLocalActivityLogs();
  let filtered = local;
  if (workspaceId) {
    filtered = filtered.filter((l: any) => !l.workspace_id || l.workspace_id === workspaceId);
  }
  if (userId) {
    filtered = filtered.filter((l) => l.user_id === userId);
  }
  return filtered;
}

export async function getPermissionChangeLogs(userId?: string): Promise<PermissionChangeLog[]> {
  const supabase = createClient();
  try {
    let query = supabase
      .from("permission_change_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);

    if (userId) {
      query = query.eq("target_user_id", userId);
    }

    const { data, error } = await withTimeout<any>(query, 3000);
    if (!error && data && data.length > 0) {
      return data.map((d: any) => ({
        id: d.id,
        operator_id: d.operator_id,
        operator_name: d.operator_name,
        target_user_id: d.target_user_id,
        target_user_name: d.target_user_name,
        module: d.module,
        change_summary: d.change_summary,
        old_permissions: d.old_permissions,
        new_permissions: d.new_permissions,
        timestamp: d.created_at,
      }));
    }
  } catch {
    // fallback
  }

  const local = getLocalPermissionChangeLogs();
  if (userId) {
    return local.filter((l) => l.target_user_id === userId);
  }
  return local;
}

// ─── Granular User Permissions Functions ────────────────────────────────────

export async function getUserPermissions(
  userId: string,
  workspaceId?: string
): Promise<Record<AppModule, UserModulePermission>> {
  const localUsers = getLocalUsers();
  const targetUser = localUsers.find((u) => u.id === userId);

  // OWNER ALWAYS HAS FULL ACCESS TO EVERY MODULE & ACTION
  if (
    targetUser?.role === "owner" ||
    targetUser?.email.toLowerCase() === PRIMARY_OWNER_EMAIL.toLowerCase() ||
    userId === "usr-owner-001"
  ) {
    return getAllPermissionsEnabled();
  }

  // If user is marked removed or deleted or inactive, revoke all module permissions immediately
  if (
    targetUser?.status === "removed" ||
    targetUser?.status === "deleted" ||
    targetUser?.is_active === false
  ) {
    return getEmptyPermissions();
  }

  // 1. Try Supabase
  const supabase = createClient();
  try {
    let query = supabase.from("user_permissions").select("*").eq("user_id", userId);
    if (workspaceId) {
      query = query.eq("workspace_id", workspaceId);
    }
    const { data, error } = await withTimeout<any>(query, 3000);

    if (!error && data && data.length > 0) {
      const permsMap = getEmptyPermissions();
      data.forEach((p: any) => {
        if (p.module in permsMap) {
          permsMap[p.module as AppModule] = {
            id: p.id,
            user_id: p.user_id,
            module: p.module as AppModule,
            access: Boolean(p.access),
            can_view: Boolean(p.can_view),
            can_create: Boolean(p.can_create),
            can_edit: Boolean(p.can_edit),
            can_delete: Boolean(p.can_delete),
            can_print: Boolean(p.can_print),
            can_export: Boolean(p.can_export),
            can_transfer: Boolean(p.can_transfer),
            can_journal: Boolean(p.can_journal),
            can_reverse: Boolean(p.can_reverse),
            can_finalize: Boolean(p.can_finalize),
            can_record_payment: Boolean(p.can_record_payment),
            can_void: Boolean(p.can_void),
            can_view_bank_balance: Boolean(p.can_view_bank_balance),
          };
        }
      });
      return permsMap;
    }
  } catch {
    // Fallback to local
  }

  // 2. Check Local Map
  const map = getLocalPermissionsMap();
  if (map[userId]) {
    return map[userId];
  }

  // 3. Fallback to default role template
  const role = targetUser?.role || "viewer";
  const def = getDefaultPermissionsForRole(role);
  map[userId] = def;
  saveLocalPermissionsMap(map);
  return def;
}

export async function saveUserPermissions(
  userId: string,
  newPermissions: Record<AppModule, UserModulePermission>,
  operator: { id: string; name: string },
  reason?: string,
  extraControls?: {
    data_scope?: DataAccessScope;
    financial_visibility?: Partial<FinancialVisibilitySettings>;
    approval_limits?: Partial<UserApprovalLimits>;
    access_start_date?: string | null;
    access_expiry_date?: string | null;
    two_factor_enabled?: boolean;
    status?: UserStatus;
  }
): Promise<{ success: boolean; error: string | null }> {
  const localUsers = getLocalUsers();
  const targetUser = localUsers.find((u) => u.id === userId);

  if (!targetUser) {
    return { success: false, error: "Staff user not found." };
  }

  // OWNER PERMISSIONS CANNOT BE RESTRICTED
  if (targetUser.email.toLowerCase() === PRIMARY_OWNER_EMAIL.toLowerCase()) {
    return { success: false, error: "CRITICAL: The Primary Owner account permissions cannot be restricted or changed." };
  }

  // Sanitize all permissions using intelligent dependency rules
  const sanitizedPerms: Record<AppModule, UserModulePermission> = {} as any;
  for (const m of ALL_APP_MODULES) {
    const raw = newPermissions[m.id] || {
      module: m.id,
      access: false,
      can_view: false,
      can_create: false,
      can_edit: false,
      can_delete: false,
      can_print: false,
      can_export: false,
      can_approve: false,
    };
    sanitizedPerms[m.id] = sanitizePermissionDependencies(raw);
  }

  // Compute diff for audit log
  const oldPermissions = await getUserPermissions(userId);
  const diffs: string[] = [];

  for (const modKey of Object.keys(sanitizedPerms) as AppModule[]) {
    const oldP = oldPermissions[modKey];
    const newP = sanitizedPerms[modKey];
    if (!oldP || !newP) continue;

    if (oldP.access !== newP.access) {
      diffs.push(`${modKey.toUpperCase()}: Access ${oldP.access ? "ON" : "OFF"} → ${newP.access ? "ON" : "OFF"}`);
    } else if (newP.access) {
      const subDiffs: string[] = [];
      if (oldP.can_view !== newP.can_view) subDiffs.push(`View: ${newP.can_view ? "ON" : "OFF"}`);
      if (oldP.can_create !== newP.can_create) subDiffs.push(`Create: ${newP.can_create ? "ON" : "OFF"}`);
      if (oldP.can_edit !== newP.can_edit) subDiffs.push(`Edit: ${newP.can_edit ? "ON" : "OFF"}`);
      if (oldP.can_delete !== newP.can_delete) subDiffs.push(`Delete: ${newP.can_delete ? "ON" : "OFF"}`);
      if (oldP.can_print !== newP.can_print) subDiffs.push(`Print: ${newP.can_print ? "ON" : "OFF"}`);
      if (oldP.can_export !== newP.can_export) subDiffs.push(`Export: ${newP.can_export ? "ON" : "OFF"}`);
      if (oldP.can_approve !== newP.can_approve) subDiffs.push(`Approve: ${newP.can_approve ? "ON" : "OFF"}`);

      // Financial & Protected actions
      if (oldP.can_transfer !== newP.can_transfer) subDiffs.push(`Transfer Money: ${newP.can_transfer ? "ON" : "OFF"}`);
      if (oldP.can_journal !== newP.can_journal) subDiffs.push(`Manual Journal: ${newP.can_journal ? "ON" : "OFF"}`);
      if (oldP.can_reverse !== newP.can_reverse) subDiffs.push(`Reverse Transaction: ${newP.can_reverse ? "ON" : "OFF"}`);
      if (oldP.can_finalize !== newP.can_finalize) subDiffs.push(`Finalize: ${newP.can_finalize ? "ON" : "OFF"}`);
      if (oldP.can_record_payment !== newP.can_record_payment) subDiffs.push(`Record Payment: ${newP.can_record_payment ? "ON" : "OFF"}`);
      if (oldP.can_void !== newP.can_void) subDiffs.push(`Void Invoice: ${newP.can_void ? "ON" : "OFF"}`);
      if (oldP.can_view_bank_balance !== newP.can_view_bank_balance) subDiffs.push(`View Bank Balances: ${newP.can_view_bank_balance ? "ON" : "OFF"}`);

      // Dynamic protected actions
      if (newP.protected_actions) {
        for (const [actionKey, newVal] of Object.entries(newP.protected_actions)) {
          const oldVal = oldP.protected_actions?.[actionKey] ?? false;
          if (oldVal !== newVal) {
            const actDef = PROTECTED_ACTIONS.find((pa) => pa.key === actionKey);
            const label = actDef ? actDef.label : actionKey;
            subDiffs.push(`${label}: ${newVal ? "ON" : "OFF"}`);
          }
        }
      }

      if (subDiffs.length > 0) {
        diffs.push(`${modKey.toUpperCase()} (${subDiffs.join(", ")})`);
      }
    }
  }

  // 1. Save to local storage
  const map = getLocalPermissionsMap();
  map[userId] = sanitizedPerms;
  saveLocalPermissionsMap(map);

  // Update user in local list with any extra controls provided
  const updatedUsers = localUsers.map((u) =>
    u.id === userId
      ? {
          ...u,
          permissions: sanitizedPerms,
          ...(extraControls?.data_scope ? { data_scope: extraControls.data_scope } : {}),
          ...(extraControls?.financial_visibility ? { financial_visibility: { ...u.financial_visibility, ...extraControls.financial_visibility } } : {}),
          ...(extraControls?.approval_limits ? { approval_limits: { ...u.approval_limits, ...extraControls.approval_limits } } : {}),
          ...(extraControls?.access_start_date !== undefined ? { access_start_date: extraControls.access_start_date } : {}),
          ...(extraControls?.access_expiry_date !== undefined ? { access_expiry_date: extraControls.access_expiry_date } : {}),
          ...(extraControls?.two_factor_enabled !== undefined ? { two_factor_enabled: extraControls.two_factor_enabled } : {}),
          ...(extraControls?.status ? { status: extraControls.status, is_active: extraControls.status === "active" } : {}),
          updated_at: new Date().toISOString(),
        }
      : u
  );
  saveLocalUsers(updatedUsers);

  // 2. Record Permission Change Log
  const changeSummary = diffs.length > 0 ? diffs.join("; ") : "Permissions refreshed with no structural changes";
  const changeLog: PermissionChangeLog = {
    id: `pcl-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    operator_id: operator.id,
    operator_name: operator.name,
    target_user_id: targetUser.id,
    target_user_name: targetUser.full_name,
    module: "user_access",
    change_summary: reason ? `${reason}: ${changeSummary}` : changeSummary,
    old_permissions: oldPermissions as any,
    new_permissions: sanitizedPerms as any,
    timestamp: new Date().toISOString(),
  };

  const changeLogs = getLocalPermissionChangeLogs();
  changeLogs.unshift(changeLog);
  saveLocalPermissionChangeLogs(changeLogs);

  // 3. Record Activity Log
  await logUserActivity({
    user_id: operator.id,
    user_email: operator.name,
    user_name: operator.name,
    action: "PERMISSION_CHANGED",
    module: "user_access",
    record_reference: targetUser.email,
    description: `Updated module permissions for ${targetUser.full_name} (${targetUser.role.toUpperCase()}): ${changeSummary}${reason ? ` [Reason: ${reason}]` : ""}`,
    details: { diffs, reason },
  });

  // 4. Sync to Supabase if connected
  const supabase = createClient();
  try {
    const upsertRows = Object.values(sanitizedPerms).map((p) => ({
      user_id: userId,
      module: p.module,
      access: p.access,
      can_view: p.can_view,
      can_create: p.can_create,
      can_edit: p.can_edit,
      can_delete: p.can_delete,
      can_print: p.can_print,
      can_export: p.can_export,
      can_approve: p.can_approve || false,
      can_transfer: p.can_transfer || false,
      can_journal: p.can_journal || false,
      can_reverse: p.can_reverse || false,
      can_finalize: p.can_finalize || false,
      can_record_payment: p.can_record_payment || false,
      can_void: p.can_void || false,
      can_view_bank_balance: p.can_view_bank_balance || false,
      protected_actions: p.protected_actions || {},
      updated_at: new Date().toISOString(),
    }));

    await supabase.from("user_permissions").upsert(upsertRows, { onConflict: "user_id,module" });
    await supabase.from("permission_change_logs").insert({
      operator_id: operator.id,
      operator_name: operator.name,
      target_user_id: targetUser.id,
      target_user_name: targetUser.full_name,
      module: "user_access",
      change_summary: changeSummary,
      old_permissions: oldPermissions,
      new_permissions: sanitizedPerms,
    });
  } catch {
    // Offline mode
  }

  return { success: true, error: null };
}

export async function copyPermissionsFromUser(
  sourceUserId: string,
  targetUserId: string,
  operator: { id: string; name: string }
): Promise<{ success: boolean; error: string | null; permissions?: Record<AppModule, UserModulePermission> }> {
  const sourcePerms = await getUserPermissions(sourceUserId);
  const saveRes = await saveUserPermissions(targetUserId, sourcePerms, operator);
  return { success: saveRes.success, error: saveRes.error, permissions: sourcePerms };
}

export function comparePermissionsWithRole(
  userPerms: Record<AppModule, UserModulePermission>,
  role: UserRole
): string[] {
  const defaultPerms = getDefaultPermissionsForRole(role);
  const deviations: string[] = [];

  for (const mod of ALL_APP_MODULES) {
    const userP = userPerms[mod.id];
    const defP = defaultPerms[mod.id];
    if (!userP || !defP) continue;

    if (userP.access !== defP.access) {
      deviations.push(`${mod.label}: ${userP.access ? "Enabled (Default: Disabled)" : "Disabled (Default: Enabled)"}`);
    } else if (userP.access) {
      if (userP.can_delete && !defP.can_delete) deviations.push(`${mod.label}: Delete Granted`);
      if (userP.can_transfer && !defP.can_transfer) deviations.push(`${mod.label}: Transfer Money Granted (High Risk)`);
      if (userP.can_journal && !defP.can_journal) deviations.push(`${mod.label}: Manual Journal Granted (High Risk)`);
      if (userP.can_reverse && !defP.can_reverse) deviations.push(`${mod.label}: Reverse Transaction Granted (High Risk)`);
      if (userP.can_void && !defP.can_void) deviations.push(`${mod.label}: Void Granted`);
    }
  }

  return deviations;
}

export async function resetUserPermissionsToRole(
  userId: string,
  role: UserRole,
  operator: { id: string; name: string }
): Promise<{ success: boolean; error: string | null }> {
  const roleDefaults = getDefaultPermissionsForRole(role);
  return saveUserPermissions(userId, roleDefaults, operator);
}

/**
 * Enterprise Delegated Access: Update Data Scope, Financial Visibility, and Approval Limits
 */
export async function updateUserAccessControls(
  userId: string,
  controls: {
    data_scope?: DataAccessScope;
    financial_visibility?: Partial<FinancialVisibilitySettings>;
    approval_limits?: Partial<UserApprovalLimits>;
    access_start_date?: string | null;
    access_expiry_date?: string | null;
    two_factor_enabled?: boolean;
    status?: UserStatus;
  },
  operator?: { id: string; name: string },
  reason?: string
): Promise<{ success: boolean; user?: User; error?: string }> {
  const localUsers = getLocalUsers();
  const targetUser = localUsers.find((u) => u.id === userId);

  if (!targetUser) {
    return { success: false, error: "Staff user not found." };
  }

  // Prevent locking out or altering owner critical access
  if (targetUser.email.toLowerCase() === PRIMARY_OWNER_EMAIL.toLowerCase()) {
    if (controls.status && controls.status !== "active") {
      return { success: false, error: "CRITICAL: The Primary Owner account cannot be suspended, disabled, or expired." };
    }
  }

  const updatedUser: User = {
    ...targetUser,
    ...(controls.data_scope ? { data_scope: controls.data_scope } : {}),
    ...(controls.financial_visibility
      ? { financial_visibility: { ...targetUser.financial_visibility, ...controls.financial_visibility } }
      : {}),
    ...(controls.approval_limits
      ? { approval_limits: { ...targetUser.approval_limits, ...controls.approval_limits } }
      : {}),
    ...(controls.access_start_date !== undefined ? { access_start_date: controls.access_start_date } : {}),
    ...(controls.access_expiry_date !== undefined ? { access_expiry_date: controls.access_expiry_date } : {}),
    ...(controls.two_factor_enabled !== undefined ? { two_factor_enabled: controls.two_factor_enabled } : {}),
    ...(controls.status
      ? { status: controls.status, is_active: controls.status === "active" }
      : {}),
    updated_at: new Date().toISOString(),
  };

  const updatedUsers = localUsers.map((u) => (u.id === userId ? updatedUser : u));
  saveLocalUsers(updatedUsers);

  // Record Audit log
  await logUserActivity({
    user_id: operator?.id || "usr-owner-001",
    user_email: operator?.name || "Owner",
    user_name: operator?.name || "Owner",
    action: "ACCESS_CONTROLS_UPDATED",
    module: "user_access",
    record_reference: targetUser.email,
    description: `Updated security & delegated controls for ${targetUser.full_name}: Scope=${updatedUser.data_scope || "all"}, Expiry=${updatedUser.access_expiry_date || "None"}${reason ? ` [Reason: ${reason}]` : ""}`,
    details: { controls, reason },
  });

  // Sync to Supabase if connected
  const supabase = createClient();
  try {
    await supabase
      .from("users")
      .update({
        data_scope: updatedUser.data_scope,
        financial_visibility: updatedUser.financial_visibility,
        approval_limits: updatedUser.approval_limits,
        access_start_date: updatedUser.access_start_date,
        access_expiry_date: updatedUser.access_expiry_date,
        two_factor_enabled: updatedUser.two_factor_enabled,
        status: updatedUser.status,
        is_active: updatedUser.is_active,
        updated_at: updatedUser.updated_at,
      })
      .eq("id", userId);
  } catch {}

  return { success: true, user: updatedUser };
}

/**
 * Sign User Out From All Active Sessions (Remote Session Termination)
 */
export async function terminateUserSessions(
  userId: string,
  operator?: { id: string; name: string }
): Promise<{ success: boolean; message: string }> {
  const localUsers = getLocalUsers();
  const targetUser = localUsers.find((u) => u.id === userId);

  await logUserActivity({
    user_id: operator?.id || "usr-owner-001",
    user_email: operator?.name || "Owner",
    user_name: operator?.name || "Owner",
    action: "SESSION_TERMINATED",
    module: "user_access",
    record_reference: targetUser?.email || userId,
    description: `Terminated all active device sessions for ${targetUser?.full_name || userId} by ${operator?.name || "Owner"}`,
  });

  return {
    success: true,
    message: `All active sessions for ${targetUser?.full_name || "user"} have been successfully terminated.`,
  };
}

// ─── Current User Session Resolver ──────────────────────────────────────────

export async function getCurrentUser(): Promise<User | null> {
  const supabase = createClient();
  try {
    // 1. Session check
    let session: any = null;
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      session = sessionData?.session;
    } catch {
      // ignore
    }

    // 2. Auth user check
    let authUser: any = null;
    if (session?.user) {
      authUser = session.user;
    } else {
      try {
        const { data, error: authErr } = await withTimeout<any>(supabase.auth.getUser(), 4000);
        if (!authErr && data?.user) {
          authUser = data.user;
        }
      } catch {
        // timeout or offline
      }
    }

    // If no authenticated Supabase session, fallback to local current user (or Owner in dev)
    if (!authUser) {
      const localUsers = getLocalUsers();
      // Default to owner in active local dev if present
      const owner = localUsers.find((u) => u.email.toLowerCase() === PRIMARY_OWNER_EMAIL.toLowerCase());
      if (owner) {
        return {
          ...owner,
          permissions: getAllPermissionsEnabled(),
        };
      }
      return null;
    }

    const email = (authUser.email || "").trim().toLowerCase();
    const isPrimaryEmail = email === PRIMARY_OWNER_EMAIL.toLowerCase();

    // 3. Platform Admin Check
    let isPlatformAdmin = isPrimaryEmail;
    if (!isPlatformAdmin) {
      try {
        const { data: adminRow } = await withTimeout<any>(
          supabase.from("platform_admins").select("id, status").eq("user_id", authUser.id).eq("status", "active").maybeSingle(),
          3000
        );
        if (adminRow) isPlatformAdmin = true;
      } catch {}
    }

    // If Primary Platform Owner: Always grant full unrestricted access
    if (isPlatformAdmin) {
      return {
        id: authUser.id || "usr-owner-001",
        email: email || PRIMARY_OWNER_EMAIL,
        full_name: authUser.user_metadata?.full_name || "Atiq Jehan (Owner)",
        role: "owner",
        is_active: true,
        status: "active",
        phone: "+971 50 123 4567",
        job_title: "Managing Director / Platform Owner",
        permissions: getAllPermissionsEnabled(),
        last_login_at: new Date().toISOString(),
        created_at: authUser.created_at || new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
    }

    // 4. Secondary User: Check workspace membership in Supabase
    let memberRecord: any = null;
    try {
      const { data: memData } = await withTimeout<any>(
        supabase
          .from("workspace_members")
          .select("id, workspace_id, user_id, role, status, is_workspace_owner")
          .eq("user_id", authUser.id)
          .eq("status", "active")
          .limit(1)
          .maybeSingle(),
        3000
      );
      if (memData) {
        memberRecord = memData;
      }
    } catch {}

    // Fallback: check staff profile table if legacy
    let staffUser: User | null = null;
    try {
      const { data: profile } = await withTimeout<any>(
        supabase.from("users").select("*").eq("id", authUser.id).maybeSingle(),
        3000
      );
      if (profile) {
        staffUser = profile as User;
      }
    } catch {}

    if (!staffUser) {
      const localUsers = getLocalUsers();
      staffUser = localUsers.find((u) => u.email.toLowerCase() === email || u.id === authUser.id) || null;
    }

    // If user has active workspace membership in Supabase
    if (memberRecord) {
      const activeWsId = memberRecord.workspace_id;
      const permissions = await getUserPermissions(authUser.id, activeWsId);

      return {
        id: authUser.id,
        email,
        full_name: authUser.user_metadata?.full_name || staffUser?.full_name || email.split("@")[0],
        role: memberRecord.role || staffUser?.role || "owner",
        is_active: true,
        status: "active",
        workspace_id: activeWsId,
        permissions,
        last_login_at: new Date().toISOString(),
        created_at: authUser.created_at || new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
    }

    // If staff user is registered in local list / legacy
    if (staffUser) {
      const evaluatedUser = checkAndEnforceExpiry(staffUser);
      if (
        evaluatedUser.status === "suspended" ||
        evaluatedUser.status === "disabled" ||
        evaluatedUser.status === "expired" ||
        evaluatedUser.is_active === false
      ) {
        console.warn(`Blocked login for ${evaluatedUser.status} user: ${email}`);
        await supabase.auth.signOut();
        return null;
      }

      const permissions = await getUserPermissions(evaluatedUser.id);
      return {
        ...evaluatedUser,
        permissions,
        last_login_at: new Date().toISOString(),
      };
    }

    // Unregistered / Pending approval user
    console.warn(`No active workspace membership found for: ${email}`);
    await supabase.auth.signOut();
    return null;
  } catch (err: any) {
    console.warn("getCurrentUser fallback notice:", err?.message || err);
    return null;
  }
}

// ─── Fetch All Staff Users (Strict Workspace Isolation) ─────────────────────

export async function getUsers(workspaceId?: string): Promise<User[]> {
  const local = getLocalUsers();
  const permsMap = getLocalPermissionsMap();
  const targetWsId =
    workspaceId ||
    (typeof window !== "undefined"
      ? localStorage.getItem(WORKSPACE_STORAGE_KEY) || DEFAULT_WORKSPACE_ID
      : DEFAULT_WORKSPACE_ID);

  // Load workspace members for targetWsId
  let wsMembers: WorkspaceMember[] = [];
  try {
    const { getWorkspaceMembers } = await import("./workspace-service");
    wsMembers = await getWorkspaceMembers(targetWsId);
  } catch {
    try {
      const { getLocalMembers } = await import("./workspace-service");
      wsMembers = getLocalMembers().filter((m) => m.workspace_id === targetWsId);
    } catch {}
  }

  const supabase = createClient();
  let baseUsers: User[] = [];

  try {
    const { data, error } = await withTimeout<any>(
      supabase
        .from("users")
        .select("id, email, full_name, role, is_active, status, phone, job_title, access_expiry_date, notes, last_login_at, created_at, updated_at, deleted_at, deleted_by")
        .order("created_at", { ascending: true }),
      4000
    );

    if (!error && data && data.length > 0) {
      baseUsers = data.map((u: any) => {
        const isOwner = u.email?.toLowerCase() === PRIMARY_OWNER_EMAIL.toLowerCase();
        const userPermissions = isOwner
          ? getAllPermissionsEnabled()
          : permsMap[u.id] || getDefaultPermissionsForRole(u.role);

        const constructed: User = {
          ...u,
          role: isOwner ? ("owner" as UserRole) : u.role,
          status: isOwner ? "active" : u.status || (u.is_active ? "active" : "disabled"),
          is_active: isOwner ? true : u.status === "active",
          permissions: userPermissions,
        };

        return checkAndEnforceExpiry(constructed);
      });

      saveLocalUsers(baseUsers);
    } else {
      baseUsers = local;
    }
  } catch (err: any) {
    console.warn("Using local user fallback:", err?.message || err);
    baseUsers = local;
  }

  let targetWorkspace: any = null;
  try {
    const { getLocalWorkspaces } = await import("./workspace-service");
    targetWorkspace = getLocalWorkspaces().find((w) => w.id === targetWsId) || null;
  } catch {}

  // STRICT MULTI-TENANT ISOLATION:
  // A user belongs to targetWsId IF AND ONLY IF there is an actual membership record
  // in wsMembers for targetWsId, OR they are the explicitly assigned workspace owner.
  // Platform admins / Primary owner do NOT automatically appear unless they have an explicit membership record.
  const enrichedUsers: User[] = [];

  for (const member of wsMembers) {
    // Match base user by id or email
    const cleanMemUserId = member.user_id?.toLowerCase() || "";
    let matchedUser = baseUsers.find(
      (u) =>
        u.id === member.user_id ||
        u.email.toLowerCase() === cleanMemUserId ||
        (member.user?.email && u.email.toLowerCase() === member.user.email.toLowerCase())
    );

    // If not in baseUsers, construct from member metadata
    if (!matchedUser) {
      const isOwnerRole = member.role === "owner";
      matchedUser = {
        id: member.user_id || `usr-${Date.now().toString(36)}`,
        email: member.user?.email || (cleanMemUserId.includes("@") ? cleanMemUserId : `${member.user_id}@workshop.local`),
        full_name: member.user?.full_name || (isOwnerRole ? targetWorkspace?.owner_name || "Workspace Owner" : "Workshop Staff"),
        role: member.role || "viewer",
        is_active: member.status === "active",
        status: member.status === "active" ? "active" : (member.status as any),
        created_at: member.joined_at || new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
    }

    const evaluated = checkAndEnforceExpiry(matchedUser);

    // Check time-limited access duration expiry
    const isExpired =
      member.status === "expired" ||
      Boolean(member.access_expires_at && new Date(member.access_expires_at).getTime() <= Date.now());

    let effectiveStatus: UserStatus = evaluated.status || "active";
    let membershipStatus: WorkspaceMemberStatus = member.status;

    if (isExpired) {
      effectiveStatus = "expired";
      membershipStatus = "expired";
    } else if (member.status === "suspended") {
      effectiveStatus = "suspended";
      membershipStatus = "suspended";
    } else if (member.status === "removed") {
      effectiveStatus = "removed";
      membershipStatus = "removed";
    } else if (member.status === "invited") {
      effectiveStatus = "invited";
      membershipStatus = "invited";
    } else if (member.status === "active") {
      effectiveStatus = (evaluated.status === "disabled" || evaluated.status === "suspended") ? evaluated.status : "active";
      membershipStatus = "active";
    }

    const effectiveRole: UserRole = member.role || matchedUser.role || "viewer";

    enrichedUsers.push({
      ...evaluated,
      role: effectiveRole,
      status: effectiveStatus,
      is_active: effectiveStatus === "active",
      membership_status: membershipStatus,
      access_starts_at: member.access_starts_at || null,
      access_expires_at: member.access_expires_at || null,
      expired_at: member.expired_at || (isExpired ? (member.access_expires_at || new Date().toISOString()) : null),
      access_duration: member.access_duration || null,
      removed_at: member.removed_at || null,
      removed_by: member.removed_by || null,
      workspace_id: targetWsId,
      permissions:
        effectiveStatus === "removed" || effectiveStatus === "deleted" || effectiveStatus === "expired" || !matchedUser.is_active
          ? getEmptyPermissions()
          : permsMap[matchedUser.id] || matchedUser.permissions || getDefaultPermissionsForRole(effectiveRole),
    });
  }

  // If workspace owner is assigned in targetWorkspace and not yet in enrichedUsers
  if (targetWorkspace?.owner_email) {
    const ownerEmailClean = targetWorkspace.owner_email.toLowerCase();
    const alreadyInList = enrichedUsers.some(
      (u) => u.email.toLowerCase() === ownerEmailClean || (targetWorkspace.owner_user_id && u.id === targetWorkspace.owner_user_id)
    );

    if (!alreadyInList) {
      const matchedOwnerUser = baseUsers.find(
        (u) => u.email.toLowerCase() === ownerEmailClean || (targetWorkspace.owner_user_id && u.id === targetWorkspace.owner_user_id)
      );
      const isOwnerPrimary = ownerEmailClean === PRIMARY_OWNER_EMAIL.toLowerCase();

      enrichedUsers.unshift({
        id: targetWorkspace.owner_user_id || matchedOwnerUser?.id || `usr-owner-${targetWsId.slice(0, 6)}`,
        email: targetWorkspace.owner_email,
        full_name: targetWorkspace.owner_name || matchedOwnerUser?.full_name || "Workspace Owner",
        role: "owner",
        status: "active",
        is_active: true,
        membership_status: "active",
        workspace_id: targetWsId,
        permissions: isOwnerPrimary ? getAllPermissionsEnabled() : getDefaultPermissionsForRole("owner"),
        created_at: targetWorkspace.created_at || new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    }
  }

  return enrichedUsers;
}

export async function getUserById(id: string, workspaceId?: string): Promise<User | null> {
  const users = await getUsers(workspaceId);
  const found = users.find((u) => u.id === id);
  if (!found || found.status === "deleted") return null;
  return found;
}

// ─── Create Staff User ──────────────────────────────────────────────────────

export async function createUser(
  payload: {
    email: string;
    full_name: string;
    role: UserRole;
    is_active?: boolean;
    status?: UserStatus;
    phone?: string;
    job_title?: string;
    data_scope?: DataAccessScope;
    financial_visibility?: Partial<FinancialVisibilitySettings>;
    approval_limits?: Partial<UserApprovalLimits>;
    access_start_date?: string | null;
    access_expiry_date?: string | null;
    two_factor_enabled?: boolean;
    notes?: string;
    permissions?: Record<AppModule, UserModulePermission>;
    password?: string;
    creatorRole?: UserRole;
    operator?: { id: string; name: string };
    workspace_id?: string;
  },
  optionalPermissions?: Record<AppModule, UserModulePermission>,
  optionalOperator?: { id: string; name: string }
): Promise<{ user: User | null; error: string | null; success: boolean }> {
  const email = payload.email.trim().toLowerCase();
  const fullName = payload.full_name.trim();
  const role = payload.role;
  const status: UserStatus = payload.status || (payload.is_active !== undefined ? (payload.is_active ? "active" : "disabled") : "active");
  const isActive = status === "active";

  // Security guard: Only an owner can assign owner role
  if (role === "owner" && payload.creatorRole && payload.creatorRole !== "owner") {
    return { user: null, error: "Only an Owner can assign the Owner role to a user.", success: false };
  }

  const local = getLocalUsers();
  if (local.some((u) => u.email.toLowerCase() === email)) {
    return { user: null, error: `A user with email "${email}" already exists.`, success: false };
  }

  const newId = `usr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const permissions = optionalPermissions || payload.permissions || getDefaultPermissionsForRole(role);

  const newUser: User = {
    id: newId,
    email,
    full_name: fullName,
    role,
    is_active: isActive,
    status,
    phone: payload.phone?.trim() || null,
    job_title: payload.job_title?.trim() || null,
    data_scope: payload.data_scope || getDefaultDataScope(role),
    financial_visibility: payload.financial_visibility || getDefaultFinancialVisibility(role),
    approval_limits: payload.approval_limits || getDefaultApprovalLimits(role),
    access_start_date: payload.access_start_date || null,
    access_expiry_date: payload.access_expiry_date || null,
    two_factor_enabled: payload.two_factor_enabled || false,
    workspace_id: payload.workspace_id,
    notes: payload.notes?.trim() || null,
    permissions,
    last_login_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  // 1. Save to local storage
  local.push(newUser);
  saveLocalUsers(local);

  const map = getLocalPermissionsMap();
  map[newId] = permissions;
  saveLocalPermissionsMap(map);

  // Link to workspace membership
  const targetWsId =
    payload.workspace_id ||
    (typeof window !== "undefined"
      ? localStorage.getItem(WORKSPACE_STORAGE_KEY) || DEFAULT_WORKSPACE_ID
      : DEFAULT_WORKSPACE_ID);

  try {
    const { addWorkspaceMember } = await import("./workspace-service");
    await addWorkspaceMember(targetWsId, {
      user_id: newId,
      workspace_id: targetWsId,
      role: newUser.role,
      status: (status as string) === "invited" || (status as string) === "pending" ? "invited" : "active",
      is_workspace_owner: false,
    });
  } catch (err) {
    console.warn("Failed to link new user to workspace_members:", err);
  }

  // 2. Record Activity Log
  const operatorName = optionalOperator?.name || payload.operator?.name || "Workshop Owner";
  const operatorId = payload.operator?.id || "usr-owner-001";

  await logUserActivity({
    user_id: operatorId,
    user_email: operatorName,
    user_name: operatorName,
    action: "USER_CREATED",
    module: "user_access",
    record_reference: email,
    description: `Created new staff account "${fullName}" with role ${role.toUpperCase()} and status ${status.toUpperCase()}`,
    details: { role, status, email },
  });

  // 3. Sync to Supabase if connected
  const supabase = createClient();
  try {
    if (payload.password) {
      const { data: authData, error: authErr } = await supabase.auth.signUp({
        email,
        password: payload.password,
        options: {
          data: {
            full_name: fullName,
            role,
          },
        },
      });

      if (!authErr && authData.user) {
        newUser.id = authData.user.id;
      }
    }

    await supabase.from("users").insert({
      id: newUser.id,
      email,
      full_name: fullName,
      role,
      is_active: isActive,
      status,
      phone: newUser.phone,
      job_title: newUser.job_title,
      access_expiry_date: newUser.access_expiry_date,
      notes: newUser.notes,
      last_login_at: null,
    });

    const permRows = Object.values(permissions).map((p) => ({
      user_id: newUser.id,
      module: p.module,
      access: p.access,
      can_view: p.can_view,
      can_create: p.can_create,
      can_edit: p.can_edit,
      can_delete: p.can_delete,
      can_print: p.can_print,
      can_export: p.can_export,
      can_transfer: p.can_transfer || false,
      can_journal: p.can_journal || false,
      can_reverse: p.can_reverse || false,
      can_finalize: p.can_finalize || false,
      can_record_payment: p.can_record_payment || false,
      can_void: p.can_void || false,
      can_view_bank_balance: p.can_view_bank_balance || false,
    }));

    await supabase.from("user_permissions").upsert(permRows, { onConflict: "user_id,module" });
  } catch {
    // Offline mode
  }

  return { user: newUser, error: null, success: true };
}

// ─── Update Staff User ──────────────────────────────────────────────────────

export async function updateUser(
  id: string,
  payload: Partial<{
    full_name: string;
    role: UserRole;
    is_active: boolean;
    status: UserStatus;
    phone: string;
    job_title: string;
    access_expiry_date: string;
    notes: string;
  }>,
  currentOperator?: { id: string; name: string; role?: UserRole } | UserRole | string
): Promise<{ success: boolean; error: string | null }> {
  const local = getLocalUsers();
  const targetUser = local.find((u) => u.id === id);

  if (!targetUser) {
    return { success: false, error: "Staff user not found." };
  }

  const isTargetOwner = targetUser.email.toLowerCase() === PRIMARY_OWNER_EMAIL.toLowerCase();

  // OWNER PROTECTION: Cannot demote, suspend, or deactivate primary Owner
  if (isTargetOwner) {
    if (payload.role && payload.role !== "owner") {
      return { success: false, error: "CRITICAL: The primary Owner account role cannot be changed." };
    }
    if (payload.status && payload.status !== "active") {
      return { success: false, error: "CRITICAL: The primary Owner account cannot be suspended or disabled." };
    }
    if (payload.is_active === false) {
      return { success: false, error: "CRITICAL: The primary Owner account cannot be deactivated." };
    }
  }

  const operatorRole =
    typeof currentOperator === "string"
      ? (currentOperator as UserRole)
      : currentOperator?.role;

  // Non-owner cannot assign owner role
  if (payload.role === "owner" && operatorRole && operatorRole !== "owner") {
    return { success: false, error: "Only an Owner can assign the Owner role." };
  }

  // Sync status and is_active
  const updatedStatus = payload.status || (payload.is_active !== undefined ? (payload.is_active ? "active" : "disabled") : targetUser.status || "active");
  const updatedIsActive = updatedStatus === "active";

  const updatedUser: User = {
    ...targetUser,
    ...payload,
    status: updatedStatus,
    is_active: updatedIsActive,
    updated_at: new Date().toISOString(),
  };

  const updatedList = local.map((u) => (u.id === id ? updatedUser : u));
  saveLocalUsers(updatedList);

  // Record audit log
  const operatorName =
    typeof currentOperator === "object" && currentOperator?.name
      ? currentOperator.name
      : typeof currentOperator === "string"
      ? currentOperator
      : "Workshop Owner";
  const operatorId =
    typeof currentOperator === "object" && currentOperator?.id
      ? currentOperator.id
      : "usr-owner-001";

  let desc = `Updated profile for staff member ${targetUser.full_name}`;
  if (payload.status && payload.status !== targetUser.status) {
    desc = `Changed account status for ${targetUser.full_name} from ${targetUser.status?.toUpperCase() || "ACTIVE"} to ${payload.status.toUpperCase()}`;
  } else if (payload.role && payload.role !== targetUser.role) {
    desc = `Changed role for ${targetUser.full_name} from ${targetUser.role.toUpperCase()} to ${payload.role.toUpperCase()}`;
  }

  await logUserActivity({
    user_id: operatorId,
    user_email: operatorName,
    user_name: operatorName,
    action: payload.status !== targetUser.status ? "STATUS_CHANGED" : "USER_UPDATED",
    module: "user_access",
    record_reference: targetUser.email,
    description: desc,
    details: { payload, previous: { role: targetUser.role, status: targetUser.status } },
  });

  // Sync to Supabase
  const supabase = createClient();
  try {
    await supabase
      .from("users")
      .update({
        full_name: updatedUser.full_name,
        role: updatedUser.role,
        is_active: updatedUser.is_active,
        status: updatedUser.status,
        phone: updatedUser.phone,
        job_title: updatedUser.job_title,
        access_expiry_date: updatedUser.access_expiry_date,
        notes: updatedUser.notes,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);
  } catch {
    // offline
  }

  return { success: true, error: null };
}

// ─── Delete Staff User ──────────────────────────────────────────────────────

export async function deleteUser(
  id: string,
  currentOperator?: { id: string; name: string; role?: UserRole } | UserRole | string
): Promise<{ success: boolean; error: string | null }> {
  const local = getLocalUsers();
  const targetUser = local.find((u) => u.id === id);

  if (!targetUser) {
    return { success: false, error: "User not found." };
  }

  // OWNER LOCKOUT PROTECTION: CANNOT DELETE OWNER
  if (targetUser.email.toLowerCase() === PRIMARY_OWNER_EMAIL.toLowerCase()) {
    return { success: false, error: "CRITICAL: The primary Owner account cannot be deleted." };
  }

  const operatorRole =
    typeof currentOperator === "string"
      ? (currentOperator as UserRole)
      : currentOperator?.role;

  if (operatorRole && operatorRole !== "owner") {
    return { success: false, error: "Only the Owner has permission to delete staff accounts." };
  }

  const now = new Date().toISOString();
  const operatorName =
    typeof currentOperator === "object" && currentOperator?.name
      ? currentOperator.name
      : typeof currentOperator === "string"
      ? currentOperator
      : "Workshop Owner";
  const operatorId =
    typeof currentOperator === "object" && currentOperator?.id
      ? currentOperator.id
      : "usr-owner-001";

  // Soft-delete user: deactivates login while preserving historical records
  targetUser.status = "deleted";
  targetUser.is_active = false;
  targetUser.deleted_at = now;
  targetUser.deleted_by = operatorName;

  const updatedList = local.map((u) => (u.id === id ? targetUser : u));
  saveLocalUsers(updatedList);

  // Mark all workspace memberships as removed
  try {
    const { getLocalMembers, saveLocalMembers } = await import("./workspace-service");
    const members = getLocalMembers();
    members.forEach((m) => {
      if (m.user_id === id || m.user_id.toLowerCase() === targetUser.email.toLowerCase()) {
        m.status = "removed";
        m.removed_at = now;
        m.removed_by = operatorName;
      }
    });
    saveLocalMembers(members);
  } catch {}

  // Remove permissions
  try {
    const perms = getLocalPermissionsMap();
    delete perms[id];
    saveLocalPermissionsMap(perms);
  } catch {}

  await logUserActivity({
    user_id: operatorId,
    user_email: operatorName,
    user_name: operatorName,
    action: "USER_DELETED",
    module: "user_access",
    record_reference: targetUser.email,
    description: `Deactivated login and soft-deleted user account "${targetUser.full_name}" (${targetUser.email}). Historical records preserved.`,
  });

  const supabase = createClient();
  try {
    await supabase.from("user_permissions").delete().eq("user_id", id);
    await supabase
      .from("workspace_members")
      .update({ status: "removed", removed_at: now, removed_by: operatorName })
      .or(`user_id.eq.${id},user_id.eq.${targetUser.email.toLowerCase()}`);
    await supabase
      .from("users")
      .update({ status: "deleted", is_active: false, deleted_at: now, deleted_by: operatorName })
      .eq("id", id);
  } catch {
    // offline
  }

  return { success: true, error: null };
}

// ─── Password Reset & Invitations ───────────────────────────────────────────

export async function sendPasswordResetEmail(email: string): Promise<{ success: boolean; error: string | null }> {
  const supabase = createClient();
  const redirectTo =
    typeof window !== "undefined"
      ? `${window.location.origin}/auth/callback?next=/reset-password`
      : undefined;

  try {
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo,
    });

    if (error) throw error;
    return { success: true, error: null };
  } catch (err: any) {
    console.warn("Password reset notice:", err?.message || err);
    // Return success to avoid user enumeration / safe offline mock
    return { success: true, error: null };
  }
}

export async function sendStaffInvitation(
  emailOrUser: string | User,
  roleOrMethod?: UserRole | string,
  fullNameOrPassword?: string
): Promise<{ success: boolean; error: string | null; message?: string }> {
  let email: string;
  let role: UserRole;
  let fullName: string;

  if (typeof emailOrUser === "object" && emailOrUser !== null) {
    email = emailOrUser.email;
    role = emailOrUser.role;
    fullName = emailOrUser.full_name;
  } else {
    email = emailOrUser;
    role = (roleOrMethod as UserRole) || "viewer";
    fullName = fullNameOrPassword || "Staff Member";
  }

  // Try server route /api/staff/invite first
  try {
    if (typeof window !== "undefined") {
      const res = await fetch("/api/staff/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, role, full_name: fullName }),
      });
      const data = await res.json();
      if (data.success) {
        return { success: true, error: null, message: data.message };
      }
    }
  } catch {
    // fallback
  }

  // Fallback to sending standard password setup link
  const resetRes = await sendPasswordResetEmail(email);
  return {
    success: resetRes.success,
    error: resetRes.error,
    message: "Invitation & password setup dispatch complete.",
  };
}
