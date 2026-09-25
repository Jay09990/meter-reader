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
import {
  downloadCustomerReportExcel,
  groupReadingsByMeter,
} from "@/lib/report-excel";
import type {
  CustomerReport,
  ReportMode,
  RangeSelectorType,
  DataFrequency,
} from "@/features/reports";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────
interface Customer {
  id: string;
  name: string;
  category: string;
}

const ROWS_PER_PAGE = 25;

const REPORT_MODES: Array<{ value: ReportMode; label: string }> = [
  { value: "dateRange", label: "Date Range" },
  { value: "rangeSelection", label: "Range Selection" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmt(val: number | null | undefined, decimals = 2): string {
  if (val == null) return "—";
  return val.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function ReportModeSelector({
  value,
  onChange,
}: {
  value: ReportMode;
  onChange: (value: ReportMode) => void;
}) {
  return (
    <div className="relative grid grid-cols-2 rounded-lg bg-secondary p-1 text-xs font-semibold max-w-[320px]">
      <span
        className="absolute inset-y-1 w-1/2 rounded-md bg-card shadow-sm transition-transform duration-200"
        style={{
          transform: `translateX(${REPORT_MODES.findIndex((m) => m.value === value) * 100}%)`,
        }}
      />
      {REPORT_MODES.map((m) => (
        <button
          key={m.value}
          type="button"
          onClick={() => onChange(m.value)}
          className={cn(
            "relative z-10 rounded-md px-3 py-1.5 transition-colors",
            value === m.value ? "text-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function ReportsPage() {
  // Customers List State
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loadingCustomers, setLoadingCustomers] = useState(true);

  // Mode state
  const [reportMode, setReportMode] = useState<ReportMode>("dateRange");

  // Mode 1 & 2 Form State (Multi-select customers)
  const [selectedCustomerIds, setSelectedCustomerIds] = useState<string[]>([]);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  // Mode 1: Date Range Form State
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [frequency] = useState<DataFrequency>("1d");

  // Mode 2: Range Selection Form State
  const [rangeType, setRangeType] = useState<RangeSelectorType>("monthly");
  const [month, setMonth] = useState(""); // YYYY-MM
  const [fyStartYear, setFyStartYear] = useState<number | "">("");
  const [quarter, setQuarter] = useState<1 | 2 | 3 | 4 | "">("");

  // Report State
  const [loadingReport, setLoadingReport] = useState(false);
  const [reportData, setReportData] = useState<CustomerReport | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  // Fetch Customers on Mount
  useEffect(() => {
    let isMounted = true;
    fetch("/api/customers?limit=1000")
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (isMounted) {
          setCustomers(data.data || []);
          setLoadingCustomers(false);
        }
      })
      .catch((err) => {
        console.error("Failed to fetch customers:", err);
        if (isMounted) {
          setLoadingCustomers(false);
        }
      });
    return () => {
      isMounted = false;
    };
  }, []);

  // Form Validation
  const isDateRangeFormValid = selectedCustomerIds.length > 0 && startDate !== "" && endDate !== "";
  
  const isRangeSelectionFormValid = (() => {
    if (selectedCustomerIds.length === 0) return false;
    if (rangeType === "monthly") return month !== "";
    if (rangeType === "quarterly") return fyStartYear !== "" && quarter !== "";
    if (rangeType === "yearly") return fyStartYear !== "";
    return false;
  })();

  const isFormValid = reportMode === "dateRange" ? isDateRangeFormValid : isRangeSelectionFormValid;

  // Generate FY start year options going back ~6 years
  const getFyOptions = () => {
    const currentYear = new Date().getFullYear();
    const options = [];
    // If we're early in the calendar year (before April), the current FY starts the previous year,
    // but we can generate starting from the current calendar year.
    for (let i = 0; i < 6; i++) {
      const year = currentYear - i;
      const nextYearShort = String(year + 1).slice(2);
      options.push({
        value: year,
        label: `FY ${String(year).slice(2)}-${nextYearShort}`,
      });
    }
    return options;
  };

  // Fetch Report Handler
  const handleFetchReport = async () => {
    if (!isFormValid) {
      setError("Please fill in all criteria.");
      return;
    }

    if (reportMode === "dateRange" && new Date(startDate) > new Date(endDate)) {
      setError("Start date cannot be later than end date.");
      return;
    }

    setLoadingReport(true);
    setError(null);
    setHasSearched(true);
    setReportData(null);
    setCurrentPage(1);

    try {
      const selectedIdParam =
        selectedCustomerIds.length === customers.length
          ? "all"
          : selectedCustomerIds.join(",");

      let queryStartDate = startDate;
      let queryEndDate = endDate;

      if (reportMode === "rangeSelection") {
        const todayIso = new Date().toISOString().split("T")[0];
        if (rangeType === "monthly") {
          const [yStr, mStr] = month.split("-");
          const y = parseInt(yStr, 10);
          const m = parseInt(mStr, 10);
          queryStartDate = `${month}-01`;
          const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
          const end = `${month}-${String(lastDay).padStart(2, "0")}`;
          queryEndDate = end > todayIso ? todayIso : end;
        } else if (rangeType === "quarterly") {
          const y = Number(fyStartYear);
          if (quarter === 1) {
            queryStartDate = `${y}-04-01`;
            const end = `${y}-06-30`;
            queryEndDate = end > todayIso ? todayIso : end;
          } else if (quarter === 2) {
            queryStartDate = `${y}-07-01`;
            const end = `${y}-09-30`;
            queryEndDate = end > todayIso ? todayIso : end;
          } else if (quarter === 3) {
            queryStartDate = `${y}-10-01`;
            const end = `${y}-12-31`;
            queryEndDate = end > todayIso ? todayIso : end;
          } else {
            queryStartDate = `${y + 1}-01-01`;
            const end = `${y + 1}-03-31`;
            queryEndDate = end > todayIso ? todayIso : end;
          }
        } else if (rangeType === "yearly") {
          const y = Number(fyStartYear);
          queryStartDate = `${y}-04-01`;
          const end = `${y + 1}-03-31`;
          queryEndDate = end > todayIso ? todayIso : end;
        }
      }

      const params = new URLSearchParams({
        customerId: selectedIdParam,
        startDate: queryStartDate,
        endDate: queryEndDate,
        frequency: frequency,
      });

      const res = await fetch(`/api/reports/customer?${params.toString()}`);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to fetch report data.");
      }

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

  // Export to Excel Handler
  const handleExportExcel = () => {
    setError(null);
    setExporting(true);

    try {
      if (!reportData) return;
      const meters = reportData.meters ?? [];
      if (meters.length === 0) return;
      downloadCustomerReportExcel(
        meters,
        reportData.customerName,
        reportData.startDate,
        reportData.endDate,
      );
    } catch (err) {
      console.error("Failed to export Excel:", err);
      const message = err instanceof Error ? err.message : "An error occurred while generating the Excel file.";
      setError(message);
    } finally {
      setExporting(false);
    }
  };

  // Pagination for Mode 1
  const allReadings = reportData?.readings ?? [];
  const totalPages = Math.max(1, Math.ceil(allReadings.length / ROWS_PER_PAGE));
  const pageStartIndex = (currentPage - 1) * ROWS_PER_PAGE;
  const paginatedReadings = allReadings.slice(pageStartIndex, pageStartIndex + ROWS_PER_PAGE);

  return (
    <div className="space-y-6 w-full">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Customer Reports</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Generate and export telemetry reports based on customer and date range.
          </p>
        </div>
        <ReportModeSelector value={reportMode} onChange={setReportMode} />
      </div>

      <Card className="bg-card border-border !overflow-visible">
        <CardHeader className="border-b border-border pb-4">
          <CardTitle className="text-lg text-foreground">Report Criteria</CardTitle>
        </CardHeader>
        <CardContent className="pt-6 !overflow-visible">
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
              {/* Customer Selection (Multi-select) */}
              <div className="space-y-2 md:col-span-2 relative z-30">
                <label className="text-sm font-medium text-muted-foreground">Customer(s)</label>
                <button
                  type="button"
                  onClick={() => setDropdownOpen(!dropdownOpen)}
                  className="w-full flex items-center justify-between h-10 rounded-md border border-border bg-secondary px-3 py-2 text-sm text-foreground focus:outline-none disabled:opacity-50 text-left"
                  disabled={loadingCustomers}
                >
                  <span className="truncate">
                    {loadingCustomers
                      ? "Loading customers..."
                      : selectedCustomerIds.length === 0
                      ? "Select customer(s)..."
                      : selectedCustomerIds.length === customers.length
                      ? "All Customers Selected"
                      : `${selectedCustomerIds.length} Customer(s) Selected`}
                  </span>
                  <span className="ml-2 text-xs text-muted-foreground">▼</span>
                </button>

                {dropdownOpen && !loadingCustomers && (
                  <>
                    <div
                      className="fixed inset-0 z-40"
                      onClick={() => setDropdownOpen(false)}
                    />
                    <div className="absolute left-0 right-0 mt-1 max-h-60 overflow-y-auto rounded-md border border-border bg-popover text-popover-foreground shadow-xl z-50 p-2 space-y-1">
                      {/* Select All option */}
                      <label className="flex items-center space-x-2 p-1.5 hover:bg-accent rounded-md cursor-pointer text-sm">
                        <input
                          type="checkbox"
                          checked={selectedCustomerIds.length === customers.length && customers.length > 0}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedCustomerIds(customers.map((c) => c.id));
                            } else {
                              setSelectedCustomerIds([]);
                            }
                          }}
                          className="rounded border-border bg-transparent accent-[var(--clr-accent-mid)]"
                        />
                        <span className="font-semibold text-foreground">Select All</span>
                      </label>
                      <div className="border-t border-border my-1" />
                      {customers.map((c) => {
                        const isChecked = selectedCustomerIds.includes(c.id);
                        return (
                          <label
                            key={c.id}
                            className="flex items-center space-x-2 p-1.5 hover:bg-accent rounded-md cursor-pointer text-sm"
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => {
                                if (isChecked) {
                                  setSelectedCustomerIds(
                                    selectedCustomerIds.filter((id) => id !== c.id)
                                  );
                                } else {
                                  setSelectedCustomerIds([...selectedCustomerIds, c.id]);
                                }
                              }}
                              className="rounded border-border bg-transparent accent-[var(--clr-accent-mid)]"
                            />
                            <span className="text-foreground">{c.name}</span>
                            <span className="text-xs text-muted-foreground">({c.category})</span>
                          </label>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>

              {reportMode === "dateRange" ? (
                <>
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
                </>
                ) : (
                <>
                  {/* Range Type — occupies same slot as Start Date */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-muted-foreground">Range Type</label>
                    <select
                      className="w-full flex h-10 rounded-md border border-border bg-secondary px-3 py-2 text-sm text-foreground focus:outline-none"
                      value={rangeType}
                      onChange={(e) => {
                        setRangeType(e.target.value as RangeSelectorType);
                        setMonth("");
                        setFyStartYear("");
                        setQuarter("");
                      }}
                    >
                      <option value="monthly">Monthly</option>
                      <option value="quarterly">Quarterly</option>
                      <option value="yearly">Yearly</option>
                    </select>
                  </div>

                  {/* Dynamic input — occupies same slot as End Date */}
                  {rangeType === "monthly" && (
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-muted-foreground">Select Month</label>
                      <Input
                        type="month"
                        value={month}
                        onChange={(e) => setMonth(e.target.value)}
                        className="bg-secondary border-border text-foreground"
                      />
                    </div>
                  )}

                  {rangeType === "quarterly" && (
                    <>
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-muted-foreground">Financial Year</label>
                        <select
                          className="w-full flex h-10 rounded-md border border-border bg-secondary px-3 py-2 text-sm text-foreground focus:outline-none"
                          value={fyStartYear}
                          onChange={(e) => setFyStartYear(e.target.value ? parseInt(e.target.value, 10) : "")}
                        >
                          <option value="">Select FY...</option>
                          {getFyOptions().map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-muted-foreground">Quarter</label>
                        <select
                          className="w-full flex h-10 rounded-md border border-border bg-secondary px-3 py-2 text-sm text-foreground focus:outline-none"
                          value={quarter}
                          onChange={(e) => setQuarter(e.target.value ? (parseInt(e.target.value, 10) as 1 | 2 | 3 | 4) : "")}
                          disabled={fyStartYear === ""}
                        >
                          <option value="">Select Quarter...</option>
                          <option value="1">Q1: Apr-Jun</option>
                          <option value="2">Q2: Jul-Sep</option>
                          <option value="3">Q3: Oct-Dec</option>
                          <option value="4">Q4: Jan-Mar</option>
                        </select>
                      </div>
                    </>
                  )}

                  {rangeType === "yearly" && (
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-muted-foreground">Financial Year</label>
                      <select
                        className="w-full flex h-10 rounded-md border border-border bg-secondary px-3 py-2 text-sm text-foreground focus:outline-none"
                        value={fyStartYear}
                        onChange={(e) => setFyStartYear(e.target.value ? parseInt(e.target.value, 10) : "")}
                      >
                        <option value="">Select FY...</option>
                        {getFyOptions().map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </>
              )}
            </div>

            {reportMode === "dateRange" && (
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-muted-foreground">Data Frequency</label>
                  <div className="h-10 px-3 py-2 flex items-center rounded-md border border-border bg-secondary text-sm text-foreground font-medium">
                    1 day
                  </div>
                </div>
              </div>
            )}
          </div>

          {error && (
            <div
              className="mt-4 p-3 rounded-md flex items-center text-sm"
              style={{
                background: "var(--clr-alert)14",
                border: "1px solid var(--clr-alert)44",
                color: "var(--clr-alert)",
              }}
            >
              <AlertCircle className="w-4 h-4 mr-2" />
              {error}
            </div>
          )}

          <div className="mt-6 flex justify-end">
            <Button
              onClick={handleFetchReport}
              disabled={!isFormValid || loadingReport}
              style={{ background: "var(--clr-accent-mid)", color: "#fff" }}
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
                  Showing {pageStartIndex + 1}–
                  {Math.min(pageStartIndex + ROWS_PER_PAGE, allReadings.length)} of{" "}
                  {allReadings.length} readings
                </p>
              )}
            </div>

            <Button
              onClick={handleExportExcel}
              disabled={
                loadingReport ||
                exporting ||
                (!reportData || (reportData.meters?.length ?? 0) === 0)
              }
              variant="outline"
              className="border-border bg-card hover:bg-accent text-foreground"
            >
              {exporting ? (
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <FileSpreadsheet className="w-4 h-4 mr-2" style={{ color: "var(--clr-online)" }} />
              )}
              Download Report
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            {loadingReport ? (
              <div className="flex flex-col items-center justify-center p-12 text-muted-foreground">
                <RefreshCw
                  className="w-8 h-8 animate-spin mb-4 opacity-50"
                  style={{ color: "var(--clr-accent-mid)" }}
                />
                <p>Generating report...</p>
              </div>
            ) : reportData && reportData.readings?.length > 0 ? (
              <>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader className="bg-secondary border-b border-border">
                      <TableRow className="border-border hover:bg-transparent">
                        <TableHead className="text-muted-foreground font-semibold whitespace-nowrap">
                          SR.NO
                        </TableHead>
                        <TableHead className="text-muted-foreground font-semibold whitespace-nowrap">
                          NAME OF INDUSTRY
                        </TableHead>
                        <TableHead className="text-muted-foreground font-semibold whitespace-nowrap">
                          CUSTOMER TYPE
                        </TableHead>
                        <TableHead className="text-muted-foreground font-semibold whitespace-nowrap">
                          SOURCE/SEGMENT
                        </TableHead>
                        <TableHead className="text-muted-foreground font-semibold whitespace-nowrap">
                          STREAM NO
                        </TableHead>
                        <TableHead className="text-muted-foreground font-semibold whitespace-nowrap text-right">
                          PRESSURE (Bar)
                        </TableHead>
                        <TableHead className="text-muted-foreground font-semibold whitespace-nowrap text-right">
                          TEMPERATURE (°C)
                        </TableHead>
                        <TableHead className="text-muted-foreground font-semibold whitespace-nowrap text-right">
                          CORRECTION FACTOR
                        </TableHead>
                        <TableHead className="text-muted-foreground font-semibold whitespace-nowrap text-right">
                          CURRENT FLOWRATE (CORRECTED) (SCMH)
                        </TableHead>
                        <TableHead className="text-muted-foreground font-semibold whitespace-nowrap text-right">
                          CORRECTED VOLUME TOTALIZER (SCM)
                        </TableHead>
                        <TableHead className="text-muted-foreground font-semibold whitespace-nowrap text-right">
                          UNCORRECTED VOLUME TOTALIZER (m³)
                        </TableHead>
                        <TableHead className="text-muted-foreground font-semibold whitespace-nowrap text-right">
                          PREVIOUS DAY UNCORRECTED (m³)
                        </TableHead>
                        <TableHead className="text-muted-foreground font-semibold whitespace-nowrap text-right">
                          PREVIOUS DAY CORRECTED (SCMD)
                        </TableHead>
                        <TableHead className="text-muted-foreground font-semibold whitespace-nowrap text-right">
                          PREVIOUS DAY UNCORRECTED TOTALIZER (m³)
                        </TableHead>
                        <TableHead className="text-muted-foreground font-semibold whitespace-nowrap text-right">
                          PREVIOUS DAY CORRECTED TOTAIZER (SCM)
                        </TableHead>
                        <TableHead className="text-muted-foreground font-semibold whitespace-nowrap text-right">
                          EVC BATTERY/BALANCE DAYS (%)
                        </TableHead>
                        <TableHead className="text-muted-foreground font-semibold whitespace-nowrap">
                          ALARMS
                        </TableHead>
                        <TableHead className="text-muted-foreground font-semibold whitespace-nowrap">
                          DATE
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginatedReadings.map((row, idx) => (
                        <TableRow key={row.id} className="border-border hover:bg-secondary/60">
                          <TableCell className="font-mono text-xs text-muted-foreground">
                            {pageStartIndex + idx + 1}
                          </TableCell>
                          <TableCell className="text-sm font-medium text-foreground whitespace-nowrap">
                            {row.customerName || "—"}
                          </TableCell>
                          <TableCell className="text-xs font-semibold text-muted-foreground whitespace-nowrap">
                            {row.customerCategory || "—"}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                            IBAFO
                          </TableCell>
                          <TableCell className="font-mono text-xs text-foreground whitespace-nowrap">
                            {row.meterSerialNo || row.deviceSerialNo}
                          </TableCell>
                          <TableCell
                            className="text-right font-mono text-xs"
                            style={{ color: "var(--clr-commercial)" }}
                          >
                            {fmt(row.gasPressure)}
                          </TableCell>
                          <TableCell
                            className="text-right font-mono text-xs"
                            style={{ color: "var(--clr-stale)" }}
                          >
                            {fmt(row.gasTemperature)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs text-muted-foreground">
                            {fmt(row.correctionFactor)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs text-muted-foreground">
                            {fmt(row.currentFlowRate)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs font-medium text-foreground">
                            {fmt(row.correctedVolumeVb)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs text-muted-foreground">
                            {fmt(row.uncorrectedVolumeVm)}
                          </TableCell>
                          <TableCell
                            className="text-right font-mono text-xs"
                            style={{ color: "var(--clr-commercial)" }}
                          >
                            {fmt(row.prevDayUncorrected, 3)}
                          </TableCell>
                          <TableCell
                            className="text-right font-mono text-xs font-semibold"
                            style={{ color: "var(--clr-accent-hi)" }}
                          >
                            {fmt(row.prevDayCorrected, 3)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs text-muted-foreground">
                            {fmt(row.prevDayUncorrectedTotalizer)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs font-medium text-foreground">
                            {fmt(row.prevDayCorrectedTotalizer)}
                          </TableCell>
                          <TableCell
                            className="text-right font-mono text-xs"
                            style={{ color: "var(--clr-online)" }}
                          >
                            {row.batteryLevel != null ? `${Math.round(row.batteryLevel)}%` : "—"}
                          </TableCell>
                          <TableCell className="text-xs whitespace-normal max-w-[200px]">
                            {"---"}
                          </TableCell>
                          <TableCell className="font-mono text-xs text-muted-foreground whitespace-nowrap">
                            {row.readingDate.split("T")[0]}
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
                <p className="text-center font-medium">
                  No report data is available for the selected customer and criteria.
                </p>
                <p className="text-sm opacity-70 mt-1">
                  Try selecting a different period or a different customer.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}