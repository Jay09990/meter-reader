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
    <header className="sticky top-0 z-10 flex min-h-16 items-center justify-between gap-3 border-b border-border bg-background/80 px-3 py-3 text-foreground backdrop-blur transition-colors sm:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="lg:hidden text-muted-foreground hover:text-foreground"
          onClick={onOpenMobileSidebar}
          aria-label="Open sidebar"
        >
          <Menu className="h-5 w-5" />
        </Button>
        <h2 className="truncate text-sm font-semibold text-muted-foreground">AMR Operations Center</h2>
      </div>

      <div className="flex min-w-0 flex-wrap items-center justify-end gap-2 sm:gap-4">
        <RefreshIntervalSelect />
        <ThemeToggle />

        <Link
          href="/dashboard/alarms"
          className="relative rounded-lg border border-border bg-secondary p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          aria-label="Alarms"
        >
          <Bell className="h-5 w-5" />
          {openAlarmCount > 0 && (
            <span
              className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold text-white ring-2 ring-background animate-pulse"
              style={{background:'var(--clr-alert)'}}
            >
              {openAlarmCount > 99 ? "99+" : openAlarmCount}
            </span>
          )}
        </Link>

        <div className="hidden h-4 w-px bg-border sm:block" />

        <div className="hidden items-center gap-2 text-xs text-muted-foreground sm:flex">
          <span className="h-2 w-2 rounded-full" style={{background:'var(--clr-accent-lo)'}} />
          <span>Live Environment</span>
        </div>
      </div>
    </header>
  );
}