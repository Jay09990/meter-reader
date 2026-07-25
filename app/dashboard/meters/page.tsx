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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Meter Directory</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Search, filter, and inspect deployed EVC gas meter hardware across all stations.
          </p>
        </div>

        <Button
          onClick={() => fetchDevices(pagination.page)}
          disabled={loading}
          variant="outline"
          size="sm"
          className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-100 dark:bg-slate-800"
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Filter Controls Bar */}
      <Card className="bg-white dark:bg-slate-900/60 border-slate-200 dark:border-slate-800 p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <Input
            placeholder="Search serial, meter #, or site..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 placeholder:text-slate-500 focus:border-orange-500"
          />
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-9 px-3 py-1 rounded-md bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm text-slate-600 dark:text-slate-300 focus:outline-none focus:border-orange-500"
          >
            <option value="all">All Statuses</option>
            <option value="reporting">Reporting / Live</option>
            <option value="stale">Stale / Offline</option>
          </select>
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
              <TableHead className="text-slate-500 dark:text-slate-400 font-semibold">Meter Serial</TableHead>
              <TableHead className="text-slate-500 dark:text-slate-400 font-semibold">Site / Station</TableHead>
              <TableHead className="text-slate-500 dark:text-slate-400 font-semibold">Last Reading Date</TableHead>
              <TableHead className="text-slate-500 dark:text-slate-400 font-semibold">Status</TableHead>
              <TableHead className="text-right text-slate-500 dark:text-slate-400 font-semibold">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow className="border-slate-200 dark:border-slate-800">
                <TableCell colSpan={6} className="text-center py-12 text-slate-500 dark:text-slate-400">
                  Loading meters...
                </TableCell>
              </TableRow>
            ) : devices.length === 0 ? (
              <TableRow className="border-slate-200 dark:border-slate-800">
                <TableCell colSpan={6} className="text-center py-12 text-slate-500 dark:text-slate-400">
                  No gas meters found matching the criteria.
                </TableCell>
              </TableRow>
            ) : (
              devices.map((device) => (
                <TableRow key={device.id} className="border-slate-200 dark:border-slate-800 hover:bg-slate-100/40 dark:hover:bg-slate-800/40">
                  <TableCell className="font-mono text-sm font-medium text-slate-900 dark:text-slate-100 flex items-center gap-2">
                    <Flame className="w-4 h-4 text-orange-500" />
                    {device.deviceSerialNo}
                  </TableCell>
                  <TableCell className="font-mono text-sm text-slate-600 dark:text-slate-300">
                    {device.meterSerialNo || "—"}
                  </TableCell>
                  <TableCell className="text-sm text-slate-600 dark:text-slate-300">
                    {device.customerName
                      ? `${device.customerName} (${device.gaName || 'Unknown GA'})`
                      : "Unassigned"}
                  </TableCell>
                  <TableCell className="font-mono text-sm text-slate-600 dark:text-slate-300">
                    {device.latestReading?.readingDate 
                      ? new Date(device.latestReading.readingDate).toLocaleString()
                      : (device.lastSeenAt
                        ? new Date(device.lastSeenAt).toLocaleString()
                        : "No data")}
                  </TableCell>
                  <TableCell>
                    {device.status === "REPORTING" ? (
                      <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mr-1.5 animate-pulse" />
                        REPORTING
                      </Badge>
                    ) : (
                      <Badge className="bg-amber-500/10 text-amber-400 border-amber-500/20">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 mr-1.5" />
                        STALE
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Link href={`/dashboard/meters/${device.id}`}>
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
              <span className="font-semibold text-slate-700 dark:text-slate-200">{pagination.totalPages}</span> ({pagination.totalCount} total devices)
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={pagination.page <= 1}
                onClick={() => fetchDevices(pagination.page - 1)}
                className="h-8 border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-100 dark:bg-slate-800"
              >
                <ChevronLeft className="w-4 h-4 mr-1" />
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={pagination.page >= pagination.totalPages}
                onClick={() => fetchDevices(pagination.page + 1)}
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
