"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Flame,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  RefreshCw,
  Activity,
  Fuel,
  Factory,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BarChart, Bar, CartesianGrid, Cell, XAxis, YAxis, PieChart, Pie, Tooltip } from "recharts";
import { useAutoRefresh } from "@/lib/auto-refresh";
import { formatLocalTs } from "@/lib/utils";
import { getChartTheme } from "@/lib/chart-theme";
import { ChartContainer, ChartLegend, ChartLegendContent } from "@/components/ui/chart";
import { CapacityBanner } from "@/components/layout/capacity-banner";
import { PeriodSelector } from "@/components/ui/period-selector";
import { pickTicks, tickCountForMode, type ConsumptionBucket, type ConsumptionMode } from "@/lib/consumption-series";
import { getFinancialYearLabel, getQuarterlyFinancialYearRangeLabel } from "@/lib/financial-calendar";
import { KpiRangeSelector } from "@/components/overview/kpi-range-selector";
import type { KpiRange } from "@/features/overview/service";

// AMR overview dashboard with summary metrics and telemetry charts.
interface FleetOverviewData {
  totalDevices: number;
  reportedToday: number;
  staleDevices: number;
  offlineDevices: number;
  openAlarms: number;
  criticalAlarms: number;
  warningAlarms: number;
  metersOnline?: { value: number; totalDevices: number; uptimePercent: number };
  consumptionByCategory?: Array<{ category: string; totalVolume: number }>;
  activeAlerts?: number;
  topConsumingCustomers?: Array<{
    customerName: string;
    deviceSerialNo: string;
    city: string;
    category: string;
    flowValue: number | null;
    suspect?: boolean;
    status: "NEW" | "ONLINE" | "OFFLINE" | "ALERT";
  }>;
  leastConsumingCustomers?: Array<{
    customerName: string;
    deviceSerialNo: string;
    city: string;
    category: string;
    flowValue: number | null;
    suspect?: boolean;
    status: "NEW" | "ONLINE" | "OFFLINE" | "ALERT";
  }>;
}

interface AlarmFeedItem {
  id: string;
  deviceId: string;
  deviceSerialNo: string;
  meterSerialNo: string | null;
  customerName: string | null;
  gaName: string | null;
  type: string;
  cause: string;
  gasValue: number | null;
  averageValue: number | null;
  forDate: string;
  status: string;
  severity: string;
  acknowledged: boolean;
  createdAt: string;
}

const categoryColors: Record<string, string> = {
  COMMERCIAL: "var(--clr-commercial)",
  RESIDENTIAL: "var(--clr-residential)",
  DRS: "var(--clr-drs)",
  INDUSTRIAL_CNG: "var(--clr-cng)",
  INDUSTRIAL_PNG: "var(--clr-png)",
};

const humanCategoryLabel = (category: string) => {
  return category.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
};

const fmt = (value: number | null | undefined, decimals = 2) => {
  if (value == null || Number.isNaN(value)) return "—";
  return value.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
};

interface ConsumptionUser {
  customerName: string;
  deviceSerialNo: string;
  flowValue: number;
}

function ConsumptionTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string; payload: { users?: ConsumptionUser[] } }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const users = payload[0]?.payload?.users ?? [];
  return (
    <div
      style={{
        background: "var(--background)",
        border: "1px solid var(--border)",
        borderRadius: 10,
        boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
        padding: "10px 14px",
        minWidth: 220,
        maxWidth: 300,
        fontSize: 12,
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: 6, color: "var(--foreground)" }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
          <span style={{ width: 10, height: 10, borderRadius: "50%", background: p.color, display: "inline-block", flexShrink: 0 }} />
          <span style={{ color: "var(--muted-foreground)" }}>{p.name}</span>
          <span style={{ marginLeft: "auto", fontFamily: "monospace", fontWeight: 600, color: "var(--foreground)" }}>
            {fmt(p.value, 0)}
          </span>
        </div>
      ))}
      {users.length > 0 && (
        <>
          <div style={{ borderTop: "1px solid var(--border)", margin: "8px 0 6px", opacity: 0.5 }} />
          <div style={{ fontWeight: 600, marginBottom: 4, color: "var(--muted-foreground)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em" }}>Users</div>
          <div style={{ maxHeight: 180, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
            {users.slice(0, 10).map((u, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ flex: 1, fontWeight: 500, color: "var(--foreground)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {u.customerName}
                </span>
                <span style={{ fontFamily: "monospace", fontSize: 10, color: "var(--muted-foreground)", whiteSpace: "nowrap" }}>
                  {u.deviceSerialNo}
                </span>
                <span style={{ fontFamily: "monospace", fontWeight: 600, color: "var(--foreground)", marginLeft: 4, whiteSpace: "nowrap" }}>
                  {fmt(u.flowValue, 0)}
                </span>
              </div>
            ))}
            {users.length > 10 && (
              <div style={{ color: "var(--muted-foreground)", fontSize: 10, textAlign: "center" }}>
                +{users.length - 10} more
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function ConsumptionKpiValue({
  loading,
  value,
}: {
  loading: boolean;
  value: number;
}) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="text-3xl font-extrabold text-foreground">
        {loading ? "..." : fmt(value, 0)}
      </span>
      {!loading && <span className="text-xs font-semibold text-muted-foreground">SCM³</span>}
    </div>
  );
}

const renderStatus = (status: string) => {
  switch (status) {
    case "ONLINE":
      return (
        <Badge
          className="font-bold"
          style={{background:'var(--clr-online)18', color:'var(--clr-online)', border:'1px solid var(--clr-online)44'}}
        >
          <CheckCircle2 className="w-3 h-3 mr-1" />
          ONLINE
        </Badge>
      );
    case "OFFLINE":
      return (
        <Badge
          className="font-bold"
          style={{background:'var(--clr-offline)18', color:'var(--clr-offline)', border:'1px solid var(--clr-offline)44'}}
        >
          <AlertTriangle className="w-3 h-3 mr-1" />
          OFFLINE
        </Badge>
      );
    case "ALERT":
      return (
        <Badge
          className="font-bold"
          style={{background:'var(--clr-alert)18', color:'var(--clr-alert)', border:'1px solid var(--clr-alert)44'}}
        >
          <AlertTriangle className="w-3 h-3 mr-1 animate-bounce" />
          ALERT
        </Badge>
      );
    case "NEW":
      return (
        <Badge
          className="font-bold"
          style={{background:'var(--clr-new)18', color:'var(--clr-new)', border:'1px solid var(--clr-new)44'}}
        >
          NEW
        </Badge>
      );
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
};

const renderCategory = (category: string) => {
  const color = categoryColors[category] ?? "var(--clr-accent-mid)";
  return (
    <Badge
      variant="outline"
      style={{ borderColor: `${color}55`, color, background: `${color}18` }}
    >
      {humanCategoryLabel(category)}
    </Badge>
  );
};

const renderAlarmSeverity = (severity: string) => {
  const color = severity === "CRITICAL" ? "var(--clr-critical)" : "var(--clr-alert)";
  return (
    <Badge
      className="font-bold"
      style={{ background: `${color}18`, color, border: `1px solid ${color}44` }}
    >
      {severity}
    </Badge>
  );
};

const renderAlarmStatus = (status: string, acknowledged: boolean) => (
  <>
    {status === "OPEN" ? (
      <Badge className="font-bold" style={{ background: "var(--clr-alert)", color: "#fff" }}>
        OPEN
      </Badge>
    ) : (
      <Badge
        className="font-bold"
        style={{ background: "var(--clr-resolved)22", color: "var(--clr-resolved)", border: "1px solid var(--clr-resolved)44" }}
      >
        RESOLVED
      </Badge>
    )}
    {acknowledged && (
      <Badge
        style={{ background: "var(--clr-online)18", color: "var(--clr-online)", border: "1px solid var(--clr-online)44" }}
      >
        ACK
      </Badge>
    )}
  </>
);

export default function OverviewPage() {
  const chartTheme = getChartTheme();
  const [data, setData] = useState<FleetOverviewData | null>(null);
  const [alarmFeed, setAlarmFeed] = useState<AlarmFeedItem[]>([]);
  const [maxMeterCapacity, setMaxMeterCapacity] = useState<number | null>(null);
  const [consumptionPeriod, setConsumptionPeriod] = useState<ConsumptionMode>("daily");
  const [consumption, setConsumption] = useState<ConsumptionBucket[]>([]);
  const [kpiRange, setKpiRange] = useState<KpiRange>("today");
  const [loading, setLoading] = useState<boolean>(true);
  const [loadingConsumption, setLoadingConsumption] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchOverview = useCallback(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/overview?range=${kpiRange}`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load overview data");
        return res.json();
      })
      .then((d) => {
        setData((prev) => (prev ? { ...prev, ...d } : d));
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
    fetch("/api/system/capacity-status")
      .then((res) => (res.ok ? res.json() : null))
      .then((status) => setMaxMeterCapacity(status?.maxCapacity ?? null))
      .catch(() => {});
    fetch("/api/alarms?page=1&limit=10")
      .then((res) => (res.ok ? res.json() : null))
      .then((result) => setAlarmFeed(result?.items ?? []))
      .catch(() => {});
  }, [kpiRange]);

  const fetchConsumptionSeries = useCallback(() => {
    setLoadingConsumption(true);
    fetch(`/api/overview/consumption?period=${consumptionPeriod}`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load consumption data");
        return res.json();
      })
      .then((d) => {
        setConsumption(d?.consumption ?? []);
        setLoadingConsumption(false);
      })
      .catch(() => {
        setLoadingConsumption(false);
      });
  }, [consumptionPeriod]);

  useEffect(() => {
    fetchOverview();
  }, [fetchOverview]);

  useEffect(() => {
    fetchConsumptionSeries();
  }, [fetchConsumptionSeries]);

  useAutoRefresh(fetchOverview);

  const meterStats = data?.metersOnline;
  const categorySeries = (data?.consumptionByCategory ?? []).map((item) => ({
    ...item,
    label: humanCategoryLabel(item.category),
    color: categoryColors[item.category] ?? "var(--clr-accent-mid)",
  }));
  const hasCategoryData =
    categorySeries.length > 0 &&
    categorySeries.some((item) => (item.totalVolume ?? 0) > 0);
  const consumptionSeries = consumption.map((item) => ({
    ...item,
    value: Number(item.value ?? 0),
    cng: Number(item.cngValue ?? 0),
    png: Number(item.pngValue ?? 0),
  }));
  const hasConsumptionData =
    consumptionSeries.length > 0 &&
    consumptionSeries.some((item) => item.cng > 0 || item.png > 0);
  const consumptionTicks = pickTicks(consumptionSeries.map((item) => item.label), tickCountForMode(consumptionPeriod));

  return (
    <div className="space-y-8 w-full">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">AMR Consumption Overview</h1>
            <Badge
              variant="outline"
              className="font-semibold"
              style={{borderColor:'var(--clr-accent-hi)44', color:'var(--clr-accent-hi)', background:'var(--clr-accent-hi)18'}}
            >
              AMR Live
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Automated Meter Reading analytics and live telemetry health in one place.
          </p>
        </div>

        <div className="flex items-center gap-4">
          <KpiRangeSelector value={kpiRange} onChange={setKpiRange} />
          <Button
            onClick={fetchOverview}
            disabled={loading}
            variant="outline"
            size="sm"
            className="border-border bg-secondary text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Refresh Data
          </Button>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-lg text-sm" style={{background:'var(--clr-alert)18', border:'1px solid var(--clr-alert)44', color:'var(--clr-alert)'}}>
          {error}
        </div>
      )}

      <CapacityBanner variant="full" />

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-6 gap-4">
        <Card className="bg-card border-border text-card-foreground">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Meters Online
            </CardTitle>
            <Activity className="w-5 h-5" style={{color:'var(--clr-accent-hi)'}} />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-extrabold text-foreground">
              {loading ? "..." : `${meterStats?.value ?? 0}/${meterStats?.totalDevices ?? 0}`}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {meterStats?.uptimePercent ?? 0}% uptime in last 24h
            </p>
          </CardContent>
        </Card>

        <Card className="bg-card border-border text-card-foreground">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Maximum Connection Capacity
            </CardTitle>
            <Activity className="w-5 h-5" style={{color:'var(--clr-accent-mid)'}} />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-extrabold text-foreground">
              {loading ? "..." : maxMeterCapacity === null ? "Unlimited" : `${meterStats?.totalDevices ?? 0}/${maxMeterCapacity}`}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Connected meters</p>
          </CardContent>
        </Card>

        <Card className="bg-card border-border text-card-foreground">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Industrial Consumption
            </CardTitle>
            <Factory className="w-5 h-5" style={{color:'var(--clr-industrial)'}} />
          </CardHeader>
          <CardContent>
            <ConsumptionKpiValue
              loading={loading}
              value={(categorySeries.find((item) => item.category === "INDUSTRIAL_CNG")?.totalVolume ?? 0) + (categorySeries.find((item) => item.category === "INDUSTRIAL_PNG")?.totalVolume ?? 0)}
            />
            <p className="text-xs text-muted-foreground mt-1">Consumption for selected range</p>
          </CardContent>
        </Card>

        <Card className="bg-card border-border text-card-foreground">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Industrial CNG Consumption
            </CardTitle>
            <Fuel className="w-5 h-5" style={{color:'var(--clr-cng)'}} />
          </CardHeader>
          <CardContent>
            <ConsumptionKpiValue
              loading={loading}
              value={categorySeries.find((item) => item.category === "INDUSTRIAL_CNG")?.totalVolume ?? 0}
            />
            <p className="text-xs text-muted-foreground mt-1">Consumption for selected range</p>
          </CardContent>
        </Card>

        <Card className="bg-card border-border text-card-foreground">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Industrial PNG Consumption
            </CardTitle>
            <Flame className="w-5 h-5" style={{color:'var(--clr-png)'}} />
          </CardHeader>
          <CardContent>
            <ConsumptionKpiValue
              loading={loading}
              value={categorySeries.find((item) => item.category === "INDUSTRIAL_PNG")?.totalVolume ?? 0}
            />
            <p className="text-xs text-muted-foreground mt-1">Consumption for selected range</p>
          </CardContent>
        </Card>

        <Card className="bg-card border-border text-card-foreground">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Active Alerts
            </CardTitle>
            <AlertTriangle className="w-5 h-5" style={{color:'var(--clr-alert)'}} />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-extrabold" style={{color:'var(--clr-alert)'}}>
              {loading ? "..." : (data?.activeAlerts ?? data?.openAlarms ?? 0).toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Open alarms tracked now</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Card className="bg-card border-border">
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <CardTitle className="text-lg font-semibold text-foreground">Consumption</CardTitle>
                {consumptionPeriod === "quarterly" && (
                  <Badge
                    variant="outline"
                    className="font-medium text-xs px-2 py-0.5 border-border bg-secondary text-muted-foreground"
                  >
                    {getQuarterlyFinancialYearRangeLabel()}
                  </Badge>
                )}
              </div>
              <PeriodSelector value={consumptionPeriod} onChange={setConsumptionPeriod} />
            </div>
          </CardHeader>
          <CardContent className="h-80">
            {loadingConsumption ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                <RefreshCw className="h-4 w-4 animate-spin mr-2" style={{ color: "var(--clr-accent-mid)" }} />
                Loading consumption…
              </div>
            ) : !hasConsumptionData ? (
              <div className="flex h-full flex-col items-center justify-center text-sm text-muted-foreground">
                <p className="text-center text-muted-foreground">
                  No consumption data is available for the selected range.
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Adjust the time period or range above to see the chart.
                </p>
              </div>
            ) : (
              <ChartContainer
                config={{
                  cng: { label: "CNG Consumption", color: "var(--clr-cng)" },
                  png: { label: "PNG Consumption", color: "var(--clr-png)" },
                }}
                className="h-full w-full"
              >
                <BarChart data={consumptionSeries}>
                  <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.grid} opacity={0.7} />
                  <XAxis dataKey="label" ticks={consumptionTicks} tick={{ fill: chartTheme.tick, fontSize: 12 }} />
                  <YAxis tick={{ fill: chartTheme.tick, fontSize: 12 }} />
                  <Tooltip
                    cursor={{ fill: "var(--clr-accent-hi)", opacity: 0.07 }}
                    content={<ConsumptionTooltip />}
                  />
                  <ChartLegend content={<ChartLegendContent />} />
                  <Bar dataKey="cng" radius={[6, 6, 0, 0]}>
                    {consumptionSeries.map((entry) => (
                      <Cell key={entry.label} fill={entry.suspect ? "var(--clr-alert)" : "var(--clr-cng)"} />
                    ))}
                  </Bar>
                  <Bar dataKey="png" radius={[6, 6, 0, 0]}>
                    {consumptionSeries.map((entry) => (
                      <Cell key={entry.label} fill={entry.suspect ? "var(--clr-alert)" : "var(--clr-png)"} />
                    ))}
                  </Bar>
                </BarChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-lg font-semibold text-foreground">Consumption by Category</CardTitle>
          </CardHeader>
          <CardContent className="h-80 relative">
            {loading ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                <RefreshCw className="h-4 w-4 animate-spin mr-2" style={{ color: "var(--clr-accent-mid)" }} />
                Loading consumption…
              </div>
            ) : !hasCategoryData ? (
              <div className="flex h-full flex-col items-center justify-center text-sm text-muted-foreground">
                <p className="text-center text-muted-foreground">
                  No consumption data is available for the selected range.
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Adjust the time period or range above to see the breakdown by category.
                </p>
              </div>
            ) : (
              <div className="relative h-full w-full">
                <ChartContainer
                  config={Object.fromEntries(
                    categorySeries.map((category) => [
                      category.category,
                      { label: category.label, color: category.color },
                    ])
                  )}
                  className="h-full w-full"
                >
                  <PieChart>
                    <Tooltip />
                    <Pie
                      data={categorySeries}
                      dataKey="totalVolume"
                      nameKey="label"
                      cx="42%"
                      cy="50%"
                      outerRadius="68%"
                      paddingAngle={2}
                      label={({ name, value }) => `${name}: ${fmt(Number(value), 0)}`}
                      labelLine={{ stroke: "var(--muted-foreground)", strokeWidth: 1 }}
                    >
                      {categorySeries.map((entry) => (
                        <Cell key={entry.category} fill={entry.color} />
                      ))}
                    </Pie>
                  </PieChart>
                </ChartContainer>

                {/* Compact Top-Right Corner Table View */}
                <div className="absolute top-0 right-0 z-10 w-auto min-w-[170px] max-w-[210px] rounded-lg border border-border bg-card/90 backdrop-blur shadow-sm overflow-hidden">
                  <Table>
                    <TableHeader className="bg-secondary/70">
                      <TableRow className="border-border hover:bg-transparent">
                        <TableHead className="text-muted-foreground text-[10px] font-bold uppercase tracking-wider py-1 px-2.5 h-6">Category</TableHead>
                        <TableHead className="text-right text-muted-foreground text-[10px] font-bold uppercase tracking-wider py-1 px-2.5 h-6">Value (SCM)</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {categorySeries.map((item) => (
                        <TableRow key={item.category} className="border-border hover:bg-secondary/40">
                          <TableCell className="py-1 px-2.5 font-medium text-[11px] flex items-center gap-1.5 leading-tight">
                            <span className="w-2 h-2 rounded-full inline-block shrink-0" style={{ backgroundColor: item.color }} />
                            <span className="text-foreground truncate">{item.label}</span>
                          </TableCell>
                          <TableCell className="py-1 px-2.5 text-right font-mono text-[11px] text-muted-foreground leading-tight">
                            {fmt(item.totalVolume, 2)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-lg font-semibold text-foreground">Top 5 Consuming Customers</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Device</TableHead>
                  <TableHead>City</TableHead>
                  <TableHead>Flow</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data?.topConsumingCustomers ?? []).map((customer) => (
                  <TableRow key={`${customer.deviceSerialNo}-${customer.customerName}`}>
                    <TableCell className="font-medium text-foreground">{customer.customerName}</TableCell>
                    <TableCell>{renderCategory(customer.category)}</TableCell>
                    <TableCell className="text-muted-foreground">{customer.deviceSerialNo}</TableCell>
                    <TableCell className="text-muted-foreground">{customer.city}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {customer.suspect ? (
                        <Badge
                          variant="outline"
                          style={{borderColor:'var(--clr-suspect)55', color:'var(--clr-suspect)', background:'var(--clr-suspect)18'}}
                        >
                          Suspect
                        </Badge>
                      ) : (
                        fmt(customer.flowValue, 0)
                      )}
                    </TableCell>
                    <TableCell>{renderStatus(customer.status)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-lg font-semibold text-foreground">Least 5 Consuming Customers</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Device</TableHead>
                  <TableHead>City</TableHead>
                  <TableHead>Flow</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data?.leastConsumingCustomers ?? []).map((customer) => (
                  <TableRow key={`${customer.deviceSerialNo}-${customer.customerName}`}>
                    <TableCell className="font-medium text-foreground">{customer.customerName}</TableCell>
                    <TableCell>{renderCategory(customer.category)}</TableCell>
                    <TableCell className="text-muted-foreground">{customer.deviceSerialNo}</TableCell>
                    <TableCell className="text-muted-foreground">{customer.city}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {customer.suspect ? (
                        <Badge
                          variant="outline"
                          style={{borderColor:'var(--clr-suspect)55', color:'var(--clr-suspect)', background:'var(--clr-suspect)18'}}
                        >
                          Suspect
                        </Badge>
                      ) : (
                        fmt(customer.flowValue, 0)
                      )}
                    </TableCell>
                    <TableCell>{renderStatus(customer.status)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-card border-border overflow-y-scroll h-[500px]">
        <CardHeader>
          <CardTitle className="text-lg font-semibold text-foreground">Live Event Feed</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {alarmFeed.length === 0 && !loading ? (
            <div className="text-sm text-muted-foreground">No alarms recorded yet.</div>
          ) : (
            alarmFeed.map((alarm) => (
              <div key={alarm.id} className="rounded-lg border border-border bg-secondary px-3 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-medium text-foreground">
                    {alarm.type.replace(/_/g, " ")}
                  </div>
                  <div className="flex items-center gap-1.5">
                    {renderAlarmSeverity(alarm.severity)}
                    {renderAlarmStatus(alarm.status, alarm.acknowledged)}
                  </div>
                </div>
                <p className="mt-1 text-sm text-muted-foreground break-words">{alarm.cause}</p>
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs" style={{ color: "var(--clr-accent-lo)" }}>
                  <span className="font-medium text-foreground">{alarm.customerName ?? "Unassigned"}</span>
                  <span className="font-mono">{alarm.deviceSerialNo}</span>
                  <span>for {alarm.forDate}</span>
                  <span>{formatLocalTs(alarm.createdAt)}</span>
                  {alarm.gasValue != null && alarm.averageValue != null && (
                    <span>
                      {fmt(alarm.gasValue, 1)} vs avg {fmt(alarm.averageValue, 1)}
                    </span>
                  )}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card className="bg-card border-border hover:border-accent-mid p-6 flex flex-col justify-between transition-all">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 rounded-lg" style={{background:'var(--clr-accent-hi)1a', color:'var(--clr-accent-hi)'}}>
              <Flame className="w-5 h-5" />
            </div>
            <h3 className="text-lg font-semibold text-foreground">Meter Directory</h3>
          </div>
          <p className="text-sm text-muted-foreground mb-6">
            Browse, filter, and inspect individual AMR devices and meter readings with server-side search and pagination.
          </p>
        </div>
        <Link href="/dashboard/meters">
          <Button className="w-full font-medium text-white" style={{background:'var(--clr-accent-mid)'}}>
            Open Meter Table
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </Link>
      </Card>
    </div>
  );
}
