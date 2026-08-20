# `src/built-ins/modules/website-editor/src/lib/editorPages.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

_No file-level doc-comment. Purpose inferred from its path (Plugins — src/built-ins/) and its exports below._

## Exports (12)

- `async listPages(siteId: string, force = false): Promise<EditorPage[]>`
- `async getPage(siteId: string, pageId: string): Promise<EditorPage | null>`
- `interface CreatePageInput (8 members)`
- `async createPage(siteId: string, input: CreatePageInput): Promise<EditorPage | null>`
- `interface UpdatePageInput (12 members)`
- `async updatePage(siteId: string, pageId: string, patch: UpdatePageInput | UpdatePagePatch): Promise<EditorPage | null>`
- `async deletePage(siteId: string, pageId: string): Promise<boolean>`
- `async publishPage(siteId: string, pageId: string): Promise<EditorPage | null>`
- `async revertPage(siteId: string, pageId: string): Promise<EditorPage | null>`
- `onPagesChange(cb: (siteId: string) => void): () => void`
- `async listPortalVariants(siteId: string, role: PortalRole): Promise<EditorPage[]>`
- `async setActivePortalVariant(siteId: string, role: PortalRole, pageId: string | null): Promise<EditorPage[]>`

## Depends on (3)

- [`src/built-ins/modules/website-editor/src/lib/portalRole.ts`](./portalRole.md)
- [`src/built-ins/modules/website-editor/src/types/block.ts`](../types/block.md)
- [`src/built-ins/modules/website-editor/src/types/editorPage.ts`](../types/editorPage.md)

## Used by (5)

- [`src/built-ins/modules/website-editor/src/components/editor/EditorBlockStage.tsx`](../components/editor/EditorBlockStage.md)
- [`src/built-ins/modules/website-editor/src/lib/savePipeline.ts`](./savePipeline.md)
- [`src/built-ins/modules/website-editor/src/pages/EditorPage.tsx`](../pages/EditorPage.md)
- [`src/built-ins/modules/website-editor/src/pages/PagesPage.tsx`](../pages/PagesPage.md)
- [`src/built-ins/modules/website-editor/src/pages/PortalsPage.tsx`](../pages/PortalsPage.md)

