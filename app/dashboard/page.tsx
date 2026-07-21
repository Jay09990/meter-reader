"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Flame,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ArrowRight,
  RefreshCw,
  Activity,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface FleetOverviewData {
  totalDevices: number;
  reportedToday: number;
  staleDevices: number;
  openAlarms: number;
}

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

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Top Header & Refresh */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-white">Station Overview</h1>
            <Badge variant="outline" className="border-orange-500/30 text-orange-400 bg-orange-500/10">
              Fleet Live
            </Badge>
          </div>
          <p className="text-sm text-slate-400 mt-1">
            Real-time telemetric monitoring across 10,000+ deployed EVC gas meters.
          </p>
        </div>

        <Button
          onClick={fetchOverview}
          disabled={loading}
          variant="outline"
          size="sm"
          className="border-slate-800 bg-slate-900 text-slate-300 hover:bg-slate-800 hover:text-white"
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

      {/* KPI Cards Bento Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Devices */}
        <Card className="bg-slate-900/60 border-slate-800 text-slate-100">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Total Deployed Meters
            </CardTitle>
            <Flame className="w-5 h-5 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-extrabold text-white">
              {loading ? "..." : data?.totalDevices.toLocaleString()}
            </div>
            <p className="text-xs text-slate-400 mt-1 flex items-center gap-1">
              <Activity className="w-3.5 h-3.5 text-slate-500" />
              Registered fleet units
            </p>
          </CardContent>
        </Card>

        {/* Reported Today */}
        <Card className="bg-slate-900/60 border-slate-800 text-slate-100">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Reported Today
            </CardTitle>
            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-extrabold text-emerald-400">
              {loading ? "..." : data?.reportedToday.toLocaleString()}
            </div>
            <p className="text-xs text-slate-400 mt-1">
              {data && data.totalDevices > 0
                ? `${Math.round((data.reportedToday / data.totalDevices) * 100)}% active push rate`
                : "0% active push rate"}
            </p>
          </CardContent>
        </Card>

        {/* Stale Devices */}
        <Card className="bg-slate-900/60 border-slate-800 text-slate-100">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Stale / Offline
            </CardTitle>
            <Clock className="w-5 h-5 text-amber-400" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-extrabold text-amber-400">
              {loading ? "..." : data?.staleDevices.toLocaleString()}
            </div>
            <p className="text-xs text-slate-400 mt-1">No data received today</p>
          </CardContent>
        </Card>

        {/* Open Alarms */}
        <Card className="bg-slate-900/60 border-slate-800 text-slate-100">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Active Alarms
            </CardTitle>
            <AlertTriangle className="w-5 h-5 text-rose-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-extrabold text-rose-500">
              {loading ? "..." : data?.openAlarms.toLocaleString()}
            </div>
            <p className="text-xs text-slate-400 mt-1">Requires ops attention</p>
          </CardContent>
        </Card>
      </div>

      {/* Action Banners */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="bg-slate-900/80 border-slate-800 p-6 flex flex-col justify-between hover:border-orange-500/30 transition-all">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 rounded.lg bg-orange-500/10 text-orange-400">
                <Flame className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-semibold text-white">Meter Directory</h3>
            </div>
            <p className="text-sm text-slate-400 mb-6">
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

        <Card className="bg-slate-900/80 border-slate-800 p-6 flex flex-col justify-between hover:border-rose-500/30 transition-all">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 rounded-lg bg-rose-500/10 text-rose-400">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-semibold text-white">System Alarms</h3>
            </div>
            <p className="text-sm text-slate-400 mb-6">
              Review missing data events and gas volume anomaly alarms triggered by abnormal telemetry values.
            </p>
          </div>
          <Link href="/dashboard/alarms">
            <Button variant="outline" className="w-full border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700">
              View All Alarms
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </Link>
        </Card>
      </div>
    </div>
  );
}
