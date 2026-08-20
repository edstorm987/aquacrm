# `src/app/portal/agency/_CommandIntelligenceWorkspace.tsx`

← [File index](../../../../../files-index.md) · Area: App routes & UI — src/app/

_No file-level doc-comment. Purpose inferred from its path (App routes & UI — src/app/) and its exports below._

## Exports (5)

- `type IntelligenceView`
- `CommandIntelligenceWorkspace({ snapshot, initialView = "overview", initialKpiIds = [], initialScopeId = "ecosystem", initialCommercialFocus }: { snapshot: CommandIntelligenceSnapshot; initialView?: IntelligenceView; initialKpiIds?: string[…`
- `applyIntelligenceScope(snapshot: CommandIntelligenceSnapshot, scope: CommandIntelligenceScope): CommandIntelligenceSnapshot`
- `type ComparisonRange`
- `KpiComparisonWorkspace({ snapshot, initialKpiIds = [], initialRange = "30d", context = "operational", onInspect }: { snapshot: CommandIntelligenceSnapshot; initialKpiIds?: string[]; initialRange?: ComparisonRange; context?: "operational" |…`

## Depends on (5)

- [`src/app/portal/agency/_CommercialIntelligenceWorkspace.tsx`](./_CommercialIntelligenceWorkspace.md)
- [`src/lib/commandIntelligence.ts`](../../../lib/commandIntelligence.md)
- [`src/lib/formatDateTime.ts`](../../../lib/formatDateTime.md)
- [`src/lib/kpiRegistry.ts`](../../../lib/kpiRegistry.md)
- [`src/server/types.ts`](../../../server/types.md)

## Used by (2)

- [`src/app/portal/agency/_BattleTableWorkspace.tsx`](./_BattleTableWorkspace.md)
- [`src/app/portal/agency/_DashboardCommandCenter.tsx`](./_DashboardCommandCenter.md)

