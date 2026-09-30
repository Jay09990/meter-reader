"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Mail, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

// Manages deployment-wide alarm email and report schedule settings.
export default function SettingsPage() {
  const [alarmEmail, setAlarmEmail] = useState("");
  const [reportTime, setReportTime] = useState("07:00");
  const [savingEmail, setSavingEmail] = useState(false);
  const [savingTime, setSavingTime] = useState(false);
  const [emailMessage, setEmailMessage] = useState<string | null>(null);
  const [timeMessage, setTimeMessage] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  const [loadingInitial, setLoadingInitial] = useState(true);

  useEffect(() => {
    fetch("/api/auth/me", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : null)
      .then((data) => setIsAdmin(data?.user?.role === "ADMIN"))
      .catch(() => setIsAdmin(false));

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
    fetchSettings();
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

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">System Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Review system-wide notifications and scheduled report settings.
        </p>
      </div>

      {isAdmin && <Link href="/dashboard/settings/capacity" className="flex items-center justify-between rounded-lg border border-border bg-card px-5 py-4 transition-colors hover:bg-secondary">
        <span>
          <span className="block font-semibold text-foreground">Meter Capacity &amp; Geographical Areas</span>
          <span className="mt-1 block text-sm text-muted-foreground">Manage the meter limit and create geographical areas.</span>
        </span>
        <ArrowRight className="ml-4 h-4 w-4 shrink-0 text-muted-foreground" />
      </Link>}

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
                  disabled={!isAdmin}
                />
                <p className="text-xs text-muted-foreground">
                  New alarms are emailed here via Resend. Leave blank to disable email
                  notifications. Requires <code className="text-[11px]">RESEND_API_KEY</code> in
                  the server environment.
                </p>
              </div>
              {isAdmin ? <Button type="submit" disabled={savingEmail}>
                {savingEmail ? "Saving…" : "Save email"}
              </Button> : <p className="text-xs text-muted-foreground">Contact an administrator to change this setting.</p>}
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
                  disabled={!isAdmin}
                />
                <p className="text-xs text-muted-foreground">
                  The daily consumption report will be emailed to the alarm notification address
                  at this time every day (UTC). Defaults to{" "}
                  <code className="text-[11px]">07:00 UTC</code>. Requires{" "}
                  <code className="text-[11px]">RESEND_API_KEY</code> and an alarm email to be
                  set.
                </p>
              </div>
              {isAdmin ? <Button type="submit" disabled={savingTime}>
                {savingTime ? "Saving…" : "Save schedule"}
              </Button> : <p className="text-xs text-muted-foreground">Contact an administrator to change this setting.</p>}
              {timeMessage && (
                <p className="text-sm text-muted-foreground" role="status">
                  {timeMessage}
                </p>
              )}
            </form>
          </CardContent>
        )}
      </Card>

    </div>
  );
}
