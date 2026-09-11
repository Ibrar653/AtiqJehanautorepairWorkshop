/**
 * Workspace Management & Multi-Tenant Isolation Service
 * Manages workspaces, membership, active context, and strict data partitioning.
 */

import { createClient } from "@/lib/supabase/client";
import {
  DEFAULT_WORKSPACE_ID,
  DEFAULT_WORKSPACE_NAME,
  DEFAULT_WORKSPACE_BUSINESS_NAME,
  PRIMARY_OWNER_EMAIL,
  WORKSPACE_STORAGE_KEY,
} from "@/lib/constants";
import { getLocalUsers } from "./user-service";
import { isTableMissingInSupabase, markTableMissingInSupabase } from "./supabase-schema-status";
import type {
  Workspace,
  WorkspaceMember,
  WorkspaceMemberStatus,
  UserRole,
  WorkspaceStatus,
  WorkspaceAuditLog,
  WorkspaceAuditAction,
  FinancialRecordCounts,
  CreateDirectWorkspacePayload,
  CreateDirectWorkspaceResponse,
} from "@/types/database";

export interface CreateWorkspaceInput {
  name: string;
  business_name?: string;
  owner_name: string;
  owner_email: string;
  phone?: string;
  country?: string;
  currency?: string;
  address?: string;
  trn?: string;
  status?: WorkspaceStatus;
}

const DEFAULT_INITIAL_WORKSPACES: Workspace[] = [
  {
    id: DEFAULT_WORKSPACE_ID,
    name: DEFAULT_WORKSPACE_NAME,
    business_name: DEFAULT_WORKSPACE_BUSINESS_NAME,
    owner_user_id: "usr-owner-001",
    phone: "+971 52 123 4567",
    email: PRIMARY_OWNER_EMAIL,
    address: "Industrial Area 4, Sharjah, United Arab Emirates",
    country: "United Arab Emirates",
    currency: "AED",
    trn: "100482910400003",
    status: "active",
    users_count: 5,
    last_activity: new Date().toISOString(),
    created_at: "2024-01-01T00:00:00Z",
    updated_at: new Date().toISOString(),
  },
];

const LOCAL_STORAGE_WS_KEY = "atiq_local_workspaces";
const LOCAL_STORAGE_MEMBERS_KEY = "atiq_local_workspace_members";

export const DEFAULT_INITIAL_MEMBERS: WorkspaceMember[] = [
  {
    id: "wm-owner-001",
    workspace_id: DEFAULT_WORKSPACE_ID,
    user_id: "usr-owner-001",
    role: "owner",
    status: "active",
    is_workspace_owner: true,
    joined_at: "2024-01-01T00:00:00Z",
  },
  {
    id: "wm-mgr-002",
    workspace_id: DEFAULT_WORKSPACE_ID,
    user_id: "usr-manager-002",
    role: "manager",
    status: "active",
    joined_at: "2024-01-01T00:00:00Z",
  },
  {
    id: "wm-rec-003",
    workspace_id: DEFAULT_WORKSPACE_ID,
    user_id: "usr-reception-003",
    role: "receptionist",
    status: "active",
    joined_at: "2024-01-01T00:00:00Z",
  },
  {
    id: "wm-mech-004",
    workspace_id: DEFAULT_WORKSPACE_ID,
    user_id: "usr-mechanic-004",
    role: "mechanic",
    status: "active",
    joined_at: "2024-01-01T00:00:00Z",
  },
  {
    id: "wm-store-005",
    workspace_id: DEFAULT_WORKSPACE_ID,
    user_id: "usr-store-005",
    role: "storekeeper",
    status: "active",
    joined_at: "2024-01-01T00:00:00Z",
  },
  {
    id: "wm-acct-006",
    workspace_id: DEFAULT_WORKSPACE_ID,
    user_id: "usr-accountant-006",
    role: "accountant",
    status: "active",
    joined_at: "2024-01-01T00:00:00Z",
  },
  {
    id: "wm-view-007",
    workspace_id: DEFAULT_WORKSPACE_ID,
    user_id: "usr-viewer-007",
    role: "viewer",
    status: "active",
    joined_at: "2024-01-01T00:00:00Z",
  },
];

let inMemoryWorkspaces: Workspace[] = [...DEFAULT_INITIAL_WORKSPACES];
let inMemoryMembers: WorkspaceMember[] = [...DEFAULT_INITIAL_MEMBERS];

export function getLocalWorkspaces(): Workspace[] {
  if (typeof window === "undefined") return inMemoryWorkspaces;
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_WS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (parsed.length > 0) return parsed;
    localStorage.setItem(LOCAL_STORAGE_WS_KEY, JSON.stringify(DEFAULT_INITIAL_WORKSPACES));
    return DEFAULT_INITIAL_WORKSPACES;
  } catch {
    return inMemoryWorkspaces;
  }
}

export function saveLocalWorkspaces(workspaces: Workspace[]) {
  inMemoryWorkspaces = workspaces;
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LOCAL_STORAGE_WS_KEY, JSON.stringify(workspaces));
  } catch (e) {
    console.error("Failed to save local workspaces", e);
  }
}

export function getLocalMembers(): WorkspaceMember[] {
  if (typeof window === "undefined") return inMemoryMembers;
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_MEMBERS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (parsed.length > 0) return parsed;
    localStorage.setItem(LOCAL_STORAGE_MEMBERS_KEY, JSON.stringify(inMemoryMembers));
    return inMemoryMembers;
  } catch {
    return inMemoryMembers;
  }
}

export function saveLocalMembers(members: WorkspaceMember[]) {
  inMemoryMembers = members;
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LOCAL_STORAGE_MEMBERS_KEY, JSON.stringify(members));
  } catch (e) {
    console.error("Failed to save local workspace members", e);
  }
}

// ─── Active Workspace Resolution ─────────────────────────────────────────────

let inMemoryActiveWorkspaceId: string = DEFAULT_WORKSPACE_ID;

export function getActiveWorkspaceId(): string {
  if (typeof window === "undefined") return inMemoryActiveWorkspaceId;
  try {
    const stored = localStorage.getItem(WORKSPACE_STORAGE_KEY);
    if (stored && stored.trim()) return stored.trim();
  } catch {}
  return inMemoryActiveWorkspaceId;
}

export function setActiveWorkspaceId(workspaceId: string) {
  inMemoryActiveWorkspaceId = workspaceId;
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(WORKSPACE_STORAGE_KEY, workspaceId);
    window.dispatchEvent(new CustomEvent("atiq_workspace_changed", { detail: { workspaceId } }));
  } catch (e) {
    console.error("Failed to set active workspace id", e);
  }
}

// ─── Workspace Login Return URL (for workspace-specific logout redirect) ─────

const WORKSPACE_LOGIN_RETURN_KEY = "atiq_workspace_login_return_url";

export function setWorkspaceLoginReturnUrl(url: string) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(WORKSPACE_LOGIN_RETURN_KEY, url);
  } catch {}
}

