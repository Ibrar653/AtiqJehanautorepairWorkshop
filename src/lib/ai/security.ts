import type { NextRequest } from "next/server";
import type { SupabaseClient, User as SupabaseAuthUser } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { DEFAULT_WORKSPACE_ID, PRIMARY_OWNER_EMAIL } from "@/lib/constants";
import type { ActionExecutionResult } from "./types";

export interface AuthenticatedAIContext {
  supabase: SupabaseClient;
  user: SupabaseAuthUser;
  userId: string;
  userEmail: string;
  userName: string;
  workspaceId: string;
  workspaceName: string;
  role: string;
  isOwner: boolean;
}

// ─── Per-User Sliding Window Rate Limiter (In-Memory Server Protection) ──────
const rateLimitMap = new Map<string, number[]>();
const MAX_REQUESTS_PER_MINUTE = Math.max(
  5,
  Number(process.env.AI_MAX_REQUESTS_PER_MINUTE) || 20
);

export function checkUserRateLimit(userId: string): {
  allowed: boolean;
  retryAfterSeconds?: number;
} {
  const now = Date.now();
  const windowMs = 60_000;
  const timestamps = (rateLimitMap.get(userId) || []).filter((t) => now - t < windowMs);

  if (timestamps.length >= MAX_REQUESTS_PER_MINUTE) {
    const oldest = timestamps[0];
    const retryAfterSeconds = Math.max(1, Math.ceil((windowMs - (now - oldest)) / 1000));
    return { allowed: false, retryAfterSeconds };
  }

  timestamps.push(now);
  rateLimitMap.set(userId, timestamps);
  return { allowed: true };
}

// ─── Server-Side Execution Idempotency Store (Prevents Duplicate Writes) ─────
const executionIdempotencyCache = new Map<
  string,
  { result: ActionExecutionResult; expiresAt: number }
>();

export function getCachedExecutionResult(
  workspaceId: string,
  idempotencyKey: string
): ActionExecutionResult | null {
  const compositeKey = `${workspaceId}:${idempotencyKey}`;
  const entry = executionIdempotencyCache.get(compositeKey);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    executionIdempotencyCache.delete(compositeKey);
    return null;
  }
  return entry.result;
}

export function setCachedExecutionResult(
  workspaceId: string,
  idempotencyKey: string,
  result: ActionExecutionResult
): void {
  const compositeKey = `${workspaceId}:${idempotencyKey}`;
  // Cache for 30 minutes
  executionIdempotencyCache.set(compositeKey, {
    result,
    expiresAt: Date.now() + 30 * 60 * 1000,
  });
}

