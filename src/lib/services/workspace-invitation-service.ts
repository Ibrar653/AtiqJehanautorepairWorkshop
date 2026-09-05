/**
 * Workspace Invitation & One-Time Code Management Service
 * Handles server-side invitation generation, validation, one-time code verification,
 * and user account activation.
 */

import { createClient } from "@/lib/supabase/client";
import type {
  WorkspaceInvitation,
  WorkspaceInvitationStatus,
  UserRole,
  AppModule,
  UserModulePermission,
  DataAccessScope,
  FinancialVisibilitySettings,
  UserApprovalLimits,
} from "@/types/database";
import { getLocalMembers, saveLocalMembers, getWorkspaces } from "./workspace-service";
import { getLocalUsers, saveLocalUsers, getLocalPermissionsMap, saveLocalPermissionsMap } from "./user-service";

const LOCAL_STORAGE_INVITATIONS_KEY = "atiq_local_workspace_invitations";

let inMemoryInvitations: WorkspaceInvitation[] = [];

export function getLocalWorkspaceInvitations(): WorkspaceInvitation[] {
  if (typeof window === "undefined") return inMemoryInvitations;
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_INVITATIONS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    return inMemoryInvitations;
  } catch {
    return inMemoryInvitations;
  }
}

export function saveLocalWorkspaceInvitations(invs: WorkspaceInvitation[]) {
  inMemoryInvitations = invs;
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LOCAL_STORAGE_INVITATIONS_KEY, JSON.stringify(invs));
  } catch (e) {
    console.error("Failed to save local workspace invitations", e);
  }
}

export interface CreateWorkspaceInvitationInput {
  workspace_id: string;
  workspace_name?: string;
  email: string;
  full_name: string;
  role: UserRole;
  permissions?: Record<AppModule, UserModulePermission> | null;
  data_scope?: DataAccessScope | null;
  financial_visibility?: Partial<FinancialVisibilitySettings> | null;
  approval_limits?: Partial<UserApprovalLimits> | null;
  invited_by?: string;
}

export interface InvitationResult {
  success: boolean;
  error?: string;
  already_exists?: boolean;
  message?: string;
  invitation?: {
    id: string;
    workspace_id: string;
    workspace_name?: string;
    email: string;
    invited_user_name: string;
    role: UserRole;
    one_time_code: string;
    invite_link: string;
    status: WorkspaceInvitationStatus;
    expires_at: string;
    sent_at?: string | null;
    error_message?: string | null;
  };
}

/**
 * Dispatches an invitation for a workspace user via server API with offline fallback.
 */
