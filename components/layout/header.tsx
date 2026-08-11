"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bell, Menu } from "lucide-react";
import { ThemeToggle } from "./theme-toggle";
import { RefreshIntervalSelect } from "./RefreshIntervalSelect";
import { Button } from "@/components/ui/button";
import { useAutoRefresh } from "@/lib/auto-refresh";

interface HeaderProps {
  onOpenMobileSidebar: () => void;
}

// Header owns global dashboard controls and the live alarm count indicator.
export function Header({ onOpenMobileSidebar }: HeaderProps) {
  const [openAlarmCount, setOpenAlarmCount] = useState<number>(0);

  const fetchAlarmCount = () => {
    fetch("/api/alarms/count")
      .then((res) => res.json())
      .then((data) => {
        if (typeof data.count === "number") setOpenAlarmCount(data.count);
      })
      .catch(() => {});
  };
  useEffect(fetchAlarmCount, []);
  useAutoRefresh(fetchAlarmCount);

  return (
    <header className="sticky top-0 z-10 flex min-h-16 items-center justify-between gap-3 border-b border-slate-200 bg-white/80 px-3 py-3 text-slate-900 backdrop-blur transition-colors dark:border-slate-800 dark:bg-slate-950/80 dark:text-slate-100 sm:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="lg:hidden text-slate-600 dark:text-slate-300"
          onClick={onOpenMobileSidebar}
          aria-label="Open sidebar"
        >
          <Menu className="h-5 w-5" />
        </Button>
        <h2 className="truncate text-sm font-semibold text-slate-700 dark:text-slate-300">AMR Operations Center</h2>
      </div>

      <div className="flex min-w-0 flex-wrap items-center justify-end gap-2 sm:gap-4">
        <RefreshIntervalSelect />
        <ThemeToggle />

        <Link
          href="/dashboard/alarms"
          className="relative rounded-lg border border-slate-200 bg-slate-100 p-2 text-slate-500 transition-colors hover:bg-slate-200 hover:text-slate-900 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          aria-label="Alarms"
        >
          <Bell className="h-5 w-5" />
          {openAlarmCount > 0 && (
            <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-rose-600 text-[10px] font-bold text-white ring-2 ring-slate-900 animate-pulse dark:ring-slate-950">
              {openAlarmCount > 99 ? "99+" : openAlarmCount}
            </span>
          )}
        </Link>

        <div className="hidden h-4 w-px bg-slate-200 dark:bg-slate-800 sm:block" />

        <div className="hidden items-center gap-2 text-xs text-slate-500 dark:text-slate-400 sm:flex">
          <span className="h-2 w-2 rounded-full bg-slate-400 dark:bg-slate-500" />
          <span>Live Environment</span>
        </div>
      </div>
    </header>
  );
}