export function getWorkspaceLoginReturnUrl(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(WORKSPACE_LOGIN_RETURN_KEY);
  } catch {
    return null;
  }
}

export function clearWorkspaceLoginReturnUrl() {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(WORKSPACE_LOGIN_RETURN_KEY);
  } catch {}
}

// ─── Workspace Resolution by Slug / Name ─────────────────────────────────────

export async function getWorkspaceBySlug(slug: string): Promise<Workspace | null> {
  const supabase = createClient();
  const normalizedSlug = slug.trim().toLowerCase();

  try {
    // Try Supabase first — search by name (case-insensitive)
    const { data, error } = await supabase
      .from("workspaces")
      .select("*")
      .ilike("name", normalizedSlug)
      .limit(1)
      .single();

    if (!error && data) {
      return data as Workspace;
    }
  } catch {}

  // Fallback to local storage
  const local = getLocalWorkspaces();
  return local.find((w) => w.name.toLowerCase() === normalizedSlug) || null;
}

// ─── Workspace Membership Verification ───────────────────────────────────────

export async function verifyWorkspaceMembership(
  authUserId: string,
  workspaceId: string
): Promise<{ isMember: boolean; member?: WorkspaceMember }> {
  const supabase = createClient();

  try {
    // Check Supabase workspace_members table
    const { data, error } = await supabase
      .from("workspace_members")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("user_id", authUserId)
      .eq("status", "active")
      .limit(1)
      .single();

    if (!error && data) {
      return { isMember: true, member: data as WorkspaceMember };
    }
  } catch {}

  // Fallback: check local members
  const localMembers = getLocalMembers();
  const localMatch = localMembers.find(
    (m) =>
      m.workspace_id === workspaceId &&
      (m.user_id === authUserId || m.user_id.toLowerCase() === authUserId.toLowerCase()) &&
      m.status === "active"
  );

  if (localMatch) {
    return { isMember: true, member: localMatch };
  }

  return { isMember: false };
}

// ─── Ensure Workspace Membership Exists ──────────────────────────────────────

export async function ensureWorkspaceMembership(
  authUserId: string,
  authEmail: string,
  workspaceId: string
): Promise<{ success: boolean; member?: WorkspaceMember; error?: string }> {
  // First check if membership already exists
  const existing = await verifyWorkspaceMembership(authUserId, workspaceId);
  if (existing.isMember && existing.member) {
    return { success: true, member: existing.member };
  }

  // Create membership
  const now = new Date().toISOString();
  const newMember: WorkspaceMember = {
    id: `wm-${Date.now().toString(36)}`,
    workspace_id: workspaceId,
    user_id: authUserId,
    role: "owner" as any,
    status: "active",
    is_workspace_owner: true,
    joined_at: now,
  };

  const supabase = createClient();
  try {
    const { error } = await supabase.from("workspace_members").insert(newMember);
    if (error) {
      console.warn("Supabase member insert notice:", error.message);
    }
  } catch (e: any) {
    console.warn("Supabase ensureWorkspaceMembership fallback to local:", e?.message || e);
  }

  // Also persist to local storage
  const currentMembers = getLocalMembers();
  saveLocalMembers([...currentMembers, newMember]);

  return { success: true, member: newMember };
}

// ─── Workspace Retrieval ─────────────────────────────────────────────────────

let inFlightWorkspacesPromise: Promise<Workspace[]> | null = null;
let lastWorkspacesFetchTime = 0;
let cachedWorkspacesResult: Workspace[] | null = null;

export async function getWorkspaces(userEmail?: string): Promise<Workspace[]> {
  const isPlatformOwner =
    !userEmail ||
    userEmail.toLowerCase() === PRIMARY_OWNER_EMAIL.toLowerCase() ||
    userEmail === "usr-owner-001";

  // Fast return cached result if fetched within last 4 seconds
  const now = Date.now();
  if (cachedWorkspacesResult && now - lastWorkspacesFetchTime < 4000) {
    if (isPlatformOwner) return cachedWorkspacesResult;
    return cachedWorkspacesResult.filter((w) => w.status === "active");
  }

  // If table is known to be missing in Supabase schema cache, use local storage immediately
  if (isTableMissingInSupabase("workspaces")) {
    const local = getLocalWorkspaces();
    return isPlatformOwner ? local : local.filter((w) => w.status === "active");
  }

  // Deduplicate concurrent in-flight requests
  if (inFlightWorkspacesPromise) {
    return inFlightWorkspacesPromise;
  }

  inFlightWorkspacesPromise = (async () => {
    const supabase = createClient();
    try {
      const fetchPromise = (async () => {
        if (isPlatformOwner) {
          const { data, error } = await supabase
            .from("workspaces")
            .select("*")
            .order("created_at", { ascending: false });
          if (error) {
            markTableMissingInSupabase("workspaces", error);
            throw error;
          }
          return (data || []) as Workspace[];
        } else {
          // Fetch workspaces where user is an active member
          const { data: memberData, error: memErr } = await supabase
            .from("workspace_members")
            .select("workspace_id")
            .eq("status", "active");
          if (memErr) {
            markTableMissingInSupabase("workspace_members", memErr);
            throw memErr;
          }
          const wsIds = (memberData || []).map((m: any) => m.workspace_id);
          if (wsIds.length === 0) return [];

          const { data, error } = await supabase
            .from("workspaces")
            .select("*")
            .in("id", wsIds)
            .eq("status", "active")
            .order("created_at", { ascending: false });
          if (error) {
            markTableMissingInSupabase("workspaces", error);
            throw error;
          }
          return (data || []) as Workspace[];
        }
      })();

      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Timeout")), 1800)
      );

      const result = await Promise.race([fetchPromise, timeoutPromise]);
      if (result && result.length > 0) {
        saveLocalWorkspaces(result);
        cachedWorkspacesResult = result;
        lastWorkspacesFetchTime = Date.now();
        return result;
      }
    } catch (e: any) {
      markTableMissingInSupabase("workspaces", e);
      // fallback to local storage
    } finally {
      inFlightWorkspacesPromise = null;
    }

    const local = getLocalWorkspaces();
    cachedWorkspacesResult = local;
    lastWorkspacesFetchTime = Date.now();
    if (isPlatformOwner) {
      return local;
    }

    // Strictly filter local workspaces by active membership for non-platform users
    const allMembers = getLocalMembers();
    const userMembers = allMembers.filter(
      (m) =>
        (userEmail && m.user_id.toLowerCase() === userEmail.toLowerCase()) &&
        m.status === "active"
    );
    if (userMembers.length === 0) {
      return [];
    }
    const memberWsIds = new Set(userMembers.map((m) => m.workspace_id));
    return local.filter((w) => memberWsIds.has(w.id) && w.status === "active");
  })();

  return inFlightWorkspacesPromise;
}

export async function getWorkspaceById(id: string): Promise<Workspace | null> {
  const all = await getWorkspaces();
  return all.find((w) => w.id === id) || null;
}

// ─── Direct Workspace & User Creation (Server-Side) ──────────────────────────

