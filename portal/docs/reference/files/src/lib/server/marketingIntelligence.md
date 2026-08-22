# `src/lib/server/marketingIntelligence.ts`

← [File index](../../../../files-index.md) · Area: Shared logic — src/lib/

_No file-level doc-comment. Purpose inferred from its path (Shared logic — src/lib/) and its exports below._

## Exports (32)

- `MARKETING_MEASURE_IDS`
- `type MarketingMeasureId`
- `type MarketingMeasureStatus`
- `interface MarketingMeasure (12 members)`
- `interface MarketingTagCoverage (7 members)`
- `interface MarketingEnquiryInput (7 members)`
- `interface MarketingEnquiryGroup (6 members)`
- `interface MarketingEnquiryFeed (13 members)`
- `interface MarketingSpineHealth (9 members)`
- `interface MarketingDataSpine (12 members)`
- `interface MarketingEnquiryScope (2 members)`
- `shapeMarketingEnquiries(allEnquiries: readonly MarketingEnquiryInput[] | null | undefined, now = Date.now(), scope: MarketingEnquiryScope | null = null): MarketingEnquiryFeed`
- `interface ShapeMarketingSpineInput (9 members)`
- `shapeMarketingSpine(input: ShapeMarketingSpineInput): MarketingDataSpine`
- `emptyMarketingSpine(generatedAt = Date.now()): MarketingDataSpine`
- `interface MarketingDataSpineOptions (3 members)`
- `async marketingDataSpine(agencyId: string, options: MarketingDataSpineOptions = {}): Promise<MarketingDataSpine>`
- `interface MarketingPulseMetric (21 members)`
- `shapeMarketingPulse(descriptors: readonly KpiDescriptor[]): MarketingPulseMetric[]`
- `interface MarketingFunnelStage (8 members)`
- `interface MarketingFunnelInput (9 members)`
- `shapeMarketingFunnel(lineage: MarketingFunnelInput, opts: { trafficMeasured?: boolean; formsMeasured?: boolean } = {}): MarketingFunnelStage[]`
- `interface MarketingCommandModel (6 members)`
- `async marketingCommandModel(agencyId: string, options: MarketingDataSpineOptions = {}): Promise<MarketingCommandModel>`
- `interface MarketingCampaignRecord (3 members)`
- `interface MarketingCampaignAttribution (9 members)`
- `interface MarketingAttributionGap (4 members)`
- `interface MarketingCampaignAttributionResult (4 members)`
- `attributeEnquiriesToCampaigns(campaigns: readonly MarketingCampaignRecord[], feed: MarketingEnquiryFeed): MarketingCampaignAttributionResult`
- `interface MarketingSourceConnection (8 members)`
- `interface MarketingSourceInput (5 members)`
- `shapeMarketingSources(inputs: readonly MarketingSourceInput[]): MarketingSourceConnection[]`

## Depends on (9)

- [`src/engines/data/radar/businessRadar.ts`](../../engines/data/radar/businessRadar.md)
- [`src/engines/data/server/radar/businessIssueRadar.ts`](../../engines/data/server/radar/businessIssueRadar.md)
- [`src/engines/data/server/radar/radarEvidenceVault.ts`](../../engines/data/server/radar/radarEvidenceVault.md)
- [`src/lib/intelligence/commandIntelligence.ts`](../intelligence/commandIntelligence.md)
- [`src/lib/performance/kpiRegistry.ts`](../performance/kpiRegistry.md)
- [`src/lib/server/commandIntelligenceService.ts`](./commandIntelligenceService.md)
- [`src/lib/server/integrations/integrationConnections.ts`](./integrations/integrationConnections.md)
- [`src/server/websiteInjections.ts`](../../server/websiteInjections.md)
- [`src/server/websiteSources.ts`](../../server/websiteSources.md)

## Used by (3)

- [`scripts/verify-marketing-runtime.ts`](../../../scripts/verify-marketing-runtime.md)
- [`src/app/portal/agency/marketing/_MarketingCommandSurfaces.tsx`](../../app/portal/agency/marketing/_MarketingCommandSurfaces.md)
- [`src/app/portal/agency/marketing/page.tsx`](../../app/portal/agency/marketing/page.md)

