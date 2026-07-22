# PRD — EVC Gas Meter Monitoring Dashboard (v2 — GA/Customer scope)

## 0. What Changed in This Revision
Two new inputs triggered this revision:
1. **Handwritten spec, page 3** — new pages/KPIs: Gas Network Overview (with
   Industrial/Commercial consumption KPIs, monthly consumption, consumption
   by category, top-5/least-5 consuming customers, **GA-wise consumption**),
   Map View, Customers List on grid (by GA), Alarms.
2. **Reference product — Altrex CGD Gas AMR Console**
   (https://amr-cgd.vercel.app/) — a live demo the team lead pointed at as
   "build ours like this." It is a **simulated demo** (fake polling tick,
   0 real data, "Guest User / Demo session", Settings page explicitly says
   "demo placeholders, not persisted") — it's a UX/IA reference, not a
   system we're cloning byte-for-byte. See §8 for the analysis method and
   what could/couldn't be verified.

Net effect: the data model grows from 3 tables (Device, Reading, Alarm) to
include **GA (Geographical Area)** and **Customer** as first-class
entities, because the app now needs to group and display meters by who
owns them and where, not just by device serial number. See DESIGN.md §3
for the full schema.

## 1. Background
EVC (Electronic Volume Corrector) gas meters are read by a device (4G
modem/gateway) at each meter, which pushes data over the internet to our
server as an HTTP POST. This is a fleet deployment: **10,000–20,000
meters**. Meters belong to **customers** (Industrial / Commercial /
Residential / Bulk), and customers are grouped into **GAs (Geographical
Areas)** — the standard city-gas-distribution term for a licensed
service area, used here as the top-level grouping for consumption
reporting and filtering ("GA-wise consumption" in the handwritten spec).

Per-reading parameters (unchanged, still the source of truth for scope):
1. **Volume** — Corrected Volume (Vb, Sm3), Uncorrected Volume (Vm, m3)
2. **Pressure** — Gas (Line) Pressure (barg), Max & Min
3. **Temperature** — Gas Temperature (degC), Max & Min
4. **Gas Properties** — Compressibility Factor (Z), Compressibility (Fpv),
   Correction Factor (C), Gas Density (kg/m3)
5. **Meter Info** — Meter Serial Number, Meter Size
6. **Device Info** — Device Serial No., Firmware Version, Hardware
   Version, Device Model, Configuration Version
7. **24-Hour Consumption** — hourly breakdown for the day

**New, from this revision:**
8. **Battery level** (%) — shown as a live-ish column on the Customers
   grid/list in the reference site. Assumed present in the payload; not
   in the original handwritten spec (DATAFLOW.md §5.1 flags it as added).

**Payload shape remains assumed, not confirmed** (DATAFLOW.md §5) — this
revision does not resolve that; it only adds the new assumed fields the
new UI needs (battery, current flow rate).

## 2. Goal
Build a Next.js fullstack app that:
- Ingests the daily push from up to ~20,000 meters and stores it durably.
- Groups and filters meters by **Customer** and **GA**, not just device ID.
- Surfaces fleet health at a glance (Overview), spatially (Map View), by
  customer (Customers page), and by exception (Alarms).
- Raises alarms automatically for missing data and abnormal gas readings.
- Generates the three report types identified in the reference site
  (Reports page — now in scope, see §3).

## 3. Non-Goals (for this phase)
- Real-time/streaming telemetry. The reference site's "live" feel (ticking
  clock, streaming event feed, 1.8s simulated polling) is a demo effect —
  our meters push **once a day**. Anywhere the UI implies "live," it will
  actually mean "as of the latest daily push." See §8.3.
- Writing values back to the meter/device (`write-server`/`priceWrite.js`
  SSH+ubus flow — unchanged, out of scope, see DATAFLOW.md §3).
- Multi-tenant customer logins / billing / per-user accounts. The
  reference site's "Guest User" and per-user "mark notifications as read"
  are UI dressing for a demo; our v1 has one shared internal view (basic
  auth gate), so alarm acknowledgment is a single shared flag, not
  per-user read state (DESIGN.md §3 note).
- Full leak/tamper sensor detection referenced in the reference site's
  Settings page ("Notify operators on leak / tamper signatures"). That
  requires sensor signal types we have no spec for. Not built; flagged as
  an open item (§9) if the business wants it later.
- **"Operations" and "System" pages/nav items** seen in the reference
  site's top navigation — their content could not be determined (§8.2).
  Not built this phase; flagged in §9 for the team lead to clarify.

## 4. Users
- Internal ops/engineering staff monitoring meter fleet health, gas
  readings, and now customer/GA-level consumption reporting.

## 5. Functional Requirements

### FR1 — Ingestion at Fleet Scale (unchanged)
Single `POST /api/ingest` endpoint; device identifies itself by
`deviceSerialNo`. See DATAFLOW.md §1–§4.

