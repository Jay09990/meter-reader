"use client";

import { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function AdminPage() {
  const [gas, setGas] = useState<import("@prisma/client").GeographicalArea[]>([]);
  const [customers, setCustomers] = useState<import("@prisma/client").Customer[]>([]);
  
  const [gaName, setGaName] = useState("");
  const [gaCode, setGaCode] = useState("");
  
  const [customerName, setCustomerName] = useState("");
  const [customerCategory, setCustomerCategory] = useState("INDUSTRIAL");
  const [customerAddress, setCustomerAddress] = useState("");
  const [customerGaId, setCustomerGaId] = useState("");

  const [deviceId, setDeviceId] = useState("");
  const [assignCustomerId, setAssignCustomerId] = useState("");
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [pressureUpperLimit, setPressureUpperLimit] = useState("");
  const [pressureLowerLimit, setPressureLowerLimit] = useState("");
  const [temperatureUpperLimit, setTemperatureUpperLimit] = useState("");
  const [temperatureLowerLimit, setTemperatureLowerLimit] = useState("");
  const [consumptionUpperLimit, setConsumptionUpperLimit] = useState("");
  const [consumptionLowerLimit, setConsumptionLowerLimit] = useState("");
  const [batteryLowerLimit, setBatteryLowerLimit] = useState("");

  const fetchGas = async () => {
    const res = await fetch("/api/gas");
    if (res.ok) setGas(await res.json());
  };

  const fetchCustomers = async () => {
    const res = await fetch("/api/customers?limit=1000"); // hack for v1 dropdowns
    if (res.ok) {
      const data = await res.json();
      setCustomers(data.data);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchGas();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchCustomers();
  }, []);

  const createGa = async (e: React.FormEvent) => {
    e.preventDefault();
    await fetch("/api/gas", {
      method: "POST",
      body: JSON.stringify({ name: gaName, code: gaCode }),
    });
    setGaName("");
    setGaCode("");
    fetchGas();
  };

  const createCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    await fetch("/api/customers", {
      method: "POST",
      body: JSON.stringify({
        name: customerName,
        category: customerCategory,
        address: customerAddress,
        gaId: customerGaId,
      }),
    });
    setCustomerName("");
    setCustomerAddress("");
    fetchCustomers();
  };

  const assignDevice = async (e: React.FormEvent) => {
    e.preventDefault();
    await fetch(`/api/devices/${deviceId}/assign`, {
      method: "PATCH",
      body: JSON.stringify({
        customerId: assignCustomerId || null,
        latitude: latitude ? parseFloat(latitude) : undefined,
        longitude: longitude ? parseFloat(longitude) : undefined,
        pressureUpperLimit: pressureUpperLimit ? parseFloat(pressureUpperLimit) : null,
        pressureLowerLimit: pressureLowerLimit ? parseFloat(pressureLowerLimit) : null,
        temperatureUpperLimit: temperatureUpperLimit ? parseFloat(temperatureUpperLimit) : null,
        temperatureLowerLimit: temperatureLowerLimit ? parseFloat(temperatureLowerLimit) : null,
        consumptionUpperLimit: consumptionUpperLimit ? parseFloat(consumptionUpperLimit) : null,
        consumptionLowerLimit: consumptionLowerLimit ? parseFloat(consumptionLowerLimit) : null,
        batteryLowerLimit: batteryLowerLimit ? parseFloat(batteryLowerLimit) : null,
      }),
    });
    setDeviceId("");
    setLatitude("");
    setLongitude("");
    setPressureUpperLimit("");
    setPressureLowerLimit("");
    setTemperatureUpperLimit("");
    setTemperatureLowerLimit("");
    setConsumptionUpperLimit("");
    setConsumptionLowerLimit("");
    setBatteryLowerLimit("");
  };

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">Admin / Provisioning</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* GA Form */}
        <Card>
          <CardHeader>
            <CardTitle>Create GA</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={createGa} className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">GA Name</label>
                <Input value={gaName} onChange={e => setGaName(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">GA Code (Optional)</label>
                <Input value={gaCode} onChange={e => setGaCode(e.target.value)} />
              </div>
              <Button type="submit">Create GA</Button>
            </form>
          </CardContent>
        </Card>

        {/* Customer Form */}
        <Card>
          <CardHeader>
            <CardTitle>Create Customer</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={createCustomer} className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Customer Name</label>
                <Input value={customerName} onChange={e => setCustomerName(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Category</label>
                <select 
                  className="w-full flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  value={customerCategory} 
                  onChange={e => setCustomerCategory(e.target.value)}
                >
                  <option value="INDUSTRIAL">Industrial</option>
                  <option value="COMMERCIAL">Commercial</option>
                  <option value="RESIDENTIAL">Residential</option>
                  <option value="DRS">DRS</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Address</label>
                <Input value={customerAddress} onChange={e => setCustomerAddress(e.target.value)} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Geographical Area</label>
                <select 
                  className="w-full flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  value={customerGaId} 
                  onChange={e => setCustomerGaId(e.target.value)}
                  required
                >
                  <option value="">Select GA...</option>
                  {gas.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
              </div>
              <Button type="submit">Create Customer</Button>
            </form>
          </CardContent>
        </Card>

        {/* Device Assign Form */}
        <Card>
          <CardHeader>
            <CardTitle>Assign Device</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={assignDevice} className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Device ID</label>
                <Input value={deviceId} onChange={e => setDeviceId(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Customer</label>
                <select 
                  className="w-full flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  value={assignCustomerId} 
                  onChange={e => setAssignCustomerId(e.target.value)}
                >
                  <option value="">None (Unassign)</option>
                  {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Latitude</label>
                <Input type="number" step="any" value={latitude} onChange={e => setLatitude(e.target.value)} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Longitude</label>
                <Input type="number" step="any" value={longitude} onChange={e => setLongitude(e.target.value)} />
              </div>
              <div className="pt-3 border-t border-border">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Threshold Setpoints</p>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Battery Lower Limit (%)</label>
                  <Input type="number" min="0" max="100" step="1" value={batteryLowerLimit} onChange={e => setBatteryLowerLimit(e.target.value)} placeholder="e.g. 25" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Pressure Upper (bar)</label>
                    <Input type="number" step="any" value={pressureUpperLimit} onChange={e => setPressureUpperLimit(e.target.value)} placeholder="Upper" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Pressure Lower (bar)</label>
                    <Input type="number" step="any" value={pressureLowerLimit} onChange={e => setPressureLowerLimit(e.target.value)} placeholder="Lower" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Temp Upper (°C)</label>
                    <Input type="number" step="any" value={temperatureUpperLimit} onChange={e => setTemperatureUpperLimit(e.target.value)} placeholder="Upper" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Temp Lower (°C)</label>
                    <Input type="number" step="any" value={temperatureLowerLimit} onChange={e => setTemperatureLowerLimit(e.target.value)} placeholder="Lower" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Consumption Upper (Sm³)</label>
                    <Input type="number" step="any" value={consumptionUpperLimit} onChange={e => setConsumptionUpperLimit(e.target.value)} placeholder="Upper" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Consumption Lower (Sm³)</label>
                    <Input type="number" step="any" value={consumptionLowerLimit} onChange={e => setConsumptionLowerLimit(e.target.value)} placeholder="Lower" />
                  </div>
                </div>
              </div>
              <Button type="submit">Assign Device</Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