export async function createDirectWorkspace(
  payload: CreateDirectWorkspacePayload
): Promise<CreateDirectWorkspaceResponse> {
  try {
    const supabase = createClient();
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData?.session?.access_token;
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const res = await fetch("/api/workspaces/create", {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });

    const data: CreateDirectWorkspaceResponse = await res.json();
    if (!res.ok || !data.success) {
      return { success: false, error: data.error || "Failed to create workspace." };
    }

    // Sync created workspace and membership into local cache for immediate UI responsiveness
    if (data.workspace) {
      const current = getLocalWorkspaces();
      if (!current.some((w) => w.id === data.workspace!.id)) {
        saveLocalWorkspaces([data.workspace, ...current]);
      }
      if (data.owner?.id) {
        const members = getLocalMembers();
        const newMember: WorkspaceMember = {
          id: `wm-${Date.now().toString(36)}`,
          workspace_id: data.workspace.id,
          user_id: data.owner.id,
          role: "owner",
          status: "pending",
          is_workspace_owner: true,
          joined_at: null as any,
        };
        saveLocalMembers([...members, newMember]);
      }
    }

    return data;
  } catch (err: any) {
    console.error("createDirectWorkspace network error:", err);
    return { success: false, error: err.message || "Network error creating workspace." };
  }
}

// ─── Workspace Access Duration & Expiry Helpers ──────────────────────────────

export function calculateAccessExpiry(
  duration?: string,
  customDate?: string,
  startDate: Date = new Date()
): { startsAt: string; expiresAt: string | null; durationText: string } {
  const startsAt = startDate.toISOString();
  if (!duration || duration === "no_expiry" || duration === "never") {
    return { startsAt, expiresAt: null, durationText: "No Expiry" };
  }

  const d = new Date(startDate);
  switch (duration) {
    case "7d":
    case "7_days":
      d.setDate(d.getDate() + 7);
      return { startsAt, expiresAt: d.toISOString(), durationText: "7 Days" };
    case "30d":
    case "30_days":
      d.setDate(d.getDate() + 30);
      return { startsAt, expiresAt: d.toISOString(), durationText: "30 Days" };
    case "3m":
    case "3_months":
      d.setMonth(d.getMonth() + 3);
      return { startsAt, expiresAt: d.toISOString(), durationText: "3 Months" };
    case "6m":
    case "6_months":
      d.setMonth(d.getMonth() + 6);
      return { startsAt, expiresAt: d.toISOString(), durationText: "6 Months" };
    case "1y":
    case "1_year":
      d.setFullYear(d.getFullYear() + 1);
      return { startsAt, expiresAt: d.toISOString(), durationText: "1 Year" };
    case "custom":
      if (customDate) {
        const customParsed = new Date(customDate);
        return {
          startsAt,
          expiresAt: !isNaN(customParsed.getTime()) ? customParsed.toISOString() : null,
          durationText: "Custom Expiry",
        };
      }
      return { startsAt, expiresAt: null, durationText: "Custom (Unset)" };
    default:
      return { startsAt, expiresAt: null, durationText: "No Expiry" };
  }
}

export function isMembershipExpired(
  memberOrExpiresAt?: Partial<WorkspaceMember> | string | null,
  status?: string
): boolean {
  if (!memberOrExpiresAt) {
    return status === "expired";
  }
  if (typeof memberOrExpiresAt === "string") {
    if (status === "expired") return true;
    const exp = new Date(memberOrExpiresAt).getTime();
    return !isNaN(exp) && exp <= Date.now();
  }
  if (memberOrExpiresAt.status === "expired") return true;
  if (memberOrExpiresAt.access_expires_at) {
    const exp = new Date(memberOrExpiresAt.access_expires_at).getTime();
    return !isNaN(exp) && exp <= Date.now();
  }
  return false;
}

export function formatTimeRemaining(expiresAt?: string | null): {
  isExpired: boolean;
  text: string;
  isWarning: boolean;
  formattedDate: string;
} {
  if (!expiresAt) {
    return { isExpired: false, text: "No Expiry", isWarning: false, formattedDate: "No Expiry" };
  }

  const expiryTime = new Date(expiresAt).getTime();
  if (isNaN(expiryTime)) {
    return { isExpired: false, text: "No Expiry", isWarning: false, formattedDate: "No Expiry" };
  }

  const formattedDate = new Date(expiresAt).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  const now = Date.now();
  const diffMs = expiryTime - now;

  if (diffMs <= 0) {
    return { isExpired: true, text: "EXPIRED", isWarning: true, formattedDate };
  }

  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays <= 5) {
    return {
      isExpired: false,
      text: `Expires in ${diffDays} day${diffDays === 1 ? "" : "s"}`,
      isWarning: true,
      formattedDate,
    };
  }

  if (diffDays < 30) {
    return {
      isExpired: false,
      text: `${diffDays} days remaining`,
      isWarning: false,
      formattedDate,
    };
  }

  const diffMonths = Math.round(diffDays / 30);
  return {
    isExpired: false,
    text: `${diffDays} days (${diffMonths} mo) remaining`,
    isWarning: false,
    formattedDate,
  };
}

// ─── Workspace Approval & Rejection Actions (Server-Side) ─────────────────────

