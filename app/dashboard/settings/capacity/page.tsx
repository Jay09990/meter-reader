"use client";

import { useEffect, useState } from "react";
import { Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

// Hidden admin page for Maximum Meter Capacity management.
// Not shown in sidebar — accessible directly at /dashboard/cfg-7v4x9k2q/capacity
export default function CapacityPage() {
  const [capacity, setCapacity] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [loadingInitial, setLoadingInitial] = useState(true);

  useEffect(() => {
    fetch("/api/system/settings")
      .then((res) => res.json())
      .then((data) => {
        setCapacity(data.maxMeterCapacity?.toString() ?? "");
        setLoadingInitial(false);
      })
      .catch(() => {
        setMessage("Unable to load system settings.");
        setLoadingInitial(false);
      });
  }, []);

  const saveSettings = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    const response = await fetch("/api/system/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        maxMeterCapacity: capacity === "" ? null : Number(capacity),
      }),
    });
    const data = await response.json();
    setSaving(false);
    setMessage(response.ok ? "Capacity setting saved." : data.error ?? "Unable to save settings.");
  };

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Meter Capacity</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Configure the maximum number of meters allowed to connect to this system.
        </p>
      </div>

      <Card className="bg-card border-border">
        {loadingInitial ? (
          <div className="space-y-3 px-6 py-4">
            <div className="flex items-center gap-3">
              <div className="h-5 w-5 animate-pulse rounded-full bg-muted" />
              <div className="h-4 w-28 animate-pulse rounded bg-muted" />
            </div>
            <div className="space-y-3">
              <div className="h-4 w-24 animate-pulse rounded bg-muted" />
              <div className="h-9 w-full animate-pulse rounded-md bg-muted" />
              <div className="h-3 w-32 animate-pulse rounded bg-muted" />
            </div>
          </div>
        ) : (
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle>Meter Capacity Limit</CardTitle>
            <Settings className="h-5 w-5 text-muted-foreground" />
          </CardHeader>
        )}
        {!loadingInitial && (
          <CardContent>
            <form onSubmit={saveSettings} className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="max-capacity" className="text-sm font-medium text-foreground">
                  Maximum connected meters
                </label>
                <Input
                  id="max-capacity"
                  type="number"
                  min="0"
                  step="1"
                  value={capacity}
                  onChange={(event) => setCapacity(event.target.value)}
                  placeholder="Unlimited"
                />
                <p className="text-xs text-muted-foreground">
                  Leave blank for unlimited capacity. Existing meters continue reporting after the
                  limit is reached.
                </p>
              </div>
              <Button type="submit" disabled={saving}>
                {saving ? "Saving…" : "Save"}
              </Button>
              {message && (
                <p className="text-sm text-muted-foreground" role="status">
                  {message}
                </p>
              )}
            </form>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
