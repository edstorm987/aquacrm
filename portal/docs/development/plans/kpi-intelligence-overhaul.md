# Plan — KPI Intelligence overhaul (full)

← [todo.md](../todo.md) · [development.md](../../development.md) · reference: [KPI dossier](../../workspace/kpi-intelligence.md)

**Status: ✅ ALL 7 PHASES SHIPPED (2026-08-19); auditor PASSED (no eval surface, targets agency-scoped). ONE recorded decision is still unbuilt — see below — so this is not "100% complete".** _(Corrected 2026-08-20. Two things were wrong here: the status enumerated "phases 1/3/4/5A/5B/6/7" and silently dropped **Phase 2**, which did ship — the plan/target/forecast mode and the line/area/bar switch are in `_CommandIntelligenceWorkspace.tsx:348`, `:368`, `:619`, `:667`. And "100% complete" did not survive a source check.)_

> ⚠ **Not built: shared saved views.** Ed decided saved views should be **BOTH** per-user private *and* shared agency-wide, carried on a new `kpiViews` collection. `kpiViews` **does not exist anywhere in `src/`** (grepped 2026-08-20, zero hits), and saved views are still browser-only `localStorage` under `SAVED_COMPARISON_KEY` (`_CommandIntelligenceWorkspace.tsx:382`, `:473`, `:494`). The plan itself calls this "a follow-on slice once the explorer exists" — the explorer exists, so the slice is now simply open. **This is why this plan stays on the board rather than moving to `archive/`.**

Verified in source 2026-08-20, so nobody re-does it: registry (`src/lib/performance/kpiRegistry.ts`) · custom-KPI builder (`api/portal/kpi-registry/custom/route.ts` + `src/engines/data/server/kpi/customKpis.ts`) · **server-persisted** targets (`api/portal/kpi-registry/targets/route.ts`, read at `_CommandIntelligenceWorkspace.tsx:394`, written at `:504`/`:512`) · adaptive suggestions (`suggestKpiTarget`, `kpiRegistry.ts:283`, wired to the Sparkles button at `:659`). Ed's verdict: *"a pile of shit with a few good
bits and a few awesome UIs."* Keep + extend the great bits (the trajectory graph,
the people-map); replace the rigidity (few KPIs, fixed formulas, one-size targets)
with something **explorable, tunable, target-tracked, and adaptive** — without
losing the no-fake-numbers honesty.

## Goals
1. **Explore** — search any KPI, plot one or many, switch graph types, compare periods, save views.
2. **More + your own** — every computed metric is plottable; define custom KPIs.
3. **Targets + deviation** — set a target per KPI per business, see are-we-on-track (pace/deviation/forecast).
4. **Adaptive** — baselines/trends that learn and evolve; auto-suggested targets from history.
5. **Customer intelligence** — the people-map/demographics scoped per-business or full-ecosystem, configurable.
6. **Stay honest** — computed from real state, "Learning" until evidence, indexes labelled as indexes, config changes versioned.

## Where we stand (verified — [dossier](../../workspace/kpi-intelligence.md))
- **Good & kept:** the trajectory graph (`_CommandCentreKpiTrajectory`), the intelligence workspace (`_CommandIntelligenceWorkspace` — comparison modes, forecast, BusinessCompass), the people-map/demographics (`marketing/_CustomerProfilesWorkspace`).
- **Already half-there (build on, don't rebuild):** `resolveKpiPlan` computes `expectedValue` / `paceGap` / `targetGap` / `forecastValue` (the whole "set target → see deviation" math). The **evidence vault** computes median **baselines, trends, anomalies** (the "learn/adapt" spine).
- **The problems:** only the **5 primary stations** plot; 20 command + 40 commercial formulas are computed but hidden; formulas + targets + weights are **hardcoded constants**; **one set for every business**; the people-map is a schematic `locationPoint()` place→(x,y) lookup.
- **Truth:** the numbers are real (no fabrication); they're just rigid and mostly hidden.

---

## The backbone — a unified **KPI Registry**
The one new abstraction that makes everything else fall out. Today each metric is
computed in its own place with its formula as a display string; there's no single
list to *search* or *plot*. Introduce a registry entry per metric:

```
KpiDescriptor {
  id, label, category, unit ("%", "£", "count", "days"…),
  formulaText,            // for display / inspect (already exists as strings)
  source,                 // which state/builders feed it
  series(agencyId, scope, range) → { at, value }[],   // the plottable time-series (from the evidence vault + live compute)
  direction ("higher"|"lower"|"neutral"),
  target?, baseline?,     // resolved from config + adaptive (Part C)
  kind ("command"|"commercial"|"evidence"|"custom"),
}
```

- **Register everything:** the 20 command KPIs, the 40 commercial formulas, every radar **evidence series**, and (later) custom KPIs — all become `KpiDescriptor`s. This is what the explorer searches and plots.
- Lives in `lib/kpiRegistry.ts` (client-safe descriptors) + `lib/server/kpiRegistry.ts` (series providers). Reuses the existing computations — it *wraps* them, doesn't replace.

---

## Part A — The KPI Explorer (extend the graph)
A real explorer over the registry, in **Command Centre** (monitoring/intelligence).
- **Search** any KPI by name/category → **select one or many**.
- **Chart component** supporting **line / area / bar / scatter** (v1: line/area/bar) — replaces the single-purpose sparkline with a reusable chart that overlays multiple series.
- **Overlay + compare** — multiple KPIs on one graph; compare periods (the existing raw / indexed / %-change modes + range windows 24h/7d/30d/90d/quarter/ytd/12m).
- **Target line + deviation band** — plot the KPI's target and shade the on-track / off-track deviation (Part C's math).
- **Saved views** — name and save a set of KPIs + chart type + range (per user).
- Honest rendering: absolute-unit axes where units exist (not just normalised direction); label any index as an index.