export async function approveWorkspace(
  workspaceId: string
): Promise<{ success: boolean; error?: string; message?: string }> {
  try {
    const supabase = createClient();
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData?.session?.access_token;
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const res = await fetch("/api/workspaces/approve", {
      method: "POST",
      headers,
      body: JSON.stringify({ workspace_id: workspaceId, action: "approve" }),
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      return { success: false, error: data.error || "Failed to approve workspace." };
    }

    // Update local workspace cache
    const current = getLocalWorkspaces();
    const updated = current.map((w) =>
      w.id === workspaceId ? { ...w, status: "active" as WorkspaceStatus, approved_at: new Date().toISOString(), rejection_reason: null } : w
    );
    saveLocalWorkspaces(updated);

    // Also update member status in local storage
    const members = getLocalMembers();
    const updatedMembers = members.map((m) =>
      m.workspace_id === workspaceId && m.status === "pending"
        ? {
            ...m,
            status: "active" as WorkspaceMemberStatus,
            access_starts_at: data.access_starts_at || new Date().toISOString(),
            access_expires_at: data.access_expires_at || null,
          }
        : m
    );
    saveLocalMembers(updatedMembers);

    return { success: true, message: data.message };
  } catch (err: any) {
    return { success: false, error: err.message || "Network error approving workspace." };
  }
}

export async function renewWorkspaceAccess(
  workspaceIdOrOptions:
    | string
    | {
        workspace_id: string;
        user_email?: string;
        user_id?: string;
        duration?: string;
        custom_expiry_date?: string;
        renewed_by?: string;
      },
  userIdOrEmail?: string,
  duration?: string,
  customDate?: string,
  operator?: { id: string; name: string }
): Promise<{ success: boolean; error?: string; member?: WorkspaceMember; expiresAt?: string | null }> {
  let wsId: string;
  let targetUserOrEmail: string;
  let dur: string;
  let custDate: string | undefined;

  if (typeof workspaceIdOrOptions === "object" && workspaceIdOrOptions !== null) {
    wsId = workspaceIdOrOptions.workspace_id;
    targetUserOrEmail = (workspaceIdOrOptions.user_email || workspaceIdOrOptions.user_id || "").trim().toLowerCase();
    dur = workspaceIdOrOptions.duration || "30_days";
    custDate = workspaceIdOrOptions.custom_expiry_date;
  } else {
    wsId = workspaceIdOrOptions;
    targetUserOrEmail = (userIdOrEmail || "").trim().toLowerCase();
    dur = duration || "30_days";
    custDate = customDate;
  }

  const cleanIdOrEmail = targetUserOrEmail;
  const { startsAt, expiresAt } = calculateAccessExpiry(dur, custDate);

  try {
    const supabase = createClient();
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData?.session?.access_token;
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const res = await fetch("/api/workspaces/renew-access", {
      method: "POST",
      headers,
      body: JSON.stringify({
        workspace_id: wsId,
        user_id_or_email: cleanIdOrEmail,
        duration: dur,
        custom_date: custDate,
      }),
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || "Failed to renew workspace access via API.");
    }
  } catch (apiErr: any) {
    console.warn("Falling back to local renewal:", apiErr?.message || apiErr);
  }

  // Update local members cache
  const members = getLocalMembers();
  let target = members.find(
    (m) =>
      m.workspace_id === wsId &&
      (m.user_id.toLowerCase() === cleanIdOrEmail || m.user?.email?.toLowerCase() === cleanIdOrEmail)
  );

  if (target) {
    target.status = "active";
    target.access_starts_at = startsAt;
    target.access_expires_at = expiresAt;
    target.access_duration = dur;
    target.expired_at = null;
    saveLocalMembers(members);
  }

  // Update workspace cache if workspace was expired
  const workspaces = getLocalWorkspaces();
  const ws = workspaces.find((w) => w.id === wsId);
  if (ws && (ws.status === "suspended" || (ws.status as string) === "expired")) {
    ws.status = "active";
    saveLocalWorkspaces(workspaces);
  }

  await logWorkspaceAudit({
    workspace_id: wsId,
    action: "WORKSPACE_ACCESS_RENEWED",
    performed_by: operator?.name || "Primary Owner",
    target_user: cleanIdOrEmail,
    details: {
      duration: dur,
      access_starts_at: startsAt,
      access_expires_at: expiresAt,
    },
  });

  return { success: true, member: target, expiresAt };
}

export async function rejectWorkspace(
  workspaceId: string,
  rejectionReason?: string
): Promise<{ success: boolean; error?: string; message?: string }> {
  try {
    const supabase = createClient();
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData?.session?.access_token;
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const res = await fetch("/api/workspaces/approve", {
      method: "POST",
      headers,
      body: JSON.stringify({
        workspace_id: workspaceId,
        action: "reject",
        rejection_reason: rejectionReason,
      }),
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      return { success: false, error: data.error || "Failed to reject workspace." };
    }

    // Update local workspace cache
    const current = getLocalWorkspaces();
    const updated = current.map((w) =>
      w.id === workspaceId
        ? { ...w, status: "rejected" as WorkspaceStatus, rejection_reason: rejectionReason || "Rejected" }
        : w
    );
    saveLocalWorkspaces(updated);

    return { success: true, message: data.message };
  } catch (err: any) {
    return { success: false, error: err.message || "Network error rejecting workspace." };
  }
}

// ─── Workspace Creation ──────────────────────────────────────────────────────

export async function createWorkspace(
  input: CreateWorkspaceInput,
  operator?: { id: string; name: string }
): Promise<{ success: boolean; workspace?: Workspace; error?: string }> {
  if (!input.name || !input.name.trim()) {
    return { success: false, error: "Business / Workspace Name is required." };
  }
  if (!input.owner_name || !input.owner_name.trim()) {
    return { success: false, error: "Owner Full Name is required." };
  }
  if (!input.owner_email || !input.owner_email.trim()) {
    return { success: false, error: "Owner Work Email is required." };
  }

  const cleanName = input.name.trim();
  const cleanBusinessName = (input.business_name || cleanName).trim();
  const cleanEmail = input.owner_email.trim().toLowerCase();
  const cleanOwnerName = input.owner_name.trim();

  // Generate unique workspace ID
  const slug = cleanName
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 15);
  const newWsId = `ws-${slug}-${Date.now().toString(36)}`;
  const now = new Date().toISOString();

  const newWorkspace: Workspace = {
    id: newWsId,
    name: cleanName,
    business_name: cleanBusinessName,
    owner_user_id: `usr-${Date.now().toString(36)}`,
    owner_name: cleanOwnerName,
    owner_email: cleanEmail,
    phone: input.phone?.trim() || null,
    email: cleanEmail,
    address: input.address?.trim() || null,
    country: input.country?.trim() || "United Arab Emirates",
    currency: input.currency?.trim() || "AED",
    trn: input.trn?.trim() || null,
    status: input.status || "active",
    users_count: 1,
    last_activity: now,
    created_at: now,
    updated_at: now,
  };

  const newMember: WorkspaceMember = {
    id: `wm-${Date.now().toString(36)}`,
    workspace_id: newWsId,
    user_id: cleanEmail,
    role: "owner",
    status: "active",
    is_workspace_owner: true,
    joined_at: now,
  };

  const supabase = createClient();
  try {
    const { error: wsErr } = await supabase.from("workspaces").insert(newWorkspace);
    if (wsErr) throw wsErr;

    const { error: memErr } = await supabase.from("workspace_members").insert(newMember);
    if (memErr) console.warn("Supabase member insert notice:", memErr.message);

    // Initialize standard clean Chart of Accounts for the new workspace
    await initializeWorkspaceAccounts(newWsId, newWorkspace.currency);
  } catch (e: any) {
    console.warn("Supabase createWorkspace fallback to local:", e?.message || e);
  }

  // Local storage persistence
  const currentLocal = getLocalWorkspaces();
  saveLocalWorkspaces([newWorkspace, ...currentLocal]);

  const currentMembers = getLocalMembers();
  saveLocalMembers([...currentMembers, newMember]);

  // Initialize local accounts for this workspace
  initializeWorkspaceAccountsLocal(newWsId);

  return { success: true, workspace: newWorkspace };
}

// ─── Workspace Status & Updating ─────────────────────────────────────────────

export async function updateWorkspace(
  workspaceId: string,
  updates: Partial<Workspace>
): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient();
  const now = new Date().toISOString();

  try {
    const { error } = await supabase
      .from("workspaces")
      .update({ ...updates, updated_at: now })
      .eq("id", workspaceId);
    if (error) throw error;
  } catch (e) {
    console.warn("Supabase updateWorkspace fallback to local:", e);
  }

  const local = getLocalWorkspaces();
  const updated = local.map((w) =>
    w.id === workspaceId ? { ...w, ...updates, updated_at: now } : w
  );
  saveLocalWorkspaces(updated);

  return { success: true };
}

