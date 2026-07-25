"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import { ThemeToggle } from "./theme-toggle";
import { RefreshIntervalSelect } from "./RefreshIntervalSelect";
import { useAutoRefresh } from "@/lib/auto-refresh";

// Header owns global dashboard controls and the live alarm count indicator.
export function Header() {
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
    <header className="h-16 border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-950/80 backdrop-blur px-6 flex items-center justify-between sticky top-0 z-10 text-slate-900 dark:text-slate-100 transition-colors">
      <div className="flex items-center gap-4">
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Fleet Operations Center</h2>
      </div>

      <div className="flex items-center gap-4">
        <RefreshIntervalSelect />
        <ThemeToggle />

        <Link
          href="/dashboard/alarms"
          className="relative p-2 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors"
          aria-label="Alarms"
        >
          <Bell className="w-5 h-5" />
          {openAlarmCount > 0 && (
            <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-rose-600 text-[10px] font-bold text-white ring-2 ring-slate-900 dark:ring-slate-950 animate-pulse">
              {openAlarmCount > 99 ? "99+" : openAlarmCount}
            </span>
          )}
        </Link>

        <div className="h-4 w-px bg-slate-200 dark:bg-slate-800" />

        <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          <span className="w-2 h-2 rounded-full bg-slate-400 dark:bg-slate-500" />
          <span>Live Environment</span>
        </div>
      </div>
    </header>
  );
}
