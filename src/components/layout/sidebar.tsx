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
        "fixed left-0 top-0 z-40 h-screen w-[240px] bg-white text-slate-800 border-r border-[#E5E7EB] shadow-xs flex flex-col select-none",
        className
      )}
    >
      {/* Brand Header — Crisp white enterprise emblem */}
      <div className="flex items-center justify-between px-3.5 py-3 min-h-[68px] border-b border-[#E5E7EB] shrink-0 bg-white">
        <Link href="/" prefetch className="flex items-center gap-3 group min-w-0 flex-1" onClick={onCloseMobile}>
          <div className="h-11 w-11 rounded-xl bg-slate-50 border border-slate-200/90 p-1 flex items-center justify-center shrink-0 shadow-2xs">
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
            <h1 className="text-[14px] font-bold text-slate-900 tracking-tight leading-[17px]">
              ATIQ JEHAN AUTO REPAIR
            </h1>
            <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-wider mt-0.5 leading-none">
              WORKSHOP MANAGEMENT SYSTEM
            </p>
          </div>
        </Link>
        {onCloseMobile && (
          <button
            onClick={onCloseMobile}
            className="lg:hidden p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors ml-1 shrink-0"
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
                <div className="text-[10.5px] font-bold text-[#6B7280] uppercase tracking-wider px-3 py-1">
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
                            ? "bg-[#2563EB] text-white font-semibold shadow-xs"
                            : "text-[#64748B] hover:text-[#111827] hover:bg-[#F3F4F6] font-medium"
                        )}
                      >
                        {Icon && (
                          <Icon
                            className={cn(
                              "h-[18px] w-[18px] shrink-0 transition-colors",
                              isActive ? "text-white" : "text-slate-400 group-hover:text-slate-700"
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

      {/* User Footer Profile — Matching clean white card */}
      <div className="p-2.5 border-t border-[#E5E7EB] shrink-0 bg-white">
        <Link
          href="/settings"
          prefetch
          onClick={onCloseMobile}
          className="flex items-center gap-2.5 px-2.5 py-2 rounded-xl bg-slate-50/80 border border-[#E5E7EB] hover:border-slate-300 hover:bg-slate-100/70 transition-all group"
        >
          <div className="h-8.5 w-8.5 rounded-full bg-[#2563EB] text-white flex items-center justify-center text-xs font-bold shrink-0 shadow-2xs">
            {user ? getInitials(user.full_name) : "IA"}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[12.5px] font-bold text-[#111827] truncate leading-tight group-hover:text-[#2563EB] transition-colors" title={user?.full_name || "Ibrar Ahmad"}>
              {user?.full_name || "Ibrar Ahmad"}
            </p>
            <p className="text-[11px] text-[#64748B] font-medium capitalize truncate mt-0.5">
              {user?.role || "Owner"}
            </p>
          </div>
          <ChevronRight className="h-3.5 w-3.5 text-slate-400 group-hover:text-slate-600 transition-colors shrink-0" />
        </Link>
      </div>
    </aside>
  );
}
