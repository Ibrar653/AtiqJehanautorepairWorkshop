import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getAdminClient, ADMIN_AUTH_CONFIG_ERROR } from "@/lib/supabase/admin";
import { createClient as createServerClient } from "@/lib/supabase/server";
import type { CreateDirectWorkspacePayload, Workspace } from "@/types/database";

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

  // Verify caller is an active platform admin
  const { data: adminRecord, error: adminErr } = await supabaseAdmin
    .from("platform_admins")
    .select("id, user_id, role, status")
    .eq("user_id", callerUser.id)
    .eq("status", "active")
    .single();

  if (adminErr || !adminRecord) {
    return NextResponse.json(
      { success: false, error: "Forbidden: Only active Platform Owners can create workspaces." },
      { status: 403 }
    );
  }

  // 2. Validate Inputs
  let body: CreateDirectWorkspacePayload;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON request payload." },
      { status: 400 }
    );
  }

  const {
    name,
    code,
    business_name,
    owner_name,
    owner_email,
    temporary_password,
    role = "owner",
    permissions,
  } = body;

  if (!name || !name.trim()) {
    return NextResponse.json(
      { success: false, error: "Workspace Name is required." },
      { status: 400 }
    );
  }

  if (!code || !code.trim()) {
    return NextResponse.json(
      { success: false, error: "Workspace Code is required." },
      { status: 400 }
    );
  }

  if (!owner_email || !owner_email.trim() || !owner_email.includes("@")) {
    return NextResponse.json(
      { success: false, error: "A valid Owner Email address is required." },
      { status: 400 }
    );
  }

  if (!owner_name || !owner_name.trim()) {
    return NextResponse.json(
      { success: false, error: "Owner Full Name is required." },
      { status: 400 }
    );
  }

  const cleanName = name.trim();
  const cleanCode = code.trim().toUpperCase();
  const cleanBusinessName = (business_name || cleanName).trim();
  const cleanEmail = owner_email.trim().toLowerCase();
  const cleanOwnerName = owner_name.trim();

  // 3. Unique Workspace Code Check
  const { data: existingCodes, error: codeErr } = await supabaseAdmin
    .from("workspaces")
    .select("id, name, workspace_code")
    .eq("workspace_code", cleanCode)
    .limit(1);

  if (codeErr) {
    console.error("[SUPABASE WORKSPACE CODE CHECK ERROR]", codeErr);
  }

  if (existingCodes && existingCodes.length > 0) {
    return NextResponse.json(
      {
        success: false,
        error: `Workspace Code "${cleanCode}" is already in use by workspace "${existingCodes[0].name}". Please choose another code.`,
      },
      { status: 400 }
    );
  }

  // 4. Resolve or Create Supabase Auth User
  let authUser: any = null;
  let isNewAuthUser = false;

  try {
    const { data: usersData, error: listErr } = await supabaseAdmin.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });

    if (!listErr && usersData?.users) {
      authUser = usersData.users.find(
        (u: any) => u.email?.toLowerCase() === cleanEmail
      );
    }
  } catch (findErr) {
    console.warn("User lookup warning:", findErr);
  }

  if (!authUser) {
    if (!temporary_password || temporary_password.trim().length < 6) {
      return NextResponse.json(
        {
          success: false,
          error: "Temporary Password must be at least 6 characters for a new account.",
        },
        { status: 400 }
      );
    }

    const { data: createData, error: createError } =
      await supabaseAdmin.auth.admin.createUser({
        email: cleanEmail,
        password: temporary_password.trim(),
        email_confirm: true,
        user_metadata: {
          full_name: cleanOwnerName,
        },
      });

    if (createError || !createData?.user) {
      return NextResponse.json(
        {
          success: false,
          error: `Failed to create Supabase Auth account: ${createError?.message || "Unknown error"}`,
        },
        { status: 500 }
      );
    }

    authUser = createData.user;
    isNewAuthUser = true;
  }

  const ownerUserId = authUser.id;
  const newWsId = crypto.randomUUID();
  const now = new Date().toISOString();

  // 5. Transactional Database Creation with Rollback
  try {
    // A. Insert Workspace as 'pending'
    const { error: wsInsertErr } = await supabaseAdmin.from("workspaces").insert({
      id: newWsId,
      name: cleanName,
      workspace_code: cleanCode,
      business_name: cleanBusinessName,
      owner_user_id: ownerUserId,
      status: "pending",
      is_primary: false,
      created_by: callerUser.id,
      created_at: now,
      updated_at: now,
    });

    if (wsInsertErr) {
      throw new Error(`Failed to insert workspace record: ${wsInsertErr.message}`);
    }

    // B. Insert Workspace Member as 'pending'
    const { error: memInsertErr } = await supabaseAdmin
      .from("workspace_members")
      .insert({
        id: crypto.randomUUID(),
        workspace_id: newWsId,
        user_id: ownerUserId,
        role: role || "owner",
        status: "pending",
        is_workspace_owner: true,
        joined_at: null,
        created_at: now,
        updated_at: now,
      });

    if (memInsertErr) {
      throw new Error(`Failed to insert workspace membership record: ${memInsertErr.message}`);
    }

    // C. Provision Permissions in user_permissions
    if (permissions && typeof permissions === "object") {
      const permRows = Object.values(permissions).map((p: any) => ({
        id: crypto.randomUUID(),
        workspace_id: newWsId,
        user_id: ownerUserId,
        module: p.module,
        access: Boolean(p.access),
        can_view: Boolean(p.can_view),
        can_create: Boolean(p.can_create),
        can_edit: Boolean(p.can_edit),
        can_delete: Boolean(p.can_delete),
        can_print: Boolean(p.can_print),
        can_export: Boolean(p.can_export),
        can_approve: Boolean(p.can_approve),
        can_transfer_money: Boolean(p.can_transfer_money ?? p.can_transfer),
        can_manual_journal: Boolean(p.can_manual_journal ?? p.can_journal),
        can_reverse_transaction: Boolean(p.can_reverse_transaction ?? p.can_reverse),
        can_permanent_delete: Boolean(p.can_permanent_delete),
        can_view_bank_balance: Boolean(p.can_view_bank_balance),
        created_at: now,
        updated_at: now,
      }));

      if (permRows.length > 0) {
        const { error: permErr } = await supabaseAdmin
          .from("user_permissions")
          .upsert(permRows, { onConflict: "workspace_id,user_id,module" });

        if (permErr) {
          throw new Error(`Failed to provision permissions: ${permErr.message}`);
        }
      }
    }

    // D. Insert Audit Event in workspace_audit_logs
    const { error: auditErr } = await supabaseAdmin
      .from("workspace_audit_logs")
      .insert({
        id: crypto.randomUUID(),
        workspace_id: newWsId,
        action: "workspace_created_pending",
        performed_by: callerUser.id,
        target_user: ownerUserId,
        details: {
          workspace_code: cleanCode,
          workspace_name: cleanName,
          role: role || "owner",
        },
        created_at: now,
      });

    if (auditErr) {
      console.warn("Audit log creation notice:", auditErr);
    }

    const createdWorkspace: Workspace = {
      id: newWsId,
      name: cleanName,
      code: cleanCode,
      workspace_code: cleanCode,
      business_name: cleanBusinessName,
      owner_user_id: ownerUserId,
      owner_name: cleanOwnerName,
      owner_email: cleanEmail,
      status: "pending",
      is_primary: false,
      created_by: callerUser.id,
      currency: body.currency || "AED",
      country: body.country || "United Arab Emirates",
      created_at: now,
      updated_at: now,
    };

    const forwardedHost = request.headers.get("x-forwarded-host");
    const forwardedProto = request.headers.get("x-forwarded-proto") || "https";
    const origin =
      process.env.NEXT_PUBLIC_APP_URL ||
      (forwardedHost ? `${forwardedProto}://${forwardedHost}` : request.nextUrl?.origin || "http://localhost:3000");

    return NextResponse.json({
      success: true,
      workspace: createdWorkspace,
      owner: {
        id: ownerUserId,
        email: cleanEmail,
        name: cleanOwnerName,
        role: role || "owner",
        status: "pending",
      },
      login_url: `${origin}/login`,
      mode: body.mode || "direct",
      already_exists: !isNewAuthUser,
    });
  } catch (err: any) {
    console.error("[WORKSPACE CREATION TRANSACTION ERROR — ROLLING BACK]", err);

    // Rollback DB records
    try {
      await supabaseAdmin.from("workspace_audit_logs").delete().eq("workspace_id", newWsId);
      await supabaseAdmin.from("user_permissions").delete().eq("workspace_id", newWsId);
      await supabaseAdmin.from("workspace_members").delete().eq("workspace_id", newWsId);
      await supabaseAdmin.from("workspaces").delete().eq("id", newWsId);
    } catch (rbErr) {
      console.error("[DB ROLLBACK ERROR]", rbErr);
    }

    // Rollback newly created Auth user ONLY
    if (isNewAuthUser && ownerUserId) {
      try {
        await supabaseAdmin.auth.admin.deleteUser(ownerUserId);
      } catch (authRbErr) {
        console.error("[AUTH ROLLBACK ERROR]", authRbErr);
      }
    }

    return NextResponse.json(
      {
        success: false,
        error: err.message || "Failed to create workspace. Rolled back successfully.",
      },
      { status: 500 }
    );
  }
}
