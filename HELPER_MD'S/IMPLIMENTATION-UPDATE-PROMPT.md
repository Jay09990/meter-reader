# IMPLEMENTATION UPDATE PROMPT — v2 (GA/Customer scope)

Paste this into Antigravity CLI in the existing project (the one that
already has Phases 0–6 of the v1 plan built and green). This is a
**migration prompt**, not a fresh start — treat it accordingly.

---

This project's scope has been revised. Before touching any code:

1. Read every file in `helper_md's`, in this order: `PRD.md`,
   `ARCHITECTURE-DESIGN.md`, `DATA-FLOW.md`, `DEVEOPMENT-RULES.md`,
   `IMPLIMENTATION-PLAN.md`, `AGENT-LOOP.md`. All of these were just
   updated for this revision — don't rely on anything you remember about
   this project from before reading them, the schema and page set both
   changed.
2. `AGENT-LOOP.md` §4 "Deviations From the Plan" explains exactly what
   changed and why, and maps the old numbered phases (0–7) to the new
   lettered phases (A–I) in `IMPLIMENTATION-PLAN.md`. Read that mapping
   before assuming anything from the old plan still applies as-is.
3. **This is a migration on top of working code, not a rewrite.** The
   existing ingestion endpoint, read APIs, and UI pages from the old plan
   are working and tested — DEVELOPMENT-RULES.md §5 (feature isolation)
   applies with extra force here. Don't delete or restructure working
   code as a side effect of adding the new tables/pages; extend it.

## What changed, in one paragraph
Two new inputs drove this: a handwritten spec page adding Map View,
"Customers List on grid (by GA)", and GA-wise consumption to the required
pages/KPIs, and a reference product
(https://amr-cgd.vercel.app/, "Altrex CGD Gas AMR Console") the team lead
pointed at for UX/IA parity. Net result: two new core tables
(`GeographicalArea`, `Customer`), Device/Reading/Alarm all gained new
columns, three new pages (Map View, Customers, Reports — Reports was
previously deferred, now in scope), and Alarms gained severity/CSV
export/acknowledge. Full detail: PRD.md v2 §0.

## Hard constraints for this session
- **Follow `IMPLIMENTATION-PLAN.md`'s lettered phases in order (A → I).**
  Phase A (schema migration) is a hard gate before B–H — don't start
  building the Customers page against a schema that doesn't have the
  `Customer` table yet.
- **Phase A — ask before running the migration if real data may exist.**
  `IMPLIMENTATION-PLAN.md` Phase A's last checkbox says to confirm
  whether there's real production data in the current deployment before
  deciding whether the migration needs to be data-preserving. Don't
  assume either way — ask.
- **`admin/` (new, Phase B) and `ingestion/` (existing) both write to
  `Device`, but must not step on each other's fields** — see
  DEVEOPMENT-RULES.md §7a. Ingestion never sets `customerId`,
  `latitude`, or `longitude`. Admin never touches `lastSeenAt` or reading
  data.
- **Derived status (Normal/Anomaly/Alert/Offline) is computed, never
  stored** (PRD.md FR11, ARCHITECTURE-DESIGN.md §3 note). Build it once
  (Phase D) as shared logic before Customers/Map/Overview each need it —
  don't let three pages reimplement slightly-different staleness math.
- **The reference site's "live" framing is not a requirement.** Our data
  is once-a-day per device. Anywhere the UI would otherwise imply
  real-time (an activity "feed," a status indicator), label it
  accurately ("recent activity," "as of latest reading") rather than
  copying the demo's live-polling feel. See PRD.md §3, §8.

## Still explicitly unresolved — do not invent answers
These are flagged in PRD.md §9 as open items. If a task in this session
runs into one of them, stop and ask rather than picking an answer:
- Payload structure is still assumed, not confirmed (unchanged from
  before this revision).
- Alarm severity mapping (MISSING_DATA→Critical, GAS_OUT_OF_RANGE→
  Warning) is assumed, not confirmed by the business.
- Whether GA and "city" are the same concept or need separate fields.
- What the reference site's "Operations" and "System" nav pages actually
  contain — not built this revision; don't guess and build a placeholder
  that pretends to know their scope.

## Autoloop behavior and stop-and-wait conditions
Same as the original starter prompt: work through the lettered phases
continuously, self-check + update `AGENT-LOOP.md` at the end of each
phase, post a short caveman-style status line and continue — except pause
and ask explicitly for:
- Any destructive/irreversible DB operation, including the Phase A
  migration if real data might exist (see above).
- Real secrets/credentials, deployment outside local/dev.
- The same check failing twice in a row after a fix attempt.
- Anything touching a file/feature outside the one currently being
  worked on that DEVELOPMENT-RULES.md §5 doesn't already pre-approve.

## If I interrupt and redirect
Same handling as before: stop immediately (don't finish the current
step), treat my message as overriding whatever the docs currently say for
that part, log it in `AGENT-LOOP.md` §4, update the relevant doc(s) in the
same change, re-run self-checks before resuming.

## UI component / design notes (unchanged from before this revision)
Use shadcn/ui for ready-made components; only hand-write markup for
genuinely custom parts (charts, the map). The Stitch design named "EVC
Gas Dashboard" is still the layout/visual reference for existing pages —
for the three new pages (Map View, Customers, Reports), match its visual
language even though those specific pages weren't in the original Stitch
project; ask if a design reference for those is wanted before free-styling
them.

Start now: read the `helper_md's` folder in the order listed above, then
begin Phase A.