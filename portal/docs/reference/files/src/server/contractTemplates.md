# `src/server/contractTemplates.ts`

← [File index](../../../files-index.md) · Area: State layer — src/server/

_No file-level doc-comment. Purpose inferred from its path (State layer — src/server/) and its exports below._

## Exports (4)

- `listContractTemplates(agencyId: string, includeArchived = false): ClientContractTemplate[]`
- `createContractTemplate(agencyId: string, input: { title: unknown; summary?: unknown; body: unknown }, actorUserId: string): ClientContractTemplate`
- `updateContractTemplate(agencyId: string, id: string, input: { title?: unknown; summary?: unknown; body?: unknown; status?: unknown }, actorUserId: string): ClientContractTemplate | null`
- `deleteContractTemplate(agencyId: string, id: string, actorUserId: string): boolean`

## Depends on (3)

- [`src/lib/clientContracts.ts`](../lib/clientContracts.md)
- [`src/server/activity.ts`](./activity.md)
- [`src/server/storage.ts`](./storage.md)

## Used by (4)

- [`src/app/api/portal/contracts/templates/route.ts`](../app/api/portal/contracts/templates/route.md)
- [`src/app/portal/clients/[clientId]/page.tsx`](../app/portal/clients/[clientId]/page.md)
- [`src/app/portal/clients/page.tsx`](../app/portal/clients/page.md)
- [`src/server/people.ts`](./people.md)

