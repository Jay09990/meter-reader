"use client";

/**
 * components/layout/RefreshIntervalSelect.tsx
 *
 * Header control for picking the global auto-refresh interval. Plain
 * native <select>, styled to match the header's existing pill controls
 * (ThemeToggle / bell) — deliberately not the shadcn/base-ui <Select>,
 * since that component isn't proven-in-use anywhere else in this repo
 * yet and this is a small always-visible control not worth the risk of
 * an unverified prop contract.
 */

import { RefreshCw } from "lucide-react";
import { REFRESH_OPTIONS, useAutoRefreshInterval } from "@/lib/auto-refresh";

export function RefreshIntervalSelect() {
  const { intervalMs, setIntervalMs } = useAutoRefreshInterval();

  return (
    <div
      className="flex items-center gap-1.5 rounded-lg bg-secondary border border-border px-2 py-1.5 text-muted-foreground"
      title="Auto-refresh: how often the current page re-checks the database for new data"
    >
      <RefreshCw
        className={`w-4 h-4 ${intervalMs > 0 ? "animate-spin [animation-duration:2.5s]" : ""}`}
      />
      <select
        aria-label="Auto-refresh interval"
        value={intervalMs}
        onChange={(e) => setIntervalMs(Number(e.target.value))}
        className="refresh-interval-select bg-secondary text-secondary-foreground text-xs font-medium outline-none cursor-pointer"
      >
        {REFRESH_OPTIONS.map((opt) => (
          <option
            key={opt.ms}
            value={opt.ms}
            className="bg-secondary text-secondary-foreground"
          >
            {opt.ms === 0 ? "Off" : `Every ${opt.label}`}
          </option>
        ))}
      </select>
    </div>
  );
}