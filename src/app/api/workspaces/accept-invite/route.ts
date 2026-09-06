import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getAdminClient, isServerAdminConfigured } from "@/lib/supabase/admin";

function hashValue(val: string): string {
  return crypto.createHash("sha256").update(val.trim()).digest("hex");
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { token, email, code, new_password, invitation_record } = body;

    if (!new_password || typeof new_password !== "string" || new_password.length < 6) {
      return NextResponse.json(
        { success: false, error: "Password must be at least 6 characters long." },
        { status: 400 }
      );
    }

    let tokenHash: string | null = null;
    let codeHash: string | null = null;

    if (token && typeof token === "string") {
      tokenHash = hashValue(token);
    }
    if (code && typeof code === "string") {
      codeHash = hashValue(code.trim().toUpperCase());
    }

    if (!tokenHash && (!codeHash || !email)) {
      return NextResponse.json(
        { success: false, error: "Either a valid invitation token or email + one-time code is required." },
        { status: 400 }
      );
    }

    let invitation: any = null;
    let supabaseAdmin: any = null;

    if (isServerAdminConfigured()) {
      supabaseAdmin = getAdminClient();

      let query = supabaseAdmin
        .from("workspace_invitations")
        .select("*");

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

    // Offline / local fallback
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
      return NextResponse.json(
        { success: false, error: "Invitation not found or invalid." },
        { status: 404 }
      );
    }

    if (invitation.status === "accepted") {
      return NextResponse.json(
        { success: false, error: "This invitation has already been accepted." },
        { status: 400 }
      );
    }
    if (invitation.status === "revoked") {
      return NextResponse.json(
        { success: false, error: "This invitation has been revoked." },
        { status: 400 }
      );
    }
    if (invitation.status === "expired" || new Date(invitation.expires_at) <= new Date()) {
      return NextResponse.json(
        { success: false, error: "This invitation has expired." },
        { status: 400 }
      );
    }

    const targetEmail = invitation.email.toLowerCase();
    const now = new Date().toISOString();
    let createdAuthUserId = `usr-${Date.now().toString(36)}`;

    // 1. Create or Update Supabase Auth User with the user-created password
    if (supabaseAdmin) {
      try {
        // Try creating auth user
        const { data: createData, error: createErr } = await supabaseAdmin.auth.admin.createUser({
          email: targetEmail,
          password: new_password,
          email_confirm: true,
          user_metadata: {
            full_name: invitation.invited_user_name,
            role: invitation.role,
            workspace_id: invitation.workspace_id,
          },
        });

        if (createData?.user) {
          createdAuthUserId = createData.user.id;
        } else if (createErr) {
          // If user already exists, update password
          const { data: usersData } = await supabaseAdmin.auth.admin.listUsers();
          const existing = usersData?.users?.find(
            (u: any) => u.email?.toLowerCase() === targetEmail
          );
          if (existing) {
            createdAuthUserId = existing.id;
            await supabaseAdmin.auth.admin.updateUserById(existing.id, {
              password: new_password,
              user_metadata: {
                full_name: invitation.invited_user_name,
                role: invitation.role,
                workspace_id: invitation.workspace_id,
              },
            });
          }
        }
      } catch (authErr) {
        console.warn("Supabase Auth admin createUser note:", authErr);
      }

      // 2. Mark invitation ACCEPTED
      await supabaseAdmin
        .from("workspace_invitations")
        .update({
          status: "accepted",
          accepted_at: now,
          updated_at: now,
        })
        .eq("id", invitation.id);

      // 3. Mark workspace membership ACTIVE
      const { data: existingMember } = await supabaseAdmin
        .from("workspace_members")
        .select("id")
        .eq("workspace_id", invitation.workspace_id)
        .or(`user_id.eq.${targetEmail},user_id.eq.${createdAuthUserId}`)
        .limit(1);

      if (existingMember && existingMember.length > 0) {
        await supabaseAdmin
          .from("workspace_members")
          .update({
            user_id: createdAuthUserId,
            status: "active",
            role: invitation.role,
            joined_at: now,
          })
          .eq("id", existingMember[0].id);
      } else {
        await supabaseAdmin.from("workspace_members").insert({
          id: `wm-${Date.now().toString(36)}`,
          workspace_id: invitation.workspace_id,
          user_id: createdAuthUserId,
          role: invitation.role,
          status: "active",
          joined_at: now,
        });
      }

      // 4. Provision permissions to user_permissions if present
      if (invitation.permissions) {
        const permRows = Object.values(invitation.permissions).map((p: any) => ({
          user_id: createdAuthUserId,
          workspace_id: invitation.workspace_id,
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
    }

    return NextResponse.json({
      success: true,
      message: "Account successfully activated with your new password.",
      activated_user: {
        id: createdAuthUserId,
        email: targetEmail,
        full_name: invitation.invited_user_name,
        role: invitation.role,
        workspace_id: invitation.workspace_id,
      },
      invitation_id: invitation.id,
    });
  } catch (err: any) {
    console.error("Accept invitation error:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Failed to activate account." },
      { status: 500 }
    );
  }
}
