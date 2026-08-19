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
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Customer Reports</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Generate and export telemetry reports based on customer and date range.
        </p>
      </div>

      <Card className="bg-card border-border">
        <CardHeader className="border-b border-border pb-4">
          <CardTitle className="text-lg text-foreground">Report Criteria</CardTitle>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
            {/* Customer Selection */}
            <div className="space-y-2 md:col-span-2">
              <label className="text-sm font-medium text-muted-foreground">Customer</label>
              <select
                className="w-full flex h-10 rounded-md border border-border bg-secondary px-3 py-2 text-sm text-foreground focus:outline-none disabled:opacity-50"
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
              <label className="text-sm font-medium text-muted-foreground">Start Date</label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="bg-secondary border-border text-foreground"
              />
            </div>

            {/* End Date */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground">End Date</label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="bg-secondary border-border text-foreground"
              />
            </div>
          </div>

          {error && (
            <div className="mt-4 p-3 rounded-md flex items-center text-sm" style={{background:'var(--clr-alert)14', border:'1px solid var(--clr-alert)44', color:'var(--clr-alert)'}}>
              <AlertCircle className="w-4 h-4 mr-2" />
              {error}
            </div>
          )}

          <div className="mt-6 flex justify-end">
            <Button
              onClick={handleFetchReport}
              disabled={!isFormValid || loadingReport}
              style={{background:'var(--clr-accent-mid)', color:'#fff'}}
              className="min-w-[140px] hover:opacity-90"
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
        <Card className="bg-card border-border overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between border-b border-border bg-secondary pb-4">
            <div>
              <CardTitle className="text-lg text-foreground">Report Data</CardTitle>
              {allReadings.length > 0 && (
                <p className="text-xs text-muted-foreground mt-1">
                  Showing {pageStartIndex + 1}–{Math.min(pageStartIndex + ROWS_PER_PAGE, allReadings.length)} of {allReadings.length} readings
                </p>
              )}
            </div>

            <Button
              onClick={handleExportExcel}
              disabled={loadingReport || exporting || !reportData || (reportData.meters?.length ?? 0) === 0}
              variant="outline"
              className="border-border bg-card hover:bg-accent text-foreground"
            >
              {exporting ? (
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <FileSpreadsheet className="w-4 h-4 mr-2" style={{color:'var(--clr-online)'}} />
              )}
              Download Report
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            {loadingReport ? (
              <div className="flex flex-col items-center justify-center p-12 text-muted-foreground">
                <RefreshCw className="w-8 h-8 animate-spin mb-4 opacity-50" style={{color:'var(--clr-accent-mid)'}} />
                <p>Generating report...</p>
              </div>
            ) : reportData && reportData.readings?.length > 0 ? (
              <>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader className="bg-secondary border-b border-border">
                      <TableRow className="border-border hover:bg-transparent">
                        <TableHead className="text-muted-foreground font-semibold whitespace-nowrap">Date</TableHead>
                        <TableHead className="text-muted-foreground font-semibold whitespace-nowrap">Device Serial</TableHead>
                        <TableHead className="text-muted-foreground font-semibold whitespace-nowrap">Meter Serial</TableHead>
                        <TableHead className="text-muted-foreground font-semibold whitespace-nowrap text-right">Corrected Vol (Sm³)</TableHead>
                        <TableHead className="text-muted-foreground font-semibold whitespace-nowrap text-right">Uncorrected Vol (m³)</TableHead>
                        <TableHead className="text-muted-foreground font-semibold whitespace-nowrap text-right">Pressure (barg)</TableHead>
                        <TableHead className="text-muted-foreground font-semibold whitespace-nowrap text-right">Temp (°C)</TableHead>
                        <TableHead className="text-muted-foreground font-semibold whitespace-nowrap text-right">Battery (%)</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginatedReadings.map((row) => (
                        <TableRow key={row.id} className="border-border hover:bg-secondary/60">
                          <TableCell className="font-mono text-xs text-muted-foreground whitespace-nowrap">
                            {formatLocalTs(row.receivedAt)}
                          </TableCell>
                          <TableCell className="font-mono text-xs text-foreground">
                            {row.deviceSerialNo}
                          </TableCell>
                          <TableCell className="font-mono text-xs text-muted-foreground">
                            {row.meterSerialNo || "—"}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs font-medium" style={{color:'var(--clr-accent-hi)'}}>
                            {fmt(row.correctedVolumeVb)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs text-muted-foreground">
                            {fmt(row.uncorrectedVolumeVm)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs" style={{color:'var(--clr-commercial)'}}>
                            {fmt(row.gasPressure)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs" style={{color:'var(--clr-stale)'}}>
                            {fmt(row.gasTemperature)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs" style={{color:'var(--clr-online)'}}>
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
              <div className="flex flex-col items-center justify-center p-12 text-muted-foreground">
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