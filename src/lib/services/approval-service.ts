/**
 * Approval Service
 * Manages high-risk financial and operational transaction approval requests.
 * Supports pending queue, approval, and rejection with full audit trail.
 */

import { createClient } from "@/lib/supabase/client";
import { getActiveWorkspaceId } from "./workspace-service";
import { DEFAULT_WORKSPACE_ID } from "@/lib/constants";
import type { ApprovalRequest, ApprovalRequestStatus, ApprovalRequestType } from "@/types/database";

const LOCAL_STORAGE_APPROVALS_KEY = "atiq_approval_requests";

let inMemoryApprovalRequests: ApprovalRequest[] = [];

export function getLocalApprovalRequests(workspaceId?: string): ApprovalRequest[] {
  const targetWsId = workspaceId || getActiveWorkspaceId();
  let all: ApprovalRequest[] = [];
  if (typeof window === "undefined") {
    all = inMemoryApprovalRequests;
  } else {
    try {
      const raw = localStorage.getItem(LOCAL_STORAGE_APPROVALS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) all = parsed;
      }
    } catch {}
    if (all.length === 0) all = inMemoryApprovalRequests;
  }
  return all.filter(
    (r) => r.workspace_id === targetWsId || (!r.workspace_id && targetWsId === DEFAULT_WORKSPACE_ID)
  );
}

export function saveLocalApprovalRequests(requests: ApprovalRequest[], workspaceId?: string) {
  const targetWsId = workspaceId || getActiveWorkspaceId();
  let allExisting: ApprovalRequest[] = [];
  if (typeof window !== "undefined") {
    try {
      const raw = localStorage.getItem(LOCAL_STORAGE_APPROVALS_KEY);
      if (raw) allExisting = JSON.parse(raw);
    } catch {}
  }
  if (allExisting.length === 0) allExisting = inMemoryApprovalRequests;
  const others = allExisting.filter((r) => r.workspace_id && r.workspace_id !== targetWsId);
  const tagged = requests.map((r) => ({ ...r, workspace_id: r.workspace_id || targetWsId }));
  const merged = [...tagged, ...others];
  inMemoryApprovalRequests = merged;
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(LOCAL_STORAGE_APPROVALS_KEY, JSON.stringify(merged));
    } catch (e) {
      console.error("Failed to save local approval requests", e);
    }
  }
}

function withTimeout<T>(promise: PromiseLike<T>, ms = 2000): Promise<T> {
  return Promise.race([
    Promise.resolve(promise),
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("Approval query timeout")), ms)),
  ]);
}

/**
 * Fetch approval requests for workspace
 */
