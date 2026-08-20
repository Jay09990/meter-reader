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
  HelpCircle,
  Pencil,
} from "lucide-react";

import { useAutoRefresh } from "@/lib/auto-refresh";
import { formatLocalTs, formatLocalDate } from "@/lib/utils";

// Customer registry for filtering, viewing, and provisioning AMR endpoints.
interface DeviceItem {
  id: string;
  deviceSerialNo: string;
  meterSerialNo: string | null;
  meterSize: string | null;
  customerId: string | null;
  customerName: string | null;
  category: string | null;
  address: string | null;
  gaName: string | null;
  gaId: string | null;
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

interface ExistingCustomer {
  id: string;
  name: string;
  category: string;
}

function ThresholdInput({ label, value, onChange, step = "0.01", min, max }: { label: string; value: string; onChange: (value: string) => void; step?: string; min?: string; max?: string }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs text-muted-foreground">{label}</label>
      <Input type="number" step={step} min={min} max={max} value={value} onChange={(event) => onChange(event.target.value)} placeholder="Optional" className="bg-muted border-border text-foreground focus:border-[color:var(--clr-accent-hi)]" />
    </div>
  );
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
  const [latitudeInput, setLatitudeInput] = useState("");
  const [longitudeInput, setLongitudeInput] = useState("");
  const [pressureUpper, setPressureUpper] = useState("");
  const [pressureLower, setPressureLower] = useState("");
  const [temperatureUpper, setTemperatureUpper] = useState("");
  const [temperatureLower, setTemperatureLower] = useState("");
  const [consumptionUpper, setConsumptionUpper] = useState("");
  const [consumptionLower, setConsumptionLower] = useState("");
  const [batteryLower, setBatteryLower] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  // Provisioning Type
  const [provisionType, setProvisionType] = useState<"new" | "existing">("new");
  const [existingCustomers, setExistingCustomers] = useState<ExistingCustomer[]>([]);
  const [selectedExistingCustomerId, setSelectedExistingCustomerId] = useState("");
  
  // Confirmation Dialog
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<DeviceItem | null>(null);
  const [editCustomerName, setEditCustomerName] = useState("");
  const [editCategory, setEditCategory] = useState("RESIDENTIAL");
  const [editAddress, setEditAddress] = useState("");
  const [editGaId, setEditGaId] = useState("");
  const [editError, setEditError] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

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

  const openCustomerEditor = (device: DeviceItem) => {
    if (!device.customerId) return;
    setEditingCustomer(device);
    setEditCustomerName(device.customerName ?? "");
    setEditCategory(device.category ?? "RESIDENTIAL");
    setEditAddress(device.address ?? "");
    setEditGaId(device.gaId ?? "");
    setEditError("");
  };

