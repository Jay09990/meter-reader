# PRD — EVC Gas Meter Monitoring Dashboard

## 1. Background
EVC (Electronic Volume Corrector) gas meters are read by a device (4G
modem/gateway) at each meter, which pushes data over the internet to our
server as an HTTP POST. This is a fleet deployment: **10,000–20,000
meters**, not a single site — the original two-station (`pune/s1`,
`pune/s2`) setup was a pilot; the real system needs to handle the fleet
scale from the start (schema, ingestion, and UI all need to assume "many
thousands of devices," not "a couple of stations").

The parameters the business cares about per reading are documented in two
handwritten pages (source of truth for scope):

1. **Volume** — Corrected Volume (Vb, Sm3), Uncorrected Volume (Vm, m3)
2. **Pressure** — Gas (Line) Pressure (barg), Max & Min
3. **Temperature** — Gas Temperature (degC), Max & Min
4. **Gas Properties** — Compressibility Factor (Z), Compressibility (Fpv),
   Correction Factor (C), Gas Density (kg/m3)
5. **Meter Info** — Meter Serial Number, Meter Size
6. **Device Info** — Device Serial No., Firmware Version, Hardware Version,
   Device Model, Configuration Version
7. **24-Hour Consumption** — hourly breakdown for the day

**Payload shape is assumed, not confirmed.** The exact JSON structure sent
by the field devices isn't known yet. Per direction from the team lead: an
assumed structure (DATAFLOW.md SS5) is used to build against now, to be
corrected once a real payload is available — this is a deliberate,
acknowledged risk, not an oversight.

## 2. Goal
Build a Next.js fullstack app that:
- Ingests the daily push from up to ~20,000 meters and stores it durably.
- Surfaces fleet health at a glance (who's reporting, who isn't, what's
  abnormal) rather than requiring someone to check meters one by one.
- Raises alarms automatically for missing data and abnormal gas readings.

## 3. Non-Goals (for this phase)
- **Reports page** — nav entry exists, page itself is explicitly deferred.
- Real-time/streaming data — each meter pushes once a day; no live
  telemetry requirement.
- Writing values back to the meter/device (the separate `write-server` /
  `priceWrite.js` SSH+ubus flow — out of scope for the dashboard, see
  DATAFLOW.md SS3).
- Multi-tenant customer logins / billing.
- Alarm notification delivery (email/SMS/push) — v1 is in-app only (header
  bell + Alarms page).

## 4. Users
- Internal ops/engineering staff monitoring meter fleet health and gas
  readings.

## 5. Functional Requirements

### FR1 — Ingestion at Fleet Scale
- Single ingestion endpoint (not one route per site/station — doesn't
  scale to 20k devices). Each push identifies its own device (by serial
  number in the payload).
- No data loss if the dashboard is down when a device pushes (endpoint
  just needs to be up); the device is expected to retry per its own
  configuration.

### FR2 — Device Registry
Every device that has ever pushed data (or is provisioned ahead of time)
has one row: device info + meter info combined (serial numbers, firmware/
hardware/model/config version, meter size). This is the "who" — see
DESIGN.md SS3.

### FR3 — Reading History
Every daily push is stored as one row per device per day: volume,
pressure, temperature, gas properties, hourly consumption, plus the raw
payload as a safety net. This is the "what" — see DESIGN.md SS3.

### FR4 — Overview Page
Fleet-level summary: total meters, how many reported today vs. didn't,
open alarm count, and enough of a glance to answer "is anything wrong
right now" without opening the meter table.

### FR5 — Meter Table Page
Paginated, searchable table of all meters (10k-20k rows — this must be
server-side paginated, not loaded all at once). Each row: meter/device
serial, last reading date, status (reporting/stale), and a way to drill
into that meter's detail (KPI cards + charts, per the earlier single-meter
design).

### FR6 — Alarms
Two automatic alarm conditions (DESIGN.md SS3 for the table, DATAFLOW.md
SS6 for the generation logic):
1. **Missing data** — a device that should have reported for a given day
   didn't. One alarm per device per missed day.
2. **Gas value out of range** — a device's gas reading for the day is
   above or below its own recent average beyond a threshold. Alarm
   records the cause and the value that triggered it.

Alarms page lists these, filterable, most-recent first.

### FR7 — Header Notifications
Header (present on every page) has a notification/bell icon reflecting
open alarms — badge count, dropdown or link through to the Alarms page.

### FR8 — Navigation
Sidebar is the primary navigation: Overview, Meters, Alarms, Reports
(Reports links to a "coming soon" placeholder — not built this phase).

### FR9 — Data Integrity
Store the raw payload as-received alongside parsed columns, so nothing is
lost when the assumed payload shape (SS1) turns out to need correction.

## 6. Success Criteria
- A device's push is queryable on the dashboard within seconds of landing.
- Meter table page stays responsive at 10k-20k rows (server-side
  pagination/search, not a full client-side table).
- A device that stops reporting shows up as a missing-data alarm without
  anyone having to notice manually.
- A genuinely abnormal gas reading shows up as an alarm with a clear cause
  and the value that triggered it.

## 7. Open Items / Assumptions to Revisit
- **Payload structure is assumed** (see DATAFLOW.md SS5) — needs correction
  against a real device payload once available.
- **"Gas value" for the deviation alarm (FR6.2) is assumed to mean
  corrected volume (Vb)** unless told otherwise — the instruction didn't
  specify which field. Revisit if a different metric is intended (e.g.
  pressure, or uncorrected volume).
- **Deviation threshold and averaging window are assumed** (DATAFLOW.md
  SS6) — e.g. "average of the trailing N days plus/minus X%." Needs a real
  number from the business; an arbitrary starting value is used so the
  feature is buildable now.
- Whether devices are pre-provisioned (registry seeded ahead of first
  data) or only created on first push — currently assumed: create-on-first
  -push (simpler, no pre-provisioning step required).