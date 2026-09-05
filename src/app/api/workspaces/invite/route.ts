import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";
import { DEFAULT_WORKSPACE_ID, PRIMARY_OWNER_EMAIL } from "@/lib/constants";

function generateOneTimeCode(): string {
  // Generate 8 uppercase alphanumeric characters, split into 2 chunks of 4: AJ-XXXX-XXXX (12 chars total)
  const chars = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"; // excludes 0, 1, I, O for readability
  const bytes = crypto.randomBytes(8);
  let str = "";
  for (let i = 0; i < 8; i++) {
    str += chars[bytes[i] % chars.length];
  }
  return `AJ-${str.slice(0, 4)}-${str.slice(4, 8)}`;
}

function hashValue(val: string): string {
  return crypto.createHash("sha256").update(val.trim()).digest("hex");
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      workspace_id,
      workspace_name = "Target Workspace",
      email,
      full_name,
      role = "manager",
      permissions = null,
      data_scope = "all",
      financial_visibility = null,
      approval_limits = null,
      invited_by = "Primary Owner",
    } = body;

    if (!workspace_id) {
      return NextResponse.json(
        { success: false, error: "Workspace ID is required." },
        { status: 400 }
      );
    }
    if (!email || !email.includes("@")) {
      return NextResponse.json(
        { success: false, error: "A valid email address is required." },
        { status: 400 }
      );
    }
    if (!full_name || !full_name.trim()) {
      return NextResponse.json(
        { success: false, error: "Full Name is required." },
        { status: 400 }
      );
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanName = full_name.trim();

    // 1. Generate secure credentials
    const rawToken = crypto.randomBytes(32).toString("hex");
    const rawOneTimeCode = generateOneTimeCode();
    const tokenHash = hashValue(rawToken);
    const codeHash = hashValue(rawOneTimeCode);
    const codePreview = `${rawOneTimeCode.slice(0, 5)}***-${rawOneTimeCode.slice(-4)}`;

    // Expiry: 72 hours from now
    const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();
    const now = new Date().toISOString();
    const invitationId = `winv-${Date.now().toString(36)}-${crypto.randomBytes(4).toString("hex")}`;

    // 2. Resolve origin for the invitation link
    const origin =
      process.env.NEXT_PUBLIC_APP_URL ||
      request.nextUrl.origin ||
      "http://localhost:3000";
    const inviteLink = `${origin}/auth/accept-invite?token=${rawToken}`;

    const invitationRecord: any = {
      id: invitationId,
      workspace_id,
      email: cleanEmail,
      invited_user_name: cleanName,
      role,
      token_hash: tokenHash,
      code_hash: codeHash,
      code_plain_preview: codePreview,
      status: "pending",
      expires_at: expiresAt,
      invited_by,
      permissions,
      data_scope,
      financial_visibility,
      approval_limits,
      accepted_at: null,
      error_message: null,
      sent_at: null,
      created_at: now,
      updated_at: now,
    };

    // 3. Check Server Environment Credentials
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://dnrrwcccclulidhyglub.supabase.co";
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!serviceRoleKey || !serviceRoleKey.trim()) {
      const missingKeyMsg =
        "SUPABASE_SERVICE_ROLE_KEY is missing in server environment (.env.local). Invitation email cannot be dispatched via Supabase Auth without the service_role key.";
      console.error("[CRITICAL AUTH CONFIG ERROR]", missingKeyMsg);

      invitationRecord.status = "failed";
      invitationRecord.error_message = missingKeyMsg;

      return NextResponse.json(
        {
          success: false,
          status: "failed",
          error: `Invitation could not be sent: ${missingKeyMsg}`,
          invitation: {
            id: invitationId,
            workspace_id,
            workspace_name,
            email: cleanEmail,
            invited_user_name: cleanName,
            role,
            one_time_code: rawOneTimeCode,
            invite_link: inviteLink,
            status: "failed",
            error_message: missingKeyMsg,
            expires_at: expiresAt,
          },
          raw_record: invitationRecord,
        },
        { status: 500 }
      );
    }

    // 4. Instantiate Server-Side Elevated Supabase Admin Client
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // 5. Existing User Detection (Requirement 7)
    let existingAuthUser: any = null;
    try {
      const { data: usersData, error: listError } = await supabaseAdmin.auth.admin.listUsers();
      if (!listError && usersData?.users) {
        existingAuthUser = usersData.users.find(
          (u: any) => u.email?.toLowerCase() === cleanEmail
        );
      }
    } catch (listErr) {
      console.warn("[AUTH LIST USERS WARNING]", listErr);
    }

    if (existingAuthUser) {
      // Link existing auth user to the new workspace
      const memberId = `wm-${Date.now().toString(36)}-${crypto.randomBytes(3).toString("hex")}`;
      await supabaseAdmin.from("workspace_members").upsert({
        id: memberId,
        workspace_id,
        user_id: existingAuthUser.id,
        role,
        status: "active",
        joined_at: now,
      });

      // Provision permissions
      if (permissions) {
        const permRows = Object.values(permissions).map((p: any) => ({
          user_id: existingAuthUser.id,
          workspace_id,
          module: p.module,
          access: p.access ?? false,
          can_view: p.can_view ?? false,
          can_create: p.can_create ?? false,
          can_edit: p.can_edit ?? false,
          can_delete: p.can_delete ?? false,
          can_print: p.can_print ?? false,
          can_export: p.can_export ?? false,
          can_approve: p.can_approve ?? false,
          can_transfer_money: p.can_transfer_money ?? false,
          can_manual_journal: p.can_manual_journal ?? false,
          can_reverse_transaction: p.can_reverse_transaction ?? false,
          can_permanent_delete: p.can_permanent_delete ?? false,
          can_view_bank_balance: p.can_view_bank_balance ?? false,
        }));
        await supabaseAdmin.from("user_permissions").upsert(permRows, {
          onConflict: "user_id,module",
        });
      }

      // Record invitation as already accepted
      invitationRecord.status = "accepted";
      invitationRecord.accepted_at = now;
      await supabaseAdmin.from("workspace_invitations").insert(invitationRecord);

      return NextResponse.json({
        success: true,
        already_exists: true,
        status: "accepted",
        message: `User ${cleanEmail} already has an account. Workspace access has been assigned.`,
        invitation: {
          id: invitationId,
          workspace_id,
          workspace_name,
          email: cleanEmail,
          invited_user_name: cleanName,
          role,
          one_time_code: rawOneTimeCode,
          invite_link: `${origin}/login`,
          status: "accepted",
          expires_at: expiresAt,
        },
      });
    }

    // 6. New User: Insert Pending Invitation Record into Database
    const { error: insertErr } = await supabaseAdmin
      .from("workspace_invitations")
      .insert(invitationRecord);

    if (insertErr) {
      console.warn("[WORKSPACE INVITATION INSERT NOTE]", insertErr.message);
    }

    // Ensure pending workspace membership exists
    const memberId = `wm-${Date.now().toString(36)}-${crypto.randomBytes(3).toString("hex")}`;
    await supabaseAdmin.from("workspace_members").upsert({
      id: memberId,
      workspace_id,
      user_id: cleanEmail, // temporary placeholder until auth user created
      role,
      status: "pending",
      joined_at: now,
    });

    // 7. Dispatch Invitation Email via Supabase Admin Auth (Requirement 2, 5, 6, 8)
    const { data: inviteData, error: inviteError } =
      await supabaseAdmin.auth.admin.inviteUserByEmail(cleanEmail, {
        redirectTo: `${origin}/auth/accept-invite`,
        data: {
          full_name: cleanName,
          workspace_id,
          workspace_name,
          role,
        },
      });

    // 8. Capture Real Supabase Auth Error or Success
    if (inviteError) {
      console.error("[SUPABASE AUTH INVITE ERROR]", {
        status: inviteError.status,
        code: inviteError.name,
        message: inviteError.message,
        email: cleanEmail,
      });

      const realErrorMsg = inviteError.message || "Failed to dispatch email via Supabase Auth";

      // Mark invitation as failed and save real error message
      await supabaseAdmin
        .from("workspace_invitations")
        .update({ status: "failed", error_message: realErrorMsg })
        .eq("id", invitationId);

      invitationRecord.status = "failed";
      invitationRecord.error_message = realErrorMsg;

      return NextResponse.json(
        {
          success: false,
          status: "failed",
          error: `Invitation could not be sent: ${realErrorMsg}`,
          invitation: {
            id: invitationId,
            workspace_id,
            workspace_name,
            email: cleanEmail,
            invited_user_name: cleanName,
            role,
            one_time_code: rawOneTimeCode,
            invite_link: inviteLink,
            status: "failed",
            error_message: realErrorMsg,
            expires_at: expiresAt,
          },
          raw_record: invitationRecord,
        },
        { status: 400 }
      );
    }

    // Success: Supabase Auth accepted the invitation email request!
    console.log("[SUPABASE AUTH INVITE SUCCESS]", {
      email: cleanEmail,
      userId: inviteData?.user?.id,
      invitedAt: inviteData?.user?.invited_at,
    });

    await supabaseAdmin
      .from("workspace_invitations")
      .update({ status: "sent", sent_at: now })
      .eq("id", invitationId);

    invitationRecord.status = "sent";
    invitationRecord.sent_at = now;

    return NextResponse.json({
      success: true,
      status: "sent",
      message: `Official Supabase invitation email successfully dispatched to ${cleanEmail}.`,
      invitation: {
        id: invitationId,
        workspace_id,
        workspace_name,
        email: cleanEmail,
        invited_user_name: cleanName,
        role,
        one_time_code: rawOneTimeCode,
        invite_link: inviteLink,
        status: "sent",
        sent_at: now,
        expires_at: expiresAt,
        token_hash: tokenHash,
        code_hash: codeHash,
      },
      raw_record: invitationRecord,
    });
  } catch (err: any) {
    console.error("Workspace invitation exception:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Failed to process invitation." },
      { status: 500 }
    );
  }
}
