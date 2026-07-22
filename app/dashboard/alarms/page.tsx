"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  ChevronLeft,
  ChevronRight,
  Eye,
  RefreshCw,
  Clock,
  Activity,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card } from "@/components/ui/card";

interface AlarmItem {
  id: string;
  deviceId: string;
  deviceSerialNo: string;
  meterSerialNo: string | null;
  customerName: string | null;
  gaName: string | null;
  type: "MISSING_DATA" | "GAS_OUT_OF_RANGE";
  cause: string;
  gasValue: number | null;
  averageValue: number | null;
  forDate: string;
  status: "OPEN" | "RESOLVED";
  severity: "CRITICAL" | "WARNING";
  acknowledged: boolean;
  createdAt: string;
}

interface PaginationMeta {
  page: number;
  limit: number;
  totalCount: number;
  totalPages: number;
}

export default function AlarmsPage() {
  const [alarms, setAlarms] = useState<AlarmItem[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta>({
    page: 1,
    limit: 10,
    totalCount: 0,
    totalPages: 1,
  });
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("OPEN");
  const [severityFilter, setSeverityFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAlarms = useCallback(
    (pageNum: number = 1) => {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams({
        page: pageNum.toString(),
        limit: "10",
      });

      if (typeFilter !== "all") params.append("type", typeFilter);
      if (statusFilter !== "all") params.append("status", statusFilter);
      if (severityFilter !== "all") params.append("severity", severityFilter);
      if (searchQuery) params.append("search", searchQuery);

      fetch(`/api/alarms?${params.toString()}`)
        .then((res) => {
          if (!res.ok) throw new Error("Failed to load alarms");
          return res.json();
        })
        .then((data) => {
          setAlarms(data.items || []);
          setPagination(data.pagination);
          setLoading(false);
        })
        .catch((err) => {
          setError(err.message);
          setLoading(false);
        });
    },
    [typeFilter, statusFilter, severityFilter, searchQuery]
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchAlarms(1);
  }, [fetchAlarms]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">System Alarms</h1>
            <Badge className="bg-rose-500/10 text-rose-400 border-rose-500/20">
              Active Monitoring
            </Badge>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Automated missing telemetry detection and gas volume anomaly alarms.
          </p>
        </div>

        <div className="flex gap-2">
          <Button
            onClick={() => {
              const params = new URLSearchParams();
              if (typeFilter !== "all") params.append("type", typeFilter);
              if (statusFilter !== "all") params.append("status", statusFilter);
              if (severityFilter !== "all") params.append("severity", severityFilter);
              window.open(`/api/alarms/export?${params.toString()}`, "_blank");
            }}
            variant="outline"
            size="sm"
            className="border-slate-200 dark:border-slate-800"
          >
            Export CSV
          </Button>
          <Button
            onClick={() => fetchAlarms(pagination.page)}
            disabled={loading}
            variant="outline"
            size="sm"
            className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-100 dark:bg-slate-800"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Refresh Alarms
          </Button>
        </div>
      </div>

      {/* Filter Controls */}
      <Card className="bg-white dark:bg-slate-900/60 border-slate-200 dark:border-slate-800 p-4 flex flex-col sm:flex-row items-center gap-4">
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Alarm Type:</label>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="h-9 px-3 py-1 rounded-md bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm text-slate-600 dark:text-slate-300 focus:outline-none focus:border-orange-500"
          >
            <option value="all">All Types</option>
            <option value="MISSING_DATA">Missing Data</option>
            <option value="GAS_OUT_OF_RANGE">Gas Out Of Range</option>
          </select>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Status:</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-9 px-3 py-1 rounded-md bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm text-slate-600 dark:text-slate-300 focus:outline-none focus:border-orange-500"
          >
            <option value="OPEN">Open Alarms Only</option>
            <option value="RESOLVED">Resolved Only</option>
            <option value="all">All Statuses</option>
          </select>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Severity:</label>
          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value)}
            className="h-9 px-3 py-1 rounded-md bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm text-slate-600 dark:text-slate-300 focus:outline-none focus:border-orange-500"
          >
            <option value="all">All Severities</option>
            <option value="CRITICAL">Critical</option>
            <option value="WARNING">Warning</option>
          </select>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto ml-auto">
          <input
            type="text"
            placeholder="Search Serial No..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && fetchAlarms(1)}
            className="h-9 px-3 py-1 rounded-md bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm text-slate-600 dark:text-slate-300 focus:outline-none focus:border-orange-500 w-full sm:w-48"
          />
        </div>
      </Card>

      {error && (
        <div className="p-4 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm">
          {error}
        </div>
      )}

      {/* Table */}
      <Card className="bg-white dark:bg-slate-900/60 border-slate-200 dark:border-slate-800 overflow-hidden">
        <Table>
          <TableHeader className="bg-slate-50 dark:bg-slate-950/80 border-b border-slate-200 dark:border-slate-800">
            <TableRow className="border-slate-200 dark:border-slate-800 hover:bg-transparent">
              <TableHead className="text-slate-500 dark:text-slate-400 font-semibold">Device Serial</TableHead>
              <TableHead className="text-slate-500 dark:text-slate-400 font-semibold">Type</TableHead>
              <TableHead className="text-slate-500 dark:text-slate-400 font-semibold">Cause / Explanation</TableHead>
              <TableHead className="text-slate-500 dark:text-slate-400 font-semibold">Date</TableHead>
              <TableHead className="text-slate-500 dark:text-slate-400 font-semibold">Status</TableHead>
              <TableHead className="text-right text-slate-500 dark:text-slate-400 font-semibold">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow className="border-slate-200 dark:border-slate-800">
                <TableCell colSpan={6} className="text-center py-12 text-slate-500 dark:text-slate-400">
                  Loading alarms...
                </TableCell>
              </TableRow>
            ) : alarms.length === 0 ? (
              <TableRow className="border-slate-200 dark:border-slate-800">
                <TableCell colSpan={6} className="text-center py-12 text-slate-500 dark:text-slate-400">
                  No system alarms found matching the filter criteria.
                </TableCell>
              </TableRow>
            ) : (
              alarms.map((alarm) => (
                <TableRow key={alarm.id} className="border-slate-200 dark:border-slate-800 hover:bg-slate-100/40 dark:hover:bg-slate-800/40">
                  <TableCell className="font-mono text-sm font-medium text-slate-900 dark:text-slate-100">
                    {alarm.deviceSerialNo}
                  </TableCell>
                  <TableCell>
                    {alarm.type === "MISSING_DATA" ? (
                      <Badge className="bg-amber-500/10 text-amber-400 border-amber-500/20 flex items-center gap-1 w-fit">
                        <Clock className="w-3 h-3" />
                        MISSING DATA
                      </Badge>
                    ) : (
                      <Badge className="bg-rose-500/10 text-rose-400 border-rose-500/20 flex items-center gap-1 w-fit">
                        <Activity className="w-3 h-3" />
                        OUT OF RANGE
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-slate-600 dark:text-slate-300 max-w-md">
                    {alarm.cause}
                  </TableCell>
                  <TableCell className="font-mono text-sm text-slate-600 dark:text-slate-300">
                    {new Date(alarm.createdAt).toLocaleString()}
                  </TableCell>
                  <TableCell>
                    {alarm.status === "OPEN" ? (
                      <Badge className="bg-rose-600 text-slate-900 dark:text-white font-bold">
                        OPEN
                      </Badge>
                    ) : (
                      <Badge className="bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-700">
                        RESOLVED
                      </Badge>
                    )}
                    {alarm.acknowledged && (
                      <Badge className="ml-2 bg-green-500/10 text-green-500 border-green-500/20">ACK</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {!alarm.acknowledged && alarm.status === "OPEN" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-blue-600 hover:text-blue-700"
                        onClick={async () => {
                          await fetch(`/api/alarms/${alarm.id}/acknowledge`, { method: "POST" });
                          fetchAlarms(pagination.page);
                        }}
                      >
                        Acknowledge
                      </Button>
                    )}
                    <Link href={`/dashboard/meters/${alarm.deviceId}`}>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:text-white hover:bg-slate-100 dark:hover:bg-slate-100 dark:bg-slate-800"
                      >
                        <Eye className="w-4 h-4 mr-1.5" />
                        Inspect
                      </Button>
                    </Link>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

        {/* Pagination Bar */}
        {!loading && pagination.totalPages > 1 && (
          <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <div>
              Showing page <span className="font-semibold text-slate-700 dark:text-slate-200">{pagination.page}</span> of{" "}
              <span className="font-semibold text-slate-700 dark:text-slate-200">{pagination.totalPages}</span> ({pagination.totalCount} total alarms)
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={pagination.page <= 1}
                onClick={() => fetchAlarms(pagination.page - 1)}
                className="h-8 border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-100 dark:bg-slate-800"
              >
                <ChevronLeft className="w-4 h-4 mr-1" />
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={pagination.page >= pagination.totalPages}
                onClick={() => fetchAlarms(pagination.page + 1)}
                className="h-8 border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-100 dark:bg-slate-800"
              >
                Next
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
