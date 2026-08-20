# `src/server/clientMilestones.ts`

← [File index](../../../files-index.md) · Area: State layer — src/server/

_No file-level doc-comment. Purpose inferred from its path (State layer — src/server/) and its exports below._

## Exports (6)

- `interface ClientMilestoneInput (9 members)`
- `listClientMilestones(agencyId: string, clientId?: string): ClientMilestone[]`
- `createClientMilestone(agencyId: string, clientId: string, input: ClientMilestoneInput, actorUserId: string): ClientMilestone`
- `updateClientMilestone(agencyId: string, clientId: string, id: string, input: Partial<ClientMilestoneInput>, actorUserId: string): ClientMilestone | null`
- `syncClientPerformanceMilestones(agencyId: string, clientId: string): void`
- `deleteClientMilestone(agencyId: string, clientId: string, id: string): boolean`

## Depends on (7)

- [`src/lib/clients/clientTelemetry.ts`](../lib/clients/clientTelemetry.md)
- [`src/lib/performance/performanceAnalytics.ts`](../lib/performance/performanceAnalytics.md)
- [`src/lib/server/clients/clientRecordLedger.ts`](../lib/server/clients/clientRecordLedger.md)
- [`src/server/activity.ts`](./activity.md)
- [`src/server/storage.ts`](./storage.md)
- [`src/server/tenants.ts`](./tenants.md)
- [`src/server/types.ts`](./types.md)

## Used by (10)

- [`src/app/api/tenants/client-milestones/route.ts`](../app/api/tenants/client-milestones/route.md)
- [`src/app/portal/agency/fulfilment/page.tsx`](../app/portal/agency/fulfilment/page.md)
- [`src/app/portal/agency/performance/page.tsx`](../app/portal/agency/performance/page.md)
- [`src/app/portal/clients/[clientId]/page.tsx`](../app/portal/clients/[clientId]/page.md)
- [`src/app/portal/customer/_CustomerPortalViews.tsx`](../app/portal/customer/_CustomerPortalViews.md)
- [`src/lib/server/auth/showcaseMode.ts`](../lib/server/auth/showcaseMode.md)
- [`src/lib/server/brandPortfolioService.ts`](../lib/server/brandPortfolioService.md)
- [`src/lib/server/clients/clientTelemetryService.ts`](../lib/server/clients/clientTelemetryService.md)
- [`src/lib/server/kpi/companyHealthSnapshot.ts`](../lib/server/kpi/companyHealthSnapshot.md)
- [`src/lib/server/radar/clientRadarService.ts`](../lib/server/radar/clientRadarService.md)

