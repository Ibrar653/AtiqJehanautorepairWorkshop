"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Wrench, Loader2, AlertCircle, CheckCircle2, ArrowLeft, Mail } from "lucide-react";
import { APP_NAME } from "@/lib/constants";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleResetRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !email.includes("@")) {
      setError("Please enter a valid email address.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const supabase = createClient();
      const redirectTo = typeof window !== "undefined"
        ? `${window.location.origin}/auth/callback?next=/reset-password`
        : undefined;

      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo,
      });

      setLoading(false);

      if (resetError) {
        const rawMsg = (resetError.message || "").toLowerCase();
        if (rawMsg.includes("failed to fetch") || rawMsg.includes("fetch failed") || rawMsg.includes("networkerror")) {
          setError("Unable to connect to authentication service. Please check your Supabase credentials in .env.local.");
        } else {
          setError(resetError.message || "Failed to send reset link.");
        }
        return;
      }

      setSuccess(true);
    } catch (err: any) {
      setLoading(false);
      setError("Unable to connect to authentication service. Please verify network and Supabase configuration.");
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
          <p className="text-xs text-slate-500">Password Recovery</p>
        </div>
      </div>

      {/* Card */}
      <Card className="border border-slate-200 bg-white shadow-xl shadow-slate-200/50 rounded-xl overflow-hidden">
        <div className="h-1.5 bg-blue-600 w-full" />
        <CardHeader className="text-center pb-3 pt-6">
          <CardTitle className="text-base font-bold text-slate-900">Reset Your Password</CardTitle>
          <CardDescription className="text-xs text-slate-500">
            Enter your registered staff email to receive a secure recovery link
          </CardDescription>
        </CardHeader>
        <CardContent className="px-6 pb-6 pt-2">
          {success ? (
            <div className="space-y-4 text-center py-3">
              <div className="h-12 w-12 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto border border-emerald-200">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-semibold text-slate-900">Check your inbox</p>
                <p className="text-xs text-slate-600">
                  A password reset link has been sent to <span className="font-semibold text-slate-900">{email}</span>.
                </p>
              </div>
              <div className="pt-3">
                <Link href="/login">
                  <Button variant="outline" className="w-full h-9 text-xs">
                    Return to Sign In
                  </Button>
                </Link>
              </div>
            </div>
          ) : (
            <form onSubmit={handleResetRequest} className="space-y-4">
              {error && (
                <div className="rounded-lg bg-red-50 border border-red-200 px-3.5 py-2 text-xs text-red-700 flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
                  <span>{error}</span>
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
                    placeholder="name@atiqjehan.ae"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
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
                    Sending Reset Link...
                  </>
                ) : (
                  "Send Reset Link"
                )}
              </Button>

              <div className="text-center pt-2">
                <Link
                  href="/login"
                  className="text-xs font-medium text-slate-600 hover:text-blue-600 inline-flex items-center gap-1"
                >
                  <ArrowLeft className="h-3.5 w-3.5" /> Back to Sign In
                </Link>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
