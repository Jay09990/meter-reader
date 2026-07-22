# DATAFLOW — EVC Gas Meter Dashboard (v2 — GA/Customer scope)

## 1. Read Path (Meter → Dashboard) — unchanged shape, extended parsing

```
[EVC Meter] → [4G Modem/Gateway] → [Internet] → POST /api/ingest
      1. store rawPayload
      2. parse known fields → Reading columns (+ batteryLevel,
         currentFlowRate — new, see §5.1)
      3. upsert Device (by deviceSerialNo), update lastSeenAt
         (Device.customerId is untouched here — ingestion never sets it;
         see §7)
      4. upsert Reading on (deviceId, readingDate)
      5. run the GAS_OUT_OF_RANGE check using AlarmSettings (not a
         hardcoded threshold — see §6.2)
      ▼
[Postgres] → read API routes → Dashboard UI
```

## 2. Ingestion Detail (unchanged from v1)
Same acknowledgment contract, same upsert-by-day behavior, same
identify-by-`deviceSerialNo` approach. See v1 notes — nothing about the
ingestion mechanics themselves changed this revision; only what gets
parsed out of the payload (§5.1) and what happens after (§6) changed.

## 3. Write Path — Modbus (unchanged, out of scope)
Same as v1 — `write-server`/`priceWrite.js` SSH+ubus flow, separate from
the dashboard entirely.

## 4. Failure / Edge Cases (unchanged from v1)
Same three cases — device doesn't push, payload doesn't parse,
out-of-order arrival. Nothing new here.

## 5. Assumed JSON Payload Shape — extended

**Status: still assumed, not confirmed** (PRD.md §1, §9 — this revision
doesn't resolve that; see v1 DATAFLOW.md §5.2 for the verification path,
unchanged, still pending).

### 5.1 What's new in the assumed shape
Two fields added to support the reference-site-driven UI, on top of the
v1 assumed shape:

```json
{
  "...": "...(all v1 fields unchanged)...",
  "batteryLevel": 87.5,
  "currentFlowRate": 14.2
}
```

- **`batteryLevel`** (%) — new. Assumed present because the reference
  site's Customers grid shows a live Battery column per meter. If the
  real payload doesn't send this, the column either goes blank or needs a
  separate battery-telemetry source — flag if that's the case once a real
  payload is seen.
- **`currentFlowRate`** (SCMH) — new. Assumed present to back the
  Customers-page and Overview "Flow" values without recomputing from
  `hourlyConsumption` on every read. **Fallback if not sent:** derive it
  from the last entry in `hourlyConsumption` for that day — document
  whichever path is actually taken once real data is seen, per
  DEVELOPMENT_RULES.md §6 (update this doc in the same change as the
  parser).
- **No latitude/longitude in the payload** — meters are fixed
  installations; GPS coordinates are set once during device provisioning
  (DESIGN.md §3 `Device.latitude/longitude`), via the admin assignment
  flow (§7), not sent daily. If the device hardware does report GPS,
  that's a schema-compatible addition later (add the columns are already
  there — just start populating them from the payload instead of the
  admin form).
- **No customer/GA/name/address in the payload** — confirmed absent by
  reasoning about what a gas meter actually measures, not assumed away
  for convenience. This drives FR3/FR3a's separate admin-managed write
  path (§7).

## 6. Alarm Generation Logic — extended with severity + configurable
thresholds

Same two conditions as v1 (`MISSING_DATA`, `GAS_OUT_OF_RANGE`), same
`@@unique([deviceId, type, forDate])` idempotency. What's new:

### 6.1 Missing data (`AlarmType.MISSING_DATA`)
Unchanged trigger logic from v1. **New:** severity is set to
`AlarmSeverity.CRITICAL` when the alarm is created — assumed mapping
(PRD.md §9, needs confirmation), on the reasoning that a device going
completely dark is a bigger operational problem than a reading being
somewhat off.

### 6.2 Gas value out of range (`AlarmType.GAS_OUT_OF_RANGE`)
Unchanged trigger point (inline, right after `Reading` upsert) and
unchanged metric assumption (corrected volume `Vb`, PRD.md §9). **What's
new:**
- Window and threshold are now read from the singleton `AlarmSettings`
  row (DESIGN.md §3) instead of hardcoded — defaults ship as the same
  values v1 assumed (7-day window, ±20%), but are now tunable from
  `/dashboard/settings` without a redeploy.
- Severity is set to `AlarmSeverity.WARNING` — assumed mapping (PRD.md
  §9, needs confirmation). No escalation-to-Critical-at-a-higher-
  threshold logic is built in this revision (would need a second
  threshold from the business — not specified, not invented).
- Still skips the check if fewer than ~3 prior days of history exist for
  the device (unchanged from v1).

## 7. GA / Customer / Device Assignment Flow — new

This is a **separate write path from ingestion**, driven by a human via
the admin UI (PRD.md FR3a, DESIGN.md §5 "Admin"), not by anything a meter
sends:

```
[Ops user, via admin UI]
      │  1. create GeographicalArea (name, optional code/parent)
      ▼
      │  2. create Customer (name, category, address, gaId)
      ▼
      │  3. assign Device (lookup by deviceSerialNo) → customerId
      │     (optionally set latitude/longitude here too, for Map View)
      ▼
[Postgres — Device.customerId, Device.latitude/longitude updated]
```

Until step 3 happens for a given device, it still ingests and stores
Readings normally (FR4/DESIGN.md §3 — `customerId` is nullable) — it just
shows as "Unassigned" on the Customers page and doesn't appear on the Map
View (no lat/long yet). This means the Customers page and Meter
table/detail pages need to handle an unassigned state gracefully, not
treat it as an error state.

## 8. Reference Site Analysis Notes (Altrex CGD Gas AMR Console)
Full write-up and honest method/limits are in PRD.md §8 — this section
just cross-references the parts that fed schema/flow decisions above:
- Customers grid's Flow/Pressure/Battery/Status columns → drove
  `batteryLevel`/`currentFlowRate` additions (§5.1) and the derived-status
  logic (DESIGN.md §3 note, PRD.md FR11).
- Map View's clustered markers → drove `Device.latitude/longitude` +
  the lean `/api/map/devices` endpoint (DESIGN.md §4).
- Alarms page's severity tabs + CSV export → drove `Alarm.severity` +
  `/api/alarms/export` (DESIGN.md §3, §4).
- Reports page's 3 report cards → drove FR12 and the 3 report API routes
  verbatim in structure, renamed to this project's GA vocabulary.
- Settings page's alerting/threshold language → drove `AlarmSettings`
  being a real, editable table instead of a hardcoded constant.
- Reference site's "live"/streaming framing was **deliberately not
  carried over as a technical requirement** — see PRD.md §3, §8.3 — since
  our actual cadence is once/day per device, unlike the demo's simulated
  polling.