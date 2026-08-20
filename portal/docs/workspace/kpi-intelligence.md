# Chapter — KPI & Intelligence (feature dossier)

← Back to [the contents page](../WORKSPACE-FILE-TREE.md)

Verified from source. Every metric the Command Centre computes — its formula and
its source data — plus the five compute layers, the trajectory mechanics, and an
honest split of what's genuinely computed vs. hardcoded vs. a visual index.

> **Honesty contract (verified):** no demo/mock numbers are injected anywhere in
> these paths. Missing data yields `null` / "Learning" / "blind" / "—", never a
> fabricated value. Hardcoded values are *guardrail thresholds and weights* (by
> design), not fake data.

## 0. Five compute layers (they overlap on purpose — the boundary matters)

| Layer | File | Produces | Consumed by |
|---|---|---|---|
| Company health | `lib/server/companyHealthSnapshot.ts` → `lib/companyHealth.ts` | health actuals, revenue-growth history, 100-pt score (4 sub-scores), revenue gap / deals-needed | the `business-health`, `mrr`, `revenue-*` KPIs |
| Commercial lifecycle | `lib/commercialLifecycle.ts` | lifecycle snapshot + Radar **checks/issues/signals**, source cohorts | written into `radar.commercial.*`; command KPIs read it |
| Command intelligence | `lib/server/commandIntelligence.ts` (types in `lib/commandIntelligence.ts`) | **20 primary KPIs**, per-scope readings, campaigns, audiences, demand flow | the Command Centre cockpit + all `_Command*`/`_Day*` panels |
| Commercial intelligence | `lib/commercialIntelligence.ts` | **40 formula metrics**, pipeline stages, person ledger, source economics, lineage, quality | `_CommercialIntelligenceWorkspace.tsx` |
| Brand portfolio | `lib/server/brandPortfolio.ts` (types in `lib/brandPortfolio.ts`) | per-trading-company rollup rows | company-scope readings + `_BrandPortfolioInstrument.tsx` |

`buildCommandIntelligenceSnapshot` (`server/commandIntelligence.ts:87`) is the
orchestrator: `Promise.all`s company health + marketing + brand portfolio, pulls
the Radar, then nests `buildCommercialIntelligence(...)`. **The Command snapshot
is the superset.** `commercialIntelligence`/`commercialLifecycle` are pure (no
server twin); `commandIntelligence.ts`/`brandPortfolio.ts` are types-only.

## 1. The 20 primary Command KPIs
Source: `server/commandIntelligence.ts:146–172` + `measurementFor` (549–571).

| # | id | Label | Formula / derivation | Source |
|---|---|---|---|---|
|1|`business-health`|Business health|`income×.35 + clients×.25 + pipeline×.25 + operations×.15` (§4)|`radar.adaptive.healthScore`|
|2|`revenue-target`|Revenue target attainment|`monthRevenue / monthlyRevenueTarget ×100`|companyHealth + profile|
|3|`mrr`|Monthly recurring revenue|`Σ active plan monthly value`|finance `founderSnapshot.mrrCents`|
|4|`revenue-gap`|Revenue gap|`max(0, target − monthRevenue)`|companyHealth|
|5|`recent-leads`|New leads in 30 days|`count(leads capturedAt ≥ now−30d)`|`radar.commercial.recentLeadCount`|
|6|`lead-conversion`|Lead-to-client conversion|`convertedLeads / allLeads ×100`|`radar.commercial.conversionRatePercent`|
|7|`speed-to-lead`|Replies within target|`responses within SLA / measurable ×100`|`radar.speedToLead`|
|8|`source-attribution`|Lead source attribution|`(leads − unattributed)/leads ×100`|`radar.commercial`|
|9|`active-campaigns`|Active campaigns|`count(status ∈ active/scheduled/sending)`|leads-pipeline campaigns|
|10|`campaign-outcomes`|Campaign outcome coverage|`campaignsWithOutcomePath / launched ×100`|campaign rows|
|11|`marketing-spend`|Marketing spend|`Σ spendCents`|campaigns|
|12|`campaign-roas`|Campaign return on spend|`attributedRevenue / spend`|campaigns|
|13|`traffic-7d`|Website traffic 7d|`count(pageview events, 7d)`|Radar marketing check ← telemetry|
|14|`revenue-growth`|MoM revenue growth|`(current − previous)/previous ×100`|companyHealth + **`revenueGrowthHistory`**|
|15|`forms-7d`|Form submissions 7d|`count(form events, 7d)`|Radar `form-submissions`|
|16|`website-conversion`|Website conversion rate|`conversions / pageviews ×100`|Radar `conversion-rate`|
|17|`audience-confidence`|Validated audience coverage|`validatedProfiles / activeProfiles ×100`|agency-marketing profiles|
|18|`active-clients`|Active clients|`count(status=active & stage≠churned)`|`listClients`|
|19|`retention`|Portfolio retention|`active / (active + churned) ×100`|`radar.commercial.retentionRatePercent`|
|20|`client-attention`|Clients needing attention|`count(owner/contact/request/milestone/telemetry issue)`|companyHealth|