### FR2 — GA (Geographical Area) Registry — **new**
A GA has a name/code and, optionally, a parent GA (for hierarchy — e.g.
region > GA, if the business needs it; kept as a self-relation so it's
usable without forcing a fixed number of levels). GAs are the top-level
grouping used for "GA-wise consumption" and as a filter across Overview,
Map View, Customers, and Alarms.

### FR3 — Customer Registry — **new**
A customer has a name, category (Industrial / Commercial / Residential /
Bulk), address, and belongs to one GA. A customer can own one or more
meters (Devices). **Customer/GA data does not come from the meter
payload** — meters report technical readings, not who owns them or where
they're billed. Customers and GAs must be created/assigned through an
admin flow (FR3a), and a Device can exist with no Customer assigned yet
("Unassigned" bucket) until someone maps it. See DATAFLOW.md §7.

### FR3a — Device-to-Customer Assignment — **new**
A minimal admin flow to: create a GA, create a Customer under a GA, and
assign a Device (by serial number) to a Customer. No approval workflow,
no bulk import UI required for v1 — a basic form is enough; bulk
CSV import is a natural fast-follow, not required now.

### FR4 — Device Registry (unchanged, extended)
Device info as before, plus: optional `customerId` (nullable — see FR3),
optional latitude/longitude (for Map View — set during provisioning, not
from the payload, since meters don't report GPS coordinates; see
DATAFLOW.md §5.1).

### FR5 — Reading History (unchanged, extended)
Daily reading per device, now also storing `batteryLevel` and
`currentFlowRate` (both assumed payload fields, DATAFLOW.md §5.1).

### FR6 — Overview Page — **extended**
- Monthly consumption total (SCMH-equivalent).
- Consumption by category (Industrial / Commercial / Residential / Bulk).
- Top 5 and Least 5 consuming customers (by latest flow/volume).
- **GA-wise consumption** (per handwritten spec item 1).
- Recent activity feed — latest ingested readings/alarms, explicitly
  framed as "recent," not literally live/streaming (§3, §8.3).
- Open alarm count, reported-today vs. not (carried over from v1 PRD).

### FR7 — Map View Page — **new**
Map showing device markers (or clusters at fleet scale), colored by
derived status (Normal / Anomaly / Alert / Offline — see FR11). Hover for
a quick read (customer name, last reading, status); click through to
meter/customer detail. Only devices with a set lat/long appear on the map
(FR4) — devices without location are visible elsewhere (Customers page,
Meter Table) but not on the map.

### FR8 — Customers Page — **new**
Grid and list views (toggle) of all customers, each showing their meter(s)
and latest telemetry (flow, pressure, battery, derived status). Filters:
GA, status, category. Search by customer name / meter / device serial.
Server-side paginated at fleet scale (10k–20k rows) — same constraint as
the old "Meter Table" requirement, now reframed around Customer as the
primary row instead of raw Device.

### FR9 — Alarms Page — **extended**
Two alarm conditions (unchanged from v1, see DATAFLOW.md §6):
1. Missing data (one alarm per device per missed day).
2. Gas value out of range (own recent average, threshold-based).

**New in this revision:**
- Each alarm has a **severity** (Critical / Warning) in addition to its
  existing status (Open / Resolved) — see DESIGN.md §3 for the assumed
  mapping.
- Filterable by severity and status; searchable.
- **CSV export** of the current filtered alarm list.
- **Acknowledge** action (single shared flag, not per-user — §3) so the
  header bell's unread count can go down without necessarily resolving
  the underlying condition.

### FR10 — Header Notifications — **extended**
Bell icon with open/unacknowledged alarm count; dropdown lists recent
alarms with a "mark all read" action (sets `acknowledged`, doesn't change
`status`); links through to the Alarms page.

### FR11 — Derived Status (Normal / Anomaly / Alert / Offline) — **new,
cross-cutting**
Used on the Customers page, Map View, and Overview. **Not a stored
column** — computed at query time from a device's latest reading age and
open alarms, so there's one source of truth (its alarms), not two things
that can drift apart:
- **Offline** — no reading within the expected window (same condition
  that produces a MISSING_DATA alarm).
- **Alert** — has an open alarm with severity Critical.
- **Anomaly** — has an open alarm with severity Warning, and is not
  Offline/Alert.
- **Normal** — none of the above.

### FR12 — Reports Page — **now in scope** (was deferred in v1)
Three report types, matching the reference site's structure, renamed to
this project's vocabulary:
1. **Monthly Consumption Summary** — GA-wise draw totals, reporting
   uptime (% of devices that reported on schedule), top-consuming meters.
2. **Leak & Anomaly Detection Report** — active/recent
   GAS_OUT_OF_RANGE alarms with device, customer, GA, and severity.
