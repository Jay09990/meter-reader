"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, UsersRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAutoRefresh } from "@/lib/auto-refresh";

interface CapacityStatus {
  maxCapacity: number | null;
  currentCount: number;
  atCapacity: boolean;
  unacknowledgedRejections: {
    count: number;
    mostRecent: { deviceSerialNo: string; attemptedAt: string } | null;
  } | null;
}

// Reuses the capacity-status API for compact header and full overview notices.
export function CapacityBanner({ variant }: { variant: "compact" | "full" }) {
  const [status, setStatus] = useState<CapacityStatus | null>(null);

  const loadStatus = () => {
    fetch("/api/system/capacity-status")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setStatus(data))
      .catch(() => {});
  };

  useEffect(loadStatus, []);
  useAutoRefresh(loadStatus);

  const acknowledgeRejections = async () => {
    const response = await fetch("/api/system/rejected-attempts/acknowledge", { method: "POST" });
    if (response.ok) loadStatus();
  };

  if (!status || status.maxCapacity === null) return null;
  const rejection = status.unacknowledgedRejections;
  if (!status.atCapacity && !rejection) return null;

  if (variant === "compact") {
    return (
      <Link href="/dashboard" className="relative rounded-lg border border-border bg-secondary p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground" aria-label="Meter capacity status">
        {rejection ? <AlertTriangle className="h-5 w-5" /> : <UsersRound className="h-5 w-5" />}
        <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-bold text-white ring-2 ring-background" style={{ background: rejection ? "var(--clr-alert)" : "var(--clr-stale)" }}>
          {rejection ? rejection.count : `${status.currentCount}/${status.maxCapacity}`}
        </span>
      </Link>
    );
  }

  return (
    <div className="space-y-3">
      {status.atCapacity && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border px-4 py-3 text-sm" style={{ borderColor: "var(--clr-stale)55", background: "var(--clr-stale)18", color: "var(--clr-stale)" }}>
          <UsersRound className="h-5 w-5 shrink-0" />
          <p>You&apos;ve reached your maximum capacity of {status.maxCapacity} meters. To add more meters, please contact your provider.</p>
        </div>
      )}
      {rejection && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border px-4 py-3 text-sm" style={{ borderColor: "var(--clr-alert)55", background: "var(--clr-alert)18", color: "var(--clr-alert)" }}>
          <AlertTriangle className="h-5 w-5 shrink-0" />
          <p className="flex-1">Maximum meter capacity exceeded — {rejection.count} new meter(s) attempted to connect but were rejected. Most recent: {rejection.mostRecent?.deviceSerialNo ?? "unknown"}. Contact your provider for further assistance.</p>
          <Button type="button" size="sm" variant="outline" onClick={acknowledgeRejections}>Dismiss</Button>
        </div>
      )}
    </div>
  );
}
