"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  AreaChart,
  Area,
  CartesianGrid,
  Cell,
} from "recharts";
import {
  ChevronLeft,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Clock,
  Thermometer,
  Gauge,
  Layers,
  Info,
  Activity,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAutoRefresh } from "@/lib/auto-refresh";
import { formatLocalTs, formatLocalDate } from "@/lib/utils";
import { getChartTheme } from "@/lib/chart-theme";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { PeriodSelector } from "@/components/ui/period-selector";
import { pickTicks, tickCountForMode, type ConsumptionBucket, type ConsumptionMode } from "@/lib/consumption-series";

// ─── Types ────────────────────────────────────────────────────────────────────

interface DeviceData {
  id: string;
  deviceSerialNo: string;
  meterSerialNo: string | null;
  meterSize: string | null;
  firmwareVersion: string | null;
  hardwareVersion: string | null;
  deviceModel: string | null;
  configurationVersion: string | null;
  customerName: string | null;
  gaName: string | null;
  firstSeenAt: string;
  lastSeenAt: string | null;
}

interface LatestReading {
  id: string;
  readingDate: string;
  correctedVolumeVb: number | null;
  uncorrectedVolumeVm: number | null;
  gasPressure: number | null;
  pressureMax: number | null;
  pressureMin: number | null;
  gasTemperature: number | null;
  temperatureMax: number | null;
  temperatureMin: number | null;
  compressibilityZ: number | null;
  compressibilityFpv: number | null;
  correctionFactorC: number | null;
  gasDensity: number | null;
  hourlyConsumption: { hour: number; value: number }[] | null;
  receivedAt: string;
}

interface HourlyData {
  date: string;
  hourlyConsumption: { hour: number; value: number }[];
}

