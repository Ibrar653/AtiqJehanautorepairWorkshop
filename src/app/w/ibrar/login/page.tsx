"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Wrench,
  Loader2,
  AlertCircle,
  Lock,
  Mail,
  ShieldCheck,
  CheckCircle2,
} from "lucide-react";
import {
  getWorkspaceBySlug,
  verifyWorkspaceMembership,
  ensureWorkspaceMembership,
  setActiveWorkspaceId,
  setWorkspaceLoginReturnUrl,
} from "@/lib/services/workspace-service";

const WORKSPACE_SLUG = "ibrar";
const WORKSPACE_LOGIN_PATH = "/w/ibrar/login";

function IbrarLoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [initialCheckDone, setInitialCheckDone] = useState(false);

  const router = useRouter();

  // If already logged in with active session AND has ibrar membership, redirect to /dashboard
  useEffect(() => {
    const checkActiveSession = async () => {
      try {
        const supabase = createClient();
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (session?.user) {
          // Verify this user has ibrar workspace access
          const workspace = await getWorkspaceBySlug(WORKSPACE_SLUG);
          if (workspace) {
            const membership = await verifyWorkspaceMembership(session.user.id, workspace.id);
            if (membership.isMember) {
              setActiveWorkspaceId(workspace.id);
              setWorkspaceLoginReturnUrl(WORKSPACE_LOGIN_PATH);
              router.push("/dashboard");
              return;
            }
          }
          // User is authenticated but doesn't have ibrar access — sign them out
          // so they can login with a valid ibrar account
          await supabase.auth.signOut();
        }
      } catch {
        // Continue rendering login form
      } finally {
        setInitialCheckDone(true);
      }
    };
    checkActiveSession();
  }, [router]);

  // ─── LOGIN SUBMISSION ────────────────────────────────────────────────────────
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const normalizedInputEmail = email.trim().toLowerCase();

    if (!normalizedInputEmail) {
      setError("Please enter your email address.");
      return;
    }
    if (!password) {
      setError("Please enter your password.");
      return;
    }

    setLoading(true);
    setError(null);
    setInfoMessage(null);

    try {
      const supabase = createClient();

      // Step 1: Authenticate with Supabase
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email: normalizedInputEmail,
        password,
      });

      if (authError) {
        setError("Invalid email or password.");
        setLoading(false);
        return;
      }

      if (!data?.user) {
        setError("Authentication failed. Please try again.");
        setLoading(false);
        return;
      }

      const authUserId = data.user.id;
      const authEmail = (data.user.email || "").trim().toLowerCase();

      // Step 2: Resolve the ibrar workspace
      const workspace = await getWorkspaceBySlug(WORKSPACE_SLUG);
      if (!workspace) {
        await supabase.auth.signOut();
        setError("Workspace not found. Please contact the administrator.");
        setLoading(false);
        return;
      }

      // Step 3: Ensure membership exists for this auth user
      await ensureWorkspaceMembership(authUserId, authEmail, workspace.id);

      // Step 4: Verify active membership
      const membership = await verifyWorkspaceMembership(authUserId, workspace.id);

      if (!membership.isMember) {
        await supabase.auth.signOut();
        setError("You do not have access to this workspace.");
        setLoading(false);
        return;
      }

      // Step 5: Set workspace context and redirect
      setActiveWorkspaceId(workspace.id);
      setWorkspaceLoginReturnUrl(WORKSPACE_LOGIN_PATH);

      router.push("/dashboard");
      router.refresh();
    } catch (err: any) {
      console.error("Workspace login error:", err);
      setError("Invalid email or password.");
      setLoading(false);
    }
  };

  // Don't render form until initial session check completes
  if (!initialCheckDone) {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-3">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        <p className="text-sm text-slate-500">Loading workspace...</p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md mx-auto space-y-6">
      {/* Brand Header */}
      <div className="flex flex-col items-center text-center space-y-2.5">
        <div className="h-14 w-14 rounded-2xl bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-600/25">
          <Wrench className="h-7 w-7 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight uppercase">
            IBRAR
          </h1>
          <p className="text-xs font-semibold text-blue-700 tracking-wider uppercase">
            Workshop Management System
          </p>
        </div>
      </div>

      {/* Main Login Card */}
      <Card className="border border-slate-200/80 shadow-xl shadow-slate-200/50 bg-white">
        <CardHeader className="space-y-1 pb-4">
          <CardTitle className="text-lg font-bold text-slate-900">Sign In</CardTitle>
          <CardDescription className="text-xs text-slate-500">
            Sign in to your workspace
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            {/* Informational Message */}
            {infoMessage && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2.5 text-xs text-emerald-800 font-semibold animate-in fade-in-50">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                <span>{infoMessage}</span>
              </div>
            )}

            {/* Error Message */}
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2.5 text-xs text-red-700">
                <AlertCircle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
                <span className="leading-relaxed font-medium">{error}</span>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="ws-email" className="text-xs font-semibold text-slate-700">
                Email Address
              </Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  id="ws-email"
                  type="email"
                  placeholder="name@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={loading}
                  className="pl-9 h-10 text-sm bg-slate-50/50 border-slate-200 focus:bg-white"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="ws-password" className="text-xs font-semibold text-slate-700">
                  Password
                </Label>
                <a
                  href="/forgot-password"
                  className="text-xs font-medium text-blue-600 hover:text-blue-700 hover:underline"
                >
                  Forgot password?
                </a>
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  id="ws-password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={loading}
                  className="pl-9 h-10 text-sm bg-slate-50/50 border-slate-200 focus:bg-white"
                />
              </div>
            </div>

            <div className="flex items-center justify-between text-xs pt-1">
              <label className="flex items-center gap-2 cursor-pointer select-none text-slate-600 font-medium">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 h-3.5 w-3.5"
                />
                Remember this device
              </label>
            </div>

            <Button
              type="submit"
              className="w-full bg-blue-600 hover:bg-blue-700 text-white h-10 text-sm font-semibold shadow-md shadow-blue-600/20 mt-2"
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Authenticating...
                </>
              ) : (
                "Sign In"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Security notice */}
      <div className="flex items-center justify-center gap-1.5 text-xs text-slate-500">
        <ShieldCheck className="h-4 w-4 text-emerald-600" />
        <span>Secure Workspace Access</span>
      </div>
    </div>
  );
}

export default function IbrarLoginPage() {
  return (
    <Suspense
      fallback={
        <div className="py-12 text-center text-slate-500 text-sm">
          Loading workspace login...
        </div>
      }
    >
      <IbrarLoginForm />
    </Suspense>
  );
}
