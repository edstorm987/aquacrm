# Plan — Battle Table overhaul

← [todo.md](../TODO.md) · [development.md](../../development.md)

**Status: BUILT (phases 1–5) — war room is the front door; the drill-in layer wears the same command chrome (P5 done 2026-08-20).**

## What was built (2026-08-20)
- `src/app/portal/agency/_battleWarRoom.ts` — the pure, testable war-room model:
  `buildBattlefield`, `buildWarRoomDecisions`, `buildWarRoomPulse`,
  `summariseBattlefield`, `revenuePosition`, `monthPaceFraction`,
  `capitalWatchCount`, `scopeHiringAnalysis`. No React, no fabricated numbers:
  missing finance evidence reads `learning`, an unset target reads `no-target`.
- `_BattleTableWorkspace.tsx` — new `warroom` section, now the DEFAULT. Three
  zones: the battlefield (one row per scope), the decisions queue (evidence +
  act, drills into scope *and* section in one move) and the live pulse (5
  readings vs their own targets, with deviation and run-rate forecast). The 10
  planning sections are demoted to a second-tier drill-in nav with a
  "Back to the war room" return.
- `_DashboardCommandCenter.tsx` — `?battle=` falls back to `warroom` (every
  existing deep link still opens its own section) and the live `radarSnapshot`
  is passed in, so a Radar refresh moves the decisions queue with it.
- `scripts/smoke-battle-table.test.ts` — 11 behavioural tests over the model
  (mutation-proved), plus a demotion/front-door contract test.

### Decisions taken where the plan left them open
- **Battlefield layout → one row per scope** (table), not a card grid: it scales
  as trading companies are added and keeps target-vs-actual columns comparable.
  Swappable — the row markup is the only thing that would change.
- **Top pulse → revenue-vs-target, monthly growth, pipeline cover, capacity
  load, strategic health.** Cash was left out deliberately: there is no live
  cash actual, so a cash tile would read "Learning" forever.
- **All 10 sections stay** as drill-in. None collapsed.

