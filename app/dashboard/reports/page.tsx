"use client";

import { useEffect, useState } from "react";
import {
  FileDown,
  RefreshCw,
  Search,
  AlertCircle,
  FileSpreadsheet
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { downloadCustomerReportExcel, groupReadingsByMeter } from "@/lib/report-excel";
import type { CustomerReport } from "@/features/reports";
import { formatLocalTs } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────
interface Customer {
  id: string;
  name: string;
  category: string;
}

type ReportData = CustomerReport;

const ROWS_PER_PAGE = 25;

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmt(val: number | null | undefined, decimals = 2): string {
  if (val == null) return "—";
  return val.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function ReportsPage() {
  // Customers List State
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loadingCustomers, setLoadingCustomers] = useState(true);

  // Form State
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // Report State
  const [loadingReport, setLoadingReport] = useState(false);
  const [reportData, setReportData] = useState<ReportData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  // Fetch Customers on Mount
  useEffect(() => {
    fetch("/api/customers?limit=1000")
      .then(res => res.json())
      .then(data => {
        setCustomers(data.data || []);
        setLoadingCustomers(false);
      })
      .catch(err => {
        console.error("Failed to fetch customers:", err);
        setLoadingCustomers(false);
      });
  }, []);

  // Form Validation
  const isFormValid = selectedCustomerId !== "" && startDate !== "" && endDate !== "";

  // Fetch Report Handler
  const handleFetchReport = async () => {
    if (!isFormValid) {
      setError("Please select a customer and date range.");
      return;
    }

    if (new Date(startDate) > new Date(endDate)) {
      setError("Start date cannot be later than end date.");
      return;
    }

    setLoadingReport(true);
    setError(null);
    setHasSearched(true);
    setReportData(null);
    setCurrentPage(1);

    try {
      const params = new URLSearchParams({
        customerId: selectedCustomerId,
        startDate: startDate,
        endDate: endDate,
      });

      const res = await fetch(`/api/reports/customer?${params.toString()}`);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to fetch report data.");
      }

      // Defensive normalization: the API is expected to return `meters`
      // pre-grouped, but fall back to grouping client-side so a stale/cached
      // response shape never crashes the page.
      const readings = data.readings ?? [];
      setReportData({
        ...data,
        readings,
        meters: data.meters ?? groupReadingsByMeter(readings),
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "An unexpected error occurred.";
      setError(message);
    } finally {
      setLoadingReport(false);
    }
  };

  // Export to Excel Handler — reuses already-fetched data, no extra API call.
  // One worksheet per meter; meters with no data in range are skipped.
  const handleExportExcel = () => {
    if (!reportData) return;
    const meters = reportData.meters ?? [];
    if (meters.length === 0) return;
    setExporting(true);
    setError(null);

    try {
      downloadCustomerReportExcel(
        meters,
        reportData.customerName,
        startDate,
        endDate,
      );
    } catch (err) {
      console.error("Failed to export Excel:", err);
      const message = err instanceof Error ? err.message : "An error occurred while generating the Excel file.";
      setError(message);
    } finally {
      setExporting(false);
    }
  };

  // Pagination — purely client-side over the already-fetched readings.
  // Excel export always uses the full dataset regardless of the current page.
  const allReadings = reportData?.readings ?? [];
  const totalPages = Math.max(1, Math.ceil(allReadings.length / ROWS_PER_PAGE));
  const pageStartIndex = (currentPage - 1) * ROWS_PER_PAGE;
  const paginatedReadings = allReadings.slice(pageStartIndex, pageStartIndex + ROWS_PER_PAGE);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Customer Reports</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Generate and export telemetry reports based on customer and date range.
        </p>
      </div>

      <Card className="bg-white dark:bg-slate-900/60 border-slate-200 dark:border-slate-800">
        <CardHeader className="border-b border-slate-200 dark:border-slate-800 pb-4">
          <CardTitle className="text-lg">Report Criteria</CardTitle>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
            {/* Customer Selection */}
            <div className="space-y-2 md:col-span-2">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Customer</label>
              <select
                className="w-full flex h-10 rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-orange-500 disabled:opacity-50"
                value={selectedCustomerId}
                onChange={(e) => setSelectedCustomerId(e.target.value)}
                disabled={loadingCustomers}
              >
                <option value="" disabled>
                  {loadingCustomers ? "Loading customers..." : "Select a customer..."}
                </option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>{c.name} ({c.category})</option>
                ))}
              </select>
            </div>

            {/* Start Date */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Start Date</label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white"
              />
            </div>

            {/* End Date */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">End Date</label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white"
              />
            </div>
          </div>

          {error && (
            <div className="mt-4 p-3 rounded-md bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 flex items-center text-rose-600 dark:text-rose-400 text-sm">
              <AlertCircle className="w-4 h-4 mr-2" />
              {error}
            </div>
          )}

          <div className="mt-6 flex justify-end">
            <Button
              onClick={handleFetchReport}
              disabled={!isFormValid || loadingReport}
              className="bg-sky-600 hover:bg-sky-500 text-white min-w-[140px]"
            >
              {loadingReport ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  Fetching...
                </>
              ) : (
                <>
                  <Search className="w-4 h-4 mr-2" />
                  Fetch Report
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Report Results */}
      {hasSearched && (
        <Card className="bg-white dark:bg-slate-900/60 border-slate-200 dark:border-slate-800 overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50 pb-4">
            <div>
              <CardTitle className="text-lg">Report Data</CardTitle>
              {allReadings.length > 0 && (
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Showing {pageStartIndex + 1}–{Math.min(pageStartIndex + ROWS_PER_PAGE, allReadings.length)} of {allReadings.length} readings
                </p>
              )}
            </div>

            <Button
              onClick={handleExportExcel}
              disabled={loadingReport || exporting || !reportData || (reportData.meters?.length ?? 0) === 0}
              variant="outline"
              className="border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              {exporting ? (
                <RefreshCw className="w-4 h-4 mr-2 animate-spin text-slate-500" />
              ) : (
                <FileSpreadsheet className="w-4 h-4 mr-2 text-emerald-600 dark:text-emerald-500" />
              )}
              Download Report
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            {loadingReport ? (
              <div className="flex flex-col items-center justify-center p-12 text-slate-500 dark:text-slate-400">
                <RefreshCw className="w-8 h-8 animate-spin mb-4 opacity-50 text-sky-500" />
                <p>Generating report...</p>
              </div>
            ) : reportData && reportData.readings?.length > 0 ? (
              <>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader className="bg-slate-50 dark:bg-slate-950/80 border-b border-slate-200 dark:border-slate-800">
                      <TableRow className="border-slate-200 dark:border-slate-800 hover:bg-transparent">
                        <TableHead className="text-slate-500 dark:text-slate-400 font-semibold whitespace-nowrap">Date</TableHead>
                        <TableHead className="text-slate-500 dark:text-slate-400 font-semibold whitespace-nowrap">Device Serial</TableHead>
                        <TableHead className="text-slate-500 dark:text-slate-400 font-semibold whitespace-nowrap">Meter Serial</TableHead>
                        <TableHead className="text-slate-500 dark:text-slate-400 font-semibold whitespace-nowrap text-right">Corrected Vol (Sm³)</TableHead>
                        <TableHead className="text-slate-500 dark:text-slate-400 font-semibold whitespace-nowrap text-right">Uncorrected Vol (m³)</TableHead>
                        <TableHead className="text-slate-500 dark:text-slate-400 font-semibold whitespace-nowrap text-right">Pressure (barg)</TableHead>
                        <TableHead className="text-slate-500 dark:text-slate-400 font-semibold whitespace-nowrap text-right">Temp (°C)</TableHead>
                        <TableHead className="text-slate-500 dark:text-slate-400 font-semibold whitespace-nowrap text-right">Battery (%)</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginatedReadings.map((row) => (
                        <TableRow key={row.id} className="border-slate-200 dark:border-slate-800 hover:bg-slate-100/40 dark:hover:bg-slate-800/40">
                          <TableCell className="font-mono text-xs text-slate-700 dark:text-slate-300 whitespace-nowrap">
                            {formatLocalTs(row.receivedAt)}
                          </TableCell>
                          <TableCell className="font-mono text-xs text-slate-700 dark:text-slate-300">
                            {row.deviceSerialNo}
                          </TableCell>
                          <TableCell className="font-mono text-xs text-slate-500">
                            {row.meterSerialNo || "—"}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs text-orange-600 dark:text-orange-400 font-medium">
                            {fmt(row.correctedVolumeVb)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs text-slate-600 dark:text-slate-400">
                            {fmt(row.uncorrectedVolumeVm)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs text-blue-600 dark:text-blue-400">
                            {fmt(row.gasPressure)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs text-rose-600 dark:text-rose-400">
                            {fmt(row.gasTemperature)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs text-emerald-600 dark:text-emerald-400">
                            {row.batteryLevel != null ? `${Math.round(row.batteryLevel)}%` : "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <PaginationControls
                  currentPage={currentPage}
                  totalPages={totalPages}
                  onPageChange={setCurrentPage}
                />
              </>
            ) : (
              <div className="flex flex-col items-center justify-center p-12 text-slate-500 dark:text-slate-400">
                <FileDown className="w-10 h-10 mb-4 opacity-30" />
                <p className="text-center font-medium">No report data is available for the selected customer and date range.</p>
                <p className="text-sm opacity-70 mt-1">Try selecting a different date range or a different customer.</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}