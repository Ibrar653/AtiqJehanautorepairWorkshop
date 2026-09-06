"use client";

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
  ChevronRight,
  X,
} from "lucide-react";
import type { User } from "@/types/database";
import { getInitials } from "@/lib/utils";
import { usePermissions } from "@/lib/context/auth-context";
import { useWorkspace } from "@/lib/context/workspace-context";

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

// Visual navigation groups exactly matching the approved enterprise reference design
const NAV_GROUPS = [
  {
    title: "MAIN",
    items: ["/", "/customers", "/vehicles", "/job-cards", "/services"],
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

  const visibleNavItems = NAV_ITEMS.filter((item) => {
    if (isOwner) return true;
    return hasModuleAccess(item.module);
  });

  return (
    <aside
      className={cn(
        "fixed left-0 top-0 z-40 h-screen w-[240px] bg-[#0F172A] text-slate-100 border-r border-[#1E293B] flex flex-col select-none",
        className
      )}
    >
      {/* Brand Header — High-contrast premium emblem */}
      <div className="flex items-center justify-between px-4 h-[62px] border-b border-[#1E293B] shrink-0 bg-[#0F172A]">
        <Link href="/" prefetch className="flex items-center gap-3 group min-w-0" onClick={onCloseMobile}>
          <div className="h-10 w-10 rounded-xl bg-slate-900 border border-slate-700/80 p-1 flex items-center justify-center shrink-0 shadow-xs">
            <Image
              src="/branding/atiq-jehan-logo.png"
              alt="ATIQ JEHAN"
              width={34}
              height={34}
              className="w-full h-full object-contain"
              priority
            />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-[13.5px] font-extrabold text-white tracking-tight leading-none truncate">
              ATIQ JEHAN
            </h1>
            <p className="text-[10px] text-amber-400 font-bold uppercase tracking-wider mt-1 truncate">
              AUTO REPAIR
            </p>
            <p className="text-[8px] text-slate-400 uppercase tracking-wider truncate">
              WORKSHOP MANAGEMENT SYSTEM
            </p>
          </div>
        </Link>
        {onCloseMobile && (
          <button
            onClick={onCloseMobile}
            className="lg:hidden p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Navigation Links — Grouped Sections */}
      <ScrollArea className="flex-1 px-3 py-3">
        <nav className="space-y-4">
          {NAV_GROUPS.map((group) => {
            const groupItems = visibleNavItems.filter((item) => group.items.includes(item.href));
            if (groupItems.length === 0) return null;

            return (
              <div key={group.title} className="space-y-1">
                <div className="text-[10.5px] font-bold text-slate-400/80 uppercase tracking-widest px-3 py-1">
                  {group.title}
                </div>
                <div className="space-y-1">
                  {groupItems.map((item) => {
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
                          "flex items-center gap-3 rounded-xl px-3.5 h-[42px] text-[13.5px] transition-all duration-150 select-none group",
                          isActive
                            ? "bg-[#2563EB] text-white font-semibold shadow-sm shadow-blue-600/30"
                            : "text-slate-300 hover:text-white hover:bg-white/[0.08] font-medium"
                        )}
                      >
                        {Icon && (
                          <Icon
                            className={cn(
                              "h-[18px] w-[18px] shrink-0 transition-colors",
                              isActive ? "text-white" : "text-slate-400 group-hover:text-white"
                            )}
                          />
                        )}
                        <span className="truncate">{item.label}</span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </nav>
      </ScrollArea>

      {/* User Footer Profile — Matching reference visual card */}
      <div className="p-3 border-t border-[#1E293B] shrink-0 bg-[#0B132B]/90">
        <Link
          href="/settings"
          prefetch
          onClick={onCloseMobile}
          className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-slate-900/80 border border-[#1E293B] hover:border-slate-700 hover:bg-slate-800/80 transition-all group"
        >
          <div className="h-9 w-9 rounded-full bg-[#2563EB] text-white flex items-center justify-center text-xs font-bold shrink-0 shadow-xs">
            {user ? getInitials(user.full_name) : "IA"}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold text-white truncate leading-tight group-hover:text-blue-200 transition-colors">
              {user?.full_name || "Ibrar Ahmad"}
            </p>
            <p className="text-[11px] text-slate-400 font-medium capitalize truncate mt-0.5">
              {user?.role || "Owner"}
            </p>
          </div>
          <ChevronRight className="h-4 w-4 text-slate-400 group-hover:text-white transition-colors shrink-0" />
        </Link>
      </div>
    </aside>
  );
}
