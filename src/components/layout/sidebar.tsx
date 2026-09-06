"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { NAV_ITEMS, APP_NAME, DEFAULT_WORKSPACE_NAME } from "@/lib/constants";
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

// Visual navigation groups defined in requirement 4
const NAV_GROUPS = [
  {
    title: "MAIN",
    items: ["/", "/customers", "/job-cards", "/services"],
  },
  {
    title: "PARTS & INVENTORY",
    items: ["/parts", "/inventory", "/suppliers", "/purchases"],
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
        "fixed left-0 top-0 z-40 h-screen w-[232px] bg-[#0F172A] text-slate-100 border-r border-[#1E293B] flex flex-col select-none",
        className
      )}
    >
      {/* Brand Header — Aligned with Topbar 56px height */}
      <div className="flex items-center justify-between px-3.5 h-14 border-b border-[#1E293B] shrink-0">
        <Link href="/" prefetch className="flex items-center gap-2.5 group min-w-0" onClick={onCloseMobile}>
          <div className="h-[34px] w-[34px] rounded-lg bg-white p-0.5 border border-white/20 shadow-xs flex items-center justify-center shrink-0 overflow-hidden">
            <Image
              src="/branding/atiq-jehan-logo.png"
              alt="ATIQ JEHAN AUTO REPAIR"
              width={34}
              height={34}
              className="w-full h-full object-contain"
              priority
            />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-[12.5px] font-bold text-white tracking-tight leading-tight truncate">
              ATIQ JEHAN AUTO REPAIR
            </h1>
            <p className="text-[9.5px] text-blue-400 font-semibold uppercase tracking-wider truncate">
              {currentWorkspace?.currency || "AED"} &bull; WORKSHOP
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

      {/* Navigation Links — Grouped into MAIN, PARTS & INVENTORY, FINANCE, MANAGEMENT */}
      <ScrollArea className="flex-1 px-2.5 py-2.5">
        <nav className="space-y-4">
          {NAV_GROUPS.map((group) => {
            const groupItems = visibleNavItems.filter((item) => group.items.includes(item.href));
            if (groupItems.length === 0) return null;

            return (
              <div key={group.title} className="space-y-0.5">
                <div className="text-[10px] font-bold text-slate-400/70 uppercase tracking-wider px-2.5 py-1">
                  {group.title}
                </div>
                <div className="space-y-0.5">
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
                          "flex items-center gap-2.5 rounded-lg px-2.5 h-[38px] text-[13px] font-medium transition-colors duration-150 select-none",
                          isActive
                            ? "bg-primary text-white font-semibold shadow-xs"
                            : "text-slate-300 hover:text-white hover:bg-white/[0.08]"
                        )}
                      >
                        {Icon && (
                          <Icon
                            className={cn(
                              "h-[17px] w-[17px] shrink-0 transition-colors",
                              isActive ? "text-white" : "text-slate-400 group-hover:text-slate-200"
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

      {/* User Footer Profile — Sticky Footer Card */}
      <div className="p-2.5 border-t border-[#1E293B] shrink-0 bg-[#0F172A]">
        <div className="flex items-center gap-2.5 px-2 py-2 rounded-lg bg-white/[0.04] border border-[#1E293B]/90 hover:bg-white/[0.07] transition-colors">
          <div className="h-8 w-8 rounded-full bg-blue-600/30 border border-blue-500/40 text-blue-400 flex items-center justify-center text-xs font-semibold shrink-0">
            {user ? getInitials(user.full_name) : "AJ"}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[12px] font-semibold text-slate-200 truncate">
              {user?.full_name || "Atiq Jehan (Owner)"}
            </p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="text-[9.5px] text-blue-400 font-semibold uppercase tracking-wider truncate">
                {user?.role || "Owner"}
              </span>
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" title="Online" />
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}