// ─── Strict Server-Side Authentication & Workspace Verification ──────────────
export async function authenticateAIRequest(
  request: NextRequest,
  requestedWorkspaceId?: string | null
): Promise<AuthenticatedAIContext> {
  const supabase = await createServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user?.id) {
    throw new Error("UNAUTHORIZED: Active authenticated session required.");
  }

  const userEmail = (user.email || "").trim().toLowerCase();
  const userName =
    (user.user_metadata?.full_name as string) ||
    userEmail.split("@")[0] ||
    "Workshop Staff";

  // Check if user is an active platform admin / primary owner
  let isPlatformOwner = userEmail === PRIMARY_OWNER_EMAIL.toLowerCase();
  if (!isPlatformOwner) {
    const { data: adminRow } = await supabase
      .from("platform_admins")
      .select("id, status, role")
      .eq("user_id", user.id)
      .eq("status", "active")
      .maybeSingle();
    if (adminRow) isPlatformOwner = true;
  }

  // Validate requested workspace strictly against database membership (NEVER trust client blindly)
  const candidateWsId =
    requestedWorkspaceId && /^[0-9a-f-]{36}$/i.test(requestedWorkspaceId)
      ? requestedWorkspaceId
      : null;

  let resolvedWorkspaceId: string | null = null;
  let resolvedRole = isPlatformOwner ? "owner" : "staff";
  let resolvedWorkspaceName = "ATIQ JEHAN AUTO REPAIR";

  if (candidateWsId) {
    if (isPlatformOwner) {
      const { data: wsRow } = await supabase
        .from("workspaces")
        .select("id, name, status")
        .eq("id", candidateWsId)
        .neq("status", "archived")
        .maybeSingle();
      if (wsRow?.id) {
        resolvedWorkspaceId = wsRow.id;
        resolvedWorkspaceName = wsRow.name || resolvedWorkspaceName;
      }
    } else {
      const { data: memberRow } = await supabase
        .from("workspace_members")
        .select("workspace_id, role, status, access_expires_at")
        .eq("user_id", user.id)
        .eq("workspace_id", candidateWsId)
        .eq("status", "active")
        .maybeSingle();

      if (memberRow?.workspace_id) {
        const isExpired =
          memberRow.access_expires_at &&
          new Date(memberRow.access_expires_at).getTime() <= Date.now();
        if (!isExpired) {
          resolvedWorkspaceId = memberRow.workspace_id;
          resolvedRole = memberRow.role || "staff";
          const { data: wsRow } = await supabase
            .from("workspaces")
            .select("name")
            .eq("id", resolvedWorkspaceId)
            .maybeSingle();
          if (wsRow?.name) resolvedWorkspaceName = wsRow.name;
        }
      }
    }
  }

  // Fallback to user's first active workspace membership if no specific workspace was sent
  if (!resolvedWorkspaceId) {
    const { data: members } = await supabase
      .from("workspace_members")
      .select("workspace_id, role, status, access_expires_at")
      .eq("user_id", user.id)
      .eq("status", "active")
      .limit(5);

    const validMember = (members || []).find(
      (m: any) =>
        !m.access_expires_at || new Date(m.access_expires_at).getTime() > Date.now()
    );

    if (validMember?.workspace_id) {
      resolvedWorkspaceId = validMember.workspace_id;
      resolvedRole = validMember.role || resolvedRole;
      const { data: wsRow } = await supabase
        .from("workspaces")
        .select("name")
        .eq("id", resolvedWorkspaceId)
        .maybeSingle();
      if (wsRow?.name) resolvedWorkspaceName = wsRow.name;
    } else if (isPlatformOwner) {
      const { data: primaryWs } = await supabase
        .from("workspaces")
        .select("id, name")
        .eq("status", "active")
        .order("is_primary", { ascending: false })
        .limit(1)
        .maybeSingle();
      resolvedWorkspaceId = primaryWs?.id || DEFAULT_WORKSPACE_ID;
      resolvedWorkspaceName = primaryWs?.name || resolvedWorkspaceName;
    }
  }

  if (!resolvedWorkspaceId) {
    throw new Error("FORBIDDEN: No active workspace authorization found for this user.");
  }

  const isOwner =
    isPlatformOwner || resolvedRole === "owner" || resolvedRole === "admin";

  return {
    supabase,
    user,
    userId: user.id,
    userEmail,
    userName,
    workspaceId: resolvedWorkspaceId,
    workspaceName: resolvedWorkspaceName,
    role: resolvedRole,
    isOwner,
  };
}

/**
 * Checks whether a user role is authorized to execute workshop write operations
 * (Customers, Vehicles, Job Cards, Invoices).
 */
export function canUserPerformWorkshopWrites(ctx: AuthenticatedAIContext): boolean {
  if (ctx.isOwner) return true;
  const writeRoles = new Set(["owner", "admin", "manager", "receptionist"]);
  return writeRoles.has(ctx.role.toLowerCase());
}

/**
 * Strips any potential secret-looking patterns from error messages before returning to the client.
 */
export function sanitizeErrorForClient(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err || "An unexpected error occurred.");
  return raw
    .replace(/sk-[a-zA-Z0-9_\-]{10,}/g, "[REDACTED_KEY]")
    .replace(/AIza[a-zA-Z0-9_\-]{10,}/g, "[REDACTED_KEY]")
    .replace(/sb_secret_[a-zA-Z0-9_\-]{10,}/g, "[REDACTED_KEY]");
}
