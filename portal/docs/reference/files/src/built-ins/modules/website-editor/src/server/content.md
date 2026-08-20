# `src/built-ins/modules/website-editor/src/server/content.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** Content overrides — draft/publish workflow for legacy CMS keys. Adapted from `02/src/portal/server/content.ts` (244 lines), trimmed to the round-1 surface.

## Exports (8)

- `async getContentState(storage: PluginStorage, agencyId: AgencyId, clientId: ClientId, siteId: string): Promise<SiteContentState>`
- `async getPublicOverrides(storage: PluginStorage, agencyId: AgencyId, clientId: ClientId, siteId: string): Promise<Record<string, ContentValue>>`
- `async getPreviewOverrides(storage: PluginStorage, agencyId: AgencyId, clientId: ClientId, siteId: string): Promise<Record<string, ContentValue>>`
- `async setDraftOverrides(storage: PluginStorage, agencyId: AgencyId, clientId: ClientId, siteId: string, inputs: Record<string, ContentValue>): Promise<SiteContentState>`
- `async publishDraft(storage: PluginStorage, agencyId: AgencyId, clientId: ClientId, siteId: string, opts: { actor?: string; reason?: string } = {}): Promise<SiteContentState>`
- `async discardDraft(storage: PluginStorage, agencyId: AgencyId, clientId: ClientId, siteId: string): Promise<SiteContentState>`
- `async revertToSnapshot(storage: PluginStorage, agencyId: AgencyId, clientId: ClientId, siteId: string, snapshotId: string, opts: { actor?: string } = {}): Promise<SiteContentState | null>`
- `async recordDiscovered(storage: PluginStorage, agencyId: AgencyId, clientId: ClientId, siteId: string, path: string, keys: string[]): Promise<void>`

## Depends on (5)

- [`src/built-ins/modules/website-editor/src/lib/aquaPluginTypes.ts`](../lib/aquaPluginTypes.md)
- [`src/built-ins/modules/website-editor/src/lib/ids.ts`](../lib/ids.md)
- [`src/built-ins/modules/website-editor/src/lib/tenancy.ts`](../lib/tenancy.md)
- [`src/built-ins/modules/website-editor/src/server/storage-keys.ts`](./storage-keys.md)
- [`src/built-ins/modules/website-editor/src/types/content.ts`](../types/content.md)

## Used by (2)

- [`src/built-ins/modules/website-editor/src/api/handlers/content.ts`](../api/handlers/content.md)
- [`src/built-ins/modules/website-editor/src/server/index.ts`](./index.md)

