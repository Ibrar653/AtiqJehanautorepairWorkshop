import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getAdminClient, ADMIN_AUTH_CONFIG_ERROR } from "@/lib/supabase/admin";
import type { CreateDirectWorkspacePayload, Workspace } from "@/types/database";

export async function POST(request: NextRequest) {
  try {
    const body: CreateDirectWorkspacePayload = await request.json();
    const {
      mode = "direct",
      name,
      code,
      business_name,
      owner_name,
      owner_email,
      temporary_password,
      role = "owner",
      permissions,
    } = body;

    // 1. Validate Required Inputs
    if (!name || !name.trim()) {
      return NextResponse.json(
        { success: false, error: "Business / Workspace Name is required." },
        { status: 400 }
      );
    }
    if (!owner_name || !owner_name.trim()) {
      return NextResponse.json(
        { success: false, error: "Owner Full Name is required." },
        { status: 400 }
      );
    }
    if (!owner_email || !owner_email.trim() || !owner_email.includes("@")) {
      return NextResponse.json(
        { success: false, error: "A valid Owner Email address is required." },
        { status: 400 }
      );
    }

    if (mode === "direct") {
      if (!temporary_password || temporary_password.trim().length < 6) {
        return NextResponse.json(
          { success: false, error: "Temporary Password must be at least 6 characters." },
          { status: 400 }
        );
      }
    }

    const cleanName = name.trim();
    const cleanBusinessName = (business_name || cleanName).trim();
    const cleanEmail = owner_email.trim().toLowerCase();
    const cleanOwnerName = owner_name.trim();
    const cleanCode = code && code.trim() ? code.trim().toUpperCase() : null;

    // 2. Check Server Admin Client Configuration
    let supabaseAdmin;
    try {
      supabaseAdmin = getAdminClient();
    } catch {
      return NextResponse.json(
        { success: false, error: ADMIN_AUTH_CONFIG_ERROR },
        { status: 500 }
      );
    }

    // 3. Unique Workspace Code Check
    if (cleanCode) {
      try {
        const { data: existingCodes } = await supabaseAdmin
          .from("workspaces")
          .select("id, name, code")
          .ilike("code", cleanCode)
          .limit(1);

        if (existingCodes && existingCodes.length > 0) {
          return NextResponse.json(
            {
              success: false,
              error: `Workspace Code "${cleanCode}" is already in use by workspace "${existingCodes[0].name}". Please choose another code.`,
            },
            { status: 400 }
          );
        }
      } catch (codeErr) {
        // Non-blocking if code column not yet added to database schema cache
        console.warn("Workspace code uniqueness check warning:", codeErr);
      }
    }

    // 4. Generate Unique Workspace ID
    const slug = cleanName
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "-")
      .replace(/-+/g, "-")
      .slice(0, 15);
    const newWsId = `ws-${slug}-${Date.now().toString(36)}`;
    const now = new Date().toISOString();

    const newWorkspace: Workspace = {
      id: newWsId,
      name: cleanName,
      code: cleanCode,
      business_name: cleanBusinessName,
      owner_user_id: null,
      owner_name: cleanOwnerName,
      owner_email: cleanEmail,
      phone: body.phone?.trim() || null,
      email: cleanEmail,
      address: body.address?.trim() || null,
      country: body.country?.trim() || "United Arab Emirates",
      currency: body.currency?.trim() || "AED",
      trn: body.trn?.trim() || null,
      status: "active",
      created_at: now,
      updated_at: now,
    };

    // 5. STEP 1: Insert Workspace
    const { error: wsErr } = await supabaseAdmin.from("workspaces").insert({
      id: newWorkspace.id,
      name: newWorkspace.name,
      code: newWorkspace.code,
      business_name: newWorkspace.business_name,
      owner_user_id: null,
      phone: newWorkspace.phone,
      email: newWorkspace.email,
      address: newWorkspace.address,
      country: newWorkspace.country,
      currency: newWorkspace.currency,
      trn: newWorkspace.trn,
      status: newWorkspace.status,
      created_at: newWorkspace.created_at,
      updated_at: newWorkspace.updated_at,
    });

    if (wsErr) {
      console.error("[SUPABASE WORKSPACE INSERT ERROR]", wsErr);
      return NextResponse.json(
        { success: false, error: `Failed to create workspace record: ${wsErr.message}` },
        { status: 500 }
      );
    }

    // 6. TRANSACTIONAL STEPS WITH AUTOMATIC ROLLBACK
    let authUser: any = null;
    let isNewAuthUser = false;

    try {
      // STEP 2: Resolve Owner in Supabase Auth
      const { data: usersData, error: listErr } = await supabaseAdmin.auth.admin.listUsers();
      if (!listErr && usersData?.users) {
        authUser = usersData.users.find(
          (u: any) => u.email?.toLowerCase() === cleanEmail
        );
      }

      // STEP 3: Create Auth User if not existing
      if (!authUser) {
        if (mode === "direct") {
          const { data: createData, error: createError } =
            await supabaseAdmin.auth.admin.createUser({
              email: cleanEmail,
              password: temporary_password!.trim(),
              email_confirm: true,
              user_metadata: {
                full_name: cleanOwnerName,
                workspace_id: newWsId,
                must_change_password: true,
              },
            });

          if (createError) {
            throw new Error(`Failed to create Auth account: ${createError.message}`);
          }
          authUser = createData.user;
          isNewAuthUser = true;
        } else {
          // Send Email Invitation mode
          const forwardedHost = request.headers.get("x-forwarded-host");
          const forwardedProto = request.headers.get("x-forwarded-proto") || "https";
          const origin =
            process.env.NEXT_PUBLIC_APP_URL ||
            (forwardedHost ? `${forwardedProto}://${forwardedHost}` : request.nextUrl?.origin || "http://localhost:3000");

          const { data: inviteData, error: inviteError } =
            await supabaseAdmin.auth.admin.inviteUserByEmail(cleanEmail, {
              redirectTo: `${origin}/auth/callback?next=/dashboard`,
              data: {
                full_name: cleanOwnerName,
                workspace_id: newWsId,
              },
            });

          if (inviteError) {
            throw new Error(`Failed to dispatch invitation: ${inviteError.message}`);
          }
          authUser = inviteData.user;
          isNewAuthUser = true;
        }
      } else {
        // User already exists in Auth: update credentials if direct mode
        if (mode === "direct" && temporary_password) {
          try {
            await supabaseAdmin.auth.admin.updateUserById(authUser.id, {
              password: temporary_password.trim(),
              user_metadata: {
                ...(authUser.user_metadata || {}),
                full_name: cleanOwnerName,
                must_change_password: true,
              },
            });
          } catch (updErr) {
            console.warn("Could not update existing user password:", updErr);
          }
        }
      }

      const ownerUserId = authUser?.id || `usr-${Date.now().toString(36)}`;
      newWorkspace.owner_user_id = ownerUserId;

      // Update workspace owner_user_id
      await supabaseAdmin
        .from("workspaces")
        .update({ owner_user_id: ownerUserId })
        .eq("id", newWsId);

      // STEP 4: Create Workspace Membership
      const memberId = `wm-${Date.now().toString(36)}-${crypto.randomBytes(3).toString("hex")}`;
      const membership = {
        id: memberId,
        workspace_id: newWsId,
        user_id: ownerUserId,
        role: role || "owner",
        status: "active",
        is_workspace_owner: true,
        joined_at: now,
      };

      const { error: memErr } = await supabaseAdmin
        .from("workspace_members")
        .upsert(membership);

      if (memErr) {
        throw new Error(`Failed to establish workspace membership: ${memErr.message}`);
      }

      // STEP 5: Provision Module Permissions for this Workspace
      if (permissions) {
        const permRows = Object.values(permissions).map((p: any) => ({
          user_id: ownerUserId,
          workspace_id: newWsId,
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

        try {
          await supabaseAdmin.from("user_permissions").upsert(permRows, {
            onConflict: "user_id,module",
          });
        } catch (permErr) {
          console.warn("Permissions upsert notice:", permErr);
        }
      }

      // STEP 6: Lifecycle Audit Log
      try {
        await supabaseAdmin.from("workspace_audit_logs").insert({
          workspace_id: newWsId,
          action: "WORKSPACE_CREATED",
          performed_by: "Primary Owner",
          target_user: cleanEmail,
          details: {
            mode,
            workspace_name: cleanName,
            code: cleanCode,
            owner_name: cleanOwnerName,
            role,
          },
          created_at: now,
        });
      } catch {}

      // STEP 7: Resolve Standard Login URL
      const forwardedHost = request.headers.get("x-forwarded-host");
      const forwardedProto = request.headers.get("x-forwarded-proto") || "https";
      const origin =
        process.env.NEXT_PUBLIC_APP_URL ||
        (forwardedHost ? `${forwardedProto}://${forwardedHost}` : request.nextUrl?.origin || "http://localhost:3000");
      const loginUrl = `${origin}/login`;

      return NextResponse.json({
        success: true,
        workspace: newWorkspace,
        owner: {
          id: ownerUserId,
          email: cleanEmail,
          name: cleanOwnerName,
          role: "Workspace Owner",
          status: "active",
        },
        login_url: loginUrl,
        mode,
        already_exists: !isNewAuthUser,
      });
    } catch (txErr: any) {
      // 7. TRANSACTION SAFETY: Rollback incomplete workspace
      console.error("[CRITICAL WORKSPACE TRANSACTION ERROR — ROLLING BACK]", txErr);

      try {
        await supabaseAdmin.from("workspace_members").delete().eq("workspace_id", newWsId);
        await supabaseAdmin.from("workspaces").delete().eq("id", newWsId);
        if (isNewAuthUser && authUser?.id) {
          await supabaseAdmin.auth.admin.deleteUser(authUser.id);
        }
      } catch (rbErr) {
        console.error("[ROLLBACK CLEANUP ERROR]", rbErr);
      }

      return NextResponse.json(
        {
          success: false,
          error: txErr.message || "Failed to complete workspace account creation. Transaction rolled back.",
        },
        { status: 500 }
      );
    }
  } catch (err: any) {
    console.error("[WORKSPACE CREATE API ERROR]", err);
    return NextResponse.json(
      { success: false, error: err.message || "Internal server error." },
      { status: 500 }
    );
  }
}
