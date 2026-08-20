# `src/built-ins/modules/website-editor/src/server/redirects.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** R025 — Redirect registry. Per-site/variant slug aliases with 301 semantics. Capped at 100 entries per registry; oldest pruned on overflow. Loop-detection prevents `from === to` or chains that would re-redirect to themselves.  Storage: t/<a>/<c>/website-editor/redirects/<siteId>  → RedirectEntry[]  The storefront route handler reads the list and emits a 301 when the requested slug matches a `from`. The editor's slug- rename + page-delete actions append entries.

## Exports (8)

- `interface RedirectEntry (4 members)`
- `REDIRECTS_CAP`
- `async listRedirects(storage: PluginStorage, agencyId: AgencyId, clientId: ClientId, siteId: string): Promise<RedirectEntry[]>`
- `interface AddRedirectInput (6 members)`
- `class RedirectLoopError`
    - `constructor(public readonly from: string, public readonly to: string)`
- `async addRedirect(storage: PluginStorage, input: AddRedirectInput): Promise<{ entry: RedirectEntry; pruned: number; rewroteChain: number }>`
- `async removeRedirect(storage: PluginStorage, agencyId: AgencyId, clientId: ClientId, siteId: string, from: string): Promise<boolean>`
- `resolveRedirect(entries: RedirectEntry[], requestedSlug: string): string | null`

## Depends on (2)

- [`src/built-ins/modules/website-editor/src/lib/aquaPluginTypes.ts`](../lib/aquaPluginTypes.md)
- [`src/built-ins/modules/website-editor/src/lib/tenancy.ts`](../lib/tenancy.md)

## Used by (2)

- [`src/built-ins/modules/website-editor/src/__smoke__/r025-redirects.test.ts`](../__smoke__/r025-redirects.test.md)
- [`src/built-ins/modules/website-editor/src/api/handlers/redirects.ts`](../api/handlers/redirects.md)

