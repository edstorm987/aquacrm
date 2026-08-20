# `src/built-ins/modules/website-editor/src/lib/savePipeline.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

_No file-level doc-comment. Purpose inferred from its path (Plugins — src/built-ins/) and its exports below._

## Exports (13)

- `interface PipelineSaveResult (5 members)`
- `interface SavePageInput (2 members)`
- `interface SaveThemeInput (2 members)`
- `interface SaveCustomPageInput (1 members)`
- `interface SetActivePortalVariantInput (2 members)`
- `async savePage(input: SavePageInput): Promise<PipelineSaveResult>`
- `async publishPage(input: BaseInput & { pageId: string }): Promise<PipelineSaveResult>`
- `async saveTheme(input: SaveThemeInput): Promise<PipelineSaveResult>`
- `async saveCustomPage(input: SaveCustomPageInput): Promise<PipelineSaveResult>`
- `async setActivePortalVariant(input: SetActivePortalVariantInput): Promise<PipelineSaveResult>`
- `interface PreviewChangesInput (4 members)`
- `interface PreviewChangesResult (4 members)`
- `async previewChanges(input: PreviewChangesInput): Promise<PreviewChangesResult>`

## Depends on (8)

- [`src/built-ins/modules/website-editor/src/lib/customPages.ts`](./customPages.md)
- [`src/built-ins/modules/website-editor/src/lib/editorPages.ts`](./editorPages.md)
- [`src/built-ins/modules/website-editor/src/lib/portalRole.ts`](./portalRole.md)
- [`src/built-ins/modules/website-editor/src/lib/saveTarget.ts`](./saveTarget.md)
- [`src/built-ins/modules/website-editor/src/lib/theme.ts`](./theme.md)
- [`src/built-ins/modules/website-editor/src/server/extensionPorts.ts`](../server/extensionPorts.md)
- [`src/built-ins/modules/website-editor/src/types/editorPage.ts`](../types/editorPage.md)
- [`src/built-ins/modules/website-editor/src/types/theme.ts`](../types/theme.md)

## Used by (3)

- [`src/built-ins/modules/website-editor/src/__smoke__/save-target.test.ts`](../__smoke__/save-target.test.md)
- [`src/built-ins/modules/website-editor/src/components/editor/DiffPreviewPane.tsx`](../components/editor/DiffPreviewPane.md)
- [`src/built-ins/modules/website-editor/src/components/editor/SaveResultBanner.tsx`](../components/editor/SaveResultBanner.md)

