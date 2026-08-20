# `src/built-ins/modules/website-editor/src/lib/assetTags.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** R024 — Auto-tag heuristic for uploaded assets.  Pure function — derives a list of tags from filename + mimeType. Operator-supplied tags merge on top (their tags win on dedup).  Heuristic order: 1. mimeType family → "image" / "video" / "audio" / "doc" 2. filename keyword scan → "logo" / "hero" / "product" / "team" / etc. 3. extension → "png" / "jpg" / "svg" / etc. (lowercase)

## Exports (3)

- `interface AutoTagInput (3 members)`
- `deriveAutoTags(input: AutoTagInput): string[]`
- `mergeTags(autoTags: string[], operatorTags: string[] | undefined): string[]`

## Used by (2)

- [`src/built-ins/modules/website-editor/src/__smoke__/r024-asset-manager.test.ts`](../__smoke__/r024-asset-manager.test.md)
- [`src/built-ins/modules/website-editor/src/api/handlers/assets.ts`](../api/handlers/assets.md)

