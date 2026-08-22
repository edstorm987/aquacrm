# `src/lib/clients/clientAquaHealth.ts`

← [File index](../../../../files-index.md) · Area: Shared logic — src/lib/

_No file-level doc-comment. Purpose inferred from its path (Shared logic — src/lib/) and its exports below._

## Exports (10)

- `type AquaHealthState`
- `interface AquaHealthInvoiceEvidence (5 members)`
- `interface AquaHealthRequestEvidence (5 members)`
- `interface AquaHealthFactor (7 members)`
- `interface ClientAquaHealth (5 members)`
- `interface ClientAquaHealthInput (8 members)`
- `calculateClientAquaHealth(input: ClientAquaHealthInput): ClientAquaHealth`
- `type ClientTelemetryRiskKind`
- `interface ClientTelemetryRiskSignal (4 members)`
- `clientTelemetryRiskSignals(events: ClientTelemetryEvent[] | undefined, now = Date.now()): ClientTelemetryRiskSignal[]`

## Depends on (3)

- [`src/lib/clients/clientContracts.ts`](./clientContracts.md)
- [`src/lib/clients/clientTelemetry.ts`](./clientTelemetry.md)
- [`src/lib/shared/formatDateTime.ts`](../shared/formatDateTime.md)

## Used by (10)

- [`scripts/client-aqua-health.test.ts`](../../../scripts/client-aqua-health.test.md)
- [`scripts/smoke-client-radar.test.ts`](../../../scripts/smoke-client-radar.test.md)
- [`src/app/portal/clients/[clientId]/_ClientSpineOverview.tsx`](../../app/portal/clients/[clientId]/_ClientSpineOverview.md)
- [`src/app/portal/clients/[clientId]/_ClientWorkspaceHeader.tsx`](../../app/portal/clients/[clientId]/_ClientWorkspaceHeader.md)
- [`src/app/portal/clients/[clientId]/page.tsx`](../../app/portal/clients/[clientId]/page.md)
- [`src/app/portal/clients/_JourneyCommercialWorkspace.tsx`](../../app/portal/clients/_JourneyCommercialWorkspace.md)
- [`src/app/portal/clients/page.tsx`](../../app/portal/clients/page.md)
- [`src/engines/data/radar/clientRadar.ts`](../../engines/data/radar/clientRadar.md)
- [`src/engines/data/server/radar/clientRadarService.ts`](../../engines/data/server/radar/clientRadarService.md)
- [`src/lib/server/inbox/operationalAlerts.ts`](../server/inbox/operationalAlerts.md)

