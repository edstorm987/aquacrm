# `src/built-ins/modules/website-editor/src/server/embedTheme.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** Embed-specific theme CSS. When a portal is embedded as an iframe in another host page, this CSS makes the embed adopt the host's brand without leaking the rest of the page. Adapted from `02/src/portal/server/embedTheme.ts`.

## Exports (3)

- `interface EmbedThemeState (5 members)`
- `async getEmbedThemeCss(storage: PluginStorage, agencyId: AgencyId, clientId: ClientId, siteId: string): Promise<string>`
- `async updateEmbedTheme(storage: PluginStorage, agencyId: AgencyId, clientId: ClientId, siteId: string, css: string): Promise<EmbedThemeState>`

## Depends on (3)

- [`src/built-ins/modules/website-editor/src/lib/aquaPluginTypes.ts`](../lib/aquaPluginTypes.md)
- [`src/built-ins/modules/website-editor/src/lib/tenancy.ts`](../lib/tenancy.md)
- [`src/built-ins/modules/website-editor/src/server/storage-keys.ts`](./storage-keys.md)

## Used by (2)

- [`src/built-ins/modules/website-editor/src/api/handlers/embeds.ts`](../api/handlers/embeds.md)
- [`src/built-ins/modules/website-editor/src/server/index.ts`](./index.md)