export async function setWorkspaceStatus(
  workspaceId: string,
  status: WorkspaceStatus
): Promise<{ success: boolean; error?: string }> {
  if (workspaceId === DEFAULT_WORKSPACE_ID && status !== "active") {
    return {
      success: false,
      error: "The primary default ATIQ JEHAN workspace is permanently protected and cannot be suspended or archived.",
    };
  }

  return await updateWorkspace(workspaceId, { status });
}

// ─── Standard Chart of Accounts Initializer (Fresh for new workspace) ────────

const STANDARD_ACCOUNTS_TEMPLATE = [
  { code: "1010", name: "Cash on Hand", type: "asset", sub: "cash", entity: "none" },
  { code: "1020", name: "Operating Bank Account", type: "asset", sub: "bank", entity: "bank" },
  { code: "1030", name: "Customer Accounts Receivable", type: "asset", sub: "receivable", entity: "customer" },
  { code: "2010", name: "Supplier Accounts Payable", type: "liability", sub: "payable", entity: "supplier" },
  { code: "3010", name: "Owner Capital / Equity", type: "equity", sub: "equity", entity: "owner" },
  { code: "4010", name: "Workshop Labor Services Revenue", type: "income", sub: "sales", entity: "none" },
  { code: "4020", name: "Spare Parts Sales Revenue", type: "income", sub: "sales", entity: "none" },
  { code: "5010", name: "Spare Parts Inventory & Purchase Cost", type: "expense", sub: "cogs", entity: "none" },
  { code: "6010", name: "Workshop Rent & Facility Expense", type: "expense", sub: "operating_expense", entity: "none" },
  { code: "6020", name: "Utilities, DEWA & Electricity", type: "expense", sub: "operating_expense", entity: "none" },
  { code: "6030", name: "Staff Salaries & Wages", type: "expense", sub: "operating_expense", entity: "worker" },
];

async function initializeWorkspaceAccounts(workspaceId: string, currency = "AED") {
  const supabase = createClient();
  const now = new Date().toISOString();
  const rows = STANDARD_ACCOUNTS_TEMPLATE.map((acc, index) => ({
    id: `acc-${workspaceId.slice(0, 8)}-${acc.code}`,
    workspace_id: workspaceId,
    account_code: acc.code,
    account_name: acc.name,
    account_type: acc.type,
    account_sub_type: acc.sub,
    related_entity_type: acc.entity,
    related_entity_id: null,
    opening_balance: 0,
    opening_balance_date: new Date().toISOString().split("T")[0],
    is_active: true,
    notes: "Initialized standard workshop chart of accounts",
    created_at: now,
    updated_at: now,
  }));

  try {
    await supabase.from("ledger_accounts").insert(rows);
  } catch (e) {
    // fallback
  }
}

function initializeWorkspaceAccountsLocal(workspaceId: string) {
  if (typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem("atiq_local_ledger_accounts");
    const existing = raw ? JSON.parse(raw) : [];
    const now = new Date().toISOString();
    const newAccounts = STANDARD_ACCOUNTS_TEMPLATE.map((acc) => ({
      id: `acc-${workspaceId.slice(0, 8)}-${acc.code}`,
      workspace_id: workspaceId,
      account_code: acc.code,
      account_name: acc.name,
      account_type: acc.type,
      account_sub_type: acc.sub,
      related_entity_type: acc.entity,
      related_entity_id: null,
      opening_balance: 0,
      opening_balance_date: new Date().toISOString().split("T")[0],
      is_active: true,
      notes: "Initialized standard workshop chart of accounts",
      current_balance: 0,
      created_at: now,
      updated_at: now,
    }));
    localStorage.setItem("atiq_local_ledger_accounts", JSON.stringify([...existing, ...newAccounts]));
  } catch (e) {
    console.warn("Failed to initialize local accounts for workspace:", e);
  }
}

// ─── Workspace Governance & Lifecycle Controls ───────────────────────────────

const LOCAL_STORAGE_AUDIT_KEY = "atiq_local_workspace_audit_logs";

let inMemoryAuditLogs: WorkspaceAuditLog[] = [];

export function getLocalAuditLogs(): WorkspaceAuditLog[] {
  if (typeof window === "undefined") return inMemoryAuditLogs;
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_AUDIT_KEY);
    return raw ? JSON.parse(raw) : inMemoryAuditLogs;
  } catch {
    return inMemoryAuditLogs;
  }
}

export function saveLocalAuditLogs(logs: WorkspaceAuditLog[]) {
  inMemoryAuditLogs = logs;
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LOCAL_STORAGE_AUDIT_KEY, JSON.stringify(logs));
  } catch (e) {
    console.warn("Failed to save local workspace audit logs", e);
  }
}

