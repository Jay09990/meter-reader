"use client";

import { useEffect, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

// @ts-expect-error - Fix for default marker icons in Leaflet with Webpack
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

interface MapDevice {
  id: string;
  deviceSerialNo: string;
  lat: number;
  lng: number;
  status: string;
}

export default function MapComponent() {
  const [devices, setDevices] = useState<MapDevice[]>([]);

  useEffect(() => {
    fetch("/api/map/devices")
      .then(res => res.json())
      .then(data => setDevices(data))
      .catch(console.error);
  }, []);

  const center: [number, number] = [19.0760, 72.8777]; // Default to Mumbai roughly

  return (
    <MapContainer center={center} zoom={6} className="h-full w-full min-h-[600px] rounded-md border">
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="http://osm.org/copyright">OpenStreetMap</a>'
      />
      {devices.map((device) => {
        // Simple color coding by status
        // In a real app, you'd create custom divIcons for colors
        return (
          <Marker key={device.id} position={[device.lat, device.lng]}>
            <Popup>
              <strong>{device.deviceSerialNo}</strong>
              <br />
              Status: {device.status}
            </Popup>
          </Marker>
        );
      })}
    </MapContainer>
  );
}
