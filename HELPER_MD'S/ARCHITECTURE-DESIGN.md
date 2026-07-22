# DESIGN — EVC Gas Meter Dashboard (v2 — GA/Customer scope)

## 1. Tech Stack (unchanged)
- **Next.js (App Router)**, **PostgreSQL**, **Prisma**, **Recharts**,
  **Tailwind CSS + shadcn/ui**.
- **New for this revision:** a mapping library for Map View — Leaflet
  (matches the reference site, which is explicitly "Leaflet map" per its
  own on-page text) with marker clustering (e.g. `react-leaflet` +
  `leaflet.markercluster` or an equivalent clustering approach) — required
  at fleet scale (10k–20k possible markers), not optional.
- **New for this revision:** a PDF generation approach for Reports (FR12)
  — e.g. `@react-pdf/renderer` or server-side HTML→PDF. Pick whichever
  integrates cleanest with the existing Next.js API routes; not
  prescribed further here since it's an implementation detail, not an
  architectural one.
- Deploy target unchanged.

## 2. Architecture Overview

```
EVC Meter (per device)
   │  Modbus registers
   ▼
4G Modem/Gateway  — "Services → Data to Server"
   │  once/day, HTTP POST, JSON body
   ▼
Next.js API route  POST /api/ingest   (single endpoint, fleet-wide)
   │  identify device by deviceSerialNo; device may have no Customer yet
   ▼
Postgres
   ├── GeographicalArea  ─┐
   ├── Customer          ─┼─ admin-managed, NOT from the device payload
   ├── Device            ─┘  (payload updates Device + Reading only)
   ├── Reading
   ├── Alarm
   └── AlarmSettings
   │
   ▼
Next.js read API routes  ──►  Dashboard UI
   Overview · Map View · Customers · Meter/Customer Detail · Alarms ·
   Reports
```

The admin flow (create GA → create Customer → assign Device to Customer)
is a **separate write path from ingestion** — it's a human using a form,
not a meter pushing data. Keep it as its own feature module
(`features/admin/` or similar) per DEVELOPMENT_RULES.md §2.1, not bolted
onto the ingestion module.

`write-server`/`priceWrite.js` remains a separate, out-of-scope admin-only
Modbus write path (unchanged from v1, PRD.md §3).

## 3. Data Model

Six tables. `GeographicalArea` and `Customer` are new this revision;
`Device`, `Reading`, `Alarm` are extended; `AlarmSettings` is new (a
config table, not fleet data).

