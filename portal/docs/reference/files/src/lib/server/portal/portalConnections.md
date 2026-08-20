# `src/lib/server/portal/portalConnections.ts`

← [File index](../../../../../files-index.md) · Area: Shared logic — src/lib/

_No file-level doc-comment. Purpose inferred from its path (Shared logic — src/lib/) and its exports below._

## Exports (14)

- `type PortalConnectionStatus`
- `interface PortalConnection (16 members)`
- `PENDING_CONNECTION_TTL_MS`
- `newConnectionId(): string`
- `connectionUrl(origin: string, connectionId: string): string`
- `connectionLinkOrigin(requestOrigin?: string): string`
- `createPortalConnection(input: { agencyId: string; clientId: string; label: string; createdBy: string; now?: number; }): PortalConnection`
- `type ConnectionRefusal`
- `type ConnectionAttempt`
- `canCompleteConnection(input: { connection: PortalConnection | undefined; viewerClientId: string | undefined; viewerUserId: string; now?: number; }): ConnectionAttempt`
- `completeConnection(connection: PortalConnection, input: { userId: string; origin?: string; now?: number }): PortalConnection`
- `resetPortalConnection(connection: PortalConnection, input: { by: string; now?: number }): { withdrawn: PortalConnection; replacement: PortalConnection }`
- `revokePortalConnection(connection: PortalConnection, input: { by: string; now?: number }): PortalConnection`
- `refusalMessage(reason: ConnectionRefusal): string`

## Depends on (1)

- [`src/lib/server/connectionConfirmation.ts`](../connectionConfirmation.md)

## Used by (10)

- [`scripts/smoke-portal-connections.test.ts`](../../../../scripts/smoke-portal-connections.test.md)
- [`src/app/api/portal/connections/accept/route.ts`](../../../app/api/portal/connections/accept/route.md)
- [`src/app/api/portal/connections/request-code/route.ts`](../../../app/api/portal/connections/request-code/route.md)
- [`src/app/api/portal/connections/route.ts`](../../../app/api/portal/connections/route.md)
- [`src/app/api/portal/website-sources/route.ts`](../../../app/api/portal/website-sources/route.md)
- [`src/app/connect/[connectionId]/page.tsx`](../../../app/connect/[connectionId]/page.md)
- [`src/app/portal/agency/fulfilment/page.tsx`](../../../app/portal/agency/fulfilment/page.md)
- [`src/app/portal/clients/[clientId]/page.tsx`](../../../app/portal/clients/[clientId]/page.md)
- [`src/app/portal/dev-team/api/_Section.tsx`](../../../app/portal/dev-team/api/_Section.md)
- [`src/server/portalConnectionStore.ts`](../../../server/portalConnectionStore.md)

