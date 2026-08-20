"use client";

/** Inline hover control for choosing the consumption range used by overview KPIs. */
import { useEffect, useRef, useState } from "react";
import type { KpiRange } from "@/features/overview/service";

const RANGE_OPTIONS: Array<{ value: KpiRange; label: string }> = [
  { value: "today", label: "Day" },
  { value: "month", label: "Month" },
  { value: "quarter", label: "Quarter" },
  { value: "year", label: "Year" },
];

function rangeDescription(label: string, value: KpiRange): string {
  return value === "today" ? `This ${label}'s data` : `This ${label} data`;
}

export function KpiRangeSelector({
  value,
  onChange,
}: {
  value: KpiRange;
  onChange: (range: KpiRange) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const closeTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const current = RANGE_OPTIONS.find((option) => option.value === value)!;

  const openNow = () => {
    if (closeTimeout.current) clearTimeout(closeTimeout.current);
    setIsOpen(true);
  };

  const closeSoon = () => {
    closeTimeout.current = setTimeout(() => setIsOpen(false), 150);
  };

  useEffect(() => () => {
    if (closeTimeout.current) clearTimeout(closeTimeout.current);
  }, []);

  return (
    <div
      className="relative inline-flex items-baseline gap-1 text-sm text-muted-foreground"
      onMouseEnter={openNow}
      onMouseLeave={closeSoon}
    >
      <span>This</span>
      <span className="cursor-default font-bold underline text-foreground">
        {current.label}{"'s"}
      </span>
      <span>data</span>
      {isOpen && (
        <div className="absolute left-0 top-full z-20 mt-1 min-w-[132px] rounded-md border border-border bg-popover py-1 shadow-md">
          {RANGE_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => {
                onChange(option.value);
                setIsOpen(false);
              }}
              className={`block w-full px-3 py-1.5 text-left text-sm hover:bg-muted ${option.value === value ? "font-bold underline" : ""}`}
            >
              {rangeDescription(option.label, option.value)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