Each KPI also carries a `plan` (baseline/target/direction/cadence) and
`measurement` (unit/basis/window/formula) block. **Status thresholds are
hardcoded guardrails** (lead-conversion healthy ≥20/warn ≥10; ROAS ≥3/≥1;
audience 80/40; outcomes 80/50). Derived plan target of note: `recent-leads`
target = `max(1, ceil(max(1,dealsNeeded)/0.2))` — the `0.2` is a 20% conversion
guardrail (`:132`).

**Per-scope readings** (`websiteScopeReadings`/`clientLifecycleReadings`/`companyPortfolioReadings`):
each non-ecosystem scope re-derives its KPIs from its own evidence — website
scopes emit `traffic-7d`/`traffic-momentum`/`forms-7d`/`website-conversion`;
client scopes emit `active-clients`/`retention`; company scopes emit the revenue
family from the matching brand-portfolio row.

## 2. The 40 commercial formula metrics (`commercialIntelligence.ts:194–235`)
Every `formula` string is verbatim from source (the register literally exposes them).

| # | id | Category | Formula | Source |
|---|---|---|---|---|
|1|`lead-to-client`|outcome|Converted leads / all retained leads ×100|leads + client links|
|2|`decision-win`|outcome|Won / (won + lost) ×100|terminal stages|
|3|`portfolio-retention`|outcome|Active / (active + churned) ×100|client status|
|4|`portfolio-churn`|outcome|Churned / (active + churned) ×100|client status|
|5|`revenue-per-lead`|outcome|Attributed revenue / attributed leads|campaigns + leads|
|6|`open-pipeline`|driver|Leads excluding won & lost|stages|
|7|`new-leads-30d`|driver|Captures in trailing 30d|capturedAt|
|8|`contact-rate`|driver|Contacted / all ×100|contact ts + events|
|9|`meeting-rate`|driver|Reaching meeting+ / all ×100|meetings + stage|
|10|`proposal-rate`|driver|Reaching proposal+ / all ×100|stage|
|11|`median-response`|efficiency|Median(first response − enquiry)|timestamps|
|12|`response-sla`|efficiency|Responses ≤5min / measured ×100|timestamps|
|13|`median-conversion`|efficiency|Median(convertedAt − capturedAt)|timestamps|
|14|`median-open-age`|efficiency|Median(now − stage entry) open|stage ts|
|15|`stale-open`|efficiency|Open ≥14d / open ×100|stage ts|
|16|`enquiries-per-lead`|driver|Enquiries / retained leads|enquiry rollups|
|17|`touches-per-lead`|driver|Contact+meeting+stage events / leads|journey events|
|18|`zero-touch-open`|quality|Open leads with no contact/event|contact ts|
|19|`source-coverage`|quality|Leads with source / all ×100|lead source|
|20|`campaign-coverage`|quality|Leads matching campaign key / all ×100|campaign keys|
|21|`stage-coverage`|quality|Leads linked to a stage / all ×100|cards + stage|
|22|`conversion-linkage`|quality|Converted linked to client / converted ×100|convertedClientId|
|23|`contactability`|quality|Leads with usable email / all ×100|contact fields|
|24|`cost-per-lead`|efficiency|Spend / campaign-linked leads|spend + leads|
|25|`customer-acquisition-cost`|efficiency|Spend / linked converted clients|spend + links|
|26|`campaign-roas`|outcome|Attributed revenue / spend|spend + revenue|
|27|`pageview-to-form`|driver|Forms / pageviews ×100|Aqua Tag telemetry|
|28|`form-to-lead`|quality|Leads / forms ×100|forms + leads|
|29|`lead-loss-rate`|outcome|Lost / (won + lost) ×100|terminal stages|
|30|`decision-coverage`|quality|Won or lost / all ×100|terminal stages|
|31|`repeat-enquiry-rate`|driver|Leads with 2+ enquiries / all ×100|enquiry rollups|
|32|`response-measurement`|quality|Leads with valid clock / leads-with-enquiries ×100|timestamps|
|33|`source-concentration`|quality|Largest source / all ×100|source cohorts|
|34|`source-diversity`|driver|Distinct attributed cohorts (count)|sources|
|35|`meeting-to-proposal`|driver|Reaching proposal / reaching meeting ×100|meetings + stage|
|36|`proposal-close-rate`|outcome|Converted / reaching proposal ×100|proposal + conversion|
|37|`client-source-coverage`|quality|Clients with lead link / all ×100|client metadata|
|38|`orphan-clients`|quality|Clients without conversion link (count)|client metadata|
|39|`campaign-budget-use`|efficiency|Spend / funded budget ×100|budget & spend|
|40|`revenue-per-client`|outcome|Attributed revenue / linked converted clients|campaigns + links|

