# `src/lib/server/customerPortalProvisioning.ts`

← [File index](../../../../files-index.md) · Area: Shared logic — src/lib/

_No file-level doc-comment. Purpose inferred from its path (Shared logic — src/lib/) and its exports below._

## Exports (2)

- `customerPortalProvisioningMetadata(input: { clientName: string; contactName?: string; email?: string; servicePlan?: string; welcomeNote?: string; now?: number; })`
- `clientDeliveryPackageMetadata(input: { clientName: string; servicePlan?: string; products?: unknown; productKeys?: unknown; projectValue?: string; billingCadence?: string; existingProperties?: unknown; now?: number; })`

## Depends on (2)

- [`src/lib/portalProducts.ts`](../portalProducts.md)
- [`src/lib/server/clientTelemetry.ts`](./clientTelemetry.md)

## Used by (2)

- [`src/app/api/portal/fulfillment/clients/route.ts`](../../app/api/portal/fulfillment/clients/route.md)
- [`src/built-ins/modules/leads-pipeline/src/api/handlers.ts`](../../built-ins/modules/leads-pipeline/src/api/handlers.md)