### Phase 5 (2026-08-20, later) — the drill-in layer reads as stations
- The drill-in strip is now a **command rail**: back-to-war-room, a numbered
  station chip (`ST-01`…`ST-10`, derived from the sections list, with the
  section's own icon), `Planning station · {scope}`, and a live-feed reminder
  ("Feeds the war room live" — true: `profiles` state feeds the battlefield).
- Every `BattleSection` header carries the gold accent signature
  (`border-l-2 border-[#d7b56d]/45`) the war-room zones speak in, so a planning
  body reads as a station of the same surface, not a settings page.
- Look/feel only — no behaviour, data or route change. Pinned by the
  "Phase 5" shape test in `scripts/smoke-battle-table.test.ts`.

### Not built
- The pulse does not yet read `CommandKpi` plan targets directly (it uses the
  retained company plan); tying it to the KPI overhaul's targets is the next step.

there but doesn't feel or match what I need… feels half-completed."* The feedback
is a **feel**, not a spec, and the surface is large — so this captures the
current state + the diagnosis, and the questions that decide the direction.

## Where we are (verified — it's richer than it feels)
`_BattleTableWorkspace.tsx` (652L) is the Command Centre strategic surface —
per **scope** (ecosystem aggregate + each trading company). It has **10 sections**:

| Section | What it does today |
|---|---|
| overview | Revenue trajectory + target corridor, vision, trend/gap summary |
| intelligence | KPI strategy workspace (ties to KPI intelligence) |
| strategy | Mission / vision / values "doctrine" editor |
| projections | Scenario assumptions — base vs target case |
| objectives | Measurable outcomes with progress + status |
| capacity | Hiring intelligence — area capacity → ranked hire decisions |
| plans | Business plans (owners/timelines/status) |
| capital | Ownership / shares / capital ledger |
| reviews | Executive review workspace |
| systems | Executive systems view |

So it's **not missing features** — it's a broad strategic command surface. The
"half-completed" feeling is about it **not landing**, not a lack of stuff.

## Direction (Ed — RESOLVED)
- **It should be a LIVE WAR-ROOM** — a command surface Ed checks often: live data, at-a-glance state of the whole business, and "**what needs my decision right now**". Less form-filling, more a dashboard that tells him where things stand and what to act on.
- **The gap:** today it reads as **editors/forms**, not a living decision surface. So the overhaul is a *reframe*, not a rebuild — the pieces exist; they're presented as forms instead of a war-room.

## Goals
1. A **war-room front door** — at-a-glance state of the ecosystem + every company, live.
2. **Decisions surfaced** — "what needs you now" as a live queue, with evidence + act.
3. **Real, live data** — fed by Radar / KPIs / health / capacity / finance, not assumptions.
4. **Demote the forms** — the 10 planning sections become the *drill-in / set-up* layer, not the daily surface.
5. Stay honest — live/real, "Learning"/"—" when no evidence.

## The target shape — the War Room
A new **default view** replacing the form-heavy overview, in three zones:
1. **The battlefield** — ecosystem + **every company at a glance**: health, **target-vs-actual** (on-track / behind / ahead), critical-alert count. One row/card per scope; click → drill into that company. *(Reuses brand portfolio + company health + Radar per scope.)*
2. **Decisions needing you** — a **live queue** of the calls: off-track targets, at-risk objectives, hire-now capacity, Radar-critical incidents, capital decisions — each with its evidence + accept/act. *(Reuses the Radar action/attention model — guess-then-confirm.)* This is the "what do I do next".
3. **Live pulse** — the key live metrics vs target with **deviation/forecast** (revenue-vs-target, cash, leads, pipeline) — straight from the [KPI overhaul](kpi-intelligence-overhaul.md).

The existing **strategy / objectives / projections / capacity / plans / capital /
reviews / systems** sections **stay, but demoted** — reached by drilling in from
the war-room (set-up + planning), fed with live actuals, with the form-feel
reduced. The war-room is the front door; they're the depth behind it.

## Phases (simple-first — each shippable)
1. ✅ **The battlefield** — the new default: ecosystem + companies at a glance (health · on/off-track · alert count), click-to-drill. Reuse brand portfolio + company health + Radar.
2. ✅ **Decisions queue** — surface the calls (off-track / at-risk / hire-now / Radar-critical) with evidence + act; reuse the Radar action/attention model.
3. ✅ **Live pulse** — key metrics vs target + deviation (from the KPI overhaul).
4. ✅ **Demote + feed the planning sections** — reframe the 10 tabs as drill-in, fed with live actuals; cut the form-heaviness.
5. **War-room feel** — the look/feel polish so it reads as a command surface, not a settings page.

## Reuse
Radar (health / incidents / actions) · the [KPI overhaul](kpi-intelligence-overhaul.md) (targets/deviation for the pulse) · company health + brand portfolio (per-company status) · the capacity/hiring model (already ranks hire decisions) · objectives (`currentValue`/`targetValue` already there) · the existing 10 sections (become the drill-in layer).

## Decisions (Ed)
- **Battlefield layout** — one row per company + ecosystem, or a card grid?
- The **must-see top pulse** — which 3–5 metrics (revenue-vs-target, cash, leads, health)?
- Do all 10 sections stay as drill-in tabs, or collapse a few?

## Non-goals
- Not deleting the planning sections — **demoting** them to drill-in.
- Not fabricating data — live/real with honest fallbacks.

## Ties
Its **intelligence** section overlaps the [KPI overhaul](kpi-intelligence-overhaul.md);
its **capital/ownership** and **capacity/hiring** are their own subsystems; company
scoping ties to the [Aqua Tag system](aqua-tag-system.md) company model.

## File map — what this plan owns

_Derived and existence-checked 2026-08-20. This is the collision contract: with Claude and
Codex workers in ONE uncommitted tree, two agents in the same file destroys work and there is
no git to recover from. Before assigning this plan, check these paths against every other
plan in flight._

- `src/app/portal/agency/_BattleTableWorkspace.tsx`
- `src/app/portal/agency/_CapitalOwnershipWorkspace.tsx`
- `src/app/portal/agency/_QuarterlyStrategyReview.tsx`
- `src/app/portal/agency/_CommandStationNav.tsx`
- `scripts/smoke-battle-table.test.ts`
- `docs/development/plans/battle-table-overhaul.md`
- `src/app/portal/agency/page.tsx`
- `src/app/portal/agency/_DashboardCommandCenter.tsx`
- `src/app/portal/agency/_CommandIntelligenceWorkspace.tsx`
- `src/app/portal/agency/company/page.tsx`
- `src/lib/chrome/sidebarLayout.ts`
