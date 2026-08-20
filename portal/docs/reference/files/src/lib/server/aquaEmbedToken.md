# `src/lib/server/aquaEmbedToken.ts`

← [File index](../../../../files-index.md) · Area: Shared logic — src/lib/

_No file-level doc-comment. Purpose inferred from its path (Shared logic — src/lib/) and its exports below._

## Exports (6)

- `type AquaEmbedMode`
- `interface AquaEmbedPayload (9 members)`
- `expectedEmbedApiToken()`
- `matchesEmbedApiToken(candidate: string)`
- `createAquaEmbedToken(input: { clientId: string; mode?: AquaEmbedMode; email?: string; name?: string; origin?: string; ttlSeconds?: number; now?: number; })`
- `verifyAquaEmbedToken(token: string, now = Math.floor(Date.now() / 1000)): AquaEmbedPayload | null`

## Used by (4)

- [`scripts/smoke-aqua-embed.test.ts`](../../../scripts/smoke-aqua-embed.test.md)
- [`src/app/api/v1/embed/consume/route.ts`](../../app/api/v1/embed/consume/route.md)
- [`src/app/api/v1/embed/sessions/route.ts`](../../app/api/v1/embed/sessions/route.md)
- [`src/app/embed/account/page.tsx`](../../app/embed/account/page.md)

