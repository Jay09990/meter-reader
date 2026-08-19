"use client";

import dynamic from "next/dynamic";

const MapComponent = dynamic(() => import("./MapComponent"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">
      Loading map…
    </div>
  ),
});

export default function MapPage() {
  // -m-6 / w-[calc(100%+3rem)] cancel out the p-6 padding on <main> from
  // the dashboard layout, and h-[calc(100vh-4rem)] matches the header's
  // fixed h-16 (4rem) so the map gets the *entire* remaining viewport —
  // no sidebar, no header, no padding eating into it.
  return (
    <div className="-m-6 h-[calc(100vh-4rem)] w-[calc(100%+3rem)]">
      <MapComponent />
    </div>
  );
}