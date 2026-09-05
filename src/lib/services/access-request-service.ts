/**
 * Access Request Service
 * Handles user requests when encountering restricted modules or actions,
 * allowing Owners to approve with automatic permission provisioning or reject with feedback.
 */

import { createClient } from "@/lib/supabase/client";
import { getActiveWorkspaceId } from "./workspace-service";
import { DEFAULT_WORKSPACE_ID } from "@/lib/constants";
import { getUserPermissions, saveUserPermissions } from "./user-service";
import type { AccessRequest, AccessRequestStatus, AppModule } from "@/types/database";

const LOCAL_STORAGE_ACCESS_REQ_KEY = "atiq_access_requests";

let inMemoryAccessRequests: AccessRequest[] = [];

export function getLocalAccessRequests(workspaceId?: string): AccessRequest[] {
  const targetWsId = workspaceId || getActiveWorkspaceId();
  let all: AccessRequest[] = [];
  if (typeof window === "undefined") {
    all = inMemoryAccessRequests;
  } else {
    try {
      const raw = localStorage.getItem(LOCAL_STORAGE_ACCESS_REQ_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) all = parsed;
      }
    } catch {}
    if (all.length === 0) all = inMemoryAccessRequests;
  }
  return all.filter(
    (r) => r.workspace_id === targetWsId || (!r.workspace_id && targetWsId === DEFAULT_WORKSPACE_ID)
  );
}

export function saveLocalAccessRequests(requests: AccessRequest[], workspaceId?: string) {
  const targetWsId = workspaceId || getActiveWorkspaceId();
  let allExisting: AccessRequest[] = [];
  if (typeof window !== "undefined") {
    try {
      const raw = localStorage.getItem(LOCAL_STORAGE_ACCESS_REQ_KEY);
      if (raw) allExisting = JSON.parse(raw);
    } catch {}
  }
  if (allExisting.length === 0) allExisting = inMemoryAccessRequests;
  const others = allExisting.filter((r) => r.workspace_id && r.workspace_id !== targetWsId);
  const tagged = requests.map((r) => ({ ...r, workspace_id: r.workspace_id || targetWsId }));
  const merged = [...tagged, ...others];
  inMemoryAccessRequests = merged;
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(LOCAL_STORAGE_ACCESS_REQ_KEY, JSON.stringify(merged));
    } catch (e) {
      console.error("Failed to save local access requests", e);
    }
  }
}

function withTimeout<T>(promise: PromiseLike<T>, ms = 2000): Promise<T> {
  return Promise.race([
    Promise.resolve(promise),
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("Access request timeout")), ms)),
  ]);
}

