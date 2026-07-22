"use client";

import dynamic from "next/dynamic";
import { Card, CardContent } from "@/components/ui/card";

// React-leaflet requires the window object, so we must load it dynamically
// and disable server-side rendering for this component.
const MapComponent = dynamic(() => import("./MapComponent"), {
  ssr: false,
  loading: () => <div className="h-[600px] flex items-center justify-center border rounded-md">Loading Map...</div>,
});

export default function MapPage() {
  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">Fleet Map View</h1>
      <Card>
        <CardContent className="p-0">
          <MapComponent />
        </CardContent>
      </Card>
    </div>
  );
}
