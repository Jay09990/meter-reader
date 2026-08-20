"use client";

import { useEffect, useState } from "react";
import { Settings, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

// Manages the deployment-wide meter capacity; a blank value leaves capacity unlimited.
export default function SettingsPage() {
  const [capacity, setCapacity] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // GA creation state
  const [gas, setGas] = useState<import("@prisma/client").GeographicalArea[]>([]);
  const [gaName, setGaName] = useState("");
  const [gaCode, setGaCode] = useState("");
  const [creatingGa, setCreatingGa] = useState(false);
  const [gaMessage, setGaMessage] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/system/settings")
      .then((res) => res.json())
      .then((data) => setCapacity(data.maxMeterCapacity?.toString() ?? ""))
      .catch(() => setMessage("Unable to load system settings."));

    fetch("/api/gas")
      .then((res) => res.json())
      .then((data) => setGas(data))
      .catch(() => setGaMessage("Unable to load geographical areas."));
  }, []);

  const saveSettings = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    const response = await fetch("/api/system/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ maxMeterCapacity: capacity === "" ? null : Number(capacity) }),
    });
    const data = await response.json();
    setSaving(false);
    setMessage(response.ok ? "Settings saved." : data.error ?? "Unable to save settings.");
  };

  const createGa = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!gaName.trim()) return;
    setCreatingGa(true);
    setGaMessage(null);
    const response = await fetch("/api/gas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: gaName, code: gaCode || null }),
    });
    const data = await response.json();
    setCreatingGa(false);
    if (response.ok) {
      setGaName("");
      setGaCode("");
      setGaMessage("Geographical area created.");
      fetch("/api/gas").then((res) => res.json()).then(setGas).catch(() => {});
    } else {
      setGaMessage(data.error ?? "Failed to create geographical area.");
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">System Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">Configure system-wide settings and manage geographical areas.</p>
      </div>
      <Card className="bg-card border-border">
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle>Meter Capacity</CardTitle>
          <Settings className="h-5 w-5 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <form onSubmit={saveSettings} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="max-capacity" className="text-sm font-medium text-foreground">Maximum connected meters</label>
              <Input id="max-capacity" type="number" min="0" step="1" value={capacity} onChange={(event) => setCapacity(event.target.value)} placeholder="Unlimited" />
              <p className="text-xs text-muted-foreground">Leave blank for unlimited capacity. Existing meters continue reporting after the limit is reached.</p>
            </div>
            <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
            {message && <p className="text-sm text-muted-foreground" role="status">{message}</p>}
          </form>
        </CardContent>
      </Card>

      {/* GA Management Card */}
      <Card className="bg-card border-border">
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle>Geographical Areas</CardTitle>
          <Globe className="h-5 w-5 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <form onSubmit={createGa} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="ga-name" className="text-sm font-medium text-foreground">GA Name</label>
              <Input id="ga-name" value={gaName} onChange={(e) => setGaName(e.target.value)} placeholder="e.g. North Region" required />
            </div>
            <div className="space-y-2">
              <label htmlFor="ga-code" className="text-sm font-medium text-foreground">GA Code (Optional)</label>
              <Input id="ga-code" value={gaCode} onChange={(e) => setGaCode(e.target.value)} placeholder="e.g. GA-NORTH" />
            </div>
            <Button type="submit" disabled={creatingGa}>{creatingGa ? "Creating…" : "Create GA"}</Button>
            {gaMessage && <p className="text-sm text-muted-foreground" role="status">{gaMessage}</p>}
          </form>
          {gas.length > 0 && (
            <div className="mt-4 space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Existing Geographical Areas</p>
              {gas.map((ga) => (
                <div key={ga.id} className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
                  <span>{ga.name}</span>
                  {ga.code && <span className="text-muted-foreground">{ga.code}</span>}
                </div>
              ))}
            </div>
          )}
          {gas.length === 0 && (
            <p className="mt-4 text-xs text-muted-foreground">No geographical areas created yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
