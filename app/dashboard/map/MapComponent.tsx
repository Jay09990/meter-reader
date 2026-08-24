"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from "react-leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import "./leaflet-overrides.css";
import { X, MapPin, Activity, TrendingUp, RefreshCw } from "lucide-react";
import { useTheme } from "next-themes";
import { BarChart, Bar, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import L from "leaflet";
import "leaflet.markercluster";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PeriodSelector } from "@/components/ui/period-selector";

import { useAutoRefresh } from "@/lib/auto-refresh";
import { formatLocalTs } from "@/lib/utils";
import { pickTicks, tickCountForMode, type ConsumptionBucket, type ConsumptionMode } from "@/lib/consumption-series";

// Interactive map for AMR device location, clustering, and meter detail inspection.
type ClusterMarker = L.Marker & {
  options: L.MarkerOptions & { markerColor?: MapDevice["markerColor"] };
};

interface MapDevice {
  id: string;
  deviceSerialNo: string;
  lat: number;
  lng: number;
  markerColor: "green" | "amber" | "red" | "gray";
  customerName: string;
  city: string;
  address: string;
  latestReading: {
    correctedVolumeVb: number | null;
    currentFlowRate: number | null;
    gasPressure: number | null;
    batteryLevel: number | null;
    receivedAt: string | null;
  } | null;
  updateCadence: string;
  lastSyncedAt: string | null;
  alarms: Array<{ severity: string; cause: string; createdAt: string; forDate: string }>;
}

const COLOR_HEX = {
  green: "var(--clr-online)",
  amber: "var(--clr-stale)",
  red: "var(--clr-critical)",
  gray: "var(--clr-offline)",
} as const;

const TILE_URL = {
  dark: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",   // was "dark_matter"
  light: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", // unchanged, already correct
};

