# `src/lib/server/clients/clientTelemetryService.ts`

← [File index](../../../../files-index.md) · Area: Shared logic — src/lib/

_No file-level doc-comment. Purpose inferred from its path (Shared logic — src/lib/) and its exports below._

## Exports (5)

- `newTelemetrySiteKey(): string`
- `ensureClientTelemetry(agencyId: string, clientId: string): ClientTelemetrySnapshot | null`
- `resetClientTelemetryKey(agencyId: string, clientId: string): ClientTelemetrySnapshot | null`
- `clearClientTelemetry(agencyId: string, clientId: string): ClientTelemetrySnapshot | null`
- `recordClientTelemetry(siteKey: string, input: Record<string, unknown>, userAgent?: string): { status: "recorded"; clientId: string; event: ClientTelemetryEvent } | { status: "rate-limited" } | null`

## Depends on (5)

- [`src/lib/clients/clientTelemetry.ts`](../clientTelemetry.md)
- [`src/server/activity.ts`](../../server/activity.md)
- [`src/server/clientMilestones.ts`](../../server/clientMilestones.md)
- [`src/server/storage.ts`](../../server/storage.md)
- [`src/server/tenants.ts`](../../server/tenants.md)

## Used by (4)

- [`src/app/api/telemetry/collect/route.ts`](../../app/api/telemetry/collect/route.md)
- [`src/app/api/tenants/client-telemetry/route.ts`](../../app/api/tenants/client-telemetry/route.md)
- [`src/lib/server/clients/customerPortalProvisioning.ts`](./customerPortalProvisioning.md)
- [`src/server/websiteSources.ts`](../../server/websiteSources.md)