interface HistoryRow {
  date: string;
  timestamp: string; // ISO receivedAt — one entry per push, not per day
  correctedVolumeVb: number | null;
  uncorrectedVolumeVm: number | null;
  gasPressure: number | null;
  gasTemperature: number | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(val: number | null | undefined, decimals = 2): string {
  if (val == null) return "—";
  return val.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function daysSince(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const then = new Date(dateStr).getTime();
  const now = Date.now();
  return Math.floor((now - then) / 86_400_000);
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function KpiCard({
  title,
  icon: Icon,
  iconColor,
  iconStyle,
  children,
}: {
  title: string;
  icon: React.ElementType;
  iconColor?: string;
  iconStyle?: React.CSSProperties;
  children: React.ReactNode;
}) {
  return (
    <Card size="sm" className="bg-card border-border">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1">
        <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {title}
        </CardTitle>
        <Icon className={`w-4 h-4 ${iconColor ?? ''}`} style={iconStyle} />
      </CardHeader>
      <CardContent className="space-y-0.5">{children}</CardContent>
    </Card>
  );
}

function DataRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center gap-3 rounded-sm py-0.5 leading-tight odd:bg-muted/40 border-b border-border last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="font-mono text-sm text-foreground">{value}</span>
    </div>
  );
}

function BigValue({ value, unit }: { value: string; unit?: string }) {
  return (
    <div className="flex items-baseline gap-1.5 mb-0.5">
      <span className="font-mono text-xl font-semibold text-foreground">
        {value}
      </span>
      {unit && (
        <span className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">
          {unit}
        </span>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function MeterDetailPage() {
  const { id } = useParams<{ id: string }>();
  const chartTheme = getChartTheme();

  const [deviceData, setDeviceData] = useState<{
    device: DeviceData;
    latestReading: LatestReading | null;
  } | null>(null);
  const [hourly, setHourly] = useState<HourlyData | null>(null);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [consumption, setConsumption] = useState<ConsumptionBucket[]>([]);
  const [consumptionPeriod, setConsumptionPeriod] = useState<ConsumptionMode>("daily");
  const [consumptionLoading, setConsumptionLoading] = useState(true);
  const [consumptionError, setConsumptionError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [trendDays, setTrendDays] = useState<7 | 30 | 90>(30);
  const [showDeviceInfo, setShowDeviceInfo] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [latestRes, hourlyRes] = await Promise.all([
        fetch(`/api/devices/${id}/latest`),
        fetch(`/api/devices/${id}/hourly`),
      ]);
      if (!latestRes.ok) throw new Error("Device not found");
      const latestJson = await latestRes.json();
      setDeviceData(latestJson);
      if (hourlyRes.ok) {
        const h = await hourlyRes.json();
        setHourly(h);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load device");
    } finally {
      setLoading(false);
    }
  }, [id]);

  const loadHistory = useCallback(async () => {
    const res = await fetch(`/api/devices/${id}/history?days=${trendDays}`);
    if (res.ok) {
      const data = await res.json();
      setHistory(data.history || []);
    }
  }, [id, trendDays]);

  const loadConsumption = useCallback(async () => {
    setConsumptionLoading(true);
    setConsumptionError(null);
    try {
      const response = await fetch(`/api/devices/${id}/consumption?period=${consumptionPeriod}`);
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Failed to fetch consumption");
      setConsumption(result.consumption ?? []);
    } catch (error) {
      setConsumptionError(error instanceof Error ? error.message : "Failed to fetch consumption");
    } finally {
      setConsumptionLoading(false);
    }
  }, [id, consumptionPeriod]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadData();
  }, [loadData]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadHistory();
  }, [loadHistory]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadConsumption();
  }, [loadConsumption]);

  useAutoRefresh(loadData);
  useAutoRefresh(loadHistory);
  useAutoRefresh(loadConsumption);

  // Prepare hourly chart data (fill 0–23 gaps with 0)
  const hourlyChartData = Array.from({ length: 24 }, (_, h) => {
    const match = hourly?.hourlyConsumption?.find((e) => e.hour === h);
    return { hour: `${h}:00`, value: match?.value ?? 0 };
  });
  const peakHourlyValue = Math.max(...hourlyChartData.map((item) => item.value), 0);
  const consumptionChartData = consumption.map((bucket) => ({ ...bucket, value: bucket.value ?? 0 }));
  const consumptionTicks = pickTicks(consumptionChartData.map((bucket) => bucket.label), tickCountForMode(consumptionPeriod));
  const peakConsumptionValue = Math.max(...consumptionChartData.map((bucket) => bucket.value), 0);
  const hasConsumptionValues = consumption.some((bucket) => bucket.value !== null && bucket.value !== 0);

  const staleDays = daysSince(deviceData?.device.lastSeenAt ?? null);
  const isStale = staleDays !== null && staleDays > 0;

  const chartData = useMemo(
  () =>
    history.map((h) => {
      const d = new Date(h.timestamp);
      // Same calendar day gets a time suffix so repeat pushes are
      // distinguishable on the x-axis; a lone daily push just shows the
      // date, same as before.
      const sameDayCount = history.filter((x) => x.date === h.date).length;
      const label =
        sameDayCount > 1
          ? `${h.date} ${d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}`
          : h.date;
      return { ...h, label };
    }),
  [history]
);

  if (loading) {
    return (
      <div className="space-y-6 w-full">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-5">
          <div className="space-y-2">
            <Skeleton className="h-8 w-24" />
            <div className="flex items-center gap-3">
              <Skeleton className="h-8 w-48" />
              <Skeleton className="h-6 w-20" />
            </div>
            <Skeleton className="h-4 w-64" />
          </div>
          <Skeleton className="h-9 w-24" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {[...Array(5)].map((_, i) => (
            <Card key={i} className="bg-card border-border">
              <CardHeader className="pb-3">
                <Skeleton className="h-4 w-24" />
              </CardHeader>
              <CardContent className="space-y-2">
                <Skeleton className="h-8 w-32 mb-4" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <Skeleton className="h-5 w-40" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-[200px] w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error || !deviceData) {
    return (
      <div className="space-y-4 w-full">
        <Link href="/dashboard/meters">
          <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
            <ChevronLeft className="w-4 h-4 mr-1" />
            Back to Meters
          </Button>
        </Link>
        <div className="p-4 rounded-lg text-sm" style={{background:'var(--clr-alert)18', border:'1px solid var(--clr-alert)44', color:'var(--clr-alert)'}}>
          {error ?? "Device not found."}
        </div>
      </div>
    );
  }

  const { device, latestReading: r } = deviceData;

  return (
    <div className="space-y-6 w-full">
      {/* ── Breadcrumb / Title ─────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-5">
        <div className="space-y-1">
          <Link href="/dashboard/meters">
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-foreground -ml-2 mb-1"
            >
              <ChevronLeft className="w-4 h-4 mr-1" />
              Meter Directory
            </Button>
          </Link>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold text-foreground font-mono">
              {device.deviceSerialNo}
            </h1>
            {isStale ? (
              <Badge style={{background:'var(--clr-stale)18', color:'var(--clr-stale)', border:'1px solid var(--clr-stale)44'}}>
                <Clock className="w-3 h-3 mr-1" />
                {staleDays}d old data
              </Badge>
            ) : (
              <Badge style={{background:'var(--clr-online)18', color:'var(--clr-online)', border:'1px solid var(--clr-online)44'}}>
                <span className="w-1.5 h-1.5 rounded-full mr-1.5 animate-pulse" style={{background:'var(--clr-online)'}} />
                Live
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            {device.customerName
              ? `${device.customerName} (${device.gaName || 'Unknown GA'})`
              : "Unassigned"}
            {r ? ` · Last reading: ${formatLocalTs(r.receivedAt)}` : " · No reading yet"}
          </p>
        </div>
        <Button
          onClick={loadData}
          variant="outline"
          size="sm"
          className="border-border bg-secondary text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* ── KPI Cards ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {/* Volume */}
        <KpiCard title="Volume" icon={Activity} iconStyle={{color:'var(--clr-accent-hi)'}}>
          <BigValue value={fmt(r?.correctedVolumeVb)} unit="Sm³" />
          <DataRow
            label="Corrected (Vb)"
            value={`${fmt(r?.correctedVolumeVb)} Sm³`}
          />
          <DataRow
            label="Uncorrected (Vm)"
            value={`${fmt(r?.uncorrectedVolumeVm)} m³`}
          />
        </KpiCard>

        {/* Pressure */}
        <KpiCard title="Pressure" icon={Gauge} iconStyle={{color:'var(--clr-commercial)'}}>
          <BigValue value={fmt(r?.gasPressure)} unit="barg" />
          <DataRow label="Current" value={`${fmt(r?.gasPressure)} barg`} />
          <DataRow label="Max" value={`${fmt(r?.pressureMax)} barg`} />
          <DataRow label="Min" value={`${fmt(r?.pressureMin)} barg`} />
        </KpiCard>

        {/* Temperature */}
        <KpiCard title="Temperature" icon={Thermometer} iconStyle={{color:'var(--clr-stale)'}}>
          <BigValue value={fmt(r?.gasTemperature)} unit="°C" />
          <DataRow label="Current" value={`${fmt(r?.gasTemperature)} °C`} />
          <DataRow label="Max" value={`${fmt(r?.temperatureMax)} °C`} />
          <DataRow label="Min" value={`${fmt(r?.temperatureMin)} °C`} />
        </KpiCard>

        <div className="space-y-4">
        {/* Gas Properties */}
        <KpiCard title="Gas Properties" icon={Layers} iconStyle={{color:'var(--clr-accent-lo)'}}>
          <DataRow label="Compressibility (Z)" value={fmt(r?.compressibilityZ, 4)} />
          <DataRow label="Compressibility (Fpv)" value={fmt(r?.compressibilityFpv, 4)} />
          <DataRow label="Correction Factor (C)" value={fmt(r?.correctionFactorC, 4)} />
          <DataRow label="Density" value={`${fmt(r?.gasDensity, 3)} kg/m³`} />
        </KpiCard>

        {/* Meter Info */}
        <KpiCard title="Meter Info" icon={Info} iconColor="text-muted-foreground">
          <DataRow label="Meter Serial" value={device.meterSerialNo ?? "—"} />
          <DataRow label="Meter Size" value={device.meterSize ?? "—"} />
          <DataRow
            label="First Seen"
            value={formatLocalTs(device.firstSeenAt)}
          />
          <DataRow
            label="Last Seen"
            value={formatLocalTs(device.lastSeenAt)}
          />
        </KpiCard>
        </div>

      {/* ── Hourly Consumption Chart ────────────────────────────────────── */}
        <Card className="xl:col-span-2 bg-card border-border">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold text-foreground">
              Hourly Consumption
              {hourly?.date && (
                <span className="ml-2 text-xs text-muted-foreground font-mono">
                  {hourly.date}
                </span>
              )}
            </CardTitle>
            <span className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">
              Sm³ / hour
            </span>
          </div>
        </CardHeader>
        <CardContent>
          {hourly && hourly.hourlyConsumption.length > 0 ? (
            <ChartContainer config={{ value: { label: "Consumption", color: "var(--chart-1)" } }} className="h-[200px] w-full">
              <BarChart
                data={hourlyChartData}
                margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
              >
                <XAxis
                  dataKey="hour"
                  tick={{ fontSize: 10, fill: chartTheme.tick }}
                  interval={3}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: chartTheme.tick }}
                  tickLine={false}
                  axisLine={false}
                  width={40}
                />
                <ChartTooltip
                  cursor={{ fill: "var(--clr-accent-hi)", opacity: 0.07 }}
                  content={<ChartTooltipContent />}
                />
                <Bar dataKey="value" radius={[2, 2, 0, 0]}>
                  {hourlyChartData.map((entry) => (
                    <Cell key={entry.hour} fill={entry.value === peakHourlyValue ? "var(--chart-1)" : "var(--chart-5)"} />
                  ))}
                </Bar>
              </BarChart>
            </ChartContainer>
          ) : (
            <div className="h-[200px] flex items-center justify-center text-muted-foreground text-sm">
              No hourly data for this reading.
            </div>
          )}
        </CardContent>
      </Card>
      </div>

      <Card className="bg-card border-border">
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="text-sm font-semibold text-foreground">Consumption</CardTitle>
            <PeriodSelector value={consumptionPeriod} onChange={setConsumptionPeriod} />
          </div>
        </CardHeader>
        <CardContent>
          {consumptionLoading ? (
            <div className="flex h-[200px] items-center justify-center text-sm text-muted-foreground">Loading consumption…</div>
          ) : consumptionError ? (
            <div className="flex h-[200px] items-center justify-center text-sm" style={{ color: "var(--clr-alert)" }}>{consumptionError}</div>
          ) : !hasConsumptionValues ? (
            <div className="flex h-[200px] items-center justify-center text-center text-sm text-muted-foreground">No consumption change is available for this period. This meter needs readings from both the start and end of a period to calculate a delta.</div>
          ) : (
            <ChartContainer config={{ value: { label: "Consumption", color: "var(--chart-1)" } }} className="h-[200px] w-full">
              <BarChart data={consumptionChartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <XAxis dataKey="label" ticks={consumptionTicks} tick={{ fontSize: 10, fill: chartTheme.tick }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 10, fill: chartTheme.tick }} tickLine={false} axisLine={false} width={40} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="value" radius={[2, 2, 0, 0]}>
                  {consumptionChartData.map((bucket) => (
                    <Cell key={bucket.label} fill={bucket.suspect ? "var(--clr-alert)" : bucket.value === peakConsumptionValue ? "var(--chart-1)" : "var(--chart-5)"} />
                  ))}
                </Bar>
              </BarChart>
            </ChartContainer>
          )}
          {consumption.some((bucket) => bucket.suspect) && <p className="mt-2 text-xs" style={{ color: "var(--clr-alert)" }}>Red bars indicate a meter reset was detected for that period.</p>}
        </CardContent>
      </Card>

      {/* ── Trend Charts ───────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-lg font-semibold text-foreground">Historical Trends</h2>
        <div className="flex gap-1 rounded-full bg-secondary p-1">
          {([7, 30, 90] as const).map((d) => (
            <button
              key={d}
              onClick={() => setTrendDays(d)}
              className="rounded-full px-3 py-1 text-xs font-semibold transition-colors"
              style={trendDays === d
                ? {background:'var(--clr-accent-hi)', color:'var(--accent-foreground)'}
                  : {background:'transparent', color:'var(--muted-foreground)'}
              }
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      {history.length === 0 ? (
        <Card className="bg-card border-border">
          <CardContent className="h-32 flex items-center justify-center text-muted-foreground text-sm">
            No history data available for this range.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="bg-card border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-foreground">Corrected Volume (Sm³)</CardTitle>
            </CardHeader>
            <CardContent>
              <ChartContainer config={{ correctedVolumeVb: { label: "Corrected Vol", color: "var(--clr-accent-hi)" } }} className="h-[140px] w-full">
                  <AreaChart
                    data={chartData}
                    margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient id="fillCorrectedVol" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--clr-accent-hi)" stopOpacity={0.28} />
                        <stop offset="95%" stopColor="var(--clr-accent-hi)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.grid} opacity={0.7} />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 10, fill: chartTheme.tick }}
                      tickLine={false}
                      axisLine={false}
                      interval="preserveStartEnd"
                    />
                    <YAxis
                      tick={{ fontSize: 10, fill: chartTheme.tick }}
                      tickLine={false}
                      axisLine={false}
                      width={50}
                    />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Area
                      type="monotone"
                      dataKey="correctedVolumeVb"
                      stroke="var(--clr-accent-hi)"
                      strokeWidth={2}
                      fill="url(#fillCorrectedVol)"
                      dot={false}
                      activeDot={{ r: 4 }}
                      name="Corrected Vol"
                      connectNulls
                    />
                  </AreaChart>
              </ChartContainer>
            </CardContent>
          </Card>

          <Card className="bg-card border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-foreground">Gas Pressure (barg)</CardTitle>
            </CardHeader>
            <CardContent>
              <ChartContainer config={{ gasPressure: { label: "Pressure", color: "var(--clr-commercial)" } }} className="h-[140px] w-full">
                  <AreaChart
                    data={history}
                    margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient id="fillPressure" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--clr-commercial)" stopOpacity={0.28} />
                        <stop offset="95%" stopColor="var(--clr-commercial)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.grid} opacity={0.7} />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 10, fill: chartTheme.tick }}
                      tickLine={false}
                      axisLine={false}
                      interval="preserveStartEnd"
                    />
                    <YAxis
                      tick={{ fontSize: 10, fill: chartTheme.tick }}
                      tickLine={false}
                      axisLine={false}
                      width={40}
                    />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Area
                      type="monotone"
                      dataKey="gasPressure"
                      stroke="var(--clr-commercial)"
                      strokeWidth={2}
                      fill="url(#fillPressure)"
                      dot={false}
                      name="Pressure"
                      activeDot={{ r: 4 }}
                      connectNulls
                    />
                  </AreaChart>
              </ChartContainer>
            </CardContent>
          </Card>

          <Card className="bg-card border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-foreground">Gas Temperature (°C)</CardTitle>
            </CardHeader>
            <CardContent>
              <ChartContainer config={{ gasTemperature: { label: "Temperature", color: "var(--clr-stale)" } }} className="h-[140px] w-full">
                  <AreaChart
                    data={history}
                    margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient id="fillTemperature" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--clr-stale)" stopOpacity={0.28} />
                        <stop offset="95%" stopColor="var(--clr-stale)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.grid} opacity={0.7} />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 10, fill: chartTheme.tick }}
                      tickLine={false}
                      axisLine={false}
                      interval="preserveStartEnd"
                    />
                    <YAxis
                      tick={{ fontSize: 10, fill: chartTheme.tick }}
                      tickLine={false}
                      axisLine={false}
                      width={40}
                    />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Area
                      type="monotone"
                      dataKey="gasTemperature"
                      stroke="var(--clr-stale)"
                      strokeWidth={2}
                      fill="url(#fillTemperature)"
                      dot={false}
                      name="Temperature"
                      activeDot={{ r: 4 }}
                      connectNulls
                    />
                  </AreaChart>
              </ChartContainer>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Device Info (collapsible) ────────────────────────────────── */}
      <Card className="bg-card border-border">
        <button
          onClick={() => setShowDeviceInfo((v) => !v)}
          className="w-full flex items-center justify-between px-6 py-4 text-left"
        >
          <span className="text-sm font-semibold text-foreground">
            Device Information
          </span>
          {showDeviceInfo ? (
            <ChevronUp className="w-4 h-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          )}
        </button>
        {showDeviceInfo && (
          <CardContent className="pt-0 grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1">
            <DataRow label="Device Serial" value={device.deviceSerialNo} />
            <DataRow label="Device Model" value={device.deviceModel ?? "—"} />
            <DataRow
              label="Firmware Version"
              value={device.firmwareVersion ?? "—"}
            />
            <DataRow
              label="Hardware Version"
              value={device.hardwareVersion ?? "—"}
            />
            <DataRow
              label="Config Version"
              value={device.configurationVersion ?? "—"}
            />
            <DataRow label="Customer" value={device.customerName ?? "—"} />
            <DataRow label="Geographical Area" value={device.gaName ?? "—"} />
          </CardContent>
        )}
      </Card>
    </div>
  );
}
