"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Flame,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  RefreshCw,
  Activity,
  Building2,
  Factory,
  MapPin,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BarChart, Bar, CartesianGrid, Cell, XAxis, YAxis, PieChart, Pie } from "recharts";
import { useAutoRefresh } from "@/lib/auto-refresh";
import { formatLocalTs } from "@/lib/utils";
import { getChartTheme } from "@/lib/chart-theme";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { CapacityBanner } from "@/components/layout/capacity-banner";

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
  monthlyConsumption?: Array<{ month: string; value: number }>;
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
  consumptionByCity?: Array<{ city: string; totalVolume: number }>;
  liveEvents?: Array<{
    id: string;
    kind: "ALARM" | "READING";
    label: string;
    message: string;
    timestamp: string;
  }>;
}

const categoryColors: Record<string, string> = {
  INDUSTRIAL: "var(--clr-industrial)",
  COMMERCIAL: "var(--clr-commercial)",
  RESIDENTIAL: "var(--clr-residential)",
  BULK: "var(--clr-bulk)",
};

const humanCategoryLabel = (category: string) => category.charAt(0) + category.slice(1).toLowerCase();

const fmt = (value: number | null | undefined, decimals = 2) => {
  if (value == null || Number.isNaN(value)) return "—";
  return value.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
};

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

export default function OverviewPage() {
  const chartTheme = getChartTheme();
  const [data, setData] = useState<FleetOverviewData | null>(null);
  const [maxMeterCapacity, setMaxMeterCapacity] = useState<number | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchOverview = () => {
    setLoading(true);
    setError(null);
    fetch("/api/overview")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load overview data");
        return res.json();
      })
      .then((d) => {
        setData(d);
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
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchOverview();
  }, []);

  useAutoRefresh(fetchOverview);

  const meterStats = data?.metersOnline;
  const categorySeries = (data?.consumptionByCategory ?? []).map((item) => ({
    ...item,
    label: humanCategoryLabel(item.category),
    color: categoryColors[item.category] ?? "var(--clr-accent-mid)",
  }));
  const monthlySeries = (data?.monthlyConsumption ?? []).map((item) => ({
    ...item,
    value: Number(item.value ?? 0),
  }));
  const peakMonthlyValue = Math.max(...monthlySeries.map((item) => item.value), 0);
  const citySeries = (data?.consumptionByCity ?? []).slice(0, 8);

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

      {error && (
        <div className="p-4 rounded-lg text-sm" style={{background:'var(--clr-alert)18', border:'1px solid var(--clr-alert)44', color:'var(--clr-alert)'}}>
          {error}
        </div>
      )}

      <CapacityBanner variant="full" />

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
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
            <div className="text-3xl font-extrabold text-foreground">
              {loading ? "..." : fmt(categorySeries.find((item) => item.category === "INDUSTRIAL")?.totalVolume ?? 0, 0)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Latest reading volume</p>
          </CardContent>
        </Card>

        <Card className="bg-card border-border text-card-foreground">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Commercial Consumption
            </CardTitle>
            <Building2 className="w-5 h-5" style={{color:'var(--clr-commercial)'}} />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-extrabold text-foreground">
              {loading ? "..." : fmt(categorySeries.find((item) => item.category === "COMMERCIAL")?.totalVolume ?? 0, 0)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Latest reading volume</p>
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
            <CardTitle className="text-lg font-semibold text-foreground">Monthly Consumption</CardTitle>
          </CardHeader>
          <CardContent className="h-80">
            <ChartContainer config={{ value: { label: "Consumption", color: "var(--chart-1)" } }} className="h-full w-full">
              <BarChart data={monthlySeries}>
                <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.grid} opacity={0.7} />
                <XAxis dataKey="month" tick={{ fill: chartTheme.tick, fontSize: 12 }} />
                <YAxis tick={{ fill: chartTheme.tick, fontSize: 12 }} />
                <ChartTooltip
                  cursor={{ fill: "var(--clr-accent-hi)", opacity: 0.07 }}
                  content={<ChartTooltipContent />}
                />
                <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                  {monthlySeries.map((entry) => (
                    <Cell key={entry.month} fill={entry.value === peakMonthlyValue ? "var(--chart-1)" : "var(--chart-5)"} />
                  ))}
                </Bar>
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-lg font-semibold text-foreground">Consumption by Category</CardTitle>
          </CardHeader>
          <CardContent className="h-80">
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
                <ChartTooltip content={<ChartTooltipContent />} />
                <Pie
                  data={categorySeries}
                  dataKey="totalVolume"
                  nameKey="label"
                  cx="50%"
                  cy="50%"
                  outerRadius="70%"
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

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 h-[500px]">
        <Card className="bg-card border-border overflow-y-scroll">
          <CardHeader>
            <CardTitle className="text-lg font-semibold text-foreground">Consumption by City</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {citySeries.map((city) => (
              <div key={city.city} className="flex items-center justify-between rounded-lg border border-border bg-secondary px-3 py-2">
                <div className="flex items-center gap-2 text-sm text-foreground">
                  <MapPin className="w-4 h-4" style={{color:'var(--clr-accent-mid)'}} />
                  {city.city}
                </div>
                <div className="text-sm font-semibold text-foreground">{fmt(city.totalVolume, 0)}</div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="bg-card border-border overflow-y-scroll">
          <CardHeader>
            <CardTitle className="text-lg font-semibold text-foreground">Live Event Feed</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {(data?.liveEvents ?? []).map((event) => (
              <div key={event.id} className="rounded-lg border border-border bg-secondary px-3 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-medium text-foreground">{event.label}</div>
                  <Badge
                    variant="outline"
                    style={{borderColor:'var(--clr-accent-mid)55', color:'var(--clr-accent-hi)', background:'var(--clr-accent-hi)18'}}
                  >
                    {event.kind}
                  </Badge>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{event.message}</p>
                <p className="mt-2 text-xs" style={{color:'var(--clr-accent-lo)'}}>{formatLocalTs(event.timestamp)}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

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
