"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { NAV_ITEMS, APP_NAME, DEFAULT_WORKSPACE_NAME, ROLE_PERMISSIONS } from "@/lib/constants";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
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
  X,
  ShieldCheck,
} from "lucide-react";
import type { User } from "@/types/database";
import { getInitials } from "@/lib/utils";

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  LayoutDashboard,
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

import { usePermissions } from "@/lib/context/auth-context";
import { useWorkspace } from "@/lib/context/workspace-context";

interface SidebarProps {
  className?: string;
  user?: User | null;
  onCloseMobile?: () => void;
}

export function Sidebar({ className, user, onCloseMobile }: SidebarProps) {
  const pathname = usePathname();
  const { hasModuleAccess, isOwner } = usePermissions();
  const { currentWorkspace } = useWorkspace();

  const visibleNavItems = NAV_ITEMS.filter((item) => {
    if (isOwner) return true;
    return hasModuleAccess(item.module);
  });

  return (
    <aside
      className={cn(
        "fixed left-0 top-0 z-40 h-screen w-[248px] bg-[#0E1728] text-slate-100 border-r border-[#1E293B] flex flex-col select-none",
        className
      )}
    >
      {/* Brand Header — Aligned with Topbar 56px height */}
      <div className="flex items-center justify-between px-3.5 h-14 border-b border-[#1E293B] shrink-0">
        <Link href="/" prefetch className="flex items-center gap-2.5 group min-w-0" onClick={onCloseMobile}>
          <div className="h-[38px] w-[38px] rounded-lg bg-white p-0.5 border border-white/20 shadow-xs flex items-center justify-center shrink-0 overflow-hidden">
            <Image
              src="/branding/atiq-jehan-logo.png"
              alt="ATIQ JEHAN AUTO REPAIR"
              width={38}
              height={38}
              className="w-full h-full object-contain"
              priority
            />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-[13px] font-semibold text-white tracking-tight leading-tight truncate">
              {currentWorkspace?.name || DEFAULT_WORKSPACE_NAME}
            </h1>
            <p className="text-[10px] text-blue-400 font-semibold uppercase tracking-wider truncate">
              {currentWorkspace?.currency || "AED"} &bull; WORKSHOP
            </p>
          </div>
        </Link>
        {onCloseMobile && (
          <button
            onClick={onCloseMobile}
            className="lg:hidden p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Navigation Links — 36px row height, 20px icons, 8px radius */}
      <ScrollArea className="flex-1 px-2.5 py-3">
        <nav className="space-y-1">
          {visibleNavItems.map((item) => {
            const Icon = iconMap[item.icon];
            const isActive =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                prefetch
                onClick={onCloseMobile}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 h-9 text-[13px] font-normal transition-colors duration-150",
                  isActive
                    ? "bg-primary text-white font-semibold shadow-xs"
                    : "text-slate-300 hover:text-white hover:bg-white/[0.06]"
                )}
              >
                {Icon && (
                  <Icon
                    className={cn(
                      "h-5 w-5 shrink-0 transition-colors",
                      isActive ? "text-white" : "text-slate-400 group-hover:text-slate-200"
                    )}
                  />
                )}
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </ScrollArea>

      {/* User Footer Profile — Sticky Footer Card */}
      <div className="p-3 border-t border-[#1E293B] shrink-0 bg-[#0E1728]">
        <div className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg bg-white/[0.04] border border-[#1E293B]">
          <div className="h-8 w-8 rounded-full bg-blue-600/30 border border-blue-500/40 text-blue-400 flex items-center justify-center text-xs font-semibold shrink-0">
            {user ? getInitials(user.full_name) : "AJ"}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-slate-200 truncate">
              {user?.full_name || "Workshop Staff"}
            </p>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-blue-400 font-semibold uppercase tracking-wider truncate">
                {user?.role || "Admin"}
              </span>
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" />
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}
