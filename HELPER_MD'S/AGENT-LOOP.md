# AGENT_LOOP.md

Read this file at the start of every session, before making changes.
Update it at the end of every session, after making changes. This is the
single place that answers: *how far are we, what's broken, what's next* —
so debugging doesn't require re-deriving state from git history or memory.

This file tracks state. `IMPLIMENTATION-PLAN.md` defines the plan. Don't
duplicate the plan's task list here — reference phase letters from it
(the plan was rewritten with lettered phases A–I for this revision; see
§4 below for how that maps to the old numbered phases 0–7).

---

## 0.0 Token Efficiency (use ponytail + caveman for this loop)
Unchanged from before — see DEVELOPMENT-RULES.md §7. Terse check output,
smallest-diff fixes, terse status updates in this file, isolation/testing
still non-negotiable.

## 0. Self-Check Protocol (run this every session, in order)
Unchanged — read this file, run typecheck/lint/prisma validate/test/build
and trust reality over the file's last claim, cross-check against
IMPLIMENTATION-PLAN.md, do the work, re-run checks, update this file.

## 1. Current Status

- **Current phase:** System meter-capacity enforcement and operations UI added
- **Last verified green:** 2026-07-22 (Zero Lint & TS Errors, Build Succeeded)
- **Last session summary:** Increased the shared radius to 0.875rem and default Card spacing to spacing(6). Removed duplicated dashboard/page gutters, made Map full-width, and split Meter Detail Historical Trends into three responsive cards with one shared range toggle. Browser checks passed on Overview, Meter Directory, Alarms, Reports, Customers, Meter Detail, and Map.
- **Current session summary:** Added isolated system-capacity settings/rejection schema, ingest rejection flow, capacity APIs/banners, and Settings UI. Prisma client regeneration is blocked locally because the query engine DLL is held open by a running Node process.
- **Consumption follow-up:** The delta-based backend existed, but its frontend wiring was incomplete. Added shared Daily/Monthly/Quarterly selector, Overview period-aware refetch, Meter Detail consumption API/card, and sparse deterministic x-axis ticks.
- **Threshold alarms:** Added optional per-device pressure, temperature, consumption, and battery limits; each breach is checked after ingest and uses the shared notification stub.
- **Provisioning coordinates:** Latitude/longitude are now mandatory during device provisioning and are range-validated before assignment so new devices render on the Map.
- **Map consumption:** Replaced the Map drawer's raw cumulative monthly sum with a lazy-loaded daily delta-consumption series for the selected meter.
- **Customer editing:** Added a table action that edits a customer’s name, category, address, and geographical area through the existing customer API.
- **Demo fixtures:** Added an idempotent five-meter fixture script with 18 months of daily cumulative readings; database insertion awaits approval.
- **Yearly consumption:** Added the Yearly option to the shared consumption selector and all period-aware chart paths; it returns five trailing April-March financial-year delta buckets.

## 2. Phase Checklist (mirror of IMPLIMENTATION-PLAN.md — update both)

- [x] Phase A — Schema Migration
- [x] Phase B — Admin: GA / Customer / Device Assignment
- [x] Phase C — Ingestion Extension
- [x] Phase D — Derived Status (shared logic)
- [x] Phase E — Customers Page
- [x] Phase F — Map View
- [x] Phase G — Alarms Extension
- [x] Phase H — Overview Extension & Reports
- [x] Phase I — Deployment

## 3. Known Broken / In-Progress

| Item | Where | Symptom | Since | Notes |
|------|-------|---------|-------|-------|
| _none yet_ | — | — | — | Revision just planned; nothing built against the new schema yet, so nothing to be broken. |

## 4. Deviations From the Plan

