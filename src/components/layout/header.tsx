"use client";

import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { GlobalSearchBar } from "@/components/shared/global-search-bar";
import { ChangePasswordModal } from "@/components/shared/change-password-modal";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { LogOut, Bell, Lock, User as UserIcon, Menu, ShieldCheck, Sun } from "lucide-react";
import { getInitials } from "@/lib/utils";
import type { User } from "@/types/database";
import { WorkspaceSwitcher } from "./workspace-switcher";
import { useWorkspace } from "@/lib/context/workspace-context";
import {
  getWorkspaceLoginReturnUrl,
  clearWorkspaceLoginReturnUrl,
} from "@/lib/services/workspace-service";

interface HeaderProps {
  user: User | null;
  onOpenMobileMenu?: () => void;
}

export function Header({ user, onOpenMobileMenu }: HeaderProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { currentWorkspace } = useWorkspace();
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);

  const handleSignOut = async () => {
    const supabase = createClient();
    const workspaceReturnUrl = getWorkspaceLoginReturnUrl();
    await supabase.auth.signOut();
    clearWorkspaceLoginReturnUrl();
    router.push(workspaceReturnUrl || "/login");
    router.refresh();
  };

  const displayName = user?.full_name || "Ibrar Ahmad";
  const displayRole = user?.role || "Owner";
  const initials = user ? getInitials(user.full_name) : "IA";

  return (
    <>
      <header className="sticky top-0 z-30 h-[62px] bg-white border-b border-slate-200/90 flex items-center justify-between px-4 sm:px-6 lg:px-8 gap-4 select-none">
        {/* Mobile Hamburger & Workspace Switcher */}
        <div className="flex items-center gap-2.5 shrink-0">
          {onOpenMobileMenu && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onOpenMobileMenu}
              className="lg:hidden p-1.5 h-9 w-9 rounded-xl text-slate-700 hover:bg-slate-100"
            >
              <Menu className="h-4 w-4" />
            </Button>
          )}

          {/* Dedicated Multi-Workspace Switcher */}
          <WorkspaceSwitcher />
        </div>

        {/* Global Search Bar — Wide Centered Field matching reference */}
        <div className="hidden md:block flex-1 max-w-lg mx-auto">
          <GlobalSearchBar />
        </div>

        {/* Header Right Actions */}
        <div className="flex items-center gap-2.5 shrink-0">
          {/* Notifications with red badge matching reference */}
          <Button
            variant="ghost"
            size="sm"
            className="relative h-10 w-10 p-0 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl border border-slate-200/80 bg-white shadow-2xs"
            title="Notifications"
          >
            <Bell className="h-[18px] w-[18px]" />
            <span className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center border-2 border-white shadow-xs">
              3
            </span>
          </Button>

          {/* Sun / Theme Toggle matching reference */}
          <Button
            variant="ghost"
            size="sm"
            className="h-10 w-10 p-0 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl border border-slate-200/80 bg-white shadow-2xs hidden sm:flex items-center justify-center"
            title="Theme"
          >
            <Sun className="h-[18px] w-[18px]" />
          </Button>

          {/* User Profile Trigger & Menu */}
          <DropdownMenu>
            <DropdownMenuTrigger className="flex items-center gap-2.5 pl-1.5 py-1 rounded-xl hover:bg-slate-100/80 transition-all outline-none cursor-pointer">
              <div className="h-9 w-9 rounded-full bg-[#2563EB] text-white flex items-center justify-center text-xs font-bold shrink-0 shadow-xs">
                {initials}
              </div>
              <div className="hidden sm:block text-left leading-tight pr-1">
                <p className="text-[13px] font-bold text-slate-900 leading-tight">
                  {displayName}
                </p>
                <p className="text-[11px] text-slate-500 font-medium capitalize mt-0.5">
                  {displayRole}
                </p>
              </div>
            </DropdownMenuTrigger>

            <DropdownMenuContent className="w-64 bg-white p-1.5 shadow-xl border border-slate-200 rounded-2xl" align="end">
              <DropdownMenuLabel className="font-normal p-3">
                <div className="flex flex-col space-y-1">
                  <p className="text-sm font-bold text-slate-900 truncate">{displayName}</p>
                  <p className="text-xs text-slate-500 truncate">{user?.email || "owner@atiqjehan.ae"}</p>
                  <div className="pt-1.5">
                    <span className="inline-flex items-center gap-1 text-[10.5px] font-bold uppercase tracking-wider bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-full">
                      <ShieldCheck className="h-3 w-3" />
                      {displayRole}
                    </span>
                  </div>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator className="bg-slate-100 my-1" />
              <DropdownMenuItem
                onClick={() => router.push("/settings")}
                className="text-xs text-slate-700 hover:bg-slate-50 cursor-pointer rounded-lg py-2"
              >
                <UserIcon className="mr-2 h-4 w-4 text-slate-500" />
                Workshop Settings &amp; Profile
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setChangePasswordOpen(true)}
                className="text-xs text-slate-700 hover:bg-slate-50 cursor-pointer rounded-lg py-2"
              >
                <Lock className="mr-2 h-4 w-4 text-slate-500" />
                Change Password
              </DropdownMenuItem>
              <DropdownMenuSeparator className="bg-slate-100 my-1" />
              <DropdownMenuItem
                onClick={handleSignOut}
                className="text-xs text-red-600 hover:bg-red-50 cursor-pointer rounded-lg py-2"
              >
                <LogOut className="mr-2 h-4 w-4" />
                Sign Out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* Change Password Modal */}
      <ChangePasswordModal
        open={changePasswordOpen}
        onOpenChange={setChangePasswordOpen}
      />
    </>
  );
}
