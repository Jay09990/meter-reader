"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  AlertTriangle,
  FileText,
  Activity,
  Users,
  Map,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navigationGroups = [
  {
    title: "MONITOR",
    items: [
      { name: "Overview", href: "/dashboard", icon: LayoutDashboard },
      { name: "Map View", href: "/dashboard/map", icon: Map },
      { name: "Customers", href: "/dashboard/customers", icon: Users },
      { name: "Meters", href: "/dashboard/meters", icon: Activity },
    ]
  },
  {
    title: "OPERATIONS",
    items: [
      { name: "Alarms", href: "/dashboard/alarms", icon: AlertTriangle },
      { name: "Reports", href: "/dashboard/reports", icon: FileText },
    ]
  },
  // {
  //   title: "SYSTEM",
  //   items: [
  //     { name: "Admin Settings", href: "/dashboard/admin", icon: Settings },
  //   ]
  // }
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-64 bg-slate-100 dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col h-screen sticky top-0 text-slate-600 dark:text-slate-200 transition-colors">
      {/* Brand Header */}
      <div className="h-16 px-6 flex items-center gap-3 border-b border-slate-200 dark:border-slate-800">
        <div className="p-2 rounded-lg bg-orange-500/10 text-orange-600 dark:text-orange-500 border border-orange-500/20">
          <Activity className="w-5 h-5" />
        </div>
        <div>
          <h1 className="font-bold text-sm tracking-wide text-slate-900 dark:text-white">EVC GAS DASHBOARD</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">Fleet Telemetry v1</p>
        </div>
      </div>

      {/* Navigation Menu */}
      <nav className="flex-1 px-4 py-6 space-y-6 overflow-y-auto">
        {navigationGroups.map((group) => (
          <div key={group.title}>
            <h3 className="px-3 mb-2 text-xs font-semibold tracking-wider text-slate-400 uppercase">
              {group.title}
            </h3>
            <div className="space-y-1">
              {group.items.map((item) => {
                const isActive =
                  item.href === "/dashboard"
                    ? pathname === "/dashboard"
                    : pathname.startsWith(item.href);

                const Icon = item.icon;

                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    className={cn(
                      "flex items-center px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                      isActive
                        ? "bg-orange-50 dark:bg-orange-600/15 text-orange-600 dark:text-orange-400 border border-orange-500/20"
                        : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-200/50 dark:hover:bg-slate-800/60"
                    )}
                  >
                    <Icon className={cn("w-4 h-4 mr-3", isActive ? "text-orange-600 dark:text-orange-400" : "text-slate-400")} />
                    <span>{item.name}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer Info */}
      <div className="p-4 border-t border-slate-200 dark:border-slate-800 text-xs text-slate-500 flex justify-between items-center">
        <span>System Status</span>
        <span className="inline-flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-medium">
          <span className="w-2 h-2 rounded-full bg-emerald-500 dark:bg-emerald-400 animate-pulse"></span>
          Operational
        </span>
      </div>
    </aside>
  );
}
