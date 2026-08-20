# `src/server/clientPortalSetup.ts`

← [File index](../../../files-index.md) · Area: State layer — src/server/

_No file-level doc-comment. Purpose inferred from its path (State layer — src/server/) and its exports below._

## Exports (3)

- `interface ClientPortalSetupMetadata (5 members)`
- `type ClientPortalSetupResult`
- `async setupClientStarterPortal(input: { agencyId: string; clientId: string; actor?: string; metadata?: ClientPortalSetupMetadata; ensureWebsiteEditor?: boolean; }): Promise<ClientPortalSetupResult>`

## Depends on (5)

- [`src/lib/products/productAssignments.ts`](../lib/products/productAssignments.md)
- [`src/server/agencyProducts.ts`](./agencyProducts.md)
- [`src/server/clientPortalDesigns.ts`](./clientPortalDesigns.md)
- [`src/server/productWorkspaces.ts`](./productWorkspaces.md)
- [`src/server/tenants.ts`](./tenants.md)

## Used by (2)

- [`src/app/api/portal/fulfillment/clients/route.ts`](../app/api/portal/fulfillment/clients/route.md)
- [`src/built-ins/modules/leads-pipeline/src/api/handlers.ts`](../built-ins/modules/leads-pipeline/src/api/handlers.md)