```prisma
model GeographicalArea {
  id         String             @id @default(cuid())
  name       String
  code       String?            @unique
  parentId   String?            // self-relation — optional hierarchy,
  parent     GeographicalArea?  @relation("GAHierarchy", fields: [parentId], references: [id])
  children   GeographicalArea[] @relation("GAHierarchy")
  customers  Customer[]
  createdAt  DateTime           @default(now())
}
// Kept as a flat table with an optional parent, not a fixed N-level
// hierarchy (region/state/GA/zone...) — add levels only when a real need
// shows up (DEVELOPMENT_RULES.md §3 "no speculative abstraction"). Most
// queries just need "which GA is this customer in," which this supports
// without forcing a tree depth.

enum CustomerCategory {
  INDUSTRIAL
  COMMERCIAL
  RESIDENTIAL
  BULK
}

model Customer {
  id           String            @id @default(cuid())
  name         String
  category     CustomerCategory
  address      String?
  gaId         String
  ga           GeographicalArea  @relation(fields: [gaId], references: [id])
  devices      Device[]
  createdAt    DateTime          @default(now())

  @@index([gaId])
  @@index([category])
}
// Customer/GA are entered through the admin flow (§2) — never derived
// from the ingestion payload, which has no concept of "who owns this
// meter" (PRD.md FR3).

model Device {
  id                   String    @id @default(cuid())
  deviceSerialNo       String    @unique // primary identifier from payload
  customerId           String?   // nullable — device may be unassigned
  customer             Customer? @relation(fields: [customerId], references: [id])

  meterSerialNo        String?
  meterSize            String?
  firmwareVersion      String?
  hardwareVersion      String?
  deviceModel          String?
  configurationVersion String?

  latitude             Float?    // set during provisioning, NOT from the
  longitude            Float?    // daily payload — meters don't report
                                  // GPS; see DATAFLOW.md §5.1

  firstSeenAt          DateTime  @default(now())
  lastSeenAt           DateTime? // updated on every successful ingest

  readings             Reading[]
  alarms                Alarm[]

  @@index([customerId])
}

model Reading {
  id                  String   @id @default(cuid())
  deviceId            String
  device              Device   @relation(fields: [deviceId], references: [id])
  readingDate         DateTime // one row per device per day

  correctedVolumeVb   Float?   // Sm3
  uncorrectedVolumeVm Float?   // m3
  gasPressure         Float?   // barg
  pressureMax         Float?
  pressureMin         Float?
  gasTemperature      Float?   // degC
  temperatureMax      Float?
  temperatureMin      Float?
  compressibilityZ    Float?
  compressibilityFpv  Float?
  correctionFactorC   Float?
  gasDensity          Float?   // kg/m3
  hourlyConsumption   Json?    // [ {hour: 0..23, value: number}, ... ]

  batteryLevel        Float?   // % — NEW, assumed field, drives the
                                // Customers-page "Battery" column
  currentFlowRate     Float?   // SCMH — NEW, assumed field, drives the
                                // Customers-page / Overview "Flow" values
                                // (fallback: derive from the latest entry
                                // in hourlyConsumption if this isn't sent)

  rawPayload          Json     // full as-received body — kept even after
                                // the parser is solid (FR14 safety net)
  receivedAt          DateTime @default(now())

  @@unique([deviceId, readingDate])
  @@index([readingDate])
}

enum AlarmType {
  MISSING_DATA
  GAS_OUT_OF_RANGE
}

enum AlarmSeverity {
  CRITICAL
  WARNING
}

enum AlarmStatus {
  OPEN
  RESOLVED
}

model Alarm {
  id             String        @id @default(cuid())
  deviceId       String
  device         Device        @relation(fields: [deviceId], references: [id])
  type           AlarmType
  severity       AlarmSeverity // NEW — assumed mapping: MISSING_DATA =
                                // CRITICAL, GAS_OUT_OF_RANGE = WARNING
                                // (DATAFLOW.md §6, PRD.md §9 — confirm)
  cause          String
  gasValue       Float?
  averageValue   Float?
  forDate        DateTime
  status         AlarmStatus   @default(OPEN)
  acknowledged   Boolean       @default(false) // NEW — the header bell's
                                // "mark all read" affordance; separate
                                // from `status` on purpose (PRD.md FR9 —
                                // a single shared flag, no per-user read
                                // state, since there's no multi-user auth)
  createdAt      DateTime      @default(now())

  @@unique([deviceId, type, forDate])
  @@index([status, createdAt])
  @@index([severity, status])
  @@index([acknowledged])
}

model AlarmSettings {
  id                       String @id @default("singleton") // one row
  gasDeviationWindowDays   Int    @default(7)
  gasDeviationPercent      Float  @default(20)
  updatedAt                DateTime @updatedAt
}
// Replaces the hardcoded "7-day / ±20%" in v1's DATAFLOW.md §6.2 with a
// configurable row, so ops can tune it from the Settings page (FR — see
// §5 UI Design below) without a redeploy. Singleton via a fixed id,
// simplest pattern for "exactly one row of global config."
```

Notes:
- **Derived status is NOT a stored column anywhere** (PRD.md FR11) — it's
  computed at query time from `Device.lastSeenAt` + open `Alarm` rows for
  that device, so there is exactly one source of truth (the alarms
  themselves), not a cached field that can drift out of sync. Compute it
  in the read API layer (§4), not in the DB schema.
- `latitude`/`longitude` live on `Device`, not `Customer` — a customer
  could in principle have multiple meters at different physical
  locations; the map plots meters, not customers.
- Device info fields are still overwritten on each push, same
  present-fields-only caveat as v1 (don't null out previously-known
  values if a push omits them).

## 4. API Design

### Write
- `POST /api/ingest` — unchanged in shape (single fleet-wide endpoint,
  identifies device by `deviceSerialNo`), now also parses `batteryLevel`
  and `currentFlowRate` if present, and runs the GAS_OUT_OF_RANGE check
  using `AlarmSettings` instead of a hardcoded threshold.
- `POST /api/gas` / `PATCH /api/gas/[id]` — create/edit a GeographicalArea.
- `POST /api/customers` / `PATCH /api/customers/[id]` — create/edit a
  Customer.
- `PATCH /api/devices/[id]/assign` — assign/reassign a Device to a
  Customer (also where `latitude`/`longitude` get set for Map View).