export async function createWorkspaceInvitation(
  input: CreateWorkspaceInvitationInput
): Promise<InvitationResult> {
  const cleanEmail = input.email.trim().toLowerCase();
  const cleanName = input.full_name.trim();

  try {
    if (typeof window !== "undefined") {
      const res = await fetch("/api/workspaces/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...input,
          email: cleanEmail,
          full_name: cleanName,
        }),
      });
      const data = await res.json();
      if (data.success && data.invitation) {
        // Save to local cache
        const local = getLocalWorkspaceInvitations();
        const fullRecord: WorkspaceInvitation = {
          id: data.invitation.id,
          workspace_id: input.workspace_id,
          email: cleanEmail,
          invited_user_name: cleanName,
          role: input.role,
          token_hash: data.invitation.token_hash || "",
          code_hash: data.invitation.code_hash || "",
          code_plain_preview: `${data.invitation.one_time_code.slice(0, 5)}***`,
          status: data.invitation.status || (data.already_exists ? "accepted" : "sent"),
          expires_at: data.invitation.expires_at,
          invited_by: input.invited_by || "Primary Owner",
          permissions: input.permissions || null,
          data_scope: input.data_scope || "all",
          financial_visibility: input.financial_visibility || null,
          approval_limits: input.approval_limits || null,
          accepted_at: data.already_exists ? new Date().toISOString() : null,
          sent_at: data.invitation.sent_at || new Date().toISOString(),
          error_message: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        const filtered = local.filter((i) => i.id !== fullRecord.id);
        filtered.unshift(fullRecord);
        saveLocalWorkspaceInvitations(filtered);

        return {
          success: true,
          already_exists: data.already_exists,
          message: data.message,
          invitation: data.invitation,
        };
      } else if (!data.success) {
        // Save failed record in local cache if invitation was returned
        if (data.invitation) {
          const local = getLocalWorkspaceInvitations();
          const failedRecord: WorkspaceInvitation = {
            id: data.invitation.id,
            workspace_id: input.workspace_id,
            email: cleanEmail,
            invited_user_name: cleanName,
            role: input.role,
            token_hash: "",
            code_hash: "",
            code_plain_preview: `${(data.invitation.one_time_code || "").slice(0, 5)}***`,
            status: "failed",
            expires_at: data.invitation.expires_at || new Date().toISOString(),
            invited_by: input.invited_by || "Primary Owner",
            permissions: input.permissions || null,
            data_scope: input.data_scope || "all",
            financial_visibility: input.financial_visibility || null,
            approval_limits: input.approval_limits || null,
            accepted_at: null,
            sent_at: null,
            error_message: data.error,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };
          const filtered = local.filter((i) => i.id !== failedRecord.id);
          filtered.unshift(failedRecord);
          saveLocalWorkspaceInvitations(filtered);
        }

        return {
          success: false,
          error: data.error,
          invitation: data.invitation,
        };
      }
    }
  } catch (err: any) {
    console.warn("API invitation call failed, using local generator:", err);
  }

  // Local generator fallback (offline / testing)
  const chars = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  let randomCode = "";
  for (let i = 0; i < 8; i++) {
    randomCode += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  const oneTimeCode = `AJ-${randomCode.slice(0, 4)}-${randomCode.slice(4, 8)}`;
  const rawToken = `tok_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 72 * 3600 * 1000).toISOString();
  const invId = `winv-${Date.now().toString(36)}`;

  // Simulated hash
  const tokenHash = `h_${rawToken}`;
  const codeHash = `h_${oneTimeCode}`;

  const localInv: WorkspaceInvitation = {
    id: invId,
    workspace_id: input.workspace_id,
    email: cleanEmail,
    invited_user_name: cleanName,
    role: input.role,
    token_hash: tokenHash,
    code_hash: codeHash,
    code_plain_preview: `${oneTimeCode.slice(0, 5)}***`,
    status: "pending",
    expires_at: expiresAt,
    invited_by: input.invited_by || "Primary Owner",
    permissions: input.permissions || null,
    data_scope: input.data_scope || "all",
    financial_visibility: input.financial_visibility || null,
    approval_limits: input.approval_limits || null,
    accepted_at: null,
    created_at: now,
    updated_at: now,
  };

  const list = getLocalWorkspaceInvitations().filter((i) => i.id !== invId);
  list.unshift(localInv);
  saveLocalWorkspaceInvitations(list);

  const origin = typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";

  return {
    success: true,
    invitation: {
      id: invId,
      workspace_id: input.workspace_id,
      workspace_name: input.workspace_name,
      email: cleanEmail,
      invited_user_name: cleanName,
      role: input.role,
      one_time_code: oneTimeCode,
      invite_link: `${origin}/auth/accept-invite?token=${rawToken}&local_id=${invId}`,
      status: "pending",
      expires_at: expiresAt,
    },
  };
}

/**
 * Retrieves all workspace invitations, optionally filtered by workspace_id.
 */
export async function getWorkspaceInvitations(
  workspaceId?: string
): Promise<WorkspaceInvitation[]> {
  const supabase = createClient();
  try {
    let query = supabase
      .from("workspace_invitations")
      .select("*, workspace:workspaces(id, name, business_name)")
      .order("created_at", { ascending: false });

    if (workspaceId) {
      query = query.eq("workspace_id", workspaceId);
    }

    const { data, error } = await query;
    if (!error && data && data.length > 0) {
      // Check expiry dynamically
      const now = new Date();
      const updated = data.map((inv: any) => {
        if (inv.status === "pending" && new Date(inv.expires_at) <= now) {
          return { ...inv, status: "expired" as WorkspaceInvitationStatus };
        }
        return inv as WorkspaceInvitation;
      });
      saveLocalWorkspaceInvitations(updated);
      return updated;
    }
  } catch {
    // fallback to local storage
  }

  const local = getLocalWorkspaceInvitations();
  const now = new Date();
  const evaluated = local.map((inv) => {
    if (inv.status === "pending" && new Date(inv.expires_at) <= now) {
      return { ...inv, status: "expired" as WorkspaceInvitationStatus };
    }
    return inv;
  });

  if (workspaceId) {
    return evaluated.filter((i) => i.workspace_id === workspaceId);
  }
  return evaluated;
}

/**
 * Resends an existing workspace invitation, re-invoking server-side Supabase Auth email dispatch.
 */
export async function resendWorkspaceInvitation(
  invitationId: string
): Promise<{ success: boolean; error?: string; message?: string }> {
  try {
    if (typeof window !== "undefined") {
      const res = await fetch("/api/workspaces/resend-invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invitation_id: invitationId }),
      });
      const data = await res.json();
      if (data.success) {
        const all = getLocalWorkspaceInvitations();
        const target = all.find((i) => i.id === invitationId);
        if (target) {
          target.status = "sent";
          target.sent_at = new Date().toISOString();
          if (data.new_expires_at) target.expires_at = data.new_expires_at;
          target.error_message = null;
          target.updated_at = new Date().toISOString();
          saveLocalWorkspaceInvitations(all);
        }
        return { success: true, message: data.message };
      }
      if (data.error) {
        const all = getLocalWorkspaceInvitations();
        const target = all.find((i) => i.id === invitationId);
        if (target) {
          target.status = "failed";
          target.error_message = data.error;
          target.updated_at = new Date().toISOString();
          saveLocalWorkspaceInvitations(all);
        }
        return { success: false, error: data.error };
      }
    }
  } catch (err: any) {
    console.warn("Resend API call error:", err);
  }

  const all = getLocalWorkspaceInvitations();
  const target = all.find((i) => i.id === invitationId);
  if (!target) {
    return { success: false, error: "Invitation not found." };
  }

  const newExpiresAt = new Date(Date.now() + 72 * 3600 * 1000).toISOString();
  target.expires_at = newExpiresAt;
  target.status = "sent";
  target.sent_at = new Date().toISOString();
  target.error_message = null;
  target.updated_at = new Date().toISOString();

  saveLocalWorkspaceInvitations(all);

  const supabase = createClient();
  try {
    await supabase
      .from("workspace_invitations")
      .update({
        expires_at: newExpiresAt,
        status: "sent",
        sent_at: target.sent_at,
        error_message: null,
        updated_at: target.updated_at,
      })
      .eq("id", invitationId);
  } catch {}

  return {
    success: true,
    message: `Invitation resent to ${target.email}. Valid for 72 hours.`,
  };
}

export const retryWorkspaceInvitation = resendWorkspaceInvitation;

/**
 * Regenerates a one-time activation code for an invitation.
 */
export async function regenerateInvitationCode(
  invitationId: string
): Promise<{ success: boolean; new_code?: string; error?: string }> {
  const all = getLocalWorkspaceInvitations();
  const target = all.find((i) => i.id === invitationId);
  if (!target) {
    return { success: false, error: "Invitation not found." };
  }
  if (target.status === "accepted") {
    return { success: false, error: "Cannot regenerate code for an already accepted invitation." };
  }

  const chars = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  let randomCode = "";
  for (let i = 0; i < 8; i++) {
    randomCode += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  const newCode = `AJ-${randomCode.slice(0, 4)}-${randomCode.slice(4, 8)}`;
  const newExpiresAt = new Date(Date.now() + 72 * 3600 * 1000).toISOString();

  target.code_hash = `h_${newCode}`;
  target.code_plain_preview = `${newCode.slice(0, 5)}***`;
  target.expires_at = newExpiresAt;
  target.status = "pending";
  target.updated_at = new Date().toISOString();

  saveLocalWorkspaceInvitations(all);

  const supabase = createClient();
  try {
    await supabase
      .from("workspace_invitations")
      .update({
        code_hash: target.code_hash,
        code_plain_preview: target.code_plain_preview,
        expires_at: newExpiresAt,
        status: "pending",
        updated_at: target.updated_at,
      })
      .eq("id", invitationId);
  } catch {}

  return {
    success: true,
    new_code: newCode,
  };
}

/**
 * Revokes a pending workspace invitation.
 */
export async function revokeWorkspaceInvitation(
  invitationId: string
): Promise<{ success: boolean; error?: string }> {
  const all = getLocalWorkspaceInvitations();
  const target = all.find((i) => i.id === invitationId);
  if (!target) {
    return { success: false, error: "Invitation not found." };
  }

  target.status = "revoked";
  target.updated_at = new Date().toISOString();
  saveLocalWorkspaceInvitations(all);

  const supabase = createClient();
  try {
    await supabase
      .from("workspace_invitations")
      .update({ status: "revoked", updated_at: target.updated_at })
      .eq("id", invitationId);
  } catch {}

  return { success: true };
}

/**
 * Validates invitation via token or email + one-time code.
 */
export async function validateInvitationTokenOrCode(payload: {
  token?: string;
  email?: string;
  code?: string;
  local_id?: string;
}): Promise<{
  valid: boolean;
  error?: string;
  invitation?: {
    id: string;
    workspace_id: string;
    workspace_name: string;
    business_name: string;
    email: string;
    invited_user_name: string;
    role: UserRole;
    expires_at: string;
  };
}> {
  // Find local record if offline or for fallback
  const all = getLocalWorkspaceInvitations();
  let localRecord: WorkspaceInvitation | undefined;

  if (payload.local_id) {
    localRecord = all.find((i) => i.id === payload.local_id);
  }
  if (!localRecord && payload.token) {
    localRecord = all.find(
      (i) => i.token_hash === `h_${payload.token}` || i.token_hash === payload.token
    );
  }
  if (!localRecord && payload.code && payload.email) {
    const normCode = payload.code.trim().toUpperCase();
    localRecord = all.find(
      (i) =>
        i.email.toLowerCase() === payload.email!.trim().toLowerCase() &&
        (i.code_hash === `h_${normCode}` || i.code_hash === normCode)
    );
  }

  // Call API first
  try {
    if (typeof window !== "undefined") {
      const res = await fetch("/api/workspaces/validate-invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...payload,
          invitation_record: localRecord || undefined,
        }),
      });
      const data = await res.json();
      if (data.valid && data.invitation) {
        return { valid: true, invitation: data.invitation };
      }
      if (data.error) {
        return { valid: false, error: data.error };
      }
    }
  } catch (err: any) {
    console.warn("API validate failed, checking local cache:", err);
  }

  // Local verification
  if (!localRecord) {
    return {
      valid: false,
      error: "Invitation not found. Please verify your invitation link or code.",
    };
  }

  if (localRecord.status === "accepted") {
    return {
      valid: false,
      error: "This invitation has already been accepted. Please log in directly.",
    };
  }
  if (localRecord.status === "revoked") {
    return {
      valid: false,
      error: "This invitation was revoked by the workshop administrator.",
    };
  }
  if (localRecord.status === "expired" || new Date(localRecord.expires_at) <= new Date()) {
    return {
      valid: false,
      error: "This invitation has expired. Please contact the workshop owner for a new invitation.",
    };
  }

  const workspaces = await getWorkspaces();
  const ws = workspaces.find((w) => w.id === localRecord!.workspace_id);

  return {
    valid: true,
    invitation: {
      id: localRecord.id,
      workspace_id: localRecord.workspace_id,
      workspace_name: ws?.name || "Target Workshop",
      business_name: ws?.business_name || ws?.name || "Target Workshop",
      email: localRecord.email,
      invited_user_name: localRecord.invited_user_name,
      role: localRecord.role,
      expires_at: localRecord.expires_at,
    },
  };
}

/**
 * Accepts invitation and sets user-created password.
 */
export async function acceptWorkspaceInvitation(payload: {
  token?: string;
  email?: string;
  code?: string;
  new_password: string;
  local_id?: string;
}): Promise<{
  success: boolean;
  error?: string;
  activated_user?: {
    id: string;
    email: string;
    full_name: string;
    role: UserRole;
    workspace_id: string;
  };
}> {
  const all = getLocalWorkspaceInvitations();
  let localRecord: WorkspaceInvitation | undefined;

  if (payload.local_id) {
    localRecord = all.find((i) => i.id === payload.local_id);
  }
  if (!localRecord && payload.token) {
    localRecord = all.find(
      (i) => i.token_hash === `h_${payload.token}` || i.token_hash === payload.token
    );
  }
  if (!localRecord && payload.code && payload.email) {
    const normCode = payload.code.trim().toUpperCase();
    localRecord = all.find(
      (i) =>
        i.email.toLowerCase() === payload.email!.trim().toLowerCase() &&
        (i.code_hash === `h_${normCode}` || i.code_hash === normCode)
    );
  }

  try {
    if (typeof window !== "undefined") {
      const res = await fetch("/api/workspaces/accept-invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...payload,
          invitation_record: localRecord || undefined,
        }),
      });
      const data = await res.json();
      if (data.success && data.activated_user) {
        // Sync local storage
        if (localRecord) {
          localRecord.status = "accepted";
          localRecord.accepted_at = new Date().toISOString();
          saveLocalWorkspaceInvitations(all);

          // Update member to active
          const members = getLocalMembers();
          const existingMem = members.find(
            (m) =>
              m.workspace_id === localRecord!.workspace_id &&
              (m.user_id === localRecord!.email || m.user_id === data.activated_user.id)
          );
          if (existingMem) {
            existingMem.status = "active";
            existingMem.user_id = data.activated_user.id;
          } else {
            members.push({
              id: `wm-${Date.now().toString(36)}`,
              workspace_id: localRecord.workspace_id,
              user_id: data.activated_user.id,
              role: localRecord.role,
              status: "active",
              joined_at: new Date().toISOString(),
            });
          }
          saveLocalMembers(members);

          // Add user to local users
          const users = getLocalUsers();
          const existingUser = users.find((u) => u.email.toLowerCase() === localRecord!.email.toLowerCase());
          if (existingUser) {
            existingUser.is_active = true;
            existingUser.status = "active";
            existingUser.workspace_id = localRecord.workspace_id;
            existingUser.role = localRecord.role;
          } else {
            users.push({
              id: data.activated_user.id,
              email: localRecord.email,
              full_name: localRecord.invited_user_name,
              role: localRecord.role,
              is_active: true,
              status: "active",
              workspace_id: localRecord.workspace_id,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            });
          }
          saveLocalUsers(users);
        }

        return { success: true, activated_user: data.activated_user };
      }
      if (data.error) {
        return { success: false, error: data.error };
      }
    }
  } catch (err: any) {
    console.warn("API accept failed, processing local activation:", err);
  }

  // Local fallback
  if (!localRecord) {
    return { success: false, error: "Invitation record not found." };
  }
  if (localRecord.status === "accepted") {
    return { success: false, error: "This invitation has already been accepted." };
  }
  if (localRecord.status === "revoked") {
    return { success: false, error: "This invitation was revoked." };
  }
  if (localRecord.status === "expired" || new Date(localRecord.expires_at) <= new Date()) {
    return { success: false, error: "This invitation has expired." };
  }

  const newUserId = `usr-${Date.now().toString(36)}`;
  const now = new Date().toISOString();

  localRecord.status = "accepted";
  localRecord.accepted_at = now;
  saveLocalWorkspaceInvitations(all);

  // Activate workspace membership
  const members = getLocalMembers();
  const existingMem = members.find(
    (m) =>
      m.workspace_id === localRecord!.workspace_id &&
      (m.user_id === localRecord!.email || m.user_id === newUserId)
  );
  if (existingMem) {
    existingMem.status = "active";
    existingMem.user_id = newUserId;
  } else {
    members.push({
      id: `wm-${Date.now().toString(36)}`,
      workspace_id: localRecord.workspace_id,
      user_id: newUserId,
      role: localRecord.role,
      status: "active",
      joined_at: now,
    });
  }
  saveLocalMembers(members);

  // Create active User
  const users = getLocalUsers();
  const existingUser = users.find((u) => u.email.toLowerCase() === localRecord!.email.toLowerCase());
  if (existingUser) {
    existingUser.is_active = true;
    existingUser.status = "active";
    existingUser.workspace_id = localRecord.workspace_id;
    existingUser.role = localRecord.role;
    if (localRecord.permissions) existingUser.permissions = localRecord.permissions;
  } else {
    users.push({
      id: newUserId,
      email: localRecord.email,
      full_name: localRecord.invited_user_name,
      role: localRecord.role,
      is_active: true,
      status: "active",
      workspace_id: localRecord.workspace_id,
      permissions: localRecord.permissions || undefined,
      created_at: now,
      updated_at: now,
    });
  }
  saveLocalUsers(users);

  // Save permissions
  if (localRecord.permissions) {
    const permMap = getLocalPermissionsMap();
    permMap[newUserId] = localRecord.permissions;
    saveLocalPermissionsMap(permMap);
  }

  return {
    success: true,
    activated_user: {
      id: newUserId,
      email: localRecord.email,
      full_name: localRecord.invited_user_name,
      role: localRecord.role,
      workspace_id: localRecord.workspace_id,
    },
  };
}
