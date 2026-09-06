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
      <div className="min-h-screen bg-[#F6F8FB] flex text-slate-900 font-sans antialiased">
        {/* Desktop Sidebar */}
        <div className="hidden lg:block w-[240px] shrink-0">
          <Sidebar user={user} className="w-[240px]" />
        </div>

        {/* Mobile Drawer Sidebar */}
        {mobileMenuOpen && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <div
              className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity"
              onClick={() => setMobileMenuOpen(false)}
            />
            <Sidebar
              user={user}
              onCloseMobile={() => setMobileMenuOpen(false)}
              className="w-[240px]"
            />
          </div>
        )}

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col min-w-0 bg-[#F6F8FB]">
          <Header
            user={user}
            onOpenMobileMenu={() => setMobileMenuOpen(true)}
          />
          <main className="w-full max-w-[1560px] mx-auto px-4 sm:px-6 lg:px-8 py-6 flex-1">
            <div className="w-full space-y-6">
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
