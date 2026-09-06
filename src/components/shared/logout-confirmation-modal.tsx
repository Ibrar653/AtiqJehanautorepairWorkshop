"use client";

import React, { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { LogOut, Loader2, Building2, ShieldCheck, User } from "lucide-react";
import { WORKSPACE_STORAGE_KEY } from "@/lib/constants";
import {
  getWorkspaceLoginReturnUrl,
  clearWorkspaceLoginReturnUrl,
} from "@/lib/services/workspace-service";
import { useWorkspace } from "@/lib/context/workspace-context";
import type { User as UserType } from "@/types/database";

interface LogoutConfirmationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user?: UserType | null;
}

export function LogoutConfirmationModal({
  open,
  onOpenChange,
  user,
}: LogoutConfirmationModalProps) {
  const [loggingOut, setLoggingOut] = useState(false);
  const { currentWorkspace } = useWorkspace();

  const handleConfirmLogout = async () => {
    setLoggingOut(true);
    try {
      const supabase = createClient();
      const returnUrl = getWorkspaceLoginReturnUrl();

      // 1. Terminate Supabase authentication session
      await supabase.auth.signOut();

      // 2. Clear active workspace state from storage & cookies
      try {
        localStorage.removeItem(WORKSPACE_STORAGE_KEY);
        document.cookie = `${WORKSPACE_STORAGE_KEY}=; path=/; max-age=0; SameSite=Lax`;
      } catch {}

      // 3. Clear workspace login return url
      clearWorkspaceLoginReturnUrl();

      // 4. Force full page navigation to reset all in-memory client state
      const targetUrl = returnUrl || "/login";
      window.location.href = targetUrl;
    } catch (err) {
      console.error("Logout failed:", err);
      window.location.href = "/login";
    }
  };

  return (
    <Dialog open={open} onOpenChange={(val) => !loggingOut && onOpenChange(val)}>
      <DialogContent className="max-w-md bg-white dark:bg-[#172033] border-slate-200 dark:border-[#273449] p-6 rounded-2xl shadow-xl">
        <DialogHeader className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900/60 text-red-600 dark:text-red-400 flex items-center justify-center shrink-0 shadow-2xs">
              <LogOut className="w-6 h-6" />
            </div>
            <div>
              <DialogTitle className="text-base font-bold text-slate-900 dark:text-slate-100">
                Log out of ATIQ JEHAN AUTO REPAIR?
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Choose how to proceed with your current session.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-3 py-2 text-xs">
          <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
            Are you sure you want to end your session? Any unsaved form drafts will be discarded, and you will need to sign in again to access the workshop system.
          </p>

          {/* User & Workspace Summary Box */}
          <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#111827] border border-slate-200/90 dark:border-[#273449] space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                Signed In User:
              </span>
              <span className="font-bold text-slate-900 dark:text-slate-100 truncate max-w-[180px]">
                {user?.full_name || "Ibrar Ahmad"}
              </span>
            </div>

            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                Assigned Role:
              </span>
              <span className="font-bold uppercase tracking-wider text-[10.5px] bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 px-2 py-0.5 rounded-md">
                {user?.role || "Owner"}
              </span>
            </div>

            <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-200/70 dark:border-[#273449]">
              <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
                Active Workspace:
              </span>
              <span className="font-bold text-slate-900 dark:text-slate-100 truncate max-w-[180px]">
                {currentWorkspace.name}
              </span>
            </div>
          </div>
        </div>

        <DialogFooter className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100 dark:border-[#273449]">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={loggingOut}
            className="h-9 px-4 rounded-xl border-slate-200 dark:border-[#273449] text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold cursor-pointer"
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={handleConfirmLogout}
            disabled={loggingOut}
            className="h-9 px-4 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-semibold gap-1.5 cursor-pointer shadow-xs"
          >
            {loggingOut ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Signing Out...
              </>
            ) : (
              <>
                <LogOut className="w-3.5 h-3.5" />
                Logout
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
