"use client";

import { useState } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { useAuth } from "@/lib/context/auth-context";
import { RouteGuard } from "@/components/shared/route-guard";
import { WorkspaceProvider } from "@/lib/context/workspace-context";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <WorkspaceProvider>
      <div className="min-h-screen glass-canvas flex text-[#101D36] dark:text-[#F0F6FF] font-sans antialiased">
        {/* Desktop Floating Glass Sidebar Rail */}
        <div className="hidden lg:block w-[264px] shrink-0">
          <Sidebar user={user} className="w-[244px]" />
        </div>

        {/* Mobile Drawer Sidebar */}
        {mobileMenuOpen && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <div
              className="fixed inset-0 bg-[#101D36]/45 backdrop-blur-sm transition-opacity"
              onClick={() => setMobileMenuOpen(false)}
            />
            <Sidebar
              user={user}
              onCloseMobile={() => setMobileMenuOpen(false)}
              className="w-[252px]"
            />
          </div>
        )}

        {/* Fluid Main Content Area (Eliminates Excessive Desktop Empty Margins) */}
        <div className="flex-1 flex flex-col min-w-0">
          <Header
            user={user}
            onOpenMobileMenu={() => setMobileMenuOpen(true)}
          />
          <main className="w-full max-w-[1880px] mx-auto px-4 sm:px-5 lg:px-6 py-5 flex-1">
            <div className="w-full space-y-5">
              <RouteGuard>
                {children}
              </RouteGuard>
            </div>
          </main>
        </div>
      </div>
    </WorkspaceProvider>
  );
}
