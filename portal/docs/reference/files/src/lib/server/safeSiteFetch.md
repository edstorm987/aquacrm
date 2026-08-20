# `src/lib/server/safeSiteFetch.ts`

← [File index](../../../../files-index.md) · Area: Shared logic — src/lib/

_No file-level doc-comment. Purpose inferred from its path (Shared logic — src/lib/) and its exports below._

## Exports (6)

- `type SafeFetchFailureKind`
- `class SafeFetchError`
    - `constructor(kind: SafeFetchFailureKind, message: string)`
- `interface SafeSiteHtml (7 members)`
- `interface SafeFetchOptions (3 members)`
- `normalizeSiteUrl(value: string): URL`
- `async fetchPublicSiteHtml(value: string, options: SafeFetchOptions = {}): Promise<SafeSiteHtml>`

## Depends on (1)

- [`src/lib/radar/radarSyntheticSafety.ts`](../radar/radarSyntheticSafety.md)

## Used by (2)

- [`src/lib/server/integrations/aquaTagDetection.ts`](./integrations/aquaTagDetection.md)
- [`src/server/websiteFormSchemas.ts`](../../server/websiteFormSchemas.md)

