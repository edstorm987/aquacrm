# `src/built-ins/modules/website-editor/src/lib/customPages.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

_No file-level doc-comment. Purpose inferred from its path (Plugins — src/built-ins/) and its exports below._

## Exports (37)

- `type CustomPageBlockType`
- `interface BlockHero (5 members)`
- `interface BlockRichText (2 members)`
- `interface BlockImage (4 members)`
- `interface BlockGallery (2 members)`
- `interface BlockQuote (3 members)`
- `interface BlockEmbed (3 members)`
- `interface BlockDivider (1 members)`
- `interface BlockCta (5 members)`
- `interface BlockHtml (2 members)`
- `type CustomPageBlock`
- `type CustomPageStatus`
- `interface CustomPageSeo (6 members)`
- `interface CustomPage (11 members)`
- `listCustomPages(): CustomPage[]`
- `listPublishedNavPages(): CustomPage[]`
- `getCustomPage(id: string): CustomPage | null`
- `getCustomPageBySlug(slug: string): CustomPage | null`
- `loadCustomPages`
- `createCustomPage(title = "Untitled page"): CustomPage`
- `saveCustomPage(page: CustomPage): void`
- `updateCustomPage(id: string, patch: Partial<CustomPage>): void`
- `deleteCustomPage(id: string): void`
- `duplicateCustomPage(id: string): CustomPage | null`
- `addCustomBlock(pageId: string, type: CustomPageBlockType): CustomPageBlock | null`
- `updateCustomBlock(pageId: string, blockId: string, patch: Partial<CustomPageBlock>): void`
- `deleteCustomBlock(pageId: string, blockId: string): void`
- `moveCustomBlock(pageId: string, blockId: string, dir: -1 | 1): void`
- `publishCustomPage(id: string): void`
- `unpublishCustomPage(id: string): void`
- `toggleCustomPageHidden(id: string): void`
- `getPublishedCustomPage(slug: string): CustomPage | null`
- `onCustomPagesChange(handler: () => void): () => void`
- `interface CustomPageType (3 members)`
- `CUSTOM_PAGE_TYPES: CustomPageType[]`
- `getCustomPageType(id: string): CustomPageType | undefined`
- `isCustomPage(_page: EditorPage): boolean`

## Depends on (1)

- [`src/built-ins/modules/website-editor/src/types/editorPage.ts`](../types/editorPage.md)

## Used by (3)

- [`src/built-ins/modules/website-editor/src/lib/savePipeline.ts`](./savePipeline.md)
- [`src/built-ins/modules/website-editor/src/pages/PageDetailPage.tsx`](../pages/PageDetailPage.md)
- [`src/built-ins/modules/website-editor/src/server/extensionPorts.ts`](../server/extensionPorts.md)

