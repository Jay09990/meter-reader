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
  Gauge,
  Building2,
  Factory,
  MapPin,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BarChart, Bar, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useAutoRefresh } from "@/lib/auto-refresh";

// Fleet overview dashboard with summary metrics and consumption charts.
interface FleetOverviewData {
  totalDevices: number;
  reportedToday: number;
  staleDevices: number;
  offlineDevices: number;
  openAlarms: number;
  criticalAlarms: number;
  warningAlarms: number;
  metersOnline?: { value: number; totalDevices: number; uptimePercent: number };
  avgPressure?: number | null;
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
  INDUSTRIAL: "#f97316",
  COMMERCIAL: "#3b82f6",
  RESIDENTIAL: "#10b981",
  BULK: "#8b5cf6",
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
        <Badge className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 font-bold">
          <CheckCircle2 className="w-3 h-3 mr-1" />
          ONLINE
        </Badge>
      );
    case "OFFLINE":
      return (
        <Badge className="bg-slate-500/10 text-slate-400 border border-slate-500/25 font-bold">
          <AlertTriangle className="w-3 h-3 mr-1" />
          OFFLINE
        </Badge>
      );
    case "ALERT":
      return (
        <Badge className="bg-rose-500/10 text-rose-400 border border-rose-500/25 font-bold">
          <AlertTriangle className="w-3 h-3 mr-1 animate-bounce" />
          ALERT
        </Badge>
      );
    case "NEW":
      return (
        <Badge className="bg-sky-500/10 text-sky-500 border border-sky-500/25 font-bold">
          NEW
        </Badge>
      );
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
};

