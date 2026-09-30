"use client";

// Lets administrators create geographical areas and review the configured list.
import { useEffect, useState } from "react";
import { Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

interface GeographicalAreaOption {
  id: string;
  name: string;
  code: string | null;
}

export function GaManagementCard() {
  const [areas, setAreas] = useState<GeographicalAreaOption[]>([]);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function loadAreas() {
    const response = await fetch("/api/gas", { cache: "no-store" });
    if (!response.ok) throw new Error("Unable to load geographical areas.");
    setAreas(await response.json());
  }

  useEffect(() => {
    loadAreas().catch((error) => setMessage(error.message)).finally(() => setLoading(false));
  }, []);

  async function createArea(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch("/api/gas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), code: code.trim() || null }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to create geographical area.");
      setName("");
      setCode("");
      setMessage("Geographical area created.");
      await loadAreas();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to create geographical area.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="border-border bg-card">
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle>Geographical Areas</CardTitle>
        <Globe className="h-5 w-5 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <form onSubmit={createArea} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="ga-name" className="text-sm font-medium text-foreground">GA Name</label>
            <Input id="ga-name" maxLength={120} value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. North Region" required />
          </div>
          <div className="space-y-2">
            <label htmlFor="ga-code" className="text-sm font-medium text-foreground">GA Code (Optional)</label>
            <Input id="ga-code" maxLength={40} value={code} onChange={(event) => setCode(event.target.value)} placeholder="e.g. GA-NORTH" />
          </div>
          <Button type="submit" disabled={saving || !name.trim()}>{saving ? "Creating…" : "Create GA"}</Button>
          {message && <p className="text-sm text-muted-foreground" role="status">{message}</p>}
        </form>
        <div className="mt-5 space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Existing Geographical Areas</p>
          {loading ? <p className="text-sm text-muted-foreground">Loading…</p> : areas.length ? areas.map((area) => (
            <div key={area.id} className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
              <span>{area.name}</span>{area.code && <span className="text-muted-foreground">{area.code}</span>}
            </div>
          )) : <p className="text-sm text-muted-foreground">No geographical areas created yet.</p>}
        </div>
      </CardContent>
    </Card>
  );
}