export async function getAccessRequests(
  workspaceId?: string,
  status?: AccessRequestStatus
): Promise<AccessRequest[]> {
  const targetWsId = workspaceId || getActiveWorkspaceId();
  const supabase = createClient();

  try {
    const fetchFn = async () => {
      let query = supabase
        .from("access_requests")
        .select("*")
        .eq("workspace_id", targetWsId)
        .order("created_at", { ascending: false });

      if (status) {
        query = query.eq("status", status);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as AccessRequest[];
    };

    const requests = await withTimeout(fetchFn(), 2000);
    saveLocalAccessRequests(requests, targetWsId);
    return requests;
  } catch (err) {
    let list = getLocalAccessRequests(targetWsId);
    if (status) {
      list = list.filter((r) => r.status === status);
    }
    return list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }
}

export async function createAccessRequest(payload: {
  user_id: string;
  user_name: string;
  user_email: string;
  requested_module: AppModule;
  requested_action: string;
  reason?: string;
  workspace_id?: string;
}): Promise<{ success: boolean; request?: AccessRequest; error?: string }> {
  const targetWsId = payload.workspace_id || getActiveWorkspaceId();
  const supabase = createClient();
  const now = new Date().toISOString();

  // Check if a pending request already exists for this user and module
  const existing = getLocalAccessRequests(targetWsId).find(
    (r) =>
      r.user_id === payload.user_id &&
      r.requested_module === payload.requested_module &&
      r.status === "pending"
  );
  if (existing) {
    return {
      success: true,
      request: existing,
      error: "You already have a pending access request for this module. The Owner has been notified.",
    };
  }

  const newReq: AccessRequest = {
    id: `accreq-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    workspace_id: targetWsId,
    user_id: payload.user_id,
    user_name: payload.user_name,
    user_email: payload.user_email,
    requested_module: payload.requested_module,
    requested_action: payload.requested_action || "view",
    reason: payload.reason || "Staff requested access to this module.",
    status: "pending",
    reviewed_by: null,
    reviewed_at: null,
    rejection_reason: null,
    created_at: now,
    updated_at: now,
  };

  try {
    const fetchFn = async () => {
      const { data, error } = await supabase
        .from("access_requests")
        .insert(newReq)
        .select()
        .single();
      if (error) throw error;
      return data as AccessRequest;
    };

    const created = await withTimeout(fetchFn(), 2000);
    const list = getLocalAccessRequests(targetWsId);
    list.unshift(created);
    saveLocalAccessRequests(list, targetWsId);
    return { success: true, request: created };
  } catch (err: any) {
    const list = getLocalAccessRequests(targetWsId);
    list.unshift(newReq);
    saveLocalAccessRequests(list, targetWsId);
    return { success: true, request: newReq };
  }
}

export async function approveAccessRequest(
  requestId: string,
  operator: { id: string; name: string }
): Promise<{ success: boolean; request?: AccessRequest; error?: string }> {
  const targetWsId = getActiveWorkspaceId();
  const supabase = createClient();
  const now = new Date().toISOString();

  const list = getLocalAccessRequests(targetWsId);
  const targetReq = list.find((r) => r.id === requestId);
  if (!targetReq) {
    return { success: false, error: "Access request not found." };
  }

  // Provision the requested permission for the user
  try {
    const currentPerms = await getUserPermissions(targetReq.user_id);
    const mod = targetReq.requested_module;
    const existingModPerm = currentPerms[mod] || {
      module: mod,
      access: false,
      can_view: false,
      can_create: false,
      can_edit: false,
      can_delete: false,
      can_print: false,
      can_export: false,
    };

    existingModPerm.access = true;
    existingModPerm.can_view = true;
    if (targetReq.requested_action === "create") existingModPerm.can_create = true;
    if (targetReq.requested_action === "edit") existingModPerm.can_edit = true;
    if (targetReq.requested_action === "delete") existingModPerm.can_delete = true;

    currentPerms[mod] = existingModPerm;
    await saveUserPermissions(targetReq.user_id, currentPerms, operator, `Approved Access Request #${requestId}`);
  } catch (provisionErr) {
    console.warn("Auto-provisioning permission on request approval notice:", provisionErr);
  }

  try {
    const fetchFn = async () => {
      const { data, error } = await supabase
        .from("access_requests")
        .update({
          status: "approved",
          reviewed_by: operator.name,
          reviewed_at: now,
          updated_at: now,
        })
        .eq("id", requestId)
        .select()
        .single();
      if (error) throw error;
      return data as AccessRequest;
    };

    const updated = await withTimeout(fetchFn(), 2000);
    const idx = list.findIndex((r) => r.id === requestId);
    if (idx !== -1) {
      list[idx] = updated;
      saveLocalAccessRequests(list, targetWsId);
    }
    return { success: true, request: updated };
  } catch (err: any) {
    const idx = list.findIndex((r) => r.id === requestId);
    if (idx !== -1) {
      list[idx] = {
        ...list[idx],
        status: "approved",
        reviewed_by: operator.name,
        reviewed_at: now,
        updated_at: now,
      };
      saveLocalAccessRequests(list, targetWsId);
      return { success: true, request: list[idx] };
    }
    return { success: false, error: "Access request not found." };
  }
}

export async function rejectAccessRequest(
  requestId: string,
  operator: { id: string; name: string },
  reason?: string
): Promise<{ success: boolean; request?: AccessRequest; error?: string }> {
  const targetWsId = getActiveWorkspaceId();
  const supabase = createClient();
  const now = new Date().toISOString();

  try {
    const fetchFn = async () => {
      const { data, error } = await supabase
        .from("access_requests")
        .update({
          status: "rejected",
          reviewed_by: operator.name,
          reviewed_at: now,
          rejection_reason: reason || "Access request declined by owner.",
          updated_at: now,
        })
        .eq("id", requestId)
        .select()
        .single();
      if (error) throw error;
      return data as AccessRequest;
    };

    const updated = await withTimeout(fetchFn(), 2000);
    const list = getLocalAccessRequests(targetWsId);
    const idx = list.findIndex((r) => r.id === requestId);
    if (idx !== -1) {
      list[idx] = updated;
      saveLocalAccessRequests(list, targetWsId);
    }
    return { success: true, request: updated };
  } catch (err: any) {
    const list = getLocalAccessRequests(targetWsId);
    const idx = list.findIndex((r) => r.id === requestId);
    if (idx !== -1) {
      list[idx] = {
        ...list[idx],
        status: "rejected",
        reviewed_by: operator.name,
        reviewed_at: now,
        rejection_reason: reason || "Access request declined by owner.",
        updated_at: now,
      };
      saveLocalAccessRequests(list, targetWsId);
      return { success: true, request: list[idx] };
    }
    return { success: false, error: "Access request not found." };
  }
}