  const saveCustomerEdit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editingCustomer?.customerId || !editCustomerName.trim() || !editGaId) {
      setEditError("Customer name and geographical area are required.");
      return;
    }
    setSavingEdit(true);
    setEditError("");
    try {
      const response = await fetch(`/api/customers/${editingCustomer.customerId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editCustomerName.trim(), category: editCategory, address: editAddress.trim() || null, gaId: editGaId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Failed to update customer");
      setEditingCustomer(null);
      fetchDevices();
    } catch (error) {
      setEditError(error instanceof Error ? error.message : "Failed to update customer");
    } finally {
      setSavingEdit(false);
    }
  };

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
    setLatitudeInput("");
    setLongitudeInput("");
    setPressureUpper("");
    setPressureLower("");
    setTemperatureUpper("");
    setTemperatureLower("");
    setConsumptionUpper("");
    setConsumptionLower("");
    setBatteryLower("");
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

    if (!latitudeInput.trim() || !longitudeInput.trim()) {
      setFormError("Latitude and longitude are required for provisioning.");
      return;
    }
    const latitude = Number(latitudeInput);
    const longitude = Number(longitudeInput);
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
      setFormError("Latitude must be a number between -90 and 90.");
      return;
    }
    if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      setFormError("Longitude must be a number between -180 and 180.");
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
      const bodyPayload: Record<string, unknown> = {
        provision: true,
        meterSerialNo: deviceIdInput || null,
        latitude: latitudeInput.trim(),
        longitude: longitudeInput.trim(),
        pressureUpperLimit: pressureUpper,
        pressureLowerLimit: pressureLower,
        temperatureUpperLimit: temperatureUpper,
        temperatureLowerLimit: temperatureLower,
        consumptionUpperLimit: consumptionUpper,
        consumptionLowerLimit: consumptionLower,
        batteryLowerLimit: batteryLower,
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
            className="bg-[color:var(--clr-new)]/10 text-[color:var(--clr-new)] border border-[color:var(--clr-new)]/25 hover:bg-[color:var(--clr-new)] hover:text-[color:var(--sidebar-primary-foreground)] transition-all cursor-pointer font-bold select-none animate-pulse"
          >
            NEW
          </Badge>
        );
      case "ONLINE":
        return (
          <Badge className="bg-[color:var(--clr-online)]/10 text-[color:var(--clr-online)] border border-[color:var(--clr-online)]/25 font-bold">
            <CheckCircle className="w-3 h-3 mr-1 animate-pulse" />
            ONLINE
          </Badge>
        );
      case "OFFLINE":
        return (
          <Badge className="bg-[color:var(--clr-offline)]/10 text-[color:var(--clr-offline)] border border-[color:var(--clr-offline)]/25 font-bold">
            <X className="w-3 h-3 mr-1" />
            OFFLINE
          </Badge>
        );
      case "ALERT":
        return (
          <Badge className="bg-[color:var(--clr-alert)]/10 text-[color:var(--clr-alert)] border border-[color:var(--clr-alert)]/25 font-bold">
            <AlertTriangle className="w-3 h-3 mr-1 animate-bounce" />
            ALERT
          </Badge>
        );
      default:
        return (
          <Badge className="bg-[color:var(--clr-offline)]/10 text-[color:var(--clr-offline)] border border-[color:var(--clr-offline)]/25">
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
    <div className="space-y-6 w-full">
      {/* Header and Toggle */}
      <div className="flex justify-between items-center border-b border-border pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">AMR Customer Registry</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Registered endpoints - Industrial, Commercial, Residential, and Bulk.
          </p>
        </div>
        <div className="flex space-x-2 bg-secondary p-1.5 rounded-lg border border-border">
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
      <Card className="bg-card border-border p-4 flex flex-col md:flex-row items-center gap-4">
        {/* Search */}
        <div className="relative w-full md:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search customer name or ID..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="pl-9 bg-background border-border text-foreground placeholder:text-muted-foreground focus:border-[color:var(--clr-accent-hi)]"
          />
        </div>

        {/* Filters */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 w-full md:w-auto md:ml-auto">
          {/* Geographical Area Filter */}
          <select
            className="h-9 px-3 py-1 rounded-md bg-background border border-border text-sm text-foreground focus:outline-none focus:border-[color:var(--clr-accent-hi)]"
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
            className="h-9 px-3 py-1 rounded-md bg-background border border-border text-sm text-foreground focus:outline-none focus:border-[color:var(--clr-accent-hi)]"
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
            className="h-9 px-3 py-1 rounded-md bg-background border border-border text-sm text-foreground focus:outline-none focus:border-[color:var(--clr-accent-hi)]"
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
              className={`bg-card border-border hover:border-[color:var(--clr-accent-mid)] transition-all shadow-sm flex flex-col justify-between ${device.status === "NEW" ? "border-dashed border-[color:var(--clr-new)]/50 hover:border-[color:var(--clr-new)]" : ""
                }`}
            >
              <CardHeader className="pb-3">
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="text-base font-bold text-card-foreground truncate max-w-[200px]">
                      {device.customerName || <span className="text-muted-foreground italic">Unassigned Endpoint</span>}
                    </CardTitle>
                    <p className="text-xs text-muted-foreground mt-0.5 font-mono select-all">
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
                <div className="grid grid-cols-3 gap-2 bg-muted p-2.5 rounded-lg border border-border">
                  <div className="text-center">
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wider block font-semibold">Flow</span>
                    <span className="font-mono text-xs font-bold text-[color:var(--clr-accent-hi)] flex items-center justify-center gap-0.5 mt-0.5">
                      <Activity className="w-3 h-3" />
                      {fmt(device.latestReading?.currentFlowRate)}
                    </span>
                  </div>
                  <div className="text-center border-x border-border">
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wider block font-semibold">Pressure</span>
                    <span className="font-mono text-xs font-bold text-[color:var(--clr-commercial)] flex items-center justify-center gap-0.5 mt-0.5">
                      <Gauge className="w-3 h-3" />
                      {fmt(device.latestReading?.gasPressure)}
                    </span>
                  </div>
                  <div className="text-center">
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wider block font-semibold">Battery</span>
                    <span className="font-mono text-xs font-bold text-[color:var(--clr-online)] flex items-center justify-center gap-0.5 mt-0.5">
                      <Battery className="w-3 h-3" />
                      {device.latestReading?.batteryLevel != null ? `${Math.round(device.latestReading.batteryLevel)}%` : "—"}
                    </span>
                  </div>
                </div>

                <div className="text-xs text-muted-foreground space-y-1.5">
                  <p className="truncate"><strong>Address:</strong> {device.address || "—"}</p>
                  <p className="truncate"><strong>Device ID:</strong> <span className="font-mono text-muted-foreground">{device.meterSerialNo || "—"}</span></p>
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
            <div className="col-span-full text-center text-muted-foreground py-12">
              No registered endpoints matching the filter criteria.
            </div>
          )}
        </div>
      ) : (
        /* List View (Table) */
        <Card className="bg-card border-border overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-muted border-b border-border">
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead className="text-muted-foreground font-semibold">Customer Name</TableHead>
                  <TableHead className="text-muted-foreground font-semibold">Meter ID</TableHead>
                  <TableHead className="text-muted-foreground font-semibold">Device ID</TableHead>
                  <TableHead className="text-muted-foreground font-semibold">Category</TableHead>
                  <TableHead className="text-muted-foreground font-semibold">Address</TableHead>
                  <TableHead className="text-muted-foreground font-semibold">Flow (SCMH)</TableHead>
                  <TableHead className="text-muted-foreground font-semibold">Pressure</TableHead>
                  <TableHead className="text-muted-foreground font-semibold">Battery</TableHead>
                  <TableHead className="text-muted-foreground font-semibold">Status</TableHead>
                  <TableHead className="text-right text-muted-foreground font-semibold">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {devices.map((device) => (
                  <TableRow key={device.id} className="border-border hover:bg-muted/60">
                    <TableCell className="font-semibold text-foreground py-3 max-w-[150px] truncate">
                      {device.customerName || <span className="text-muted-foreground italic">Unassigned</span>}
                    </TableCell>
                    <TableCell className="font-mono text-sm text-muted-foreground select-all">{device.deviceSerialNo}</TableCell>
                    <TableCell className="font-mono text-sm text-muted-foreground select-all">{device.meterSerialNo || "—"}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px]">{device.category || "—"}</Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-[180px] truncate">{device.address || "—"}</TableCell>
                    <TableCell className="font-mono text-sm font-semibold text-[color:var(--clr-accent-hi)]">
                      {fmt(device.latestReading?.currentFlowRate)}
                    </TableCell>
                    <TableCell className="font-mono text-sm font-semibold text-[color:var(--clr-commercial)]">
                      {device.latestReading?.gasPressure != null ? `${fmt(device.latestReading.gasPressure)} bar` : "—"}
                    </TableCell>
                    <TableCell className="font-mono text-sm font-semibold text-[color:var(--clr-online)]">
                      {device.latestReading?.batteryLevel != null ? `${Math.round(device.latestReading.batteryLevel)}%` : "—"}
                    </TableCell>
                    <TableCell className="py-3">{renderStatus(device)}</TableCell>
                    <TableCell className="py-3 text-right">
                      {device.customerId && (
                        <Button type="button" variant="ghost" size="sm" onClick={() => openCustomerEditor(device)} className="text-muted-foreground hover:text-foreground">
                          <Pencil className="mr-1 h-3.5 w-3.5" />
                          Edit
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {devices.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center py-8 text-muted-foreground text-sm">
                      No registered endpoints found.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      {editingCustomer && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <Card className="w-full max-w-lg bg-background shadow-2xl">
            <CardHeader>
              <CardTitle>Edit Customer Information</CardTitle>
              <p className="text-xs text-muted-foreground">Updates apply to every meter assigned to this customer.</p>
            </CardHeader>
            <CardContent>
              <form onSubmit={saveCustomerEdit} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Customer Name</label>
                  <Input value={editCustomerName} onChange={(event) => setEditCustomerName(event.target.value)} required />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Category</label>
                    <select value={editCategory} onChange={(event) => setEditCategory(event.target.value)} className="flex h-9 w-full rounded-md border border-border bg-muted px-3 text-sm text-foreground">
                      <option value="RESIDENTIAL">Residential</option>
                      <option value="COMMERCIAL">Commercial</option>
                      <option value="INDUSTRIAL">Industrial</option>
                      <option value="BULK">Bulk</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Geographical Area</label>
                    <select value={editGaId} onChange={(event) => setEditGaId(event.target.value)} required className="flex h-9 w-full rounded-md border border-border bg-muted px-3 text-sm text-foreground">
                      <option value="" disabled>Select a city</option>
                      {gasList.map((area) => <option key={area.id} value={area.id}>{area.name}</option>)}
                    </select>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Address</label>
                  <Input value={editAddress} onChange={(event) => setEditAddress(event.target.value)} />
                </div>
                {editError && <p className="text-sm" style={{ color: "var(--clr-alert)" }}>{editError}</p>}
                <div className="flex justify-end gap-3 pt-2">
                  <Button type="button" variant="outline" onClick={() => setEditingCustomer(null)}>Cancel</Button>
                  <Button type="submit" disabled={savingEdit}>{savingEdit ? "Saving…" : "Save Changes"}</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center space-x-2 mt-6">
          <Button
            variant="outline"
            disabled={page === 1}
            onClick={() => setPage(p => Math.max(1, p - 1))}
            className="border-border bg-secondary"
          >
            Previous
          </Button>
          <span className="flex items-center px-4 text-sm text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          <Button
            variant="outline"
            disabled={page === totalPages}
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            className="border-border bg-secondary"
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

          <div className="relative w-full max-w-md h-full bg-background border-l border-border p-6 shadow-2xl flex flex-col justify-between overflow-y-auto transform transition-all duration-300 animate-in slide-in-from-right">
            <div>
              {/* Drawer Header */}
              <div className="flex justify-between items-center border-b border-border pb-4 mb-6">
                <div>
                  <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                    <PlusCircle className="w-5 h-5 text-[color:var(--clr-accent-hi)]" />
                    Provision Endpoint
                  </h2>
                  <p className="text-xs text-muted-foreground mt-1">
                    Complete assignment for newly registered gas meter.
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setDrawerOpen(false)}
                  className="h-8 w-8 text-muted-foreground hover:text-foreground"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>

              {/* Form Error Alert */}
              {formError && (
                <div className="p-3 mb-4 rounded-lg bg-[color:var(--clr-alert)]/10 border border-[color:var(--clr-alert)]/20 text-[color:var(--clr-alert)] text-xs font-semibold">
                  {formError}
                </div>
              )}

              {/* Drawer Form */}
              <form id="provision-form" onSubmit={handleProvisionSubmit} className="space-y-4">
                {/* Meter ID (Prefilled and Uneditable) */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Meter ID (Prefilled)</label>
                  <Input
                    value={meterIdInput}
                    readOnly
                    className="bg-muted border-border text-muted-foreground cursor-not-allowed font-mono text-sm"
                  />
                </div>

                {/* Device ID (Editable - maps to meterSerialNo) */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Device ID / Serial (Optional)</label>
                  <Input
                    placeholder="Enter Device ID or leave blank..."
                    value={deviceIdInput}
                    onChange={(e) => setDeviceIdInput(e.target.value)}
                    className="bg-muted border-border text-foreground placeholder:text-muted-foreground focus:border-[color:var(--clr-accent-hi)] focus:ring-0 font-mono text-sm"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Latitude</label>
                    <Input type="number" step="0.000001" placeholder="e.g. 18.5204" value={latitudeInput} onChange={(event) => setLatitudeInput(event.target.value)} required className="bg-muted border-border text-foreground placeholder:text-muted-foreground focus:border-[color:var(--clr-accent-hi)] focus:ring-0 font-mono text-sm" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Longitude</label>
                    <Input type="number" step="0.000001" placeholder="e.g. 73.8567" value={longitudeInput} onChange={(event) => setLongitudeInput(event.target.value)} required className="bg-muted border-border text-foreground placeholder:text-muted-foreground focus:border-[color:var(--clr-accent-hi)] focus:ring-0 font-mono text-sm" />
                  </div>
                </div>
                <p className="-mt-2 text-[11px] text-muted-foreground">Required so this meter appears on the Map page.</p>

                {/* Provision Type Toggle */}
                <div className="flex gap-2 p-1 bg-muted rounded-lg border border-border">
                  <Button 
                    type="button"
                    variant={provisionType === "new" ? "default" : "ghost"} 
                    className={`flex-1 h-8 text-xs ${provisionType === "new" ? "bg-[color:var(--clr-accent-hi)] text-[color:var(--accent-foreground)] hover:bg-[color:var(--clr-accent-hi)]" : "text-muted-foreground hover:text-foreground"}`}
                    onClick={() => setProvisionType("new")}
                  >
                    New Customer
                  </Button>
                  <Button 
                    type="button"
                    variant={provisionType === "existing" ? "default" : "ghost"} 
                    className={`flex-1 h-8 text-xs ${provisionType === "existing" ? "bg-[color:var(--clr-accent-hi)] text-[color:var(--accent-foreground)] hover:bg-[color:var(--clr-accent-hi)]" : "text-muted-foreground hover:text-foreground"}`}
                    onClick={() => setProvisionType("existing")}
                  >
                    Existing Customer
                  </Button>
                </div>

                {provisionType === "existing" ? (
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Select Existing Customer</label>
                    <select
                      className="w-full flex h-9 rounded-md border border-border bg-muted px-3 py-1 text-sm shadow-sm transition-colors text-foreground focus:outline-none focus:border-[color:var(--clr-accent-hi)]"
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
                      <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Customer Name</label>
                      <Input
                        placeholder="Enter customer name..."
                        value={customerName}
                        onChange={(e) => setCustomerName(e.target.value)}
                        required={provisionType === "new"}
                        className="bg-muted border-border text-foreground placeholder:text-muted-foreground focus:border-[color:var(--clr-accent-hi)] focus:ring-0 text-sm"
                      />
                    </div>

                    {/* Category Dropdown */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Category</label>
                      <select
                        className="w-full flex h-9 rounded-md border border-border bg-muted px-3 py-1 text-sm shadow-sm transition-colors text-foreground focus:outline-none focus:border-[color:var(--clr-accent-hi)]"
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
                      <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Geographical Area (City)</label>
                      <select
                        className="w-full flex h-9 rounded-md border border-border bg-muted px-3 py-1 text-sm shadow-sm transition-colors text-foreground focus:outline-none focus:border-[color:var(--clr-accent-hi)]"
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
                      <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Address</label>
                      <Input
                        placeholder="Enter address..."
                        value={address}
                        onChange={(e) => setAddress(e.target.value)}
                        className="bg-muted border-border text-foreground placeholder:text-muted-foreground focus:border-[color:var(--clr-accent-hi)] focus:ring-0 text-sm"
                      />
                    </div>
                  </>
                )}

                <Card className="bg-muted/40 border-border">
                  <CardHeader className="pb-2"><CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Pressure Threshold (bar)</CardTitle></CardHeader>
                  <CardContent className="grid grid-cols-2 gap-3"><ThresholdInput label="Upper Limit" value={pressureUpper} onChange={setPressureUpper} /><ThresholdInput label="Lower Limit" value={pressureLower} onChange={setPressureLower} /></CardContent>
                </Card>
                <Card className="bg-muted/40 border-border">
                  <CardHeader className="pb-2"><CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Temperature Threshold (°C)</CardTitle></CardHeader>
                  <CardContent className="grid grid-cols-2 gap-3"><ThresholdInput label="Upper Limit" value={temperatureUpper} onChange={setTemperatureUpper} /><ThresholdInput label="Lower Limit" value={temperatureLower} onChange={setTemperatureLower} /></CardContent>
                </Card>
                <Card className="bg-muted/40 border-border">
                  <CardHeader className="pb-2"><CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Consumption Threshold (Sm³)</CardTitle></CardHeader>
                  <CardContent className="grid grid-cols-2 gap-3"><ThresholdInput label="Upper Limit" value={consumptionUpper} onChange={setConsumptionUpper} /><ThresholdInput label="Lower Limit" value={consumptionLower} onChange={setConsumptionLower} /></CardContent>
                </Card>
                <Card className="bg-muted/40 border-border">
                  <CardHeader className="pb-2"><CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Battery Threshold (%)</CardTitle></CardHeader>
                  <CardContent><ThresholdInput label="Lower Limit" value={batteryLower} onChange={setBatteryLower} step="1" min="0" max="100" /></CardContent>
                </Card>
              </form>
            </div>

            {/* Drawer Footer Actions */}
            <div className="border-t border-border pt-4 mt-6 flex gap-3">
              <Button
                variant="outline"
                onClick={() => setDrawerOpen(false)}
                className="flex-1 border-border bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                form="provision-form"
                disabled={submitting}
                className="flex-1 bg-[color:var(--clr-accent-hi)] hover:bg-[color:var(--clr-accent-hi)] text-[color:var(--accent-foreground)]"
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
          <div className="bg-background border border-border rounded-xl p-6 max-w-sm w-full mx-4 shadow-2xl animate-in zoom-in-95">
            <h3 className="text-lg font-bold text-foreground mb-2">Confirm Provisioning</h3>
            <p className="text-sm text-muted-foreground mb-6">
              Are you sure you want to assign meter <span className="font-mono text-foreground">{selectedDevice?.deviceSerialNo}</span> to 
              {provisionType === "new" ? " a new customer" : " the selected customer"}?
            </p>
            <div className="flex gap-3">
              <Button 
                variant="outline" 
                onClick={() => setShowConfirmDialog(false)}
                className="flex-1 border-border bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                Cancel
              </Button>
              <Button 
                onClick={confirmProvisioning}
                className="flex-1 bg-[color:var(--clr-accent-hi)] hover:bg-[color:var(--clr-accent-hi)] text-[color:var(--accent-foreground)]"
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
