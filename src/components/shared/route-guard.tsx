"use client";

import React, { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { usePermissions } from "@/lib/context/auth-context";
import { ALL_APP_MODULES } from "@/lib/constants";
import { createAccessRequest } from "@/lib/services/access-request-service";
import type { AppModule } from "@/types/database";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ShieldAlert, ArrowLeft, LayoutDashboard, Lock, Send, CheckCircle2, Clock } from "lucide-react";

export function RouteGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, isOwner, hasModuleAccess, loading, isAccessExpired } = usePermissions();

  const [showRequestForm, setShowRequestForm] = useState(false);
  const [requestReason, setRequestReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [requestSent, setRequestSent] = useState(false);
  const [requestMessage, setRequestMessage] = useState("");

  // If auth is still loading, allow initial render
  if (loading) {
    return <>{children}</>;
  }

  // If unauthenticated, redirect to login
  if (!user) {
    if (typeof window !== "undefined") {
      router.replace("/login");
    }
    return null;
  }

  // If Owner: Unrestricted full access
  if (isOwner) {
    return <>{children}</>;
  }

  // Determine current module from pathname
  const getModuleForPath = (path: string): AppModule | null => {
    if (path === "/" || path === "") return "dashboard";
    const segment = path.split("/")[1]?.toLowerCase();
    switch (segment) {
      case "customers":
        return "customers";
      case "job-cards":
        return "job_cards";
      case "services":
        return "services";
      case "parts":
        return "spare_parts";
      case "inventory":
        return "inventory";
      case "suppliers":
        return "suppliers";
      case "purchases":
        return "purchases";
      case "invoices":
        return "invoices";
      case "payments":
        return "payments";
      case "expenses":
        return "expenses";
      case "accounts":
        return "accounts";
      case "reports":
        return "reports";
      case "recycle-bin":
        return "recycle_bin";
      case "settings":
        return "settings";
      default:
        return null;
    }
  };

  const currentModule = getModuleForPath(pathname);

  // If path doesn't map to a protected module or is allowed, render page
  if (!currentModule || (hasModuleAccess(currentModule) && !isAccessExpired)) {
    return <>{children}</>;
  }

  // Find module definition
  const modDef = ALL_APP_MODULES.find((m) => m.id === currentModule);
  const moduleName = modDef ? modDef.label : currentModule.toUpperCase();

  const handleSendAccessRequest = async () => {
    if (!user || !currentModule) return;
    setSubmitting(true);
    try {
      const res = await createAccessRequest({
        user_id: user.id,
        user_name: user.full_name || user.email,
        user_email: user.email,
        requested_module: currentModule,
        requested_action: "view",
        reason: requestReason.trim() || "Staff member requested operational module access.",
      });

      if (res.success) {
        setRequestSent(true);
        setRequestMessage(res.error || "Access request submitted to Primary Owner successfully.");
      }
    } catch (err: any) {
      setRequestSent(true);
      setRequestMessage("Access request logged and queued for Owner review.");
    } finally {
      setSubmitting(false);
    }
  };

  // Access Denied Screen (Strict Route Protection)
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] p-4 text-center">
      <Card className="max-w-md w-full border-red-200 dark:border-red-900 shadow-xl bg-white dark:bg-slate-900 overflow-hidden">
        <div className="h-2 bg-red-600" />
        <CardContent className="pt-8 pb-6 px-6 space-y-4">
          <div className="h-16 w-16 rounded-full bg-red-100 dark:bg-red-950/60 text-red-600 dark:text-red-400 flex items-center justify-center mx-auto border-2 border-red-200 dark:border-red-900 shadow-sm">
            <ShieldAlert className="h-8 w-8" />
          </div>

          <div className="space-y-1.5">
            <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">
              {isAccessExpired ? "Temporary Access Expired" : "Access Denied"}
            </h2>
            <p className="text-xs text-red-600 dark:text-red-400 font-semibold uppercase tracking-wider flex items-center justify-center gap-1">
              <Lock className="w-3.5 h-3.5" />
              {isAccessExpired ? "Account Access Window Concluded" : "Restricted Software Module"}
            </p>
          </div>

          <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
            {isAccessExpired ? (
              <>
                Your temporary access to the system expired on{" "}
                <strong className="text-slate-900 dark:text-slate-200">
                  {user?.access_expiry_date ? new Date(user.access_expiry_date).toLocaleDateString() : "recent date"}
                </strong>
                . Please contact the workshop Owner to renew your delegated access credentials.
              </>
            ) : (
              <>
                Your staff account (<strong className="text-slate-900 dark:text-slate-200">{user?.full_name || user?.email}</strong>) does not have permission to view or manage the <strong className="text-slate-900 dark:text-slate-100">{moduleName}</strong> module.
              </>
            )}
          </p>

          <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-lg text-xs text-slate-500 border border-slate-200 dark:border-slate-800 text-left">
            <div className="flex justify-between items-center mb-1">
              <span>Role: <span className="font-semibold text-slate-800 dark:text-slate-200 uppercase">{user?.role || "Viewer"}</span></span>
              <span>Status: <span className={`font-semibold ${isAccessExpired ? "text-amber-600" : "text-emerald-600"}`}>{isAccessExpired ? "Expired" : "Active"}</span></span>
            </div>
            <div className="text-[11px] text-slate-400">
              Data Scope: <span className="font-medium text-slate-600 dark:text-slate-300 capitalize">{user?.data_scope || "Assigned"}</span>
            </div>
          </div>

          {/* Request Access Interaction */}
          {!requestSent ? (
            !showRequestForm ? (
              <div className="pt-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowRequestForm(true)}
                  className="w-full text-xs gap-1.5 border-blue-200 dark:border-blue-900 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/40"
                >
                  <Send className="w-3.5 h-3.5" />
                  Request Access to {moduleName}
                </Button>
              </div>
            ) : (
              <div className="space-y-2 text-left bg-blue-50/50 dark:bg-blue-950/20 p-3 rounded-lg border border-blue-100 dark:border-blue-900/50">
                <label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                  Reason for requesting access:
                </label>
                <Textarea
                  value={requestReason}
                  onChange={(e) => setRequestReason(e.target.value)}
                  placeholder="e.g. Need to review supplier payments for month-end reconciliation..."
                  rows={2}
                  className="text-xs resize-none"
                />
                <div className="flex items-center gap-2 pt-1">
                  <Button
                    size="sm"
                    onClick={handleSendAccessRequest}
                    disabled={submitting}
                    className="flex-1 text-xs bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    {submitting ? "Submitting..." : "Send Request to Owner"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowRequestForm(false)}
                    className="text-xs"
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )
          ) : (
            <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 rounded-lg text-xs text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 flex items-start gap-2 text-left">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Access Request Sent</p>
                <p className="text-[11px] text-emerald-700 dark:text-emerald-400 mt-0.5">
                  {requestMessage}
                </p>
              </div>
            </div>
          )}

          <div className="pt-2 flex flex-col sm:flex-row items-center gap-2 justify-center">
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.back()}
              className="w-full sm:w-auto text-xs gap-1.5"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Go Back
            </Button>
            <Button
              size="sm"
              onClick={() => router.push("/")}
              className="w-full sm:w-auto text-xs gap-1.5 bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:hover:bg-slate-200 dark:text-slate-900 text-white"
            >
              <LayoutDashboard className="w-3.5 h-3.5" />
              Return to Dashboard
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
