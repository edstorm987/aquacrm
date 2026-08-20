# `src/lib/server/portal/portalHandoff.ts`

← [File index](../../../../../files-index.md) · Area: Shared logic — src/lib/

_No file-level doc-comment. Purpose inferred from its path (Shared logic — src/lib/) and its exports below._

## Exports (8)

- `interface HandoffClaims (5 members)`
- `safeDestination(value: string | undefined): string | undefined`
- `mintHandoffToken(claims: HandoffClaims, now = Date.now()): string`
- `type HandoffFailure`
- `type HandoffResult`
- `verifyHandoffToken(token: string | undefined, now = Date.now()): HandoffResult`
- `redeemHandoffToken(jti: string, expiresAt: number, now = Date.now()): boolean`
- `clearRedeemedHandoffTokens(): void`

## Used by

_No internal importers found (an entry point — route/page/test/script — or dynamically loaded)._

