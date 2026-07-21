# DATAFLOW — EVC Gas Meter Dashboard

## 1. Read Path (Meter → Dashboard)

```
[EVC Meter]
      │  Modbus registers
      ▼
[4G Modem/Gateway, per device]
      │  once per day, HTTP POST, JSON body
      ▼
[Internet]
      ▼
[Next.js API route: POST /api/ingest]   (single fleet-wide endpoint — see
      │                                  DESIGN.md §4; device identifies
      │                                  itself via deviceSerialNo in body)
      │  1. store rawPayload immediately (JSONB)
      │  2. parse known fields → Reading columns
      │  3. upsert Device (by deviceSerialNo), update lastSeenAt
      │  4. upsert on (deviceId, readingDate) — a re-push for the same
      │     day overwrites rather than duplicates
      │  5. run the gas-out-of-range alarm check for this device/day
      │     (see §6.2)
      ▼
[Postgres]
      │
      ▼
[Next.js read API routes]  ── /api/overview, /api/devices, /api/devices/
      │                        [id]/latest, /history, /hourly, /api/alarms
      ▼
[Dashboard UI]  Overview + Meter Table + Meter Detail (KPI cards + charts)
                + Alarms page, rendered on request (no polling needed
                since data only changes once/day — a simple page load or a
                slow client-side refetch interval is enough)
```

## 2. Ingestion Detail
- Old behavior (`http-server/index.js`, confirmed by the current
  repository): `app.post("/pune/s1", ...)` and `app.post("/pune/s2", ...)`
  just `console.log(req.body)` and return
  `{message: "Data received successfully"}`. This confirms the
  device → server connection works, but nothing is kept, and — same
  finding as before — a route per site/station doesn't scale to 20k
  devices (FR1).
- New behavior: same acknowledgment contract (device just needs a 2xx),
  but there is now **one** ingestion route (`POST /api/ingest`) for the
  whole fleet, the body is persisted before responding, and the device is
  identified by `deviceSerialNo` inside the JSON body rather than by URL
  path.
- One POST per device per day is the expected cadence. If two POSTs land
  for the same device on the same calendar day (e.g. a retry), the second
  upserts over the first rather than creating a duplicate row — treat the
  *latest* push for a given day as authoritative.
- No data loss if the dashboard/DB is briefly down — the endpoint just
  needs to come back up; the device retries per its own configuration
  (FR1). No queuing layer is assumed necessary for v1 at this cadence
  (once/day/device); revisit only if retry behavior at 20k devices proves
  otherwise.

## 3. Write Path (separate — Admin → Meter, not part of the dashboard)

```
[Operator, via write-server CLI]
      │  enters "<tag> <value>"
      ▼
[write-server/index.js]
      │  builds: ubus call modbus_client.rpc set_tag_value
      │           '{"id":"<tag>","values":["<value>"]}'
      ▼
[SSH to router 192.168.2.11]
      │
      ▼
[ubus / modbus_client on the Teltonika router]
      │
      ▼
[Value written to a Modbus tag on the router]
```
This is how a tag value (e.g. a price or a reference/calibration value) gets
pushed *into* the meter's Modbus config — it does not touch the dashboard's
database and doesn't feed the read path above. Kept as a separate internal
CLI tool unless there's a reason to expose it as an admin action in the
dashboard UI later.

## 4. Failure / Edge Cases to Design For
- **A device doesn't push on a given day** (network/power issue at the
  meter): dashboard should show the gap (last-known date + "N days
  stale"), not silently repeat yesterday's numbers as if they were fresh.
  This also feeds the MISSING_DATA alarm (§6.1).
- **Payload arrives but doesn't parse** (unexpected shape, or missing
  `deviceSerialNo`): still store `rawPayload` if a serial number can be
  identified at all, log/flag the failure, don't 500 in a way that makes
  the device retry-storm the endpoint. If `deviceSerialNo` itself is
  missing or unrecognized, reject with a clear 4xx (nothing to key the row
  on) rather than guessing.
- **Out-of-order arrival** (payload for an older date arrives after a
  newer one, e.g. after a device reboot/buffer flush): upsert by
  `readingDate`, not by "most recent row wins" — so a late day fills its
  own slot correctly.

## 5. Assumed JSON Payload Shape (do not treat as final)

**Status: assumed, not confirmed.** Per direction from the team lead, this
shape is used to build against now and will be corrected once a real
device payload is captured — a deliberate, acknowledged risk (see PRD.md
§1, §7), not an oversight. Nothing here is looked up from a vendor spec;
Teltonika's "Data to Server" feature sends a JSON template that's
hand-configured on the device itself (Services → Data to Server), using
placeholder syntax that gets substituted with live Modbus register values
at send time — so the actual field names are whatever was typed into that
template, and can only be confirmed by reading that config or capturing a
live push (see §5.2 below, kept as the verification path for later).

### 5.1 Assumed structure

Field names below map 1:1 to the handwritten spec in PRD.md §1 (Volume,
Pressure, Temperature, Gas Properties, Meter Info, Device Info, 24-Hour
Consumption). Grouped by concern for readability; the real payload may be
flatter or nested differently — the parser (§2, DESIGN.md §4) should treat
this as a best guess to reconcile against real data, not a contract to
enforce strictly.

