# `src/server/portalConnectionStore.ts`

← [File index](../../../files-index.md) · Area: State layer — src/server/

_No file-level doc-comment. Purpose inferred from its path (State layer — src/server/) and its exports below._

## Exports (14)

- `interface PortalConnectionView (3 members)`
- `describePortalConnection(connection: PortalConnection, origin: string): PortalConnectionView`
- `listPortalConnections(agencyId: string, clientId?: string): PortalConnection[]`
- `getPortalConnection(id: string): PortalConnection | undefined`
- `openPortalConnection(input: { agencyId: string; clientId: string; label: string; createdBy: string; }): PortalConnection`
- `acceptPortalConnection(input: { connectionId: string; viewerClientId: string | undefined; viewerUserId: string; origin?: string; }): ConnectionAttempt`
- `issuePortalConnectionCode(input: { connectionId: string; viewerClientId: string | undefined; viewerUserId: string; now?: number; }): { ok: true; code: string; expiresAt: number } | { ok: false; reason: ConnectionRefusal }`
- `recordPortalConnectionCodeAttempt(connectionId: string): number`
- `listOwnPortalConnections(input: { clientId: string; userId: string; }): PortalConnection[]`
- `withdrawOwnPortalConnection(input: { connectionId: string; viewerClientId: string | undefined; viewerUserId: string; }): PortalConnection | null`
- `withdrawPortalConnection(input: { agencyId: string; connectionId: string; by: string; }): PortalConnection | null`
- `resetPortalConnectionLink(input: { agencyId: string; connectionId: string; by: string; }): { withdrawn: PortalConnection; replacement: PortalConnection } | null`
- `deletePortalConnection(input: { agencyId: string; connectionId: string; }): PortalConnection | null`
- `markPortalConnectionSeen(connectionId: string, now = Date.now()): void`

## Depends on (4)

- [`src/lib/server/connectionConfirmation.ts`](../lib/server/connectionConfirmation.md)
- [`src/lib/server/portalConnections.ts`](../lib/server/portalConnections.md)
- [`src/server/storage.ts`](./storage.md)
- [`src/server/users.ts`](./users.md)

## Used by (8)

- [`src/app/api/portal/connections/accept/route.ts`](../app/api/portal/connections/accept/route.md)
- [`src/app/api/portal/connections/request-code/route.ts`](../app/api/portal/connections/request-code/route.md)
- [`src/app/api/portal/connections/route.ts`](../app/api/portal/connections/route.md)
- [`src/app/api/portal/customer/connections/route.ts`](../app/api/portal/customer/connections/route.md)
- [`src/app/connect/[connectionId]/page.tsx`](../app/connect/[connectionId]/page.md)
- [`src/app/portal/clients/[clientId]/_ClientPortalConnections.tsx`](../app/portal/clients/[clientId]/_ClientPortalConnections.md)
- [`src/app/portal/clients/[clientId]/page.tsx`](../app/portal/clients/[clientId]/page.md)
- [`src/app/portal/customer/account/page.tsx`](../app/portal/customer/account/page.md)

