# Data engine evolving baselines — rolling window + ratchet band (queue #13)

**Status:** PLAN — behaviour-changing (Radar checks and KPI verdicts shift), so Ed approves before build. Captured 2026-08-21, autonomous loop.

## Proven current state

Three baseline mechanisms already exist, unshared:
- **Client-health evolving baseline (the Ed-approved model, already "rolling + ~10% band + ratchet"):** `src/lib/clients/clientAquaHealth.ts:60-68` (`BASELINE_TOLERANCE = 0.1`, floors 3 enquiries / 20 views, `MAX_BASELINE_MONTHS = 6`), `signalBaseline()` at `:335-353` (current 30-day bucket vs mean of prior monthly buckets; ratio null under floor), band verdicts at `:197-209` (within 10% = healthy, dip = watch, fall-to-none = risk). Documented as Ed's decision in `docs/development/plans/client-health.md:57` and `docs/development/updates.md:1519`.
- **Vault rolling baseline (KPI Phase 5B, display-only):** `src/engines/data/server/radar/radarEvidenceVault.ts:192,207` — `evidenceSeriesSummary` computes median of `points.slice(-DEFAULT_BASELINE_POINTS)` (12, `:27`), `undefined` under 3 points; surfaced onto evidence descriptors at `src/lib/performance/kpiRegistry.ts:408`. The anomaly path was **deliberately not** switched to it: `assess()` at `radarEvidenceVault.ts:224-232` still uses the median of up to 360 retained points (all-time-ish) + MAD `deviationScore`, with fixed cutoffs in `anomalyStatus` `:311-319` (6/3.5/2.5 deviations × 50/20/10 %) and velocity cutoffs `:268` (75/35 %).
- **suggestKpiTarget (Phase 5A, guess-then-confirm):** `src/lib/performance/kpiRegistry.ts:283-295` — rolling median nudged ±10% (`growthPercent = 10`) in the favoured direction, null under 3 points; applied via ✨ button in `src/app/portal/agency/_CommandIntelligenceWorkspace.tsx:552-559` (POSTs to `/api/portal/kpi-registry/targets`).

Static baselines/thresholds hardcoded today:
- 20 command KPIs carry literal plan targets: `src/lib/server/commandIntelligenceService.ts:150-174` (health 80, growth 5%, conversion 20%, ROAS 3x, retention 80%, attribution 85% …); `makeKpi` fallback baseline = first history point (`:344-350`).
- Per-family radar guardrails inline in `src/engines/data/server/radar/radarObservations.ts` (e.g. `lead-conversion-rate` 5/20/10 `:169`, `retention-state` 80/60 `:203`, `enquiry-linkage` 90 `:159`); lens cutoffs in `src/engines/data/radar/radarCheckEngine.ts:162,196,260,287`.
- Policy defaults: `src/engines/data/radar/radarPolicyEngine.ts:82-86` (warn 15% / critical 30%, `minimumSampleSize` 12, `learningPeriodDays` 30); `applyConfiguredTarget` `:180-191` computes breach % against a **static** `policy.targetValue`. `RadarPolicyRule.baselineStrategy` exists (`:55,81`) but has no "evolving" option.
- Battle war room: `src/app/portal/agency/_battleWarRoom.ts:122` (`HEALTH_BASELINE = 70`), `revenuePosition` month-to-date corridor `:138-156` (±5% ahead/behind).

Targets/overrides layer already exists: `agencySettings.kpiTargets` store (`src/engines/data/server/kpi/kpiTargets.ts:22-60`), pure layered/versioned `resolveKpiTarget`/`applyKpiTargetOverride` (`kpiRegistry.ts:198-252`), route `src/app/api/portal/kpi-registry/targets/route.ts:21`. Note: overrides are read only by the route + explorer localStorage — `buildCommandIntelligenceSnapshot` never merges them into `plan`.

Consumers: Radar checks/issues via `buildRadarEvidenceLayer` folded in at `src/engines/data/server/radar/businessIssueRadar.ts:440-453`; KPI trajectory reads `plan.baselineValue/targetValue` at `src/app/portal/agency/_CommandCentreKpiTrajectory.tsx:85,103-106`; battle table consumes the shared `KpiComparisonWorkspace` (docs/workspace/kpi-intelligence.md, "onInspect contained"); `src/server/performanceExperiments.ts` is a CRUD split-test store with free-text `primaryMetric` (`:44`) — no baseline logic, not a real consumer.