Metrics 5, 24, 25, 26, 40 stay **"Learning"** until `campaign.spendCents` /
`attributedRevenueCents` are entered — attribution-dependent, **not fabricated**.

## 3. Commercial lifecycle snapshot (`commercialLifecycle.ts`)
Radar-facing summarizer. Key fields: `leadCount`/`recentLeadCount`,
`convertedLeadCount`, `lostLeadCount`, `openLeadCount`/`staleOpenLeadCount`
(≥14d), `unattributedLeadCount`, `conversionRatePercent`,
`lostDecisionRatePercent`, `medianConversionMs`, `conversionLinkCoveragePercent`,
`activeClientCount`/`churnedClientCount`/`recentlyChurnedClientCount` (≤90d),
`pendingCancellationCount`, `retentionRatePercent`, `clientSourceCoveragePercent`,
`sourceConcentrationPercent`, `conversionSpreadPercent`/`churnSpreadPercent`,
`bestConvertingSource`/`highestChurnSource`, and per-source `cohorts[]`
(conversion/churn %, median conversion ms) gated at `MINIMUM_SOURCE_SAMPLE = 3`.
It also emits `BusinessRadarCheck`s (all `status:"blind"` when unavailable) and 4
`BusinessMetricSignal`s that surface as command KPIs via Radar.

## 4. Company health score (`companyHealth.ts:43`)
Four sub-scores, each `ratioScore = clamp(round(value/target×100),0,100)`:
- **income** = `ratioScore(monthRevenue, targetToDate)` (targetToDate scales by month-elapsed %)
- **clients** = `ratioScore(activeClients − needingAttention, activeClients)`
- **pipeline** = gap≤0 ? 100 : `ratioScore(meetings, estimatedCallsNeeded)`
- **operations** = `ratioScore(openTasks − overdue, openTasks)`
- **overall** = `round(income×0.35 + clients×0.25 + pipeline×0.25 + operations×0.15)` ← **weights hardcoded by design.**

`revenueGrowthHistory` here is **the only genuinely persisted MoM trajectory**,
fed straight into `revenue-growth`'s `history` (bypasses the evidence vault).

