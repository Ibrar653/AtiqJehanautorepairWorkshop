"use client";

import React, { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Wrench,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Lock,
  Building2,
  UserCheck,
  ShieldCheck,
  KeyRound,
  ArrowRight,
  Sparkles,
} from "lucide-react";
import { APP_NAME, COMPANY_FULL_NAME } from "@/lib/constants";
import {
  validateInvitationTokenOrCode,
  acceptWorkspaceInvitation,
} from "@/lib/services/workspace-invitation-service";
import { setActiveWorkspaceId } from "@/lib/services/workspace-service";

function AcceptInviteForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const tokenParam = searchParams.get("token") || "";
  const codeParam = searchParams.get("code") || "";
  const localIdParam = searchParams.get("local_id") || "";

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [invitationData, setInvitationData] = useState<any>(null);

  // Password fields
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  // Validate on load
  useEffect(() => {
    let isMounted = true;
    async function validate() {
      if (!tokenParam && !codeParam && !localIdParam) {
        if (isMounted) {
          setError("No invitation token or code provided in the link.");
          setLoading(false);
        }
        return;
      }

      setLoading(true);
      setError(null);

      const res = await validateInvitationTokenOrCode({
        token: tokenParam || undefined,
        code: codeParam || undefined,
        local_id: localIdParam || undefined,
      });

      if (!isMounted) return;

      if (res.valid && res.invitation) {
        setInvitationData(res.invitation);
      } else {
        setError(res.error || "Invalid or expired invitation link.");
      }
      setLoading(false);
    }

    validate();
    return () => {
      isMounted = false;
    };
  }, [tokenParam, codeParam, localIdParam]);

  const handleActivate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) {
      setError("Please create a password.");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters long.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const res = await acceptWorkspaceInvitation({
        token: tokenParam || undefined,
        code: codeParam || undefined,
        local_id: localIdParam || undefined,
        email: invitationData?.email,
        new_password: password,
      });

      if (res.success) {
        setSuccess(true);
        if (invitationData?.workspace_id) {
          setActiveWorkspaceId(invitationData.workspace_id);
        }
        // Redirect to login or dashboard after 2 seconds
        setTimeout(() => {
          router.push(`/login?activated=true&email=${encodeURIComponent(invitationData?.email || "")}`);
        }, 1800);
      } else {
        setError(res.error || "Failed to activate account.");
      }
    } catch (err: any) {
      setError(err?.message || "An unexpected error occurred during activation.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="py-20 text-center flex flex-col items-center justify-center gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        <p className="text-xs font-semibold text-slate-500">
          Verifying your workspace invitation...
        </p>
      </div>
    );
  }

  if (success) {
    return (
      <Card className="border border-emerald-200 dark:border-emerald-900 bg-white dark:bg-slate-900 shadow-xl">
        <CardContent className="p-8 text-center space-y-4">
          <div className="w-16 h-16 bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-inner">
            <CheckCircle2 className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-black text-slate-900 dark:text-slate-100">
            Account Activated Successfully!
          </h2>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            Your password has been saved and your membership in{" "}
            <span className="font-bold text-slate-800 dark:text-slate-200">
              {invitationData?.workspace_name}
            </span>{" "}
            is now active. Redirecting to login...
          </p>
          <div className="pt-2">
            <Button
              onClick={() =>
                router.push(
                  `/login?activated=true&email=${encodeURIComponent(invitationData?.email || "")}`
                )
              }
              className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold gap-1.5"
            >
              Continue to Login <ArrowRight className="w-3.5 h-3.5" />
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error && !invitationData) {
    return (
      <Card className="border border-red-200 dark:border-red-900 bg-white dark:bg-slate-900 shadow-xl">
        <CardContent className="p-8 text-center space-y-4">
          <div className="w-14 h-14 bg-red-100 dark:bg-red-950/60 text-red-600 rounded-full flex items-center justify-center mx-auto">
            <AlertCircle className="w-7 h-7" />
          </div>
          <h2 className="text-lg font-black text-slate-900 dark:text-slate-100">
            Invitation Expired or Invalid
          </h2>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">{error}</p>
          <div className="pt-2">
            <Link href="/login">
              <Button variant="outline" className="text-xs font-semibold">
                Back to Sign In
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xl overflow-hidden">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-700 p-6 text-white space-y-1">
        <Badge className="bg-white/20 text-white text-[10px] uppercase font-bold tracking-wider mb-1">
          Workspace Invitation
        </Badge>
        <h2 className="text-xl font-black">YOU&apos;VE BEEN INVITED</h2>
        <p className="text-xs text-blue-100">
          Set up your private password to activate your delegated staff access.
        </p>
      </div>

      <CardContent className="p-6 space-y-5">
        {/* Workspace & Role Summary */}
        <div className="p-4 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl space-y-2 text-xs">
          <div className="flex justify-between items-center">
            <span className="text-slate-500 flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5 text-blue-600" />
              Target Workspace:
            </span>
            <span className="font-bold text-slate-900 dark:text-slate-100">
              {invitationData?.workspace_name}
            </span>
          </div>

          <div className="flex justify-between items-center">
            <span className="text-slate-500 flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-blue-600" />
              Assigned Role:
            </span>
            <Badge variant="outline" className="text-[10px] uppercase font-bold text-blue-600 border-blue-200">
              {invitationData?.role}
            </Badge>
          </div>

          <div className="flex justify-between items-center">
            <span className="text-slate-500">Invited Account:</span>
            <span className="font-medium text-slate-700 dark:text-slate-300">
              {invitationData?.email}
            </span>
          </div>
        </div>

        {error && (
          <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-xl flex items-center gap-2 text-xs font-semibold text-red-700 dark:text-red-400">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Set Password Form */}
        <form onSubmit={handleActivate} className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-slate-400" />
              Create Your Password *
            </Label>
            <Input
              type="password"
              placeholder="At least 6 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="text-xs h-9"
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-slate-400" />
              Confirm Password *
            </Label>
            <Input
              type="password"
              placeholder="Re-enter your password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="text-xs h-9"
            />
          </div>

          <Button
            type="submit"
            disabled={submitting}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs h-10 shadow-sm gap-1.5"
          >
            {submitting ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Activating Account...
              </>
            ) : (
              <>
                <KeyRound className="w-3.5 h-3.5" />
                Activate Account &amp; Access Workspace
              </>
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

export default function AcceptInvitePage() {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col justify-center items-center p-4">
      <div className="w-full max-w-md space-y-6">
        {/* Brand Header */}
        <div className="flex flex-col items-center text-center space-y-2">
          <div className="h-12 w-12 rounded-xl bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-600/25">
            <Wrench className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-black text-slate-900 dark:text-slate-100 tracking-tight">
              {APP_NAME}
            </h1>
            <p className="text-xs font-semibold text-blue-700 dark:text-blue-400 tracking-wider uppercase">
              {COMPANY_FULL_NAME}
            </p>
          </div>
        </div>

        <Suspense fallback={<div className="py-12 text-center text-xs text-slate-400">Loading...</div>}>
          <AcceptInviteForm />
        </Suspense>
      </div>
    </div>
  );
}
