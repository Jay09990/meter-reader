"use client";

/**
 * lib/auto-refresh.tsx
 *
 * Shared/core (DEVELOPMENT_RULES.md §2.4) — cross-cutting UI behavior used
 * by every data page (Overview, Meter Table, Meter Detail, Alarms) and the
 * Header. Not feature-owned by any one of them, so it lives here rather
 * than inside a single feature folder.
 *
 * Provides a single global "auto-refresh interval" the user picks from a
 * header dropdown, persisted across sessions. Each page opts in by calling
 * useAutoRefresh(itsOwnExistingFetchFn) — this does NOT change what any
 * page fetches or how; it only adds a ticking re-call of the fetch
 * function the page already has.
 *
 * NOTE ON NAMING: this is deliberately called "auto-refresh," not a cron
 * job. A cron job runs server-side on a schedule regardless of whether
 * anyone has the dashboard open. This is a per-browser-session client
 * poll. See DATA-FLOW.md discussion — devices push once/day, so this
 * control should be framed in the UI as "auto-refresh" (checking the DB
 * for whatever's new), not as "live telemetry."
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

export interface RefreshOption {
  label: string;
  ms: number; // 0 = off
}

export const REFRESH_OPTIONS: RefreshOption[] = [
  { label: "Off", ms: 0 },
  { label: "5s", ms: 5_000 },
  { label: "15s", ms: 15_000 },
  { label: "30s", ms: 30_000 },
  { label: "1m", ms: 60_000 },
  { label: "30m", ms: 30 * 60_000 },
  { label: "1h", ms: 60 * 60_000 },
  { label: "12h", ms: 12 * 60 * 60_000 },
  { label: "1d", ms: 24 * 60 * 60_000 },
];

// ASSUMPTION: default interval when nothing is stored yet. Picked 30s as a
// reasonable "useful for demo/testing, not hammering the API" default —
// change this constant if a different default is wanted.
const DEFAULT_MS = 30_000;
const STORAGE_KEY = "evc-dashboard:auto-refresh-ms";

interface AutoRefreshContextValue {
  intervalMs: number;
  setIntervalMs: (ms: number) => void;
}

const AutoRefreshContext = createContext<AutoRefreshContextValue | null>(null);

export function AutoRefreshProvider({ children }: { children: React.ReactNode }) {
  // Start at the default on the server render, then sync from
  // localStorage once mounted client-side — avoids an SSR/client
  // hydration mismatch from reading localStorage during render.
  const [intervalMs, setIntervalMsState] = useState<number>(DEFAULT_MS);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored !== null) {
        const parsed = Number(stored);
        if (!Number.isNaN(parsed)) {
          window.setTimeout(() => setIntervalMsState(parsed), 0);
        }
      }
    } catch {
      // localStorage unavailable (SSR/private mode) — fall back to default
    }
  }, []);

  const setIntervalMs = useCallback((ms: number) => {
    setIntervalMsState(ms);
    try {
      window.localStorage.setItem(STORAGE_KEY, String(ms));
    } catch {
      // ignore write failures — in-memory state still updates for this tab
    }
  }, []);

  return (
    <AutoRefreshContext.Provider value={{ intervalMs, setIntervalMs }}>
      {children}
    </AutoRefreshContext.Provider>
  );
}

function useAutoRefreshContext(): AutoRefreshContextValue {
  const ctx = useContext(AutoRefreshContext);
  if (!ctx) {
    throw new Error(
      "useAutoRefresh(Context) must be used inside <AutoRefreshProvider> — " +
        "confirm app/dashboard/layout.tsx wraps its children with it."
    );
  }
  return ctx;
}

/** Read/write the globally selected interval — used by the header dropdown. */
export function useAutoRefreshInterval() {
  return useAutoRefreshContext();
}

/**
 * Re-calls `callback` on the globally selected interval. Does NOT call it
 * immediately on mount — pages already fetch once on mount themselves;
 * this only adds the repeating tick on top of that.
 *
 * Pauses while the tab is hidden (visibilitychange), so a background tab
 * doesn't keep polling at 5s intervals for no one to see.
 */
export function useAutoRefresh(callback: () => void) {
  const { intervalMs } = useAutoRefreshContext();
  const callbackRef = useRef(callback);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    if (!intervalMs || intervalMs <= 0) return;

    let id: ReturnType<typeof setInterval> | null = null;

    const start = () => {
      if (id !== null) return;
      id = setInterval(() => callbackRef.current(), intervalMs);
    };
    const stop = () => {
      if (id !== null) {
        clearInterval(id);
        id = null;
      }
    };

    if (document.visibilityState === "visible") start();

    const onVisibility = () => {
      if (document.visibilityState === "visible") start();
      else stop();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [intervalMs]);
}