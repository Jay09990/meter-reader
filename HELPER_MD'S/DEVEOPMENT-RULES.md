# DEVELOPMENT RULES — EVC Gas Meter Dashboard

These rules exist so the codebase stays easy to change six months from now,
not just easy to write today. They apply to every contributor — human or
agent (Antigravity CLI, or any other coding agent working in this repo).

Sources this is grounded in: modular-monolith / strict-module-boundary
practice as used at scale (e.g. Shopify's Rails monolith), the "one folder
= one axis, write it down, enforce in review" folder-structure discipline,
and standard large-codebase practice (modular architecture, documentation,
version control discipline, automated testing, code review, CI/CD).

---

## 1. Guiding Philosophy
- **Boring and explicit beats clever.** This is an internal ops dashboard,
  not a platform — optimize for "the next person (or agent) can understand
  this in 5 minutes," not for abstraction elegance.
- **A modular monolith, not microservices.** One Next.js app, one database.
  Get modularity from strict internal boundaries, not from network hops.
  Only split something into its own service when there's a concrete,
  measurable reason (independent scaling, independent failure isolation,
  genuinely different tech requirement) — not "it felt cleaner."
- **Ground truth over assumption.** Matches the project's existing
  debugging philosophy: don't guess at data shapes, API contracts, or "what
  probably broke" — verify against real payloads, real logs, real test
  runs before changing code.

## 2. Modularity Rules

### 2.1 One primary organizing axis
Pick **feature** as the primary axis (e.g. `ingestion/`, `stations/`,
`readings/`, `charts/`, `device-info/`), not technical layer, at the top
level. Inside a feature folder, layer as needed (`api/`, `service/`,
`components/`). Don't mix axes at the same folder level — if `lib/`,
`utils/`, `services/`, and `core/` all start meaning "shared logic nobody
sorted," that's a smell, not a structure.

### 2.2 Module boundaries are real, not aspirational
- Each feature module exposes what other modules are allowed to use through
  a single entry point (e.g. `features/stations/index.ts`) — nothing
  reaches into another module's internal files directly
  (`features/stations/internal/...`).
- Cross-module communication goes through that public entry point only.
  If module A needs something from module B that isn't exported, that's a
  signal to either export it deliberately or reconsider the boundary — not
  to reach in.

### 2.3 High cohesion, low coupling
Things that change together live together (a feature's API route, service
logic, and UI components stay in one folder). Things that change for
different reasons stay separate (ingestion parsing logic is not the same
module as chart-rendering logic, even though both touch "readings").

### 2.4 Shared code is deliberate, not accidental
A `shared/` (or `core/`) folder is fine for genuinely cross-cutting things
(DB client, auth, date/number formatting) — but adding to it requires the
same scrutiny as adding a new public API: is this actually needed by 2+
unrelated features, or is it one feature's logic that's being hoisted out
of laziness?

## 3. Design Rules
- **Single Responsibility per module/function.** A function that ingests a
  payload should not also decide how it's charted.
- **Interfaces at integration boundaries.** The PLC payload shape, the DB
  schema, and the chart data shape are three different contracts — don't
  let one leak into another. Parse PLC payload → typed domain object → DB
  row → API response shape → chart props, with explicit types at each
  boundary, not the raw payload threaded all the way to the UI.
- **Fail loud, fail typed.** Don't silently coerce bad/missing data into a
  default that looks like a real reading (see DATAFLOW.md — a missing
  day should show as missing, not as a repeated/zeroed value).
- **No speculative abstraction.** Don't build a plugin system, a generic
  "vendor adapter" layer, or config-driven flexibility for cases that
  don't exist yet (e.g. don't over-engineer for "10 PLC brands" when there's
  one). Add abstraction when a second real case shows up, not before.

## 4. Development Rules
- **Env vars for anything environment- or secret-shaped** (DB URL,
  ingestion shared token, any credential). Never hardcoded — this repo
  already has a cautionary example in `write-server`/`priceWrite.js` and the
  commented-out router block in `http-server/index.js`; don't repeat that
  pattern in new code.
- **TypeScript everywhere**, strict mode on. No `any` at module boundaries
  (PLC payload parsing, API responses, DB models).
- **One PR = one logical change.** Don't bundle an unrelated refactor into
  a feature PR.
- **Tests travel with the code they test**, inside the feature module, not
  a parallel `tests/` tree that drifts out of sync.
- **Migrations are the only way the DB schema changes** (Prisma migrate) —
  no manual schema edits against a running database.
- **Conventional commit messages** (`feat:`, `fix:`, `chore:`, `refactor:`)
  so history stays scannable as the project grows.
- **CI gate before merge**: typecheck, lint, tests, and a Prisma schema
  validation must pass. Don't rely on "it worked on my machine."

## 5. Feature Isolation Rule (hard rule)
**Implementing or changing one feature must not change the behavior of any
unrelated feature or module.** Concretely:
- A change to ingestion parsing must not alter chart rendering behavior; a
  change to the hourly chart must not alter the trend chart's queries; a
  change to one station's handling must not affect another station's.
- Before merging any feature work, explicitly check: which existing
  features/routes/DB tables does this touch? If the answer includes
  anything outside the feature being worked on, that touch needs its own
  justification and its own test — it doesn't ride along silently.
- Shared/core code changes (§2.4) are the one legitimate way one feature's
  work can affect another — and because of that, any change to `shared/`
  requires checking every feature that imports it, not just the one that
  prompted the change.
- Prefer additive changes (new field, new endpoint, new component) over
  modifying an existing shared contract. If an existing contract must
  change, grep/search for every consumer first — don't assume you found
  them all from memory.
- No global mutable state, no singletons doubling as shared state between
  features — state belongs to the feature that owns it or lives in the DB.

## 6. Documentation & Change Management
- PRD.md / DESIGN.md / DATAFLOW.md are living documents — when a real
  requirement changes them (e.g. the actual PLC payload shape turns out
  different from what's assumed, or a new site/station type is added),
  update the doc in the same PR as the code change, not after.
- Non-obvious architectural decisions get a short note (a lightweight ADR:
  what was decided, why, what was ruled out) rather than living only in a
  chat thread or PR description that'll be hard to find later.

## 7. Working With the Coding Agent (Antigravity CLI)
- This repo uses the **ponytail** and **caveman** plugins/rulesets in
  Antigravity CLI (minimal-code, token-efficient defaults). Those defaults
  are welcome for boilerplate and verbosity — they are **not** a license to
  skip the isolation check in §5, skip tests in §4, or take an
  undocumented shortcut through a module boundary in §2. When "the lazy
  option" and "the isolated, tested option" conflict, this file wins.
- Antigravity CLI auto-loads always-on rules from `AGENTS.md` at the repo
  root. Keep `AGENTS.md` short and have it explicitly point at this file
  and `AGENT_LOOP.md` so both are pulled into context every session, e.g.:
  ```
  See DEVELOPMENT_RULES.md for module/design/isolation rules — follow them
  for every change. See AGENT_LOOP.md at the start of every session to check
  current implementation status before making changes.
  ```
- Every agent session that changes code should end by updating
  `AGENT_LOOP.md` (see that file) so the next session — or a human — can
  see what moved and what didn't without re-deriving it from git history.