"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Wrench, Loader2, AlertCircle, CheckCircle2, Lock } from "lucide-react";
import { APP_NAME } from "@/lib/constants";

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const router = useRouter();

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const supabase = createClient();
      const { error: updateError } = await supabase.auth.updateUser({
        password,
      });

      setLoading(false);

      if (updateError) {
        const rawMsg = (updateError.message || "").toLowerCase();
        if (rawMsg.includes("failed to fetch") || rawMsg.includes("fetch failed") || rawMsg.includes("networkerror")) {
          setError("Unable to connect to authentication service. Please check your network and Supabase configuration.");
        } else {
          setError(updateError.message || "Failed to update password.");
        }
        return;
      }

      setSuccess(true);
      setTimeout(() => {
        router.push("/");
      }, 2000);
    } catch (err: any) {
      setLoading(false);
      setError("An unexpected error occurred while updating password.");
    }
  };

  return (
    <div className="w-full max-w-md mx-auto space-y-6">
      {/* Brand Header */}
      <div className="flex flex-col items-center text-center space-y-2">
        <div className="h-12 w-12 rounded-xl bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-600/25">
          <Wrench className="h-6 w-6 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">{APP_NAME}</h1>
          <p className="text-xs text-slate-500">Set New Password</p>
        </div>
      </div>

      {/* Card */}
      <Card className="border border-slate-200 bg-white shadow-xl shadow-slate-200/50 rounded-xl overflow-hidden">
        <div className="h-1.5 bg-blue-600 w-full" />
        <CardHeader className="text-center pb-3 pt-6">
          <CardTitle className="text-base font-bold text-slate-900">Create New Password</CardTitle>
          <CardDescription className="text-xs text-slate-500">
            Enter and confirm your new secure account password
          </CardDescription>
        </CardHeader>
        <CardContent className="px-6 pb-6 pt-2">
          {success ? (
            <div className="space-y-3 text-center py-4">
              <div className="h-12 w-12 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto border border-emerald-200">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-bold text-slate-900">Password Updated Successfully</p>
                <p className="text-xs text-slate-600">Redirecting to workshop dashboard...</p>
              </div>
            </div>
          ) : (
            <form onSubmit={handleResetPassword} className="space-y-4">
              {error && (
                <div className="rounded-lg bg-red-50 border border-red-200 px-3.5 py-2 text-xs text-red-700 flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
                  <span>{error}</span>
                </div>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="pass" className="text-xs font-semibold text-slate-700">
                  New Password
                </Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    id="pass"
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

              <div className="space-y-1.5">
                <Label htmlFor="conf" className="text-xs font-semibold text-slate-700">
                  Confirm New Password
                </Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    id="conf"
                    type="password"
                    placeholder="••••••••"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    disabled={loading}
                    className="pl-9 h-10 text-sm bg-slate-50/50 border-slate-200 focus:bg-white"
                  />
                </div>
              </div>

              <Button
                type="submit"
                className="w-full bg-blue-600 hover:bg-blue-700 text-white h-10 text-sm font-semibold shadow-md shadow-blue-600/20"
                disabled={loading}
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Updating Password...
                  </>
                ) : (
                  "Update Password & Sign In"
                )}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
