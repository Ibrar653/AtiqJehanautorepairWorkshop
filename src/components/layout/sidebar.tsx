"use client";

import React, { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { NAV_ITEMS } from "@/lib/constants";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Wrench,
  LayoutDashboard,
  Users,
  Car,
  ClipboardList,
  Cog,
  Package,
  Truck,
  ShoppingCart,
  FileText,
  CreditCard,
  Receipt,
  BarChart3,
  Trash2,
  Settings,
  BookOpen,
  BrainCircuit,
  Sparkles,
  ChevronRight,
  X,
  LogOut,
} from "lucide-react";
import type { User } from "@/types/database";
import { getInitials } from "@/lib/utils";
import { usePermissions } from "@/lib/context/auth-context";
import { useWorkspace } from "@/lib/context/workspace-context";
import { LogoutConfirmationModal } from "@/components/shared/logout-confirmation-modal";

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  LayoutDashboard,
  BrainCircuit,
  Sparkles,
  Users,
  Car,
  ClipboardList,
  Wrench,
  Cog,
  Package,
  Truck,
  ShoppingCart,
  FileText,
  CreditCard,
  Receipt,
  BookOpen,
  BarChart3,
  Trash2,
  Settings,
};

// Visual navigation groups exactly matching the approved enterprise reference design
const NAV_GROUPS = [
  {
    title: "MAIN",
    items: ["/", "/customers", "/vehicles", "/job-cards", "/services"],
  },
  {
    title: "AI & AUTOMATION",
    items: ["/ai"],
  },
  {
    title: "PARTS & PROCUREMENT",
    items: ["/parts", "/spare-parts", "/inventory", "/suppliers", "/purchases"],
  },
  {
    title: "FINANCE",
    items: ["/invoices", "/payments", "/expenses", "/accounts"],
  },
  {
    title: "MANAGEMENT",
    items: ["/reports", "/recycle-bin", "/settings"],
  },
];

interface SidebarProps {
  className?: string;
  user?: User | null;
  onCloseMobile?: () => void;
}

