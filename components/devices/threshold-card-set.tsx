"use client";

import type { ReactNode } from "react";
import { Input } from "@/components/ui/input";

export type ThresholdFormValues = {
  pressureUpper: string;
  pressureLower: string;
  temperatureUpper: string;
  temperatureLower: string;
  consumptionUpper: string;
  consumptionLower: string;
  batteryLower: string;
};

type ThresholdCardSetProps = {
  values: ThresholdFormValues;
  onChange: (field: keyof ThresholdFormValues, value: string) => void;
  error?: string | null;
};

function CompactField({
  label,
  value,
  onChange,
  step = "0.01",
  min,
  max,
  className = "",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  step?: string;
  min?: string;
  max?: string;
  className?: string;
}) {
  return (
    <div className={`flex min-w-0 items-center gap-1 ${className}`}>
      <span className="shrink-0 text-[10px] text-muted-foreground">{label}</span>
      <Input
        type="number"
        step={step}
        min={min}
        max={max}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="—"
        className="h-7 w-16 min-w-0 bg-background border-border px-1.5 text-xs text-foreground focus:border-[color:var(--clr-accent-hi)]"
      />
    </div>
  );
}

function ThresholdCard({
  title,
  unit,
  children,
}: {
  title: string;
  unit: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-muted/40 p-3 space-y-2">
      <div className="flex justify-between items-center border-b border-border/50 pb-1.5">
        <span className="text-xs font-bold uppercase tracking-wider text-foreground">{title}</span>
        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-background border border-border text-muted-foreground">{unit}</span>
      </div>
      <div className="grid grid-cols-2 gap-2 pt-0.5">{children}</div>
    </div>
  );
}

function ThresholdInput({
  label,
  value,
  onChange,
  step = "0.01",
  min,
  max,
  placeholder = "—",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  step?: string;
  min?: string;
  max?: string;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1">
      <label className="block text-[11px] font-medium text-muted-foreground">{label}</label>
      <Input
        type="number"
        step={step}
        min={min}
        max={max}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="h-8 w-full bg-background border-border text-xs text-foreground font-mono focus:border-[color:var(--clr-accent-hi)] focus:ring-0"
      />
    </div>
  );
}

/** Spacious operational threshold limit editor shared across drawers and customer detail forms. */
export function ThresholdCardSet({ values, onChange, error }: ThresholdCardSetProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          Operational Alarm Thresholds
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Pressure Card */}
        <ThresholdCard title="Pressure" unit="bar">
          <ThresholdInput
            label="Upper (Hi)"
            value={values.pressureUpper}
            onChange={(v) => onChange("pressureUpper", v)}
          />
          <ThresholdInput
            label="Lower (Lo)"
            value={values.pressureLower}
            onChange={(v) => onChange("pressureLower", v)}
          />
        </ThresholdCard>

        {/* Temperature Card */}
        <ThresholdCard title="Temperature" unit="°C">
          <ThresholdInput
            label="Upper (Hi)"
            value={values.temperatureUpper}
            onChange={(v) => onChange("temperatureUpper", v)}
          />
          <ThresholdInput
            label="Lower (Lo)"
            value={values.temperatureLower}
            onChange={(v) => onChange("temperatureLower", v)}
          />
        </ThresholdCard>

        {/* Consumption Card */}
        <ThresholdCard title="Consumption" unit="SCMH">
          <ThresholdInput
            label="Upper (Hi)"
            value={values.consumptionUpper}
            onChange={(v) => onChange("consumptionUpper", v)}
          />
          <ThresholdInput
            label="Lower (Lo)"
            value={values.consumptionLower}
            onChange={(v) => onChange("consumptionLower", v)}
          />
        </ThresholdCard>

        {/* Battery Card */}
        <ThresholdCard title="Battery" unit="%">
          <div className="col-span-2">
            <ThresholdInput
              label="Min Battery Level (Lo)"
              value={values.batteryLower}
              onChange={(v) => onChange("batteryLower", v)}
              step="1"
              min="0"
              max="100"
              placeholder="e.g. 20"
            />
          </div>
        </ThresholdCard>
      </div>

      {error && (
        <p className="text-xs font-semibold p-2 rounded bg-[color:var(--clr-alert)]/10 border border-[color:var(--clr-alert)]/20 text-[color:var(--clr-alert)]">
          {error}
        </p>
      )}
    </div>
  );
}

export function emptyThresholdFormValues(): ThresholdFormValues {
  return {
    pressureUpper: "",
    pressureLower: "",
    temperatureUpper: "",
    temperatureLower: "",
    consumptionUpper: "",
    consumptionLower: "",
    batteryLower: "",
  };
}

export function thresholdFormFromDevice(device: {
  pressureUpperLimit?: number | null;
  pressureLowerLimit?: number | null;
  temperatureUpperLimit?: number | null;
  temperatureLowerLimit?: number | null;
  consumptionUpperLimit?: number | null;
  consumptionLowerLimit?: number | null;
  batteryLowerLimit?: number | null;
}): ThresholdFormValues {
  const s = (n: number | null | undefined) => (n == null ? "" : String(n));
  return {
    pressureUpper: s(device.pressureUpperLimit),
    pressureLower: s(device.pressureLowerLimit),
    temperatureUpper: s(device.temperatureUpperLimit),
    temperatureLower: s(device.temperatureLowerLimit),
    consumptionUpper: s(device.consumptionUpperLimit),
    consumptionLower: s(device.consumptionLowerLimit),
    batteryLower: s(device.batteryLowerLimit),
  };
}
