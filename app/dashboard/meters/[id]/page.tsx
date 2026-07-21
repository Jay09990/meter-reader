"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
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
  siteLabel: string | null;
  stationLabel: string | null;
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
  children,
}: {
  title: string;
  icon: React.ElementType;
  iconColor: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="bg-slate-900/60 border-slate-800">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-xs font-semibold uppercase tracking-wider text-slate-400">
          {title}
        </CardTitle>
        <Icon className={`w-4 h-4 ${iconColor}`} />
      </CardHeader>
      <CardContent className="space-y-1">{children}</CardContent>
    </Card>
  );
}

function DataRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center py-1 border-b border-slate-800/60 last:border-0">
      <span className="text-xs text-slate-400">{label}</span>
      <span className="font-mono text-sm text-slate-100">{value}</span>
    </div>
  );
}

function BigValue({ value, unit }: { value: string; unit?: string }) {
  return (
    <div className="flex items-baseline gap-1.5 mb-1">
      <span className="font-mono text-2xl font-semibold text-white">
        {value}
      </span>
      {unit && (
        <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider">
          {unit}
        </span>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function MeterDetailPage() {
  const { id } = useParams<{ id: string }>();

  const [deviceData, setDeviceData] = useState<{
    device: DeviceData;
    latestReading: LatestReading | null;
  } | null>(null);
  const [hourly, setHourly] = useState<HourlyData | null>(null);
  const [history, setHistory] = useState<HistoryRow[]>([]);
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

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadData();
  }, [loadData]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadHistory();
  }, [loadHistory]);

  // Prepare hourly chart data (fill 0–23 gaps with 0)
  const hourlyChartData = Array.from({ length: 24 }, (_, h) => {
    const match = hourly?.hourlyConsumption?.find((e) => e.hour === h);
    return { hour: `${h}:00`, value: match?.value ?? 0 };
  });

  const staleDays = daysSince(deviceData?.device.lastSeenAt ?? null);
  const isStale = staleDays !== null && staleDays > 0;

  if (loading) {
    return (
      <div className="space-y-6 max-w-7xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-5">
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
            <Card key={i} className="bg-slate-900/60 border-slate-800">
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
        <Card className="bg-slate-900/60 border-slate-800">
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
      <div className="space-y-4 max-w-7xl mx-auto">
        <Link href="/dashboard/meters">
          <Button variant="ghost" size="sm" className="text-slate-400 hover:text-white">
            <ChevronLeft className="w-4 h-4 mr-1" />
            Back to Meters
          </Button>
        </Link>
        <div className="p-4 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm">
          {error ?? "Device not found."}
        </div>
      </div>
    );
  }

  const { device, latestReading: r } = deviceData;

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* ── Breadcrumb / Title ─────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-5">
        <div className="space-y-1">
          <Link href="/dashboard/meters">
            <Button
              variant="ghost"
              size="sm"
              className="text-slate-400 hover:text-white -ml-2 mb-1"
            >
              <ChevronLeft className="w-4 h-4 mr-1" />
              Meter Directory
            </Button>
          </Link>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold text-white font-mono">
              {device.deviceSerialNo}
            </h1>
            {isStale ? (
              <Badge className="bg-amber-500/10 text-amber-400 border-amber-500/20">
                <Clock className="w-3 h-3 mr-1" />
                {staleDays}d old data
              </Badge>
            ) : (
              <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mr-1.5 animate-pulse" />
                Live
              </Badge>
            )}
          </div>
          <p className="text-sm text-slate-400">
            {device.siteLabel || device.stationLabel
              ? `${device.siteLabel ?? ""}${device.siteLabel && device.stationLabel ? " / " : ""}${device.stationLabel ?? ""}`
              : "General Fleet"}
            {r ? ` · Last reading: ${r.readingDate}` : " · No reading yet"}
          </p>
        </div>
        <Button
          onClick={loadData}
          variant="outline"
          size="sm"
          className="border-slate-800 bg-slate-900 text-slate-300 hover:bg-slate-800"
        >
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* ── KPI Cards ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {/* Volume */}
        <KpiCard title="Volume" icon={Activity} iconColor="text-orange-400">
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
        <KpiCard title="Pressure" icon={Gauge} iconColor="text-blue-400">
          <BigValue value={fmt(r?.gasPressure)} unit="barg" />
          <DataRow label="Current" value={`${fmt(r?.gasPressure)} barg`} />
          <DataRow label="Max" value={`${fmt(r?.pressureMax)} barg`} />
          <DataRow label="Min" value={`${fmt(r?.pressureMin)} barg`} />
        </KpiCard>

        {/* Temperature */}
        <KpiCard title="Temperature" icon={Thermometer} iconColor="text-rose-400">
          <BigValue value={fmt(r?.gasTemperature)} unit="°C" />
          <DataRow label="Current" value={`${fmt(r?.gasTemperature)} °C`} />
          <DataRow label="Max" value={`${fmt(r?.temperatureMax)} °C`} />
          <DataRow label="Min" value={`${fmt(r?.temperatureMin)} °C`} />
        </KpiCard>

        {/* Gas Properties */}
        <KpiCard title="Gas Properties" icon={Layers} iconColor="text-purple-400">
          <DataRow label="Compressibility (Z)" value={fmt(r?.compressibilityZ, 4)} />
          <DataRow label="Compressibility (Fpv)" value={fmt(r?.compressibilityFpv, 4)} />
          <DataRow label="Correction Factor (C)" value={fmt(r?.correctionFactorC, 4)} />
          <DataRow label="Density" value={`${fmt(r?.gasDensity, 3)} kg/m³`} />
        </KpiCard>

        {/* Meter Info */}
        <KpiCard title="Meter Info" icon={Info} iconColor="text-slate-400">
          <DataRow label="Meter Serial" value={device.meterSerialNo ?? "—"} />
          <DataRow label="Meter Size" value={device.meterSize ?? "—"} />
          <DataRow
            label="First Seen"
            value={new Date(device.firstSeenAt).toLocaleDateString()}
          />
          <DataRow
            label="Last Seen"
            value={
              device.lastSeenAt
                ? new Date(device.lastSeenAt).toLocaleDateString()
                : "—"
            }
          />
        </KpiCard>
      </div>

      {/* ── Hourly Consumption Chart ────────────────────────────────────── */}
      <Card className="bg-slate-900/60 border-slate-800">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold text-slate-200">
              Hourly Consumption
              {hourly?.date && (
                <span className="ml-2 text-xs text-slate-500 font-mono">
                  {hourly.date}
                </span>
              )}
            </CardTitle>
            <span className="text-xs text-slate-500 uppercase tracking-wider font-semibold">
              Sm³ / hour
            </span>
          </div>
        </CardHeader>
        <CardContent>
          {hourly && hourly.hourlyConsumption.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart
                data={hourlyChartData}
                margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
              >
                <XAxis
                  dataKey="hour"
                  tick={{ fontSize: 10, fill: "#64748b" }}
                  interval={3}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: "#64748b" }}
                  tickLine={false}
                  axisLine={false}
                  width={40}
                />
                <Tooltip
                  contentStyle={{
                    background: "#0f172a",
                    border: "1px solid #1e293b",
                    borderRadius: "6px",
                    fontSize: "12px",
                    color: "#e2e8f0",
                  }}
                  cursor={{ fill: "rgba(255,255,255,0.04)" }}
                />
                <Bar dataKey="value" fill="#f97316" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[200px] flex items-center justify-center text-slate-500 text-sm">
              No hourly data for this reading.
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Trend Charts ───────────────────────────────────────────────── */}
      <Card className="bg-slate-900/60 border-slate-800">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-sm font-semibold text-slate-200">
              Historical Trends
            </CardTitle>
            <div className="flex gap-1">
              {([7, 30, 90] as const).map((d) => (
                <button
                  key={d}
                  onClick={() => setTrendDays(d)}
                  className={`px-3 py-1 text-xs font-semibold rounded transition-colors ${
                    trendDays === d
                      ? "bg-orange-600 text-white"
                      : "bg-slate-800 text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {d}d
                </button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {history.length === 0 ? (
            <div className="h-32 flex items-center justify-center text-slate-500 text-sm">
              No history data available for this range.
            </div>
          ) : (
            <>
              {/* Volume trend */}
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold mb-2">
                  Corrected Volume (Sm³)
                </p>
                <ResponsiveContainer width="100%" height={140}>
                  <LineChart
                    data={history}
                    margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 10, fill: "#64748b" }}
                      tickLine={false}
                      axisLine={false}
                      interval="preserveStartEnd"
                    />
                    <YAxis
                      tick={{ fontSize: 10, fill: "#64748b" }}
                      tickLine={false}
                      axisLine={false}
                      width={50}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "#0f172a",
                        border: "1px solid #1e293b",
                        borderRadius: "6px",
                        fontSize: "12px",
                        color: "#e2e8f0",
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="correctedVolumeVb"
                      stroke="#f97316"
                      strokeWidth={2}
                      dot={false}
                      name="Corrected Vol"
                      connectNulls
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* Pressure trend */}
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold mb-2">
                  Gas Pressure (barg)
                </p>
                <ResponsiveContainer width="100%" height={140}>
                  <LineChart
                    data={history}
                    margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 10, fill: "#64748b" }}
                      tickLine={false}
                      axisLine={false}
                      interval="preserveStartEnd"
                    />
                    <YAxis
                      tick={{ fontSize: 10, fill: "#64748b" }}
                      tickLine={false}
                      axisLine={false}
                      width={40}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "#0f172a",
                        border: "1px solid #1e293b",
                        borderRadius: "6px",
                        fontSize: "12px",
                        color: "#e2e8f0",
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="gasPressure"
                      stroke="#3b82f6"
                      strokeWidth={2}
                      dot={false}
                      name="Pressure"
                      connectNulls
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* Temperature trend */}
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold mb-2">
                  Gas Temperature (°C)
                </p>
                <ResponsiveContainer width="100%" height={140}>
                  <LineChart
                    data={history}
                    margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 10, fill: "#64748b" }}
                      tickLine={false}
                      axisLine={false}
                      interval="preserveStartEnd"
                    />
                    <YAxis
                      tick={{ fontSize: 10, fill: "#64748b" }}
                      tickLine={false}
                      axisLine={false}
                      width={40}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "#0f172a",
                        border: "1px solid #1e293b",
                        borderRadius: "6px",
                        fontSize: "12px",
                        color: "#e2e8f0",
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="gasTemperature"
                      stroke="#f43f5e"
                      strokeWidth={2}
                      dot={false}
                      name="Temperature"
                      connectNulls
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* ── Device Info (collapsible) ────────────────────────────────── */}
      <Card className="bg-slate-900/60 border-slate-800">
        <button
          onClick={() => setShowDeviceInfo((v) => !v)}
          className="w-full flex items-center justify-between px-6 py-4 text-left"
        >
          <span className="text-sm font-semibold text-slate-200">
            Device Information
          </span>
          {showDeviceInfo ? (
            <ChevronUp className="w-4 h-4 text-slate-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-slate-400" />
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
            <DataRow label="Site Label" value={device.siteLabel ?? "—"} />
            <DataRow
              label="Station Label"
              value={device.stationLabel ?? "—"}
            />
          </CardContent>
        )}
      </Card>
    </div>
  );
}