function formatRelativeTime(value: string | null) {
  if (!value) return "No sync yet";
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function getClusterColor(colors: Array<MapDevice["markerColor"]>) {
  if (colors.includes("red")) return "red" as const;
  if (colors.includes("amber")) return "amber" as const;
  if (colors.every((c) => c === "gray")) return "gray" as const;
  return colors.includes("green") ? ("green" as const) : ("gray" as const);
}

// Marker size now genuinely tracks live zoom (previous version passed a
// hardcoded zoom=6, so markers never actually grew) and is bigger overall.
function getMarkerSize(zoom: number) {
  if (zoom >= 14) return 26;
  if (zoom >= 11) return 20;
  if (zoom >= 8) return 16;
  return 13;
}

function getMarkerIcon(color: MapDevice["markerColor"], theme: string | undefined, zoom: number) {
  const size = getMarkerSize(zoom);
  const borderColor = "var(--card)";
  return L.divIcon({
    html: `<div style="width:${size}px;height:${size}px;border-radius:9999px;background:${COLOR_HEX[color]};border:2.5px solid ${borderColor};box-shadow:0 0 0 2px color-mix(in srgb, var(--foreground) 18%, transparent);"></div>`,
    className: "marker-dot",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

function ClusterLegend() {
  const items = [
    { color: "green" as const, label: "Normal" },
    { color: "amber" as const, label: "Anomaly flag" },
    { color: "red" as const, label: "Critical alert" },
    { color: "gray" as const, label: "Offline" },
  ];
  return (
    <div className="absolute bottom-4 left-4 z-[1000] flex flex-wrap gap-3 rounded-full border border-border/80 bg-popover/95 px-3 py-2 shadow-sm backdrop-blur">
      {items.map((item) => (
        <div key={item.label} className="flex items-center gap-2 text-xs font-medium text-foreground">
          <span className="h-3 w-3 rounded-full border border-card" style={{ backgroundColor: COLOR_HEX[item.color] }} />
          {item.label}
        </div>
      ))}
    </div>
  );
}

// Keeps Leaflet's internal size measurement correct across container
// resizes (sidebar collapse, window resize, theme toggle reflow, etc.)
// — previously this only ran once on mount.
function MapViewport() {
  const map = useMap();
  useEffect(() => {
    const invalidate = () => map.invalidateSize();
    invalidate();
    const t = setTimeout(invalidate, 150); // catch late layout settle
    window.addEventListener("resize", invalidate);
    const ro = new ResizeObserver(invalidate);
    ro.observe(map.getContainer());
    return () => {
      clearTimeout(t);
      window.removeEventListener("resize", invalidate);
      ro.disconnect();
    };
  }, [map]);
  return null;
}

// Tracks live zoom so marker dot size actually updates as you zoom.
function ZoomWatcher({ onZoom }: { onZoom: (zoom: number) => void }) {
  const map = useMapEvents({
    zoomend: () => onZoom(map.getZoom()),
  });
  useEffect(() => {
    onZoom(map.getZoom());
  }, [map, onZoom]);
  return null;
}

export default function MapComponent() {
  const { theme } = useTheme();
  const [devices, setDevices] = useState<MapDevice[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<MapDevice | null>(null);
  const [consumption, setConsumption] = useState<ConsumptionBucket[]>([]);
  const [consumptionPeriod, setConsumptionPeriod] = useState<ConsumptionMode>("daily");
  const [zoom, setZoom] = useState(6);
  const [loadingMap, setLoadingMap] = useState(true);
  const [loadingConsumption, setLoadingConsumption] = useState(false);

  const fetchMapDevices = useCallback(() => {
    setLoadingMap(true);
    fetch("/api/map/devices")
      .then((res) => res.json())
      .then((data) => {
        setDevices(data);
        setLoadingMap(false);
      })
      .catch(() => setLoadingMap(false));
  }, []);

  useEffect(() => {
    fetchMapDevices();
  }, [fetchMapDevices]);
  useAutoRefresh(fetchMapDevices);

  useEffect(() => {
    if (!selectedDevice) return;
    setLoadingConsumption(true);
    fetch(`/api/devices/${selectedDevice.id}/consumption?period=${consumptionPeriod}`)
      .then((response) => (response.ok ? response.json() : { consumption: [] }))
      .then((data) => {
        setConsumption(data.consumption ?? []);
        setLoadingConsumption(false);
      })
      .catch(() => {
        setConsumption([]);
        setLoadingConsumption(false);
      });
  }, [selectedDevice, consumptionPeriod]);

  const center: [number, number] = [20.5937, 78.9629];
  const tileUrl = theme === "dark" ? TILE_URL.dark : TILE_URL.light;

  const clusterIcon = useMemo(() => {
    return (cluster: L.MarkerCluster) => {
      const childColors = (cluster.getAllChildMarkers() as ClusterMarker[])
        .map((marker) => marker.options.markerColor)
        .filter((color): color is MapDevice["markerColor"] => Boolean(color));
      const color = getClusterColor(childColors);
      const count = cluster.getChildCount();
      const size = count >= 100 ? 56 : count >= 20 ? 46 : 38;
      const fill = COLOR_HEX[color];
      return L.divIcon({
        html: `<div style="width:${size}px;height:${size}px;border-radius:9999px;background:${fill};display:flex;align-items:center;justify-content:center;color:var(--primary-foreground);font-weight:700;font-size:13px;border:2.5px solid var(--card);">${count}</div>`,
        className: "cluster-bubble",
        iconSize: [size, size],
      });
    };
  }, [theme]);

  const markerIcons = useMemo(() => {
    const map = new Map<string, L.DivIcon>();
    devices.forEach((d) => map.set(d.id, getMarkerIcon(d.markerColor, theme, zoom)));
    return map;
  }, [devices, theme, zoom]);

  return (
    <div className="relative h-full w-full overflow-hidden">
      <div className="absolute right-4 top-4 z-[1000] flex items-center gap-3 whitespace-nowrap rounded-full border border-border/80 bg-popover/95 px-4 py-2 shadow-sm backdrop-blur">
        <span className="text-sm font-semibold uppercase tracking-[0.24em] text-foreground">
          Meter Clusters
        </span>
        <span className="rounded-full bg-[color:var(--clr-accent-hi)]/10 px-2 py-1 text-xs font-semibold text-[color:var(--clr-accent-hi)]">
          {devices.length} METERS
        </span>
      </div>

      <MapContainer center={center} zoom={6} className="h-full w-full" scrollWheelZoom>
        <MapViewport />
        <ZoomWatcher onZoom={setZoom} />
        <TileLayer url={tileUrl} detectRetina attribution='&copy; <a href="https://carto.com/attributions">CARTO</a>' />
        <MarkerClusterGroup iconCreateFunction={clusterIcon} maxClusterRadius={80} disableClusteringAtZoom={15} zoomToBoundsOnClick>
          {devices.map((device) => (
            <Marker
              key={device.id}
              position={[device.lat, device.lng]}
              icon={markerIcons.get(device.id)}
              // @ts-expect-error - markerColor is a custom option read back out in clusterIcon
              markerColor={device.markerColor}
              eventHandlers={{ click: () => setSelectedDevice(device) }}
            />
          ))}
        </MarkerClusterGroup>
      </MapContainer>

      <ClusterLegend />

      {loadingMap && (
        <div className="absolute inset-0 z-[900] flex items-center justify-center bg-background/60 backdrop-blur-sm">
          <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 shadow-lg">
            <RefreshCw className="h-4 w-4 animate-spin" style={{ color: "var(--clr-accent-mid)" }} />
            <span className="text-sm font-medium text-muted-foreground">Loading meter map…</span>
          </div>
        </div>
      )}

      {selectedDevice && (
        <div className="absolute inset-0 z-[1100] flex justify-end bg-foreground/20 backdrop-blur-[1px]">
          <div className="h-full w-full max-w-md overflow-y-auto border-l border-border bg-background/95 p-0 shadow-2xl">
            <div className="flex items-start justify-between border-b border-border px-5 py-4">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-semibold text-foreground">{selectedDevice.customerName}</h3>
                  <Badge variant="outline" className="border-[color:var(--clr-accent-hi)]/30 bg-[color:var(--clr-accent-hi)]/10 text-[color:var(--clr-accent-hi)]">
                    {selectedDevice.city}
                  </Badge>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{selectedDevice.deviceSerialNo}</p>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setSelectedDevice(null)}>
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="space-y-5 px-5 py-4">
              <div className="flex items-start gap-2 text-sm text-muted-foreground">
                <MapPin className="mt-0.5 h-4 w-4 text-[color:var(--clr-accent-hi)]" />
                <div>
                  <div>{selectedDevice.address}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{selectedDevice.city}</div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: "Reading", value: selectedDevice.latestReading?.correctedVolumeVb != null ? `${selectedDevice.latestReading.correctedVolumeVb.toFixed(0)} SCM` : "—" },
                  { label: "Flow Rate", value: selectedDevice.latestReading?.currentFlowRate != null ? `${selectedDevice.latestReading.currentFlowRate.toFixed(1)} SCMH` : "—" },
                  { label: "Pressure", value: selectedDevice.latestReading?.gasPressure != null ? `${selectedDevice.latestReading.gasPressure.toFixed(2)} bar` : "—" },
                  { label: "Battery", value: selectedDevice.latestReading?.batteryLevel != null ? `${selectedDevice.latestReading.batteryLevel.toFixed(0)}%` : "—" },
                ].map((metric) => (
                  <Card key={metric.label} className="border-border bg-card">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-xs uppercase tracking-wider text-muted-foreground">{metric.label}</CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0 text-sm font-semibold text-foreground">{metric.value}</CardContent>
                  </Card>
                ))}
              </div>

              <div className="rounded-lg border border-border p-3 text-sm text-muted-foreground">
                <div className="flex items-center justify-between">
                  <span>Update cadence</span>
                  <span className="font-semibold text-foreground">{selectedDevice.updateCadence}</span>
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <span>Last synced</span>
                  <span className="font-semibold text-foreground">{formatRelativeTime(selectedDevice.lastSyncedAt)}</span>
                </div>
              </div>

              <div>
                <div className="mb-3 space-y-2">
                  <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    <TrendingUp className="h-4 w-4 text-[color:var(--clr-accent-hi)]" />
                    {consumptionPeriod.charAt(0).toUpperCase() + consumptionPeriod.slice(1)} consumption
                  </div>
                  <PeriodSelector value={consumptionPeriod} onChange={setConsumptionPeriod} />
                </div>
                <div className="h-40 rounded-lg border border-border p-3">
                  {loadingConsumption ? (
                    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                      <RefreshCw className="h-4 w-4 animate-spin mr-2" style={{ color: "var(--clr-accent-mid)" }} />
                      Loading consumption…
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={consumption.map((bucket) => ({ ...bucket, value: bucket.value ?? 0 }))}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.7} />
                        <XAxis dataKey="label" ticks={pickTicks(consumption.map((bucket) => bucket.label), tickCountForMode(consumptionPeriod))} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} />
                        <YAxis tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} />
                        <Tooltip />
                        <Bar dataKey="value" fill="var(--chart-1)" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>

              <div>
                <div className="mb-3 text-sm font-semibold text-foreground">Events</div>
                {selectedDevice.alarms.length === 0 ? (
                  <div className="rounded-lg border border-[color:var(--clr-online)]/30 bg-[color:var(--clr-online)]/10 p-3 text-sm text-[color:var(--clr-online)]">
                    No events yet — network nominal.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {selectedDevice.alarms.map((alarm, index) => (
                      <div key={`${alarm.createdAt}-${index}`} className="rounded-lg border border-border p-3 text-sm text-muted-foreground">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-foreground">{alarm.cause}</span>
                          <Badge variant="outline" className="border-[color:var(--clr-stale)]/30 bg-[color:var(--clr-stale)]/10 text-[color:var(--clr-stale)]">
                            {alarm.severity}
                          </Badge>
                        </div>
                        <div className="mt-2 text-xs text-muted-foreground">{formatLocalTs(alarm.createdAt)}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-lg border border-border p-3">
                <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
                  <Activity className="h-4 w-4 text-[color:var(--clr-accent-hi)]" />
                  Location
                </div>
                <div className="h-36 overflow-hidden rounded-lg border border-border">
                  <MapContainer center={[selectedDevice.lat, selectedDevice.lng]} zoom={12} zoomControl={false} dragging={false} scrollWheelZoom={false} className="h-full w-full">
                    <TileLayer url={tileUrl} detectRetina attribution='&copy; <a href="https://carto.com/attributions">CARTO</a>' />
                    <Marker position={[selectedDevice.lat, selectedDevice.lng]} icon={getMarkerIcon(selectedDevice.markerColor, theme, 14)} />
                  </MapContainer>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