export async function logWorkspaceAudit(
  entry: Omit<WorkspaceAuditLog, "id" | "created_at">
): Promise<void> {
  const newLog: WorkspaceAuditLog = {
    id: `waudit-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    ...entry,
    created_at: new Date().toISOString(),
  };

  const current = getLocalAuditLogs();
  current.unshift(newLog);
  saveLocalAuditLogs(current);

  const supabase = createClient();
  try {
    await supabase.from("workspace_audit_logs").insert(newLog);
  } catch {
    // Local fallback preserved
  }
}

export async function getWorkspaceAuditLogs(workspaceId?: string): Promise<WorkspaceAuditLog[]> {
  const supabase = createClient();
  try {
    let query = supabase.from("workspace_audit_logs").select("*").order("created_at", { ascending: false });
    if (workspaceId) {
      query = query.eq("workspace_id", workspaceId);
    }
    const { data, error } = await query;
    if (!error && data && data.length > 0) {
      return data as WorkspaceAuditLog[];
    }
  } catch {}

  const local = getLocalAuditLogs();
  if (workspaceId) {
    return local.filter((l) => l.workspace_id === workspaceId);
  }
  return local;
}

/**
 * Checks financial and business record counts for safe deletion protection.
 */
export async function checkWorkspaceFinancialRecords(
  workspaceId: string
): Promise<FinancialRecordCounts> {
  let invoices = 0;
  let payments = 0;
  let expenses = 0;
  let purchases = 0;
  let ledger_entries = 0;
  let customers = 0;
  let job_cards = 0;

  let inventory_items = 0;

  if (typeof window !== "undefined") {
    try {
      const rawInvoices = localStorage.getItem("atiq_local_invoices");
      if (rawInvoices) invoices = JSON.parse(rawInvoices).filter((i: any) => i.workspace_id === workspaceId).length;

      const rawPayments = localStorage.getItem("atiq_local_payments");
      if (rawPayments) payments = JSON.parse(rawPayments).filter((p: any) => p.workspace_id === workspaceId).length;

      const rawExpenses = localStorage.getItem("atiq_local_expenses");
      if (rawExpenses) expenses = JSON.parse(rawExpenses).filter((e: any) => e.workspace_id === workspaceId).length;

      const rawPurchases = localStorage.getItem("atiq_local_purchases");
      if (rawPurchases) purchases = JSON.parse(rawPurchases).filter((p: any) => p.workspace_id === workspaceId).length;

      const rawLedger = localStorage.getItem("atiq_local_ledger_transactions");
      if (rawLedger) ledger_entries = JSON.parse(rawLedger).filter((l: any) => l.workspace_id === workspaceId).length;

      const rawCustomers = localStorage.getItem("atiq_local_customers");
      if (rawCustomers) customers = JSON.parse(rawCustomers).filter((c: any) => c.workspace_id === workspaceId).length;

      const rawJobCards = localStorage.getItem("atiq_local_job_cards");
      if (rawJobCards) job_cards = JSON.parse(rawJobCards).filter((j: any) => j.workspace_id === workspaceId).length;

      const rawInventory = localStorage.getItem("atiq_local_inventory") || localStorage.getItem("atiq_local_parts");
      if (rawInventory) inventory_items = JSON.parse(rawInventory).filter((item: any) => item.workspace_id === workspaceId).length;
    } catch {}
  }

  const supabase = createClient();
  try {
    const [invR, payR, expR, custR, jcR, itemsR] = await Promise.all([
      supabase.from("invoices").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId),
      supabase.from("payments").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId),
      supabase.from("expenses").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId),
      supabase.from("customers").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId),
      supabase.from("job_cards").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId),
      supabase.from("inventory_items").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId),
    ]);
    if (typeof invR.count === "number") invoices = Math.max(invoices, invR.count);
    if (typeof payR.count === "number") payments = Math.max(payments, payR.count);
    if (typeof expR.count === "number") expenses = Math.max(expenses, expR.count);
    if (typeof custR.count === "number") customers = Math.max(customers, custR.count);
    if (typeof jcR.count === "number") job_cards = Math.max(job_cards, jcR.count);
    if (typeof itemsR.count === "number") inventory_items = Math.max(inventory_items, itemsR.count);
  } catch {}

  const has_records = invoices > 0 || payments > 0 || expenses > 0 || purchases > 0 || ledger_entries > 0 || customers > 0 || job_cards > 0 || inventory_items > 0;

  return {
    invoices,
    payments,
    expenses,
    purchases,
    ledger_entries,
    customers,
    job_cards,
    inventory_items,
    has_records,
  };
}

/**
 * Archives a workspace (Disables logins/access, hides from normal operation, 100% preserves data).
 */
export async function archiveWorkspace(
  workspaceId: string,
  performedBy: string
): Promise<{ success: boolean; error?: string }> {
  if (workspaceId === DEFAULT_WORKSPACE_ID) {
    return {
      success: false,
      error: "The primary platform workspace (ATIQ JEHAN) cannot be archived.",
    };
  }

  const res = await updateWorkspace(workspaceId, { status: "archived" });
  if (res.success) {
    await logWorkspaceAudit({
      workspace_id: workspaceId,
      action: "WORKSPACE_ARCHIVED",
      performed_by: performedBy,
      details: { timestamp: new Date().toISOString() },
    });
  }
  return res;
}

/**
 * Restores an archived workspace back to active status.
 */
export async function restoreWorkspace(
  workspaceId: string,
  performedBy: string
): Promise<{ success: boolean; error?: string }> {
  const res = await updateWorkspace(workspaceId, { status: "active" });
  if (res.success) {
    await logWorkspaceAudit({
      workspace_id: workspaceId,
      action: "WORKSPACE_RESTORED",
      performed_by: performedBy,
      details: { timestamp: new Date().toISOString() },
    });
  }
  return res;
}

/**
 * Suspends an entire workspace (disables operational access).
 */
export async function suspendWorkspace(
  workspaceId: string,
  performedBy: string
): Promise<{ success: boolean; error?: string }> {
  if (workspaceId === DEFAULT_WORKSPACE_ID) {
    return {
      success: false,
      error: "The primary headquarters workspace is protected and cannot be suspended.",
    };
  }
  const res = await updateWorkspace(workspaceId, { status: "suspended" });
  if (res.success) {
    await logWorkspaceAudit({
      workspace_id: workspaceId,
      action: "WORKSPACE_STATUS_CHANGED",
      performed_by: performedBy,
      details: { new_status: "suspended", timestamp: new Date().toISOString() },
    });
  }
  return res;
}

/**
 * Reactivates a suspended workspace back to active status.
 */
export async function reactivateWorkspace(
  workspaceId: string,
  performedBy: string
): Promise<{ success: boolean; error?: string }> {
  const res = await updateWorkspace(workspaceId, { status: "active" });
  if (res.success) {
    await logWorkspaceAudit({
      workspace_id: workspaceId,
      action: "WORKSPACE_STATUS_CHANGED",
      performed_by: performedBy,
      details: { new_status: "active", timestamp: new Date().toISOString() },
    });
  }
  return res;
}


/**
 * Permanently deletes a workspace after strict safety checks and name verification.
 * Accepts either (workspaceId, confirmationName, performedBy) or (workspaceId, performedBy, confirmationName).
 */
export async function deleteWorkspace(
  workspaceId: string,
  arg2: string,
  arg3?: string
): Promise<{ success: boolean; error?: string }> {
  if (workspaceId === DEFAULT_WORKSPACE_ID) {
    return {
      success: false,
      error: "The primary default headquarters workspace is protected and cannot be deleted.",
    };
  }

  const local = getLocalWorkspaces();
  const target = local.find((w) => w.id === workspaceId);
  if (!target) {
    return { success: false, error: "Workspace not found." };
  }

  // Determine which is confirmationName and which is performedBy
  let confirmationName = arg2;
  let performedBy = arg3 || "Primary Owner";

  if (arg3 && arg3.trim().toLowerCase() === target.name.trim().toLowerCase()) {
    confirmationName = arg3;
    performedBy = arg2;
  }

  if (target.name.trim().toLowerCase() !== confirmationName.trim().toLowerCase()) {
    return {
      success: false,
      error: `Confirmation mismatch. You typed "${confirmationName}", but workspace name is "${target.name}".`,
    };
  }

  // Log audit before removal
  await logWorkspaceAudit({
    workspace_id: workspaceId,
    action: "WORKSPACE_DELETED",
    performed_by: performedBy,
    details: { workspace_name: target.name, deleted_at: new Date().toISOString() },
  });

  // Remove from local stores
  const updatedWorkspaces = local.filter((w) => w.id !== workspaceId);
  saveLocalWorkspaces(updatedWorkspaces);

  const members = getLocalMembers().filter((m) => m.workspace_id !== workspaceId);
  saveLocalMembers(members);

  // If active workspace was deleted, reset to primary default
  if (typeof window !== "undefined" && localStorage.getItem(WORKSPACE_STORAGE_KEY) === workspaceId) {
    localStorage.setItem(WORKSPACE_STORAGE_KEY, DEFAULT_WORKSPACE_ID);
  }

  // Remove from Supabase
  const supabase = createClient();
  try {
    await supabase.from("workspace_members").delete().eq("workspace_id", workspaceId);
    await supabase.from("workspaces").delete().eq("id", workspaceId);
  } catch {}

  return { success: true };
}

function findMemberForEmail(
  members: WorkspaceMember[],
  workspaceId: string,
  userEmail: string
): WorkspaceMember | undefined {
  const cleanEmail = userEmail.trim().toLowerCase();
  const workspaces = getLocalWorkspaces();
  const ws = workspaces.find((w) => w.id === workspaceId);

  // Check if there is a user matching this email
  let matchedUserId: string | undefined = undefined;
  try {
    const users = getLocalUsers();
    const u = users.find((user) => user.email && user.email.toLowerCase() === cleanEmail);
    if (u) matchedUserId = u.id;
  } catch {}

  return members.find(
    (m) =>
      m.workspace_id === workspaceId &&
      (m.user_id.toLowerCase() === cleanEmail ||
        (matchedUserId && m.user_id === matchedUserId) ||
        (ws && ws.owner_user_id === m.user_id && (ws.owner_email?.toLowerCase() === cleanEmail || ws.email?.toLowerCase() === cleanEmail)) ||
        m.user?.email?.toLowerCase() === cleanEmail)
  );
}

/**
 * Suspends an owner's access to a specific workspace.
 */
export async function suspendWorkspaceOwner(
  workspaceId: string,
  userEmail: string,
  performedBy: string
): Promise<{ success: boolean; error?: string }> {
  const cleanEmail = userEmail.trim().toLowerCase();
  const members = getLocalMembers();
  const target = findMemberForEmail(members, workspaceId, cleanEmail);

  if (target) {
    target.status = "suspended";
    saveLocalMembers(members);
  }

  const supabase = createClient();
  try {
    await supabase
      .from("workspace_members")
      .update({ status: "suspended" })
      .eq("workspace_id", workspaceId)
      .eq("user_id", target?.user_id || cleanEmail);
  } catch {}

  await logWorkspaceAudit({
    workspace_id: workspaceId,
    action: "ACCESS_SUSPENDED",
    performed_by: performedBy,
    target_user: cleanEmail,
  });

  return { success: true };
}

/**
 * Restores an owner's suspended access.
 */
export async function restoreWorkspaceOwner(
  workspaceId: string,
  userEmail: string,
  performedBy: string
): Promise<{ success: boolean; error?: string }> {
  const cleanEmail = userEmail.trim().toLowerCase();
  const members = getLocalMembers();
  const target = findMemberForEmail(members, workspaceId, cleanEmail);

  if (target) {
    target.status = "active";
    saveLocalMembers(members);
  }

  const supabase = createClient();
  try {
    await supabase
      .from("workspace_members")
      .update({ status: "active" })
      .eq("workspace_id", workspaceId)
      .eq("user_id", target?.user_id || cleanEmail);
  } catch {}

  await logWorkspaceAudit({
    workspace_id: workspaceId,
    action: "ACCESS_RESTORED",
    performed_by: performedBy,
    target_user: cleanEmail,
  });

  return { success: true };
}

/**
 * Removes an owner from a workspace (sets status: 'removed', unassigns owner, preserves all workspace data).
 */
export async function removeWorkspaceOwner(
  workspaceId: string,
  userEmail: string,
  performedBy: string
): Promise<{ success: boolean; error?: string }> {
  if (workspaceId === DEFAULT_WORKSPACE_ID && userEmail.toLowerCase() === PRIMARY_OWNER_EMAIL.toLowerCase()) {
    return {
      success: false,
      error: "The Primary Platform Owner cannot be removed from the headquarters workspace.",
    };
  }

  const cleanEmail = userEmail.trim().toLowerCase();
  const now = new Date().toISOString();

  // 1. Update membership to 'removed'
  const members = getLocalMembers();
  const target = findMemberForEmail(members, workspaceId, cleanEmail);

  if (target) {
    target.status = "removed";
    target.removed_at = now;
    saveLocalMembers(members);
  }

  // 2. Unassign owner in workspace record
  const workspaces = getLocalWorkspaces();
  const ws = workspaces.find((w) => w.id === workspaceId);
  if (ws && (ws.owner_email?.toLowerCase() === cleanEmail || ws.email?.toLowerCase() === cleanEmail)) {
    ws.owner_user_id = null;
    ws.owner_name = "Unassigned";
    ws.owner_email = null;
    ws.updated_at = now;
    saveLocalWorkspaces(workspaces);
  }

  // 3. Update Supabase
  const supabase = createClient();
  try {
    await supabase
      .from("workspace_members")
      .update({ status: "removed", removed_at: now })
      .eq("workspace_id", workspaceId)
      .eq("user_id", cleanEmail);

    await supabase
      .from("workspaces")
      .update({
        owner_user_id: null,
        owner_name: "Unassigned",
        owner_email: null,
        updated_at: now,
      })
      .eq("id", workspaceId);
  } catch {}

  await logWorkspaceAudit({
    workspace_id: workspaceId,
    action: "OWNER_REMOVED",
    performed_by: performedBy,
    target_user: cleanEmail,
    details: { preserved_data: true, removed_at: now },
  });

  return { success: true };
}

/**
 * Replaces the workspace owner with a new user.
 */
export async function replaceWorkspaceOwner(
  workspaceId: string,
  newOwner: { full_name: string; email: string; role?: UserRole },
  performedBy: string
): Promise<{ success: boolean; error?: string }> {
  const cleanEmail = newOwner.email.trim().toLowerCase();
  const cleanName = newOwner.full_name.trim();
  const role: UserRole = newOwner.role || "owner";
  const now = new Date().toISOString();

  // 1. Update workspace record
  const workspaces = getLocalWorkspaces();
  const ws = workspaces.find((w) => w.id === workspaceId);
  if (ws) {
    ws.owner_name = cleanName;
    ws.owner_email = cleanEmail;
    ws.updated_at = now;
    saveLocalWorkspaces(workspaces);
  }

  // 2. Upsert membership
  const members = getLocalMembers();
  const existingMem = members.find(
    (m) => m.workspace_id === workspaceId && m.user_id.toLowerCase() === cleanEmail
  );

  if (existingMem) {
    existingMem.role = role;
    existingMem.status = "active";
    existingMem.is_workspace_owner = true;
    existingMem.removed_at = null;
  } else {
    members.push({
      id: `wm-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      workspace_id: workspaceId,
      user_id: cleanEmail,
      role,
      status: "active",
      is_workspace_owner: true,
      joined_at: now,
    });
  }
  saveLocalMembers(members);

  const supabase = createClient();
  try {
    await supabase
      .from("workspaces")
      .update({
        owner_name: cleanName,
        owner_email: cleanEmail,
        updated_at: now,
      })
      .eq("id", workspaceId);

    await supabase.from("workspace_members").upsert({
      id: `wm-${workspaceId.slice(0, 8)}-${cleanEmail.replace(/[^a-z0-9]/g, "")}`,
      workspace_id: workspaceId,
      user_id: cleanEmail,
      role,
      status: "active",
      is_workspace_owner: true,
      joined_at: now,
    });
  } catch {}

  await logWorkspaceAudit({
    workspace_id: workspaceId,
    action: "OWNER_REPLACED",
    performed_by: performedBy,
    target_user: cleanEmail,
    details: { new_owner_name: cleanName },
  });

  return { success: true };
}