```json
{
  "deviceSerialNo": "EVC-000123",
  "meterSerialNo": "MTR-98765",
  "meterSize": "4 inch",
  "firmwareVersion": "1.2.3",
  "hardwareVersion": "A1",
  "deviceModel": "EVC-X200",
  "configurationVersion": "v5",
  "timestamp": "2026-07-20T23:59:00+05:30",
  "readingDate": "2026-07-20",
  "volume": {
    "correctedVb": 12345.67,
    "uncorrectedVm": 12000.12
  },
  "pressure": {
    "value": 4.2,
    "max": 4.5,
    "min": 3.9,
    "unit": "barg"
  },
  "temperature": {
    "value": 28.4,
    "max": 31.2,
    "min": 24.1,
    "unit": "degC"
  },
  "gasProperties": {
    "compressibilityZ": 0.98,
    "compressibilityFpv": 1.02,
    "correctionFactorC": 1.015,
    "density": 0.72
  },
  "hourlyConsumption": [
    { "hour": 0, "value": 12.3 },
    { "hour": 1, "value": 11.8 },
    { "hour": 23, "value": 9.8 }
  ]
}
```

Assumptions baked into this shape, to revisit once real data is in hand:
- `deviceSerialNo` is present on every push (required — it's the upsert
  key for `Device` and `Reading`).
- Device info (`firmwareVersion`, `hardwareVersion`, `deviceModel`,
  `configurationVersion`) is assumed present on *every* push, not just the
  first. If the real device only sends it occasionally, the ingestion
  upsert should only overwrite fields actually present rather than nulling
  previously-known values (see DESIGN.md §3 note).
- `readingDate` is sent explicitly rather than derived from `timestamp` —
  assumed, since the meter/gateway knows its own local day boundary better
  than the server would guessing from a UTC timestamp.
- `hourlyConsumption` is an array of `{hour, value}` objects (not a fixed
  24-key object) — assumed for flexibility if a partial day is ever sent.
- Units (`barg`, `degC`) are assumed fixed/known rather than sent per
  payload; the `unit` fields above are included defensively in case the
  device does send them, but are not required by the parser.

### 5.2 Verifying the real shape later (kept for when a real payload is
available)
1. **Fastest path — read the config directly:** on the device's web UI,
   go to Services → Data to Server, open the sender instance(s), and read
   the "JSON format" field. This shows the exact field names and structure
   without waiting for a live push.
2. **Fallback / cross-check — capture a live payload:** temporarily log
   `JSON.stringify(req.body)` to a file (not just stdout) on `/api/ingest`,
   or point a device at a request-bin/webhook logger for one push cycle.
3. Confirm: field names, whether hourly consumption is an array or object,
   units (embedded or implied?), whether device info comes on every push
   or only sometimes, and whether `readingDate` is sent explicitly or needs
   deriving.
4. Once confirmed, update this section, DESIGN.md §3, and the parser in
   the same change (DEVELOPMENT_RULES.md §6) — don't let this doc drift
   from the real shape once it's known.

## 6. Alarm Generation Logic

Two conditions, per PRD.md FR6. Both write to the `Alarm` table
(DESIGN.md §3) with `@@unique([deviceId, type, forDate])` so re-running
either check is idempotent — no duplicate alarms for the same device/day.

### 6.1 Missing data (`AlarmType.MISSING_DATA`)
- A scheduled job (e.g. a daily cron, run after the expected push window
  for the fleet — exact time TBD, assumed end-of-day) walks all `Device`
  rows and checks `lastSeenAt` / whether a `Reading` exists for today's
  `readingDate`.
- If a device has no `Reading` for the expected day, upsert an `Alarm`:
  `type: MISSING_DATA`, `forDate: <that day>`,
  `cause: "No data received for <date>"`, `gasValue: null`.
- One alarm per device per missed day (not one alarm that keeps
  re-triggering for the same day).
- Optional (v1 can skip, revisit if useful): auto-set `status: RESOLVED`
  on the existing `MISSING_DATA` alarm for a device once a `Reading`
  successfully lands for that same date (e.g. a late/retried push fills
  the gap after the alarm already fired).

### 6.2 Gas value out of range (`AlarmType.GAS_OUT_OF_RANGE`)
- Runs inline, right after a `Reading` is upserted during ingestion (§1
  step 5) — no separate job needed since it's per-push, not per-day-batch.
- **Metric**: corrected volume (`correctedVolumeVb`), per PRD.md §7's
  stated assumption unless told otherwise.
- **Comparison window**: trailing 7 days of `Reading.correctedVolumeVb`
  for that device, excluding the day just ingested (assumed — PRD.md §7
  flags the window as needing a real number from the business).
- **Threshold**: assumed ±20% deviation from that trailing average
  (placeholder so the feature is buildable now — PRD.md §7 flags this as
  needing a real number too).
- If today's value falls outside `[average − 20%, average + 20%]`, upsert
  an `Alarm`: `type: GAS_OUT_OF_RANGE`, `forDate: readingDate`,
  `gasValue: <today's value>`, `averageValue: <trailing average>`,
  `cause: "Corrected volume <value> is <N>% above/below the 7-day average
  of <average>"`.
- If fewer than, say, 3 prior days of history exist for the device yet,
  skip the check for that push (not enough data to call anything
  "abnormal") rather than comparing against a near-empty window.