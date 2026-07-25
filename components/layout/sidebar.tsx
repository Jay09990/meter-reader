"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  FileText,
  LayoutDashboard,
  Map,
  X,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const navigationGroups = [
  {
    title: "MONITOR",
    items: [
      { name: "Overview", href: "/dashboard", icon: LayoutDashboard },
      { name: "Map View", href: "/dashboard/map", icon: Map },
      { name: "Customers", href: "/dashboard/customers", icon: Users },
      { name: "Meters", href: "/dashboard/meters", icon: Activity },
    ],
  },
  {
    title: "OPERATIONS",
    items: [
      { name: "Alarms", href: "/dashboard/alarms", icon: AlertTriangle },
      { name: "Reports", href: "/dashboard/reports", icon: FileText },
    ],
  },
];

interface SidebarProps {
  collapsed: boolean;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  onToggleDesktop: () => void;
}

interface SidebarContentProps {
  collapsed: boolean;
  showDesktopToggle: boolean;
  onCloseMobile: () => void;
  onToggleDesktop: () => void;
}

// Responsive dashboard navigation with desktop collapse and mobile drawer modes.
export function Sidebar({ collapsed, mobileOpen, onCloseMobile, onToggleDesktop }: SidebarProps) {
  return (
    <>
      <aside
        className={cn(
          "sticky top-0 hidden h-screen shrink-0 flex-col border-r border-slate-200 bg-slate-100 text-slate-600 transition-[width] duration-200 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 lg:flex",
          collapsed ? "w-20" : "w-64"
        )}
      >
        <SidebarContent
          collapsed={collapsed}
          showDesktopToggle
          onCloseMobile={onCloseMobile}
          onToggleDesktop={onToggleDesktop}
        />
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm"
            onClick={onCloseMobile}
            aria-label="Close sidebar overlay"
          />
          <aside className="relative flex h-full w-72 max-w-[85vw] flex-col border-r border-slate-200 bg-slate-100 text-slate-600 shadow-2xl dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200">
            <SidebarContent
              collapsed={false}
              showDesktopToggle={false}
              onCloseMobile={onCloseMobile}
              onToggleDesktop={onToggleDesktop}
            />
          </aside>
        </div>
      )}
    </>
  );
}

function SidebarContent({ collapsed, showDesktopToggle, onCloseMobile, onToggleDesktop }: SidebarContentProps) {
  const pathname = usePathname();

  return (
    <>
      <div className={cn("flex h-16 items-center border-b border-slate-200 dark:border-slate-800", collapsed ? "justify-center px-3" : "gap-3 px-4 lg:px-6")}>
        <div className="rounded-lg border border-orange-500/20 bg-orange-500/10 p-2 text-orange-600 dark:text-orange-500">
          <Activity className="h-5 w-5" />
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <h1 className="truncate text-sm font-bold tracking-wide text-slate-900 dark:text-white">EVC GAS DASHBOARD</h1>
            <p className="truncate text-xs text-slate-500 dark:text-slate-400">Fleet Telemetry v1</p>
          </div>
        )}
        {showDesktopToggle && (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="ml-auto hidden text-slate-500 dark:text-slate-400 lg:inline-flex"
            onClick={onToggleDesktop}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </Button>
        )}
        {!showDesktopToggle && (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="ml-auto text-slate-500 dark:text-slate-400"
            onClick={onCloseMobile}
            aria-label="Close sidebar"
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      <nav className={cn("flex-1 space-y-6 overflow-y-auto py-6", collapsed ? "px-2" : "px-4")}>
        {navigationGroups.map((group) => (
          <div key={group.title}>
            {!collapsed && (
              <h3 className="mb-2 px-3 text-xs font-semibold tracking-wider text-slate-400 uppercase">
                {group.title}
              </h3>
            )}
            <div className="space-y-1">
              {group.items.map((item) => {
                const isActive = item.href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(item.href);
                const Icon = item.icon;

                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    title={collapsed ? item.name : undefined}
                    onClick={onCloseMobile}
                    className={cn(
                      "flex items-center rounded-lg py-2.5 text-sm font-medium transition-colors",
                      collapsed ? "justify-center px-2" : "px-3",
                      isActive
                        ? "border border-orange-500/20 bg-orange-50 text-orange-600 dark:bg-orange-600/15 dark:text-orange-400"
                        : "text-slate-600 hover:bg-slate-200/50 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800/60 dark:hover:text-slate-200"
                    )}
                  >
                    <Icon className={cn("h-4 w-4", collapsed ? "" : "mr-3", isActive ? "text-orange-600 dark:text-orange-400" : "text-slate-400")} />
                    {!collapsed && <span>{item.name}</span>}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {!collapsed && (
        <div className="flex items-center justify-between border-t border-slate-200 p-4 text-xs text-slate-500 dark:border-slate-800">
          <span>System Status</span>
          <span className="inline-flex items-center gap-1.5 font-medium text-emerald-600 dark:text-emerald-400">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse dark:bg-emerald-400" />
            Operational
          </span>
        </div>
      )}
    </>
  );
}