# `src/lib/server/radar/clientRadarService.ts`

← [File index](../../../../../files-index.md) · Area: Shared logic — src/lib/

_No file-level doc-comment. Purpose inferred from its path (Shared logic — src/lib/) and its exports below._

## Exports (2)

- `async buildClientRadarFleet(agencyId: string, options: ClientRadarFleetOptions = {}): Promise<ClientRadarSnapshot[]>`
- `async buildClientRadar(agencyId: string, clientId: string, options: Omit<ClientRadarFleetOptions, "clients"> = {}): Promise<ClientRadarSnapshot | null>`

## Depends on (22)

- [`src/built-ins/modules/agency-finance/src/server/index.ts`](../../../built-ins/modules/agency-finance/src/server/index.md)
- [`src/lib/clients/clientAquaHealth.ts`](../../clients/clientAquaHealth.md)
- [`src/lib/clients/clientContracts.ts`](../../clients/clientContracts.md)
- [`src/lib/clients/clientMarketingService.ts`](../../clients/clientMarketingService.md)
- [`src/lib/clients/clientPaymentPlans.ts`](../../clients/clientPaymentPlans.md)
- [`src/lib/clients/clientRequests.ts`](../../clients/clientRequests.md)
- [`src/lib/clients/clientServiceWorkspace.ts`](../../clients/clientServiceWorkspace.md)
- [`src/lib/clients/clientTelemetry.ts`](../../clients/clientTelemetry.md)
- [`src/lib/portal/portalProductWorkspaces.ts`](../../portal/portalProductWorkspaces.md)
- [`src/lib/products/productAssignments.ts`](../../products/productAssignments.md)
- [`src/lib/radar/businessRadar.ts`](../../radar/businessRadar.md)
- [`src/lib/radar/clientRadar.ts`](../../radar/clientRadar.md)
- [`src/lib/server/inbox/operationalAlerts.ts`](../inbox/operationalAlerts.md)
- [`src/lib/server/pluginStorage.ts`](../pluginStorage.md)
- [`src/lib/server/radar/radarTelemetry.ts`](./radarTelemetry.md)
- [`src/server/agencyProducts.ts`](../../../server/agencyProducts.md)
- [`src/server/clientMilestones.ts`](../../../server/clientMilestones.md)
- [`src/server/pluginInstalls.ts`](../../../server/pluginInstalls.md)
- [`src/server/productWorkspaces.ts`](../../../server/productWorkspaces.md)
- [`src/server/storage.ts`](../../../server/storage.md)
- [`src/server/tenants.ts`](../../../server/tenants.md)
- [`src/server/types.ts`](../../../server/types.md)

## Used by (5)

- [`src/app/api/portal/clients/[clientId]/radar/route.ts`](../../../app/api/portal/clients/[clientId]/radar/route.md)
- [`src/app/portal/clients/[clientId]/page.tsx`](../../../app/portal/clients/[clientId]/page.md)
- [`src/components/chrome/ClientRadarQuickLookControl.tsx`](../../../components/chrome/ClientRadarQuickLookControl.md)
- [`src/lib/server/clients/clientAttention.ts`](../clients/clientAttention.md)
- [`src/lib/server/radar/businessIssueRadar.ts`](./businessIssueRadar.md)

