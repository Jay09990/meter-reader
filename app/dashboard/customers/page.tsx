"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  LayoutGrid,
  List,
  Search,
  Activity,
  Gauge,
  Battery,
  X,
  PlusCircle,
  AlertTriangle,
  CheckCircle,
  HelpCircle
} from "lucide-react";

import { useAutoRefresh } from "@/lib/auto-refresh";
import { formatLocalTs, formatLocalDate } from "@/lib/utils";

// Customer registry for filtering, viewing, and provisioning AMR endpoints.
interface DeviceItem {
  id: string;
  deviceSerialNo: string;
  meterSerialNo: string | null;
  meterSize: string | null;
  customerName: string | null;
  category: string | null;
  address: string | null;
  gaName: string | null;
  lastSeenAt: string | null;
  status: "NEW" | "ONLINE" | "OFFLINE" | "ALERT";
  latestReading: {
    readingDate: string;
    receivedAt: string;
    correctedVolumeVb: number | null;
    gasPressure: number | null;
    gasTemperature: number | null;
    currentFlowRate: number | null;
    batteryLevel: number | null;
  } | null;
}

interface GeographicalArea {
  id: string;
  name: string;
}

export default function CustomersPage() {
  const [devices, setDevices] = useState<DeviceItem[]>([]);
  const [total, setTotal] = useState(0);
  const [view, setView] = useState<"list" | "grid">("grid");

  // Filter States
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [gaFilter, setGaFilter] = useState("all");
  const [gasList, setGasList] = useState<GeographicalArea[]>([]);

  // Drawer States
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState<DeviceItem | null>(null);

  // Drawer Form States
  const [customerName, setCustomerName] = useState("");
  const [meterIdInput, setMeterIdInput] = useState(""); // This will be uneditable
  const [deviceIdInput, setDeviceIdInput] = useState(""); // maps to meterSerialNo
  const [selectedCategory, setSelectedCategory] = useState("RESIDENTIAL");
  const [address, setAddress] = useState("");
  const [selectedGaId, setSelectedGaId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  // Provisioning Type
  const [provisionType, setProvisionType] = useState<"new" | "existing">("new");
  const [existingCustomers, setExistingCustomers] = useState<any[]>([]);
  const [selectedExistingCustomerId, setSelectedExistingCustomerId] = useState("");
  
  // Confirmation Dialog
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  const limit = 12;

  // Fetch Geographical Areas
  const fetchGas = useCallback(async () => {
    const res = await fetch("/api/gas");
    if (res.ok) {
      const data = await res.json();
      setGasList(data);
    }
  }, []);

  // Fetch Devices
  const fetchDevices = useCallback(async () => {
    const params = new URLSearchParams({
      page: page.toString(),
      limit: limit.toString(),
      search: search.trim(),
    });

    if (statusFilter !== "all") params.append("status", statusFilter);
    if (categoryFilter !== "all") params.append("category", categoryFilter);
    if (gaFilter !== "all") params.append("gaId", gaFilter);

    const res = await fetch(`/api/devices?${params}`);
    if (res.ok) {
      const data = await res.json();
      setDevices(data.items || []);
      setTotal(data.pagination.totalCount || 0);
    }
  }, [page, search, statusFilter, categoryFilter, gaFilter]);

  // Fetch Existing Customers
  const fetchExistingCustomers = useCallback(async () => {
    const res = await fetch("/api/customers?limit=1000");
    if (res.ok) {
      const data = await res.json();
      setExistingCustomers(data.data || []);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchGas();
    fetchExistingCustomers();
  }, [fetchGas, fetchExistingCustomers]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchDevices();
  }, [fetchDevices]);
  useAutoRefresh(fetchDevices);

  const totalPages = Math.ceil(total / limit) || 1;

  // Open Drawer Form for Provisioning
  const openProvisionDrawer = (device: DeviceItem) => {
    setSelectedDevice(device);
    setProvisionType("new");
    setSelectedExistingCustomerId("");
    setCustomerName("");
    setMeterIdInput(device.deviceSerialNo);
    setDeviceIdInput("");
    setSelectedCategory("RESIDENTIAL");
    setAddress("");
    setSelectedGaId(gasList[0]?.id || "");
    setFormError("");
    setDrawerOpen(true);
  };

  // Submit Provisioning Form
  const handleProvisionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDevice) return;

    if (provisionType === "new" && !customerName.trim()) {
      setFormError("Customer name is required.");
      return;
    }
    
    if (provisionType === "existing" && !selectedExistingCustomerId) {
      setFormError("Please select an existing customer.");
      return;
    }

    setFormError("");
    setShowConfirmDialog(true);
  };

  const confirmProvisioning = async () => {
    if (!selectedDevice) return;

    setSubmitting(true);
    setFormError("");
    setShowConfirmDialog(false);

    try {
      const bodyPayload: any = {
        provision: true,
        meterSerialNo: deviceIdInput || null
      };
      
      if (provisionType === "existing") {
        bodyPayload.existingCustomerId = selectedExistingCustomerId;
      } else {
        bodyPayload.customerName = customerName;
        bodyPayload.category = selectedCategory;
        bodyPayload.address = address;
        bodyPayload.gaId = selectedGaId;
      }

      const res = await fetch(`/api/devices/${selectedDevice.id}/assign`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bodyPayload),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Failed to provision device");
      }

      setDrawerOpen(false);
      fetchDevices();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "An error occurred during submission.";
      setFormError(message);
    } finally {
      setSubmitting(false);
    }
  };

  // Render Status Badge
  const renderStatus = (device: DeviceItem) => {
    switch (device.status) {
      case "NEW":
        return (
          <Badge
            onClick={() => openProvisionDrawer(device)}
            className="bg-sky-500/10 text-sky-500 border border-sky-500/25 hover:bg-sky-500 hover:text-white transition-all cursor-pointer font-bold select-none animate-pulse"
          >
            NEW
          </Badge>
        );
      case "ONLINE":
        return (
          <Badge className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 font-bold">
            <CheckCircle className="w-3 h-3 mr-1 animate-pulse" />
            ONLINE
          </Badge>
        );
      case "OFFLINE":
        return (
          <Badge className="bg-slate-500/10 text-slate-400 border border-slate-500/25 font-bold">
            <X className="w-3 h-3 mr-1" />
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
      default:
        return (
          <Badge className="bg-slate-500/10 text-slate-400 border border-slate-500/25">
            <HelpCircle className="w-3 h-3 mr-1" />
            UNKNOWN
          </Badge>
        );
    }
  };

  // Helper formatting function
  const fmt = (val: number | null | undefined, decimals = 2) => {
    if (val == null) return "—";
    return val.toLocaleString(undefined, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header and Toggle */}
      <div className="flex justify-between items-center border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">AMR Customer Registry</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Registered endpoints - Industrial, Commercial, Residential, and Bulk.
          </p>
        </div>
        <div className="flex space-x-2 bg-slate-100 dark:bg-slate-900 p-1.5 rounded-lg border border-slate-200 dark:border-slate-800">
          <Button
            variant={view === "grid" ? "default" : "ghost"}
            size="sm"
            onClick={() => setView("grid")}
            className="h-8 px-3 text-xs"
          >
            <LayoutGrid className="w-3.5 h-3.5 mr-1.5" />
            Grid View
          </Button>
          <Button
            variant={view === "list" ? "default" : "ghost"}
            size="sm"
            onClick={() => setView("list")}
            className="h-8 px-3 text-xs"
          >
            <List className="w-3.5 h-3.5 mr-1.5" />
            List View
          </Button>
        </div>
      </div>

      {/* Advanced Filter Controls Bar */}
      <Card className="bg-white dark:bg-slate-900/60 border-slate-200 dark:border-slate-800 p-4 flex flex-col md:flex-row items-center gap-4">
        {/* Search */}
        <div className="relative w-full md:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <Input
            placeholder="Search customer name or ID..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="pl-9 bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 placeholder:text-slate-500 focus:border-orange-500"
          />
        </div>

        {/* Filters */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 w-full md:w-auto md:ml-auto">
          {/* Geographical Area Filter */}
          <select
            className="h-9 px-3 py-1 rounded-md bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm text-slate-600 dark:text-slate-300 focus:outline-none focus:border-orange-500"
            value={gaFilter}
            onChange={(e) => { setGaFilter(e.target.value); setPage(1); }}
          >
            <option value="all">All Cities</option>
            {gasList.map((ga) => (
              <option key={ga.id} value={ga.id}>{ga.name}</option>
            ))}
          </select>

          {/* Status Filter */}
          <select
            className="h-9 px-3 py-1 rounded-md bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm text-slate-600 dark:text-slate-300 focus:outline-none focus:border-orange-500"
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          >
            <option value="all">All Statuses</option>
            <option value="NEW">New (Unprovisioned)</option>
            <option value="ONLINE">Online</option>
            <option value="OFFLINE">Offline</option>
            <option value="ALERT">Alert</option>
          </select>

          {/* Category Filter */}
          <select
            className="h-9 px-3 py-1 rounded-md bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm text-slate-600 dark:text-slate-300 focus:outline-none focus:border-orange-500"
            value={categoryFilter}
            onChange={(e) => { setCategoryFilter(e.target.value); setPage(1); }}
          >
            <option value="all">All Categories</option>
            <option value="INDUSTRIAL">Industrial</option>
            <option value="COMMERCIAL">Commercial</option>
            <option value="RESIDENTIAL">Residential</option>
            <option value="BULK">Bulk</option>
          </select>
        </div>
      </Card>

      {/* Grid View */}
      {view === "grid" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {devices.map((device) => (
            <Card
              key={device.id}
              className={`bg-white dark:bg-slate-900/60 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700/80 transition-all shadow-sm flex flex-col justify-between ${device.status === "NEW" ? "border-dashed border-sky-400/50 hover:border-sky-400" : ""
                }`}
            >
              <CardHeader className="pb-3">
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="text-base font-bold text-slate-800 dark:text-slate-100 truncate max-w-[200px]">
                      {device.customerName || <span className="text-slate-400 dark:text-slate-500 italic">Unassigned Endpoint</span>}
                    </CardTitle>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-mono select-all">
                      Meter ID: {device.deviceSerialNo}
                    </p>
                  </div>
                  {renderStatus(device)}
                </div>
                <div className="flex gap-2 mt-2">
                  <Badge variant="secondary" className="text-[10px] py-0 px-2 font-medium">
                    {device.category || "N/A"}
                  </Badge>
                  <Badge variant="outline" className="text-[10px] py-0 px-2">
                    {device.gaName || "No GA"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4 pt-0">
                {/* Metrics */}
                <div className="grid grid-cols-3 gap-2 bg-slate-50 dark:bg-slate-950/40 p-2.5 rounded-lg border border-slate-150 dark:border-slate-800/80">
                  <div className="text-center">
                    <span className="text-[10px] text-slate-500 uppercase tracking-wider block font-semibold">Flow</span>
                    <span className="font-mono text-xs font-bold text-orange-500 flex items-center justify-center gap-0.5 mt-0.5">
                      <Activity className="w-3 h-3" />
                      {fmt(device.latestReading?.currentFlowRate)}
                    </span>
                  </div>
                  <div className="text-center border-x border-slate-200 dark:border-slate-800">
                    <span className="text-[10px] text-slate-500 uppercase tracking-wider block font-semibold">Pressure</span>
                    <span className="font-mono text-xs font-bold text-blue-400 flex items-center justify-center gap-0.5 mt-0.5">
                      <Gauge className="w-3 h-3" />
                      {fmt(device.latestReading?.gasPressure)}
                    </span>
                  </div>
                  <div className="text-center">
                    <span className="text-[10px] text-slate-500 uppercase tracking-wider block font-semibold">Battery</span>
                    <span className="font-mono text-xs font-bold text-emerald-400 flex items-center justify-center gap-0.5 mt-0.5">
                      <Battery className="w-3 h-3" />
                      {device.latestReading?.batteryLevel != null ? `${Math.round(device.latestReading.batteryLevel)}%` : "—"}
                    </span>
                  </div>
                </div>

                <div className="text-xs text-slate-500 space-y-1.5">
                  <p className="truncate"><strong>Address:</strong> {device.address || "—"}</p>
                  <p className="truncate"><strong>Device ID:</strong> <span className="font-mono text-slate-400">{device.meterSerialNo || "—"}</span></p>
                  <p>
                    <strong>Last Updated:</strong>{" "}
                    {device.latestReading?.receivedAt 
                      ? formatLocalTs(device.latestReading.receivedAt) 
                      : (device.lastSeenAt ? formatLocalTs(device.lastSeenAt) : "No readings")}
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
          {devices.length === 0 && (
            <div className="col-span-full text-center text-slate-500 py-12">
              No registered endpoints matching the filter criteria.
            </div>
          )}
        </div>
      ) : (
        /* List View (Table) */
        <Card className="bg-white dark:bg-slate-900/60 border-slate-200 dark:border-slate-800 overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-slate-50 dark:bg-slate-950/80 border-b border-slate-200 dark:border-slate-800">
                <TableRow className="border-slate-200 dark:border-slate-800 hover:bg-transparent">
                  <TableHead className="text-slate-500 dark:text-slate-400 font-semibold">Customer Name</TableHead>
                  <TableHead className="text-slate-500 dark:text-slate-400 font-semibold">Meter ID</TableHead>
                  <TableHead className="text-slate-500 dark:text-slate-400 font-semibold">Device ID</TableHead>
                  <TableHead className="text-slate-500 dark:text-slate-400 font-semibold">Category</TableHead>
                  <TableHead className="text-slate-500 dark:text-slate-400 font-semibold">Address</TableHead>
                  <TableHead className="text-slate-500 dark:text-slate-400 font-semibold">Flow (SCMH)</TableHead>
                  <TableHead className="text-slate-500 dark:text-slate-400 font-semibold">Pressure</TableHead>
                  <TableHead className="text-slate-500 dark:text-slate-400 font-semibold">Battery</TableHead>
                  <TableHead className="text-slate-500 dark:text-slate-400 font-semibold">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {devices.map((device) => (
                  <TableRow key={device.id} className="border-slate-200 dark:border-slate-800 hover:bg-slate-100/40 dark:hover:bg-slate-800/40">
                    <TableCell className="font-semibold text-slate-850 dark:text-slate-200 py-3 max-w-[150px] truncate">
                      {device.customerName || <span className="text-slate-450 dark:text-slate-500 italic">Unassigned</span>}
                    </TableCell>
                    <TableCell className="font-mono text-sm text-slate-550 select-all">{device.deviceSerialNo}</TableCell>
                    <TableCell className="font-mono text-sm text-slate-550 select-all">{device.meterSerialNo || "—"}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px]">{device.category || "—"}</Badge>
                    </TableCell>
                    <TableCell className="text-sm text-slate-550 max-w-[180px] truncate">{device.address || "—"}</TableCell>
                    <TableCell className="font-mono text-sm font-semibold text-orange-500">
                      {fmt(device.latestReading?.currentFlowRate)}
                    </TableCell>
                    <TableCell className="font-mono text-sm font-semibold text-blue-400">
                      {device.latestReading?.gasPressure != null ? `${fmt(device.latestReading.gasPressure)} bar` : "—"}
                    </TableCell>
                    <TableCell className="font-mono text-sm font-semibold text-emerald-500">
                      {device.latestReading?.batteryLevel != null ? `${Math.round(device.latestReading.batteryLevel)}%` : "—"}
                    </TableCell>
                    <TableCell className="py-3">{renderStatus(device)}</TableCell>
                  </TableRow>
                ))}
                {devices.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-8 text-slate-500 text-sm">
                      No registered endpoints found.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center space-x-2 mt-6">
          <Button
            variant="outline"
            disabled={page === 1}
            onClick={() => setPage(p => Math.max(1, p - 1))}
            className="border-slate-205 dark:border-slate-800 bg-white dark:bg-slate-900"
          >
            Previous
          </Button>
          <span className="flex items-center px-4 text-sm text-slate-500 dark:text-slate-400">
            Page {page} of {totalPages}
          </span>
          <Button
            variant="outline"
            disabled={page === totalPages}
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            className="border-slate-205 dark:border-slate-800 bg-white dark:bg-slate-900"
          >
            Next
          </Button>
        </div>
      )}

      {/* Slide-out Sidebar Drawer Form (Sheet Alternative) */}
      {drawerOpen && selectedDevice && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm transition-all duration-300">
          {/* Backdrop click to close */}
          <div className="absolute inset-0" onClick={() => setDrawerOpen(false)} />

          <div className="relative w-full max-w-md h-full bg-slate-900 border-l border-slate-800 p-6 shadow-2xl flex flex-col justify-between overflow-y-auto transform transition-all duration-300 animate-in slide-in-from-right">
            <div>
              {/* Drawer Header */}
              <div className="flex justify-between items-center border-b border-slate-850 pb-4 mb-6">
                <div>
                  <h2 className="text-lg font-bold text-white flex items-center gap-2">
                    <PlusCircle className="w-5 h-5 text-sky-400" />
                    Provision Endpoint
                  </h2>
                  <p className="text-xs text-slate-400 mt-1">
                    Complete assignment for newly registered gas meter.
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setDrawerOpen(false)}
                  className="h-8 w-8 text-slate-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>

              {/* Form Error Alert */}
              {formError && (
                <div className="p-3 mb-4 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-semibold">
                  {formError}
                </div>
              )}

              {/* Drawer Form */}
              <form id="provision-form" onSubmit={handleProvisionSubmit} className="space-y-4">
                {/* Meter ID (Prefilled and Uneditable) */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Meter ID (Prefilled)</label>
                  <Input
                    value={meterIdInput}
                    readOnly
                    className="bg-slate-950 border-slate-800 text-slate-400 cursor-not-allowed font-mono text-sm"
                  />
                </div>

                {/* Device ID (Editable - maps to meterSerialNo) */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Device ID / Serial (Optional)</label>
                  <Input
                    placeholder="Enter Device ID or leave blank..."
                    value={deviceIdInput}
                    onChange={(e) => setDeviceIdInput(e.target.value)}
                    className="bg-slate-950 border-slate-800 text-white placeholder:text-slate-600 focus:border-orange-500 focus:ring-0 font-mono text-sm"
                  />
                </div>

                {/* Provision Type Toggle */}
                <div className="flex gap-2 p-1 bg-slate-950 rounded-lg border border-slate-800">
                  <Button 
                    type="button"
                    variant={provisionType === "new" ? "default" : "ghost"} 
                    className={`flex-1 h-8 text-xs ${provisionType === "new" ? "bg-slate-800 text-white hover:bg-slate-700" : "text-slate-400 hover:text-white"}`}
                    onClick={() => setProvisionType("new")}
                  >
                    New Customer
                  </Button>
                  <Button 
                    type="button"
                    variant={provisionType === "existing" ? "default" : "ghost"} 
                    className={`flex-1 h-8 text-xs ${provisionType === "existing" ? "bg-slate-800 text-white hover:bg-slate-700" : "text-slate-400 hover:text-white"}`}
                    onClick={() => setProvisionType("existing")}
                  >
                    Existing Customer
                  </Button>
                </div>

                {provisionType === "existing" ? (
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Select Existing Customer</label>
                    <select
                      className="w-full flex h-9 rounded-md border border-slate-800 bg-slate-950 px-3 py-1 text-sm shadow-sm transition-colors text-white focus:outline-none focus:border-orange-500"
                      value={selectedExistingCustomerId}
                      onChange={(e) => setSelectedExistingCustomerId(e.target.value)}
                      required
                    >
                      <option value="" disabled>Select a customer...</option>
                      {existingCustomers.map((c) => (
                        <option key={c.id} value={c.id}>{c.name} ({c.category})</option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <>
                    {/* Customer Name */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Customer Name</label>
                      <Input
                        placeholder="Enter customer name..."
                        value={customerName}
                        onChange={(e) => setCustomerName(e.target.value)}
                        required={provisionType === "new"}
                        className="bg-slate-950 border-slate-800 text-white placeholder:text-slate-600 focus:border-orange-500 focus:ring-0 text-sm"
                      />
                    </div>

                    {/* Category Dropdown */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Category</label>
                      <select
                        className="w-full flex h-9 rounded-md border border-slate-800 bg-slate-950 px-3 py-1 text-sm shadow-sm transition-colors text-white focus:outline-none focus:border-orange-500"
                        value={selectedCategory}
                        onChange={(e) => setSelectedCategory(e.target.value)}
                      >
                        <option value="RESIDENTIAL">Residential</option>
                        <option value="COMMERCIAL">Commercial</option>
                        <option value="INDUSTRIAL">Industrial</option>
                      </select>
                    </div>

                    {/* Geographical Area Dropdown */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Geographical Area (City)</label>
                      <select
                        className="w-full flex h-9 rounded-md border border-slate-800 bg-slate-950 px-3 py-1 text-sm shadow-sm transition-colors text-white focus:outline-none focus:border-orange-500"
                        value={selectedGaId}
                        onChange={(e) => setSelectedGaId(e.target.value)}
                        required={provisionType === "new"}
                      >
                        <option value="" disabled>Select a city</option>
                        {gasList.map((ga) => (
                          <option key={ga.id} value={ga.id}>{ga.name}</option>
                        ))}
                      </select>
                    </div>

                    {/* Address */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Address</label>
                      <Input
                        placeholder="Enter address..."
                        value={address}
                        onChange={(e) => setAddress(e.target.value)}
                        className="bg-slate-950 border-slate-800 text-white placeholder:text-slate-600 focus:border-orange-500 focus:ring-0 text-sm"
                      />
                    </div>
                  </>
                )}
              </form>
            </div>

            {/* Drawer Footer Actions */}
            <div className="border-t border-slate-850 pt-4 mt-6 flex gap-3">
              <Button
                variant="outline"
                onClick={() => setDrawerOpen(false)}
                className="flex-1 border-slate-800 bg-transparent text-slate-300 hover:bg-slate-800 hover:text-white"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                form="provision-form"
                disabled={submitting}
                className="flex-1 bg-sky-600 hover:bg-sky-500 text-white"
              >
                {submitting ? "Saving..." : "Submit"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Dialog */}
      {showConfirmDialog && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 max-w-sm w-full mx-4 shadow-2xl animate-in zoom-in-95">
            <h3 className="text-lg font-bold text-white mb-2">Confirm Provisioning</h3>
            <p className="text-sm text-slate-400 mb-6">
              Are you sure you want to assign meter <span className="font-mono text-white">{selectedDevice?.deviceSerialNo}</span> to 
              {provisionType === "new" ? " a new customer" : " the selected customer"}?
            </p>
            <div className="flex gap-3">
              <Button 
                variant="outline" 
                onClick={() => setShowConfirmDialog(false)}
                className="flex-1 border-slate-800 bg-transparent text-slate-300 hover:bg-slate-800 hover:text-white"
              >
                Cancel
              </Button>
              <Button 
                onClick={confirmProvisioning}
                className="flex-1 bg-sky-600 hover:bg-sky-500 text-white"
              >
                Confirm
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