- `PATCH /api/alarms/[id]/acknowledge`, `PATCH /api/alarms/acknowledge-all`
  — the header bell's "mark read" actions (doesn't touch `status`).
- `PUT /api/settings/alarms` — update `AlarmSettings`.

### Read
- `GET /api/overview` — extended: monthly consumption total, consumption
  by category, top-5/least-5 customers, GA-wise consumption, recent
  activity feed, reported-today count, open-alarm count.
- `GET /api/gas` — list of GAs (for filter dropdowns / hierarchy display).
- `GET /api/customers?page=&search=&gaId=&status=&category=` —
  server-side paginated/filterable/searchable, for the Customers page
  (grid and list views both consume this same endpoint).
- `GET /api/customers/[id]` — customer detail + its device(s) + latest
  readings.
- `GET /api/map/devices?gaId=` — lean payload for Map View: id,
  latitude, longitude, derived status, customer name. Only devices with
  both lat and long set. Kept intentionally minimal (not full device
  detail) since it may return thousands of rows.
- `GET /api/devices/[id]/latest`, `/history`, `/hourly` — unchanged from
  v1 (meter/device detail, KPI cards, charts).
- `GET /api/alarms?status=&severity=&search=&page=` — extended with
  severity filter and search.
- `GET /api/alarms/export?format=csv` — CSV export of the current
  filtered alarm list (FR9).
- `GET /api/alarms/count` — unread (unacknowledged, open) count for the
  header bell badge.
- `GET /api/reports/monthly-consumption` — data for report #1 (FR12).
- `GET /api/reports/leak-anomaly` — data for report #2.
- `GET /api/reports/ga-meter-audit` — data for report #3.
  (Each report route returns the data; PDF rendering can happen
  server-side in the same route or client-side from the JSON — an
  implementation choice, not an architectural one.)
- `GET /api/settings/alarms` — current `AlarmSettings` values.

## 5. UI Design

### Shell (every page, unchanged principle)
Sidebar: Overview, Map View, Customers, Alarms, Reports (PRD.md FR13 —
Operations/System omitted pending clarification, PRD.md §9). Header: bell
icon with unread count + dropdown + "mark all read," links to Alarms.

### Overview page (`/dashboard`)
Fleet summary cards (reported today / not, open alarms), Monthly
Consumption chart, Consumption by Category chart, Top-5 / Least-5
Consuming Customers tables, GA-wise Consumption chart, Recent Activity
feed (explicitly labeled as "recent," not "live" — PRD.md §3).

### Map View page (`/dashboard/map`)
Clustered marker map (Leaflet). Legend: Normal / Anomaly / Alert. Hover =
quick-read tooltip (customer name, last reading date, status). Click =
navigate to that device's detail page. GA filter to narrow the view.

### Customers page (`/dashboard/customers`)
Grid/List view toggle. Filters: GA, status (derived, PRD.md FR11),
category. Search box. Server-side paginated. Columns/card fields: Customer
Name, Meter ID, Device ID, Category, Address, Flow, Pressure, Battery,
Status. Row/card click → customer or device detail.

### Meter/Device detail page (`/dashboard/devices/[id]`)
Unchanged from v1 (KPI cards, hourly chart, trend charts, device info
panel) — now also shows which Customer/GA it belongs to (or "Unassigned"
with a link into the admin assignment flow).

### Alarms page (`/dashboard/alarms`)
Filter tabs: All / Critical / Warning / Resolved (matches the reference
site's shorthand — really a severity filter plus a status filter combined
in the UI). Search. Export CSV button. Table: Time, Severity, Meter (→
Customer name), GA, Description, Acknowledge action.

### Reports page (`/dashboard/reports`)
Three report cards (FR12), each with a "Download PDF" action.

### Admin — GA/Customer/Device assignment (`/dashboard/admin` or similar)
Minimal forms per PRD.md FR3a: create GA, create Customer (under a GA),
assign a Device to a Customer by serial number. Not a polished workflow —
functional is enough for v1.

### Settings page (`/dashboard/settings`) — scoped down from the reference
Only what's functionally meaningful for a real (non-simulated) system:
`AlarmSettings` controls (deviation window/percent). Skip the reference
site's purely cosmetic bits (theme toggle can be a simple client-side
control if wanted, but isn't a backend requirement; "simulated tick rate"
has no equivalent since our data isn't simulated).

## 6. Security Notes (carried over, unchanged)
Same as v1 — env vars for secrets, ingestion endpoint should have a
shared-secret/token check at fleet scale.