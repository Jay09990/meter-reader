# DESIGN — EVC Gas Meter Dashboard

## 1. Tech Stack (proposed, adjust freely)
- **Next.js (App Router)** — single fullstack app; API routes replace the
  standalone `http-server`.
- **PostgreSQL** — fleet-scale (10k–20k devices, one row/device/day) still
  fits comfortably in Postgres; JSONB covers the raw payload and the hourly
  breakdown.
- **Prisma** — schema-first ORM, matches the Postgres choice.
- **Recharts** — for the hourly bar chart and day-over-day trend lines on
  the meter detail page.
- **Tailwind CSS** — dashboard layout/cards.
- Deploy target: anywhere Next.js + Postgres run (Vercel + Neon/Supabase, or
  a VPS) — no hard requirement from what's known so far.

## 2. Architecture Overview

```
EVC Meter (per device)
   │  Modbus registers
   ▼
4G Modem/Gateway (Teltonika)  — "Services → Data to Server"
   │  once/day, HTTP POST, JSON body (template configured on the device)
   ▼
Internet
   ▼
Next.js API route  /api/ingest   (single endpoint, fleet-wide — see §4)
   │  validate + parse, identify device by serial number in body
   ▼
Postgres  (Device registry + Reading history + Alarm table)
   │
   ▼
Next.js API routes (read)  ──►  Dashboard UI (Overview, Meter Table, Meter
                                 Detail, Alarms)
```

The existing `write-server`/`priceWrite.js` (SSH → `ubus call
modbus_client.rpc set_tag_value`) is a **separate, admin-only write path**
directly to a router's Modbus tags — it does not go through the
dashboard's DB and is not part of the read/display flow. Kept as a
standalone internal tool (see PRD.md §3 Non-Goals).

## 3. Data Model (Prisma-style, names indicative — see PRD §7 and
DATAFLOW.md §5 on payload verification)

Fleet scale (10k–20k devices) rules out the pilot's per-site/per-station
modeling (`Site` → `Station` → `DeviceInfo`/`DailyReading`, 4 tables). A
device is self-describing (it reports its own serial number, meter info,
and firmware/hardware info on every push), so the model collapses to
**three tables**: one device registry, one reading-history table, and one
alarms table.

```prisma
model Device {
  id                   String   @id @default(cuid())
  deviceSerialNo       String   @unique // primary identifier — every
                                         // payload carries this; devices
                                         // are created on first push
                                         // (PRD §7 — no pre-provisioning
                                         // step for v1)
  meterSerialNo        String?
  meterSize            String?
  firmwareVersion      String?
  hardwareVersion      String?
  deviceModel          String?
  configurationVersion String?

  // Optional grouping/labels — carried over from the pilot's "pune/s1"
  // naming so existing devices stay identifiable; free-text, not a
  // foreign key, since fleet scale doesn't need a formal site hierarchy
  // for v1 (add one later only if the business actually needs it — see
  // DEVELOPMENT_RULES.md §3 "no speculative abstraction").
  siteLabel            String?
  stationLabel         String?

  firstSeenAt          DateTime @default(now())
  lastSeenAt           DateTime? // set on every successful ingest —
                                  // drives the meter table's "last
                                  // reading" column and the missing-data
                                  // alarm job

  readings             Reading[]
  alarms               Alarm[]
}

model Reading {
  id                  String   @id @default(cuid())
  deviceId            String
  device              Device   @relation(fields: [deviceId], references: [id])
  readingDate         DateTime // date only, one row per device per day

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

  rawPayload          Json     // full as-received body, for replay/debug
                                // — FR9 safety net, kept even after the
                                // parser is solid
  receivedAt          DateTime @default(now())

  @@unique([deviceId, readingDate])
  @@index([readingDate])
}

model Alarm {
  id               String      @id @default(cuid())
  deviceId         String
  device           Device      @relation(fields: [deviceId], references: [id])
  type             AlarmType
  cause            String      // human-readable, e.g. "No data received
                                // for 2026-07-20" or "Corrected volume
                                // 18% above 7-day average"
  gasValue         Float?      // the triggering value — set for
                                // GAS_OUT_OF_RANGE, null for MISSING_DATA
  averageValue     Float?      // the trailing average it was compared
                                // against — GAS_OUT_OF_RANGE only
  forDate          DateTime    // the day the alarm pertains to (missed
                                // day, or day of the abnormal reading)
  status           AlarmStatus @default(OPEN)
  createdAt        DateTime    @default(now())

  @@unique([deviceId, type, forDate]) // one alarm per device/type/day —
                                       // re-running the check doesn't
                                       // duplicate
  @@index([status, createdAt])
}

enum AlarmType {
  MISSING_DATA
  GAS_OUT_OF_RANGE
}

enum AlarmStatus {
  OPEN
  RESOLVED   // e.g. a MISSING_DATA alarm auto-resolves once the device
             // reports again — v1 can leave this manual/unused if
             // simpler; see DATAFLOW.md §6
}
```