## Part B — More KPIs + custom KPIs
- **Surface all** — the 20 + 40 + evidence series appear in the explorer (Part A) via the registry, not just the 5 primary.
- **Custom KPIs** — a simple builder: pick a **numerator series** and optional **denominator series** + an op (ratio / sum / diff / rate) → a new `KpiDescriptor` (`kind:"custom"`), stored per agency, plottable like any other. (Not a formula-language — a guided builder, so it stays safe/honest.)

## Part C — Targets, deviation & adaptive baselines
- **Config store** — per-agency and per-company **target/threshold/weight overrides** (move the hardcoded guardrails into `agencySettings` / company config). Layered: system default → agency → company (most specific wins), like the radar policy resolver.
- **Set target → see deviation** — the math already exists (`resolveKpiPlan`: `expectedValue`, `paceGap`, `targetGap`, `forecastValue`). Surface it: set a target in the UI, and every view shows **on-track / behind / ahead** vs. the time-scaled expectation + a forecast to period-end.
- **Adaptive baselines** — extend the evidence vault from a fixed median baseline to a **rolling/learned baseline**, and **auto-suggest a target** from a metric's own trailing history (e.g. "last quarter +10%"). The radar policy learning states connect here.
- **Versioning** — a changed target/formula is stamped with an effective-from, so trend lines stay comparable and you can see "target raised here".
- **Honesty preserved** — still `null`/"Learning" without enough history; adaptive suggestions are *suggestions* a human accepts (guess-then-confirm).

## Part D — Customer intelligence per business / ecosystem
- **Scope selector** — the people-map + demographics run for **one business** or the **full ecosystem** (reuse the command-intelligence per-scope readings model).
- **Configurable dimensions** — choose what the map/segments break down by: location / lead-source / segment / product / value.
- **Real geo (optional)** — augment the schematic `locationPoint()` with real geocoding where the data supports it; **honest fallback** to schematic/"unmapped" when it doesn't (never a fake pin).

---

## Phases (staged, simple-first — each shippable + tested)
1. ✅ **The registry + explorer v1** — build `kpiRegistry`, register the 20 command KPIs, and a searchable explorer that plots them on a reusable **line/area/bar** chart with the existing range/compare controls. *This alone fixes "not many KPIs, can't explore".*
2. ✅ **Target line + deviation** — surface `resolveKpiPlan`'s pace/target/forecast on the explorer graph (target line + on-track/behind/ahead). *Your "set a target, see deviation" — mostly surfacing existing math.*
3. ✅ **Register the rest** — add the 40 commercial formulas + radar evidence series to the registry → all searchable/plottable.
4. ✅ **Editable targets per business** — the config store; set/override targets + thresholds per agency/company, versioned.
5. ✅ **Adaptive baselines + suggested targets** — extend the evidence vault; auto-suggest targets from history (human-accepted). *Leans on [radar-upgrade](radar-upgrade.md)'s evidence-vault work.*
6. ✅ **Custom KPIs** — the guided numerator/denominator builder.
7. ✅ **Customer intelligence scope + config** — per-business/ecosystem, configurable dimensions; real geo where possible.

