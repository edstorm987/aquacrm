# `src/lib/performance/kpiRegistry.ts`

← [File index](../../../files-index.md) · Area: Shared logic — src/lib/

_No file-level doc-comment. Purpose inferred from its path (Shared logic — src/lib/) and its exports below._

## Exports (18)

- `type KpiSeriesPoint`
- `type KpiKind`
- `interface KpiDescriptor (23 members)`
- `describeCommandKpi(kpi: CommandKpi): KpiDescriptor`
- `describeCommandKpis(snapshot: CommandIntelligenceSnapshot): KpiDescriptor[]`
- `describeCommercialFormula(metric: CommercialFormulaMetric, measuredAt: number): KpiDescriptor`
- `describeCommercialFormulas(snapshot: CommandIntelligenceSnapshot): KpiDescriptor[]`
- `resolveKpiTarget(config: KpiTargetsConfig | undefined, kpiId: string, companyId?: string): KpiTargetOverride | undefined`
- `applyKpiTargetOverride(config: KpiTargetsConfig | undefined, kpiId: string, patch: { baselineValue?: number | null; targetValue?: number | null }, opts: { companyId?: string; actorUserId?: string; now: number }): KpiTargetsConfig`
- `clearKpiTargetOverride(config: KpiTargetsConfig | undefined, kpiId: string, opts: { companyId?: string; now: number }): KpiTargetsConfig`
- `interface KpiTargetSuggestion (5 members)`
- `suggestKpiTarget(descriptor: Pick<KpiDescriptor, "series" | "direction">, growthPercent = 10): KpiTargetSuggestion | null`
- `computeCustomKpi(definition: CustomKpiDefinition, byId: Map<string, KpiDescriptor>): KpiDescriptor | null`
- `describeCustomKpis(definitions: CustomKpiDefinition[], base: KpiDescriptor[]): KpiDescriptor[]`
- `describeEvidenceSeries(summary: RadarEvidenceSeriesSummary): KpiDescriptor`
- `searchKpiDescriptors(descriptors: KpiDescriptor[], query: string): KpiDescriptor[]`
- `interface KpiDescriptorGroup (2 members)`
- `groupKpiDescriptorsByCategory(descriptors: KpiDescriptor[]): KpiDescriptorGroup[]`

## Depends on (3)

- [`src/lib/radar/businessRadar.ts`](./businessRadar.md)
- [`src/lib/intelligence/commandIntelligence.ts`](./commandIntelligence.md)
- [`src/server/types.ts`](../server/types.md)

## Used by (6)

- [`scripts/smoke-kpi-registry.test.ts`](../../scripts/smoke-kpi-registry.test.md)
- [`scripts/smoke-kpi-targets.test.ts`](../../scripts/smoke-kpi-targets.test.md)
- [`src/app/portal/agency/_CommandIntelligenceWorkspace.tsx`](../app/portal/agency/_CommandIntelligenceWorkspace.md)
- [`src/lib/server/kpi/kpiRegistryService.ts`](./server/kpiRegistry.md)
- [`src/lib/server/kpi/kpiTargets.ts`](./server/kpiTargets.md)
- [`src/lib/server/marketingIntelligence.ts`](./server/marketingIntelligence.md)

