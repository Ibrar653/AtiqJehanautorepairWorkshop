"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import {
  Wrench,
  Loader2,
  AlertCircle,
  Lock,
  Mail,
  ShieldCheck,
  KeyRound,
  Building2,
  CheckCircle2,
  ArrowRight,
  Sparkles,
} from "lucide-react";
import { APP_NAME, COMPANY_FULL_NAME, PRIMARY_OWNER_EMAIL } from "@/lib/constants";
import { getLocalUsers, saveLocalUsers, logUserActivity } from "@/lib/services/user-service";
import {
  getLocalMembers,
  saveLocalMembers,
  saveLocalWorkspaces,
  getWorkspaces,
  setActiveWorkspaceId,
} from "@/lib/services/workspace-service";
import { acceptWorkspaceInvitation } from "@/lib/services/workspace-invitation-service";
import type { Workspace } from "@/types/database";

function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  // Manual Activation Code Modal State
  const [codeModalOpen, setCodeModalOpen] = useState(false);
  const [codeEmail, setCodeEmail] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [codePassword, setCodePassword] = useState("");
  const [codeConfirmPassword, setCodeConfirmPassword] = useState("");
  const [codeSubmitting, setCodeSubmitting] = useState(false);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [codeSuccess, setCodeSuccess] = useState<string | null>(null);

  // Multi-Workspace Picker Modal State
  const [workspacePickerOpen, setWorkspacePickerOpen] = useState(false);
  const [userWorkspaces, setUserWorkspaces] = useState<Workspace[]>([]);

  const router = useRouter();
  const searchParams = useSearchParams();

  // Pre-fill email or activated notice from query parameters
  useEffect(() => {
    const emailParam = searchParams.get("email");
    if (emailParam) {
      setEmail(emailParam);
    }
    const activatedParam = searchParams.get("activated");
    if (activatedParam === "true") {
      setInfoMessage("Account successfully activated! Please enter your password to sign in.");
    }
    const errParam = searchParams.get("error");
    if (errParam === "unauthorized") {
      setError("Access denied. This account is not authorized.");
    } else if (errParam === "inactive") {
      setError("Your account has been deactivated or suspended. Please contact the workshop administrator.");
    }
  }, [searchParams]);

  // If already logged in with active session, redirect to /dashboard
  useEffect(() => {
    const checkActiveSession = async () => {
      try {
        const supabase = createClient();
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (session?.user) {
          router.push("/dashboard");
        }
      } catch {
        // Continue rendering login form
      }
    };
    checkActiveSession();
  }, [router]);

  // ─── LOGIN SUBMISSION & WORKSPACE ROUTING ─────────────────────────────────
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
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email: normalizedInputEmail,
        password,
      });

      if (authError) {
        // Offline / mock authentication check for local dev testing
        const localUsers = getLocalUsers();
        const mockUser = localUsers.find((u) => u.email.toLowerCase() === normalizedInputEmail);

        if (!mockUser) {
          setError("Invalid email or password.");
          setLoading(false);
          return;
        }

        // Check active memberships for workspace routing
        await handlePostLoginRouting(mockUser.id, normalizedInputEmail, mockUser.full_name, mockUser.role);
        return;
      }

      if (data?.user) {
        const authenticatedEmail = (data.user.email || "").trim().toLowerCase();
        const isPrimaryOwner = authenticatedEmail === PRIMARY_OWNER_EMAIL.toLowerCase();

        if (isPrimaryOwner) {
          await logUserActivity({
            user_id: data.user.id || "usr-owner-001",
            user_email: authenticatedEmail,
            user_name: "Atiq Jehan (Owner)",
            action: "LOGIN",
            module: "auth",
            description: "Owner logged in with full administrative privileges",
          });

          router.push("/dashboard");
          router.refresh();
          return;
        }

        // Non-Primary Owner: Resolve workspace strictly from Supabase workspace_members
        const userMeta = data.user.user_metadata || {};
        const metaFullName = userMeta.full_name || authenticatedEmail.split("@")[0];

        await handlePostLoginRouting(
          data.user.id,
          authenticatedEmail,
          metaFullName,
          "owner",
          userMeta.workspace_id
        );
      }
    } catch (err: any) {
      console.error("Login catch error:", err);
      setError("Invalid email or password.");
      setLoading(false);
    }
  };

  // ─── POST-LOGIN WORKSPACE ROUTING (DATABASE-BACKED) ──────────────────────
  const handlePostLoginRouting = async (
    userId: string,
    userEmail: string,
    userName: string,
    role: string,
    assignedWorkspaceId?: string
  ) => {
    const supabase = createClient();
    let memberWorkspaces: Workspace[] = [];
    let memberRole = role || "owner";

    try {
      // 1. Fetch user's active workspace memberships directly from Supabase
      const { data: dbMembers, error: dbError } = await supabase
        .from("workspace_members")
        .select("id, workspace_id, user_id, role, status, is_workspace_owner, permissions")
        .or(`user_id.eq.${userId},user_id.eq.${userEmail}`)
        .eq("status", "active");

      if (!dbError && dbMembers && dbMembers.length > 0) {
        const wsIds = dbMembers.map((m) => m.workspace_id).filter(Boolean);
        if (wsIds.length > 0) {
          const { data: wsRows, error: wsErr } = await supabase
            .from("workspaces")
            .select("*")
            .in("id", wsIds);

          if (!wsErr && wsRows) {
            for (const ws of wsRows) {
              if (ws.status === "active" || !ws.status) {
                memberWorkspaces.push(ws as Workspace);
              }
            }
          }
        }
        if (dbMembers[0]?.role) {
          memberRole = dbMembers[0].role;
        }
      }

      // 2. If no DB memberships found, check user metadata workspace_id
      if (memberWorkspaces.length === 0 && assignedWorkspaceId) {
        const { data: wsData, error: wsError } = await supabase
          .from("workspaces")
          .select("*")
          .eq("id", assignedWorkspaceId)
          .single();

        if (!wsError && wsData && (wsData.status === "active" || !wsData.status)) {
          memberWorkspaces.push(wsData as Workspace);
        }
      }

      // 3. Fallback to local storage memberships if database is offline or local dev
      if (memberWorkspaces.length === 0) {
        const allMembers = getLocalMembers();
        const activeMembers = allMembers.filter(
          (m) =>
            (m.user_id === userId || m.user_id.toLowerCase() === userEmail.toLowerCase()) &&
            m.status === "active"
        );
        const allWorkspaces = await getWorkspaces(userEmail);
        const localMatched = allWorkspaces.filter((w) =>
          activeMembers.some((m) => m.workspace_id === w.id) && (w.status === "active" || !w.status)
        );
        if (localMatched.length > 0) {
          memberWorkspaces = localMatched;
        }
      }
    } catch (queryErr) {
      console.warn("Could not query workspace memberships from database:", queryErr);
    }

    // STRICT ACCESS ENFORCEMENT: Never fall back to DEFAULT_WORKSPACE_ID for non-primary owners!
    if (memberWorkspaces.length === 0) {
      try {
        await supabase.auth.signOut();
      } catch {}

      setError("Access Denied: No active workspace found for this account. Please contact the workshop administrator.");
      setLoading(false);
      return;
    }

    // Sync resolved workspaces into local cache for this browser session
    try {
      const existingLocalWs = await getWorkspaces(userEmail);
      const mergedWs = [...existingLocalWs];
      for (const nw of memberWorkspaces) {
        const idx = mergedWs.findIndex((w) => w.id === nw.id);
        if (idx >= 0) mergedWs[idx] = nw;
        else mergedWs.push(nw);
      }
      saveLocalWorkspaces(mergedWs);

      // Sync local user record for UI display
      const localUsers = getLocalUsers();
      const existingUserIdx = localUsers.findIndex(
        (u) => u.email.toLowerCase() === userEmail.toLowerCase()
      );
      if (existingUserIdx >= 0) {
        localUsers[existingUserIdx].workspace_id = memberWorkspaces[0].id;
        localUsers[existingUserIdx].role = memberRole as any;
        saveLocalUsers(localUsers);
      } else {
        localUsers.push({
          id: userId,
          email: userEmail,
          full_name: userName || userEmail.split("@")[0],
          role: memberRole as any,
          workspace_id: memberWorkspaces[0].id,
          is_active: true,
          status: "active",
          created_at: new Date().toISOString(),
        } as any);
        saveLocalUsers(localUsers);
      }

      // Sync local members
      const localMembers = getLocalMembers();
      for (const nw of memberWorkspaces) {
        const mIdx = localMembers.findIndex(
          (m) =>
            (m.user_id === userId || m.user_id.toLowerCase() === userEmail.toLowerCase()) &&
            m.workspace_id === nw.id
        );
        if (mIdx === -1) {
          localMembers.push({
            id: `wm-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
            workspace_id: nw.id,
            user_id: userId,
            role: memberRole as any,
            status: "active",
            is_workspace_owner: memberRole === "owner",
            joined_at: new Date().toISOString(),
          });
        }
      }
      saveLocalMembers(localMembers);
    } catch (cacheErr) {
      console.warn("Failed to sync workspace cache locally", cacheErr);
    }

    // Log Activity
    try {
      await logUserActivity({
        user_id: userId,
        user_email: userEmail,
        user_name: userName,
        action: "LOGIN",
        module: "auth",
        description: `User ${userName} (${memberRole.toUpperCase()}) authenticated successfully`,
      });
    } catch {}

    // RULE 1: Exactly ONE workspace -> route directly to dashboard
    if (memberWorkspaces.length === 1) {
      setActiveWorkspaceId(memberWorkspaces[0].id);
      router.push("/dashboard");
      router.refresh();
      return;
    }

    // RULE 2: Multiple workspaces -> show workspace selector
    setUserWorkspaces(memberWorkspaces);
    setWorkspacePickerOpen(true);
    setLoading(false);
  };

  const handleSelectWorkspace = (wsId: string) => {
    setActiveWorkspaceId(wsId);
    try {
      const localUsers = getLocalUsers();
      const userIdx = localUsers.findIndex((u) => u.email.toLowerCase() === email.trim().toLowerCase());
      if (userIdx >= 0) {
        localUsers[userIdx].workspace_id = wsId;
        saveLocalUsers(localUsers);
      }
    } catch {}
    setWorkspacePickerOpen(false);
    router.push("/dashboard");
    router.refresh();
  };

  // ─── MANUAL CODE ACTIVATION HANDLER (REQUIREMENT 6) ───────────────────────
  const handleActivateWithCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!codeEmail.trim() || !codeEmail.includes("@")) {
      setCodeError("Please enter the email address the invitation was sent to.");
      return;
    }
    if (!inviteCode.trim()) {
      setCodeError("Please enter your 8-character invitation code (e.g. AJ-7K4P-92XM).");
      return;
    }
    if (!codePassword || codePassword.length < 6) {
      setCodeError("Password must be at least 6 characters long.");
      return;
    }
    if (codePassword !== codeConfirmPassword) {
      setCodeError("Passwords do not match.");
      return;
    }

    setCodeSubmitting(true);
    setCodeError(null);

    try {
      const res = await acceptWorkspaceInvitation({
        email: codeEmail.trim().toLowerCase(),
        code: inviteCode.trim().toUpperCase(),
        new_password: codePassword,
      });

      if (res.success && res.activated_user) {
        setCodeSuccess("Account activated! You can now sign in with your email and password.");
        setEmail(codeEmail.trim().toLowerCase());
        setPassword(codePassword);
        if (res.activated_user.workspace_id) {
          setActiveWorkspaceId(res.activated_user.workspace_id);
        }
        setTimeout(() => {
          setCodeModalOpen(false);
          setCodeSuccess(null);
          setInfoMessage("Invitation accepted! Click 'Sign In' below to open your workspace.");
        }, 1500);
      } else {
        setCodeError(res.error || "Invalid or expired invitation code.");
      }
    } catch (err: any) {
      setCodeError(err?.message || "Failed to activate invitation.");
    } finally {
      setCodeSubmitting(false);
    }
  };

  return (
    <div className="w-full max-w-md mx-auto space-y-6">
      {/* Brand Header */}
      <div className="flex flex-col items-center text-center space-y-2.5">
        <div className="h-14 w-14 rounded-2xl bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-600/25">
          <Wrench className="h-7 w-7 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">{APP_NAME}</h1>
          <p className="text-xs font-semibold text-blue-700 tracking-wider uppercase">
            Auto Workshop Management
          </p>
        </div>
      </div>

      {/* Main Login Card */}
      <Card className="border border-slate-200/80 shadow-xl shadow-slate-200/50 bg-white">
        <CardHeader className="space-y-1 pb-4">
          <CardTitle className="text-lg font-bold text-slate-900">Sign In</CardTitle>
          <CardDescription className="text-xs text-slate-500">
            Enter your email and private password to access your assigned workshop
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
              <Label htmlFor="email" className="text-xs font-semibold text-slate-700">
                Email Address
              </Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  id="email"
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
                <Label htmlFor="password" className="text-xs font-semibold text-slate-700">
                  Password
                </Label>
                <Link
                  href="/forgot-password"
                  className="text-xs font-medium text-blue-600 hover:text-blue-700 hover:underline"
                >
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  id="password"
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

          {/* ─── OPTIONAL MANUAL CODE ACTIVATION TRIGGER (REQUIREMENT 6) ─── */}
          <div className="mt-5 pt-4 border-t border-slate-100 text-center">
            <p className="text-xs text-slate-500">
              Received an invitation to join a workshop?
            </p>
            <Button
              type="button"
              variant="outline"
              onClick={() => setCodeModalOpen(true)}
              className="mt-2 text-xs font-bold border-blue-200 text-blue-700 hover:bg-blue-50 h-8 gap-1.5"
            >
              <KeyRound className="w-3.5 h-3.5 text-blue-600" />
              Have an invitation code? Activate Invitation
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Security notice */}
      <div className="flex items-center justify-center gap-1.5 text-xs text-slate-500">
        <ShieldCheck className="h-4 w-4 text-emerald-600" />
        <span>Authorized Multi-Tenant Workshop Access Only</span>
      </div>

      {/* ─── MODAL 1: MANUAL CODE ACTIVATION DIALOG ─────────────────────────── */}
      <Dialog open={codeModalOpen} onOpenChange={setCodeModalOpen}>
        <DialogContent className="max-w-md bg-white p-6">
          <DialogHeader className="pb-2">
            <DialogTitle className="text-base font-bold flex items-center gap-2 text-slate-900">
              <KeyRound className="w-5 h-5 text-blue-600" />
              Activate One-Time Invitation Code
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Enter your invited email address, the one-time code provided by the workshop owner, and set your private password.
            </DialogDescription>
          </DialogHeader>

          {codeError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2 text-xs font-semibold text-red-700">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{codeError}</span>
            </div>
          )}

          {codeSuccess && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2 text-xs font-semibold text-emerald-800">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{codeSuccess}</span>
            </div>
          )}

          <form onSubmit={handleActivateWithCode} className="space-y-3.5 pt-1">
            <div className="space-y-1">
              <Label className="text-xs font-bold text-slate-700">Invited Email Address *</Label>
              <Input
                type="email"
                placeholder="e.g. ahmed@example.com"
                value={codeEmail}
                onChange={(e) => setCodeEmail(e.target.value)}
                className="text-xs h-9"
                required
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-bold text-slate-700">One-Time Invitation Code *</Label>
              <Input
                placeholder="e.g. AJ-7K4P-92XM"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value)}
                className="text-xs font-mono uppercase tracking-wider h-9"
                required
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-bold text-slate-700">Create Private Password *</Label>
              <Input
                type="password"
                placeholder="At least 6 characters"
                value={codePassword}
                onChange={(e) => setCodePassword(e.target.value)}
                className="text-xs h-9"
                required
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-bold text-slate-700">Confirm Password *</Label>
              <Input
                type="password"
                placeholder="Re-enter password"
                value={codeConfirmPassword}
                onChange={(e) => setCodeConfirmPassword(e.target.value)}
                className="text-xs h-9"
                required
              />
            </div>

            <DialogFooter className="pt-3">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setCodeModalOpen(false)}
                className="text-xs h-9"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={codeSubmitting}
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs h-9 px-4"
              >
                {codeSubmitting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> Activating...
                  </>
                ) : (
                  "Activate & Sign In"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ─── MODAL 2: MULTI-WORKSPACE PICKER (REQUIREMENT 8) ────────────────── */}
      <Dialog open={workspacePickerOpen} onOpenChange={setWorkspacePickerOpen}>
        <DialogContent className="max-w-md bg-white p-6">
          <DialogHeader className="pb-2">
            <DialogTitle className="text-base font-bold flex items-center gap-2 text-slate-900">
              <Building2 className="w-5 h-5 text-blue-600" />
              Choose Workspace
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              You hold active membership across multiple independent workshops. Select which workspace you want to open:
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2.5 py-2">
            {userWorkspaces.map((ws) => (
              <div
                key={ws.id}
                onClick={() => handleSelectWorkspace(ws.id)}
                className="p-3.5 rounded-xl border border-slate-200 hover:border-blue-600 hover:bg-blue-50/40 transition-all cursor-pointer flex items-center justify-between group"
              >
                <div className="space-y-0.5">
                  <h4 className="text-xs font-bold text-slate-900 group-hover:text-blue-600 flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5 text-slate-400 group-hover:text-blue-600" />
                    {ws.name}
                    {ws.code && (
                      <Badge variant="outline" className="text-[9px] font-mono text-blue-700 bg-blue-50 border-blue-200">
                        {ws.code}
                      </Badge>
                    )}
                  </h4>
                  <p className="text-[11px] text-slate-500">{ws.business_name || ws.name}</p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs font-semibold group-hover:bg-blue-600 group-hover:text-white group-hover:border-blue-600"
                >
                  Open <ArrowRight className="w-3 h-3 ml-1" />
                </Button>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="py-12 text-center text-slate-500 text-sm">
          Loading login portal...
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