## Data model / where it lives
- `lib/kpiRegistry.ts` (descriptors) + `lib/server/kpiRegistry.ts` (series providers, wrapping `commandIntelligence` / `commercialIntelligence` / `radarEvidenceVault`).
- Config: `agencySettings.kpiTargets` + per-company overrides (new), resolved like radar policy.
- Custom KPIs + saved views: new `PortalState` collections (`customKpis`, `kpiViews`).
- UI: a new `_KpiExplorer.tsx` (reuses/generalises `_CommandCentreKpiTrajectory`'s SVG); `_CustomerProfilesWorkspace` gains scope + dimension controls.

## Reuse (this is mostly surfacing, not building)
`resolveKpiPlan` (pace/target/forecast) · `radarEvidenceVault` (baselines/trends/series) · `commandIntelligence` + `commercialIntelligence` (the 60 metrics) · `_CommandCentreKpiTrajectory` SVG (generalise into the chart) · the per-scope readings model · radar policy resolver (pattern for the target config layering).

## Tests
Behavioural: registry lists every metric with a valid series; explorer plots + switches chart types; a set target produces the right on-track/behind/ahead + forecast for known inputs; a config override changes the resolved target; adaptive baseline is honest (Learning without history); custom KPI computes correctly; customer-intelligence scope filters correctly. (Not just source-shape assertions — real input→output.)

## Decisions (Ed said "yes" → resolved to the recommended path; override any)
- ✅ **Formulas** — v1 makes **targets/thresholds/weights** editable per business; a full **formula-builder** is deferred (custom KPIs cover most of the need via the guided builder).
- ✅ **Explorer home** — Command Centre.
- ✅ **Custom KPIs** — a **guided builder** (numerator/denominator/op), not a formula language; lands in Phase 6.
- ✅ **Customer intelligence** — configurable + scoped first; **real geo optional/later** (honest fallback meanwhile).
- ✅ **Saved views — BOTH** (Ed, 2026-08-19): support **per-user private** *and* **shared agency-wide** views → the new `kpiViews` collection carries a visibility field (`private`|`shared`), owner-stamped. Lands as a follow-on slice once the explorer exists.
- ~~⏳ Still open — confirm at Phase 5: which metrics get **adaptive** baselines first.~~ **Moot — Phase 5 shipped without needing the pick.** `suggestKpiTarget` (`src/lib/performance/kpiRegistry.ts:283`) derives a suggestion from **any** descriptor's own trailing history and returns `null` ("Learning") under three finite points, so every KPI gets adaptive treatment or an honest refusal. There was no first-tranche to choose.

## Reality check — the explorer already largely exists (verified 2026-08-19)
Building against source showed `KpiComparisonWorkspace` (`_CommandIntelligenceWorkspace.tsx:353`,
already consumed by the battle table) **already delivers most of Parts A–B and the Phase-2
target/forecast surface**: searchable multi-select over the 20 KPIs, multi-series overlay,
raw/indexed/%-change **and** a `plan` mode (required-pace line + target + pace variance + period
forecast via `resolveKpiPlan`), 24h…12m ranges, saved views (localStorage) and **editable
baseline/target overrides** (localStorage).

**Ed's call (2026-08-19): REPURPOSE it — do _not_ build a parallel `_KpiExplorer.tsx`.** So Phase 1
becomes: the **registry** (the real backbone), **feed the explorer's selector from the registry**,
add **line/area/bar chart types**, and **surface it in the executive view**.
`_CommandIntelligenceWorkspace.tsx` is therefore in scope (shared with the battle table — flagged in
[state.md](../../context/state.md)); the `_CommandCentreKpiTrajectory` refactor is dropped from Phase 1
(not needed for the repurpose path, and it lowers regression risk to leave the trajectory alone).

~~Real remaining gaps by phase: P1 registry + chart-types · P3 the 40 commercial + evidence series ·
P4 server-persisted targets · P5 adaptive · P6 custom KPIs · P7 customer-intelligence scope.~~

**Stale — this was the mid-build snapshot and every item on it has since landed.** Corrected
2026-08-20: in particular P4's "today's overrides are browser-only" is **no longer true** —
targets round-trip through `GET`/`POST /api/portal/kpi-registry/targets`
(`_CommandIntelligenceWorkspace.tsx:394`, `:504`, `:512`), with `localStorage` kept only as a
local mirror. The one thing genuinely still browser-only is **saved views** (`kpiViews` was never
built) — see the warning under Status.

## Non-goals (v1)
- Not a full BI tool (no arbitrary SQL/joins) — a curated explorer over the app's own metrics.
- Not a free-text formula language (the guided builder instead) — keeps it safe + honest.
- Not fabricating data or geo — the honesty layer and "unmapped" fallbacks stay.

## Ties
Rides the **radar evidence vault** ([radar-upgrade](radar-upgrade.md) — baselines/trends, being enhanced). Every metric's formula + source is in the [KPI dossier](../../workspace/kpi-intelligence.md). The customer-intelligence scope reuses the command-intelligence per-scope model.

## File map — what this plan owns

_Derived and existence-checked 2026-08-20. This is the collision contract: with Claude and
Codex workers in ONE uncommitted tree, two agents in the same file destroys work and there is
no git to recover from. Before assigning this plan, check these paths against every other
plan in flight._

- `src/lib/performance/kpiRegistry.ts`
- `src/engines/data/server/kpi/kpiRegistryService.ts`
- `src/engines/data/server/kpi/kpiTargets.ts`
- `src/engines/data/server/kpi/customKpis.ts`
- `src/lib/people/customerProfileScope.ts`
- `src/app/api/portal/kpi-registry/targets/route.ts`
- `src/app/api/portal/kpi-registry/custom/route.ts`
- `src/app/api/portal/kpi-registry/evidence/route.ts`
- `src/app/portal/agency/_CommandIntelligenceWorkspace.tsx`
- `src/app/portal/agency/_CommandCentreKpiTrajectory.tsx`
- `src/app/portal/agency/marketing/_CustomerProfilesWorkspace.tsx`
- `src/server/types.ts`
- `src/server/storage.ts`
- `scripts/smoke-kpi-registry.test.ts`
- `scripts/smoke-kpi-targets.test.ts`
- `scripts/smoke-radar-kpi-scorecard.test.ts`
- `scripts/smoke-marketing-customer-profiles.test.ts`
- `docs/development/plans/kpi-intelligence-overhaul.md`
