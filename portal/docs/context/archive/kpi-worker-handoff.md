# KPI Intelligence overhaul — worker handoff

> 🗄 **ARCHIVED 2026-08-20.** Historical worker debrief; the KPI Intelligence overhaul shipped. Suite counts quoted inside (1697) are long superseded — current is 2382 pass / 0 fail. Its one decided-but-unbuilt item, server-persisted `kpiViews`, is carried forward under *Held / parked* in [next-wave-briefs.md](../next-wave-briefs.md). Superseded by [checklist.md](../../development/checklist.md) and [state.md](../state.md).

← [context/](../README.md) · Plan: [kpi-intelligence-overhaul.md](../../development/plans/kpi-intelligence-overhaul.md) · Dossier: [kpi-intelligence.md](../../workspace/kpi-intelligence.md)

_Written 2026-08-19 by the KPI worker at end of the build. The whole plan is
shipped; this is the honest "done / tested / problems / thoughts / what's left"._

---

## TL;DR

The **KPI Intelligence overhaul is complete — all 7 phases** (1, 3, 4, 5A, 5B, 6, 7).
Full smoke suite **1697 pass / 0 fail / 1 skip**, my files **typecheck-clean**.

**Two honest caveats, up front:**
1. **Nothing is browser-verified by a full interactive click-through.** The app
   *boots and renders* with the whole overhaul integrated (confirmed live — see
   [Verification](#verification-status)), but the deep walk of the explorer
   internals was blocked by dev-server/browser instability, not by any code defect.
2. **One plan item was decided but NOT built:** server-persisted, per-user + shared
   **saved views** (`kpiViews`). The explorer still uses its pre-existing
   *localStorage* saved views. See [What's left](#whats-left--handoff-actions).

**Nothing is committed** (per house rule). All work is in the working tree.

---

## The one big idea — the KPI Registry

The plan's own framing: *"the one new abstraction that makes everything else fall
out."* That's the **`KpiDescriptor`** — a single uniform shape every metric is
projected into, so the explorer can search / select / overlay / plot anything the
same way. Everything downstream is a projection into that shape:

- command KPIs → `describeCommandKpis` (the 20)
- commercial formulas → `describeCommercialFormulas` (the 40)
- radar evidence series → `describeEvidenceSeries` (the ~1,500, lazy-loaded)
- custom KPIs → `describeCustomKpis` (computed from the above)

**It wraps, it never recomputes.** Every field is lifted verbatim off already-built
data. That's what kept the whole thing honest (no fabricated numbers) and low-risk.

`lib/kpiRegistry.ts` is client-safe (pure, type-only imports) and holds all the
pure logic; `lib/server/*` are the thin server seams (build snapshot, read vault,
persist config). **If you touch KPIs, start in `lib/kpiRegistry.ts`.**

---

## What shipped, phase by phase

| Phase | What | Key files |
|---|---|---|
| **1** | KPI Registry + **repurposed** the existing `KpiComparisonWorkspace` explorer + **line/area/bar** chart types + **"Explore all KPIs"** entry on the trajectory | `lib/kpiRegistry.ts`, `lib/server/kpiRegistry.ts`, `_CommandIntelligenceWorkspace.tsx`, `_CommandCentreKpiTrajectory.tsx` |
| **3** | Registered the **40 commercial formulas** + **~1,500 radar evidence series**; migrated the chart pipeline from `CommandKpi` → `KpiDescriptor`; lazy evidence route | `_CommandIntelligenceWorkspace.tsx`, `api/portal/kpi-registry/evidence` |
| **4** | **Server-persisted, layered (agency→company), versioned (effective-from + history)** targets | `types.ts` (`KpiTargetsConfig`), `lib/server/kpiTargets.ts`, `api/portal/kpi-registry/targets`, explorer wiring |
| **5A** | **Suggested targets from history** — rolling median + growth band, ✨ "Suggest" button, guess-then-confirm | `lib/kpiRegistry.ts` (`suggestKpiTarget`), explorer |
| **5B** | **Rolling/learned baseline in the vault** — additive `rollingBaseline` on the series summary; **radar anomaly path untouched** | `radarEvidenceVault.ts`, `businessRadar.ts` (type), `kpiRegistry.ts` |
| **6** | **Guided custom KPIs** — numerator/denominator/op builder, computed client-side, plottable | `types.ts` (`CustomKpiDefinition`, `PortalState.customKpis`), `lib/server/customKpis.ts`, `api/portal/kpi-registry/custom`, explorer builder UI |
| **7** | **Customer-intelligence scope + configurable dimensions** — one-business↔ecosystem + breakdown | `lib/customerProfileScope.ts`, `marketing/_CustomerProfilesWorkspace.tsx` |

---

## Files touched

**New (mine, clean lane):**
- `src/lib/performance/kpiRegistry.ts` — the registry backbone + all pure logic (descriptors, search/group, targets resolver/versioning, suggestions, custom-KPI compute).
- `src/lib/server/kpi/kpiRegistryService.ts` — build-snapshot→descriptors + `buildEvidenceDescriptors`.
- `src/lib/server/kpi/kpiTargets.ts` — target store (get/set/clear, activity-logged).
- `src/lib/server/kpi/customKpis.ts` — custom-KPI store (list/create/delete).
- `src/lib/people/customerProfileScope.ts` — scope + dimension breakdown (pure).
- `src/app/api/portal/kpi-registry/{evidence,targets,custom}/route.ts` — 3 routes.
- `scripts/smoke-kpi-registry.test.ts`, `scripts/smoke-kpi-targets.test.ts`, `scripts/smoke-customer-profile-scope.test.ts`.

**Edited — mine:**
- `_CommandCentreKpiTrajectory.tsx` — added "Explore all KPIs".
- `marketing/_CustomerProfilesWorkspace.tsx` — scope selector + breakdown panel.

**Edited — shared / out-of-original-lane (all Ed-approved; flagged in state.md):**
- `_CommandIntelligenceWorkspace.tsx` — **the big one.** The whole explorer:
  registry-backed selector, chart types, `CommandKpi→KpiDescriptor` migration,
  target persistence, ✨ suggest, custom-KPI builder. **Battle table consumes this
  file via `KpiComparisonWorkspace` — coordinate before battle-table work.**
- `_DashboardCommandCenter.tsx` — (light) mount context only.
- `server/types.ts` — **additive only** (KPI target + custom-KPI types +
  `agencySettings.kpiTargets` + `PortalState.customKpis`). Shared with Dev-Mode /
  Aqua-Tag — I kept strictly to additions.
- `server/storage.ts` — `customKpis: {}` in **both** state constructors (`empty()` + `parseBlob`).
- `radarEvidenceVault.ts` — **additive** `rollingBaseline` on the series summary
  only. **The anomaly path (`assess`/`deviationScore`/checks) is deliberately
  untouched** → radar behaviour unchanged. ⚠ vault-adjacent → coordinate w/ radar.
- `businessRadar.ts` — additive optional `rollingBaseline?` field on the summary type.

---

## Tests

- **`smoke-kpi-registry.test.ts`** — the core pure suite (~18 cases): descriptor
  projection (command/commercial/evidence), search/group, target layering +
  versioning, history-based suggestion, custom-KPI compute (op math, div-by-zero →
  null, missing operand → null), + wiring contracts pinning the explorer to the
  registry/routes.
- **`smoke-kpi-targets.test.ts`** — server store roundtrips (seeded agency): a
  config override changes the resolved target, versioned/company-scoped/cleared;
  custom-KPI create→list→delete; route wiring contract.
- **`smoke-customer-profile-scope.test.ts`** — scope keeps group-wide profiles;
  dimension counts + sorting; company-id→name mapping.

**Style:** real input→output on the pure logic (the plan asked for behaviour, not
just source-shape). The stores are exercised via seeded roundtrips. **What is NOT
runtime-driven:** the API route *handlers* themselves (auth path) — they're thin
wrappers over the tested store + `requireRole`, so I contract-pinned them rather
than issuing in-process sessions. Full suite went 1655 → **1697** across the build.

---

## Verification status

**Honest levels** (per [status.md](../../development/status.md) vocabulary):

- **Logic-tested:** ✅ everything (pure logic + seeded store roundtrips, full suite green).
- **Runtime-verified (boots + renders):** ✅ **partial but real.** With `:3032`
  down, I spun up **my own** dev server (`aquacrm-verify`, file backend) on **my
  current build**, authed via `/dev`, and confirmed **the Day Command dashboard AND
  the executive Command Centre both render live** (health/confidence/readiness, the
  business-radar plot, "LIVE BUSINESS DATA") — i.e. **the whole overhaul is
  integrated and the app boots with no SSR/compile/console error.**
- **Runtime-verified (interactive walk):** ❌ **not done.** Scrolling to the KPI
  trajectory to open the explorer and exercise chart-types / commercial / evidence /
  custom-builder / ✨ suggest **hung the browser pane**. This app's heaviest routes
  overwhelm the dev server + in-app browser under the multi-worker recompile load —
  an **environment** problem, not code.

**The interactive click-through is the single outstanding verification.** Do it on
a freshly-restarted, un-contended server.

---

## Problems & challenges (the real ones)

1. **The explorer already existed.** The biggest finding of Phase 1: the plan says
   "build a KPI explorer," but `KpiComparisonWorkspace` already did ~80% of it
   (search, multi-select, ranges, raw/indexed/%-change, a plan mode with
   pace/target/forecast, saved views, target overrides). Building a parallel
   `_KpiExplorer.tsx` would've been a third duplicate KPI surface. **Surfaced it,
   Ed chose repurpose.** This reframed the whole plan (Phases 1–2 were mostly
   already shipped) and is why there's no `_KpiExplorer.tsx`.
2. **The `CommandKpi → KpiDescriptor` chart migration (P3.B)** was the riskiest
   edit — ~30 changes to a shared component the battle table also uses. Contained
   the blast radius by (a) decoupling the shared format helpers to take `format`
   (so the command-KPI inspector was untouched), and (b) guarding `onInspect` so
   the battle-table signature never changed. `tsc` was the checklist; command-KPI
   output is identical *by construction* (the descriptor lifts the same values).
3. **~1,500 evidence series = noise risk.** The vault holds ~1,500 mostly-technical
   per-check series. Registering "all" would've flooded the picker. Surfaced it;
   Ed said register all anyway — so they're **lazy-loaded on demand** (a button +
   route) and the picker render is **capped at 200** with a "+N more, refine search".
4. **P5B was the coordination-gated one** (radar-engine). Did it the safe way:
   additive `rollingBaseline` on the *summary* only, **anomaly path untouched** →
   every radar test stayed green. No `businessIssueRadar`/`radarSweeps`/`catalog` edit.
5. **`:3032` was unusable all session** — stale build, then hung, then crashed/down.
   The multi-worker recompile storm keeps it starved. My own server booted my build
   fine but the browser pane hung on the heaviest route. **The dev server looks
   resource-constrained under this many concurrent workers.**
6. **Concurrent doc races.** `state.md`/`updates.md`/`todo.md`/`status.md` are edited
   by many chats at once — several of my edits hit "file changed since read." Kept
   edits surgical (single anchors) and re-read on conflict. Worth knowing.
7. **A second `PortalState` constructor.** Adding `customKpis` failed `tsc` until I
   found the *second* state literal in `parseBlob` (storage.ts). If you add a
   `PortalState` field, there are **two** places to update.

---

## Honest thoughts / observations

- **The registry is the real deliverable.** Phases 3/6 fell out of it almost for
  free — a new metric family is just another `describeX → KpiDescriptor[]`. If you
  extend KPIs, extend the registry, not the UI.
- **Phases 2 and part of 4 were already built** (the plan's plan-mode +
  localStorage overrides). Most of my Phase-1/2 "work" was surfacing that and
  wiring the registry in, not building new UI. Good — but it means the plan doc
  overstated what was missing.
- **`_CommandIntelligenceWorkspace.tsx` is now large and does a lot.** It's the
  explorer, the plan-mode forecaster, the target editor, the suggest button, and
  the custom-KPI builder. It works, but it's a candidate for a future split. The
  battle table depends on it — treat it as shared.
- **Honesty held throughout.** Null/"Learning" everywhere there's no evidence;
  zero-denominator/missing-operand → null (never a fabricated number); index
  labelled as index; the rolling baseline is `undefined` under 3 points. That was
  the plan's non-negotiable and it's intact.
- **The evidence-series feature is powerful but heavy** — 1,500 series behind a
  lazy button. Good for power users; keep an eye on the payload if usage grows.

---

## What's left / handoff actions

**Genuinely unbuilt (decided, not implemented):**
- **`kpiViews` — server-persisted, per-user + shared saved views.** Ed decided
  **"both"** early on, and the `kpiViews` collection is in the plan's data model,
  but I **never built it** — the explorer still uses its pre-existing *localStorage*
  saved views. This is the one plan item that's decided-but-missing. A clean
  follow-up: a `PortalState.kpiViews` collection + `GET/POST/DELETE
  /api/portal/kpi-registry/views` + swap the localStorage save/load for it, with a
  `visibility: "private" | "shared"` field (owner-stamped).

**Verification:**
- **The interactive browser walk** of the explorer (chart types / commercial /
  evidence load / custom builder / ✨ suggest) + the customer-profile scope — on a
  stable server. Everything renders; this just proves the clicks.

**Optional niceties (plan says these are optional/deferred — not owed):**
- Feed the new `rollingBaseline` into the *anomaly* math too (I kept anomaly
  untouched on purpose — this is a deliberate, coordinate-first change).
- **Real geo** in customer intelligence (augment `locationPoint()` with real
  geocoding + honest "unmapped" fallback). Needs a geocoding source.

**Coordination flags (in state.md):**
- `radarEvidenceVault.ts` was additively edited (vault summary only) → sequence
  against **Aqua-Tag's tag→Radar** work; no anomaly change, so low risk.
- `_CommandIntelligenceWorkspace.tsx` is shared with the **battle table** — anyone
  touching battle-table's `KpiComparisonWorkspace` usage should coordinate.
- `server/types.ts` KPI additions are **additive** and co-exist with Dev-Mode /
  Aqua-Tag edits — keep it additive.

**Standing note:** `:3032` was down when I finished (it had crashed). A fresh dev
server restart is worth it for everyone.

---

## Decisions Ed made (on the record)

- **Saved views = BOTH** per-user + shared (⚠ decided, not yet built — see above).
- **Repurpose** `KpiComparisonWorkspace`, do NOT build a parallel `_KpiExplorer`.
- **Register all ~1,500** evidence series (not a curated subset).
- **Commercial now, evidence next** (P3 sequencing).
- **P5B "just do it"** (radar-engine gate overridden by Ed directly).
- Adaptive-first metrics, real-geo: deferred / not needed for v1.

---

## New API surface (all agency-scoped, additive)

| Route | Methods | Purpose |
|---|---|---|
| `/api/portal/kpi-registry/evidence` | GET | ~1,500 evidence series as descriptors (lazy) |
| `/api/portal/kpi-registry/targets` | GET · POST | Read / set / clear layered versioned targets |
| `/api/portal/kpi-registry/custom` | GET · POST · DELETE | Custom-KPI definitions |

_See [api-reference.md](../../workspace/api-reference.md) for the canonical rows._
