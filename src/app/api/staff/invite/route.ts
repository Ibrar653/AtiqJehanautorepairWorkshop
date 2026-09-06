import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://dnrrwcccclulidhyglub.supabase.co";
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    const forwardedHost = request.headers.get("x-forwarded-host");
    const forwardedProto = request.headers.get("x-forwarded-proto") || "https";
    const origin =
      process.env.NEXT_PUBLIC_APP_URL ||
      (forwardedHost ? `${forwardedProto}://${forwardedHost}` : (request.nextUrl?.origin || "http://localhost:3000"));

    if (serviceRoleKey) {
      // Server-side only elevated Supabase admin client
      const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      });

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
    }

    // Offline / Local development fallback without service role key
    return NextResponse.json({
      success: true,
      message: `Staff invitation link generated and simulated for ${email}.`,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || "Failed to process invitation" },
      { status: 500 }
    );
  }
}
