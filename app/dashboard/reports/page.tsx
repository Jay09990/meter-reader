"use client";

import { useEffect, useState, useCallback, useRef } from "react";

import {
  Search,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Flame,
  FileDown,
  Activity,
  Gauge,
  Thermometer,
  Info,
} from "lucide-react";
import {
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
} from "recharts";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";

// ─── Types ────────────────────────────────────────────────────────────────────
interface DeviceItem {
  id: string;
  deviceSerialNo: string;
  meterSerialNo: string | null;
  customerName: string | null;
  gaName: string | null;
  status: "REPORTING" | "STALE";
}

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
    <Card className="bg-white dark:bg-slate-900/60 border-slate-200 dark:border-slate-800">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
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
    <div className="flex justify-between items-center py-1 border-b border-slate-200 dark:border-slate-800/60 last:border-0">
      <span className="text-xs text-slate-500 dark:text-slate-400">{label}</span>
      <span className="font-mono text-sm text-slate-900 dark:text-slate-100">{value}</span>
    </div>
  );
}

function BigValue({ value, unit }: { value: string; unit?: string }) {
  return (
    <div className="flex items-baseline gap-1.5 mb-1">
      <span className="font-mono text-2xl font-semibold text-slate-900 dark:text-white">
        {value}
      </span>
      {unit && (
        <span className="text-xs text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wider">
          {unit}
        </span>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function ReportsPage() {
  const reportRef = useRef<HTMLDivElement>(null);

  // Meter Selection State
  const [devices, setDevices] = useState<DeviceItem[]>([]);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loadingList, setLoadingList] = useState(true);

  // Selected Meter State
  const [selectedMeterId, setSelectedMeterId] = useState<string | null>(null);
  const [detailData, setDetailData] = useState<{
    device: DeviceData;
    latestReading: LatestReading | null;
  } | null>(null);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Fetch Meter List
  const fetchDevices = useCallback((pageNum = 1) => {
    setLoadingList(true);
    const params = new URLSearchParams({
      page: pageNum.toString(),
      limit: "5", // Show 5 at a time for compactness
      search: search.trim(),
      status: "all",
    });

    fetch(`/api/devices?${params.toString()}`)
      .then((res) => res.json())
      .then((data) => {
        setDevices(data.items || []);
        setPage(data.pagination.page);
        setTotalPages(data.pagination.totalPages);
        setLoadingList(false);
      })
      .catch(() => setLoadingList(false));
  }, [search]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchDevices(1);
  }, [fetchDevices]);

  // Fetch Meter Details
  const fetchMeterDetail = useCallback(async (id: string) => {
    setLoadingDetail(true);
    setSelectedMeterId(id);
    try {
      const [latestRes, historyRes] = await Promise.all([
        fetch(`/api/devices/${id}/latest`),
        fetch(`/api/devices/${id}/history?days=30`),
      ]);

      if (latestRes.ok) {
        setDetailData(await latestRes.json());
      }
      if (historyRes.ok) {
        const hData = await historyRes.json();
        setHistory(hData.history || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  // Export to PDF Function
  const handleExportPdf = async () => {
    if (!reportRef.current || !detailData) return;
    setExporting(true);

    try {
      // Use html-to-image instead of html2canvas to support modern CSS (Tailwind v4 lab/oklch colors)
      const { toPng } = await import("html-to-image");
      const { jsPDF } = await import("jspdf");

      // Temporarily set a white background to avoid transparent PDFs in dark mode, if needed. 
      // (The wrapper is already bg-white dark:bg-slate-950, so it should be fine).
      const dataUrl = await toPng(reportRef.current, { 
        quality: 0.95, 
        pixelRatio: 2,
        backgroundColor: "#020617" // matching slate-950 just in case
      });
      
      const pdf = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
      });

      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (reportRef.current.offsetHeight * pdfWidth) / reportRef.current.offsetWidth;

      pdf.addImage(dataUrl, "PNG", 0, 0, pdfWidth, pdfHeight);
      pdf.save(`Meter_Report_${detailData.device.deviceSerialNo}.pdf`);
    } catch (e) {
      console.error("Export failed:", e);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Reports & Export</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Select a meter below to generate a detailed telemetry report and export it to PDF.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* LEFT PANE: Meter Selection Table */}
        <div className="lg:col-span-4 flex flex-col gap-4">
          <Card className="bg-white dark:bg-slate-900/60 border-slate-200 dark:border-slate-800 p-4">
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <Input
                placeholder="Search meter..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 placeholder:text-slate-500 focus:border-orange-500"
              />
            </div>
            
            <div className="rounded-md border border-slate-200 dark:border-slate-800 overflow-hidden">
              <Table>
                <TableHeader className="bg-slate-50 dark:bg-slate-950/80">
                  <TableRow className="border-slate-200 dark:border-slate-800">
                    <TableHead className="text-slate-500 dark:text-slate-400 font-semibold py-2">Device</TableHead>
                    <TableHead className="text-right text-slate-500 dark:text-slate-400 font-semibold py-2">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loadingList ? (
                    <TableRow className="border-slate-200 dark:border-slate-800">
                      <TableCell colSpan={2} className="text-center py-6 text-slate-500 dark:text-slate-400 text-sm">
                        Loading...
                      </TableCell>
                    </TableRow>
                  ) : devices.length === 0 ? (
                    <TableRow className="border-slate-200 dark:border-slate-800">
                      <TableCell colSpan={2} className="text-center py-6 text-slate-500 dark:text-slate-400 text-sm">
                        No meters found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    devices.map((d) => (
                      <TableRow 
                        key={d.id} 
                        className={`border-slate-200 dark:border-slate-800 hover:bg-slate-100/40 dark:hover:bg-slate-800/40 cursor-pointer ${selectedMeterId === d.id ? 'bg-orange-500/10' : ''}`}
                        onClick={() => fetchMeterDetail(d.id)}
                      >
                        <TableCell className="py-2">
                          <div className="font-mono text-sm font-medium text-slate-700 dark:text-slate-200 flex items-center gap-2">
                            <Flame className={`w-3.5 h-3.5 ${d.status === "REPORTING" ? "text-emerald-400" : "text-amber-400"}`} />
                            {d.deviceSerialNo}
                          </div>
                          <div className="text-xs text-slate-500 truncate mt-0.5 max-w-[150px]">
                            {d.customerName ? `${d.customerName} (${d.gaName || 'Unknown GA'})` : "Unassigned"}
                          </div>
                        </TableCell>
                        <TableCell className="text-right py-2">
                          <Button size="sm" variant="ghost" className="h-7 text-xs text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:text-white">
                            View
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Pagination */}
            {!loadingList && totalPages > 1 && (
              <div className="flex items-center justify-between mt-4 text-xs text-slate-500 dark:text-slate-400">
                <span>Page {page} of {totalPages}</span>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page <= 1}
                    onClick={() => fetchDevices(page - 1)}
                    className="h-7 w-7 p-0 border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-100 dark:bg-slate-800"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= totalPages}
                    onClick={() => fetchDevices(page + 1)}
                    className="h-7 w-7 p-0 border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-100 dark:bg-slate-800"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            )}
          </Card>
        </div>

        {/* RIGHT PANE: Detailed Report & PDF Export Area */}
        <div className="lg:col-span-8">
          {!selectedMeterId ? (
            <div className="h-full min-h-[400px] border border-dashed border-slate-200 dark:border-slate-800 rounded-xl flex flex-col items-center justify-center text-slate-500 bg-slate-900/20">
              <FileDown className="w-10 h-10 mb-4 opacity-50" />
              <p>Select a meter from the list to view and export its report.</p>
            </div>
          ) : loadingDetail ? (
            <div className="space-y-4">
              <Skeleton className="h-10 w-48" />
              <div className="grid grid-cols-2 gap-4">
                <Skeleton className="h-32 w-full" />
                <Skeleton className="h-32 w-full" />
              </div>
              <Skeleton className="h-64 w-full" />
            </div>
          ) : detailData ? (
            <div className="space-y-4 relative">
              {/* Action Bar (Not included in PDF) */}
              <div className="flex justify-end mb-4 absolute top-0 right-0 z-10 p-4">
                 <Button 
                   onClick={handleExportPdf} 
                   disabled={exporting}
                   className="bg-orange-600 hover:bg-orange-500 text-white shadow-lg shadow-orange-900/20"
                 >
                   {exporting ? (
                     <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                   ) : (
                     <FileDown className="w-4 h-4 mr-2" />
                   )}
                   {exporting ? "Generating PDF..." : "Export to PDF"}
                 </Button>
              </div>

              {/* PDF Wrapper: The contents inside this ref will be converted to PDF */}
              <div ref={reportRef} className="bg-white dark:bg-slate-950 p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xl space-y-6 text-slate-700 dark:text-slate-200">
                {/* PDF Header */}
                <div className="border-b border-slate-200 dark:border-slate-800 pb-4 pr-32">
                  <h2 className="text-2xl font-bold text-slate-900 dark:text-white font-mono flex items-center gap-2">
                     <Flame className="w-5 h-5 text-orange-500" />
                     {detailData.device.deviceSerialNo} Report
                  </h2>
                  <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                    Generated on {new Date().toLocaleString()}
                  </p>
                </div>

                {/* KPI Grid */}
                <div className="grid grid-cols-2 gap-4">
                  <KpiCard title="Volume (Corrected)" icon={Activity} iconColor="text-orange-400">
                    <BigValue value={fmt(detailData.latestReading?.correctedVolumeVb)} unit="Sm³" />
                    <DataRow label="Uncorrected (Vm)" value={`${fmt(detailData.latestReading?.uncorrectedVolumeVm)} m³`} />
                  </KpiCard>
                  <KpiCard title="Gas Pressure" icon={Gauge} iconColor="text-blue-400">
                    <BigValue value={fmt(detailData.latestReading?.gasPressure)} unit="barg" />
                    <DataRow label="Max/Min" value={`${fmt(detailData.latestReading?.pressureMax)} / ${fmt(detailData.latestReading?.pressureMin)}`} />
                  </KpiCard>
                  <KpiCard title="Gas Temperature" icon={Thermometer} iconColor="text-rose-400">
                    <BigValue value={fmt(detailData.latestReading?.gasTemperature)} unit="°C" />
                    <DataRow label="Max/Min" value={`${fmt(detailData.latestReading?.temperatureMax)} / ${fmt(detailData.latestReading?.temperatureMin)}`} />
                  </KpiCard>
                  <KpiCard title="Device Info" icon={Info} iconColor="text-slate-500 dark:text-slate-400">
                    <DataRow label="Meter Serial" value={detailData.device.meterSerialNo ?? "—"} />
                    <DataRow label="Last Seen" value={detailData.device.lastSeenAt ? new Date(detailData.device.lastSeenAt).toLocaleString() : "—"} />
                  </KpiCard>
                </div>

                {/* History Trend Chart */}
                <div className="border border-slate-200 dark:border-slate-800 rounded-lg p-4 bg-slate-50 dark:bg-slate-900/40">
                  <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-4">30-Day Corrected Volume Trend</h3>
                  {history.length > 0 ? (
                    <div style={{ width: '100%', height: '200px' }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={history} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-slate-300 dark:text-slate-800" />
                          <XAxis dataKey="date" tick={{ fontSize: 10, fill: "currentColor" }} tickLine={false} axisLine={false} className="text-slate-500 dark:text-slate-400" />
                          <YAxis tick={{ fontSize: 10, fill: "currentColor" }} tickLine={false} axisLine={false} className="text-slate-500 dark:text-slate-400" />
                          <Tooltip 
                            contentStyle={{ backgroundColor: "var(--popover)", borderColor: "var(--border)", color: "var(--popover-foreground)", borderRadius: "6px" }}
                          />
                          <Line type="monotone" dataKey="correctedVolumeVb" stroke="#f97316" strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <div className="h-[200px] flex items-center justify-center text-slate-500 text-sm">
                      No trend data available.
                    </div>
                  )}
                </div>

              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