Notes:
- `rawPayload` is the safety net FR9 asks for — if the parsed columns turn
  out wrong once the real payload shape is confirmed, nothing is lost.
- `hourlyConsumption` is kept as JSON rather than a normalized child table
  for v1 (24 rows/day/device is small, and query patterns are "give me the
  24 values for this day", not cross-day per-hour aggregation). Normalize
  later only if that access pattern actually shows up.
- Device info fields (`firmwareVersion`, etc.) are simply overwritten on
  each push. If the payload turns out to only include device info on some
  pushes (TBD per DATAFLOW.md §5), only overwrite fields that are present
  rather than nulling out previously-known values.
- `Alarm` intentionally does **not** attempt notification delivery (email/
  SMS) — v1 is in-app only per PRD §3 Non-Goals. The header bell (§5 below)
  reads `count(status = OPEN)`.

## 4. API Design

### Write (ingestion)
- `POST /api/ingest` — **single endpoint for the whole fleet** (FR1 — a
  route per site/station doesn't scale to 20k devices). Device identifies
  itself via `deviceSerialNo` in the JSON body, not the URL.
  - Validates required fields exist, upserts `Device` (by
    `deviceSerialNo`), upserts `Reading` for `(deviceId, readingDate)`.
  - Always stores `rawPayload` even if parsing partially fails, and
    returns a clear error if the shape is unrecognized (rather than
    guessing) — see DATAFLOW.md §4.

### Read
- `GET /api/overview` — fleet summary: total devices, reported-today
  count, open-alarm count (FR4).
- `GET /api/devices?page=&search=&status=` — server-side paginated,
  searchable device list for the Meter Table page (FR5). Each row: serial,
  last reading date, reporting/stale status.
- `GET /api/devices/[id]/latest` — full latest `Reading` + `Device` info.
- `GET /api/devices/[id]/history?days=30` — array of `Reading` summary
  rows for trend charts.
- `GET /api/devices/[id]/hourly?date=YYYY-MM-DD` — hourly array for one
  day (defaults to latest day if `date` omitted).
- `GET /api/alarms?status=&type=&page=` — paginated alarm list, most
  recent first (FR6).
- `GET /api/alarms/count` — open-alarm count, for the header bell badge
  (FR7). (May just be a field on `/api/overview` instead — pick whichever
  avoids an extra round trip once the header component is built.)

## 5. UI Design

### Shell (every page)
- **Sidebar** — primary navigation (FR8): Overview, Meters, Alarms,
  Reports (Reports links to a "coming soon" placeholder — not built this
  phase, see PRD §3).
- **Header** — present on every page; includes a notification/bell icon
  showing the open-alarm count (badge) with a dropdown or direct link
  through to the Alarms page (FR7).

### Overview page (`/dashboard`)
Fleet-level summary cards (FR4): total meters, reported today vs. not,
open alarm count. Enough to answer "is anything wrong right now" without
opening the meter table.

### Meter Table page (`/dashboard/meters`)
Paginated, searchable table of all devices (FR5) — server-side pagination,
not a full client-side table (10k–20k rows). Columns: device/meter serial,
site/station label (if present), last reading date, status
(reporting/stale). Row click → meter detail.

### Meter detail page (`/dashboard/meters/[id]`)
- Top: date of latest reading + a "data is N days old" indicator (surfaces
  missed pushes per DATAFLOW.md §4).
- KPI card row: Volume (corrected/uncorrected), Pressure (+min/max),
  Temperature (+min/max), Gas Properties (Z, Fpv, C, Density), Meter Info.
- Hourly consumption chart (bar) for the selected day, with a date picker
  limited to days that have data.
- Trend section: line charts for Volume / Pressure / Temperature over a
  selectable range (7/30/90 days).
- Device Info panel (collapsible, since it rarely changes): serial,
  firmware, hardware, model, config version.

### Alarms page (`/dashboard/alarms`)
Filterable (by type/status), most-recent-first list (FR6): device serial,
alarm type, cause, triggering value (where applicable), date, status.
Row click → meter detail for that device.

### Reports page (`/dashboard/reports`)
Nav entry + "coming soon" placeholder only — not built this phase (PRD §3
Non-Goals, IMPLEMENTATION_PLAN.md "Explicitly Deferred").

## 6. Security Notes (carried over from the existing code, worth fixing
regardless of the dashboard work)
- `write-server`/`priceWrite.js` and the commented router block in
  `http-server/index.js` hardcode the router IP, username, and password in
  source. Move these to environment variables before this code goes
  anywhere shared (e.g. a repo, CI, or a teammate's machine).
- `/api/ingest` will be internet-facing (device pushes over HTTP) and,
  unlike the pilot's per-station routes, is a single fleet-wide door —
  worth deciding whether it needs a shared secret/token in the header so
  it's not a fully open write endpoint at 10k–20k-device scale.