3. **GA-wise Meter Audit** — full registry export: readings, flow,
   pressure, battery for every connected meter, grouped by GA.
Each generates a downloadable PDF from current data (no historical
report archive required for v1 — generate on demand).

### FR13 — Navigation & Sidebar (unchanged principle, extended set)
Sidebar: Overview, Map View, Customers, Alarms, Reports. ("Operations" and
"System" omitted pending clarification, §9 — easy to add once their scope
is known, since the sidebar is just a list of routes.)

### FR14 — Data Integrity (unchanged)
Raw payload stored alongside parsed columns (FR9 in v1 PRD, renumbered
here as part of FR5/Reading History).

## 6. Success Criteria (extended)
- All v1 success criteria still hold (ingestion latency, meter-table
  responsiveness at fleet scale, missing-data/out-of-range alarms firing
  correctly).
- A newly-provisioned meter with no Customer assigned is still visible
  and queryable (in an "Unassigned" state), not silently dropped.
- Map View stays responsive with thousands of markers (clustering, not a
  naive marker-per-device render).
- Each of the 3 report types produces a PDF that matches what's on screen
  for the same filter/time window.

## 7. Data Model Summary (see DESIGN.md §3 for full schema)
Six tables: `GeographicalArea`, `Customer`, `Device`, `Reading`, `Alarm`,
`AlarmSettings` (the last one holds the configurable deviation
threshold/window instead of hardcoding it, so ops can tune it without a
redeploy).

## 8. How the Reference Site Was Analyzed (method + honest limits)
- **Method used:** fetched the live URL's rendered HTML/content directly.
  The site is a client-rendered SPA with simulated data (counts read "0
  meters" / "0 customers" in the static fetch, with a note that figures
  are a "simulated demo feed"), so the fetch returned the **full static
  structure** — every nav item, section heading, table column header,
  filter option, and report card label — even though the live numbers
  themselves are demo-only.
- **What this method could NOT do:** click buttons, apply a filter and
  observe the result, trigger a CSV/PDF download and inspect its
  contents, or exercise search/sort interactions. This environment has no
  interactive browser control — only a static content fetch. So "tested
  fully" in the original ask is not literally accurate; what happened is
  a **structural analysis** of every page's declared layout and controls,
  not a click-through QA pass. If literal interactive verification (e.g.
  confirming what a downloaded PDF actually contains, or how sort
  behaves) matters before committing to a design detail, that needs a
  human to click through the reference site directly — flagged in §9.
- **What was found** (full detail in DATAFLOW.md §8 / DESIGN.md, summary
  here): nav = Overview, Map View, Customers, Operations, Alarms,
  Reports, System, Settings, plus a header notification bell and
  light/dark toggle. Overview has monthly consumption, consumption by
  category, top-5/least-5 tables, GA-wise ("draw by city") chart, and a
  live event feed. Map View has clustered markers with a
  Normal/Anomaly/Critical legend. Customers has grid/list toggle and
  city/status/category filters. Alarms has All/Critical/Warning/Resolved
  filter tabs, an alarm log table, and CSV export. Reports has exactly
  the 3 report cards listed in FR12. Settings has appearance, alerting
  toggles, and a polling-interval control — explicitly marked as
  "demo placeholders, not persisted" on the site itself.

## 9. Open Items Requiring Clarification
- **"Operations" and "System" nav items** — content unknown (§8); need
  either a description from the team lead or a manual click-through, since
  they weren't visible in the static analysis.
- **Leak/tamper alarm type** — reference site's Settings page implies it,
  but no sensor signal is specified anywhere in our own spec. Not built;
  confirm if wanted.
- **Low-battery alarm** — battery level is now a tracked/displayed field
  (§1 item 8), and the reference site's Settings page implies a
  low-battery alarm concept ("auto-acknowledge low-battery warnings").
  Not added as a third alarm type in this revision — only MISSING_DATA
  and GAS_OUT_OF_RANGE are built — flagged here as a likely near-term ask
  rather than added speculatively.
- **Alarm severity mapping** — assumed MISSING_DATA → Critical,
  GAS_OUT_OF_RANGE → Warning (DATAFLOW.md §6). Confirm with the business;
  arbitrary otherwise.
- **GA vs. "City"** — the reference site's UI literally says "city" in a
  few places (Customer table's City column, "Draw by city" chart, "City-
  wise Meter Audit" report). This PRD treats **GA as the equivalent
  grouping concept** for our domain (GA is the correct CGD industry term,
  and matches the handwritten spec's "GA wise consumption"). If a GA can
  legitimately span multiple physical cities (common in real CGD
  licensing), a separate `city` field on Customer may be needed in
  addition to GA — not added in this revision; flagged for confirmation.
- Everything carried over unresolved from v1 PRD §7 (payload structure,
  deviation threshold/window defaults, create-on-first-push assumption). 