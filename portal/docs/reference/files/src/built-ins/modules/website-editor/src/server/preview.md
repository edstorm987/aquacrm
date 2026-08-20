# `src/built-ins/modules/website-editor/src/server/preview.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** Signed preview tokens. An operator can share a preview link to a stakeholder; the stakeholder hits the storefront route with `?preview=<token>` and the renderer shows the draft tree instead of the published one.  Adapted from `02/src/portal/server/preview.ts`. Round-1 ships a minimal HMAC-style signed token using crypto.subtle. Round-2 swaps to JWT or whatever T1 standardises.

## Exports (3)

- `interface PreviewTokenPayload (5 members)`
- `async mintPreviewToken(secret: string, agencyId: string, clientId: string, siteId: string, ttlMs: number = 24 * 60 * 60 * 1000): Promise<string>`
- `async verifyPreviewToken(secret: string, token: string, expected: { agencyId: string; clientId: string; siteId: string }): Promise<{ ok: true; payload: PreviewTokenPayload } | { ok: false; reason: string }>`

## Used by (2)

- [`src/built-ins/modules/website-editor/src/api/handlers/content.ts`](../api/handlers/content.md)
- [`src/built-ins/modules/website-editor/src/server/index.ts`](./index.md)

