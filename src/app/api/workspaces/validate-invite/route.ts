import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getAdminClient, isServerAdminConfigured } from "@/lib/supabase/admin";

function hashValue(val: string): string {
  return crypto.createHash("sha256").update(val.trim()).digest("hex");
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { token, email, code, invitation_record } = body;

    let tokenHash: string | null = null;
    let codeHash: string | null = null;

    if (token && typeof token === "string") {
      tokenHash = hashValue(token);
    }
    if (code && typeof code === "string") {
      // Normalize code (uppercase, trim)
      codeHash = hashValue(code.trim().toUpperCase());
    }

    if (!tokenHash && (!codeHash || !email)) {
      return NextResponse.json(
        { valid: false, error: "Either a valid invitation token or email + one-time code is required." },
        { status: 400 }
      );
    }

    let invitation: any = null;

    if (isServerAdminConfigured()) {
      const supabaseAdmin = getAdminClient();

      let query = supabaseAdmin
        .from("workspace_invitations")
        .select("*, workspace:workspaces(id, name, business_name, currency, status)");

      if (tokenHash) {
        query = query.eq("token_hash", tokenHash);
      } else if (codeHash && email) {
        query = query
          .eq("code_hash", codeHash)
          .eq("email", email.trim().toLowerCase());
      }

      const { data, error } = await query.limit(1);
      if (!error && data && data.length > 0) {
        invitation = data[0];
      }
    }

    // Fallback: If client passed an in-memory/local copy for offline dev testing
    if (!invitation && invitation_record) {
      const matchesToken = tokenHash && invitation_record.token_hash === tokenHash;
      const matchesCode =
        codeHash &&
        invitation_record.code_hash === codeHash &&
        invitation_record.email.toLowerCase() === (email || "").trim().toLowerCase();

      if (matchesToken || matchesCode) {
        invitation = invitation_record;
      }
    }

    if (!invitation) {
      return NextResponse.json({
        valid: false,
        error: "Invitation not found. Please check your link or code.",
      });
    }

    // Check status
    if (invitation.status === "accepted") {
      return NextResponse.json({
        valid: false,
        error: "This invitation has already been accepted and activated. Please log in directly.",
        already_accepted: true,
      });
    }
    if (invitation.status === "revoked") {
      return NextResponse.json({
        valid: false,
        error: "This invitation has been revoked by the workshop administrator.",
      });
    }
    if (invitation.status === "expired" || new Date(invitation.expires_at) <= new Date()) {
      return NextResponse.json({
        valid: false,
        error: "This invitation has expired. Please contact the workshop owner to request a new invitation.",
        expired: true,
      });
    }

    return NextResponse.json({
      valid: true,
      invitation: {
        id: invitation.id,
        workspace_id: invitation.workspace_id,
        workspace_name: invitation.workspace?.name || "Target Workspace",
        business_name: invitation.workspace?.business_name || invitation.workspace?.name || "Target Workshop",
        email: invitation.email,
        invited_user_name: invitation.invited_user_name,
        role: invitation.role,
        expires_at: invitation.expires_at,
        data_scope: invitation.data_scope,
        financial_visibility: invitation.financial_visibility,
        approval_limits: invitation.approval_limits,
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { valid: false, error: err.message || "Failed to validate invitation." },
      { status: 500 }
    );
  }
}