export default function OverviewPage() {
  const [data, setData] = useState<FleetOverviewData | null>(null);
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
    color: categoryColors[item.category] ?? "#f97316",
  }));
  const monthlySeries = (data?.monthlyConsumption ?? []).map((item) => ({
    ...item,
    value: Number(item.value ?? 0),
  }));
  const citySeries = (data?.consumptionByCity ?? []).slice(0, 8);

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Fleet Consumption Overview</h1>
            <Badge variant="outline" className="border-orange-500/30 text-orange-400 bg-orange-500/10">
              Fleet Live
            </Badge>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Fleet-wide consumption analytics and live telemetry health in one place.
          </p>
        </div>

        <Button
          onClick={fetchOverview}
          disabled={loading}
          variant="outline"
          size="sm"
          className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-100 dark:bg-slate-800 hover:text-slate-900 dark:text-white"
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Refresh Data
        </Button>
      </div>

      {error && (
        <div className="p-4 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
        <Card className="bg-white dark:bg-slate-900/60 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Meters Online
            </CardTitle>
            <Activity className="w-5 h-5 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-extrabold text-slate-900 dark:text-white">
              {loading ? "..." : `${meterStats?.value ?? 0}/${meterStats?.totalDevices ?? 0}`}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              {meterStats?.uptimePercent ?? 0}% uptime in last 24h
            </p>
          </CardContent>
        </Card>

        <Card className="bg-white dark:bg-slate-900/60 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Avg Pressure
            </CardTitle>
            <Gauge className="w-5 h-5 text-emerald-400" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-extrabold text-emerald-400">
              {loading ? "..." : fmt(data?.avgPressure, 2)}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Latest reading average</p>
          </CardContent>
        </Card>

        <Card className="bg-white dark:bg-slate-900/60 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Industrial Consumption
            </CardTitle>
            <Factory className="w-5 h-5 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-extrabold text-forground">
              {loading ? "..." : fmt(categorySeries.find((item) => item.category === "INDUSTRIAL")?.totalVolume ?? 0, 0)}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Latest reading volume</p>
          </CardContent>
        </Card>

        <Card className="bg-white dark:bg-slate-900/60 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Commercial Consumption
            </CardTitle>
            <Building2 className="w-5 h-5 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-extrabold text-forground">
              {loading ? "..." : fmt(categorySeries.find((item) => item.category === "COMMERCIAL")?.totalVolume ?? 0, 0)}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Latest reading volume</p>
          </CardContent>
        </Card>

        <Card className="bg-white dark:bg-slate-900/60 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Active Alerts
            </CardTitle>
            <AlertTriangle className="w-5 h-5 text-rose-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-extrabold text-rose-500">
              {loading ? "..." : (data?.activeAlerts ?? data?.openAlarms ?? 0).toLocaleString()}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Open alarms tracked now</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Card className="bg-white dark:bg-slate-900/60 border-slate-200 dark:border-slate-800">
          <CardHeader>
            <CardTitle className="text-lg font-semibold text-slate-900 dark:text-white">Monthly Consumption</CardTitle>
          </CardHeader>
          <CardContent className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlySeries}>
                <CartesianGrid strokeDasharray="3 3" stroke="#475569" opacity={0.35} />
                <XAxis dataKey="month" tick={{ fill: "#94a3b8", fontSize: 12 }} />
                <YAxis tick={{ fill: "#94a3b8", fontSize: 12 }} />
                <Tooltip cursor={{ fill: "rgba(249, 115, 22, 0.08)" }} />
                <Bar dataKey="value" radius={[6, 6, 0, 0]} fill="#f97316" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="bg-white dark:bg-slate-900/60 border-slate-200 dark:border-slate-800">
          <CardHeader>
            <CardTitle className="text-lg font-semibold text-slate-900 dark:text-white">Consumption by Category</CardTitle>
          </CardHeader>
          <CardContent className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={categorySeries} layout="vertical" margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#475569" opacity={0.35} />
                <XAxis type="number" tick={{ fill: "#94a3b8", fontSize: 12 }} />
                <YAxis dataKey="label" type="category" width={100} tick={{ fill: "#94a3b8", fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="totalVolume" radius={[0, 6, 6, 0]}>
                  {categorySeries.map((entry) => (
                    <Cell key={entry.category} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Card className="bg-white dark:bg-slate-900/60 border-slate-200 dark:border-slate-800">
          <CardHeader>
            <CardTitle className="text-lg font-semibold text-slate-900 dark:text-white">Top 5 Consuming Customers</CardTitle>
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
                    <TableCell className="font-medium text-slate-900 dark:text-white">{customer.customerName}</TableCell>
                    <TableCell className="text-slate-500 dark:text-slate-400">{customer.deviceSerialNo}</TableCell>
                    <TableCell className="text-slate-500 dark:text-slate-400">{customer.city}</TableCell>
                    <TableCell className="text-slate-500 dark:text-slate-400">
                      {customer.suspect ? (
                        <Badge variant="outline" className="border-amber-500/30 text-amber-400 bg-amber-500/10">
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

        <Card className="bg-white dark:bg-slate-900/60 border-slate-200 dark:border-slate-800">
          <CardHeader>
            <CardTitle className="text-lg font-semibold text-slate-900 dark:text-white">Least 5 Consuming Customers</CardTitle>
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
                    <TableCell className="font-medium text-slate-900 dark:text-white">{customer.customerName}</TableCell>
                    <TableCell className="text-slate-500 dark:text-slate-400">{customer.deviceSerialNo}</TableCell>
                    <TableCell className="text-slate-500 dark:text-slate-400">{customer.city}</TableCell>
                    <TableCell className="text-slate-500 dark:text-slate-400">
                      {customer.suspect ? (
                        <Badge variant="outline" className="border-amber-500/30 text-amber-400 bg-amber-500/10">
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
        <Card className="bg-white dark:bg-slate-900/60 border-slate-200 dark:border-slate-800 overflow-y-scroll">
          <CardHeader>
            <CardTitle className="text-lg font-semibold text-slate-900 dark:text-white">Consumption by City</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {citySeries.map((city) => (
              <div key={city.city} className="flex items-center justify-between rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/70 px-3 py-2">
                <div className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                  <MapPin className="w-4 h-4 text-orange-500" />
                  {city.city}
                </div>
                <div className="text-sm font-semibold text-slate-900 dark:text-white">{fmt(city.totalVolume, 0)}</div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="bg-white dark:bg-slate-900/60 border-slate-200 dark:border-slate-800 overflow-y-scroll">
          <CardHeader>
            <CardTitle className="text-lg font-semibold text-slate-900 dark:text-white">Live Event Feed</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {(data?.liveEvents ?? []).map((event) => (
              <div key={event.id} className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/70 px-3 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-medium text-slate-900 dark:text-white">{event.label}</div>
                  <Badge variant="outline" className="border-orange-500/30 text-orange-400 bg-orange-500/10">
                    {event.kind}
                  </Badge>
                </div>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{event.message}</p>
                <p className="mt-2 text-xs text-slate-400">{new Date(event.timestamp).toLocaleString()}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card className="bg-white dark:bg-slate-900/80 border-slate-200 dark:border-slate-800 p-6 flex flex-col justify-between hover:border-orange-500/30 transition-all">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 rounded-lg bg-orange-500/10 text-orange-600 dark:text-orange-400">
              <Flame className="w-5 h-5" />
            </div>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Meter Directory</h3>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
            Browse, filter, and inspect individual gas meters across the fleet with server-side search and pagination.
          </p>
        </div>
        <Link href="/dashboard/meters">
          <Button className="w-full bg-orange-600 hover:bg-orange-500 text-white font-medium">
            Open Meter Table
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </Link>
      </Card>
    </div>
  );
}