export function Sidebar({ className, user, onCloseMobile }: SidebarProps) {
  const pathname = usePathname();
  const { hasModuleAccess, isOwner } = usePermissions();
  const { currentWorkspace } = useWorkspace();
  const [logoutModalOpen, setLogoutModalOpen] = useState(false);

  const visibleNavItems = NAV_ITEMS.filter((item) => {
    if (isOwner) return true;
    return hasModuleAccess(item.module);
  });

  return (
    <aside
      className={cn(
        "fixed z-40 flex flex-col select-none transition-all duration-150",
        "top-0 left-0 h-screen w-[252px] lg:top-3.5 lg:left-3.5 lg:h-[calc(100vh-28px)] lg:w-[244px] lg:rounded-[24px]",
        "glass-panel text-[#101D36] dark:text-[#E8F1FC] overflow-hidden",
        className
      )}
    >
      {/* Brand Header — Luminous Frosted Emblem */}
      <div className="flex items-center justify-between px-4 py-3.5 min-h-[72px] border-b border-[#D7E4F3]/75 dark:border-[#24385A] shrink-0 bg-white/35 dark:bg-white/[0.02]">
        <Link href="/" prefetch className="flex items-center gap-3 group min-w-0 flex-1" onClick={onCloseMobile}>
          <div className="h-11 w-11 rounded-2xl glass-icon-tile p-1.5 flex items-center justify-center shrink-0 transition-transform duration-150 group-hover:scale-[1.03]">
            <Image
              src="/branding/atiq-jehan-logo.png"
              alt="ATIQ JEHAN AUTO REPAIR"
              width={40}
              height={40}
              className="w-full h-full object-contain"
              priority
            />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="font-heading text-[13.5px] font-bold text-[#101D36] dark:text-slate-100 tracking-tight leading-[17px]">
              ATIQ JEHAN AUTO REPAIR
            </h1>
            <p className="text-[9.5px] font-bold text-[#007BFF] dark:text-sky-400 uppercase tracking-[0.09em] mt-0.5 leading-none">
              AUTOMOTIVE ERP
            </p>
          </div>
        </Link>
        {onCloseMobile && (
          <button
            onClick={onCloseMobile}
            className="lg:hidden p-1.5 rounded-xl text-[#52657F] hover:text-[#101D36] dark:hover:text-slate-200 hover:bg-white/70 dark:hover:bg-slate-800 transition-colors ml-1 shrink-0"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Navigation Links — Grouped Sections */}
      <ScrollArea className="flex-1 px-3 py-3.5">
        <nav className="space-y-4">
          {NAV_GROUPS.map((group) => {
            const groupItems = visibleNavItems.filter((item) => group.items.includes(item.href));
            if (groupItems.length === 0) return null;

            return (
              <div key={group.title} className="space-y-1">
                <div className="text-[10px] font-bold text-[#647B97] dark:text-[#8BA3C4] uppercase tracking-[0.09em] px-3 py-1">
                  {group.title}
                </div>
                <div className="space-y-1">
                  {groupItems.map((item) => {
                    const Icon = iconMap[item.icon];
                    const isActive =
                      item.href === "/"
                        ? pathname === "/"
                        : pathname.startsWith(item.href);
                    const isAiItem = item.href === "/ai";

                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        prefetch
                        onClick={onCloseMobile}
                        className={cn(
                          "flex items-center justify-between gap-2.5 rounded-xl px-3.5 h-[40px] text-[13.5px] transition-all duration-150 select-none group",
                          isActive
                            ? isAiItem
                              ? "ai-nav-active text-white font-semibold"
                              : "glass-btn-primary text-white font-semibold"
                            : isAiItem
                            ? "text-[#29206B] dark:text-indigo-200 hover:text-[#4F46E5] dark:hover:text-white hover:bg-indigo-50/75 dark:hover:bg-indigo-950/40 hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_2px_8px_rgba(99,56,245,0.10)] font-medium"
                            : "text-[#1A2D4D] dark:text-slate-200 hover:text-[#0068F5] dark:hover:text-white hover:bg-white/75 dark:hover:bg-white/[0.06] hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_2px_6px_rgba(16,40,82,0.05)] font-medium"
                        )}
                      >
                        <span className="flex items-center gap-3 min-w-0">
                          {Icon && (
                            <Icon
                              className={cn(
                                "h-[17px] w-[17px] shrink-0 transition-colors",
                                isActive
                                  ? "text-white drop-shadow-[0_1px_2px_rgba(0,40,120,0.3)]"
                                  : isAiItem
                                  ? "text-[#6338F5] dark:text-indigo-400 group-hover:text-[#7C3AED] dark:group-hover:text-sky-300"
                                  : "text-[#52657F] dark:text-[#94A8C4] group-hover:text-[#007BFF] dark:group-hover:text-sky-400"
                              )}
                            />
                          )}
                          <span className="truncate">{item.label}</span>
                        </span>
                        {isAiItem && (
                          <span
                            className={cn(
                              "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider shrink-0",
                              isActive
                                ? "bg-white/20 text-white border border-white/30"
                                : "bg-gradient-to-r from-violet-500/15 to-sky-500/15 text-[#4F46E5] dark:text-sky-300 border border-indigo-200/70 dark:border-indigo-700/60"
                            )}
                          >
                            <Sparkles className="h-2.5 w-2.5" />
                            AGENT
                          </span>
                        )}
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </nav>
      </ScrollArea>

      {/* User Footer Profile & Secure Logout */}
      <div className="p-3 border-t border-[#D7E4F3]/75 dark:border-[#24385A] shrink-0 bg-white/30 dark:bg-white/[0.02]">
        <div className="flex items-center justify-between gap-1.5 px-2.5 py-2 rounded-2xl bg-white/80 dark:bg-[#162542]/90 border border-white/95 dark:border-[#2A3F64] shadow-[var(--glass-shadow-sm)] transition-all">
          <Link
            href="/settings"
            prefetch
            onClick={onCloseMobile}
            className="flex items-center gap-2.5 min-w-0 flex-1 group"
            title="Open Workshop Settings & Profile"
          >
            <div className="h-9 w-9 rounded-full glass-btn-primary text-white flex items-center justify-center text-xs font-bold shrink-0">
              {user ? getInitials(user.full_name) : "IA"}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[12.5px] font-semibold text-[#101D36] dark:text-slate-100 truncate leading-tight group-hover:text-[#007BFF] dark:group-hover:text-sky-400 transition-colors" title={user?.full_name || "Ibrar Ahmad"}>
                {user?.full_name || "Ibrar Ahmad"}
              </p>
              <p className="text-[11px] text-[#52657F] dark:text-slate-400 font-medium capitalize truncate mt-0.5">
                {user?.role || "Owner"}
              </p>
            </div>
          </Link>

          <button
            type="button"
            onClick={() => setLogoutModalOpen(true)}
            className="p-1.5 text-[#52657F] hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50/90 dark:hover:bg-red-950/50 rounded-xl transition-colors shrink-0 cursor-pointer"
            title="Log Out of System"
            aria-label="Log Out of System"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Logout Confirmation Modal */}
      <LogoutConfirmationModal
        open={logoutModalOpen}
        onOpenChange={setLogoutModalOpen}
        user={user}
      />
    </aside>
  );
}
