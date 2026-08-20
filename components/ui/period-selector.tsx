import { cn } from "@/lib/utils";
import type { ConsumptionMode } from "@/lib/consumption-series";

const PERIODS: Array<{ value: ConsumptionMode; label: string }> = [
  { value: "daily", label: "Daily" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "yearly", label: "Yearly" },
];

// Shared sliding control for selecting delta-consumption periods.
export function PeriodSelector({ value, onChange }: { value: ConsumptionMode; onChange: (value: ConsumptionMode) => void }) {
  return (
    <div className="relative grid grid-cols-4 rounded-lg bg-secondary p-1 text-xs font-semibold">
      <span className="absolute inset-y-1 w-1/4 rounded-md bg-card shadow-sm transition-transform duration-200" style={{ transform: `translateX(${PERIODS.findIndex((period) => period.value === value) * 100}%)` }} />
      {PERIODS.map((period) => (
        <button key={period.value} type="button" onClick={() => onChange(period.value)} className={cn("relative z-10 rounded-md px-3 py-1.5 transition-colors", value === period.value ? "text-foreground" : "text-muted-foreground hover:text-foreground")}>
          {period.label}
        </button>
      ))}
    </div>
  );
}
