# `src/server/clientRelationships.ts`

← [File index](../../../files-index.md) · Area: State layer — src/server/

_No file-level doc-comment. Purpose inferred from its path (State layer — src/server/) and its exports below._

## Exports (8)

- `interface CreateLinkedClientWorkspaceInput (8 members)`
- `clientRelationshipId(client: Client): string`
- `listClientRelationshipWorkspaces(agencyId: string, clientId: string, options: { includeArchived?: boolean } = {}): Client[]`
- `createLinkedClientWorkspace(agencyId: string, input: CreateLinkedClientWorkspaceInput): Client`
- `linkClientWorkspaces(agencyId: string, sourceClientId: string, targetClientId: string): Client[]`
- `unlinkClientWorkspace(agencyId: string, clientId: string, remainingClientId?: string): Client | null`
- `clientPortalAccessEmail(client: Client): string`
- `listAccessibleClientPortals(agencyId: string, clientId: string, email: string): Client[]`

## Depends on (2)

- [`src/server/tenants.ts`](./tenants.md)
- [`src/server/types.ts`](./types.md)

## Used by (8)

- [`src/app/api/portal/customer/workspace/route.ts`](../app/api/portal/customer/workspace/route.md)
- [`src/app/api/portal/search/route.ts`](../app/api/portal/search/route.md)
- [`src/app/api/tenants/client-record-ledger/route.ts`](../app/api/tenants/client-record-ledger/route.md)
- [`src/app/api/tenants/client-workspaces/route.ts`](../app/api/tenants/client-workspaces/route.md)
- [`src/app/portal/agency/fulfilment/page.tsx`](../app/portal/agency/fulfilment/page.md)
- [`src/app/portal/clients/[clientId]/page.tsx`](../app/portal/clients/[clientId]/page.md)
- [`src/app/portal/clients/page.tsx`](../app/portal/clients/page.md)
- [`src/app/portal/customer/layout.tsx`](../app/portal/customer/layout.md)

