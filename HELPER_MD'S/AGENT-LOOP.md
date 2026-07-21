# AGENT_LOOP.md

Read this file at the start of every session, before making changes.
Update it at the end of every session, after making changes. This is the
single place that answers: *how far are we, what's broken, what's next* —
so debugging doesn't require re-deriving state from git history or memory.

This file tracks state. `IMPLEMENTATION_PLAN.md` defines the plan. Don't
duplicate the plan's task list here — reference phase numbers from it.

---

## 0.0 Token Efficiency (use ponytail + caveman for this loop)

This loop runs every session, so keep it cheap:
- Run the self-check protocol below in **caveman** mode — terse
  command output, no narrated play-by-play of what each check is about to
  do, just run it and report pass/fail.
- Apply **ponytail**'s "least code" bias when fixing anything the checks
  turn up — smallest diff that actually fixes it, not a surrounding
  refactor.
- When updating this file (step 6 below), write terse deltas, not prose:
  update the specific field/row that changed, don't rewrite whole sections.
  "Last session summary" stays 2–3 lines even if the session was long.
- Don't paste full command output into this file — only the failing lines,
  or "all green."
- None of this overrides DEVELOPMENT_RULES.md §5 (isolation) or §4
  (tests travel with code) — token-saving applies to *how* you check and
  report, not to *whether* you check, isolate, or test.

## 0. Self-Check Protocol (run this every session, in order)

1. **Read this file fully** — current phase, last known-broken items, last
   session's notes.
2. **Verify the build is actually in the state this file claims**, don't
   trust the last summary blindly:
   - `npm run typecheck` (or `tsc --noEmit`)
   - `npm run lint`
   - `npx prisma validate` (if schema exists yet)
   - `npm test`
   - `npm run build`
   If any of these fail and this file didn't already say so, the file is
   stale — fix the file's status to match reality *before* doing anything
   else. Don't build new work on top of an unverified "it's fine."
3. **Cross-check against `IMPLEMENTATION_PLAN.md`**: is the phase marked
   here consistent with which checkboxes are actually ticked there?
4. **Do the work for this session.**
5. **Re-run the checks in step 2** before ending the session.
6. **Update this file**: move the status forward, log anything left broken,
   log anything discovered but out of scope for this session.

## 1. Current Status

- **Current phase:** Phase 7 — Deployment
- **Last verified green:** 2026-07-21 (typecheck, lint — all green)
- **Last session summary:** Implemented MISSING_DATA alarm cron job (/api/cron/missing-data-alarms), basic auth middleware for /dashboard, and added skeleton loader polish to meter detail page. Installed shadcn skeleton component. Phase 6 complete.

## 2. Phase Checklist (mirror of IMPLEMENTATION_PLAN.md — update both)

- [x] Phase 0 — Verify Ground Truth (assumed payload per team lead)
- [x] Phase 1 — Project Scaffold
- [x] Phase 2 — Ingestion API
- [x] Phase 3 — Read API
- [x] Phase 4 — Dashboard UI: Overview, Meter Table, Alarms
- [x] Phase 5 — Dashboard UI: KPIs & Charts
- [x] Phase 6 — Device Info & Polish
- [ ] Phase 7 — Deployment

## 3. Known Broken / In-Progress (don't let this silently go stale)

| Item | Where | Symptom | Since | Notes |
|------|-------|---------|-------|-------|
| _none_ | — | — | — | — |

(Empty table = nothing known-broken. Don't delete the header — keep it
ready for the next thing that breaks.)

## 4. Deviations From the Plan

Anything implemented differently than `IMPLEMENTATION_PLAN.md` or
`DESIGN.md` describes, and why. (e.g. "hourly consumption ended up as a
normalized child table instead of JSONB, because the real payload nests an
object per hour with extra fields we need to query on — see DESIGN.md
update in same commit.")

## 5. Isolation Check Log

Per DEVELOPMENT_RULES.md §5 — for each feature-affecting change, one line:
what was touched outside the feature being worked on, and why that was
safe/justified. If a session touched only its own feature, write "none."

- _e.g. "Added `stationId` index to DailyReading — touches shared schema,
  used by ingestion + all read routes; additive migration, no consumer
  needed changes. Ran full test suite to confirm."_

## 6. Next Session Should Start With

1. Phase 7: Deployment.
2. Confirm with user if there are specific deployment instructions or environments (e.g., Vercel, Docker).
3. Final review of the repository.