## 5. Brand portfolio (`server/brandPortfolio.ts`)
One `BrandPortfolioRow` per active trading company + a synthetic `"unallocated"`
row. `allocateRevenue` buckets payments → paid invoices → income entries into
current/previous UTC month by company. Per row: revenue (month/prev/growth%/
share%), `mrrCents`, client counts (active/total/churned/needingAttention), lead
counts, meetings, product/staff counts, `evidence[]`. `_BrandPortfolioInstrument.tsx`
draws a donut; when finance is unconnected it honestly switches to a
**footprint** ring (`activeClients + leadCount + productCount`), *not* claiming
revenue share.

## 6. KPI trajectory — how trend over time works (two mechanisms)
**(A) Radar Evidence Vault** (`lib/server/radarEvidenceVault.ts`) — the durable
time-series. `recordRadarEvidence` persists a point for every check where
`scope==="kpi" && lens==="threshold"` with a finite value, into
`state.radarEvidence[agencyId].series["{domain}:{familyId}"]`. Points bucket to
**5-minute** slots (cap 288 ≈ 24h) + **hourly** rollups (cap 720 ≈ 30d).
`assess()` needs ≥12 points **and** ≥30-day span for a baseline; computes median
baseline, `changePercent`, and a robust deviation `0.6745×|current−baseline|/MAD`
→ `anomalyStatus`.

**(B) How a KPI gets `history`** — `hydrateCommandEvidence` rebuilds each series'
`recentPoints` from the vault; `makeKpi` sets `history = recentPoints.slice(-24)`.
**Exception:** `revenue-growth` passes explicit monthly `revenueGrowthHistory`.

**(C) Rendering** — `_CommandCentreKpiTrajectory.tsx` / `_DayKpiIntelligencePanel.tsx`
take `history.slice(-24)`; if <2 points they **synthesize a two-point line**
`[previousValue ?? baseline ?? value, value]`. Each series is **min-max
normalized to 0–100** for the SVG — the chart shows *direction*, not absolute
units (stated in-UI). Only the 5 `COMMAND_PRIMARY_KPI_STATIONS` plot here.

**(D) Forecast math** (`_CommandIntelligenceWorkspace.tsx` `resolveKpiPlan:560`):
`expectedValue = baseline + (target−baseline)×elapsed`; `forecastValue` = linear
extrapolation from trend points; comparison modes raw/indexed/percent-change over
range windows. The `BusinessCompass` radar indexes KPIs by **status points**
(healthy 100 / warning 60 / learning 40 / critical 20 / blind 0) — labelled
in-code as "a navigation index, not a measured business percentage".

## 7. Founder home KPI strip (`_FounderDashboardKpis.tsx`)
Separate client-side strip (not in the Command snapshot). Five tiles: Active
clients, Open work, Deposits received, Client contact/7d (fetched live from
`/api/portal/leads-pipeline/leads`), Clients not contacted. If the leads plugin
is missing it renders **"—" + "Connect sales activity to see"** — never a
fabricated number.

## 8. Genuinely computed vs hardcoded vs visual index
- **Computed from persisted state:** all 20 KPIs, all 40 formulas, lifecycle, brand portfolio, company health, `revenueGrowthHistory`, vault trajectories. Missing data → null/Learning/blind/—.
- **Hardcoded constants (by design):** health weights `.35/.25/.25/.15`; all guardrail thresholds (20%/80%, ROAS 3×, 5-min SLA, 14-day stale, `MINIMUM_SOURCE_SAMPLE=3`, vault 288/720/12-pts/30-day); the `0.2` recent-leads divisor.
- **Visual index / approximation (self-labelled in code):** `BusinessCompass` status-points; the normalized 0–100 sparklines; `locationPoint()` — a hardcoded place-name→(x,y) map for the audience map (`mapped:false` when unmatched); decorative radar-blip positions.
- **Attribution-dependent (correct but "Learning" until inputs exist):** campaign-roas, marketing economics, formulas 5/24/25/26/40.