export async function getApprovalRequests(
  workspaceId?: string,
  status?: ApprovalRequestStatus
): Promise<ApprovalRequest[]> {
  const targetWsId = workspaceId || getActiveWorkspaceId();
  const supabase = createClient();

  try {
    const fetchFn = async () => {
      let query = supabase
        .from("approval_requests")
        .select("*")
        .eq("workspace_id", targetWsId)
        .order("created_at", { ascending: false });

      if (status) {
        query = query.eq("status", status);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as ApprovalRequest[];
    };

    const requests = await withTimeout(fetchFn(), 2000);
    saveLocalApprovalRequests(requests, targetWsId);
    return requests;
  } catch (err) {
    let list = getLocalApprovalRequests(targetWsId);
    if (status) {
      list = list.filter((r) => r.status === status);
    }
    return list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }
}

/**
 * Create a new approval request when a user attempts an action exceeding their authorized limit
 */
export async function createApprovalRequest(
  payload: {
    workspace_id?: string;
    user_id: string;
    user_name: string;
    request_type: ApprovalRequestType;
    amount?: number | null;
    currency?: string;
    details: Record<string, any>;
  }
): Promise<{ success: boolean; request?: ApprovalRequest; error?: string }> {
  const targetWsId = payload.workspace_id || getActiveWorkspaceId();
  const supabase = createClient();
  const now = new Date().toISOString();

  const newReq: ApprovalRequest = {
    id: `appr-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    workspace_id: targetWsId,
    user_id: payload.user_id,
    user_name: payload.user_name,
    request_type: payload.request_type,
    amount: payload.amount !== undefined ? payload.amount : null,
    currency: payload.currency || "AED",
    details: payload.details || {},
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
        .from("approval_requests")
        .insert(newReq)
        .select()
        .single();
      if (error) throw error;
      return data as ApprovalRequest;
    };

    const created = await withTimeout(fetchFn(), 2000);
    const list = getLocalApprovalRequests(targetWsId);
    list.unshift(created);
    saveLocalApprovalRequests(list, targetWsId);
    return { success: true, request: created };
  } catch (err: any) {
    const list = getLocalApprovalRequests(targetWsId);
    list.unshift(newReq);
    saveLocalApprovalRequests(list, targetWsId);
    return { success: true, request: newReq };
  }
}

/**
 * Approve a transaction request
 */
export async function approveRequest(
  requestId: string,
  operator: { id: string; name: string }
): Promise<{ success: boolean; request?: ApprovalRequest; error?: string }> {
  const targetWsId = getActiveWorkspaceId();
  const supabase = createClient();
  const now = new Date().toISOString();

  try {
    const fetchFn = async () => {
      const { data, error } = await supabase
        .from("approval_requests")
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
      return data as ApprovalRequest;
    };

    const updated = await withTimeout(fetchFn(), 2000);
    const list = getLocalApprovalRequests(targetWsId);
    const idx = list.findIndex((r) => r.id === requestId);
    if (idx !== -1) {
      list[idx] = updated;
      saveLocalApprovalRequests(list, targetWsId);
    }
    return { success: true, request: updated };
  } catch (err: any) {
    const list = getLocalApprovalRequests(targetWsId);
    const idx = list.findIndex((r) => r.id === requestId);
    if (idx !== -1) {
      list[idx] = {
        ...list[idx],
        status: "approved",
        reviewed_by: operator.name,
        reviewed_at: now,
        updated_at: now,
      };
      saveLocalApprovalRequests(list, targetWsId);
      return { success: true, request: list[idx] };
    }
    return { success: false, error: "Approval request not found." };
  }
}

/**
 * Reject a transaction request with mandatory reason
 */
export async function rejectRequest(
  requestId: string,
  operator: { id: string; name: string },
  reason?: string
): Promise<{ success: boolean; request?: ApprovalRequest; error?: string }> {
  const targetWsId = getActiveWorkspaceId();
  const supabase = createClient();
  const now = new Date().toISOString();

  try {
    const fetchFn = async () => {
      const { data, error } = await supabase
        .from("approval_requests")
        .update({
          status: "rejected",
          reviewed_by: operator.name,
          reviewed_at: now,
          rejection_reason: reason || "Request rejected by owner.",
          updated_at: now,
        })
        .eq("id", requestId)
        .select()
        .single();
      if (error) throw error;
      return data as ApprovalRequest;
    };

    const updated = await withTimeout(fetchFn(), 2000);
    const list = getLocalApprovalRequests(targetWsId);
    const idx = list.findIndex((r) => r.id === requestId);
    if (idx !== -1) {
      list[idx] = updated;
      saveLocalApprovalRequests(list, targetWsId);
    }
    return { success: true, request: updated };
  } catch (err: any) {
    const list = getLocalApprovalRequests(targetWsId);
    const idx = list.findIndex((r) => r.id === requestId);
    if (idx !== -1) {
      list[idx] = {
        ...list[idx],
        status: "rejected",
        reviewed_by: operator.name,
        reviewed_at: now,
        rejection_reason: reason || "Request rejected by owner.",
        updated_at: now,
      };
      saveLocalApprovalRequests(list, targetWsId);
      return { success: true, request: list[idx] };
    }
    return { success: false, error: "Approval request not found." };
  }
}
