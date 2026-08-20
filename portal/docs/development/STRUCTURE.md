# AquaCRM — Structure (the agreed taxonomy) + Roadmap

The single source of truth for what every folder is and what's left. Companion to the
"AquaCRM Structure & Roadmap" artifact. Ed's call 2026-08-20: end the naming sprawl.

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
   DONE: block editing (P1–3), rename, Dev Team editor mounts the code+git engine (read).
   OPEN: unify behind one adapter, live commit/publish path, install tiers, GitHub+AquaTag+Vercel setup.
2. **SOP Engine** — SOPs → guides → training; traditional + interactive/video content.
   MOVED ✓: `src/engines/sop/server/{sops,sopGuides}.ts` (was `server/sops.ts` + `sopGuides.ts`). `sop-library/` workspace stays under `app/portal/`.
   DONE: interactive SOPs + composer, guides. ALSO already built (People-training island): assignment (`PeopleTrainingAssignment.sopId`), progress (status/completedAt), modules + quiz-gated certification (`PeopleTrainingModule`), team view (`/portal/team/training`).
   OPEN (Ed's call): merge the SOP-guide system with the People-training island — types.ts:1635 says the island is "deliberately left in place", so this is an architecture decision, not a blind build. Then tuned views (staff/client/product).
3. **Data Engine** (= Radar + KPI, Ed's definition) — signals → health, evidence-confidence, forecasts.
   MOVED ✓: `src/engines/data/radar/` (client) + `src/engines/data/server/{radar,kpi}/` (was `lib/radar/` + `server/radar/` + `server/kpi/`).
   NOT MOVED (fuzzy): `lib/performance/` + `lib/intelligence/` — separate split decision.
   DONE: Radar (7 stages), KPI (7 phases), Command Intelligence.
   OPEN: fold in performance/intelligence, evolving baselines (rolling baseline + ~10% ratcheting band).

## The five Surfaces (IA v2) — owner and staff get the same five
| Surface | Is | State |
|---|---|---|
| Command Centre | now / your day (staff: employee portal) | exists |
| Inbox & Actions | attention + doing (unified) | DONE |
| Executive | direction — Battle Table, Data Engine, capital | TO DO (next) |
| Operations | the business functions, role-configurable (delegation) | DONE — single sidebar row → hub of function cards (functions hidden/search-only; badges + active-state roll up) |
| Tools | utilities + directory | DONE |

## What's left
- **The `src/engines/` move**: DONE ✓ — editor + sop + data all physically in `src/engines/`, imports rewritten, tsc + full suite green, adversarial-verified. "Plugin" already retired → "module".
- **Finish the engines** (Ed's "very least"): editor unify+commit+tiers+setup · SOP training-merge+views+assignment · Data fold-in performance/intelligence + evolving baselines. ← now the active track.
- **The surfaces**: Executive (extract-and-add, CC unchanged) — NEXT · Operations container (Governance in; lane exists) · staff-portal mirror.
- **Launch-critical (only Ed)**: first prod deploy (never run on prod Supabase) · Vercel env (SERVICE_ROLE_KEY, SESSION_SECRET) · apply brand_enquiries migration · one real onboarding walk · Stripe/Meta/DPO · the first push.

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
