# `src/server/clientDelight.ts`

← [File index](../../../files-index.md) · Area: State layer — src/server/

_No file-level doc-comment. Purpose inferred from its path (State layer — src/server/) and its exports below._

## Exports (5)

- `interface ClientDelightInput (23 members)`
- `listClientDelight(agencyId: string): ClientDelightRecord[]`
- `createClientDelight(agencyId: string, input: ClientDelightInput, actorUserId: string): ClientDelightRecord`
- `updateClientDelight(agencyId: string, id: string, input: Partial<ClientDelightInput>, actorUserId: string): ClientDelightRecord | null`
- `deleteClientDelight(agencyId: string, id: string): boolean`

## Depends on (5)

- [`src/server/activity.ts`](./activity.md)
- [`src/server/experiencePackages.ts`](./experiencePackages.md)
- [`src/server/storage.ts`](./storage.md)
- [`src/server/tenants.ts`](./tenants.md)
- [`src/server/types.ts`](./types.md)

## Used by (4)

- [`scripts/smoke-experience-commerce.test.ts`](../../scripts/smoke-experience-commerce.test.md)
- [`src/app/api/portal/fulfillment/clients/route.ts`](../app/api/portal/fulfillment/clients/route.md)
- [`src/app/api/tenants/client-delight/route.ts`](../app/api/tenants/client-delight/route.md)
- [`src/app/portal/agency/you-deserve-it/page.tsx`](../app/portal/agency/you-deserve-it/page.md)

