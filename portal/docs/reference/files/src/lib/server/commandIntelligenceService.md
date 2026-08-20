# `src/lib/server/commandIntelligenceService.ts`

← [File index](../../../../files-index.md) · Area: Shared logic — src/lib/

_No file-level doc-comment. Purpose inferred from its path (Shared logic — src/lib/) and its exports below._

## Exports (1)

- `async buildCommandIntelligenceSnapshot({ agencyId, radar, evidence, now = Date.now(), brandPortfolio: suppliedBrandPortfolio, }: CommandIntelligenceInput): Promise<CommandIntelligenceSnapshot>`

## Depends on (18)

- [`src/built-ins/modules/agency-marketing/src/lib/domain.ts`](../../built-ins/modules/agency-marketing/src/lib/domain.md)
- [`src/built-ins/modules/leads-pipeline/src/lib/domain.ts`](../../built-ins/modules/leads-pipeline/src/lib/domain.md)
- [`src/built-ins/runtime/foundation-adapters/leadsPipelineFoundation.ts`](../../built-ins/runtime/foundation-adapters/leadsPipelineFoundation.md)
- [`src/lib/brands/brandPortfolio.ts`](../brands/brandPortfolio.md)
- [`src/lib/clients/clientWorkspace.ts`](../clients/clientWorkspace.md)
- [`src/lib/intelligence/commandIntelligence.ts`](../intelligence/commandIntelligence.md)
- [`src/lib/intelligence/commercialIntelligence.ts`](../intelligence/commercialIntelligence.md)
- [`src/lib/radar/businessRadar.ts`](../radar/businessRadar.md)
- [`src/lib/server/brandPortfolioService.ts`](./brandPortfolioService.md)
- [`src/lib/server/kpi/companyHealthSnapshot.ts`](./kpi/companyHealthSnapshot.md)
- [`src/lib/server/pluginStorage.ts`](./pluginStorage.md)
- [`src/lib/server/radar/radarEvidenceVault.ts`](./radar/radarEvidenceVault.md)
- [`src/lib/server/radar/radarTelemetry.ts`](./radar/radarTelemetry.md)
- [`src/server/pipelines.ts`](../../server/pipelines.md)
- [`src/server/pluginInstalls.ts`](../../server/pluginInstalls.md)
- [`src/server/storage.ts`](../../server/storage.md)
- [`src/server/tenants.ts`](../../server/tenants.md)
- [`src/server/types.ts`](../../server/types.md)

## Used by (4)

- [`src/app/api/portal/search/route.ts`](../../app/api/portal/search/route.md)
- [`src/app/portal/agency/page.tsx`](../../app/portal/agency/page.md)
- [`src/lib/server/kpi/kpiRegistryService.ts`](./kpi/kpiRegistryService.md)
- [`src/lib/server/marketingIntelligence.ts`](./marketingIntelligence.md)

