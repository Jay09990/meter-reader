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

function MetricGroup({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2 rounded-md border border-border bg-muted/30 px-2 py-1.5">
      <p className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-muted-foreground whitespace-nowrap">
        {title}
      </p>
      <div className="flex min-w-0 flex-wrap items-center gap-1.5">{children}</div>
    </div>
  );
}

/** Compact single-row threshold editor shared by provisioning drawer and expandable table rows. */
export function ThresholdCardSet({ values, onChange, error }: ThresholdCardSetProps) {
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap gap-2">
        <MetricGroup title="Pressure">
          <CompactField
            label="Hi"
            value={values.pressureUpper}
            onChange={(v) => onChange("pressureUpper", v)}
          />
          <CompactField
            label="Lo"
            value={values.pressureLower}
            onChange={(v) => onChange("pressureLower", v)}
          />
          <span className="text-[10px] text-muted-foreground">BAR</span>
        </MetricGroup>
        <MetricGroup title="Temp">
          <CompactField
            label="Hi"
            value={values.temperatureUpper}
            onChange={(v) => onChange("temperatureUpper", v)}
          />
          <CompactField
            label="Lo"
            value={values.temperatureLower}
            onChange={(v) => onChange("temperatureLower", v)}
          />
          <span className="text-[10px] text-muted-foreground">°C</span>
        </MetricGroup>
        <MetricGroup title="Consump.">
          <CompactField
            label="Hi"
            value={values.consumptionUpper}
            onChange={(v) => onChange("consumptionUpper", v)}
          />
          <CompactField
            label="Lo"
            value={values.consumptionLower}
            onChange={(v) => onChange("consumptionLower", v)}
          />
          <span className="text-[10px] text-muted-foreground">SCM³</span>
        </MetricGroup>
        <MetricGroup title="Battery">
          <CompactField
            label="Lo"
            value={values.batteryLower}
            onChange={(v) => onChange("batteryLower", v)}
            step="1"
            min="0"
            max="100"
          />
          <span className="text-[10px] text-muted-foreground">%</span>
        </MetricGroup>
      </div>
      {error && (
        <p className="text-xs" style={{ color: "var(--clr-alert)" }}>
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
