# AquaCRM — Structure (the agreed taxonomy) + Roadmap

The single source of truth for what every folder is and what's left. Companion to the
"AquaCRM Structure & Roadmap" artifact. Ed's call 2026-08-20: end the naming sprawl.

## The one sentence
**Engines** power **Modules**, which fill **Workspaces**, which are grouped into **Surfaces.**
"Plugin" is retired — it just meant Module.

| Layer | What it is | Lives in |
|---|---|---|
| **Engines** | Reusable power systems ("engines in different cars") | `src/engines/` (TARGET — the move is pending) |
| **Modules** | Installable feature-packs, on/off per company (the company builder) | `src/built-ins/modules/` (13) |
| **Workspaces** | The screens where you work (agency, client portal, customer portal, Dev Team) | `src/app/portal/` |
| **Surfaces** | Top-level nav grouping (IA v2) | the sidebar |

## The three Engines (→ `src/engines/`)
1. **Dev Editor Engine** — editing: blocks + code+git; detects website/portal/software and adapts.
   Now: `lib/editing/` + `lib/elements/` + `lib/server/siteEditor/` → `src/engines/editor/`.
   DONE: block editing (P1–3), rename, Dev Team editor mounts the code+git engine (read).
   OPEN: unify behind one adapter, live commit/publish path, install tiers, GitHub+AquaTag+Vercel setup.
2. **SOP Engine** — SOPs → guides → training; traditional + interactive/video content.
   Now: `server/sops.ts` + `sopGuides.ts` + `sop-library/` → `src/engines/sop/`.
   DONE: interactive SOPs + composer, guides.
   OPEN: merge People training in, tuned views (staff/client/product), assignment+progress+certification.
3. **Data Engine** (= Radar + KPI, Ed's definition) — signals → health, evidence-confidence, forecasts.
   Now: `lib/radar/` + `server/radar/` + `lib/performance/` + `server/kpi/` + `lib/intelligence/` → `src/engines/data/`.
   DONE: Radar (7 stages), KPI (7 phases), Command Intelligence.
   OPEN: consolidate under the one name/folder, evolving baselines (rolling baseline + ~10% ratcheting band).

## The five Surfaces (IA v2) — owner and staff get the same five
| Surface | Is | State |
|---|---|---|
| Command Centre | now / your day (staff: employee portal) | exists |
| Inbox & Actions | attention + doing (unified) | DONE |
| Executive | direction — Battle Table, Data Engine, capital | TO DO (next) |
| Operations | the business functions, role-configurable (delegation) | Governance in; container in progress |
| Tools | utilities + directory | DONE |

## What's left
- **Finish the engines** (Ed's "very least"): editor unify+commit+tiers+setup · SOP training-merge+views+assignment · Data consolidate+baselines.
- **The `src/engines/` move**: create it, move editor/sop/data code in (manifest-driven, imports rewritten, suite-guarded — as the earlier reorg). Retire "plugin" → "module".
- **The surfaces**: Executive (extract-and-add, CC unchanged) · Operations container · staff-portal mirror.
- **Launch-critical (only Ed)**: first prod deploy (never run on prod Supabase) · Vercel env (SERVICE_ROLE_KEY, SESSION_SECRET) · apply brand_enquiries migration · one real onboarding walk · Stripe/Meta/DPO · the first push.

## Order
1. Executive surface → 2. `src/engines/` move → 3. finish each engine → 4. Operations container → 5. launch-hardening (Ed's track, parallel).

Every item is a written plan in `docs/development/plans/`. This file + the artifact index them.
