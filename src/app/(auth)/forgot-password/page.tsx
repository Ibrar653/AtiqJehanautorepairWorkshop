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
    <div className="w-full mx-auto space-y-5">
      {/* Main Neumorphic Recovery Card */}
      <div className="rounded-[26px] bg-[#F5F9FF]/95 dark:bg-[#131E35]/95 backdrop-blur-md border border-white/80 dark:border-[#243554] shadow-[12px_12px_32px_rgba(110,142,184,0.24),-10px_-10px_28px_rgba(255,255,255,0.92)] p-7 sm:p-8">
        <div className="flex flex-col items-center text-center space-y-2.5 mb-6">
          <div className="h-14 w-14 rounded-2xl neu-btn-primary flex items-center justify-center">
            <Wrench className="h-6 w-6 text-white" />
          </div>
          <div>
            <p className="text-[11px] font-bold text-[#007BFF] uppercase tracking-[0.12em]">{APP_NAME}</p>
            <h1 className="text-xl font-bold text-[#102340] dark:text-slate-100 tracking-tight mt-0.5">Reset Your Password</h1>
            <p className="text-xs text-[#526782] dark:text-slate-400 mt-1">
              Enter your registered staff email to receive a secure recovery link
            </p>
          </div>
        </div>
        <div>
          {success ? (
            <div className="space-y-4 text-center py-3">
              <div className="h-12 w-12 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto border border-emerald-200">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-semibold text-[#102340]">Check your inbox</p>
                <p className="text-xs text-[#526782]">
                  A password reset link has been sent to <span className="font-semibold text-[#102340]">{email}</span>.
                </p>
              </div>
              <div className="pt-3">
                <Link href="/login">
                  <Button variant="outline" className="w-full h-10 text-xs">
                    Return to Sign In
                  </Button>
                </Link>
              </div>
            </div>
          ) : (
            <form onSubmit={handleResetRequest} className="space-y-4">
              {error && (
                <div className="rounded-xl bg-red-50 border border-red-200 px-3.5 py-2.5 text-xs text-red-700 flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
                  <span>{error}</span>
                </div>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-[13px] font-medium text-[#102340]">
                  Email Address
                </Label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#526782]" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="name@atiqjehan.ae"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    disabled={loading}
                    className="pl-10 h-11 text-[13.5px] rounded-xl neu-inset border-[#D6E2F0]"
                  />
                </div>
              </div>

              <Button
                type="submit"
                className="w-full h-11 text-sm font-semibold rounded-xl neu-btn-primary"
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
                  className="text-xs font-medium text-[#526782] hover:text-[#007BFF] inline-flex items-center gap-1"
                >
                  <ArrowLeft className="h-3.5 w-3.5" /> Back to Sign In
                </Link>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
