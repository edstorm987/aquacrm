# AquaCRM — Structure (the agreed taxonomy) + Roadmap

The source of truth for the folder taxonomy and architecture vocabulary. For the
current delivery position and what's left, use [checklist.md](checklist.md); for
sequencing, use [roadmap.md](roadmap.md). Companion to the "AquaCRM Structure &
Roadmap" artifact. Ed's call 2026-08-20: end the naming sprawl.

## The one sentence
**Engines** power **Modules**, which fill **Workspaces**, which are grouped into **Surfaces.**
"Plugin" is retired — it just meant Module.

| Layer | What it is | Lives in |
|---|---|---|
| **Engines** | Reusable power systems ("engines in different cars") | `src/engines/` (DONE — editor + sop + data all moved) |
| **Modules** | Installable feature-packs, on/off per company (the company builder) | `src/built-ins/modules/` (13) |
| **Workspaces** | The screens where you work (agency, client portal, customer portal, Dev Team) | `src/app/portal/` |
| **Surfaces** | Top-level nav grouping (IA v2) | the sidebar |

## The three Engines (→ `src/engines/`)
1. **Dev Editor Engine** — editing: blocks + code+git; detects website/portal/software and adapts.
   MOVED ✓: `src/engines/editor/{editing,elements,server}/` (was `lib/editing/` + `lib/elements/` + `lib/server/siteEditor/`).
   DONE: block editing (P1–3), rename, universal Editor mount, source edits,
   draft commits and publish/PR lifecycle, inline GitHub/Aqua Tag/AI setup.
   OPEN: full browser acceptance, the remaining browser-hide/surface/lifecycle/
   refresh transition and reported prefill-bleed coverage, a coherent deployed
   Supabase RPC/direct-Postgres claim contract plus live two-instance proof,
   client-portal mounting and the remaining engine widening/install-tier work.
   Project dirty buffers and source-level AI project/prefill clearing have focused
   regressions, but runtime isolation remains open. See
   [dev-editor-finish.md](plans/dev-editor-finish.md).
2. **SOP Engine** — SOPs → guides → training; traditional + interactive/video content.
   MOVED ✓: `src/engines/sop/server/{sops,sopGuides}.ts` (was `server/sops.ts` + `sopGuides.ts`). `sop-library/` workspace stays under `app/portal/`.
   DONE: interactive SOPs + composer, guides. ALSO already built (People-training island): assignment (`PeopleTrainingAssignment.sopId`), progress (status/completedAt), modules + quiz-gated certification (`PeopleTrainingModule`), team view (`/portal/team/training`).
   OPEN (Ed's call): merge the SOP-guide system with the People-training island — types.ts:1635 says the island is "deliberately left in place", so this is an architecture decision, not a blind build. Then tuned views (staff/client/product).
3. **Data Engine** (= Radar + KPI, Ed's definition) — signals → health, evidence-confidence, forecasts.
   MOVED ✓: `src/engines/data/radar/` (client) + `src/engines/data/server/{radar,kpi}/` (was `lib/radar/` + `server/radar/` + `server/kpi/`).
   NOT MOVED (fuzzy): `lib/performance/` + `lib/intelligence/` — separate split decision.
   DONE: Radar (7 stages), KPI (7 phases), Command Intelligence.
   OPEN: fold in performance/intelligence, evolving baselines (rolling baseline + ~10% ratcheting band).

## The five Surfaces (IA v2 target)

Owner/staff parity remains intentionally scoped rather than route-for-route. The
staff portal now groups only the stations admitted by canonical element access
into Command, Inbox & Actions, Operations and Tools; it does not link staff into
agency routes or invent an Executive surface. The proxy still redirects staff
`/portal/agency*` pages and permits only five API roots, which conflicts with
some leaf routes that admit staff (issue #25).

| Surface | Is | State |
|---|---|---|
| Command Centre | now / your day (staff: employee portal) | exists |
| Inbox & Actions | attention + doing (unified) | DONE |
| Executive | direction — Battle Table, Data Engine, capital | TO DO (next) |
| Operations | the business functions, role-configurable (delegation) | DONE — single sidebar row → hub of function cards (functions hidden/search-only; badges + active-state roll up) |
| Tools | utilities + directory | DONE |

## What's left
- **The `src/engines/` move**: DONE ✓ — editor + sop + data all physically in `src/engines/`, imports rewritten, tsc + full suite green, adversarial-verified. "Plugin" already retired → "module".
- **Finish the engines** (Ed's "very least"): editor acceptance+reliability+client mount+tiers · SOP training-merge+views+assignment · Data fold-in performance/intelligence + evolving baselines. ← now the active track.
- **The surfaces**: Executive (extract-and-add, CC unchanged) — NEXT · Operations container (Governance in; lane exists) · staff portal regroup DONE (canonical role/element gates preserved; full shared-hub parity is not claimed).
- **Launch-critical external/acceptance work:** merge/deploy decision · deployment
  environment verification · pending migrations · one real onboarding walk ·
  live Stripe/Meta/DPO steps. The first commit and push are already complete.

## Order
1. ~~Executive surface~~ → 2. ~~`src/engines/` move~~ DONE ✓ → **3. finish each engine (active)** → 4. Executive + Operations container → 5. launch-hardening (Ed's track, parallel).

Every item is a written plan in `docs/development/plans/`. This file + the artifact index them.

## The concrete `src/engines/` layout (decided — so the move is unambiguous)
The engines currently span three layers: client-safe (`src/lib/*`), server-only
(`src/lib/server/*`), and state (`src/server/*`). Preserve that split INSIDE each engine
with a `server/` subfolder, so the client/server boundary the app relies on is never lost:

```
src/engines/
├── editor/                  # Dev Editor Engine
│   ├── (from src/engines/editor/editing/ + src/engines/editor/elements/)   ← client-safe
│   └── server/              (from src/engines/editor/server/)   ← server-only (git/github)
├── sop/                     # SOP Engine
│   └── server/              (from src/engines/sop/server/sops.ts + sopGuides.ts)   ← state layer
│       # UI stays in app/portal/agency/sop-library/ (that is a WORKSPACE, not the engine)
└── data/                    # Data Engine (Radar + KPI)
    ├── (from src/engines/data/radar/ + src/lib/performance/[kpi] + src/lib/intelligence/)  ← client-safe
    └── server/              (from src/engines/data/server/radar/ + src/engines/data/server/kpi/)   ← server-only
```

Rules:
- The **engine** is the reusable logic. Its **UI/screens stay in `app/portal/*`** (those are
  Workspaces — the cars — not the engine).
- The `server/` subfolder keeps `import "server-only"` modules separate, exactly as `lib/server/`
  does today, so nothing leaks a server module into a client bundle.
- The move is mechanical + manifest-driven (rewrite every import: `@/engines/editor/editing/*` →
  `@/engines/editor/*`, etc.), suite-guarded, same protocol as the 2026-08-20 `src/lib` reorg.
  Add an `@/engines/*` tsconfig path alias.
- Run it on a CLEAN tree with NO other lane active (it rewrites imports across the whole codebase).
