# `src/built-ins/modules/website-editor/src/server/pageVersions.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** R022 — Persisted page version history.  Auto-save snapshots accumulate (capped at 30 most-recent unnamed). Named checkpoints survive auto-prune. Storage shape: `t/<a>/<c>/website-editor/page-versions/<pageId>/index` → ordered list of version ids (newest-first) `t/<a>/<c>/website-editor/page-versions/<pageId>/<versionId>` → PageVersion record  Pure server module — pluggable via the standard `PluginStorage` port (no foundation imports).

## Exports (8)

- `interface PageVersion (6 members)`
- `AUTO_VERSION_CAP`
- `interface SaveVersionInput (6 members)`
- `async saveVersion(storage: PluginStorage, input: SaveVersionInput): Promise<{ version: PageVersion; pruned: string[] }>`
- `async listVersions(storage: PluginStorage, agencyId: AgencyId, clientId: ClientId, pageId: string, limit?: number): Promise<PageVersion[]>`
- `async getVersion(storage: PluginStorage, agencyId: AgencyId, clientId: ClientId, pageId: string, versionId: string): Promise<PageVersion | null>`
- `async deleteVersion(storage: PluginStorage, agencyId: AgencyId, clientId: ClientId, pageId: string, versionId: string): Promise<boolean>`
- `async renameVersion(storage: PluginStorage, agencyId: AgencyId, clientId: ClientId, pageId: string, versionId: string, label: string): Promise<PageVersion | null>`

## Depends on (3)

- [`src/built-ins/modules/website-editor/src/lib/aquaPluginTypes.ts`](../lib/aquaPluginTypes.md)
- [`src/built-ins/modules/website-editor/src/lib/tenancy.ts`](../lib/tenancy.md)
- [`src/built-ins/modules/website-editor/src/types/block.ts`](../types/block.md)

## Used by (2)

- [`src/built-ins/modules/website-editor/src/__smoke__/r022-version-history.test.ts`](../__smoke__/r022-version-history.test.md)
- [`src/built-ins/modules/website-editor/src/api/handlers/pageVersions.ts`](../api/handlers/pageVersions.md)

