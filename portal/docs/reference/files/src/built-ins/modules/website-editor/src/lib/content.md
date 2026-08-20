# `src/built-ins/modules/website-editor/src/lib/content.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** Client-side content overrides. Adapted from `02/src/lib/admin/content.ts`.

## Exports (7)

- `async getContent(siteId: string, mode: "preview" | "public" = "public"): Promise<Record<string, ContentValue>>`
- `async setDraft(siteId: string, values: Record<string, ContentValue>): Promise<SiteContentState>`
- `async publish(siteId: string, reason?: string): Promise<SiteContentState>`
- `async discard(siteId: string): Promise<SiteContentState>`
- `async revert(siteId: string, snapshotId: string): Promise<SiteContentState>`
- `async recordDiscovery(siteId: string, path: string, keys: string[]): Promise<void>`
- `async getState(siteId: string): Promise<SiteContentState>`

## Depends on (1)

- [`src/built-ins/modules/website-editor/src/types/content.ts`](../types/content.md)

## Used by

_No internal importers found (an entry point — route/page/test/script — or dynamically loaded)._

