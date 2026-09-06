import { NextRequest, NextResponse } from "next/server";
import { getAdminClient, ADMIN_AUTH_CONFIG_ERROR } from "@/lib/supabase/admin";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, role, full_name } = body;

    if (!email || !email.includes("@")) {
      return NextResponse.json(
        { success: false, error: "A valid email address is required." },
        { status: 400 }
      );
    }

    const forwardedHost = request.headers.get("x-forwarded-host");
    const forwardedProto = request.headers.get("x-forwarded-proto") || "https";
    const origin =
      process.env.NEXT_PUBLIC_APP_URL ||
      (forwardedHost ? `${forwardedProto}://${forwardedHost}` : (request.nextUrl?.origin || "http://localhost:3000"));

    let supabaseAdmin;
    try {
      supabaseAdmin = getAdminClient();
    } catch {
      return NextResponse.json(
        { success: false, error: ADMIN_AUTH_CONFIG_ERROR },
        { status: 500 }
      );
    }

    const { data, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(email.trim().toLowerCase(), {
      redirectTo: `${origin}/auth/callback?next=/dashboard`,
      data: {
        role: role || "viewer",
        full_name: full_name || "Staff Member",
      },
    });

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Official Supabase invitation email dispatched to ${email}.`,
      user: data.user,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || "Failed to process invitation" },
      { status: 500 }
    );
  }
}
