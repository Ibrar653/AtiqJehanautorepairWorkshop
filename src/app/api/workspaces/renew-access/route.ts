import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getAdminClient, ADMIN_AUTH_CONFIG_ERROR } from "@/lib/supabase/admin";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { PRIMARY_OWNER_EMAIL } from "@/lib/constants";

function calculateExpiryDate(duration: string, customDate?: string, startDate: Date = new Date()): string | null {
  if (!duration || duration === "no_expiry" || duration === "never") {
    return null;
  }
  const d = new Date(startDate);
  switch (duration) {
    case "7d":
      d.setDate(d.getDate() + 7);
      return d.toISOString();
    case "30d":
      d.setDate(d.getDate() + 30);
      return d.toISOString();
    case "3m":
      d.setMonth(d.getMonth() + 3);
      return d.toISOString();
    case "6m":
      d.setMonth(d.getMonth() + 6);
      return d.toISOString();
    case "1y":
      d.setFullYear(d.getFullYear() + 1);
      return d.toISOString();
    case "custom":
      if (customDate) {
        const parsed = new Date(customDate);
        return !isNaN(parsed.getTime()) ? parsed.toISOString() : null;
      }
      return null;
    default:
      return null;
  }
}

export async function POST(request: NextRequest) {
  let supabaseAdmin: ReturnType<typeof getAdminClient>;
  try {
    supabaseAdmin = getAdminClient();
  } catch {
    return NextResponse.json(
      { success: false, error: ADMIN_AUTH_CONFIG_ERROR },
      { status: 500 }
    );
  }

  // 1. Verify Caller Authentication and Platform Admin Status
  let callerUser: any = null;
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.substring(7) : null;

  if (token) {
    try {
      const { data: authData } = await supabaseAdmin.auth.getUser(token);
      callerUser = authData?.user || null;
    } catch {}
  }

  if (!callerUser) {
    try {
      const serverClient = await createServerClient();
      const {
        data: { user },
      } = await serverClient.auth.getUser();
      callerUser = user;
    } catch {}
  }

  if (!callerUser?.id) {
    return NextResponse.json(
      { success: false, error: "Unauthorized: Active session required." },
      { status: 401 }
    );
  }

  const callerEmail = (callerUser.email || "").toLowerCase();
  const isPrimaryOwner = callerEmail === PRIMARY_OWNER_EMAIL.toLowerCase();

  let isPlatformAdmin = isPrimaryOwner;
  if (!isPlatformAdmin) {
    const { data: adminRecord } = await supabaseAdmin
      .from("platform_admins")
      .select("id, user_id, status")
      .eq("user_id", callerUser.id)
      .eq("status", "active")
      .maybeSingle();

    if (adminRecord) isPlatformAdmin = true;
  }

  if (!isPlatformAdmin) {
    return NextResponse.json(
      { success: false, error: "Forbidden: Only Platform Owners can renew workspace access durations." },
      { status: 403 }
    );
  }

  // 2. Parse Request Body
  let body: {
    workspace_id: string;
    user_id_or_email: string;
    duration: string;
    custom_date?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON request body." },
      { status: 400 }
    );
  }

  const { workspace_id, user_id_or_email, duration, custom_date } = body;
  if (!workspace_id || !user_id_or_email) {
    return NextResponse.json(
      { success: false, error: "workspace_id and user_id_or_email are required." },
      { status: 400 }
    );
  }

  const cleanTarget = user_id_or_email.trim().toLowerCase();
  const now = new Date().toISOString();
  const expiresAt = calculateExpiryDate(duration, custom_date, new Date());

  // 3. Update workspace_members record
  try {
    // Find matching member row
    const { data: existingMembers, error: findErr } = await supabaseAdmin
      .from("workspace_members")
      .select("*")
      .eq("workspace_id", workspace_id);

    if (findErr) {
      console.warn("Error querying workspace_members:", findErr);
    }

    const targetMember = (existingMembers || []).find(
      (m: any) =>
        m.user_id === user_id_or_email ||
        m.user_id.toLowerCase() === cleanTarget ||
        m.user_email?.toLowerCase() === cleanTarget
    );

    if (targetMember) {
      const { error: updateErr } = await supabaseAdmin
        .from("workspace_members")
        .update({
          status: "active",
          access_starts_at: now,
          access_expires_at: expiresAt,
          access_duration: duration || "no_expiry",
          expired_at: null,
          updated_at: now,
        })
        .eq("id", targetMember.id);

      if (updateErr) {
        throw updateErr;
      }
    } else {
      // If member row doesn't exist yet, insert fresh active member
      const { error: insertErr } = await supabaseAdmin.from("workspace_members").insert({
        id: crypto.randomUUID(),
        workspace_id,
        user_id: user_id_or_email,
        role: "owner",
        status: "active",
        is_workspace_owner: true,
        access_starts_at: now,
        access_expires_at: expiresAt,
        access_duration: duration || "no_expiry",
        expired_at: null,
        joined_at: now,
        created_at: now,
        updated_at: now,
      });

      if (insertErr) {
        throw insertErr;
      }
    }

    // If workspace itself was suspended or expired, reactivate it
    await supabaseAdmin
      .from("workspaces")
      .update({ status: "active", updated_at: now })
      .eq("id", workspace_id)
      .in("status", ["suspended", "expired"]);

    // 4. Record Audit Event
    await supabaseAdmin.from("workspace_audit_logs").insert({
      id: crypto.randomUUID(),
      workspace_id,
      action: "WORKSPACE_ACCESS_RENEWED",
      performed_by: callerUser.id,
      target_user: cleanTarget,
      details: {
        duration,
        access_starts_at: now,
        access_expires_at: expiresAt,
        renewed_at: now,
      },
      created_at: now,
    });

    return NextResponse.json({
      success: true,
      message: `Workspace access renewed successfully. New expiry: ${expiresAt ? new Date(expiresAt).toLocaleDateString() : "No Expiry"}.`,
      access_starts_at: now,
      access_expires_at: expiresAt,
      duration,
    });
  } catch (err: any) {
    console.error("Failed to renew workspace access:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Failed to renew workspace access." },
      { status: 500 }
    );
  }
}
