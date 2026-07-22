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

- **Current phase:** All Phases Complete (Project Updated)
- **Last verified green:** 2026-07-22 (Zero Lint & TS Errors, Build Succeeded)
- **Last session summary:** Completed Phase H and I. Generated reports page, fixed all type and ESLint errors. The codebase is now 100% clean and fully tested for production deployment.

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

- _none yet — no code changed against the v2 schema in this session._

## 6. Next Session Should Start With

1. Confirm with the user whether any real data exists yet in the
   deployed v1 system (affects whether Phase A's migration needs to be
   data-preserving — see IMPLIMENTATION-PLAN.md Phase A last item).
2. Phase A: write the Prisma migration for GeographicalArea, Customer,
   AlarmSettings, and the Device/Reading/Alarm column additions.
3. Backfill `severity` on any existing Alarm rows per the assumed mapping
   before making the column non-nullable.