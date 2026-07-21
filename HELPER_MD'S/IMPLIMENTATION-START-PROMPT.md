# IMPLEMENTATION PROMPT

Use this as the opening prompt to an agentic coding tool (e.g. Claude Code)
once Phase 0 in IMPLEMENTATION_PLAN.md is done and you have a real captured
PLC payload in hand. Paste the captured payload JSON where indicated —
don't let the agent guess field names.

---

You are building a Next.js fullstack dashboard for an EVC (Electronic
Volume Corrector) gas meter monitoring system. Reference docs are attached/
provided: PRD.md, DESIGN.md, DATAFLOW.md, IMPLEMENTATION_PLAN.md — treat
DESIGN.md's schema as a starting point, not final, and reconcile it against
the real payload below before writing the Prisma schema.

**Real captured PLC payload (ground truth — do not invent field names not
present here):**
```json
<PASTE ONE REAL req.body CAPTURE PER STATION HERE — s1 and s2>
```

**Existing code to build on/replace** (from the current repo):
- `http-server/index.js` — Express app with `POST /pune/s1` and
  `POST /pune/s2` that currently only `console.log` the body. This is the
  endpoint the ingestion API route replaces.
- `write-server/index.js` / `http-server/priceWrite.js` — a separate CLI
  tool that SSHes into a router and runs `ubus call modbus_client.rpc
  set_tag_value` to write tag values back to the PLC. Leave this alone; it
  is not part of the dashboard read path (see DATAFLOW.md §3). Note it
  currently hardcodes `ROUTER_IP` / `ROUTER_USER` / `ROUTER_PASSWORD` — flag
  this but don't silently "fix" it by inventing new credential-handling
  behavior; ask before changing how it authenticates.

**Task — work in this order, stopping for review between phases:**
1. Scaffold the Next.js app (App Router, TypeScript, Tailwind, Prisma) and
   set up the Postgres schema, updated to match the real payload above.
2. Build `POST /api/ingest/[site]/[station]`, store `rawPayload` +
   parsed columns, handle the same-day-upsert / bad-shape / out-of-order
   cases from DATAFLOW.md §4. Write a quick script or test that replays the
   captured payload against it and confirms a row lands correctly.
3. Build the read API routes from DESIGN.md §4.
4. Build the dashboard UI per DESIGN.md §5 — overview page, station detail
   with KPI cards, hourly chart, trend charts, device info panel.
5. Add the "data is N days old" staleness indicator.
6. Add a basic auth gate in front of the dashboard.

**Constraints:**
- Don't guess at PLC payload field names or units beyond what's in the
  captured sample above — if something needed isn't in the sample (e.g. one
  of the handwritten-spec fields is missing), flag it rather than inventing
  a plausible-looking field name.
- Keep `rawPayload` storage even after the parser is solid — it's the
  fallback if the shape changes later.
- Don't hardcode secrets (DB URL, ingestion shared token) — use env vars.