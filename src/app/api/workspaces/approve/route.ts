import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getAdminClient, ADMIN_AUTH_CONFIG_ERROR } from "@/lib/supabase/admin";
import { createClient as createServerClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  try {
    let supabaseAdmin: ReturnType<typeof getAdminClient>;
    try {
      supabaseAdmin = getAdminClient();
    } catch {
      return NextResponse.json(
        { success: false, error: ADMIN_AUTH_CONFIG_ERROR },
        { status: 500 }
      );
    }

    // 1. Verify Caller Authentication
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

    // 2. Enforce Platform Admin Check (auth.uid() against public.platform_admins)
    const { data: adminRecord, error: adminErr } = await supabaseAdmin
      .from("platform_admins")
      .select("id, role, status")
      .eq("user_id", callerUser.id)
      .eq("status", "active")
      .single();

    if (adminErr || !adminRecord) {
      return NextResponse.json(
        { success: false, error: "Forbidden: Only active Platform Owners can approve or reject workspaces." },
        { status: 403 }
      );
    }

    // 3. Parse Request Payload
    const body = await request.json();
    const { workspace_id, action, rejection_reason } = body;

    if (!workspace_id) {
      return NextResponse.json(
        { success: false, error: "Workspace ID is required." },
        { status: 400 }
      );
    }

    if (action !== "approve" && action !== "reject") {
      return NextResponse.json(
        { success: false, error: "Action must be either 'approve' or 'reject'." },
        { status: 400 }
      );
    }

    // Find workspace to resolve target owner_user_id
    const { data: wsRecord, error: wsFindErr } = await supabaseAdmin
      .from("workspaces")
      .select("id, name, workspace_code, owner_user_id, status")
      .eq("id", workspace_id)
      .single();

    if (wsFindErr || !wsRecord) {
      return NextResponse.json(
        { success: false, error: "Workspace not found." },
        { status: 404 }
      );
    }

    const now = new Date().toISOString();

    if (action === "approve") {
      // 4. APPROVAL WORKFLOW
      const { error: wsUpdateErr } = await supabaseAdmin
        .from("workspaces")
        .update({
          status: "active",
          approved_by: callerUser.id,
          approved_at: now,
          rejection_reason: null,
          updated_at: now,
        })
        .eq("id", workspace_id);

      if (wsUpdateErr) {
        return NextResponse.json(
          { success: false, error: `Failed to approve workspace: ${wsUpdateErr.message}` },
          { status: 500 }
        );
      }

      // Activate workspace members
      await supabaseAdmin
        .from("workspace_members")
        .update({
          status: "active",
          joined_at: now,
          updated_at: now,
        })
        .eq("workspace_id", workspace_id)
        .eq("status", "pending");

      // Audit log
      try {
        await supabaseAdmin.from("workspace_audit_logs").insert({
          id: crypto.randomUUID(),
          workspace_id,
          action: "workspace_approved",
          performed_by: callerUser.id,
          target_user: wsRecord.owner_user_id,
          details: {
            approved_at: now,
            workspace_name: wsRecord.name,
            workspace_code: wsRecord.workspace_code,
          },
          created_at: now,
        });
      } catch (auditErr) {
        console.warn("Audit log warning on approve:", auditErr);
      }

      return NextResponse.json({
        success: true,
        message: `Workspace "${wsRecord.name}" successfully approved and activated.`,
        workspace_id,
        status: "active",
      });
    } else {
      // 5. REJECTION WORKFLOW
      const reason = rejection_reason?.trim() || "Rejected by platform administrator.";

      const { error: wsRejectErr } = await supabaseAdmin
        .from("workspaces")
        .update({
          status: "rejected",
          rejection_reason: reason,
          updated_at: now,
        })
        .eq("id", workspace_id);

      if (wsRejectErr) {
        return NextResponse.json(
          { success: false, error: `Failed to reject workspace: ${wsRejectErr.message}` },
          { status: 500 }
        );
      }

      // Mark workspace members as rejected
      await supabaseAdmin
        .from("workspace_members")
        .update({
          status: "rejected",
          updated_at: now,
        })
        .eq("workspace_id", workspace_id);

      // Audit log
      try {
        await supabaseAdmin.from("workspace_audit_logs").insert({
          id: crypto.randomUUID(),
          workspace_id,
          action: "workspace_rejected",
          performed_by: callerUser.id,
          target_user: wsRecord.owner_user_id,
          details: {
            rejection_reason: reason,
            workspace_name: wsRecord.name,
            workspace_code: wsRecord.workspace_code,
          },
          created_at: now,
        });
      } catch (auditErr) {
        console.warn("Audit log warning on reject:", auditErr);
      }

      return NextResponse.json({
        success: true,
        message: `Workspace "${wsRecord.name}" has been rejected.`,
        workspace_id,
        status: "rejected",
        rejection_reason: reason,
      });
    }
  } catch (err: any) {
    console.error("[WORKSPACE APPROVAL/REJECTION API ERROR]", err);
    return NextResponse.json(
      { success: false, error: err.message || "Internal server error." },
      { status: 500 }
    );
  }
}
