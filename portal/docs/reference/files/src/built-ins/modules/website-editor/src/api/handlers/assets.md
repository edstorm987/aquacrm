# `src/built-ins/modules/website-editor/src/api/handlers/assets.ts`

← [File index](../../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** Assets — Round 003 implementation. Replaces R1's 501 stubs.  Storage layout (per agency × client tenant via ctx.storage): assets/index           → string[] of asset ids (most-recent first) assets/by-id/<id>      → PortalAsset record  dataUrl is persisted inline (data:image/...;base64,...). Operators bring CDN-hosted URLs for large media; this path is for the cover imagery the editor toolbar uploads inline. Cap: 8 MiB per file + 64 MiB per client. Final CDN-backed pipeline lands when T1 ships the storage adapter — drop-in replacement for the inline dataUrl.

## Exports (8)

- `interface PortalAsset (13 members)`
- `PER_FILE_CAP_BYTES`
- `PER_CLIENT_CAP_BYTES`
- `decodeDataUrlSize(dataUrl: string): number`
- `async handleListAssets(req: Request, ctx: PluginCtx): Promise<Response>`
- `async handleUploadAsset(req: Request, ctx: PluginCtx): Promise<Response>`
- `async handleBulkTagAssets(req: Request, ctx: PluginCtx): Promise<Response>`
- `async handleDeleteAsset(req: Request, ctx: PluginCtx): Promise<Response>`

## Depends on (4)

- [`src/built-ins/modules/website-editor/src/api/helpers.ts`](../helpers.md)
- [`src/built-ins/modules/website-editor/src/lib/aquaPluginTypes.ts`](../../lib/aquaPluginTypes.md)
- [`src/built-ins/modules/website-editor/src/lib/assetTags.ts`](../../lib/assetTags.md)
- [`src/built-ins/modules/website-editor/src/lib/ids.ts`](../../lib/ids.md)

## Used by (3)

- [`src/built-ins/modules/website-editor/src/__smoke__/r024-asset-manager.test.ts`](../../__smoke__/r024-asset-manager.test.md)
- [`src/built-ins/modules/website-editor/src/__smoke__/video-and-preview.test.ts`](../../__smoke__/video-and-preview.test.md)
- [`src/built-ins/modules/website-editor/src/api/routes.ts`](../routes.md)

