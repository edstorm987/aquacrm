# `src/app/portal/agency/commandPerformance.ts`

← [File index](../../../../../files-index.md) · Area: App routes & UI — src/app/

**What it is:** Command Centre performance mode — on-demand radar/intelligence.  Ed flagged the Command Centre as slow. Even under Performance mode the page used to eagerly `await` the two heaviest builds on every navigation: `getCachedBusinessIssueRadar` (a full business-issue sweep on a cold 30s cache) and `buildCommandIntelligenceSnapshot` (which itself rebuilds company health, brand portfolio, marketing intelligence and 20 KPIs). This module is the switch: under Performance mode we skip those two builds, hand the client lightweight *paused* placeholders, and let a one-shot `?scan=1` render (the "Run scan" control) do the full build on demand.  Default is OFF. With Performance mode off the caller keeps its original code path unchanged — `shouldRunHeavyPanels` returns `true`, so the eager build runs exactly as before.

## Exports (4)

- `shouldRunHeavyPanels(perfMode: boolean, scanRequested: boolean): boolean`
- `normalizeScanFlag(value: string | string[] | undefined): boolean`
- `buildPausedBusinessRadar(policy: RadarPolicyConfiguration, now: number): BusinessIssueRadar`
- `buildPausedIntelligenceSnapshot(currency: string, now: number): CommandIntelligenceSnapshot`

## Depends on (5)

- [`src/engines/data/radar/businessRadar.ts`](../../../engines/data/radar/businessRadar.md)
- [`src/lib/intelligence/commandIntelligence.ts`](../../../lib/intelligence/commandIntelligence.md)
- [`src/lib/intelligence/commercialIntelligence.ts`](../../../lib/intelligence/commercialIntelligence.md)
- [`src/lib/intelligence/commercialLifecycle.ts`](../../../lib/intelligence/commercialLifecycle.md)
- [`src/server/types.ts`](../../../server/types.md)

## Used by (2)

- [`scripts/smoke-command-center-perf.test.ts`](../../../../scripts/smoke-command-center-perf.test.md)
- [`src/app/portal/agency/page.tsx`](./page.md)

