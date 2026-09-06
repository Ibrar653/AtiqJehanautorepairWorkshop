"use client";

import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { GlobalSearchBar } from "@/components/shared/global-search-bar";
import { ChangePasswordModal } from "@/components/shared/change-password-modal";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { LogOut, Bell, Lock, User as UserIcon, Menu, ShieldCheck } from "lucide-react";
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
    // Check for workspace-specific login return URL before clearing session
    const workspaceReturnUrl = getWorkspaceLoginReturnUrl();
    await supabase.auth.signOut();
    clearWorkspaceLoginReturnUrl();
    // Redirect to workspace login if user came from one, otherwise main login
    router.push(workspaceReturnUrl || "/login");
    router.refresh();
  };

  // Get clean section name from pathname
  const getSectionTitle = () => {
    if (pathname === "/") return "Workshop Dashboard";
    const segment = pathname.split("/")[1] || "";
    return segment
      .split("-")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
  };

  return (
    <>
      <header className="sticky top-0 z-30 h-14 bg-card border-b border-border flex items-center justify-between px-4 sm:px-6 gap-2 sm:gap-4">
        {/* Mobile Hamburger, Workspace Switcher, and Section Title */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          {onOpenMobileMenu && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onOpenMobileMenu}
              className="lg:hidden p-1.5 h-9 w-9 rounded-lg text-foreground hover:bg-muted"
            >
              <Menu className="h-4 w-4" />
            </Button>
          )}

          {/* Dedicated Multi-Workspace Switcher */}
          <WorkspaceSwitcher />

          <div className="hidden xl:block border-l border-border/80 pl-3">
            <h1 className="text-[12.5px] font-bold text-foreground leading-tight">
              {getSectionTitle()}
            </h1>
            <p className="text-[11px] text-muted-foreground font-medium truncate max-w-[220px]">
              {currentWorkspace.business_name || currentWorkspace.name}
            </p>
          </div>
        </div>

        {/* Global Search Bar — Wide Centered Professional Field */}
        <div className="hidden md:block flex-1 max-w-xl mx-auto px-2">
          <GlobalSearchBar />
        </div>

        {/* Header Right Actions */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Notifications Placeholder */}
          <Button
            variant="ghost"
            size="sm"
            className="relative h-9 w-9 p-0 text-muted-foreground hover:text-foreground hover:bg-muted/80 rounded-lg border border-border/60 bg-card shadow-xs"
            title="Notifications"
          >
            <Bell className="h-4 w-4" />
            <span className="absolute top-2 right-2 h-1.5 w-1.5 rounded-full bg-primary" />
          </Button>

          {/* User Profile Menu */}
          <DropdownMenu>
            <DropdownMenuTrigger className="relative h-9 w-9 rounded-full cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-1 transition-all">
              <Avatar className="h-9 w-9 border border-border/80 shadow-xs">
                <AvatarFallback className="bg-primary text-primary-foreground text-xs font-bold">
                  {user ? getInitials(user.full_name) : "AJ"}
                </AvatarFallback>
              </Avatar>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-60 bg-white" align="end">
              <DropdownMenuLabel className="font-normal p-3">
                <div className="flex flex-col space-y-1">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-bold text-slate-900 truncate">
                      {user?.full_name || "Staff Member"}
                    </p>
                  </div>
                  <p className="text-xs text-slate-500 truncate">{user?.email || "staff@atiqjehan.ae"}</p>
                  <div className="pt-1">
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-full">
                      <ShieldCheck className="h-3 w-3" />
                      {user?.role || "Admin"}
                    </span>
                  </div>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator className="bg-slate-100" />
              <DropdownMenuItem
                onClick={() => router.push("/settings")}
                className="text-xs text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                <UserIcon className="mr-2 h-4 w-4 text-slate-500" />
                Workshop Settings &amp; Profile
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setChangePasswordOpen(true)}
                className="text-xs text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                <Lock className="mr-2 h-4 w-4 text-slate-500" />
                Change Password
              </DropdownMenuItem>
              <DropdownMenuSeparator className="bg-slate-100" />
              <DropdownMenuItem
                onClick={handleSignOut}
                variant="destructive"
                className="text-xs text-red-600 hover:bg-red-50 cursor-pointer"
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
