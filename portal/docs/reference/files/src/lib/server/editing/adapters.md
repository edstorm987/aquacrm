# `src/lib/server/editing/adapters.ts`

← [File index](../../../../../files-index.md) · Area: Shared logic — src/lib/

_No file-level doc-comment. Purpose inferred from its path (Shared logic — src/lib/) and its exports below._

## Exports (4)

- `fingerprint(value: unknown): string`
- `portalFormEditAdapter(input: { agencyId: string; entity: PortalFormEntity; actorUserId: string; }): EditAdapter`
- `agencyWebsiteEditAdapter(input: { agencyId: string; actorUserId: string; }): EditAdapter`
- `clientPortalEditAdapter(input: { agencyId: string; clientId: string; /** * Accepted for parity with the other adapters. `updateClient` does not take * an actor, so attribution for portal copy lives in the activity log the * caller writes r…`

## Depends on (5)

- [`src/lib/editing/engine.ts`](../../editing/engine.md)
- [`src/server/agencyWebsite.ts`](../../../server/agencyWebsite.md)
- [`src/server/portalEditor.ts`](../../../server/portalEditor.md)
- [`src/server/tenants.ts`](../../../server/tenants.md)
- [`src/server/types.ts`](../../../server/types.md)

## Used by (1)

- [`src/lib/server/editing/appConfigAdapter.ts`](./appConfigAdapter.md)

