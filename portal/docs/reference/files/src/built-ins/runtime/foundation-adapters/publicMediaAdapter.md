# `src/built-ins/runtime/foundation-adapters/publicMediaAdapter.ts`

← [File index](../../../../../files-index.md) · Area: Plugins — src/built-ins/

_No file-level doc-comment. Purpose inferred from its path (Plugins — src/built-ins/) and its exports below._

## Exports (4)

- `interface DecodedDataUrl (2 members)`
- `parseDataUrl(dataUrl: string): DecodedDataUrl | null`
- `publicMediaKey(input: { agencyId: string; clientId?: string; siteId?: string; contentType: string; bytes: Buffer; }): string`
- `publicMediaAdapter: PublicMediaPort`

## Depends on (2)

- [`src/built-ins/runtime/_types.ts`](../_types.md)
- [`src/lib/server/publicUploadStorage.ts`](../../../lib/server/publicUploadStorage.md)

## Used by (2)

- [`scripts/smoke-public-media-promotion.test.ts`](../../../../scripts/smoke-public-media-promotion.test.md)
- [`src/built-ins/runtime/foundation-adapters/index.ts`](./index.md)

