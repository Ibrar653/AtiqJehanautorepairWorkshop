import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://dnrrwcccclulidhyglub.supabase.co";
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    "sb_publishable_lgbZ-w4vdGfniZabMwdAYw_FsPWcVx7";

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        );
        supabaseResponse = NextResponse.next({
          request,
        });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        );
      },
    },
  });

  let user = null;
  try {
    const userPromise = supabase.auth.getUser();
    const timeoutPromise = new Promise<any>((_, reject) =>
      setTimeout(() => reject(new Error("Auth timeout")), 1500)
    );
    const { data } = await Promise.race([userPromise, timeoutPromise]);
    user = data?.user || null;
  } catch {
    user = null;
  }

  const publicPaths = ["/login", "/forgot-password", "/reset-password", "/auth", "/w/"];
  const isPublicPath = publicPaths.some((p) => request.nextUrl.pathname.startsWith(p));

  // Check if this is a workspace-specific login page (e.g. /w/ibrar/login)
  const isWorkspaceLoginPath = request.nextUrl.pathname.startsWith("/w/") && request.nextUrl.pathname.endsWith("/login");

  // Redirect unauthenticated users to login (but not workspace login pages — they handle their own auth)
  if (!user && !isPublicPath) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/login";
    return NextResponse.redirect(redirectUrl);
  }

  // Redirect authenticated users away from the MAIN auth pages to /dashboard
  // Do NOT redirect workspace login pages — they handle their own post-auth redirect logic
  if (user && !isWorkspaceLoginPath && (request.nextUrl.pathname === "/login" || request.nextUrl.pathname === "/forgot-password")) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/dashboard";
    return NextResponse.redirect(redirectUrl);
  }

  return supabaseResponse;
}
