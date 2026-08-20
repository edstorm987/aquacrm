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

- [`src/lib/clientTelemetry.ts`](../lib/clientTelemetry.md)
- [`src/lib/performanceAnalytics.ts`](../lib/performanceAnalytics.md)
- [`src/lib/server/clientRecordLedger.ts`](../lib/server/clientRecordLedger.md)
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
- [`src/lib/server/brandPortfolio.ts`](../lib/server/brandPortfolio.md)
- [`src/lib/server/clientRadar.ts`](../lib/server/clientRadar.md)
- [`src/lib/server/clientTelemetry.ts`](../lib/server/clientTelemetry.md)
- [`src/lib/server/companyHealthSnapshot.ts`](../lib/server/companyHealthSnapshot.md)
- [`src/lib/server/showcaseMode.ts`](../lib/server/showcaseMode.md)

