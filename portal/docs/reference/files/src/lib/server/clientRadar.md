# `src/lib/server/clientRadar.ts`

← [File index](../../../../files-index.md) · Area: Shared logic — src/lib/

_No file-level doc-comment. Purpose inferred from its path (Shared logic — src/lib/) and its exports below._

## Exports (2)

- `async buildClientRadarFleet(agencyId: string, options: ClientRadarFleetOptions = {}): Promise<ClientRadarSnapshot[]>`
- `async buildClientRadar(agencyId: string, clientId: string, options: Omit<ClientRadarFleetOptions, "clients"> = {}): Promise<ClientRadarSnapshot | null>`

## Depends on (22)

- [`src/built-ins/modules/agency-finance/src/server/index.ts`](../../built-ins/modules/agency-finance/src/server/index.md)
- [`src/lib/businessRadar.ts`](../businessRadar.md)
- [`src/lib/clientAquaHealth.ts`](../clientAquaHealth.md)
- [`src/lib/clientContracts.ts`](../clientContracts.md)
- [`src/lib/clientMarketingService.ts`](../clientMarketingService.md)
- [`src/lib/clientPaymentPlans.ts`](../clientPaymentPlans.md)
- [`src/lib/clientRadar.ts`](../clientRadar.md)
- [`src/lib/clientRequests.ts`](../clientRequests.md)
- [`src/lib/clientServiceWorkspace.ts`](../clientServiceWorkspace.md)
- [`src/lib/clientTelemetry.ts`](../clientTelemetry.md)
- [`src/lib/portalProductWorkspaces.ts`](../portalProductWorkspaces.md)
- [`src/lib/productAssignments.ts`](../productAssignments.md)
- [`src/lib/server/operationalAlerts.ts`](./operationalAlerts.md)
- [`src/lib/server/pluginStorage.ts`](./pluginStorage.md)
- [`src/lib/server/radarTelemetry.ts`](./radarTelemetry.md)
- [`src/server/agencyProducts.ts`](../../server/agencyProducts.md)
- [`src/server/clientMilestones.ts`](../../server/clientMilestones.md)
- [`src/server/pluginInstalls.ts`](../../server/pluginInstalls.md)
- [`src/server/productWorkspaces.ts`](../../server/productWorkspaces.md)
- [`src/server/storage.ts`](../../server/storage.md)
- [`src/server/tenants.ts`](../../server/tenants.md)
- [`src/server/types.ts`](../../server/types.md)

## Used by (5)

- [`src/app/api/portal/clients/[clientId]/radar/route.ts`](../../app/api/portal/clients/[clientId]/radar/route.md)
- [`src/app/portal/clients/[clientId]/page.tsx`](../../app/portal/clients/[clientId]/page.md)
- [`src/components/chrome/ClientRadarQuickLookControl.tsx`](../../components/chrome/ClientRadarQuickLookControl.md)
- [`src/lib/server/businessIssueRadar.ts`](./businessIssueRadar.md)
- [`src/lib/server/clientAttention.ts`](./clientAttention.md)

