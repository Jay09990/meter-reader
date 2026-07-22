# IMPLEMENTATION PLAN — EVC Gas Meter Dashboard (v2 — GA/Customer scope)

## Status coming into this revision
Per `AGENT-LOOP.md`, Phases 0–6 of the **v1 plan** (3-table Device/
Reading/Alarm fleet model: ingestion, read API, Overview/Meter-
Table/Alarms UI, meter detail KPIs/charts, missing-data job, basic auth)
were already implemented and green. **This is a migration on top of a
working system, not a greenfield build.** The phases below (A–H) assume
that baseline exists and extend/restructure it — don't re-scaffold, don't
redo work that's already correct, and don't break what's passing (all of
DEVELOPMENT_RULES.md §5 applies with extra force here, since there's now
real working code to protect, not just docs).

## Phase A — Schema Migration (blocking, do first)
- [ ] Add `GeographicalArea`, `Customer`, `AlarmSettings` models
      (ARCHITECTURE-DESIGN.md §3).
- [ ] Extend `Device` with `customerId` (nullable), `latitude`,
      `longitude`.
- [ ] Extend `Reading` with `batteryLevel`, `currentFlowRate`.
- [ ] Extend `Alarm` with `severity` (backfill existing rows —
      MISSING_DATA→CRITICAL, GAS_OUT_OF_RANGE→WARNING, per DATA-FLOW.md
      §6) and `acknowledged` (default false).
- [ ] Seed one `AlarmSettings` singleton row with the existing hardcoded
      defaults (7 days / 20%) so behavior doesn't silently change on
      deploy.
- [ ] Confirm: is there real production data yet, or is everything so far
      still test/demo data? If the latter, some of the above can be a
      clean migration rather than a careful data-preserving one — check
      before writing migration scripts, don't assume.

## Phase B — Admin: GA / Customer / Device Assignment (new feature)
- [ ] `POST /api/gas`, `PATCH /api/gas/[id]`.
- [ ] `POST /api/customers`, `PATCH /api/customers/[id]`.
- [ ] `PATCH /api/devices/[id]/assign` (sets `customerId`, optionally
      `latitude`/`longitude`).
- [ ] Minimal admin UI: create GA form, create Customer form, assign
      Device form. Functional over polished (PRD.md FR3a).
- [ ] Ingestion (`POST /api/ingest`) must remain untouched by this phase
      except for parsing the two new Reading fields (Phase C) — assigning
      a customer is a human action, never something ingestion infers.

## Phase C — Ingestion Extension
- [ ] Parse `batteryLevel`, `currentFlowRate` from the payload (with the
      `hourlyConsumption`-derived fallback for `currentFlowRate` if
      absent — DATA-FLOW.md §5.1).
- [ ] Wire the `GAS_OUT_OF_RANGE` check to read from `AlarmSettings`
      instead of the old hardcoded constant.
- [ ] Set `severity` on newly created alarms per the assumed mapping.
- [ ] Re-run existing ingestion tests — they must still pass unchanged in
      behavior for the fields that didn't move (DEVELOPMENT_RULES.md §5).

## Phase D — Derived Status (shared logic, build once)
- [ ] One function/module computing Normal/Anomaly/Alert/Offline for a
      device (PRD.md FR11) — used by Customers page, Map View, and
      Overview. Build this before D/E/F below so nobody reimplements it.

## Phase E — Customers Page
- [ ] `GET /api/customers` (paginated, searchable, filterable by GA/
      status/category).
- [ ] `GET /api/customers/[id]`.
- [ ] Customers page UI: grid/list toggle, filters, search, pagination.

## Phase F — Map View
- [ ] `GET /api/map/devices` (lean payload, lat/long required).
- [ ] Map View page: clustered markers (Leaflet + clustering), legend,
      hover quick-read, click-through to device detail, GA filter.

## Phase G — Alarms Extension
- [ ] `severity` + `search` filters on `GET /api/alarms`.
- [ ] `GET /api/alarms/export?format=csv`.
- [ ] `PATCH /api/alarms/[id]/acknowledge`,
      `PATCH /api/alarms/acknowledge-all`.
- [ ] Alarms page UI: severity/status filter tabs, search, export button,
      acknowledge action.
- [ ] Header bell: wire to unacknowledged-open count; dropdown + "mark
      all read."

## Phase H — Overview Extension & Reports
- [ ] `GET /api/overview` extended: monthly consumption, consumption by
      category, top-5/least-5 customers, GA-wise consumption, recent
      activity feed.
- [ ] Overview page UI: new charts/tables (Recharts).
- [ ] `GET /api/reports/monthly-consumption`, `/leak-anomaly`,
      `/ga-meter-audit`.
- [ ] Reports page UI: 3 cards, "Download PDF" per card.
- [ ] Settings page: `AlarmSettings` read/edit UI, wired to
      `GET`/`PUT /api/settings/alarms`.

## Phase I — Deployment (was Phase 7 in v1 — unchanged, moved to last)
- [ ] Deploy, point real devices at `/api/ingest`, monitor first real
      pushes, correct docs per DEVELOPMENT_RULES.md §6 once a real
      payload is seen.

## Explicitly Deferred (unchanged + additions)
- Multi-tenant auth / per-customer login, real-time/streaming updates,
  alarm notification delivery — same as v1.
- "Operations" and "System" nav items from the reference site — content
  unknown (PRD.md §9), not built until clarified.
- Leak/tamper alarm type, low-battery alarm type — flagged in PRD.md §9
  as likely near-term asks, not built speculatively.
- Bulk CSV import for Customer/Device assignment — a form is enough for
  v1 (PRD.md FR3a); bulk import is a natural fast-follow.
- GA hierarchy depth / a separate `city` field distinct from GA — flagged
  in PRD.md §9, not built until confirmed which model is right.