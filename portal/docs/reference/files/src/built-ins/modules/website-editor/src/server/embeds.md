# `src/built-ins/modules/website-editor/src/server/embeds.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** Embed registry — chatbots / calendars / forms etc that operators can drop into pages. Adapted from `02/src/portal/server/embeds.ts`.

## Exports (6)

- `interface Embed (6 members)`
- `interface EmbedsState (4 members)`
- `async getEmbeds(storage: PluginStorage, agencyId: AgencyId, clientId: ClientId, siteId: string): Promise<Embed[]>`
- `async setEmbeds(storage: PluginStorage, agencyId: AgencyId, clientId: ClientId, siteId: string, embeds: Embed[]): Promise<void>`
- `async getEmbed(storage: PluginStorage, agencyId: AgencyId, clientId: ClientId, siteId: string, embedId: string): Promise<Embed | null>`
- `async getPublicEmbeds(storage: PluginStorage, agencyId: AgencyId, clientId: ClientId, siteId: string): Promise<Embed[]>`

## Depends on (3)

- [`src/built-ins/modules/website-editor/src/lib/aquaPluginTypes.ts`](../lib/aquaPluginTypes.md)
- [`src/built-ins/modules/website-editor/src/lib/tenancy.ts`](../lib/tenancy.md)
- [`src/built-ins/modules/website-editor/src/server/storage-keys.ts`](./storage-keys.md)

## Used by (2)

- [`src/built-ins/modules/website-editor/src/api/handlers/embeds.ts`](../api/handlers/embeds.md)
- [`src/built-ins/modules/website-editor/src/server/index.ts`](./index.md)