- **2026-07-22 — scope revision.** Original v1 plan (3-table Device/
  Reading/Alarm, phases 0–7, all but Deployment already green) is
  superseded by this v2 plan (6-table schema adding GeographicalArea/
  Customer/AlarmSettings, phases A–I) based on: (1) a handwritten spec
  page adding Map View / Customers-by-GA / GA-wise consumption
  requirements, and (2) a reference product
  (https://amr-cgd.vercel.app/) the team lead pointed at for UX parity.
  Mapping: old Phase 0 (ground truth) → still applies, unchanged, folded
  into new Phase A/C's payload-field notes. Old Phase 1 (scaffold) → done,
  stays done. Old Phase 2 (ingestion) → extended in new Phase C, not
  redone. Old Phase 3 (read API) → mostly unchanged, extended per-feature
  in new Phases E/F/G/H. Old Phase 4/5 (Overview/Meter-Table/Alarms UI,
  KPI/chart detail) → Meter Table UI is superseded by the Customers page
  (new primary entity is Customer, not raw Device); KPI/chart detail page
  logic carries over unchanged. Old Phase 6 (missing-data job, basic
  auth) → stays as-is, unaffected by this revision.
- Full rationale for every new/changed field is in PRD.md v2 §0–§9 and
  DATA-FLOW.md §5.1/§7/§8 — don't re-derive it here, reference it.

## 5. Isolation Check Log

- **2026-08-19 — shared UI shape tokens.** Changed `app/globals.css` `--radius` from 0.625rem to 0.875rem and `components/ui/card.tsx` default spacing from `--spacing(4)` to `--spacing(6)`; retained the sm-card spacing. Checked Overview, Meters, Alarms, Reports, Customers, and Meter Detail in the browser; no concrete breakage found.
- **2026-08-19 — dashboard gutters and trend composition.** Removed shared `<main>` padding, duplicate Customers padding, and Map negative-margin compensation. Replaced the single Historical Trends card with three metric cards and a shared pill toggle; typecheck and browser checks passed.
- **2026-08-19 — meter capacity.** Added `SystemSettings` and `RejectedConnectionAttempt`, isolated from alarm settings/tables. New-device ingest checks the configured cap, records rejected payloads, and returns a typed 409; existing devices bypass the check. The count-then-create check is intentionally non-atomic for the low-concurrency onboarding traffic pattern. Capacity status, acknowledgement, settings APIs, Header/Overview notices, and Settings navigation are isolated to the new system-capacity feature.
- **2026-08-19 — delta consumption UI.** Reused the shared bucket/period utility for Overview and Meter Detail. Selector changes refetch the selected period; 30 daily, 13 monthly, and 5 quarterly delta buckets remain backend-defined. Historical raw trends intentionally remain separate from the new consumption card.
- **2026-08-20 — per-meter threshold alarms.** Isolated seven optional Device threshold fields and four AlarmType values from existing alarm-settings logic. Added threshold checking after Reading creation, notification stub integration for threshold, gas-deviation, and missing-data alarm creation, assignment API support, and provisioning-only inputs. Existing provisioned meters intentionally have no edit action in this pass.
- **2026-08-20 — provisioning coordinates.** Added required latitude/longitude inputs to the Customers provisioning drawer. The assignment endpoint parses and range-validates coordinates (latitude -90..90, longitude -180..180) before saving them; Map behavior remains unchanged.
- **2026-08-20 — Map consumption correction.** Removed per-device raw reading sums from the Map devices endpoint. Selecting a marker now fetches the existing daily delta series from the device consumption endpoint, preventing cumulative meter totals from being displayed as consumption.
- **2026-08-20 — customer table editing.** Added customer/GA identifiers to the device-list response so the Customer table can open a prefilled editor. Editing intentionally updates shared Customer data for all meters assigned to that customer; meter-specific data remains outside this action.
- **2026-08-20 — demo meter fixtures.** Added `scripts/add-dummy-meters.mjs`, which only replaces readings for `DEMO-1801` through `DEMO-1805`, preserving all other data. It creates or refreshes their assigned customer/GA data and 548 daily cumulative readings per meter. Execution was not approved in this session.

- **2026-08-20 - yearly consumption.** Extended the shared mode, bucket builder, selector, API parsers, and Map drawer. Yearly reports five trailing April-March financial years, including the current partial year, through the same boundary-reading delta calculation as the other periods.

## 6. Next Session Should Start With

1. Stop/restart the running local Node development process, run `npx prisma generate`, then apply `prisma/migrations/20260819000000_max_meter_capacity/migration.sql` with Prisma.
2. Configure a capacity through Dashboard Settings and verify a new ingest receives 409 while an existing device continues reporting.
3. Run `npx prisma db push` and `npx prisma generate` after stopping the local dev server; verify threshold creation through a provisioned meter ingest.

4. Verify the new Yearly selector on Overview, Meter Detail, and Map; it uses five trailing April-March financial-year delta buckets, including the current partial year.
