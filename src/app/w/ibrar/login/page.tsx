"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Loader2,
  AlertCircle,
  Lock,
  Mail,
  ShieldCheck,
  CheckCircle2,
  Eye,
  EyeOff,
  ArrowRight,
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
  const [showPassword, setShowPassword] = useState(false);
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
    <div className="w-full mx-auto space-y-5">
      {/* Main Premium Neumorphic Login Card */}
      <div className="rounded-[26px] bg-[#F5F9FF]/95 dark:bg-[#131E35]/95 backdrop-blur-md border border-white/80 dark:border-[#243554] shadow-[12px_12px_32px_rgba(110,142,184,0.24),-10px_-10px_28px_rgba(255,255,255,0.92)] dark:shadow-[12px_12px_32px_rgba(2,6,18,0.65)] p-7 sm:p-8">
        <div className="flex flex-col items-center text-center space-y-3 mb-6">
          <div className="h-16 w-16 rounded-2xl neu-icon-box p-2 flex items-center justify-center">
            <Image
              src="/branding/atiq-jehan-logo.png"
              alt="ATIQ JEHAN AUTO REPAIR"
              width={52}
              height={52}
              className="w-full h-full object-contain"
              priority
            />
          </div>
          <div className="space-y-1">
            <p className="text-[11px] font-bold text-[#007BFF] dark:text-blue-400 tracking-[0.12em] uppercase">
              IBRAR &bull; WORKSHOP MANAGEMENT SYSTEM
            </p>
            <h1 className="text-[26px] font-bold text-[#102340] dark:text-slate-100 tracking-tight leading-tight">
              Welcome Back
            </h1>
            <p className="text-[13px] text-[#526782] dark:text-slate-400">
              Sign in to access your assigned workspace
            </p>
          </div>
        </div>

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
              <Label htmlFor="ws-email" className="text-[13px] font-medium text-[#102340] dark:text-slate-200">
                Email Address
              </Label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#526782]" />
                <Input
                  id="ws-email"
                  type="email"
                  placeholder="name@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={loading}
                  className="pl-10 h-11 text-[13.5px] rounded-xl neu-inset border-[#D6E2F0] focus-visible:border-[#007BFF]"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="ws-password" className="text-[13px] font-medium text-[#102340] dark:text-slate-200">
                  Password
                </Label>
                <a
                  href="/forgot-password"
                  className="text-xs font-medium text-[#007BFF] hover:text-[#1746D1] hover:underline"
                >
                  Forgot password?
                </a>
              </div>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#526782]" />
                <Input
                  id="ws-password"
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={loading}
                  className="pl-10 pr-10 h-11 text-[13.5px] rounded-xl neu-inset border-[#D6E2F0] focus-visible:border-[#007BFF]"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#64748B] hover:text-[#007BFF] p-1 rounded-lg transition-colors"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between text-xs pt-0.5">
              <label className="flex items-center gap-2 cursor-pointer select-none text-[#526782] dark:text-slate-400 font-medium">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="rounded border-[#D6E2F0] text-[#007BFF] focus:ring-[#007BFF] h-4 w-4"
                />
                Remember this device
              </label>
            </div>

            <Button
              type="submit"
              className="w-full h-11 text-sm font-semibold rounded-xl neu-btn-primary mt-2"
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Authenticating...
                </>
              ) : (
                <>
                  Sign In
                  <ArrowRight className="ml-1 h-4 w-4" />
                </>
              )}
            </Button>
          </form>
      </div>

      {/* Security notice */}
      <div className="flex items-center justify-center gap-1.5 text-xs text-[#526782] dark:text-slate-400 font-medium">
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
