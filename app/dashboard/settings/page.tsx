"use client";

import { useEffect, useState } from "react";
import { Globe, Mail, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

// Manages deployment-wide settings: alarm email, report schedule time, and GAs.
// Meter Capacity is managed at /dashboard/cfg-7v4x9k2q/capacity (hidden from sidebar).
export default function SettingsPage() {
  const [alarmEmail, setAlarmEmail] = useState("");
  const [reportTime, setReportTime] = useState("07:00");
  const [savingEmail, setSavingEmail] = useState(false);
  const [savingTime, setSavingTime] = useState(false);
  const [emailMessage, setEmailMessage] = useState<string | null>(null);
  const [timeMessage, setTimeMessage] = useState<string | null>(null);

  // GA creation state
  const [gas, setGas] = useState<import("@prisma/client").GeographicalArea[]>([]);
  const [gaName, setGaName] = useState("");
  const [gaCode, setGaCode] = useState("");
  const [creatingGa, setCreatingGa] = useState(false);
  const [gaMessage, setGaMessage] = useState<string | null>(null);
  const [loadingInitial, setLoadingInitial] = useState(true);

  useEffect(() => {
    const fetchSettings = () => {
      fetch("/api/system/settings")
        .then((res) => res.json())
        .then((data) => {
          setAlarmEmail(data.alarmNotificationEmail ?? "");
          setReportTime(data.reportScheduleTime ?? "07:00");
          setLoadingInitial(false);
        })
        .catch(() => {
          setEmailMessage("Unable to load system settings.");
          setLoadingInitial(false);
        });
    };
    const fetchGas = () => {
      fetch("/api/gas")
        .then((res) => res.json())
        .then((data) => setGas(data))
        .catch(() => setGaMessage("Unable to load geographical areas."));
    };
    fetchSettings();
    fetchGas();
  }, []);

  const saveAlarmEmail = async (event: React.FormEvent) => {
    event.preventDefault();
    setSavingEmail(true);
    setEmailMessage(null);
    const response = await fetch("/api/system/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        alarmNotificationEmail: alarmEmail.trim() === "" ? null : alarmEmail.trim(),
      }),
    });
    const data = await response.json();
    setSavingEmail(false);
    if (response.ok) {
      setAlarmEmail(data.alarmNotificationEmail ?? "");
      setEmailMessage(
        data.alarmNotificationEmail
          ? "Alarm notification email saved."
          : "Alarm notification email cleared.",
      );
    } else {
      setEmailMessage(data.error ?? "Unable to save email.");
    }
  };

  const saveReportTime = async (event: React.FormEvent) => {
    event.preventDefault();
    setSavingTime(true);
    setTimeMessage(null);
    const response = await fetch("/api/system/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reportScheduleTime: reportTime }),
    });
    const data = await response.json();
    setSavingTime(false);
    if (response.ok) {
      setReportTime(data.reportScheduleTime ?? "07:00");
      setTimeMessage("Report schedule time saved.");
    } else {
      setTimeMessage(data.error ?? "Unable to save report time.");
    }
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
        <p className="mt-1 text-sm text-muted-foreground">
          Configure system-wide settings and manage geographical areas.
        </p>
      </div>

      {/* Alarm Notification Email */}
      <Card className="bg-card border-border">
        {loadingInitial ? (
          <div className="space-y-3 px-6 py-4">
            <div className="flex items-center gap-3">
              <div className="h-5 w-5 animate-pulse rounded-full bg-muted" />
              <div className="h-4 w-44 animate-pulse rounded bg-muted" />
            </div>
            <div className="space-y-3">
              <div className="h-4 w-20 animate-pulse rounded bg-muted" />
              <div className="h-9 w-full animate-pulse rounded-md bg-muted" />
              <div className="h-3 w-40 animate-pulse rounded bg-muted" />
            </div>
          </div>
        ) : (
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle>Alarm Notifications</CardTitle>
            <Mail className="h-5 w-5 text-muted-foreground" />
          </CardHeader>
        )}
        {!loadingInitial && (
          <CardContent>
            <form onSubmit={saveAlarmEmail} className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="alarm-email" className="text-sm font-medium text-foreground">
                  Notification email
                </label>
                <Input
                  id="alarm-email"
                  type="email"
                  value={alarmEmail}
                  onChange={(event) => setAlarmEmail(event.target.value)}
                  placeholder="ops@example.com"
                  autoComplete="email"
                />
                <p className="text-xs text-muted-foreground">
                  New alarms are emailed here via Resend. Leave blank to disable email
                  notifications. Requires <code className="text-[11px]">RESEND_API_KEY</code> in
                  the server environment.
                </p>
              </div>
              <Button type="submit" disabled={savingEmail}>
                {savingEmail ? "Saving…" : "Save email"}
              </Button>
              {emailMessage && (
                <p className="text-sm text-muted-foreground" role="status">
                  {emailMessage}
                </p>
              )}
            </form>
          </CardContent>
        )}
      </Card>

      {/* Daily Report Schedule */}
      <Card className="bg-card border-border">
        {loadingInitial ? (
          <div className="space-y-3 px-6 py-4">
            <div className="flex items-center gap-3">
              <div className="h-5 w-5 animate-pulse rounded-full bg-muted" />
              <div className="h-4 w-44 animate-pulse rounded bg-muted" />
            </div>
            <div className="space-y-3">
              <div className="h-4 w-20 animate-pulse rounded bg-muted" />
              <div className="h-9 w-full animate-pulse rounded-md bg-muted" />
              <div className="h-3 w-40 animate-pulse rounded bg-muted" />
            </div>
          </div>
        ) : (
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle>Daily Report Schedule</CardTitle>
            <Clock className="h-5 w-5 text-muted-foreground" />
          </CardHeader>
        )}
        {!loadingInitial && (
          <CardContent>
            <form onSubmit={saveReportTime} className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="report-time" className="text-sm font-medium text-foreground">
                  Send daily report at (UTC)
                </label>
                <Input
                  id="report-time"
                  type="time"
                  value={reportTime}
                  onChange={(event) => setReportTime(event.target.value)}
                  className="max-w-[160px]"
                />
                <p className="text-xs text-muted-foreground">
                  The daily consumption report will be emailed to the alarm notification address
                  at this time every day (UTC). Defaults to{" "}
                  <code className="text-[11px]">07:00 UTC</code>. Requires{" "}
                  <code className="text-[11px]">RESEND_API_KEY</code> and an alarm email to be
                  set.
                </p>
              </div>
              <Button type="submit" disabled={savingTime}>
                {savingTime ? "Saving…" : "Save schedule"}
              </Button>
              {timeMessage && (
                <p className="text-sm text-muted-foreground" role="status">
                  {timeMessage}
                </p>
              )}
            </form>
          </CardContent>
        )}
      </Card>

      {/* GA Management Card */}
      <Card className="bg-card border-border">
        {loadingInitial ? (
          <div className="space-y-3 px-6 py-4">
            <div className="flex items-center gap-3">
              <div className="h-5 w-5 animate-pulse rounded-full bg-muted" />
              <div className="h-4 w-44 animate-pulse rounded bg-muted" />
            </div>
            <div className="space-y-3">
              <div className="h-4 w-16 animate-pulse rounded bg-muted" />
              <div className="h-9 w-full animate-pulse rounded-md bg-muted" />
              <div className="h-4 w-16 animate-pulse rounded bg-muted" />
              <div className="h-9 w-full animate-pulse rounded-md bg-muted" />
              <div className="h-9 w-32 animate-pulse rounded-md bg-muted" />
              <div className="h-4 w-full animate-pulse rounded bg-muted" />
              <div className="space-y-2">
                <div className="h-7 w-full animate-pulse rounded-md bg-muted" />
                <div className="h-7 w-3/4 animate-pulse rounded-md bg-muted" />
                <div className="h-7 w-2/3 animate-pulse rounded-md bg-muted" />
              </div>
            </div>
          </div>
        ) : (
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle>Geographical Areas</CardTitle>
            <Globe className="h-5 w-5 text-muted-foreground" />
          </CardHeader>
        )}
        {!loadingInitial && (
          <CardContent>
            <form onSubmit={createGa} className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="ga-name" className="text-sm font-medium text-foreground">
                  GA Name
                </label>
                <Input
                  id="ga-name"
                  value={gaName}
                  onChange={(e) => setGaName(e.target.value)}
                  placeholder="e.g. North Region"
                  required
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="ga-code" className="text-sm font-medium text-foreground">
                  GA Code (Optional)
                </label>
                <Input
                  id="ga-code"
                  value={gaCode}
                  onChange={(e) => setGaCode(e.target.value)}
                  placeholder="e.g. GA-NORTH"
                />
              </div>
              <Button type="submit" disabled={creatingGa}>
                {creatingGa ? "Creating…" : "Create GA"}
              </Button>
              {gaMessage && (
                <p className="text-sm text-muted-foreground" role="status">
                  {gaMessage}
                </p>
              )}
            </form>
            {gas.length > 0 && (
              <div className="mt-4 space-y-1">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Existing Geographical Areas
                </p>
                {gas.map((ga) => (
                  <div
                    key={ga.id}
                    className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm"
                  >
                    <span>{ga.name}</span>
                    {ga.code && <span className="text-muted-foreground">{ga.code}</span>}
                  </div>
                ))}
              </div>
            )}
            {gas.length === 0 && (
              <p className="mt-4 text-xs text-muted-foreground">
                No geographical areas created yet.
              </p>
            )}
          </CardContent>
        )}
      </Card>
    </div>
  );
}
