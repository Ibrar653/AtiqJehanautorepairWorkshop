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
      <div className="min-h-screen bg-background flex">
        {/* Desktop Sidebar */}
        <div className="hidden lg:block w-[248px] shrink-0">
          <Sidebar user={user} />
        </div>

      {/* Mobile Drawer Sidebar */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="fixed inset-0 bg-slate-900/60 transition-opacity"
            onClick={() => setMobileMenuOpen(false)}
          />
          <Sidebar
            user={user}
            onCloseMobile={() => setMobileMenuOpen(false)}
            className="w-[248px]"
          />
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        <Header
          user={user}
          onOpenMobileMenu={() => setMobileMenuOpen(true)}
        />
        <main className="w-full max-w-[1600px] mx-auto px-6 lg:px-8 py-6 flex-1">
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
