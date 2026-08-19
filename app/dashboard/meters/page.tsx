"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  Search,
  ChevronLeft,
  ChevronRight,
  Eye,
  RefreshCw,
  Flame,
} from "lucide-react";
import { Input } from "@/components/ui/input";
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
import { formatLocalTs, formatLocalDate } from "@/lib/utils";

// Meter directory for searching deployed gas meter hardware.
interface DeviceItem {
  id: string;
  deviceSerialNo: string;
  meterSerialNo: string | null;
  meterSize: string | null;
  customerName: string | null;
  gaName: string | null;
  lastSeenAt: string | null;
  status: "REPORTING" | "STALE";
  latestReading: {
    readingDate: string;
    receivedAt: string;
    correctedVolumeVb: number | null;
    gasPressure: number | null;
    gasTemperature: number | null;
  } | null;
}

interface PaginationMeta {
  page: number;
  limit: number;
  totalCount: number;
  totalPages: number;
}

export default function MetersPage() {
  const [devices, setDevices] = useState<DeviceItem[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta>({
    page: 1,
    limit: 10,
    totalCount: 0,
    totalPages: 1,
  });
  const [search, setSearch] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDevices = useCallback(
    (pageNum: number = 1) => {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams({
        page: pageNum.toString(),
        limit: "10",
        search: search.trim(),
        status: statusFilter,
      });

      fetch(`/api/devices?${params.toString()}`)
        .then((res) => {
          if (!res.ok) throw new Error("Failed to load meters");
          return res.json();
        })
        .then((data) => {
          setDevices(data.items || []);
          setPagination(data.pagination);
          setLoading(false);
        })
        .catch((err) => {
          setError(err.message);
          setLoading(false);
        });
    },
    [search, statusFilter]
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchDevices(1);
  }, [fetchDevices]);
  useAutoRefresh(() => fetchDevices(pagination.page));

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Meter Directory</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Search, filter, and inspect deployed EVC gas meter hardware across all stations.
          </p>
        </div>

        <Button
          onClick={() => fetchDevices(pagination.page)}
          disabled={loading}
          variant="outline"
          size="sm"
          className="border-border bg-secondary text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Filter Controls Bar */}
      <Card className="bg-card border-border p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search serial, meter #, or site..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-secondary border-border text-foreground placeholder:text-muted-foreground"
          />
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-9 px-3 py-1 rounded-md bg-secondary border border-border text-sm text-foreground focus:outline-none"
          >
            <option value="all">All Statuses</option>
            <option value="reporting">Reporting / Live</option>
            <option value="stale">Stale / Offline</option>
          </select>
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
              <TableHead className="text-muted-foreground font-semibold">Meter Serial</TableHead>
              <TableHead className="text-muted-foreground font-semibold">Site / Station</TableHead>
              <TableHead className="text-muted-foreground font-semibold">Last Reading Date</TableHead>
              <TableHead className="text-muted-foreground font-semibold">Status</TableHead>
              <TableHead className="text-right text-muted-foreground font-semibold">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow className="border-border">
                <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                  Loading meters...
                </TableCell>
              </TableRow>
            ) : devices.length === 0 ? (
              <TableRow className="border-border">
                <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                  No gas meters found matching the criteria.
                </TableCell>
              </TableRow>
            ) : (
              devices.map((device) => (
                <TableRow key={device.id} className="border-border hover:bg-secondary/60">
                  <TableCell className="font-mono text-sm font-medium text-foreground flex items-center gap-2">
                    <Flame className="w-4 h-4" style={{color:'var(--clr-accent-hi)'}} />
                    {device.deviceSerialNo}
                  </TableCell>
                  <TableCell className="font-mono text-sm text-muted-foreground">
                    {device.meterSerialNo || "—"}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {device.customerName
                      ? `${device.customerName} (${device.gaName || 'Unknown GA'})`
                      : "Unassigned"}
                  </TableCell>
                  <TableCell className="font-mono text-sm text-muted-foreground">
                    {device.latestReading?.receivedAt
                      ? formatLocalTs(device.latestReading.receivedAt)
                      : (device.lastSeenAt
                        ? formatLocalTs(device.lastSeenAt)
                        : "No data")}
                  </TableCell>
                  <TableCell>
                    {device.status === "REPORTING" ? (
                      <Badge
                        style={{background:'var(--clr-online)18', color:'var(--clr-online)', border:'1px solid var(--clr-online)44'}}
                      >
                        <span className="w-1.5 h-1.5 rounded-full mr-1.5 animate-pulse" style={{background:'var(--clr-online)'}} />
                        REPORTING
                      </Badge>
                    ) : (
                      <Badge
                        style={{background:'var(--clr-stale)18', color:'var(--clr-stale)', border:'1px solid var(--clr-stale)44'}}
                      >
                        <span className="w-1.5 h-1.5 rounded-full mr-1.5" style={{background:'var(--clr-stale)'}} />
                        STALE
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Link href={`/dashboard/meters/${device.id}`}>
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
              <span className="font-semibold text-foreground">{pagination.totalPages}</span> ({pagination.totalCount} total devices)
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={pagination.page <= 1}
                onClick={() => fetchDevices(pagination.page - 1)}
                className="h-8 border-border bg-secondary text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <ChevronLeft className="w-4 h-4 mr-1" />
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={pagination.page >= pagination.totalPages}
                onClick={() => fetchDevices(pagination.page + 1)}
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
