"use client";

import { useState } from "react";
import { Header } from "@/components/layout/header";
import { Sidebar } from "@/components/layout/sidebar";

// Client shell owns responsive sidebar state for the dashboard layout.
export function DashboardShell({ children }: { children: React.ReactNode }) {
  const [desktopCollapsed, setDesktopCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="h-dvh overflow-hidden bg-background text-foreground flex font-sans antialiased transition-colors">
      <Sidebar
        collapsed={desktopCollapsed}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
        onToggleDesktop={() => setDesktopCollapsed((collapsed) => !collapsed)}
      />

      <div className="flex min-w-0 min-h-0 flex-1 flex-col">
        <Header onOpenMobileSidebar={() => setMobileOpen(true)} />
        <main className="dashboard-content min-h-0 flex-1 overflow-y-auto p-2 sm:p-3">{children}</main>
      </div>
    </div>
  );
}