/**
 * Fetches all members of a specific workspace.
 */
export async function getWorkspaceMembers(workspaceId: string): Promise<WorkspaceMember[]> {
  const supabase = createClient();
  try {
    const { data, error } = await supabase
      .from("workspace_members")
      .select("*")
      .eq("workspace_id", workspaceId);
    if (!error && data && data.length > 0) {
      return data as WorkspaceMember[];
    }
  } catch {}

  return getLocalMembers().filter((m) => m.workspace_id === workspaceId);
}

/**
 * Removes a user's access from a specific workspace (marks membership status: 'removed').
 * Preserves all historical records (job cards, invoices, audit logs) created by the user.
 * If the user belongs to another workspace, their access in the other workspace remains unaffected.
 */
export async function removeWorkspaceUser(
  workspaceId: string,
  userIdOrEmail: string,
  performedBy: string
): Promise<{ success: boolean; error?: string }> {
  const cleanIdOrEmail = userIdOrEmail.trim().toLowerCase();

  // Primary Owner Lockout Protection
  if (
    workspaceId === DEFAULT_WORKSPACE_ID &&
    (cleanIdOrEmail === PRIMARY_OWNER_EMAIL.toLowerCase() || cleanIdOrEmail === "usr-owner-001")
  ) {
    return {
      success: false,
      error: "The Primary Platform Owner cannot be removed from the headquarters workspace.",
    };
  }

  const now = new Date().toISOString();
  const members = getLocalMembers();
  const target = findMemberForEmail(members, workspaceId, cleanIdOrEmail);

  if (target) {
    target.status = "removed";
    target.removed_at = now;
    target.removed_by = performedBy;
    saveLocalMembers(members);
  } else {
    // If not found in local members, register as removed
    members.push({
      id: `wm-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      workspace_id: workspaceId,
      user_id: cleanIdOrEmail,
      role: "viewer",
      status: "removed",
      joined_at: now,
      removed_at: now,
      removed_by: performedBy,
    });
    saveLocalMembers(members);
  }

  // If this user was the assigned workspace owner, unassign them
  const workspaces = getLocalWorkspaces();
  const ws = workspaces.find((w) => w.id === workspaceId);
  if (ws) {
    if (
      ws.owner_user_id === target?.user_id ||
      ws.owner_email?.toLowerCase() === cleanIdOrEmail ||
      ws.email?.toLowerCase() === cleanIdOrEmail
    ) {
      ws.owner_user_id = null;
      ws.owner_name = "Unassigned";
      ws.owner_email = null;
      ws.updated_at = now;
    }
    const activeCount = members.filter(
      (m) => m.workspace_id === workspaceId && m.status === "active"
    ).length;
    ws.users_count = Math.max(1, activeCount);
    saveLocalWorkspaces(workspaces);
  }

  // Remove workspace permissions
  try {
    const { getLocalPermissionsMap, saveLocalPermissionsMap } = await import("./user-service");
    const { getEmptyPermissions } = await import("@/lib/constants");
    const perms = getLocalPermissionsMap();
    if (target?.user_id) {
      perms[target.user_id] = getEmptyPermissions();
    }
    if (cleanIdOrEmail) {
      perms[cleanIdOrEmail] = getEmptyPermissions();
    }
    saveLocalPermissionsMap(perms);
  } catch {}

  // Sync to Supabase
  const supabase = createClient();
  try {
    await supabase
      .from("workspace_members")
      .update({
        status: "removed",
        removed_at: now,
        removed_by: performedBy,
      })
      .eq("workspace_id", workspaceId)
      .eq("user_id", target?.user_id || cleanIdOrEmail);

    if (target?.user_id) {
      await supabase.from("user_permissions").delete().eq("user_id", target.user_id);
    }
  } catch {}

  await logWorkspaceAudit({
    workspace_id: workspaceId,
    action: "USER_ACCESS_REMOVED",
    performed_by: performedBy,
    target_user: cleanIdOrEmail,
    details: { removed_at: now, workspace_id: workspaceId },
  });

  return { success: true };
}

/**
 * Restores a user's removed or suspended access to a workspace.
 */
export async function restoreWorkspaceUser(
  workspaceId: string,
  userIdOrEmail: string,
  performedBy: string
): Promise<{ success: boolean; error?: string }> {
  const cleanIdOrEmail = userIdOrEmail.trim().toLowerCase();
  const members = getLocalMembers();
  const target = findMemberForEmail(members, workspaceId, cleanIdOrEmail);

  if (target) {
    target.status = "active";
    target.removed_at = null;
    target.removed_by = null;
    saveLocalMembers(members);
  }

  const workspaces = getLocalWorkspaces();
  const ws = workspaces.find((w) => w.id === workspaceId);
  if (ws) {
    const activeCount = members.filter(
      (m) => m.workspace_id === workspaceId && m.status === "active"
    ).length;
    ws.users_count = activeCount;
    saveLocalWorkspaces(workspaces);
  }

  const supabase = createClient();
  try {
    await supabase
      .from("workspace_members")
      .update({
        status: "active",
        removed_at: null,
        removed_by: null,
      })
      .eq("workspace_id", workspaceId)
      .eq("user_id", target?.user_id || cleanIdOrEmail);
  } catch {}

  await logWorkspaceAudit({
    workspace_id: workspaceId,
    action: "USER_RESTORED",
    performed_by: performedBy,
    target_user: cleanIdOrEmail,
  });

  return { success: true };
}

export async function addWorkspaceMember(
  workspaceId: string,
  memberData: {
    user_id: string;
    workspace_id: string;
    role: UserRole;
    status?: "active" | "invited" | "suspended" | "removed";
    is_workspace_owner?: boolean;
  }
): Promise<{ success: boolean; member?: WorkspaceMember; error?: string }> {
  const newMember: WorkspaceMember = {
    id: `wm-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    workspace_id: workspaceId,
    user_id: memberData.user_id,
    role: memberData.role,
    status: memberData.status || "active",
    is_workspace_owner: memberData.is_workspace_owner || false,
    joined_at: new Date().toISOString(),
  };

  const members = getLocalMembers();
  const existingIdx = members.findIndex(
    (m) => m.workspace_id === workspaceId && m.user_id === memberData.user_id
  );
  if (existingIdx >= 0) {
    members[existingIdx] = { ...members[existingIdx], ...newMember };
  } else {
    members.push(newMember);
  }
  saveLocalMembers(members);

  const supabase = createClient();
  try {
    await supabase.from("workspace_members").insert(newMember);
  } catch {}

  return { success: true, member: newMember };
}
