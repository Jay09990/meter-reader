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
  Settings,
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
      { name: "Settings", href: "/dashboard/settings", icon: Settings },
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
          "sticky top-0 hidden h-screen shrink-0 flex-col border-r border-border bg-sidebar text-sidebar-foreground transition-[width] duration-200 lg:flex",
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
            className="absolute inset-0 bg-background/70 backdrop-blur-sm"
            onClick={onCloseMobile}
            aria-label="Close sidebar overlay"
          />
          <aside className="relative flex h-full w-72 max-w-[85vw] flex-col border-r border-border bg-sidebar text-sidebar-foreground shadow-2xl">
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
      <div className={cn("flex h-16 items-center border-b border-sidebar-border", collapsed ? "justify-center px-3" : "gap-3 px-4 lg:px-6")}>
        <div className="rounded-lg border p-2" style={{borderColor:'var(--clr-accent-mid)33', background:'var(--clr-accent-hi)18', color:'var(--clr-accent-hi)'}}>
          <Activity className="h-5 w-5" />
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <h1 className="truncate text-sm font-bold tracking-wide text-foreground">EVC GAS DASHBOARD</h1>
            <p className="truncate text-xs text-muted-foreground">AMR Telemetry v1</p>
          </div>
        )}
        {showDesktopToggle && (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="ml-auto hidden text-muted-foreground hover:text-foreground lg:inline-flex"
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
            className="ml-auto text-muted-foreground hover:text-foreground"
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
              <h3 className="mb-2 px-3 text-xs font-semibold tracking-wider uppercase" style={{color:'var(--clr-accent-lo)'}}>
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
                        ? "border text-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                    style={isActive ? {
                      borderColor: 'var(--clr-accent-mid)55',
                      background: 'var(--clr-accent-hi)1a',
                      color: 'var(--clr-accent-hi)'
                    } : {}}
                  >
                    <Icon
                      className={cn("h-4 w-4", collapsed ? "" : "mr-3")}
                      style={isActive ? {color:'var(--clr-accent-hi)'} : {}}
                    />
                    {!collapsed && <span>{item.name}</span>}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {!collapsed && (
        <div className="flex items-center justify-between border-t border-sidebar-border p-4 text-xs text-muted-foreground">
          <span>System Status</span>
          <span className="inline-flex items-center gap-1.5 font-medium" style={{color:'var(--clr-online)'}}>
            <span className="h-2 w-2 rounded-full animate-pulse" style={{background:'var(--clr-online)'}} />
            Operational
          </span>
        </div>
      )}
    </>
  );
}
