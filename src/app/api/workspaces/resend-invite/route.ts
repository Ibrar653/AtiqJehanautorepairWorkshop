import { NextRequest, NextResponse } from "next/server";
import { getAdminClient, ADMIN_AUTH_CONFIG_ERROR } from "@/lib/supabase/admin";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { invitation_id } = body;

    if (!invitation_id) {
      return NextResponse.json(
        { success: false, error: "Invitation ID is required." },
        { status: 400 }
      );
    }

    let supabaseAdmin;
    try {
      supabaseAdmin = getAdminClient();
    } catch {
      console.error("[RESEND AUTH ERROR]", ADMIN_AUTH_CONFIG_ERROR);
      return NextResponse.json(
        { success: false, error: ADMIN_AUTH_CONFIG_ERROR },
        { status: 500 }
      );
    }

    // 1. Fetch existing invitation
    const { data: invitations, error: fetchErr } = await supabaseAdmin
      .from("workspace_invitations")
      .select("*, workspace:workspaces(id, name, business_name)")
      .eq("id", invitation_id)
      .limit(1);

    if (fetchErr || !invitations || invitations.length === 0) {
      return NextResponse.json(
        { success: false, error: "Invitation record not found in database." },
        { status: 404 }
      );
    }

    const inv = invitations[0];

    if (inv.status === "accepted") {
      return NextResponse.json(
        { success: false, error: "Cannot resend an invitation that has already been accepted." },
        { status: 400 }
      );
    }

    if (inv.status === "revoked") {
      return NextResponse.json(
        { success: false, error: "This invitation was revoked. Please generate a new invitation." },
        { status: 400 }
      );
    }

    const forwardedHost = request.headers.get("x-forwarded-host");
    const forwardedProto = request.headers.get("x-forwarded-proto") || "https";
    const origin =
      process.env.NEXT_PUBLIC_APP_URL ||
      (forwardedHost ? `${forwardedProto}://${forwardedHost}` : (request.nextUrl?.origin || "http://localhost:3000"));

    const cleanEmail = inv.email.trim().toLowerCase();
    const now = new Date().toISOString();
    const newExpiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();

    // 2. Call Supabase Auth Admin to re-send invitation email
    const { data: inviteData, error: inviteError } =
      await supabaseAdmin.auth.admin.inviteUserByEmail(cleanEmail, {
        redirectTo: `${origin}/auth/accept-invite`,
        data: {
          full_name: inv.invited_user_name,
          workspace_id: inv.workspace_id,
          workspace_name: inv.workspace?.name || "Target Workspace",
          role: inv.role,
        },
      });

    if (inviteError) {
      console.error("[SUPABASE RESEND REAL ERROR]", {
        status: inviteError.status,
        code: inviteError.name,
        message: inviteError.message,
        email: cleanEmail,
      });

      const realErrorMsg = inviteError.message || "Failed to resend invitation email.";

      await supabaseAdmin
        .from("workspace_invitations")
        .update({
          status: "failed",
          error_message: realErrorMsg,
          updated_at: now,
        })
        .eq("id", invitation_id);

      return NextResponse.json(
        {
          success: false,
          status: "failed",
          error: `Invitation could not be resent: ${realErrorMsg}`,
        },
        { status: 400 }
      );
    }

    // 3. Supabase Auth confirmed email dispatch
    console.log("[SUPABASE RESEND SUCCESS]", {
      email: cleanEmail,
      userId: inviteData?.user?.id,
    });

    await supabaseAdmin
      .from("workspace_invitations")
      .update({
        status: "sent",
        sent_at: now,
        expires_at: newExpiresAt,
        error_message: null,
        updated_at: now,
      })
      .eq("id", invitation_id);

    return NextResponse.json({
      success: true,
      status: "sent",
      message: `Invitation email successfully resent to ${cleanEmail}. Valid for 72 hours.`,
      new_expires_at: newExpiresAt,
    });
  } catch (err: any) {
    console.error("Resend invitation route exception:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Internal server error during resend." },
      { status: 500 }
    );
  }
}
