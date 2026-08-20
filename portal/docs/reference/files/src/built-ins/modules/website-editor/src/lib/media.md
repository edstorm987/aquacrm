# `src/built-ins/modules/website-editor/src/lib/media.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

_No file-level doc-comment. Purpose inferred from its path (Plugins — src/built-ins/) and its exports below._

## Exports (9)

- `interface PortalAsset (13 members)`
- `interface AssetsResponse (4 members)`
- `async loadAssets(force = false): Promise<AssetsResponse>`
- `listAssets(): PortalAsset[]`
- `async uploadAsset(file: File, opts?: { alt?: string; uploadedBy?: string }): Promise<PortalAsset | { error: string }>`
- `async deleteAsset(id: string): Promise<boolean>`
- `async patchAsset(id: string, patch: { alt?: string; filename?: string }): Promise<PortalAsset | null>`
- `onAssetsChange(cb: () => void): () => void`
- `formatBytes(n: number): string`

## Depends on (1)

- [`src/built-ins/modules/website-editor/src/lib/tenancy.ts`](./tenancy.md)

## Used by (2)

- [`src/built-ins/modules/website-editor/src/components/AssetPicker.tsx`](../components/AssetPicker.md)
- [`src/built-ins/modules/website-editor/src/pages/AssetsPage.tsx`](../pages/AssetsPage.md)

