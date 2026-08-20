# `src/built-ins/modules/website-editor/src/server/embedAllow.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** R013 — Per-client embed allow-list registry.  Each client picks which origins may embed them in an iframe. The foundation middleware reads this list and emits the matching `Content-Security-Policy: frame-ancestors …` header on every `/embed/[clientSlug]/[variant]` response (Q-FOLLOWUP for T1).  Storage: `t/<agencyId>/<clientId>/website-editor/embed-allow`.

## Exports (4)

- `interface EmbedAllowList (3 members)`
- `isValidOrigin(s: string): boolean`
- `async getEmbedAllowList(storage: PluginStorage, agencyId: string, clientId: string): Promise<EmbedAllowList | null>`
- `async setEmbedAllowList(storage: PluginStorage, agencyId: string, clientId: string, origins: string[], updatedBy: string): Promise<EmbedAllowList>`

## Depends on (1)

- [`src/built-ins/modules/website-editor/src/lib/aquaPluginTypes.ts`](../lib/aquaPluginTypes.md)

## Used by (3)

- [`src/built-ins/modules/website-editor/src/__smoke__/r013-iframe-embed-surface.test.ts`](../__smoke__/r013-iframe-embed-surface.test.md)
- [`src/built-ins/modules/website-editor/src/api/handlers/embedAllow.ts`](../api/handlers/embedAllow.md)
- [`src/lib/server/embedAllowResolver.ts`](../../../../../lib/server/embedAllowResolver.md)