Pinned smoke tests (behaviour contracts):
- `scripts/smoke-kpi-registry.test.ts:252-265` pins `suggestKpiTarget` exact medians ±10% and null-under-3; `:199,:210` pins `rollingBaseline` → descriptor `baseline` (and honest null).
- `scripts/smoke-kpi-targets.test.ts:10-49` pins target persistence/versioning.
- `scripts/smoke-business-radar.test.ts:434-462` regex-pins vault source (`RECENT_POINT_LIMIT = 288`, `deviationScore`, `EvidenceAssessment`); `:220` ≥140 checks/domain; `:559` policy persisted/editable.
- `scripts/smoke-radar-golden-sweep.test.ts:36-44,86` pins exact counts (2,064 catalogue / 2,959 total / 145 sentinels) + determinism.
- `scripts/client-aqua-health.test.ts:66,88,109` pins the evolving-baseline band (risk on fall-to-none, risk on sharp drop, >10% dip stays informational).
- `scripts/smoke-battle-table.test.ts:319,348` pins the month-to-date corridor + no-target honesty.
## What is genuinely missing
1. A single shared evolving-baseline primitive — the rolling-window/band/median math exists in 3 (really 4, counting `assess()`) divergent copies.
2. Ratchet semantics — nothing prevents a baseline drifting *down* on decline; "each new high sets the new standard" is only approximated by client-health's mean-of-prior-months.
3. Behaviour: the 5B rolling baseline never drives a status — anomaly math still uses the all-time median, threshold checks still use static targets/tolerances.
4. Server-side merge of `kpiTargets` overrides and vault rolling baseline into `CommandKpi.plan` (today `plan.baselineValue` is a hardcoded literal or first history point).
5. A `baselineStrategy: "evolving"` policy option so families opt in per Radar policy rather than a global flip.
## Options
- **A. Shared primitive + policy-gated wiring (recommended).** Extract pure `evolvingBaseline` helper into `src/engines/data/`; refactor vault summary + `suggestKpiTarget` onto it (outputs identical); feed `makeKpi` baselines from vault `rollingBaseline` + merge `resolveKpiTarget` server-side; add `baselineStrategy: "evolving"` so `applyConfiguredTarget`/`assess()` use the ratcheted rolling baseline where no explicit human target exists. Cost: medium (~5 files + test updates). Risk: status shifts on threshold/anomaly checks — contained by the policy gate; golden-sweep counts unchanged (no new checks).
- **B. Display-only band.** Surface rolling baseline + ±10% band on trajectory/explorer/battle pulse; change no status. Cost: low. Risk: ~zero — but fails the queue item's "behaviour-changing" intent; bands gate nothing.
- **C. Full adaptive-radar rewrite.** Move all hardcoded guardrails in `radarObservations.ts` into policy with evolving defaults, rewrite `assess()`/`applyConfiguredTarget` wholesale. Cost: high. Risk: high — 2,959 pinned checks, golden fixtures, adaptive-conclusion tests; disproportionate to the queue item.
## Recommendation
Option A. Reuse the Ed-approved client-health model (±10% band, floors, learning-gate) as the semantic spec, the vault's median-of-recent-window as the mechanism, and the existing policy resolver as the opt-in switch. Explicit human targets (`kpiTargets` / `policy.targetValue`) always outrank the evolving baseline — the ratchet band applies only where no approved target exists, preserving the "human accepts targets" contract.
## Risks
- Golden sweep pins exact counts + determinism (`smoke-radar-golden-sweep.test.ts:36-44,86`): add **no** new checks; keep evaluation deterministic for a fixed clock.
- `smoke-business-radar.test.ts:434` regex-pins vault source text — keep `RECENT_POINT_LIMIT = 288`, `deviationScore`, `EvidenceAssessment` names/values.
- `smoke-kpi-registry.test.ts:252-265` pins the 10% default and median math — keep `growthPercent = 10` and median semantics through the refactor.
- Hard ratchet honesty: a never-lowering baseline after a one-off spike creates a permanently "behind" metric — needs a soft ratchet (windowed max or decay) and an Ed decision; client-health's pinned model is a soft ratchet.
- `_CommandIntelligenceWorkspace.tsx` is shared with the battle table (docs/context/state.md KPI-worker row warns) — coordinate before touching; keep changes in `plan` data, not the workspace.
- Status flips on live agencies when a family opts in — policy default must stay current behaviour (`baselineStrategy` default remains `"target-and-baseline"`, `radarPolicyEngine.ts:81`).
## Phases
1. **Extract the shared primitive** — pure `src/engines/data/evolvingBaseline.ts` (rolling window, median, ~10% band, soft ratchet, learning floors) and refactor `evidenceSeriesSummary` (radarEvidenceVault.ts:192-211) + `suggestKpiTarget` (kpiRegistry.ts:283-295) onto it with byte-identical outputs so smoke-kpi-registry stays green untouched.
2. **Feed command-KPI plans honestly** — `makeKpi` (commandIntelligenceService.ts:344-350) falls back to the matching series' `rollingBaseline` before first-history-point, and `buildCommandIntelligenceSnapshot` merges `resolveKpiTarget(getKpiTargetsConfig(...))` so persisted overrides reach every `plan` consumer (trajectory, explorer, marketing pulse).
3. **Policy opt-in** — additive `baselineStrategy: "evolving"` on `RadarPolicyRule` + resolver (radarPolicyEngine.ts:77-90); `applyConfiguredTarget` (:180-191) measures breach against the ratcheted rolling baseline when strategy is evolving and no explicit `targetValue` is set; default unchanged.
4. **Anomaly math onto the rolling baseline** — `assess()` (radarEvidenceVault.ts:224-232) compares current to the rolling/ratcheted baseline instead of the all-time median, keeping MAD cutoffs; update the smoke-business-radar vault regexes and any status-dependent counts deliberately in the same commit.
5. **Surface the band** — trajectory (_CommandCentreKpiTrajectory.tsx) and explorer plan-mode render the baseline band + "baseline raised here" ratchet marker from `KpiTargetOverride.history` (kpiRegistry.ts:224-235); display-only, no status change.
6. **Pin + document** — new contract tests (ratchet raises on new highs, never silently lowers, explicit target outranks band, learning under floors), full `npx tsx --test scripts/*.test.ts`, then update docs/workspace/kpi-intelligence.md + radar.md and regenerate `docs/reference/`.
