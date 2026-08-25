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
import { useAutoRefresh } from "@/lib/auto-refresh";
import { formatLocalTs } from "@/lib/utils";
// Alarm console for filtering, acknowledging, and exporting system alarms.
interface AlarmItem {
  id: string;
  deviceId: string;
  deviceSerialNo: string;
  meterSerialNo: string | null;
  customerName: string | null;
  gaName: string | null;
  type: "MISSING_DATA" | "GAS_OUT_OF_RANGE" | "PRESSURE_OUT_OF_RANGE" | "TEMPERATURE_OUT_OF_RANGE" | "CONSUMPTION_OUT_OF_RANGE" | "BATTERY_LOW";
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
  const [alarmView, setAlarmView] = useState<"unseen" | "acknowledged">("unseen");
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
        acknowledged: alarmView === "acknowledged" ? "true" : "false",
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
    [alarmView, typeFilter, statusFilter, severityFilter, searchQuery]
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchAlarms(1);
  }, [fetchAlarms]);
  useAutoRefresh(() => fetchAlarms(pagination.page));

  return (
    <div className="space-y-6 w-full">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">System Alarms</h1>
            <Badge
              className=""
              style={{background:'var(--clr-alert)18', color:'var(--clr-alert)', border:'1px solid var(--clr-alert)44'}}
            >
              Active Monitoring
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
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
            className="border-border bg-secondary text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            Export CSV
          </Button>
          <Button
            onClick={() => fetchAlarms(pagination.page)}
            disabled={loading}
            variant="outline"
            size="sm"
            className="border-border bg-secondary text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Refresh Alarms
          </Button>
        </div>
      </div>

      <div className="flex w-fit rounded-lg border border-border bg-card p-1" role="tablist" aria-label="Alarm categories">
        <Button
          type="button"
          role="tab"
          aria-selected={alarmView === "unseen"}
          variant={alarmView === "unseen" ? "default" : "ghost"}
          size="sm"
          onClick={() => {
            setAlarmView("unseen");
            setStatusFilter("OPEN");
          }}
        >
          Unseen alarms
        </Button>
        <Button
          type="button"
          role="tab"
          aria-selected={alarmView === "acknowledged"}
          variant={alarmView === "acknowledged" ? "default" : "ghost"}
          size="sm"
          onClick={() => {
            setAlarmView("acknowledged");
            setStatusFilter("all");
          }}
        >
          Acknowledged alarms
        </Button>
      </div>

      {/* Filter Controls */}
      <Card className="bg-card border-border p-4 flex flex-col sm:flex-row items-center gap-4">
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <label className="text-xs font-semibold text-muted-foreground uppercase">Alarm Type:</label>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="h-9 px-3 py-1 rounded-md bg-secondary border border-border text-sm text-foreground focus:outline-none"
            style={{'--tw-ring-color':'var(--clr-accent-mid)'} as React.CSSProperties}
          >
            <option value="all">All Types</option>
            <option value="MISSING_DATA">Missing Data</option>
            <option value="GAS_OUT_OF_RANGE">Gas Out Of Range</option>
            <option value="PRESSURE_OUT_OF_RANGE">Pressure Out Of Range</option>
            <option value="TEMPERATURE_OUT_OF_RANGE">Temperature Out Of Range</option>
            <option value="CONSUMPTION_OUT_OF_RANGE">Consumption Out Of Range</option>
            <option value="BATTERY_LOW">Battery Low</option>
          </select>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          <label className="text-xs font-semibold text-muted-foreground uppercase">Status:</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-9 px-3 py-1 rounded-md bg-secondary border border-border text-sm text-foreground focus:outline-none"
          >
            <option value="OPEN">Open Alarms Only</option>
            <option value="RESOLVED">Resolved Only</option>
            <option value="all">All Statuses</option>
          </select>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          <label className="text-xs font-semibold text-muted-foreground uppercase">Severity:</label>
          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value)}
            className="h-9 px-3 py-1 rounded-md bg-secondary border border-border text-sm text-foreground focus:outline-none"
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
            className="h-9 px-3 py-1 rounded-md bg-secondary border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none w-full sm:w-48"
          />
        </div>
      </Card>

      {error && (
        <div className="p-4 rounded-lg text-sm" style={{background:'var(--clr-alert)18', border:'1px solid var(--clr-alert)44', color:'var(--clr-alert)'}}>
          {error}
        </div>
      )}

      {/* Table */}
      <Card className="bg-card border-border overflow-hidden">
        <Table>
          <TableHeader className="bg-secondary border-b border-border">
            <TableRow className="border-border hover:bg-transparent">
              <TableHead className="text-muted-foreground font-semibold">Device Serial</TableHead>
              <TableHead className="text-muted-foreground font-semibold">Type</TableHead>
              <TableHead className="text-muted-foreground font-semibold">Cause / Explanation</TableHead>
              <TableHead className="text-muted-foreground font-semibold">Date</TableHead>
              <TableHead className="text-muted-foreground font-semibold">Status</TableHead>
              <TableHead className="text-right text-muted-foreground font-semibold">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow className="border-border">
                <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                  Loading alarms...
                </TableCell>
              </TableRow>
            ) : alarms.length === 0 ? (
              <TableRow className="border-border">
                <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                  No system alarms found matching the filter criteria.
                </TableCell>
              </TableRow>
            ) : (
              alarms.map((alarm) => (
                <TableRow key={alarm.id} className="border-border hover:bg-secondary/60">
                  <TableCell className="font-mono text-sm font-medium text-foreground">
                    {alarm.deviceSerialNo}
                  </TableCell>
                  <TableCell>
                    {alarm.type === "MISSING_DATA" ? (
                      <Badge
                        className="flex items-center gap-1 w-fit"
                        style={{background:'var(--clr-stale)18', color:'var(--clr-stale)', border:'1px solid var(--clr-stale)44'}}
                      >
                        <Clock className="w-3 h-3" />
                        MISSING DATA
                      </Badge>
                    ) : alarm.type === "BATTERY_LOW" ? (
                      <Badge
                        className="flex items-center gap-1 w-fit"
                        style={{background:'var(--clr-alert)18', color:'var(--clr-alert)', border:'1px solid var(--clr-alert)44'}}
                      >
                        <Activity className="w-3 h-3" />
                        BATTERY LOW
                      </Badge>
                    ) : (
                      <Badge
                        className="flex items-center gap-1 w-fit"
                        style={{background:'var(--clr-alert)18', color:'var(--clr-alert)', border:'1px solid var(--clr-alert)44'}}
                      >
                        <Activity className="w-3 h-3" />
                        {alarm.type.replace(/_/g, " ")}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="max-w-md">
                    <div className="text-sm text-muted-foreground break-words whitespace-normal">
                      {alarm.cause}
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-sm text-muted-foreground">
                    {formatLocalTs(alarm.createdAt)}
                  </TableCell>
                  <TableCell>
                    {alarm.status === "OPEN" ? (
                      <Badge
                        className="font-bold"
                        style={{background:'var(--clr-alert)', color:'#fff'}}
                      >
                        OPEN
                      </Badge>
                    ) : (
                      <Badge
                        className="font-bold"
                        style={{background:'var(--clr-resolved)22', color:'var(--clr-resolved)', border:'1px solid var(--clr-resolved)44'}}
                      >
                        RESOLVED
                      </Badge>
                    )}
                    {alarm.acknowledged && (
                      <Badge
                        className="ml-2"
                        style={{background:'var(--clr-online)18', color:'var(--clr-online)', border:'1px solid var(--clr-online)44'}}
                      >
                        ACK
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {!alarm.acknowledged && alarm.status === "OPEN" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-muted-foreground hover:text-foreground"
                        style={{'--tw-text-opacity':'1'} as React.CSSProperties}
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
                        className="text-muted-foreground hover:text-foreground hover:bg-accent"
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
          <div className="p-4 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
            <div>
              Showing page <span className="font-semibold text-foreground">{pagination.page}</span> of{" "}
              <span className="font-semibold text-foreground">{pagination.totalPages}</span> ({pagination.totalCount} total alarms)
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={pagination.page <= 1}
                onClick={() => fetchAlarms(pagination.page - 1)}
                className="h-8 border-border bg-secondary text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <ChevronLeft className="w-4 h-4 mr-1" />
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={pagination.page >= pagination.totalPages}
                onClick={() => fetchAlarms(pagination.page + 1)}
                className="h-8 border-border bg-secondary text-muted-foreground hover:bg-accent hover:text-foreground"
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
