# IMPLEMENTATION PLAN — EVC Gas Meter Dashboard

## Phase 0 — Ground Truth (non-blocking, revisit when possible)
- [x] Payload structure — **assumed** per team-lead direction, documented
      in DATAFLOW.md §5. Not blocking further phases; correct the schema
      and parser together (DEVELOPMENT_RULES.md §6) once a real payload is
      captured (DATAFLOW.md §5.2).
- [ ] Confirm alarm thresholds with the business: trailing-average window
      and deviation % for FR6.2 (currently assumed 7-day / ±20%, see
      DATAFLOW.md §6.2 and PRD.md §7).
- [ ] Confirm devices are create-on-first-push (current assumption, PRD.md
      §7) vs. pre-provisioned.

## Phase 1 — Project Scaffold
- [x] `create-next-app` (App Router, TypeScript, Tailwind).
- [x] Set up Postgres + Prisma; write the schema from DESIGN.md §3 — `Device`, `Reading`, `Alarm` (3 tables).
- [x] `.env` for DB connection string and an ingestion shared secret.
- [x] App shell: Sidebar (Overview / Meters / Alarms / Reports) + Header with notification bell placeholder.

## Phase 2 — Ingestion API
- [x] `POST /api/ingest` — single fleet-wide endpoint (FR1). Validate, store `rawPayload`, parse into `Reading` columns, upsert `Device` by `deviceSerialNo` (update `lastSeenAt`).
- [x] Point a test script (replaying the assumed payload from DATAFLOW.md §5.1) at the new endpoint and confirm end-to-end write into Postgres.
- [x] Handle the edge cases from DATAFLOW.md §4 (same-day re-push, bad shape, missing `deviceSerialNo`, out-of-order date).
- [x] Wire the gas-out-of-range alarm check inline on ingest (DATAFLOW.md §6.2).

## Phase 3 — Read API
- [x] `GET /api/overview`
- [x] `GET /api/devices` (paginated + searchable)
- [x] `GET /api/devices/[id]/latest`
- [x] `GET /api/devices/[id]/history?days=N`
- [x] `GET /api/devices/[id]/hourly?date=YYYY-MM-DD`
- [x] `GET /api/alarms` (paginated, filterable by type/status)
- [x] `GET /api/alarms/count` (or fold into `/api/overview`)

## Phase 4 — Dashboard UI: Overview, Meter Table, Alarms
- [x] Overview page (`/dashboard`) — fleet summary cards (FR4).
- [x] Meter Table page (`/dashboard/meters`) — server-side paginated,
      searchable device list (FR5).
- [x] Alarms page (`/dashboard/alarms`) — filterable, most-recent-first
      list (FR6).
- [x] Wire the header notification bell to `/api/alarms/count` (FR7).
- [x] Reports nav entry → "coming soon" placeholder only (not built this
      phase — PRD.md §3).

## Phase 5 — Meter Detail UI: KPIs & Charts
- [x] Meter detail page (`/dashboard/meters/[id]`) — KPI card row (Volume,
      Pressure, Temperature, Gas Properties, Meter Info).
- [x] "Data is N days old" staleness indicator.
- [x] Hourly consumption bar chart (per day, with date picker).
- [x] Trend line charts (Volume / Pressure / Temperature) over 7/30/90-day
      ranges.
- [x] Device Info panel (collapsible).

## Phase 6 — Missing-Data Alarm Job & Polish
- [x] Scheduled job for `MISSING_DATA` alarm generation (DATAFLOW.md
      §6.1).
- [x] Basic auth middleware (shared password) to gate the dashboard.
- [x] Add loading/empty states polish to meter detail page (skeleton loaders).

## Phase 7 — Deployment
- [ ] Deploy Next.js app + Postgres.
- [ ] Point real devices at the production `/api/ingest` URL.
- [ ] Monitor the first few real daily pushes, and use them to correct
      DATAFLOW.md §5 / DESIGN.md §3 per DEVELOPMENT_RULES.md §6, before
      decommissioning the old `http-server`.

## Explicitly Deferred (not v1)
- Reports page (nav stub only — PRD.md §3).
- Folding `write-server`/`priceWrite.js` into the dashboard as an admin UI
  action.
- Multi-tenant auth / per-customer access.
- Real-time/streaming updates (not applicable — devices push once/day).
- Alarm notification delivery (email/SMS/push) — v1 is in-app only.