## 9. KPI Registry + explorer (Phase 1 — 2026-08-19)
- **Registry** (`lib/kpiRegistry.ts` client-safe + `lib/server/kpiRegistry.ts` server twin): a `KpiDescriptor` is a **pure projection** of a built `CommandKpi`. `describeCommandKpis(snapshot)` maps the 20 command KPIs, lifting `measurement.unit`/`formula`, `plan.target`/`baseline`/`direction`, `format`, `status` and `history` **verbatim — no recompute**. `searchKpiDescriptors`/`groupKpiDescriptorsByCategory` back the explorer's instrument search. The server twin `buildKpiRegistry({agencyId,radar,evidence})` builds the snapshot then describes it — the seam later phases register the 40 commercial formulas + radar **evidence series** into (reading the vault directly for deeper history than the 24-point KPI `history`).
- **Explorer** — the plan's "KPI explorer" already existed as `KpiComparisonWorkspace` (§6D, `_CommandIntelligenceWorkspace.tsx:353`): search/multi-select, 24h–12m ranges, raw/indexed/%-change **and** a `plan` mode (`resolveKpiPlan` pace/target/forecast), saved views, editable target overrides. Phase 1 **repurposed** it (Ed's call, over building a parallel `_KpiExplorer`): the instrument selector is now fed by `describeCommandKpis`, and `ComparisonChart` gained **line/area/bar** switching (non-plan modes). `_CommandCentreKpiTrajectory` gained an **"Explore all KPIs"** entry.
- **Phase 3a (2026-08-19)** — the 40 commercial formulas (`describeCommercialFormulas`) are now registered and **plot in the same explorer**. The whole comparison pipeline (`comparisonPoints`/`resolveKpiPlan`/`ComparisonChart`/`ComparisonStatistic`/`PlanningAssumptions`) was migrated from `CommandKpi` to `KpiDescriptor.series` — command-KPI output is identical by construction (the descriptor lifts the same fields). Commercial formulas carry no trend, so they plot as a single honest point and plan-mode shows "no numeric plan". `onInspect` is contained so the battle table (which also consumes `KpiComparisonWorkspace`) is untouched.
- **Phase 3b (2026-08-19)** — **all ~1,500 radar evidence series** are registrable via `describeEvidenceSeries` (`kind:"evidence"`, id namespaced `evidence:…`). They carry the vault's real `recentPoints`, so they plot a genuine trend. Because an agency can retain 1,000+, they are served **lazily** by `buildEvidenceDescriptors` behind **`GET /api/portal/kpi-registry/evidence`** and pulled into the explorer's instrument bank on demand ("＋ Add radar evidence series"); the picker render is capped at 200 with a "+N more" note. **Phase 3 complete.**
- **Phase 4 (2026-08-19)** — **server-persisted, layered, versioned targets.** Additive `agencySettings.kpiTargets` (`KpiTargetsConfig`: `byKpi` + optional `byCompany`); pure `resolveKpiTarget` layers agency → company (most specific wins) and `applyKpiTargetOverride` stamps `effectiveFrom` + versions the prior value into `history` (both in `lib/kpiRegistry`); store in `lib/server/kpiTargets.ts`; `GET/POST /api/portal/kpi-registry/targets`. The explorer's planning-assumptions now load from the server on mount and POST set/clear (additive over the old localStorage layer), so a set target survives across browsers/users. **Phase 4 complete.**
- **Phase 5A (2026-08-19)** — **suggested targets from history.** `suggestKpiTarget` = a rolling median baseline nudged by a growth band in the favoured direction (higher +10% / lower −10%); a "Suggest" (✨) button in the planning panel applies it (guess-then-confirm), honest "Learning" under 3 points. Consumes the series only. **P5B (adaptive baseline *in the evidence vault*) is a radar-engine edit — NOT done; needs commander coordination + serialising vs Aqua-Tag tag→Radar.**
- **Phase 6 (2026-08-19)** — **guided custom KPIs.** `CustomKpiDefinition` (numerator + optional denominator + op `ratio|rate|sum|diff`) in `PortalState.customKpis`; pure `computeCustomKpi`/`describeCustomKpis` combine registry series (honest null on zero-denominator/missing operand); store `lib/server/customKpis.ts` + `GET/POST/DELETE /api/portal/kpi-registry/custom`; a builder form in the explorer merges custom KPIs into the pickable bank.
- **Phase 7 (2026-08-19)** — **customer-intelligence scope + dimensions.** `lib/customerProfileScope.ts` (`scopeProfiles` one-business↔ecosystem, group-wide always shown; `summariseProfileDimension` by segment/priority/status/confidence/location/company, honest labels) drives a scope selector + a "breakdown by …" panel in `_CustomerProfilesWorkspace`. Real geo deferred (schematic fallback untouched). **🎉 Overhaul complete — all 7 phases shipped.**
- **Phase 5B (2026-08-19)** — **rolling/learned baseline in the vault.** `evidenceSeriesSummary` computes a rolling baseline (median of the recent `slice(-12)` window, `undefined` under 3 points) that evolves/ratchets with growth, exposed additively on `RadarEvidenceSeriesSummary.rollingBaseline`; `describeEvidenceSeries` surfaces it as the evidence-KPI adaptive baseline. **The anomaly path (`assess`/`deviationScore`/checks) is deliberately untouched** — radar behaviour unchanged (all radar tests green); no engine-file edit. **🎉 The KPI Intelligence overhaul is complete.**
- **Shared saved views (2026-08-20)** — saved comparison views are now **private AND shared** (Ed's decision; only private had shipped). Private stays browser-local (`aqua:kpi-comparison-views:v1`); the shared half persists in `agencySettings.kpiSavedViews` (`SharedKpiComparisonView` in `server/types.ts`) via `lib/server/kpi/kpiSavedViews.ts` — the same agency-scoped settings pattern as `kpiTargets` — behind `GET/POST/DELETE /api/portal/kpi-registry/views`. The view-save control gained the smallest honest toggle ("Only me · this browser" / "Shared · whole agency"); shared rows render first with a Shared chip and a case-insensitive same-name save replaces, matching the browser half. Plan overrides are deliberately not part of a shared view (already server-shared via kpiTargets). Tests: `scripts/smoke-kpi-shared-views.test.ts`.
- **The `?? 0` trap is closed (2026-08-20)** — `commandIntelligenceService.ts` no longer collapses unmeasured Radar readings into confident zeros behind a separate flag. `traffic7d`/`forms7d` are `number | null` (`measuredCheckValue`), and the types now carry measuredness end to end: `CommandDemandFlow.pageviews/forms`, `CommercialIntelligenceSnapshot.lineage.pageviews/forms` and `BuildCommercialIntelligenceInput.pageviews/forms` are all `number | null` — a consumer **cannot** read a fabricated zero (issue #15's proper fix; the boolean flags remain as derived display conveniences). Displays already handled the honest case; formulas over an unmeasured operand stay `learning`.
- Honesty unchanged: still `null`/"Learning" without evidence; the chart still refuses to fabricate missing history; raw mode still warns when overlaying mixed units.

## 10. Consumers of the registry (read-only — they must never edit it)
- **Marketing pulse** (2026-08-19) — `lib/server/marketingIntelligence.ts` `shapeMarketingPulse()` filters `describeCommandKpis(snapshot)` to `category === "marketing"` (the 9 marketing-domain KPIs) and adds only presentation maths: a **direction-aware** deviation vs target (signed so `+` always means good news, whichever way is good) and an `onTrack` flag. Values, displays, formulas, targets and series are passed through verbatim, so `/portal/agency/marketing?view=pulse` can never disagree with the Command Centre about the same number. Same module surfaces the `commercialIntelligence.lineage` funnel. Plan: [marketing-workspace-overhaul](../development/plans/marketing-workspace-overhaul.md).

_See also the [Radar dossier](radar.md) (the evidence vault + checks that feed these) and [hazards](hazards-and-duplication.md) (the intelligence-builder overlap)._
