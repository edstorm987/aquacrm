# `src/engines/data/server/radar/radarSourceInspection.ts`

← [File index](../../../../../../files-index.md) · Area: Other

_No file-level doc-comment. Purpose inferred from its path (Other) and its exports below._

## Exports (6)

- `interface RadarSourceSearchDataset (1 members)`
- `async inspectRadarSourceData(agencyId: string): Promise<RadarSourceDataIndex>`
- `async listRadarSourceSearchDatasets(agencyId: string): Promise<RadarSourceSearchDataset[]>`
- `async inspectRadarSourceDataset(agencyId: string, datasetId: string, offset = 0, limit = 100): Promise<RadarSourceDatasetInspection | null>`
- `async exportRadarSourceData(agencyId: string, datasetId?: string): Promise<unknown>`
- `invalidateRadarSourceInspection(agencyId: string): void`

## Depends on (12)

- [`src/built-ins/runtime/foundation-adapters/leadsPipelineFoundation.ts`](../../../../built-ins/runtime/foundation-adapters/leadsPipelineFoundation.md)
- [`src/engines/data/radar/businessRadar.ts`](../../radar/businessRadar.md)
- [`src/lib/server/inbox/inboxStore.ts`](../../../../lib/server/inbox/inboxStore.md)
- [`src/lib/server/pluginStorage.ts`](../../../../lib/server/pluginStorage.md)
- [`src/lib/server/seeds/founderSeed.ts`](../../../../lib/server/seeds/founderSeed.md)
- [`src/lib/server/websiteEnquiries.ts`](../../../../lib/server/websiteEnquiries.md)
- [`src/server/commandCalendar.ts`](../../../../server/commandCalendar.md)
- [`src/server/legalDocuments.ts`](../../../../server/legalDocuments.md)
- [`src/server/storage.ts`](../../../../server/storage.md)
- [`src/server/tasks.ts`](../../../../server/tasks.md)
- [`src/server/tenants.ts`](../../../../server/tenants.md)
- [`src/server/users.ts`](../../../../server/users.md)

## Used by (4)

- [`src/app/api/portal/advisor/radar/sources/route.ts`](../../../../app/api/portal/advisor/radar/sources/route.md)
- [`src/app/api/portal/calendar/route.ts`](../../../../app/api/portal/calendar/route.md)
- [`src/app/api/portal/calendar/sync/route.ts`](../../../../app/api/portal/calendar/sync/route.md)
- [`src/app/api/portal/search/route.ts`](../../../../app/api/portal/search/route.md)

